import * as THREE from 'three';
import type { Game } from '@/core/Game';
import type { Scope } from '@/core/Scheduler';
import { toVec3, type Text, type Vec3Input } from '@/core/types';
import type { EmiHandle, InfoCardSpec, SecretDef } from '@/core/zones';
import type { ChallengeDef, ChallengeHandle, ChallengeResult, SkillId, Stars, ZoneGame } from '@/core/zones/types';
import type { StampScope } from '@/core/quest/types';
import { crewOffer, groundTelemetry, wireQuestUi } from '@/core/quest/wire';
import { createLoadingCard } from '@/ui/Kit';
import { Progress } from './Progress';
import { Particles } from './Juice';
import { Capsules } from './Capsules';
import { Secrets } from './Secrets';
import { markUnattended } from '@/core/DebugApi';
import { storageWorks } from '@/core/storage';
import { ResultUi, type BannerModel } from '@/ui/ResultUi';
import type { PassGame } from '@/ui/PassPanel';

/** EMI-01's six skills, one per zone (docs/FUN-PLAN.md §5 C6). */
export const SKILLS: readonly { id: SkillId; zoneId: string }[] = [
  { id: 'sehen', zoneId: 'sensordom' },
  { id: 'regeln', zoneId: 'regelgarten' },
  { id: 'greifen', zoneId: 'greifwerkstatt' },
  { id: 'lernen', zoneId: 'lern-dojo' },
  { id: 'arbeiten', zoneId: 'dunkelfabrik' },
  { id: 'messen', zoneId: 'prueffeld' },
];

/** stamp + result within this window → one merged banner */
const MERGE_MS = 1500;
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

interface Entry {
  key: string;
  zoneId: string;
  id: string;
  def: ChallengeDef;
  handle: ChallengeHandle;
  /** an attempt was counted by begin() and not yet finished */
  begun: boolean;
}

interface PendingStamp {
  key: string;
  title: Text;
  earned: number;
  noteHz: number;
  timer: number;
  at: number;
}

const devZone = (zoneId: string): boolean => zoneId.startsWith('_');

/**
 * The game layer behind `ctx.game` (docs/FUN-PLAN.md §4): challenge registry and records,
 * the merged stamp/result banner, fail flash, countdown, juice (particles, popups, pulse, cues),
 * Sensorkapseln and EMI skills. One instance per Game; every ZoneContext gets a view of it.
 */
export class GameLayer {
  readonly entries = new Map<string, Entry>();
  readonly ui: ResultUi;
  readonly particles: Particles;
  readonly capsules: Capsules;
  /** Phase 7 (WP1 contract stub): ctx.game.secrets, shared by every zone */
  readonly secrets: Secrets;
  private pending = new Map<string, PendingStamp>();
  private recent = new Map<string, { at: number; model: BannerModel }>();
  private emiSaid = new WeakMap<EmiHandle, { result: number; fail: number }>();
  private lastLogoStart: { index: number; at: number } | null = null;
  private warned = new Set<string>();

