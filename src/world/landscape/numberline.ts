import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { flatStrip, sharedBatch } from './batch';
import { markStatic } from '../statics';
import { cullTinyText } from '../detail';

/**
 * Allee number line (ART-V2 §4.2, optional fun item): 26 teal ticks on the Allee centreline, values
 * 0…25 every 2 m from z 84 (the Landedeck end) to z 34 (the plaza). Every new value you walk over
 * draws the next step of Recamán's sequence into the floor as a 4 cm teal semi-ellipse between the
 * two values (odd steps to the right, even steps to the left, kept inside the light channels).
 * After 17 steps the floor holds the construction of the EmAI mark. Each arc plays its value as a
 * soft note. A floor plaque at the start gives the rule (OEIS A005132). Teal, never orange: a motif
 * echo, not the mark. One draw call for the ticks (batch), one for the numbers, one for the arcs.
 */
const Z0 = 84;
const STEP = 2;
const N = 25;
const zOf = (v: number): number => Z0 - STEP * v;

/** Recamán's sequence a(0…17): a(n) = a(n−1) − n if positive and new, else a(n−1) + n (OEIS A005132). */
export function recaman(n: number): number[] {
  const a = [0];
  const seen = new Set([0]);
  for (let k = 1; k <= n; k++) {
    const back = a[k - 1] - k;
    const v = back > 0 && !seen.has(back) ? back : a[k - 1] + k;
    a.push(v);
    seen.add(v);
  }
  return a;
}

