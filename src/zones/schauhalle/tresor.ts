/**
 * The Tresor (plan §4.9, R4 §7.3, D21): the Unitree H2 under a white cover on a lit plinth in front of the
 * north window, visible from the north spoke. Its card is readable from the start (no learning sits
 * behind a gate); only the unveiling is the trophy. When the H2 is earned (ctx.quest mastery.h2Earned,
 * the Meisterprüfung in the Traumhangar) the cover lifts off once, in front of you, and the hall calls
 * ctx.quest.unveilH2() (D21). Reduced motion: the cover is simply gone.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { TRESOR } from './layout';
import type { Showroom } from './showroom';
import { zs } from './sheet';

export interface Tresor {
  readonly unveiled: boolean;
  /** play the unveiling now (when earned; the debug hook forces it) */
  unveil(force?: boolean): boolean;
  update(dt: number): void;
}

export function buildTresor(ctx: ZoneContext, show: Showroom, o: { say(line: string): void; delivered(id: string): void }): Tresor {
  const [x, z] = TRESOR.at;
  const top = 0.16;
  // the cover: a lathe of a draped figure, wrinkled by a little noise
  const prof: THREE.Vector2[] = [];
  const pts: [number, number][] = [
    [0.5, 0],
    [0.47, 0.25],
    [0.4, 0.8],
    [0.36, 1.2],
    [0.42, 1.42],
    [0.36, 1.52],
    [0.2, 1.6],
    [0.17, 1.72],
    [0.15, 1.86],
    [0.06, 1.95],
    [0.0, 1.96],
  ];
  for (const [r, y] of pts) prof.push(new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(prof, 40);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i),
      py = pos.getY(i),
      pz = pos.getZ(i);
    const a = Math.atan2(pz, px);
    const k = 1 + 0.06 * Math.sin(a * 7 + py * 2.3) * Math.min(1, (1.6 - py) * 1.5) * (py < 1.6 ? 1 : 0.2);
    pos.setXYZ(i, px * k, py, pz * k);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xf4f2ef, roughness: 0.88, metalness: 0, transparent: true, opacity: 1, name: 'schauhalle:cover' });
  const cover = new THREE.Mesh(geo, mat);
  cover.name = 'schauhalle:h2-cover';
  cover.position.set(x, top, z);
  cover.castShadow = true;
  cover.receiveShadow = true;
  ctx.groups.detail.add(cover);
  ctx.onDispose(() => {
    geo.dispose();
    mat.dispose();
  });
  // the Tresor's own light (one of the hall's two local lights, R4 §7.3)
  ctx.lights.point([x, 3.2, z + 1.2], { color: 0xfff1e0, intensity: 6, distance: 7 });

  let unveiled = ctx.quest.snapshot().mastery.h2Unveiled;
  let anim = -1;
  if (unveiled) {
    cover.visible = false;
    show.setShown('unitree-h2', true);
  }
  const earned = (): boolean => ctx.quest.snapshot().mastery.h2Earned;

  const finish = (): void => {
    cover.visible = false;
    anim = -1;
  };
  const api: Tresor = {
    get unveiled() {
      return unveiled;
    },
    unveil(force = false) {
      if (unveiled || (!force && !earned())) return false;
      unveiled = true;
      ctx.quest.unveilH2();
      show.setShown('unitree-h2', true);
      ctx.game.juice.burst([x, 1.2, z], { tone: 'teal', count: 40, spread: 1.2 });
      ctx.game.juice.cue('star', { at: [x, 1.4, z] });
      [523, 659, 784, 1046].forEach((f, i) => ctx.after(0.12 * i, () => ctx.audio.tone({ freq: f, dur: 0.5, type: 'triangle', volume: 0.45, at: [x, 2, z] })));
      ctx.hud.toast(ctx.i18n.text('tresor.toast'), { kind: 'success', duration: 4 });
      o.say(zs(ctx.i18n.lang, 'tresor.unveil'));
      o.delivered('unitree-h2');
      if (ctx.settings.reducedMotion) finish();
      else anim = 0;
      return true;
    },
    update(dt) {
      if (anim >= 0) {
        anim += dt;
        const t = Math.min(1, anim / 2.4);
        const e = t * t * (3 - 2 * t);
        cover.position.y = top + e * 2.6;
        cover.rotation.y = e * 0.6;
        cover.scale.setScalar(1 + e * 0.15);
        mat.opacity = 1 - Math.max(0, (t - 0.5) * 2);
        if (t >= 1) finish();
      } else if (!unveiled && ctx.playerInside && earned()) {
        // earned elsewhere: the cover comes off once you are in the hall to see it
        const p = ctx.player.positionLocal();
        if (Math.hypot(p.x - x, p.z - z) < 14) api.unveil();
      }
    },
  };
  return api;
}
