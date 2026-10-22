/**
 * WP1 — the quest spine's UI wiring (plan §4.1, §5.8): the title states, the telemetry strip, the
 * loading card and the Bodencrew offer, connected to the engine without touching Game.ts. GameLayer
 * calls wireQuestUi(game) once, at the end of its constructor (after the HUD, the title, the zones and
 * ctx.quest exist).
 */
import type { Game } from '../Game';
import type { Mode, Text } from '../types';
import { bindCredits, openCredits } from '@/ui/Credits';
import type { TelemetryState } from '@/ui/Hud';
import { createLoadingCard, type LoadingCardSpec } from '@/ui/Kit';
import { titleState } from './resume';
import { CREW_AFTER_RETRIES, LOADING_GRACE_MS, RETRY_WAIT_MS } from './tuning';
import type { CoreId, QuestSnapshot, RotorId } from './types';

/** The grounded telemetry strip (§4.1): „BODEN · HALTEARME · ROTOREN m/6 · AKKU p % · NAV AUS|BEREIT|BODENCREW“ (FIKTION). */
export function groundTelemetry(s: QuestSnapshot): TelemetryState {
  const pct = Math.round(s.start.energy.charge * 100);
  const nav = s.start.nav;
  const navTxt: Text = nav.state === 'kalt' || nav.state === 'arbeit' ? { key: 'core.quest.telemetry.navOff' } : nav.by === 'crew' ? { key: 'core.quest.telemetry.navCrew' } : { key: 'core.quest.telemetry.navOn' };
  return {
    cells: [
      { key: 'core.quest.telemetry.ground' },
      { key: 'core.quest.telemetry.arms' },
      { key: 'core.quest.telemetry.rotors', params: { m: s.start.lift } },
      { key: 'core.quest.telemetry.akku', params: { p: pct } },
      navTxt,
    ],
  };
}

export function wireQuestUi(game: Game): void {
  const g = game;
  bindCredits({ modals: g.hud.modals, i18n: g.i18n, audio: g.audio });
  // ── the title (§3.6, R5 §3.3) ────────────────────────────────────────────────────────────────
  g.startScreen.attach({
    title: () =>
      titleState({
        params: g.params,
        ascentSeen: g.progress.getZoneValue<boolean>('world', 'ascentSeen', false) === true,
        reducedMotion: g.settings.data.reducedMotion,
        devReload: false,
        lastZone: g.progress.lastZone,
        canResumeAt: () => true,
        hasProgress: g.progress.hasAnyProgress(),
        stamps: g.progress.stamps().length,
      }),
    dock: (mode: Mode) => {
      // D25: the docked state, all progress kept; Start resumes grounded at the last area
      g.quest.setFlight('ground');
      g.beginPlay(mode, true);
    },
    replay: (mode: Mode) => {
      g.beginPlay(mode, true);
      // WP13 plays the lift-off on the Ausguck (stills under reduced motion) and ends airborne
      g.events.emit('liftoff:replay', { from: 'title' });
    },
    credits: () => void openCredits(),
  });
  for (const ev of ['progress:reset', 'mode:changed', 'flight:state']) g.events.on(ev, () => g.phase === 'start' && g.startScreen.refresh());
  // ── the loading card and the Bodencrew offer (§5.8) ──────────────────────────────────────────
  installLoadingCards(g);
}

// ── the loading card and the Bodencrew offer (§5.8) ────────────────────────────────────────────────

/** A system's name in the crew lines: M1–M6, „Startakku“, „Flugmodell“. */
export function systemName(id: string): Text {
  return id === 'AKKU' || id === 'NAV' ? { key: `core.quest.sys.${id}` } : id;
}

/**
 * The Bodencrew offer for an area's ◆ system (§5.8, D23): a rotor, the Startakku or the Flugmodell,
 * when it is not bereit yet. accept() calls quest.groundCrew(id, 'asset'), says EMI-01's line once and
 * toasts „M4 · Bodencrew · ohne Kennlinie“. null for areas whose ◆ starts no gating system (trims).
 */
export function crewOffer(game: Game, areaId: string): { system: Text; accept: () => void } | null {
  const d = game.quest.defs.find((x) => x.areaId === areaId && x.group !== 'trim');
  if (!d) return null;
  const st = game.quest.system(d.id);
  if (st === 'bereit' || st === 'geprueft') return null;
  const system = systemName(d.id);
  return {
    system,
    accept: () => {
      const id = d.id as RotorId | CoreId;
      const first = !game.quest.stored().groundCrew.some((c) => c.id === id);
      game.quest.groundCrew(id, 'asset');
      game.hud.toast({ key: 'core.quest.crewToast', params: { system: game.i18n.resolve(system) } }, { kind: 'info', eyebrow: { key: 'core.quest.crewEyebrow' }, duration: 6 });
      // EMI-01 once per system (§5.8)
      const subject: Text = d.id === 'AKKU' || d.id === 'NAV' ? { key: `core.quest.sysLine.${d.id}` } : d.id;
      if (first) game.events.emit('radio:say', { owner: 'quest', line: () => game.i18n.t('core.quest.crewLine', { system: game.i18n.resolve(subject) }) });
    },
  };
}