  constructor(private game: Game) {
    const g = game;
    this.secrets = new Secrets({
      events: g.events,
      store: g.progress,
      openCard: (spec) => void g.infoCards.open(spec, { requested: true }),
      onFound: (def, n, total, at) => this.onSecret(def, n, total, at),
    });
    this.ui = new ResultUi(
      g.i18n,
      () => g.settings.data.reducedMotion,
      (i) => g.audio.cue('star', { pitch: 1 + 0.12 * i, volume: 0.9 }),
      () => (g.player ? g.player.renderFeet : null),
    );
    for (const el of this.ui.elements) g.hud.root.appendChild(el);
    // contract (W4): EMI's queue ran empty and the last line has finished
    g.hud.dialogue.onIdle = () => g.events.emit('dialogue:idle');
    // D14 (F3): the three volumes and the text size (the engine applies the master volume)
    const applyD14 = (): void => {
      const S = g.settings.data;
      g.audio.setGroupVolume('atmo', S.volAtmo);
      g.audio.setGroupVolume('effects', S.volEffects);
      g.audio.setGroupVolume('emi', S.volEmi);
      g.hud.setTextScale(S.textScale);
    };
    applyD14();
    // UXA-12: once per visit, when the browser keeps nothing
    g.events.once('game:start', () => {
      if (!storageWorks()) g.hud.toast({ key: 'core.start.noStorage' }, { kind: 'warn', duration: 9 });
      // plan §3.5 rule 2: a save the boot could not read runs in memory (the console says why)
      else if (g.progress.readOnly && import.meta.env.DEV) g.hud.toast({ key: 'core.save.readOnly' }, { kind: 'warn', duration: 9 });
    });
    g.events.on('settings:changed', ({ key }: { key: string }) => {
      if (key === 'volAtmo' || key === 'volEffects' || key === 'volEmi' || key === 'textScale') applyD14();
    });
    this.particles = new Particles(g.rs.scene);
    this.capsules = new Capsules(
      g.rs.scene,
      (id) => g.progress.collectibles().includes(id),
      () => g.settings.data.reducedMotion,
    );
    this.capsules.onPickup = (c) => this.onCapsule(c.id, c.pos);

    g.events.on('stamp:awarded', (p: { id: string; n: number; skipped: boolean; upgraded?: boolean; earned?: number }) => this.onStamp(p));
    // the tower draws an element (ART-V2 §5.9 / FUN-PLAN §6.3): a soft laser hiss while it draws, then
    // the element's Recamán note at −12 dB (the stamp itself already played it at full level)
    // (not positional: the whole island sees the tower; the player may stand 150 m away)
    let stopHiss: (() => void) | null = null;
    g.events.on('logo:element', (p: { index: number; phase: string }) => {
      if (p.phase === 'done') {
        stopHiss?.();
        stopHiss = null;
        g.audio.tone({ freq: Progress.stampNote(p.index + 1) * 2, dur: 0.6, type: 'triangle', volume: 0.45 });
        return;
      }
      if (p.phase !== 'start') return;
      stopHiss?.();
      const mine = g.audio.hiss({ volume: 0.7 });
      stopHiss = mine;
      window.setTimeout(() => {
        mine(); // safety: never hiss on if a 'done' goes missing
        if (stopHiss === mine) stopHiss = null;
      }, 6000);
      this.lastLogoStart = { index: p.index, at: performance.now() };
      const m = this.ui.bannerModel;
      if (m?.stamp && m.stamp.lookHint && m.stamp.earned - 1 === p.index) {
        m.stamp.lookHint = false;
        this.ui.refreshBanner();
      }
    });
    g.events.on('progress:reset', () => {
      this.ui.closeBanner();
      this.ui.closeFail();
      this.ui.setTimer(null);
      this.ui.setLive(null);
      for (const e of this.entries.values()) this.ui.refreshChips(e.key);
    });
    g.events.on('mode:changed', () => this.ui.refreshBanner());
    // Phase 7 (WP1): the title states, the loading card, the Bodencrew offer (src/core/quest/wire.ts)
    wireQuestUi(g);
    // a new Failure-Mode-Album entry is celebrated (FUN-PLAN §4.5 album.banner): „PANNE FÜRS ALBUM · n/6"
    g.events.on('album:unlocked', ({ id }: { id: string }) => {
      const def = g.progress.albumDefs.get(id);
      const n = g.progress.album().length;
      const total = Math.max(6, g.progress.albumDefs.size);
      g.hud.showBanner(g.i18n.t('core.game.album', { n }).replace('/6', `/${total}`), def ? g.i18n.resolve(def.title) : '');
      g.audio.cue('oops', { pitch: 0.85, volume: 0.8 });
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  per-zone view (ctx.game)
  // ════════════════════════════════════════════════════════════════════════

  forZone(zoneId: string, h: { toWorld: (p: Vec3Input, out?: THREE.Vector3) => THREE.Vector3; scope: Scope; isAway: () => boolean }): ZoneGame {
    const g = this.game;
    // a disposed zone: its capsules go, its challenges keep their records and why() (the Pass), but
    // lose the EMI and retry that belonged to the dead scope
    h.scope.add(() => {
      this.capsules.removeOwner(zoneId);
      for (const e of this.entries.values()) if (e.zoneId === zoneId) e.def = { ...e.def, emi: undefined, retry: undefined };
    });
    const worldOf = (at: Vec3Input | THREE.Object3D, out = new THREE.Vector3()): THREE.Vector3 =>
      (at as THREE.Object3D).isObject3D ? (at as THREE.Object3D).getWorldPosition(out) : h.toWorld(at as Vec3Input, out);
    const rm = (): boolean => g.settings.data.reducedMotion;
    return {
      challenge: (def) => this.register(zoneId, def),
      juice: {
        burst: (at, o = {}) => {
          if (h.isAway()) return;
          this.particles.burst(worldOf(at), { ...o, reducedMotion: rm() });
        },
        popup: (at, text, o = {}) => {
          if (h.isAway()) return;
          const target = (at as THREE.Object3D).isObject3D ? (at as THREE.Object3D) : h.toWorld(at as Vec3Input);
          g.hud.labels.popup(target, g.i18n.resolve(text), { tone: o.tone ?? 'good', seconds: o.seconds, rise: !rm() });
        },
        pulse: (tone, strength) => {
          if (!h.isAway()) this.ui.pulse(tone, strength);
        },
        cue: (name, o = {}) => {
          if (!o.at && h.isAway()) return;
          g.audio.cue(name, { pitch: o.pitch, volume: o.volume, at: o.at ? h.toWorld(o.at) : undefined });
        },
        countdown: (o = {}) => this.countdown(o.from ?? 3),
      },
      collectibles: {
        place: (o) => this.capsules.place(zoneId, o.id, h.toWorld(o.position), o.radius ?? 1.2),
        found: () => g.progress.collectibles(),
        has: (id) => g.progress.collectibles().includes(id),
        total: () => this.capsules.total(),
        nearestUnfound: (from) => {
          const v = toVec3(from);
          return this.capsules.nearestUnfound(new THREE.Vector3(v.x, v.y, v.z));
        },
      },
      skills: {
        list: () => this.skills(),
        has: (id) => this.skills().some((s) => s.id === id && s.unlocked),
      },
      stars: (z?: string | { scope?: StampScope }) => this.stars(z),
      // plan §3.4: 'island' (default) = the 18 island stamps; 'all' = every area with registered stamps
      progress: (o) => this.summary(o),
      secrets: this.secrets,
      unattended: (on, label) => markUnattended(zoneId, on, g.time.elapsed, label),
      loadingCard: (spec) => {
        const card = createLoadingCard(g.i18n, spec, g.hud.panelsRoot, g.audio);
        // like the zone's other HUD cards: hidden while the player is away from the zone
        const entry = { el: card.el, isAway: h.isAway };
        this.zoneCards.add(entry);
        const remove = card.remove;
        card.remove = () => {
          this.zoneCards.delete(entry);
          remove();
        };
        h.scope.add(() => card.remove());
        return card;
      },
      crewOffer: () => crewOffer(g, zoneId),
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  challenges
  // ════════════════════════════════════════════════════════════════════════

  private register(zoneId: string, def: ChallengeDef): ChallengeHandle {
    const key = `${zoneId}.${def.id}`;
    const old = this.entries.get(key);
    if (old) {
      old.def = def;
      this.ui.refreshChips(key);
      return old.handle;
    }
    if (def.station !== false && !this.game.progress.stampDefs.has(key) && !this.warned.has(key)) {
      this.warned.add(key);
      console.warn(`[game] challenge "${key}" is not a station of zone "${zoneId}" — pass station: false for extra challenges`);
    }
    const P = this.game.progress;
    const self = this;
    const entry: Entry = {
      key,
      zoneId,
      id: def.id,
      def,
      begun: false,
      handle: {
        key,
        get stars() {
          return (P.challengeRecord(key)?.stars ?? 0) as Stars;
        },
        get best() {
          return P.challengeRecord(key)?.best ?? null;
        },
        get attempts() {
          return P.challengeRecord(key)?.attempts ?? 0;
        },
        begin: (o = {}) => self.begin(entry, o),
        live: (text) => {
          if (text != null) self.attemptOwner = entry;
          self.ui.setLive(text);
        },
        submit: (value, o = {}) => self.submit(entry, value, o),
        fail: (reason) => self.fail(entry, reason),
        chips: () => self.ui.chips(key, () => entry.def, () => (P.challengeRecord(key)?.stars ?? 0) as Stars),
      },
    };
    this.entries.set(key, entry);
    return entry.handle;
  }

  private isStation(e: Entry): boolean {
    return e.def.station !== false && this.game.progress.stampDefs.has(e.key);
  }

  private async begin(e: Entry, o: { countdown?: boolean; timer?: { seconds: number; label?: Text } }): Promise<void> {
    const g = this.game;
    if (this.ui.bannerKey) this.ui.closeBanner();
    this.ui.closeFail();
    this.ui.setLive(null);
    this.ui.setTimer(null);
    if (!e.begun) g.progress.countAttempt(e.key);
    e.begun = true;
    this.attemptOwner = e;
    g.events.emit('challenge:begin', { key: e.key, zoneId: e.zoneId, id: e.id });
    if (o.countdown) await this.countdown(3);
    if (g.zones.isAway(e.zoneId)) return; // left during the countdown: no clock across the island
    this.attemptOwner = e;
    if (o.timer) this.ui.setTimer(o.timer.seconds, o.timer.label ?? null);
  }

  /** C12b: the challenge whose run clock / live value shows in the attempt bar */
  private attemptOwner: Entry | null = null;

  private countdown(from: number): Promise<void> {
    const g = this.game;
    return this.ui.countdown(from, (name, step) => g.audio.cue(name, name === 'tick' ? { pitch: 1 + 0.08 * step, volume: 0.9 } : {}));
  }

  /** stars from the goals' thresholds: star i counts only when goals 0…i are all met */
  private computeStars(def: ChallengeDef, value: number | null): Stars {
    const better = def.metric?.better ?? 'higher';
    let s = 0;
    for (let i = 0; i < 3; i++) {
      const goal = def.goals[i];
      let met: boolean;
      if (goal.at == null) met = i === 0;
      else met = value != null && (better === 'higher' ? value >= goal.at : value <= goal.at);
      if (!met) break;
      s = i + 1;
    }
    return s as Stars;
  }

  private submit(e: Entry, value: number | null, o: { stars?: Stars; detail?: Text; quiet?: boolean }): ChallengeResult {
    const g = this.game;
    const def = e.def;
    if (!e.begun) g.progress.countAttempt(e.key);
    e.begun = false;
    const stars = (o.stars != null ? Math.max(0, Math.min(3, Math.round(o.stars))) : this.computeStars(def, value)) as Stars;
    const res = g.progress.recordChallenge(e.key, value, def.metric?.better ?? 'higher', stars);
    this.ui.setTimer(null);
    this.ui.setLive(null);
    this.ui.refreshChips(e.key);
    const station = this.isStation(e);
    g.events.emit('challenge:result', {
      key: e.key,
      zoneId: e.zoneId,
      id: e.id,
      station,
      value: res.value,
      stars: res.stars,
      best: res.best,
      prevStars: res.prevStars,
      newStars: res.newStars,
      personalBest: res.personalBest,
      bestValue: res.bestValue,
    });
    if (res.newStars) {
      const sum = this.summary();
      g.events.emit('stars:changed', { zoneId: e.zoneId, id: e.id, stars: res.best, total: sum.stars, max: sum.maxStars });
    }
    if (o.quiet) return res;
    // a delayed result from a zone the player has left: persist, but no banner across the island
    if (g.zones.isAway(e.zoneId)) return res;
    const model = this.buildModel(e, res, o.detail ?? null);
    const pend = this.pending.get(e.key);
    if (pend) {
      window.clearTimeout(pend.timer);
      this.pending.delete(e.key);
      model.stamp = { title: pend.title, earned: pend.earned, lookHint: false };
      this.armLookHint(model);
      g.audio.stamp(pend.noteHz);
      g.hud.logToast(`${g.i18n.t('core.hud.stampEarned')}: ${g.i18n.resolve(pend.title)}`);
    }
    this.recent.set(e.key, { at: performance.now(), model });
    this.ui.showBanner(model);
    if (res.personalBest) window.setTimeout(() => g.audio.cue('pb', { volume: 0.9 }), (model.stamp ? 0.5 : 0.18) * 1000 + res.stars * 280 + 120);
    else if (res.stars === 0) g.audio.cue('bad', { volume: 0.8 });
    this.react(e, res);
    return res;
  }

  private buildModel(e: Entry, res: ChallengeResult, detail: Text | null): BannerModel {
    const g = this.game;
    const def = e.def;
    const P = g.progress;
    const stampDef = P.stampDefs.get(e.key);
    const man = g.zones.manifests({ kind: 'all' }).find((z) => z.id === e.zoneId);
    const idx = man ? man.stations.findIndex((s) => s.id === e.id) : -1;
    const core = !!stampDef?.star || !!man?.stations[idx]?.star;
    const eyebrow: Text = () => {
      const parts: string[] = [];
      if (man?.number != null) parts.push(String(man.number).padStart(2, '0'));
      if (idx >= 0) parts.push(LETTERS[idx] + (core ? ' ◆' : ''));
      parts.push(g.i18n.resolve(stampDef?.title ?? def.title).toUpperCase());
      return `// ${parts.join(' · ')}`;
    };
    const why = def.why;
    return {
      key: e.key,
      eyebrow,
      def,
      result: res,
      detail,
      attempts: P.challengeRecord(e.key)?.attempts ?? 0,
      stamp: null,
      befund: core && P.mode === 'entscheider' && !!why,
      onRetry: def.retry
        ? () => {
            this.ui.closeBanner();
            this.ui.closeFail();
            this.safe(() => e.def.retry?.(), 'retry');
          }
        : null,
      onWhy: why ? () => this.openWhy(e) : null,
      onBefund: why ? () => this.openBefund(e) : null,
    };
  }

  private safe(fn: () => void, what: string): void {
    try {
      fn();
    } catch (err) {
      console.error(`[game] ${what} threw`, err);
    }
  }

  /** The former auto card, opened on request ([H] in the banner, the Pass). */
  openWhy(e: Entry | string): boolean {
    const entry = typeof e === 'string' ? this.entries.get(e) : e;
    if (!entry?.def.why) return false;
    let spec: InfoCardSpec;
    try {
      spec = entry.def.why();
    } catch (err) {
      console.error(`[game] why() of "${entry.key}" threw`, err);
      return false;
    }
    this.ui.closeBanner();
    void this.game.infoCards.open(spec, { requested: true });
    return true;
  }

  /** Entscheider: only the decision box of the why card (+ its key numbers). */
  private openBefund(e: Entry): void {
    if (!e.def.why) return;
    let spec: InfoCardSpec;
    try {
      spec = e.def.why();
    } catch (err) {
      console.error(`[game] why() of "${e.key}" threw`, err);
      return;
    }
    const mode = { ...spec, ...(spec.entscheider ?? {}) };
    this.ui.closeBanner();
    const card: InfoCardSpec = {
      eyebrow: { key: 'core.game.banner.befundEyebrow' },
      title: mode.title,
      metrics: mode.metrics,
      illustrative: mode.illustrative,
      illustrativeNote: mode.illustrativeNote,
      forDecisionMakers: mode.forDecisionMakers ?? (Array.isArray(mode.body) ? { body: mode.body } : mode.body),
    };
    void this.game.infoCards.open(card, { requested: true });
  }

  private fail(e: Entry, reason: Text): void {
    const g = this.game;
    if (!e.begun) g.progress.countAttempt(e.key);
    e.begun = false;
    this.ui.setTimer(null);
    this.ui.setLive(null);
    g.events.emit('challenge:fail', { key: e.key, zoneId: e.zoneId, id: e.id });
    if (g.zones.isAway(e.zoneId)) return;
    this.ui.closeBanner();
    this.failKeyMemo = e.key;
    this.ui.fail(reason, g.progress.challengeRecord(e.key)?.attempts ?? 1, !!e.def.retry);
    g.audio.cue('oops', { volume: 0.85 });
    const emi = e.def.emi;
    if (emi) {
      const s = this.emiSaid.get(emi) ?? { result: 0, fail: 0 };
      const now = performance.now();
      if (now - s.fail >= 8000) {
        s.fail = now;
        this.emiSaid.set(emi, s);
        const pool = e.def.lines?.fail?.length ? e.def.lines.fail : [{ key: 'core.game.emi.fail1' }, { key: 'core.game.emi.fail2' }];
        const line = pool[Math.floor(Math.random() * pool.length)];
        this.safe(() => void emi.say(line, { interrupt: true, durationS: 3.5 }), 'emi fail line');
      }
    }
  }

  /** Zone EMI reacts to a result: three stars > personal best (rate-limited, interrupting). */
  private react(e: Entry, res: ChallengeResult): void {
    const emi = e.def.emi;
    if (!emi) return;
    let line: Text | null = null;
    if (res.newStars && res.best === 3) line = e.def.lines?.star3 ?? { key: 'core.game.emi.star3' };
    else if (res.personalBest) line = e.def.lines?.pb ?? { key: 'core.game.emi.pb' };
    if (!line) return;
    const s = this.emiSaid.get(emi) ?? { result: 0, fail: 0 };
    const now = performance.now();
    if (now - s.result < 4000) return;
    s.result = now;
    this.emiSaid.set(emi, s);
    const l = line;
    window.setTimeout(() => this.safe(() => void emi.say(l, { interrupt: true, durationS: 3.5 }), 'emi result line'), 900);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  stamps (merge with results), skills
  // ════════════════════════════════════════════════════════════════════════

  private onStamp(p: { id: string; n: number; skipped: boolean; upgraded?: boolean; earned?: number }): void {
    const g = this.game;
    const P = g.progress;
    const def = P.stampDefs.get(p.id);
    const title: Text = def?.title ?? p.id;
    const note = Progress.stampNote(p.n);
    // EMI skills: a zone's first EARNED stamp
    if (!p.skipped && def && !def.extra) {
      const skill = SKILLS.find((s) => s.zoneId === def.zoneId);
      if (skill && P.earnedInZone(def.zoneId) === 1) g.events.emit('emi:skill', { id: skill.id, zoneId: def.zoneId, n: this.skills().filter((s) => s.unlocked).length });
    }
    if (p.skipped) {
      g.hud.stamp(g.i18n.resolve(title), note, true);
      return;
    }
    const earned = p.earned ?? P.earnedStamps();
    // the result came first (≤ 1.5 s ago): merge the stamp into its banner
    const rec = this.recent.get(p.id);
    if (rec && performance.now() - rec.at <= MERGE_MS && !rec.model.stamp) {
      rec.model.stamp = { title, earned, lookHint: false };
      this.armLookHint(rec.model);
      g.audio.stamp(note);
      g.hud.logToast(`${g.i18n.t('core.hud.stampEarned')}: ${g.i18n.resolve(title)}`);
      this.ui.showBanner(rec.model, { merged: true });
      return;
    }
    // a station with a challenge: wait up to 1.5 s for its result, else the classic stamp
    const entry = this.entries.get(p.id);
    if (entry && this.isStation(entry) && !g.zones.isAway(entry.zoneId)) {
      const old = this.pending.get(p.id);
      if (old) window.clearTimeout(old.timer);
      const pend: PendingStamp = {
        key: p.id,
        title,
        earned,
        noteHz: note,
        at: performance.now(),
        timer: window.setTimeout(() => {
          if (this.pending.get(p.id) !== pend) return;
          this.pending.delete(p.id);
          g.hud.stamp(g.i18n.resolve(title), note, false);
        }, MERGE_MS),
      };
      this.pending.set(p.id, pend);
      return;
    }
    g.hud.stamp(g.i18n.resolve(title), note, false);
  }

  /** „Schau zum Turm." when the tower has not started drawing this element shortly after the stamp. */
  private armLookHint(model: BannerModel): void {
    const st = model.stamp;
    if (!st) return;
    const idx = st.earned - 1;
    const started = (): boolean => !!this.lastLogoStart && this.lastLogoStart.index === idx && performance.now() - this.lastLogoStart.at < 4000;
    window.setTimeout(() => {
      if (this.ui.bannerModel !== model || started()) return;
      st.lookHint = true;
      this.ui.refreshBanner();
    }, 450);
  }

  /** What the Pass reads (src/ui/PassPanel.ts). */
  passView(): PassGame {
    return {
      summary: () => this.summary(),
      challenge: (key) => {
        const e = this.entries.get(key);
        if (!e || e.def.station === false) return null;
        return { goals: e.def.goals.map((g) => g.text), metric: e.def.metric ? { unit: e.def.metric.unit, digits: e.def.metric.digits } : null, hasWhy: !!e.def.why };
      },
      openWhy: (key) => this.openWhy(key),
      skills: () => this.skills(),
      radioLog: () => this.game.hud.dialogue.history.map((l) => ({ speaker: l.speaker, text: l.text })),
      // Phase 7 (plan §4.1): the three systems, every manifest, the archive, the finds
      quest: () => this.game.quest.snapshot(),
      areas: () => this.game.quest.manifests,
      legacy: () => this.game.progress.legacy(),
      finds: () => ({
        found: this.game.progress.secrets(),
        list: this.secrets.list().map((d) => ({ id: d.id, title: d.title, hint: d.hint })),
        openCard: (id) => this.secrets.openCard(id),
      }),
    };
  }

  skills(): { id: SkillId; zoneId: string; unlocked: boolean }[] {
    const P = this.game.progress;
    return SKILLS.map((s) => ({ id: s.id, zoneId: s.zoneId, unlocked: P.earnedInZone(s.zoneId) > 0 }));
  }

  // ════════════════════════════════════════════════════════════════════════
  //  numbers
  // ════════════════════════════════════════════════════════════════════════

  /**
   * station stamp defs of the shipping zones (non-extra, no '_' dev zones). Plan §3.4 scopes: without a
   * zone, 'island' (the default) keeps the areas of kind 'lobe' — the 18 island stations — and 'all'
   * every area with registered stamps.
   */
  private stationDefs(zoneId?: string, scope: StampScope = 'island'): { id: string; zoneId: string; stationId: string }[] {
    const out: { id: string; zoneId: string; stationId: string }[] = [];
    const P = this.game.progress;
    for (const d of P.stampDefs.values()) {
      if (d.extra || devZone(d.zoneId)) continue;
      if (zoneId && d.zoneId !== zoneId) continue;
      if (!zoneId && scope === 'island' && P.areaKind(d.zoneId) !== 'lobe') continue;
      const e = this.entries.get(d.id);
      if (e && e.def.station === false) continue;
      out.push({ id: d.id, zoneId: d.zoneId, stationId: d.id.startsWith(d.zoneId + '.') ? d.id.slice(d.zoneId.length + 1) : d.id });
    }
    return out;
  }

  /**
   * ★ of one zone (`stars('regelgarten')`) or of a scope (`stars()` = `stars({ scope: 'island' })`, the
   * rc4 meaning: max 54; `{ scope: 'all' }` adds every other area with registered stamps). The H2 pool
   * and its threshold are not this: they come from the manifests (src/core/quest/pool.ts).
   */
  stars(z?: string | { scope?: StampScope; zone?: string }): { stars: number; max: number; byStation: Record<string, Stars> } {
    const P = this.game.progress;
    const zoneId = typeof z === 'string' ? z : z?.zone;
    const scope = (typeof z === 'object' ? z?.scope : undefined) ?? 'island';
    const defs = this.stationDefs(zoneId, scope);
    const byStation: Record<string, Stars> = {};
    let stars = 0;
    for (const d of defs) {
      const s = (P.challengeRecord(d.id)?.stars ?? 0) as Stars;
      byStation[zoneId ? d.stationId : d.id] = s;
      stars += s;
    }
    const max = defs.length ? defs.length * 3 : zoneId ? 9 : 54;
    return { stars, max, byStation };
  }

  /** Stamps and ★ of a scope (default 'island': the 18 island stations, as in rc4), capsules, the finale. */
  summary(o: { scope?: StampScope } = {}): { earnedStamps: number; stamps: number; stars: number; maxStars: number; capsules: number; capsulesTotal: number; finaleEnded: boolean } {
    const P = this.game.progress;
    const scope = o.scope ?? 'island';
    const defs = this.stationDefs(undefined, scope);
    const st = this.stars({ scope });
    let earned = 0,
      stamps = 0;
    for (const d of defs) {
      const r = P.stampRecord(d.id);
      if (!r) continue;
      stamps++;
      if (!r.skipped) earned++;
    }
    const finale = P.getZoneValue<{ ended?: boolean } | null>('world', 'finale', null);
    const found = P.collectibles();
    const placed = this.capsules.ids();
    return {
      earnedStamps: earned,
      stamps,
      stars: st.stars,
      maxStars: st.max,
      capsules: placed.length ? placed.filter((id) => found.includes(id)).length : found.length,
      capsulesTotal: placed.length,
      finaleEnded: !!finale?.ended,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  //  capsules
  // ════════════════════════════════════════════════════════════════════════

  private onCapsule(id: string, pos: THREE.Vector3): void {
    const g = this.game;
    if (!g.progress.collect(id)) return;
    const sum = this.summary();
    this.particles.burst(pos, { tone: 'teal', count: 44, spread: 1.1, reducedMotion: g.settings.data.reducedMotion });
    g.audio.cue('collect', { at: pos });
    this.ui.pulse('teal', 0.6);
    g.hud.toast({ key: 'core.game.capsule.toast', params: { n: sum.capsules, total: Math.max(sum.capsulesTotal, sum.capsules) } }, { kind: 'success', eyebrow: { key: 'core.game.capsule.eyebrow' }, duration: 4.5, silent: true });
    g.events.emit('collectible:found', { id, n: sum.capsules, total: sum.capsulesTotal, world: [pos.x, pos.y, pos.z] });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  secrets (R9 §5.1): no new HUD — a toast, a cue, a popup, one radio line
  // ════════════════════════════════════════════════════════════════════════

  private onSecret(def: SecretDef, n: number, total: number, at: { x: number; y: number; z: number } | null): void {
    const g = this.game;
    const pos = at ? new THREE.Vector3(at.x, at.y, at.z) : null;
    if (pos) {
      this.particles.burst(pos, { tone: 'teal', count: 30, spread: 0.8, reducedMotion: g.settings.data.reducedMotion });
      g.hud.labels.popup(pos.clone().setY(pos.y + 0.6), g.i18n.t('core.secrets.popup', { title: g.i18n.resolve(def.title) }), { tone: 'teal', rise: !g.settings.data.reducedMotion });
    }
    g.audio.cue('collect', { at: pos ?? undefined });
    g.hud.toast({ key: 'core.secrets.toast', params: { title: g.i18n.resolve(def.title), n, total } }, { kind: 'success', eyebrow: { key: 'core.secrets.eyebrow' }, duration: 5, silent: true });
    // EMI-01 on the radio (WP12's queue): the secret's own line, else the first find's
    const line = def.radio ?? (n === 1 ? { key: 'core.secrets.first' } : null);
    if (line) g.events.emit('radio:say', { owner: 'secrets', line, delay: 1.5 });
  }

  // ════════════════════════════════════════════════════════════════════════
  //  keys, frame
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Keys while the banner or the fail flash is up (called first by the engine's key routing):
   * R → retry (consumed: the zone's own R does not also fire), H → why() instead of the EMI ask,
   * Enter → close the banner. Any key skips a running countdown (not consumed).
   */
  handleKey(code: string): boolean {
    if (this.ui.countdownActive) this.ui.skipCountdown((name, step) => this.game.audio.cue(name, name === 'tick' ? { pitch: 1 + 0.08 * step } : {}));
    const m = this.ui.bannerModel;
    const failKey = this.ui.failOpen ? this.lastFailKey() : null;
    if (code === 'KeyR') {
      if (m?.onRetry) {
        m.onRetry();
        return true;
      }
      // C6: R closes the banner of a challenge without a retry; the zone's own R still fires
      if (m) this.ui.closeBanner();
      const e = failKey ? this.entries.get(failKey) : null;
      if (e?.def.retry) {
        this.ui.closeFail();
        this.safe(() => e.def.retry?.(), 'retry');
        return true;
      }
      return false;
    }
    if (code === 'KeyH') {
      if (m?.onWhy) {
        m.onWhy();
        return true;
      }
      // C6: H closes a banner without a why card; H still asks EMI
      if (m) this.ui.closeBanner();
      const e = failKey ? this.entries.get(failKey) : null;
      if (e?.def.why) return this.openWhy(e);
      return false;
    }
    if (code === 'Enter' && m) {
      this.ui.closeBanner();
      return true;
    }
    // Funk-Log: Enter with no line on screen repeats EMI's last line (not in operate mode, not during a
    // scripted camera: there Enter belongs to the panel / the skip)
    if (code === 'Enter' && !this.game.operate.isActive && !this.game.player.cameraOverride && this.game.hud.dialogue.repeatLast()) return true;
    return false;
  }

  private failKeyMemo: string | null = null;
  private lastFailKey(): string | null {
    return this.failKeyMemo;
  }

  /**
   * PT-13: a Sensorkapsel within 14 m sends a soft positional sonar ping while the player moves: every
   * 2.6 s at 14 m down to 1 s at 3 m, at most 12 pings per approach (the player has to leave 20 m to hear
   * it again), so a capsule next to a station does not ping through a whole challenge.
   */
  private capPing = { id: '', next: 0, left: 0 };
  private capFeet = new THREE.Vector3();

  private capsuleCue(dt: number, playing: boolean): void {
    const g = this.game;
    const feet = g.player.renderFeet;
    const moved = this.capFeet.distanceTo(feet);
    this.capFeet.copy(feet);
    if (!playing || g.hud.modals.isOpen || !this.capsules.body.visible) return;
    const n = this.capsules.nearestUnfound(feet);
    const P = this.capPing;
    if (!n || n.distance > 20) {
      P.id = '';
      return;
    }
    if (n.id !== P.id) {
      if (n.distance > 14) return;
      P.id = n.id;
      P.next = 0;
      P.left = 12;
    }
    if (n.distance > 14 || P.left <= 0 || moved / Math.max(dt, 1e-3) < 0.5) return;
    P.next -= dt;
    if (P.next > 0) return;
    P.next = THREE.MathUtils.lerp(1, 2.6, THREE.MathUtils.clamp((n.distance - 3) / 11, 0, 1));
    P.left--;
    const at = new THREE.Vector3(...n.world);
    g.audio.tone({ freq: 1568, to: 1760, dur: 0.07, type: 'sine', volume: 0.5, at });
    g.audio.tone({ freq: 2349, dur: 0.05, type: 'sine', volume: 0.22, at });
  }

  private telemetry = 0;
  private telemetryJitter = 0;
  /** the zones' loading cards (ctx.game.loadingCard), hidden while their zone is away */
  private zoneCards = new Set<{ el: HTMLElement; isAway: () => boolean }>();
  /** the banner that was up when a console opened (one voice at a time) */
  private coveredBanner: BannerModel | null = null;
  private wasOperating = false;
  private hintCheck = 0;
  private dialogueH = 0;

  update(dt: number, playing: boolean): void {
    // telemetry strip (ART-V2 §5.4, plan §4.1), FIKTION: grounded the dock state and the three systems
    // („BODEN · HALTEARME · ROTOREN m/6 · AKKU p % · NAV …“), airborne the island's attitude (rc4)
    this.telemetry -= dt;
    if (this.telemetry <= 0) {
      this.telemetry = 0.25;
      const q = this.game.quest?.snapshot();
      if (q && q.flight.state === 'ground') this.game.hud.setTelemetry(groundTelemetry(q));
      else {
        const t = this.game.env.tilt;
        this.telemetryJitter = (this.telemetryJitter + (Math.random() - 0.5) * 0.01) * 0.9;
        const lage = Math.max(0.01, 0.04 + this.telemetryJitter + Math.hypot(t.rollDeg, t.pitchDeg));
        this.game.hud.setTelemetry(lage);
      }
    }
    // HUD density (FUN-PLAN C9): a hint that repeats the open operate panel's key row is suppressed
    this.hintCheck -= dt;
    if (this.hintCheck <= 0) {
      this.hintCheck = 0.3;
      this.game.hud.suppressHintIfIn(this.game.operate.isActive ? document.querySelector('.operate-panel') : null);
    }
    // the banner moves up while a subtitle shows (both live in the lower third)
    const talking = this.game.hud.dialogue.active;
    if (this.game.hud.root.classList.contains('talking') !== talking) this.game.hud.root.classList.toggle('talking', talking);
    // …by the subtitle's real height (two or three lines), so the banner never covers its first line
    if (talking && this.ui.bannerOpen) {
      const dh = this.game.hud.dialogue.root.offsetHeight;
      if (dh > 0 && dh !== this.dialogueH) {
        this.dialogueH = dh;
        this.game.hud.root.style.setProperty('--dlg-h', `${dh}px`);
      }
    }
    // one voice at a time (plan §4.1, R6 #10): the banner shrinks to a strip while EMI speaks, or when a
    // console opened over a banner that was already up (a result inside the console keeps its full banner)
    const operating = this.game.operate.isActive;
    if (operating && !this.wasOperating && this.ui.bannerModel) this.coveredBanner = this.ui.bannerModel;
    if (!operating) this.coveredBanner = null;
    this.wasOperating = operating;
    this.ui.setStrip(talking || (!!this.coveredBanner && this.coveredBanner === this.ui.bannerModel));
    // with both up on a short viewport they sit side by side (hud.css), so neither covers the prompt
    const bannerUp = this.ui.bannerOpen;
    if (this.game.hud.root.classList.contains('banner-up') !== bannerUp) this.game.hud.root.classList.toggle('banner-up', bannerUp);
    // a real modal (card, Pass, pause) covers the game: the banner and the fail flash step aside
    const top = this.game.hud.modals.top;
    const covered = !!top && top.kind !== 'operate';
    if (this.game.hud.root.classList.contains('covered') !== covered) this.game.hud.root.classList.toggle('covered', covered);
    // C12b: the zone that owns the run clock or live value is away (the player left mid-run, e.g. with
    // „Zurück zum Hub“): the run is over, the chips go (they stood at the Landedeck before)
    const owner = this.attemptOwner;
    if (owner && this.ui.attemptShown && this.game.zones.isAway(owner.zoneId)) {
      this.attemptOwner = null;
      owner.begun = false;
      this.ui.setTimer(null);
      this.ui.setLive(null);
    }
    for (const c of this.zoneCards) {
      const away = c.isAway();
      if (c.el.classList.contains('zone-away') !== away) c.el.classList.toggle('zone-away', away);
    }
    // UX-16: the prompt shows dimmed („näher ran“) for an interactable 0–4 m beyond its reach
    const nm = this.game.interaction.nearMiss;
    this.game.hud.setNearMiss(nm ? { id: nm.item.id, label: nm.item.label } : null);
    this.particles.update(dt);
    this.capsules.update(dt, this.game.player.renderFeet, playing);
    this.capsuleCue(dt, playing);
    if (playing) this.ui.update(dt);
  }
}
