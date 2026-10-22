import type { Lang, Text, ZoneContext } from '@/core/zones';
import { ZONE_PLOTS, bearingOf } from './layout';
import type { RadioApi, RadioSayEvent } from './start/contract';

/**
 * EMI-01 as a radio companion (docs/FUN-PLAN.md §5 C5, C6): heard anywhere on the island, never over
 * a zone EMI (its lines queue behind the subtitles on screen), at most one radio line per 20 s.
 * Triggers: a new Failure-Mode-Album entry (the album banner is engine UI), three stars on a ◆ station, capsules
 * n = 1 / 6 / 12, a new EMI skill, 9/9 question cards. The H key on the plaza adds a capsule hint.
 * Character lines only: no rates, no product claims.
 */
export interface Radio extends RadioApi {
  /** „Ich empfange ein Signal: Richtung …" for the nearest unfound capsule, or null */
  capsuleHint(): Text | null;
}

const L = {
  album: { de: 'Die Panne nehm ich ins Album. Fehler sind auch Daten.', en: 'That failure goes into the album. Mistakes are data too.' },
  core3: { de: 'Drei Sterne an einer Kernstation. So sieht Methode aus.', en: 'Three stars at a core station. That’s what method looks like.' },
  capsule1: {
    de: 'Eine Sensorkapsel! Die Böe hat zwölf verstreut. Jede schaltet ein Positionslicht ein.',
    en: 'A sensor capsule! The gust scattered twelve. Each one switches on a position light.',
  },
  capsule6: { de: 'Sechs Kapseln, sechs Positionslichter. Halbe Strecke.', en: 'Six capsules, six position lights. Halfway there.' },
  capsule12: { de: 'Zwölf von zwölf. Alle Positionslichter brennen.', en: 'Twelve of twelve. Every position light is on.' },
  // FUN-PLAN §6.6: the arm bows after the finale sweep when all 18 lines are lit
  bow: { de: 'Achtzehn von achtzehn. Gemessen, nicht versprochen.', en: 'Eighteen of eighteen. Measured, not promised.' },
  questions: { de: 'Neun von neun Fragenkarten. Jetzt bist du für jedes Verkaufsgespräch gerüstet.', en: 'Nine of nine question cards. You’re ready for any sales pitch now.' },
  skill: {
    sehen: { de: 'Neu gelernt: SEHEN. Ich weiß jetzt, wo meine Sensoren blind sind.', en: 'New skill: SEE. Now I know where my sensors are blind.' },
    regeln: { de: 'Neu gelernt: REGELN. Messen, vergleichen, korrigieren – immer wieder.', en: 'New skill: CONTROL. Measure, compare, correct – again and again.' },
    greifen: { de: 'Neu gelernt: GREIFEN. Fest genug, sanft genug.', en: 'New skill: GRIP. Firm enough, gentle enough.' },
    lernen: { de: 'Neu gelernt: LERNEN – ich mach dir alles nach. Auch die Fehler.', en: 'New skill: LEARN – I copy everything you do. Mistakes included.' },
    arbeiten: { de: 'Neu gelernt: ARBEITEN. Die schweren Posten zuerst.', en: 'New skill: WORK. The heavy posts first.' },
    messen: { de: 'Neu gelernt: MESSEN. Ohne n und Intervall glaube ich nichts mehr.', en: 'New skill: MEASURE. No n, no interval, no belief.' },
  } as Record<string, Text>,
  signal: { de: 'Ich empfange ein Signal: Richtung', en: 'I’m picking up a signal: towards' },
  up: { de: 'hoch', en: 'up high' },
  down: { de: 'unten', en: 'down below' },
  out: { de: 'draußen', en: 'out at the edge' },
  tower: { de: 'Turm', en: 'the tower' },
};

const GAP_S = 20;

