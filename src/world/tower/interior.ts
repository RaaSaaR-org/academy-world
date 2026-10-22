import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ZoneContext } from '@/core/zones';
import { DEG, TOWER } from '../layout';
import { merge } from '../util';
import { clean, type TowerKit } from './kit';
import { facetFrame } from './structure';
import { markStatic } from '../statics';

/**
 * Foyer interior (ART-V2 §3.2, QA-17): ceramic panel lining over a carbon dado, warm floor cove,
 * carbon ceiling with 12 alu ribs to a central disc and a warm light ring, a satin composite floor
 * (#B5AFA8, roughness 0.55, low environment: no more "blue water") with a radial seam pattern,
 * the oculus with an alu rim and a teal ring. Built into the foyer group (detail tier).
 */
const N = 12;
const SIDE = 2 * TOWER.circumradius * Math.sin(Math.PI / N);
const IN = TOWER.inradius;
const H = TOWER.foyerHeight;
const WALL = 0.45;

export function buildInterior(ctx: ZoneContext, kit: TowerKit, foyer: THREE.Group): void {
  const lining: THREE.BufferGeometry[] = [];
  const dado: THREE.BufferGeometry[] = [];
  const cove: THREE.BufferGeometry[] = [];
  const carbonParts: THREE.BufferGeometry[] = [];
  const aluParts: THREE.BufferGeometry[] = [];
  const inset = WALL + 0.03;
  for (let k = 0; k < N; k++) {
    const b = k * 30;
    const f = facetFrame(b);
    const toWorld = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.rotateY(f.yaw).translate(f.x, 0, f.z);
    const w = SIDE / 2 - 0.02;
    const spans: [number, number, number, number][] =
      b === 180
        ? [
            [-w, -2, 0, H],
            [2, w, 0, H],
            [-2, 2, 4.5, H],
          ]
        : b === 0
          ? [
              [-w, -1.3, 0, H],
              [1.3, w, 0, H],
              [-1.3, 1.3, 3, H],
            ]
          : [[-w, w, 0, H]];
    for (const [x0, x1, y0, y1] of spans) {
      // ceramic panels above the dado (1.0 m), facing the centre
      const ya = Math.max(y0, 1.0);
      if (y1 > ya) {
        const g = new THREE.PlaneGeometry(x1 - x0, y1 - ya).rotateY(Math.PI).translate((x0 + x1) / 2, (ya + y1) / 2, -inset);
        const uv = g.getAttribute('uv');
        const p = g.getAttribute('position');
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (-p.getX(i) + SIDE / 2) / 4.8, p.getY(i) / 4.8);
        lining.push(toWorld(g));
      }
      if (y0 < 1.0) {
        dado.push(clean(toWorld(new THREE.PlaneGeometry(x1 - x0, 1.0 - y0).rotateY(Math.PI).translate((x0 + x1) / 2, (y0 + 1.0) / 2, -inset + 0.005))));
        // warm floor cove in a carbon channel
        cove.push(toWorld(new THREE.BoxGeometry(x1 - x0 - 0.1, 0.03, 0.03).translate((x0 + x1) / 2, 0.09, -inset - 0.04)));
        carbonParts.push(clean(toWorld(new THREE.BoxGeometry(x1 - x0 - 0.04, 0.1, 0.06).translate((x0 + x1) / 2, 0.06, -inset - 0.02))));
        // alu trim at the top of the dado
        aluParts.push(clean(toWorld(new THREE.BoxGeometry(x1 - x0, 0.04, 0.03).translate((x0 + x1) / 2, 1.0, -inset - 0.01))));
      }
    }
    // inner corner seam (carbon)
    const a = (b + 15) * DEG;
    const rc = (IN - inset) / Math.cos(Math.PI / N) - 0.02;
    carbonParts.push(clean(new THREE.BoxGeometry(0.06, H, 0.06).translate(0, H / 2, 0).rotateY(-a).translate(Math.sin(a) * rc, 0, -Math.cos(a) * rc)));
  }
  const lin = new THREE.Mesh(merge(lining.map(clean)), kit.hullPanel);
  lin.name = 'tower:foyer-lining';
  lin.receiveShadow = true;
  foyer.add(markStatic(lin));
  const dadoMesh = new THREE.Mesh(merge(dado), kit.carbon);
  foyer.add(markStatic(dadoMesh));
  foyer.add(markStatic(new THREE.Mesh(merge(cove), kit.light('warm', 1, 1))));

  // ceiling: carbon disc, 12 alu ribs to a central disc, warm ring light (T1)
  carbonParts.push(clean(new THREE.CircleGeometry(IN - 0.4, 48).rotateX(Math.PI / 2).translate(0, H - 0.02, 0)));
  for (let k = 0; k < N; k++) {
    const a = (k * 30 + 15) * DEG;
    const len = IN - 0.5 - 1.5;
    aluParts.push(clean(new RoundedBoxGeometry(0.12, 0.22, len, 2, 0.03).translate(0, H - 0.13, 1.5 + len / 2).rotateY(-a + Math.PI)));
  }
  aluParts.push(clean(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 48).translate(0, H - 0.08, 0)));
  // oculus rim
  aluParts.push(clean(new THREE.TorusGeometry(2.16, 0.07, 8, 72).rotateX(Math.PI / 2).translate(0, 0.04, 0)));
  // threshold plates
  aluParts.push(clean(new THREE.BoxGeometry(4, 0.03, 0.6).translate(0, 0.045, IN - 0.2)));
  aluParts.push(clean(new THREE.BoxGeometry(2.6, 0.03, 0.6).translate(0, 0.045, -IN + 0.2)));
  foyer.add(markStatic(new THREE.Mesh(merge(carbonParts), kit.carbon)));
  const aluMesh = new THREE.Mesh(merge(aluParts), kit.alu);
  aluMesh.receiveShadow = true;
  foyer.add(markStatic(aluMesh));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.06, 6, 96).rotateX(Math.PI / 2).translate(0, H - 0.28, 0), kit.light('warm', 1, 1));
  foyer.add(markStatic(ring));
  const oculusLine = new THREE.Mesh(new THREE.TorusGeometry(2.36, 0.025, 4, 96).rotateX(Math.PI / 2).translate(0, 0.045, 0), kit.light('teal'));
  foyer.add(markStatic(oculusLine));

  // floor: satin composite with concentric + radial seams (QA-17: no mirror, low environment)
  const floorTex = ctx.materials.canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    const cx = w / 2,
      cy = h / 2;
    const px = w / (2 * IN);
    g.strokeStyle = 'rgba(70,64,58,0.5)';
    g.lineWidth = 2;
    for (const r of [3.3, 4.6, 6.0, 7.4]) {
      g.beginPath();
      g.arc(cx, cy, r * px, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r0 = (i % 2 ? 4.6 : 2.3) * px;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * IN * px, cy + Math.sin(a) * IN * px);
      g.stroke();
    }
    // a slightly darker inlay band (r 6.0–6.25): reads as a path around the hall
    g.strokeStyle = 'rgba(90,82,74,0.35)';
    g.lineWidth = 0.25 * px;
    g.beginPath();
    g.arc(cx, cy, 6.12 * px, 0, Math.PI * 2);
    g.stroke();
  });
  ctx.onDispose(() => floorTex.dispose());
  // warm satin composite: the interior's sky ambient is blue, so the albedo leans warm (#C2B6A8)
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xc2b6a8, map: floorTex, roughness: 0.58, metalness: 0.0, envMapIntensity: 0.22, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  floorMat.name = 'tower:foyer-floor';
  ctx.onDispose(() => floorMat.dispose());
  const fg = new THREE.RingGeometry(2.3, IN - 0.2, 96, 1).rotateX(-Math.PI / 2);
  {
    const p = fg.getAttribute('position');
    const uv = fg.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / (2 * IN) + 0.5, -p.getZ(i) / (2 * IN) + 0.5);
  }
  const floor = new THREE.Mesh(fg, floorMat);
  floor.position.y = 0.035;
  floor.receiveShadow = true;
  floor.name = 'tower:foyer-floor';
  foyer.add(markStatic(floor));
  const oculus = new THREE.Mesh(new THREE.CircleGeometry(2.1, 48).rotateX(-Math.PI / 2), kit.glassClear);
  oculus.position.y = 0.03;
  oculus.renderOrder = 2;
  foyer.add(markStatic(oculus));
  ctx.physics.addStaticBox({ size: [4.4, 0.1, 4.4], position: [0, -0.05, 0] });
  ctx.lights.point([0, 5.6, 0], { color: 0xffe7c7, intensity: 26, distance: 15 });
}
