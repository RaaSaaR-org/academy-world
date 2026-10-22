/**
 * The three weeders (plan §4.11 rule: generic procedural machines that look like no product, D34): a mapping
 * hoe robot with its own solar roof and no camera, a camera spot sprayer with three hoods on a low boom, a
 * laser unit with a dark hood over the soil and a sensor mast. Each is ONE mesh (vertex colours), so a
 * machine is one draw; a kinematic box keeps you from walking through it.
 */
import * as THREE from 'three';
import type { KinematicHandle, ZoneContext } from '@/core/zones';
import type { MethodId } from './sim';

export interface Machine {
  readonly id: MethodId;
  readonly object: THREE.Mesh;
  /** place on the ground (local x, z) facing local −z turned by yaw */
  place(x: number, z: number, yaw?: number): void;
  readonly pos: THREE.Vector3;
}

interface Part {
  geo: THREE.BufferGeometry;
  color: number;
  m: THREE.Matrix4;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.Matrix4 => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
const BOX = new THREE.BoxGeometry(1, 1, 1);
const WHEEL = new THREE.CylinderGeometry(1, 1, 1, 16, 1).rotateZ(Math.PI / 2);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
const wheel = (r: number, w: number, x: number, z: number): Part => ({ geo: WHEEL, color: 0x2a2826, m: new THREE.Matrix4().compose(new THREE.Vector3(x, r, z), new THREE.Quaternion(), new THREE.Vector3(w, r, r)) });

const ALU = 0xb9b6b0,
  PV = 0x23262b,
  LIGHT = 0xd6d3d1,
  GREY = 0x9ca4a8,
  DARK = 0x3a3836,
  TEAL = 0x2dd4bf;

function parts(id: MethodId): Part[] {
  if (id === 'hoe')
    return [
      // a light frame on four wheels, the solar roof on posts, the battery box, a hoe bar with tines, the GNSS mast
      ...[-0.8, 0.8].map((x): Part => ({ geo: BOX, color: ALU, m: box(0.08, 0.08, 2.3, x, 0.78, 0) })),
      ...[-1.05, 1.05].map((z): Part => ({ geo: BOX, color: ALU, m: box(1.7, 0.08, 0.08, 0, 0.78, z) })),
      ...[
        [-0.8, -1.0],
        [0.8, -1.0],
        [-0.8, 1.0],
        [0.8, 1.0],
      ].map(([x, z]): Part => ({ geo: BOX, color: ALU, m: box(0.06, 0.6, 0.06, x, 1.1, z) })),
      { geo: BOX, color: PV, m: box(1.95, 0.05, 2.35, 0, 1.43, 0) },
      { geo: BOX, color: LIGHT, m: box(0.62, 0.36, 0.5, 0, 0.98, 0.2) },
      { geo: BOX, color: DARK, m: box(1.6, 0.06, 0.06, 0, 0.38, -0.45) },
      ...[-0.6, -0.36, -0.12, 0.12, 0.36, 0.6].map((x): Part => ({ geo: BOX, color: DARK, m: box(0.03, 0.32, 0.05, x, 0.2, -0.45) })),
      { geo: BOX, color: ALU, m: box(0.04, 0.5, 0.04, 0, 1.7, -0.9) },
      { geo: CYL, color: LIGHT, m: new THREE.Matrix4().compose(new THREE.Vector3(0, 1.97, -0.9), new THREE.Quaternion(), new THREE.Vector3(0.09, 0.05, 0.09)) },
      wheel(0.45, 0.22, -0.92, 0.85),
      wheel(0.45, 0.22, 0.92, 0.85),
      wheel(0.26, 0.14, -0.88, -0.95),
      wheel(0.26, 0.14, 0.88, -0.95),
    ];
  if (id === 'spray')
    return [
      // a compact carrier, a tank on the back, a low boom with three camera hoods (teal lens marks: data)
      { geo: BOX, color: GREY, m: box(1.1, 0.55, 1.7, 0, 0.82, 0.2) },
      { geo: CYL, color: LIGHT, m: new THREE.Matrix4().compose(new THREE.Vector3(0, 1.32, 0.55), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(0.32, 0.8, 0.32)) },
      { geo: BOX, color: ALU, m: box(2.5, 0.08, 0.12, 0, 0.62, -0.85) },
      ...[-0.85, 0, 0.85].flatMap((x): Part[] => [
        { geo: BOX, color: DARK, m: box(0.55, 0.32, 0.4, x, 0.42, -0.85) },
        { geo: BOX, color: TEAL, m: box(0.1, 0.04, 0.02, x, 0.5, -1.06) },
      ]),
      { geo: BOX, color: ALU, m: box(0.06, 0.45, 0.06, -0.45, 0.85, -0.6) },
      { geo: BOX, color: ALU, m: box(0.06, 0.45, 0.06, 0.45, 0.85, -0.6) },
      wheel(0.36, 0.2, -0.66, 0.75),
      wheel(0.36, 0.2, 0.66, 0.75),
      wheel(0.36, 0.2, -0.66, -0.25),
      wheel(0.36, 0.2, 0.66, -0.25),
    ];
  return [
    // a boxy unit, a dark hood over the soil (the lasers sit inside), a sensor mast with a camera head
    { geo: BOX, color: GREY, m: box(1.45, 0.62, 1.55, 0, 0.98, 0) },
    { geo: BOX, color: DARK, m: box(1.62, 0.36, 1.75, 0, 0.42, -0.05) },
    { geo: BOX, color: 0xb4afa9, m: box(1.5, 0.06, 1.6, 0, 1.32, 0) },
    { geo: BOX, color: ALU, m: box(0.06, 0.7, 0.06, 0.55, 1.68, -0.6) },
    { geo: BOX, color: DARK, m: box(0.24, 0.16, 0.2, 0.55, 2.06, -0.65) },
    { geo: BOX, color: TEAL, m: box(0.12, 0.05, 0.02, 0.55, 2.06, -0.76) },
    wheel(0.38, 0.22, -0.86, 0.6),
    wheel(0.38, 0.22, 0.86, 0.6),
    wheel(0.38, 0.22, -0.86, -0.6),
    wheel(0.38, 0.22, 0.86, -0.6),
  ];
}

function merge(list: Part[]): THREE.BufferGeometry {
  const pos: number[] = [],
    nor: number[] = [],
    col: number[] = [];
  const c = new THREE.Color();
  const nm = new THREE.Matrix3();
  for (const p of list) {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(p.m);
    nm.getNormalMatrix(p.m);
    const a = g.getAttribute('position'),
      n = g.getAttribute('normal');
    // setHex stores the working (linear) colour: what a vertex colour attribute expects
    c.setHex(p.color);
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

export function buildMachines(ctx: ZoneContext, parent: THREE.Object3D, gy: (x: number, z: number) => number): Record<MethodId, Machine> {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.18 });
  ctx.onDispose(() => mat.dispose());
  const make = (id: MethodId): Machine => {
    const geo = merge(parts(id));
    ctx.onDispose(() => geo.dispose());
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `unkrautacker:machine-${id}`;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    const pos = new THREE.Vector3();
    let kin: KinematicHandle | null = null;
    return {
      id,
      object: mesh,
      pos,
      place(x, z, yaw = 0) {
        pos.set(x, gy(x, z), z);
        mesh.position.copy(pos);
        mesh.rotation.y = yaw;
        // the collider follows (kinematic: it pushes you aside, it never stops)
        if (!kin) kin = ctx.physics.addKinematic(mesh, { shape: 'box' });
        else kin.setPose([pos.x, pos.y, pos.z], [0, yaw, 0]);
      },
    };
  };
  return { hoe: make('hoe'), spray: make('spray'), laser: make('laser') };
}