interface Failure {
  kind: 'zone' | 'robot';
  /** „Erneut laden“ presses that failed again */
  tries: number;
  /** a retry is under way since (ms), or 0 */
  pending: number;
  robots: Set<string>;
}

/**
 * Shows the one loading card for the area the player stands in when its code or a robot is not ready
 * (WP4's 'zones:failed' / 'robots:failed'), with „Erneut laden“ and, after CREW_AFTER_RETRIES failed
 * retries on a ◆ area, the Bodencrew offer. Area code: ZoneManager.retry(id) (WP4; else the event
 * 'zones:retry' { id }). A robot: the event 'robots:retry' { id, area } — the area that loads it
 * calls ctx.robots.load() again (a new 'robots:failed' counts as a failed retry, silence for
 * RETRY_WAIT_MS as recovered); areas that want their own card use ctx.game.loadingCard().
 */
export function installLoadingCards(game: Game): void {
  const g = game;
  const failed = new Map<string, Failure>();
  const notReadySince = new Map<string, number>();
  let card: { area: string; failed: boolean; handle: ReturnType<typeof createLoadingCard> } | null = null;
  const failure = (area: string, kind: Failure['kind']): Failure => {
    let f = failed.get(area);
    if (!f) failed.set(area, (f = { kind, tries: 0, pending: 0, robots: new Set() }));
    return f;
  };
  const nameOf = (area: string): Text => {
    const rec = g.zones.records.get(area);
    return rec?.manifest?.title ?? rec?.def?.title ?? area;
  };
  const retry = (area: string): void => {
    const f = failed.get(area);
    if (!f) return;
    f.pending = performance.now();
    if (f.kind === 'zone') {
      const zm = g.zones as unknown as { retry?: (id: string) => unknown };
      if (typeof zm.retry === 'function') void Promise.resolve(zm.retry(area)).catch(() => undefined);
      else g.events.emit('zones:retry', { id: area });
    } else for (const id of f.robots) g.events.emit('robots:retry', { id, area });
    refresh(true);
  };
  const spec = (area: string, isFailed: boolean): LoadingCardSpec => {
    const f = failed.get(area);
    return {
      name: nameOf(area),
      state: () => (isFailed && !failed.get(area)?.pending ? 'failed' : 'loading'),
      retry: () => retry(area),
      crew: f && f.tries >= CREW_AFTER_RETRIES ? crewWithHide(area) : null,
    };
  };
  const crewWithHide = (area: string): LoadingCardSpec['crew'] => {
    const offer = crewOffer(g, area);
    if (!offer) return null;
    return {
      system: offer.system,
      accept: () => {
        offer.accept();
        card?.handle.update({ crew: null });
      },
    };
  };
  const inside = (area: string, feet: { x: number; z: number }): boolean => {
    const l = g.zones.records.get(area)?.layout;
    return !!l && Math.hypot(feet.x - l.anchor.x, feet.z - l.anchor.z) <= l.radius;
  };
  function refresh(force = false): void {
    if (g.phase !== 'playing') return hide();
    const feet = g.player.renderFeet;
    const now = performance.now();
    // retries that never answered
    for (const [area, f] of failed) {
      if (!f.pending || now - f.pending < RETRY_WAIT_MS) continue;
      f.pending = 0;
      if (f.kind === 'zone') f.tries++;
      else failed.delete(area);
    }
    let target: { area: string; failed: boolean } | null = null;
    for (const area of failed.keys())
      if (inside(area, feet)) {
        target = { area, failed: true };
        break;
      }
    if (!target)
      for (const rec of g.zones.records.values()) {
        const loading = rec.status === 'pending' || rec.status === 'loading' || rec.status === 'loaded' || rec.status === 'initializing';
        if (!loading) {
          notReadySince.delete(rec.id);
          continue;
        }
        if (!inside(rec.id, feet)) continue;
        const since = notReadySince.get(rec.id) ?? now;
        notReadySince.set(rec.id, since);
        if (now - since >= LOADING_GRACE_MS) {
          target = { area: rec.id, failed: false };
          break;
        }
      }
    if (!target) return hide();
    if (card && card.area === target.area && card.failed === target.failed && !force) return card.handle.update();
    hide();
    card = { ...target, handle: createLoadingCard(g.i18n, spec(target.area, target.failed), g.hud.panelsRoot, g.audio) };
  }
  function hide(): void {
    card?.handle.remove();
    card = null;
  }
  g.events.on('zones:failed', (p?: { id?: string }) => {
    if (!p?.id) return;
    const f = failure(p.id, 'zone');
    if (f.pending) f.tries++;
    f.pending = 0;
    refresh(true);
  });
  g.events.on('robots:failed', (p?: { id?: string; area?: string }) => {
    if (!p?.id || !p.area) return;
    const f = failure(p.area, 'robot');
    f.robots.add(p.id);
    if (f.pending) f.tries++;
    f.pending = 0;
    refresh(true);
  });
  g.events.on('zone:ready', (p?: { id?: string }) => {
    if (p?.id && failed.get(p.id)?.kind === 'zone') failed.delete(p.id);
    refresh(true);
  });
  g.events.on('quest:system', () => card?.handle.update());
  window.setInterval(() => refresh(), 500);
}
