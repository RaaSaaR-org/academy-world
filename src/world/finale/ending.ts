import type { Masts } from '../masts';
import { ZONE_PLOTS } from '../layout';
import { openCertificate } from './certificate';
import { drawLectern } from './f3';
import { S } from './strings';
import type { FinaleEnv } from './types';

/**
 * The ending after the lift-off (GDD §6.6; Phase 7 plan §4.15 rows „Dusk“ and „then“, §1.5): the rc4
 * dusk over 20 s (the sun 16° → 3°, the position lights), EMI-01's two lines, the banner
 * „Messung statt Marketing.“, and the certificate on the Ausguck. Dusk is NOT drawn here: the finale
 * emits `finale:dusk` with { t } from 0 (day) to 1 (full dusk) and src/world/dusk.ts listens. Reduced
 * motion: the same colour blend (no motion in it). After the first flight the island is yours in the
 * air; a replay („Start wiederholen“, „Abheben ansehen“) ends with the saved sky and opens no
 * certificate. The tower's sweep (`finale:ended`) plays in the climb (C2), not here.
 */

export const DUSK_S = 20;

export interface EndingOptions {
  /** the first flight: dusk, lines, banner and the certificate */
  first: boolean;
  /** the first flight's dusk always plays; a replay follows the saved sky (TAG ↔ ABEND) */
  dusk: boolean;
}

export function playEnding(env: FinaleEnv, masts: Masts | null, o: EndingOptions): Promise<void> {
  const { ctx } = env;
  env.busy = true;
  ctx.hud.setObjective(null);
  let duskT = o.dusk ? 0 : 1;
  if (o.dusk) {
    ctx.events.emit('finale:dusk', { t: 0 });
    env.tick((dt) => {
      duskT = Math.min(1, duskT + dt / DUSK_S);
      ctx.events.emit('finale:dusk', { t: duskT });
      return duskT < 1;
    });
  }
  if (o.first) {
    env.state.ended = true;
    env.save();
  }
  // the first flight sets the evening (the sky switch, the stand); a replay keeps the saved sky
  if (o.first) env.onEnded?.();
  const emi = env.emi();
  if (emi) void emi.gesture('wave');
  // the six gate beacons turn teal one by one: six zones, measured (the rc4 notes, softer)
  const notes = [0, 1, 3, 6, 2, 7];
  ZONE_PLOTS.forEach((z, i) =>
    ctx.after(1.2 + i * 0.5, () => {
      masts?.setState(z.id, 'visited');
      if (o.first) ctx.audio.tone({ freq: 220 * Math.pow(2, (notes[i] + 12) / 12), dur: 0.5, type: 'sine', volume: 0.4 });
    }),
  );
  if (!o.first) {
    env.busy = false;
    ctx.hud.setObjective(S.objDone);
    ctx.after(10, () => ctx.events.emit('objective:request'));
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    ctx.after(2.2, () => void env.say([S.endLine, S.endLine2], 4.5));
    ctx.after(12, () => {
      ctx.hud.banner(S.endBannerEyebrow, S.endBannerTitle);
      ctx.audio.play('success', { volume: 0.5 });
    });
    // let the dusk finish (and the banner breathe) before the certificate covers the view
    const t0 = ctx.time.elapsed;
    const wait = (): void => {
      if (duskT >= 1 && ctx.time.elapsed - t0 > 14.5) {
        env.busy = false;
        // a certificate a tool already opened stays the only one
        const open = ctx.hud.modalOpen ? Promise.resolve() : openCertificate(env, () => drawLectern(env));
        resolve();
        void open.then(() => {
          ctx.hud.setObjective(S.objDone);
          ctx.after(12, () => ctx.events.emit('objective:request'));
        });
      } else ctx.after(0.25, wait);
    };
    wait();
  });
}
