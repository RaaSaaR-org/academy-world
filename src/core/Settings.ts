import type { EventBus } from './EventBus';
import { loadJSON, saveJSON } from './storage';
import type { Lang, QualitySetting } from './types';

export interface SettingsData {
  sensitivity: number; // 0.2 … 3, 1 = default
  invertY: boolean;
  quality: QualitySetting;
  lang: Lang;
  volume: number; // 0 … 1 (master)
  /** D14 (F3): atmosphere & music (ambience + zone beds), effects (UI, foley, cues), EMI (voice); 0 … 1 */
  volAtmo: number;
  volEffects: number;
  volEmi: number;
  /** D14 (F3): subtitles and HUD text, 1 / 1.25 / 1.5 */
  textScale: number;
  headBob: boolean;
  fov: number; // vertical degrees, 50 … 80 (60 ≈ 91° horizontal at 16:9)
  /** no camera tilt/roll/shake/bob, fade teleports instead of flights (defaults to the OS setting) */
  reducedMotion: boolean;
  /** in-world explanation overlays (O key) */
  overlays: boolean;
  /** Phase 7 (D24, plan §4.15): the lift-off may cut to its two outside shots (C1, C2); off = it stays aboard */
  exteriorCams: boolean;
  /** settings schema: 2 = FOV default 60° (QA-16); 3 = three volumes + text size (D14, defaults fill in); 4 = exteriorCams */
  v?: number;
}

/**
 * D12 (F1): on a first visit (no saved language), English when the browser's language is not German.
 * German stays the house default (also when the browser says nothing); the switch stays.
 */
export function firstVisitLang(): Lang {
  try {
    const l = navigator.language;
    if (!l) return 'de';
    return l.toLowerCase().startsWith('de') ? 'de' : 'en';
  } catch {
    return 'de';
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const DEFAULTS: SettingsData = {
  sensitivity: 1,
  invertY: false,
  quality: 'auto',
  lang: 'de',
  volume: 0.8,
  volAtmo: 1,
  volEffects: 1,
  volEmi: 1,
  textScale: 1,
  headBob: true,
  fov: 60,
  reducedMotion: false,
  overlays: true,
  exteriorCams: true,
  v: 4,
};

/** the text sizes the settings offer */
export const TEXT_SCALES = [1, 1.25, 1.5] as const;

/** Persistent player settings (localStorage, try/catch wrapped). */
export class Settings {
  data: SettingsData;

  constructor(private events: EventBus) {
    const saved = loadJSON<Partial<SettingsData>>('settings', {});
    const clean = sanitize(saved);
    // migrations (the defaults fill in whatever an older save lacks)
    const v = saved.v ?? 1;
    // v2 (QA-16): the old default (72° vertical ≈ 104° horizontal) stretched the screen edges
    if (v < 2 && (clean.fov === undefined || clean.fov === 72)) delete clean.fov;
    // v3 (D14): the three volumes start at 100 % under the saved master volume, text at 100 %
    // v4 (Phase 7, D24): the outside shots of the lift-off start on
    this.data = { ...DEFAULTS, lang: firstVisitLang(), reducedMotion: prefersReducedMotion(), ...clean, v: 4 };
  }

  get<K extends keyof SettingsData>(k: K): SettingsData[K] {
    return this.data[k];
  }

  set<K extends keyof SettingsData>(k: K, v: SettingsData[K], persist = true): void {
    if (this.data[k] === v) return;
    this.data[k] = v;
    if (persist) saveJSON('settings', this.data);
    this.events.emit('settings:changed', { key: k, settings: this.data });
  }
}

function sanitize(s: Partial<SettingsData>): Partial<SettingsData> {
  const out: Partial<SettingsData> = {};
  if (typeof s.sensitivity === 'number' && s.sensitivity > 0.05 && s.sensitivity < 5) out.sensitivity = s.sensitivity;
  if (typeof s.invertY === 'boolean') out.invertY = s.invertY;
  if (s.quality === 'auto' || s.quality === 'low' || s.quality === 'medium' || s.quality === 'high') out.quality = s.quality;
  if (s.lang === 'de' || s.lang === 'en') out.lang = s.lang;
  if (typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1) out.volume = s.volume;
  for (const k of ['volAtmo', 'volEffects', 'volEmi'] as const) if (typeof s[k] === 'number' && s[k] >= 0 && s[k] <= 1) out[k] = s[k];
  if (typeof s.textScale === 'number' && (TEXT_SCALES as readonly number[]).includes(s.textScale)) out.textScale = s.textScale;
  if (typeof s.headBob === 'boolean') out.headBob = s.headBob;
  if (typeof s.fov === 'number' && s.fov >= 50 && s.fov <= 80) out.fov = s.fov;
  if (typeof s.reducedMotion === 'boolean') out.reducedMotion = s.reducedMotion;
  if (typeof s.overlays === 'boolean') out.overlays = s.overlays;
  if (typeof s.exteriorCams === 'boolean') out.exteriorCams = s.exteriorCams;
  return out;
}