export function buildRadio(ctx: ZoneContext): Radio {
  const speaker = (lang: Lang): string => (lang === 'de' ? 'EMI-01 › Funk' : 'EMI-01 › radio');
  const queue: Text[] = [];
  let last = -1e9;
  let timer: (() => void) | null = null;
  // quiet in the Kielraum (the finale talks there) and through the ending; stale lines are dropped
  // when the ending starts, so no „drei Sterne“ line from an hour ago plays over the sunset
  let holdUntil = -1;
  ctx.events.on('finale:ended', () => {
    queue.length = 0;
    holdUntil = ctx.time.elapsed + 45;
  });
  const quiet = (): boolean => ctx.player.position.y < -20 || ctx.time.elapsed < holdUntil;
  const pump = (): void => {
    timer = null;
    if (!queue.length) return;
    if (quiet()) {
      timer = ctx.after(3, pump);
      return;
    }
    const wait = last + GAP_S - ctx.time.elapsed;
    if (wait > 0) {
      timer = ctx.after(wait + 0.05, pump);
      return;
    }
    const line = queue.shift()!;
    last = ctx.time.elapsed;
    ctx.audio.tone({ freq: 880, to: 1320, dur: 0.12, type: 'sine', volume: 0.6 });
    // queued, never interrupting: a zone EMI that is talking finishes first
    void ctx.hud.say([{ speaker, text: line }]);
    if (queue.length && !timer) timer = ctx.after(GAP_S, pump);
  };
  const radio = (line: Text, delay = 1.2): void => {
    if (queue.length >= 3) queue.shift(); // keep it current: drop the oldest
    queue.push(line);
    if (!timer) timer = ctx.after(delay, pump);
  };

  // the album banner itself is engine UI (GameLayer); EMI-01 comments over the radio
  ctx.events.on('album:unlocked', () => radio(L.album, 2.4));
  ctx.events.on('challenge:result', (p: { key: string; zoneId: string; id: string; station: boolean; newStars: boolean; best: number }) => {
    if (!p.station || !p.newStars || p.best !== 3) return;
    const st = ctx.zones.list().find((z) => z.id === p.zoneId)?.stations.find((s) => s.id === p.id);
    if (st?.star) radio(L.core3, 6);
  });
  // the first capsule usually lies on the arrival path: its line waits for the dock radio line
  let arrivedAt = -1;
  ctx.events.on('world:arrived', () => (arrivedAt = ctx.time.elapsed));
  ctx.events.on('collectible:found', (p: { n: number }) => {
    if (p.n === 1) radio(L.capsule1, arrivedAt < 0 ? 6 : Math.max(0.6, arrivedAt + 6.5 - ctx.time.elapsed));
    else if (p.n === 6) radio(L.capsule6, 1.5);
    else if (p.n === 12) radio(L.capsule12, 1.5);
  });
  ctx.events.on('emi:skill', (p: { id: string }) => {
    const line = L.skill[p.id];
    if (line) radio(line, 9); // after the stamp banner and the zone EMI's reaction
  });
  // the sweep's 'done' also covers reduced motion (no bow there); once per session
  let bowSaid = false;
  ctx.events.on('logo:sweep', (p: { phase: string; earned: number }) => {
    if (p.phase !== 'done' || p.earned < 18 || bowSaid) return;
    bowSaid = true;
    radio(L.bow, 0.8);
  });
  ctx.events.on('question:awarded', () => {
    if (ctx.pass.questions().length === 9) radio(L.questions, 4);
  });
  // Phase 7 (WP12 contract, src/world/start/contract.ts): zones and packages put a line on the radio
  ctx.events.on('radio:say', (p: RadioSayEvent) => radio(p.line, p.delay));

  return {
    say: (_owner, line, o = {}) => radio(line, o.delay),
    capsuleHint() {
      const from = ctx.player.position;
      const near = ctx.game.collectibles.nearestUnfound(from);
      if (!near?.world) return null;
      const [x, y, z] = near.world;
      // the sector by bearing from the island centre; height and radius add hoch / unten / draußen
      const r = Math.hypot(x, z);
      const cb = bearingOf(x, z);
      let zone: { de: string; en: string } = L.tower;
      if (r > 30) {
        let best = Infinity;
        for (const p of ZONE_PLOTS) {
          const d = Math.abs(((p.bearing - cb + 540) % 360) - 180);
          if (d < best) {
            best = d;
            zone = p.name;
          }
        }
      }
      const extra = y > from.y + 5 ? L.up : y < from.y - 5 ? L.down : r > 84 ? L.out : null;
      return (lang: Lang) => `${lang === 'de' ? L.signal.de : L.signal.en} ${lang === 'de' ? zone.de : zone.en}${extra ? `, ${lang === 'de' ? extra.de : extra.en}` : ''}.`;
    },
  };
}