export function buildNumberLine(ctx: ZoneContext): { update(dt: number, feet: THREE.Vector3): void } {
  const M = ctx.materials;
  const batch = sharedBatch(ctx);
  const A = recaman(17); // 0,1,3,6,2,7,13,20,12,21,11,22,10,23,9,24,8,25
  const Y = 0.052;

  // ticks (static, in the island batch): longer every 5
  for (let v = 0; v <= N; v++) {
    const w = v % 5 === 0 ? 0.9 : 0.5;
    batch.add(M.carbon, new THREE.PlaneGeometry(w + 0.08, 0.13).rotateX(-Math.PI / 2).translate(0, Y - 0.004, zOf(v)), { name: 'carbon' });
    batch.add(M.light(0x2dd4bf), new THREE.PlaneGeometry(w, 0.05).rotateX(-Math.PI / 2).translate(0, Y, zOf(v)), { name: 'teal-lines' });
  }

  // numbers: one canvas strip left of the ticks, upright for someone walking north
  const PX = 64;
  const len = STEP * N + 2;
  const canvas = M.canvasTexture(128, Math.round(len * PX), (g, w) => {
    g.clearRect(0, 0, w, len * PX);
    g.fillStyle = 'rgba(41,37,36,0.82)';
    g.font = `600 ${Math.round(0.34 * PX)}px "Geist Mono", monospace`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let v = 0; v <= N; v++) {
      const y = (zOf(v) - (zOf(N) - 1)) * PX;
      g.fillText(String(v), w - 10, y);
    }
  });
  canvas.wrapS = canvas.wrapT = THREE.ClampToEdgeWrapping;
  ctx.onDispose(() => canvas.dispose());
  const numMat = new THREE.MeshBasicMaterial({ map: canvas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12, fog: true });
  ctx.onDispose(() => numMat.dispose());
  const nums = new THREE.Mesh(new THREE.PlaneGeometry(1.0, len).rotateX(-Math.PI / 2), numMat);
  nums.position.set(-0.98, Y + 0.001, (zOf(0) + 1 + zOf(N) - 1) / 2);
  nums.name = 'island:numberline-values';
  ctx.root.add(nums);
  ctx.freezeStatic(nums);

  // arcs: one mesh, per-vertex (arc index, progress along the arc); the shader hides what is not drawn yet
  const pos: number[] = [],
    arcAttr: number[] = [],
    uAttr: number[] = [],
    idx: number[] = [];
  for (let k = 1; k <= 17; k++) {
    const za = zOf(A[k - 1]),
      zb = zOf(A[k]);
    const side = k % 2 ? 1 : -1;
    const h = Math.min(k * 0.75, 3.0);
    const SEG = 20 + k * 3;
    const pts: [number, number][] = [];
    for (let i = 0; i <= SEG; i++) {
      const phi = (i / SEG) * Math.PI;
      pts.push([side * h * Math.sin(phi), za + (zb - za) * (1 - Math.cos(phi)) * 0.5]);
    }
    const strip = flatStrip(pts, 0.04, Y + 0.002);
    const p = strip.getAttribute('position');
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      arcAttr.push(k - 1);
      uAttr.push(Math.floor(i / 2) / SEG);
    }
    const ia = strip.getIndex()!.array;
    for (let i = 0; i < ia.length; i++) idx.push(base + ia[i]);
    strip.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aArc', new THREE.Float32BufferAttribute(arcAttr, 1));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(uAttr, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  const prog = { value: new Array(17).fill(0) as number[] };
  const TEAL = new THREE.Color(0x2dd4bf);
  const arcMat = new THREE.MeshBasicMaterial({ color: TEAL.clone(), polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 });
  arcMat.userData.noEnrich = true;
  arcMat.onBeforeCompile = (sh) => {
    sh.uniforms.uProg = prog;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aArc; attribute float aU; varying float vArc; varying float vU;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArc = aArc; vU = aU;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uProg[17]; varying float vArc; varying float vU;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nint ai = int(vArc + 0.5);\nfloat pr = 0.0;\nfor (int i = 0; i < 17; i++) if (i == ai) pr = uProg[i];\nif (vU > pr) discard;');
  };
  arcMat.customProgramCacheKey = () => 'emai-numberline-arcs';
  ctx.onDispose(() => arcMat.dispose());
  const tint = (): void => {
    arcMat.color.copy(TEAL).multiplyScalar(M.tierScale(TEAL, 'line'));
  };
  tint();
  ctx.onDispose(M.onDusk(tint));
  const arcs = new THREE.Mesh(g, arcMat);
  arcs.name = 'island:numberline-arcs';
  ctx.root.add(arcs);
  ctx.freezeStatic(arcs);

  // the rule, on a flush dark-glass plaque at the start of the Allee
  {
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.02, 0.72), M.darkGlass);
    plaque.position.set(0, 0.04, 86.3);
    plaque.userData.noCollide = true;
    ctx.root.add(markStatic(plaque));
    batch.add(M.brushedAlu, new THREE.BoxGeometry(3.38, 0.015, 0.8).translate(0, 0.034, 86.3), { name: 'alu' });
    const t1 = ctx.text3d.create(
      { text: { de: 'a(n) = a(n−1) − n, wenn das positiv und neu ist – sonst a(n−1) + n', en: 'a(n) = a(n−1) − n if that is positive and new – otherwise a(n−1) + n' }, font: 'mono-medium', size: 0.076, color: 0xe7e5e4, anchorX: 'center', anchorY: 'middle', maxWidth: 3.2, textAlign: 'center', position: [0, 0.012, -0.1] },
      plaque,
    );
    t1.rotation.x = -Math.PI / 2;
    cullTinyText(ctx, t1);
    const t2 = ctx.text3d.create({ text: { de: 'RECAMÁN-FOLGE · OEIS A005132 · LAUF DIE ALLEE HINAUF', en: 'RECAMÁN SEQUENCE · OEIS A005132 · WALK UP THE AVENUE' }, font: 'mono', size: 0.06, color: 0x2dd4bf, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.06, position: [0, 0.012, 0.2] }, plaque);
    t2.rotation.x = -Math.PI / 2;
    cullTinyText(ctx, t2);
  }

  // drawing state
  const visited = new Set<number>();
  let drawn = 0;
  let current = -1;
  let t = 0;
  const DRAW_S = 0.9;
  const queue: number[] = [];
  let announced = false;
  ctx.events.on('progress:reset', () => {
    visited.clear();
    drawn = 0;
    current = -1;
    queue.length = 0;
    announced = false;
    prog.value.fill(0);
  });
  return {
    update(dt, feet) {
      if (Math.abs(feet.x) < 4.2 && feet.z < Z0 + 1 && feet.z > zOf(N) - 1 && feet.y < 2) {
        const v = Math.round((Z0 - feet.z) / STEP);
        if (v >= 0 && v <= N && Math.abs(feet.z - zOf(v)) < 0.6 && !visited.has(v)) {
          visited.add(v);
          if (drawn + queue.length < 17) queue.push(drawn + queue.length);
        }
      }
      if (current < 0 && queue.length) {
        current = queue.shift()!;
        t = 0;
        const val = A[current + 1];
        ctx.game.juice.cue('tick', { at: [0, 0.2, zOf(val)], pitch: Math.pow(2, (val - 12) / 24), volume: 0.6 });
      }
      if (current >= 0) {
        t += dt;
        const k = Math.min(1, t / DRAW_S);
        prog.value[current] = k * k * (3 - 2 * k);
        if (k >= 1) {
          prog.value[current] = 1;
          drawn = current + 1;
          current = -1;
          if (drawn === 17 && !announced) {
            announced = true;
            ctx.game.juice.popup([0, 1.6, zOf(25) + 1], { de: '17 Bögen – das EmAI-Zeichen', en: '17 arcs – the EmAI mark' }, { tone: 'teal', seconds: 3.5 });
            ctx.game.juice.cue('great', { at: [0, 0.5, zOf(25)] });
          }
        }
      }
    },
  };
}
