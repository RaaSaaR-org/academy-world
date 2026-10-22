"""Independent forward kinematics for the robot check (stdlib only; run with python3 -I).

Reads the SOURCE description (URDF, the expanded xacro, or MJCF) with its own parser — nothing is
shared with the JavaScript converter — and prints the pose of each requested link (URDF link or
MJCF body) relative to the robot's root link / root body, for each set of joint values.

stdin (JSON):  {"kind": "urdf" | "mjcf", "file": "...", "root": "<checkout>", "poses": [{joint: value}], "links": [...]}
stdout (JSON): [[16 floats row-major per link] per pose]

MJCF semantics follow MuJoCo: angles in degrees unless <compiler angle="radian">, default classes
with childclass inheritance, <frame>, quat / axisangle / euler (eulerseq) / xyaxes / zaxis, hinge
and slide joints rotating about their anchor `pos` in the body frame, applied in order, by q - ref.
"""
import json
import math
import os
import sys
import xml.etree.ElementTree as ET


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def ident():
    return [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]


def trans(x, y, z):
    m = ident()
    m[0][3], m[1][3], m[2][3] = x, y, z
    return m


def quat_mat(w, x, y, z):
    n = math.sqrt(w * w + x * x + y * y + z * z) or 1.0
    w, x, y, z = w / n, x / n, y / n, z / n
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0.0],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0.0],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]


