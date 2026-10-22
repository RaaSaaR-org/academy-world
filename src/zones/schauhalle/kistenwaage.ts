/**
 * Kistenwaage (plan §4.9, R4 §7.3, §8): grabbable loads of 1, 2 and 5 kg and one 18 kg Dunkelfabrik
 * crate on a rack in the aisle, and three load points on green models [C2 m9] — the FANUC hook, ANYmal
 * D's payload rails and a hook under the UR5e — each a post with a plate that weighs what lies on it.
 * A gauge shows the load as % of the vendor's figure with its condition; above 100 % it turns amber:
 * „Über der Angabe. Was dann passiert, steht in keinem Datenblatt.“ (never a staged failure). The
 * warm-up „Wer nimmt die 18-kg-Kiste?“ ends when the crate rests on a plate.
 */
import * as THREE from 'three';
import type { DynamicHandle, RobotId, ZoneContext } from '@/core/zones';
import { box, canvasTex, FONT } from './geo';
import { KISTEN } from './layout';
import { fitText, INK } from './look';
import { zs } from './sheet';
import { KISTENWAAGE } from './tuning';

export interface Kistenwaage {
  update(dt: number): void;
  /** kg on each load point now */
  readonly loads: Readonly<Record<string, number>>;
  /** the warm-up: the crate has rested on any plate; `fanuc`: on the FANUC's */
  readonly warm: { tried: string[]; done: boolean };
  onWarmDone(fn: (onFanuc: boolean) => void): void;
  /** put the crate on a load point (debug, the playtest's solve) */
  place(post: keyof typeof KISTEN.posts, kg: number): void;
  reset(): void;
}

type PostId = keyof typeof KISTEN.posts;
/** the vendor figure each gauge compares to (kg) and its condition key (strings: kiste.cond.*) */
const SPEC: Record<PostId, { kg: number; cond: string; name: string }> = {
  'fanuc-r2000ic-165f': { kg: 165, cond: 'fanuc', name: 'FANUC R-2000iC/165F' },
  'anymal-d': { kg: 10, cond: 'anymal', name: 'ANYmal D' },
  ur5e: { kg: 5, cond: 'ur5e', name: 'UR5e' },
};

