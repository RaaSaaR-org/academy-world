import * as THREE from 'three';
import { TOWER } from '../layout';
import type { FinaleEnv } from './types';

/**
 * After the ending the island keeps its evening: the dusk look (sky, sun, path lamps, tower
 * windows) is restored on reload, and a sky switch on the Ausguck, next to the certificate
 * stand, blends between evening and day (6 s; a quick fade with reduced motion). The choice is
 * stored in the island's progress ('sky': 'dusk' | 'day'). Dusk itself is drawn by
 * src/world/dusk.ts, which listens to `finale:dusk` { t }.
 * Phase 7 (plan §4.15 „State after“, §5.7): dusk exists only airborne. The switch shows only in the
 * air after the first flight; docked again the island is in its day look (the dock switch resets it).
 */
export interface Evening {
  /** the ending's own sunset is running/finished: keep the switch in sync */
  ended(): void;
  /** the flight state changed: show or hide the switch (docked: always day) */
  sync(): void;
  /** t of the last `finale:dusk` (0 = day, 1 = dusk) */
  readonly t: number;
}

const BLEND_S = 6;

/** `beside`: the certificate stand; the switch stands 0.85 m to its right, facing the same way. */
export function buildEvening(env: FinaleEnv, beside: THREE.Object3D): Evening {
  const { ctx, state, tick } = env;
  let t = 0;
  let anim = 0;
  ctx.events.on('finale:dusk', (d: { t?: number } | undefined) => {
    if (d && typeof d.t === 'number' && Number.isFinite(d.t)) t = d.t;
  });
  const blendTo = (to: number, seconds: number): void => {
    const id = ++anim;
    const from = t;
    if (seconds <= 0) {
      ctx.events.emit('finale:dusk', { t: to });
      return;
    }
    let k = 0;
    tick((dt) => {
      if (id !== anim) return false;
      k = Math.min(1, k + dt / seconds);
      const s = k * k * (3 - 2 * k);
      ctx.events.emit('finale:dusk', { t: from + (to - from) * s });
      return k < 1;
    });
  };

  // ── the switch: a small post with a two-position dial, beside the certificate stand ─────
  const post = new THREE.Group();
  const right = new THREE.Vector3(Math.cos(beside.rotation.y), 0, -Math.sin(beside.rotation.y));
  post.position.set(beside.position.x, TOWER.ausguck.y, beside.position.z).addScaledVector(right, 0.85);
  post.rotation.y = beside.rotation.y;
  // Phase 7: in the air after the first flight only
  const shown = (): boolean => ctx.flight.state === 'airborne' && env.flown();
  post.visible = shown();
  ctx.root.add(post);
  const M = ctx.materials;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.0, 0.22), M.standard({ color: 0x24211f, roughness: 0.5, metalness: 0.6 }));
  body.position.y = 0.5;
  post.add(body);
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.05), M.standard({ color: 0x3a3532, roughness: 0.4, metalness: 0.6 }));
  face.position.set(0, 1.04, 0);
  face.rotation.x = -0.5;
  post.add(face);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 20), M.accentTeal);
  dial.rotation.x = Math.PI / 2;
  const dialPivot = new THREE.Group();
  dialPivot.position.set(0, 0, 0.03);
  face.add(dialPivot);
  dialPivot.add(dial);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.075, 0.012), M.standard({ color: 0xf5f5f4, roughness: 0.4 }));
  needle.position.set(0, 0.04, 0.02);
  dialPivot.add(needle);
  ctx.text3d.create({ text: { de: 'TAG', en: 'DAY' }, font: 'mono-medium', size: 0.035, color: 0xa8a29e, anchorX: 'center', anchorY: 'middle', position: [-0.13, 0.07, 0.03] }, face);
  ctx.text3d.create({ text: { de: 'ABEND', en: 'DUSK' }, font: 'mono-medium', size: 0.035, color: 0xa8a29e, anchorX: 'center', anchorY: 'middle', position: [0.13, 0.07, 0.03] }, face);
  ctx.text3d.create({ text: { de: '// HIMMEL', en: '// SKY' }, font: 'mono', size: 0.028, color: 0x78716c, anchorX: 'center', anchorY: 'middle', position: [0, -0.08, 0.03] }, face);
  ctx.onDispose(() => {
    body.geometry.dispose();
    face.geometry.dispose();
    dial.geometry.dispose();
    needle.geometry.dispose();
  });
  const wantDusk = (): boolean => ctx.progress.get<'dusk' | 'day'>('sky', 'dusk') !== 'day';
  const showDial = (): void => {
    dialPivot.rotation.z = wantDusk() ? -0.7 : 0.7;
  };
  showDial();
  const handle = ctx.addInteractable({
    object: body,
    label: (lang) => (wantDusk() ? (lang === 'de' ? 'Himmel: zurück zum Tag' : 'Sky: back to day') : lang === 'de' ? 'Himmel: Abend' : 'Sky: dusk'),
    hint: { de: 'Wechsel in 6 s', en: 'Changes over 6 s' },
    range: 2.4,
    isEnabled: () => shown() && !env.busy,
    onInteract: () => {
      const dusk = !wantDusk();
      ctx.progress.set('sky', dusk ? 'dusk' : 'day');
      showDial();
      ctx.audio.tone({ freq: dusk ? 392 : 523, to: dusk ? 294 : 659, dur: 0.3, type: 'sine', volume: 0.3 });
      blendTo(dusk ? 1 : 0, ctx.settings.reducedMotion ? 0 : BLEND_S);
    },
  });

  // the switch is offered only in the air (tools read the static flag: __academy.interactables)
  handle.setEnabled(shown());
  // reload after the ending: the evening (or the chosen day) is back at once, in the air only
  if (shown() && wantDusk()) blendTo(1, 0);
  void state;
  ctx.events.on('progress:reset', () => {
    anim++;
    post.visible = false;
    if (t > 0) blendTo(0, 0);
  });

  return {
    ended() {
      ctx.progress.set('sky', 'dusk');
      post.visible = shown();
      handle.setEnabled(shown());
      showDial();
    },
    sync() {
      post.visible = shown();
      handle.setEnabled(shown());
      showDial();
    },
    get t() {
      return t;
    },
  };
}
