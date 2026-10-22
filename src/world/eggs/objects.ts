/**
 * WP15 — the Fundvitrine objects (plan §4.13, §5.2; R9 §5.1): one small procedural object per egg with a
 * vitrine reward, registered with ctx.game.secrets.registerObject at island init. The Schauhalle (WP11)
 * asks for them by id (secrets.object(id)) and places them in its 25 compartments. Each is ≤ 300
 * triangles, fits a 0.16 m cube, stands on its own base (pivot at the bottom centre, facing +z) and is
 * ONE mesh with the robots' shared paint material (vertex colours; no new program, geo.ts).
 * Album rewards (eggs 11, 12, 24) have no object: they go to the Pannen-Wand.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { PAL, at, box, col, mergeParts, triangles } from '../life/geo';

type Maker = () => THREE.BufferGeometry;

/** the base plate every object stands on (dark carbon, 12 triangles) */
const base = (w = 0.13, d = 0.1): THREE.BufferGeometry => box(w, 0.012, d, PAL.carbon, 0, 0.006, 0);

const MAKERS: Record<string, Maker> = {
  /** 13 Winke-Arm: a little white hand, waving */
  'winke-arm': () => {
    const p: THREE.BufferGeometry[] = [base(0.1, 0.07)];
    p.push(box(0.022, 0.03, 0.022, PAL.slate, 0, 0.027, 0));
    const tilt = -0.18;
    p.push(at(col(new THREE.BoxGeometry(0.058, 0.064, 0.02), PAL.white), 0, 0.075, 0, 0, 0, tilt));
    for (let k = 0; k < 4; k++) {
      const x = -0.021 + k * 0.014;
      const len = [0.036, 0.042, 0.04, 0.032][k];
      p.push(at(col(new THREE.BoxGeometry(0.011, len, 0.016), PAL.white), x + Math.sin(-tilt) * (0.032 + len / 2), 0.107 + len / 2 - 0.004, 0, 0, 0, tilt + (k - 1.5) * 0.06));
    }
    p.push(at(col(new THREE.BoxGeometry(0.012, 0.034, 0.016), PAL.white), 0.036, 0.07, 0, 0, 0, tilt - 0.9));
    return mergeParts(p);
  },
  /** 3 Robota: the theatre ticket „R.U.R. · 1921“ (our own design: a cream card, a stub, print bars) */
  robota: () => {
    const p: THREE.BufferGeometry[] = [base(0.13, 0.06)];
    p.push(box(0.03, 0.02, 0.03, PAL.carbon, 0, 0.022, 0));
    const lean = -0.32;
    const card = (w: number, hgt: number, x: number, y: number, hex: number, dz = 0): THREE.BufferGeometry => at(col(new THREE.BoxGeometry(w, hgt, 0.0025), hex), x, 0.03 + y * Math.cos(lean), y * Math.sin(-lean) + dz, lean, 0, 0);
    p.push(card(0.115, 0.052, 0, 0.026, PAL.paper));
    p.push(card(0.024, 0.052, 0.046, 0.026, 0xc9bfa6, 0.0015));
    for (let k = 0; k < 4; k++) p.push(card(0.05 - k * 0.008, 0.005, -0.016, 0.012 + k * 0.009, PAL.carbon, 0.0018));
    p.push(card(0.02, 0.008, 0.046, 0.034, PAL.carbon, 0.0021));
    return mergeParts(p);
  },
  /** 5 Der Wackelige: an „A*“ floor tile, the teal search frontier on a dark plate */
  wackelig: () => {
    const p: THREE.BufferGeometry[] = [box(0.14, 0.014, 0.14, PAL.carbon, 0, 0.007, 0)];
    const n = 5,
      s = 0.022,
      g = 0.026;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        // the frontier: cells within 3 steps of the corner, the path on the diagonal brighter
        const d = i + j;
        if (d > 5) continue;
        const hex = i === j ? PAL.teal : d < 4 ? 0x1f8f80 : 0x16645a;
        p.push(at(col(new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2), hex), -0.052 + i * g, 0.0145, -0.052 + j * g));
      }
    return mergeParts(p);
  },
  /** 10 Erklär's der Ente: a yellow rubber duck */
  'erklaer-ente': () => {
    const p: THREE.BufferGeometry[] = [base(0.1, 0.08)];
    p.push(at(col(new THREE.SphereGeometry(0.04, 9, 6).scale(1.25, 0.82, 1), PAL.yellow), 0, 0.045, 0));
    p.push(at(col(new THREE.SphereGeometry(0.026, 8, 5), PAL.yellow), 0.026, 0.088, 0));
    p.push(at(col(new THREE.ConeGeometry(0.01, 0.024, 6).rotateZ(-Math.PI / 2), 0xf28c28), 0.056, 0.085, 0));
    p.push(at(col(new THREE.ConeGeometry(0.014, 0.028, 5).rotateZ(Math.PI / 2 + 0.6), PAL.yellow), -0.05, 0.062, 0));
    return mergeParts(p);
  },
  /** 14 Fotopunkt: a framed print of the view (sky, the cloud bank's golden edge, the Revier) */
  fotopunkt: () => {
    const p: THREE.BufferGeometry[] = [base(0.12, 0.05)];
    const W = 0.1,
      H = 0.075,
      lean = -0.22;
    const put = (g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry => at(g, x, 0.016 + y * Math.cos(lean), z + y * Math.sin(-lean), lean, 0, 0);
    p.push(put(col(new THREE.BoxGeometry(W + 0.012, H + 0.012, 0.006), PAL.timberSilver), 0, H / 2 + 0.006, 0));
    const bands: [number, number][] = [
      [0x9fb2c0, 0.3],
      [0x8a8580, 0.22],
      [0xe8b26a, 0.08],
      [0x8f8a70, 0.2],
      [0x6f7a50, 0.2],
    ];
    let y = H;
    for (const [hex, f] of bands) {
      const bh = H * f;
      p.push(put(col(new THREE.PlaneGeometry(W, bh), hex), 0, y - bh / 2 + 0.006, 0.0031));
      y -= bh;
    }
    return mergeParts(p);
  },
  /** 15 Werkbank der Offenen: a small timber workbench with a vise and a gear */
  werkbank: () => {
    const p: THREE.BufferGeometry[] = [base(0.14, 0.08)];
    p.push(box(0.13, 0.01, 0.06, PAL.timberFresh, 0, 0.07, 0));
    for (const x of [-0.055, 0.055]) for (const z of [-0.022, 0.022]) p.push(box(0.008, 0.058, 0.008, PAL.timberSilver, x, 0.041, z));
    p.push(box(0.11, 0.006, 0.05, PAL.timberSilver, 0, 0.03, 0));
    p.push(box(0.022, 0.018, 0.02, PAL.slate, 0.045, 0.084, 0.018));
    p.push(at(col(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 12), PAL.stoneDark), -0.03, 0.078, 0, 0, 0, 0));
    p.push(at(col(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 6), PAL.carbon), -0.03, 0.082, 0));
    return mergeParts(p);
  },
  /** 1 Die nächste Zahl: a slate with „43“ in teal segments */
  'naechste-zahl': () => {
    const p: THREE.BufferGeometry[] = [base(0.12, 0.05)];
    const lean = -0.2;
    const put = (g: THREE.BufferGeometry, x: number, y: number, z = 0): THREE.BufferGeometry => at(g, x, 0.014 + y * Math.cos(lean), z + y * Math.sin(-lean), lean, 0, 0);
    p.push(put(col(new THREE.BoxGeometry(0.11, 0.075, 0.008), PAL.carbon), 0, 0.0375));
    // seven segments of a digit (a top … g middle), 0.024 wide and 0.044 tall
    const seg = (cx: number, which: string): void => {
      const w = 0.024,
        hh = 0.044,
        t = 0.004;
      const S: Record<string, [number, number, number, number]> = {
        a: [cx, 0.0375 + hh / 2, w, t],
        b: [cx + w / 2, 0.0375 + hh / 4, t, hh / 2],
        c: [cx + w / 2, 0.0375 - hh / 4, t, hh / 2],
        d: [cx, 0.0375 - hh / 2, w, t],
        e: [cx - w / 2, 0.0375 - hh / 4, t, hh / 2],
        f: [cx - w / 2, 0.0375 + hh / 4, t, hh / 2],
        g: [cx, 0.0375, w, t],
      };
      for (const k of which) {
        const [x, y, sw, sh] = S[k];
        p.push(put(col(new THREE.PlaneGeometry(sw, sh), PAL.teal), x, y, 0.0042));
      }
    };
    seg(-0.02, 'fgbc');
    seg(0.02, 'abgcd');
    return mergeParts(p);
  },
};

/** The ids with a vitrine object (EGGS rewards of kind 'vitrine'). */
export const VITRINE_IDS = Object.keys(MAKERS);

/** Register every vitrine object with ctx.game.secrets (built on first request; disposed with the hall's use). */
export function registerVitrineObjects(ctx: ZoneContext): void {
  for (const [id, make] of Object.entries(MAKERS)) {
    ctx.game.secrets.registerObject(id, () => {
      const geo = make();
      // the robots' shared paint (vertex colours); before the robots runtime exists, the same parameters
      // from the material library resolve to the same cached material (WP4 robots.ts PAINT)
      const mat = ctx.robots?.paint ?? ctx.materials.standard({ vertexColors: true, roughness: 0.55, metalness: 0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `fund:${id}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.fund = id;
      mesh.userData.triangles = triangles(geo);
      return mesh;
    });
  }
}

/** Triangles per vitrine object (tools: the ≤ 300 rule). */
export function vitrineTriangles(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, make] of Object.entries(MAKERS)) {
    const g = make();
    out[id] = triangles(g);
    g.dispose();
  }
  return out;
}
