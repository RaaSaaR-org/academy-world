import type { Lang, Mode, QualityLevel } from './types';

/**
 * Launch parameters parsed from the URL. These are the main test hooks for agents:
 *
 *   ?zone=<id>            spawn at that zone's spawn point (its code loads before the title)
 *   ?area=<id>            Phase 7: alias of ?zone for halls and sites; also loads a ground area before the Revier is open
 *   ?only=<id>[,<id>]     load ONLY these zones (parallel zone development); a site listed here loads
 *                         although the Revier is closed, and the island module still loads (it registers the ground frame)
 *   ?skipIntro=1          no start screen, play immediately (no pointer lock needed)
 *   ?lang=en              language (de default)
 *   ?mode=entscheider     audience mode (entdecker default)
 *   ?quality=low|medium|high
 *   ?debug=1              stats overlay + collider wireframes
 *   ?pos=x,y,z&look=yaw,pitch   exact world position (feet) and view (degrees)
 *   ?dev=1                also load dev-only zones (ids starting with "_")
 *   ?mute=1               start muted
 *   ?reset=1              wipe saved progress on start
 *   ?world=0              skip the island module (core fallback ground only): no ground frame either, so ground areas get fallback platforms
 *   ?flight=ground|airborne   Phase 7: start in this flight state (the quest spine, WP1, applies it)
 *   ?liftoff=1            Phase 7: every lift-off condition met, at the console (WP1, WP13)
 *   ?retired=<id>[,<id>]  tests: extra retired stamp ids for the boot migration (the save fixtures,
 *                         tools/fixtures/saves; added to src/systems/retired.ts)
 */
export interface LaunchParams {
  zone: string | null;
  only: string[] | null;
  skipIntro: boolean;
  lang: Lang | null;
  mode: Mode | null;
  quality: QualityLevel | null;
  debug: boolean;
  pos: [number, number, number] | null;
  look: [number, number] | null;
  dev: boolean;
  mute: boolean;
  reset: boolean;
  world: boolean;
  /** ?area=<id> as given (it also sets `zone`) */
  area: string | null;
  flight: 'ground' | 'airborne' | null;
  liftoff: boolean;
  /** ?retired=a,b (tests only) */
  retired: string[] | null;
}

function flag(p: URLSearchParams, name: string): boolean {
  if (!p.has(name)) return false;
  const v = (p.get(name) ?? '').toLowerCase();
  return v === '' || v === '1' || v === 'true' || v === 'yes';
}

function nums(s: string | null, n: number): number[] | null {
  if (!s) return null;
  const parts = s.split(',').map((x) => Number(x.trim()));
  if (parts.length < n || parts.slice(0, n).some((x) => !Number.isFinite(x))) return null;
  return parts.slice(0, n);
}

export function parseParams(search: string = window.location.search): LaunchParams {
  const p = new URLSearchParams(search);
  const lang = p.get('lang');
  const mode = p.get('mode');
  const quality = p.get('quality');
  const onlyRaw = p.get('only');
  const pos = nums(p.get('pos'), 3);
  const look = nums(p.get('look'), 2);
  const area = p.get('area') || null;
  const flight = p.get('flight');
  const retired = p.get('retired');
  return {
    zone: p.get('zone') || area,
    only: onlyRaw ? onlyRaw.split(',').map((s) => s.trim()).filter(Boolean) : null,
    skipIntro: flag(p, 'skipIntro') || flag(p, 'skipintro'),
    lang: lang === 'de' || lang === 'en' ? lang : null,
    mode: mode === 'entdecker' || mode === 'entscheider' ? mode : null,
    quality: quality === 'low' || quality === 'medium' || quality === 'high' ? quality : null,
    debug: flag(p, 'debug'),
    pos: pos ? [pos[0], pos[1], pos[2]] : null,
    look: look ? [look[0], look[1]] : null,
    dev: flag(p, 'dev'),
    mute: flag(p, 'mute'),
    reset: flag(p, 'reset'),
    world: p.get('world') !== '0',
    area,
    flight: flight === 'ground' || flight === 'airborne' ? flight : null,
    liftoff: flag(p, 'liftoff'),
    retired: retired ? retired.split(',').map((s) => s.trim()).filter(Boolean) : null,
  };
}