export function buildKistenwaage(ctx: ZoneContext): Kistenwaage {
  const det = ctx.groups.detail;
  const posts = Object.keys(KISTEN.posts) as PostId[];
  const [kx, kz] = KISTEN.rack;

  // ── the loads (dynamic, grabbable) ────────────────────────────────────────
  const bodies: { kg: number; h: DynamicHandle }[] = [];
  const sizes: Record<number, [number, number, number]> = { 1: [0.14, 0.12, 0.14], 2: [0.18, 0.15, 0.18], 5: [0.26, 0.18, 0.22], 18: [0.6, 0.4, 0.4] };
  const spots: Record<number, [number, number, number]> = { 1: [kx, 0.95 + 0.07, kz - 0.4], 2: [kx, 0.95 + 0.09, kz + 0.25], 5: [kx, 0.5 + 0.1, kz - 0.25], 18: [kx + 0.62, 0.21, kz + 0.1] };
  const steel = ctx.materials.standard({ color: 0x57534e, roughness: 0.45, metalness: 0.6 });
  for (const kg of KISTENWAAGE.loads) {
    const [w, hh, d] = sizes[kg];
    const geo = box(w, hh, d);
    const m = new THREE.Mesh(geo, kg === 18 ? ctx.materials.crate : steel);
    m.name = `schauhalle:load-${kg}`;
    m.castShadow = true;
    m.receiveShadow = true;
    m.position.set(...spots[kg]);
    det.add(m);
    const h = ctx.physics.addDynamic(m, { mass: kg, label: { de: zs('de', `kiste.label.${kg}`), en: zs('en', `kiste.label.${kg}`) }, friction: 0.8 });
    bodies.push({ kg, h });
  }
  ctx.onDispose(() => bodies.forEach((b) => (b.h.object as THREE.Mesh).geometry.dispose()));

  // ── plate sensors: the loads resting on each plate ────────────────────────
  const on: Record<PostId, Set<DynamicHandle>> = { 'fanuc-r2000ic-165f': new Set(), 'anymal-d': new Set(), ur5e: new Set() };
  for (const id of posts) {
    const [px, pz] = KISTEN.posts[id];
    ctx.physics.addTrigger({
      shape: 'box',
      size: [0.62, 0.7, 0.62],
      position: [px, KISTEN.plateY + 0.37, pz],
      filter: 'dynamic',
      onEnter: (e) => {
        if (e.body) on[id].add(e.body);
      },
      onExit: (e) => {
        if (e.body) on[id].delete(e.body);
      },
    });
  }

  // ── gauges: one canvas, three screens on the posts (1 draw) ───────────────
  const W = 256,
    H = 160;
  const gt = canvasTex(W * 3, H);
  const gaugeGeo: THREE.BufferGeometry[] = [];
  posts.forEach((id, i) => {
    const [px, pz] = KISTEN.posts[id];
    const g = new THREE.PlaneGeometry(0.42, 0.26);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 3);
    // the screen stands on the post's back edge, toward the aisle side the visitor comes from
    const toward = px < 0 ? Math.PI / 2 : -Math.PI / 2;
    g.rotateX(-0.3).rotateY(toward).translate(px + (px < 0 ? -0.2 : 0.2), KISTEN.plateY + 0.42, pz);
    gaugeGeo.push(g);
  });
  const gMat = new THREE.MeshBasicMaterial({ map: gt.tex, name: 'schauhalle:gauges' });
  const gMesh = new THREE.Mesh(mergeAll(gaugeGeo), gMat);
  gMesh.name = 'schauhalle:gauges';
  gMesh.matrixAutoUpdate = false;
  det.add(gMesh);
  ctx.onDispose(() => {
    gMesh.geometry.dispose();
    gMat.dispose();
    gt.tex.dispose();
  });
  const shown: Record<PostId, number> = { 'fanuc-r2000ic-165f': 0, 'anymal-d': 0, ur5e: 0 };
  const loads: Record<string, number> = { 'fanuc-r2000ic-165f': 0, 'anymal-d': 0, ur5e: 0 };
  const draw = (): void => {
    const g = gt.g;
    const L = ctx.i18n.lang;
    posts.forEach((id, i) => {
      const x0 = i * W;
      const s = SPEC[id];
      const pct = (shown[id] / s.kg) * 100;
      const over = pct > 100.5;
      g.fillStyle = INK.bg;
      g.fillRect(x0, 0, W, H);
      g.fillStyle = over ? INK.amber : INK.teal;
      g.fillRect(x0, 0, W, 4);
      g.textBaseline = 'alphabetic';
      fitText(g, zs(L, 'kiste.post', { name: s.name }), x0 + 12, 26, W - 24, 14, (px) => FONT.mono(px, 500), INK.text2);
      fitText(g, `${Math.round(pct)} %`, x0 + 12, 74, W - 24, 42, (px) => FONT.display(px), over ? INK.amber : INK.text);
      fitText(g, `${loads[id].toFixed(0)} kg / ${s.kg} kg`, x0 + W - 12, 74, 120, 16, (px) => FONT.mono(px, 500), INK.text2, 'right');
      // the bar to 150 %, the 100 % mark
      const bw = W - 24;
      g.fillStyle = INK.line;
      g.fillRect(x0 + 12, 88, bw, 10);
      g.fillStyle = over ? INK.amber : INK.teal;
      g.fillRect(x0 + 12, 88, Math.min(1, pct / 150) * bw, 10);
      g.fillStyle = INK.text;
      g.fillRect(x0 + 12 + bw / 1.5, 84, 2, 18);
      fitText(g, over ? zs(L, 'kiste.over') : `${zs(L, `kiste.cond.${s.cond}`)} · ${zs(L, 'chip.ha')}`, x0 + 12, 124, W - 24, 13, FONT.sans, over ? INK.amber : INK.text2);
      if (!over) fitText(g, zs(L, 'kiste.load'), x0 + 12, 146, W - 24, 12, FONT.sans, INK.muted);
    });
    gt.tex.needsUpdate = true;
  };
  draw();
  ctx.i18n.onChange(draw);

  // ── the warm-up ─────────────────────────────────────────────────────────
  const crate = bodies.find((b) => b.kg === 18)!.h;
  const warm = { tried: [] as string[], done: ctx.progress.get<boolean>('kisteWarm', false) };
  const warmFns: ((onFanuc: boolean) => void)[] = [];
  let restT = 0;
  let restOn: PostId | null = null;
  let redrawT = 0;
  const overSaid = new Set<PostId>();

  const _v = new THREE.Vector3();
  return {
    update(dt) {
      let changed = false;
      for (const id of posts) {
        let kg = 0;
        for (const b of on[id]) if (!b.held) kg += b.mass;
        loads[id] = kg;
        const prev = shown[id];
        shown[id] += (kg - shown[id]) * Math.min(1, dt * KISTENWAAGE.gaugeEase);
        if (Math.abs(shown[id] - prev) > 0.02) changed = true;
        if (kg > SPEC[id].kg && !overSaid.has(id)) {
          overSaid.add(id);
          const [px, pz] = KISTEN.posts[id];
          ctx.game.juice.popup([px, KISTEN.plateY + 0.9, pz], zs(ctx.i18n.lang, 'kiste.over'), { tone: 'accent', seconds: 3.2 });
          ctx.game.juice.cue('oops', { at: [px, 1, pz], volume: 0.7 });
        }
        if (kg <= SPEC[id].kg) overSaid.delete(id);
      }
      redrawT += dt;
      if (changed && redrawT > 0.08) {
        redrawT = 0;
        draw();
      }
      // the crate resting on a plate (not held, slow) for a moment: a try of the warm-up
      const at = posts.find((id) => on[id].has(crate)) ?? null;
      const still = !crate.held && crate.velocity(_v).length() < 0.15;
      if (at && still) {
        if (restOn !== at) {
          restOn = at;
          restT = 0;
        }
        restT += dt;
        if (restT > KISTENWAAGE.settleS && !warm.tried.includes(at)) {
          warm.tried.push(at);
          const [px, pz] = KISTEN.posts[at];
          ctx.game.juice.popup([px, KISTEN.plateY + 1.1, pz], `+18 kg`, { tone: at === 'fanuc-r2000ic-165f' ? 'good' : 'accent' });
          if (!warm.done) {
            warm.done = true;
            ctx.progress.set('kisteWarm', true);
            for (const f of warmFns) f(at === 'fanuc-r2000ic-165f');
          }
        }
      } else {
        restOn = null;
        restT = 0;
      }
    },
    loads,
    warm,
    onWarmDone(fn) {
      warmFns.push(fn);
    },
    place(post, kg) {
      const b = bodies.find((x) => x.kg === kg);
      if (!b) return;
      const [px, pz] = KISTEN.posts[post];
      b.h.setPosition([px, KISTEN.plateY + 0.3, pz]);
    },
    reset() {
      for (const b of bodies) b.h.reset();
    },
  };
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // tiny helper: the three gauge planes into one geometry (same attributes)
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const u = g.getAttribute('uv');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      uv.push(u.getX(i), u.getY(i));
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
    base += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}
export type { RobotId };