def axis_angle(ax, q):
    n = math.sqrt(sum(a * a for a in ax)) or 1.0
    x, y, z = (a / n for a in ax)
    c, s, t = math.cos(q), math.sin(q), 1 - math.cos(q)
    return [
        [t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0.0],
        [t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0.0],
        [t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]


def nums(s, d=None):
    if s is None or str(s).strip() == "":
        return d
    return [float(v) for v in str(s).replace(",", " ").split()]


def inverse_rigid(m):
    r = [[m[j][i] for j in range(3)] for i in range(3)]
    t = [-(r[i][0] * m[0][3] + r[i][1] * m[1][3] + r[i][2] * m[2][3]) for i in range(3)]
    return [r[0] + [t[0]], r[1] + [t[1]], r[2] + [t[2]], [0.0, 0.0, 0.0, 1.0]]


# ── URDF ────────────────────────────────────────────────────────────────────


def urdf_rpy(rpy, xyz):
    r, p, y = rpy
    cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
    R = [[cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr], [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr], [-sp, cp * sr, cp * cr]]
    return [R[0] + [xyz[0]], R[1] + [xyz[1]], R[2] + [xyz[2]], [0.0, 0.0, 0.0, 1.0]]


def urdf_fk(file, poses, links):
    root = ET.parse(file).getroot()
    by_child = {}
    for j in root.findall("joint"):
        o = j.find("origin")
        a = j.find("axis")
        by_child[j.find("child").get("link")] = dict(
            name=j.get("name"),
            type=j.get("type"),
            parent=j.find("parent").get("link"),
            xyz=nums(o.get("xyz") if o is not None else None, [0, 0, 0]),
            rpy=nums(o.get("rpy") if o is not None else None, [0, 0, 0]),
            axis=nums(a.get("xyz") if a is not None else None, [1, 0, 0]),
        )
    out = []
    for values in poses:
        row = []
        for link in links:
            chain = []
            l = link
            while l in by_child:
                chain.append(by_child[l])
                l = by_child[l]["parent"]
            M = ident()
            for j in reversed(chain):
                M = matmul(M, urdf_rpy(j["rpy"], j["xyz"]))
                q = values.get(j["name"], 0.0)
                if j["type"] in ("revolute", "continuous"):
                    M = matmul(M, axis_angle(j["axis"], q))
                elif j["type"] == "prismatic":
                    n = math.sqrt(sum(a * a for a in j["axis"])) or 1.0
                    M = matmul(M, trans(*(a / n * q for a in j["axis"])))
            row.append([M[i][k] for i in range(4) for k in range(4)])
        out.append(row)
    return out


# ── MJCF ────────────────────────────────────────────────────────────────────


def load_mjcf(file, checkout):
    def inline(el, d, depth=0):
        kids = []
        for c in list(el):
            if c.tag == "include":
                p = os.path.realpath(os.path.join(d, c.get("file")))
                if not p.startswith(os.path.realpath(checkout) + os.sep):
                    raise SystemExit("include leaves the checkout")
                sub = ET.parse(p).getroot()
                inline(sub, os.path.dirname(p), depth + 1)
                kids.extend(list(sub))
            else:
                inline(c, d, depth)
                kids.append(c)
        for c in list(el):
            el.remove(c)
        for c in kids:
            el.append(c)

    root = ET.parse(file).getroot()
    inline(root, os.path.dirname(file))
    return root


def mjcf_fk(file, checkout, poses, links):
    doc = load_mjcf(file, checkout)
    comp = {}
    for c in doc.findall("compiler"):
        comp.update(c.attrib)
    deg = comp.get("angle", "degree") != "radian"
    ascale = math.pi / 180 if deg else 1.0
    seq = comp.get("eulerseq", "xyz")

    classes = {}

    def walk_default(el, parent):
        name = el.get("class", "main")
        classes[name] = (parent, {})
        for c in el:
            if c.tag == "default":
                walk_default(c, name)
            else:
                classes[name][1].setdefault(c.tag, {}).update(c.attrib)

    for d in doc.findall("default"):
        walk_default(d, None)

    def resolved(el, cc):
        cls = el.get("class") or cc or "main"
        if cls not in classes:
            cls = "main"
        chain = []
        c = cls
        while c is not None:
            chain.insert(0, c)
            c = classes[c][0]
        if chain and chain[0] != "main" and "main" in classes:
            chain.insert(0, "main")
        out = {}
        for c in chain:
            out.update(classes[c][1].get(el.tag, {}))
        out.update(el.attrib)
        return out

    def orient(a):
        if "quat" in a:
            return quat_mat(*nums(a["quat"]))
        if "axisangle" in a:
            v = nums(a["axisangle"])
            return axis_angle(v[:3], v[3] * ascale)
        if "euler" in a:
            e = [x * ascale for x in nums(a["euler"])]
            M = ident()
            for i, ch in enumerate(seq):
                ax = {"x": [1, 0, 0], "y": [0, 1, 0], "z": [0, 0, 1]}[ch.lower()]
                R = axis_angle(ax, e[i])
                M = matmul(M, R) if ch.islower() else matmul(R, M)
            return M
        if "xyaxes" in a:
            v = nums(a["xyaxes"])
            x = v[:3]
            n = math.sqrt(sum(t * t for t in x))
            x = [t / n for t in x]
            y = v[3:]
            d = sum(x[i] * y[i] for i in range(3))
            y = [y[i] - d * x[i] for i in range(3)]
            n = math.sqrt(sum(t * t for t in y))
            y = [t / n for t in y]
            z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]
            return [[x[0], y[0], z[0], 0.0], [x[1], y[1], z[1], 0.0], [x[2], y[2], z[2], 0.0], [0.0, 0.0, 0.0, 1.0]]
        if "zaxis" in a:
            z = nums(a["zaxis"])
            n = math.sqrt(sum(t * t for t in z))
            z = [t / n for t in z]
            # minimal rotation (0,0,1) → z
            c = z[2]
            ax = [-z[1], z[0], 0.0]
            s = math.sqrt(ax[0] ** 2 + ax[1] ** 2)
            if s < 1e-12:
                return ident() if c > 0 else axis_angle([1, 0, 0], math.pi)
            return axis_angle(ax, math.atan2(s, c))
        return ident()

    def local(a):
        p = nums(a.get("pos"), [0, 0, 0])
        R = orient(a)
        R[0][3], R[1][3], R[2][3] = p
        return R

    # first top-level body (through frames) is the robot
    world = doc.find("worldbody")
    bodies = {}  # name → (parent world matrix fn inputs) computed per pose below

    def find_first(el, fm, cc):
        for c in el:
            if c.tag == "body":
                return c, fm, cc
            if c.tag == "frame":
                r = find_first(c, matmul(fm, local(resolved(c, cc))), c.get("childclass") or cc)
                if r:
                    return r
        return None

    first = find_first(world, ident(), None)
    if not first:
        raise SystemExit("no body")
    out = []
    for values in poses:
        X = {}

        def walk(el, parentM, fm, cc, is_root):
            a = resolved(el, cc)
            cc2 = el.get("childclass") or cc
            M = matmul(parentM, matmul(fm, local(a)))
            if is_root:
                M = ident()  # FK relative to the root body frame
            for j in el:
                if j.tag not in ("joint", "freejoint") or is_root:
                    continue
                ja = {"type": "free"} if j.tag == "freejoint" else resolved(j, cc2)
                t = ja.get("type", "hinge")
                if t in ("free", "ball"):
                    continue
                q = values.get(j.get("name"), None)
                ref = float(ja.get("ref", 0)) * (ascale if t == "hinge" else 1.0)
                if q is None:
                    q = ref
                p = nums(ja.get("pos"), [0, 0, 0])
                ax = nums(ja.get("axis"), [0, 0, 1])
                if t == "hinge":
                    M = matmul(M, matmul(trans(*p), matmul(axis_angle(ax, q - ref), trans(-p[0], -p[1], -p[2]))))
                elif t == "slide":
                    n = math.sqrt(sum(v * v for v in ax)) or 1.0
                    M = matmul(M, trans(*(v / n * (q - ref) for v in ax)))
            X[el.get("name")] = M
            content(el, M, ident(), cc2)

        def content(el, M, fm, cc):
            for c in el:
                if c.tag == "body":
                    walk(c, M, fm, cc, False)
                elif c.tag == "frame":
                    content(c, M, matmul(fm, local(resolved(c, cc))), c.get("childclass") or cc)

        walk(first[0], ident(), first[1], first[2], True)
        out.append([[X[l][i][k] for i in range(4) for k in range(4)] if l in X else None for l in links])
    return out


req = json.load(sys.stdin)
if req["kind"] == "urdf":
    res = urdf_fk(req["file"], req["poses"], req["links"])
else:
    res = mjcf_fk(req["file"], req["root"], req["poses"], req["links"])
print(json.dumps(res))
