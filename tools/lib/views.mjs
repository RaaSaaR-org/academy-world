// The named views of the Phase 7 tools (docs/PHASE7-PLAN.md §5.10, §5.5): ONE table for drawcalls,
// perf, perf-cpu, gpu-ab and progdiag, with each view's camera, flight state, ledger and budgets.
//
//   import { VIEWS, gotoView, viewBudget } from './lib/views.mjs';
//   const st = await gotoView(page, 'bridgehead');   // { ok: true } or { pending: 'why' }
//
// A view is one of three kinds:
//   setup  in-page code (the body of an async function) that places the player and the camera; it
//          works on rc4 and on phase7 alike, so an A/B against artifacts/dist/rc4 measures the same spot;
//   hook   a view whose content belongs to a content WP: the owner registers
//          `__academy.ext('view:<name>', async () => { … })` (place the camera, put the station into the
//          measured state; it may return a cleanup function). Until the hook exists the view is PENDING;
//   both   a hook when registered, else the setup.
// A view is also PENDING while `requires` (an in-page expression) is false, e.g. the area has no code
// yet. Tools skip pending views with a warning instead of failing (they are defined now so that the
// acceptance commands of wave 2 already name them).
//
// `flight` is the state the view needs. The page is reloaded with ?flight=<state> when it was opened
// with the other one (an rc4 build ignores the parameter: rc4 is always airborne).
//
// The ledger (§5.5, [C1 M2]): main-pass draws per owner. Owners are resolved per drawn object
// (tools/lib/drawcalls.mjs): world (the island module incl. tower, deck, sky dressing), ground (WP3,
// the root registered with ctx.frames.register('ground', …)), region (WP14), life (WP15), robots
// (meshes created through ctx.robots), engine (sky dome, cloud sea, capsules: only the total budgets
// them) and each area by its id. A bucket is an owner, 'areas' (every area not named by another bucket
// of the view) or 'others' (every owner not named by another bucket). `known` lists rc4 misses with
// their owner WP: they print as KNOWN, fail only when they grow past `upTo`, and print a reminder
// once they are fixed. `limits` are standing per-key caps ({ key: '<owner>/<sub>', cap }) without an
// allowance, e.g. a lobe's exterior tier once its known miss is fixed.

const deg = Math.PI / 180;
/** world position on bearing b (degrees, 0 = north = −z, clockwise from above) at distance r */
const polar = (b, r) => [Math.sin(b * deg) * r, -Math.cos(b * deg) * r];
/** the yaw (degrees, __academy.look) that faces bearing b */
const yawOf = (b) => -b;
const f2 = (v) => Number(v.toFixed(2));

/** Zone anchors on the island ring (x, z), the rc4 lobes (GDD §4.3). */
export const ZONE_ANCHORS = { sensordom: [-80, 0], regelgarten: [-40, -69.28], greifwerkstatt: [40, -69.28], 'lern-dojo': [80, 0], dunkelfabrik: [40, 69.28], prueffeld: [-40, 69.28] };

/**
 * Hold the player where the view puts it (no gravity), for views over ground that may not exist yet
 * (the bridge head before WP3's apron); every view first releases the hold of the one before.
 */
const HOLD = `{ const P = __academy.game.player; P.gravityScale = 0; P.velocity.set(0, 0, 0); }`;
const RELEASE = `{ const P = __academy.game.player; if (P) P.gravityScale = 1; try { __academy.exitOperate(); __academy.closeModals(); } catch (e) {} }`;
const teleport = (pos, yaw, pitch) => `__academy.teleport([${pos.map(f2).join(',')}]); __academy.look(${f2(yaw)},${pitch});`;
const areaReady = (id) => `(__academy.zones().find((z) => z.id === '${id}')?.status === 'ready')`;

const [k240x, k240z] = polar(240, 86);
// the Ausguck deck (+44, r 9–13), west side, looking down the farm's line (bearing 258) into the Revier
const [ausX, ausZ] = polar(258, 11);

/** GDD §11 gate for every survey view (§5.5 last row). */
export const GDD_GATE = { total: 500, tris: 1.5e6 };

/**
 * The views. Budgets: `gpuMs` (3840 × 2160, vsync off; gpu-ab applies the A/B rule of §5.5 to every view:
 * ≤ gpuMs, or ≤ rc4 + 0.15 ms with the founder told; `ab: true` marks the views §5.5 names for it),
 * `js4x` (JS ms per frame at 4× CPU), `tris` (renderer triangles of the frame, all passes, as the rc4
 * survey counted them).
 */
export const VIEWS = {
  spawn: {
    desc: 'rc4 Messpunkt (0, 0, 94.5), facing the tower',
    flight: 'ground',
    setup: teleport([0, 0, 94.5], 0, 6),
    js4x: 8.4,
    ledger: {
      // the phase 6 targets W1 / Z1 (the bridge head replaces the spawn as the Phase 7 entry view)
      buckets: [['world', 110], ['areas', 50]],
      // phase 6 Z1 held since WP8 (zone draws at the spawn 51 → 48): the 'areas' bucket is the standing cap
      known: [],
    },
  },
  bridgehead: {
    desc: 'bridge head spawn (0, 0, 114), grounded, bearing 0, pitch +6°',
    flight: 'ground',
    // held: before WP3's apron there is no ground at z 114
    setup: `${HOLD} ${teleport([0, 0, 114], 0, 6)}`,
    hold: true,
    gpuMs: 4.5,
    ab: true,
    js4x: 8.4,
    tris: 1.0e6,
    ledger: {
      buckets: [['world', 110], ['ground', 30], ['region', 40], ['life', 6], ['areas', 52]],
      total: 240,
      // Both rc4 known misses are inside since wave 1: world 120 → 88 (WP12's dock-pit underside rule) and
      // areas 53 → 52 (WP5's Regelgarten far tier).
      known: [],
    },
  },
  plaza: {
    desc: 'plaza (0, 0, 30), grounded, facing the tower',
    flight: 'ground',
    setup: teleport([0, 0, 30], 0, 0),
    gpuMs: 4.5,
    ab: true,
    js4x: 7.8,
    tris: 1.0e6,
    ledger: {
      buckets: [['world', 95], ['areas', 57], ['schauhalle', 12], ['ground', 10], ['region', 20], ['life', 4], ['robots', 2]],
      total: 200,
      known: [],
      // phase 6 Z1, held: the Regelgarten's exterior shows its mid set at the plaza (9 draws since WPF; rc4 29),
      // the Greifwerkstatt's 10 since WP8 (rc4 17)
      limits: [{ key: 'regelgarten/exterior', cap: 10 }, { key: 'greifwerkstatt/exterior', cap: 10 }],
    },
  },
  'plaza-air': {
    desc: 'plaza (0, 0, 30), airborne',
    flight: 'airborne',
    setup: teleport([0, 0, 30], 0, 0),
    gpuMs: 4.5,
    js4x: 7.8,
    tris: 1.0e6,
    // rc4 148 + hall exterior ≤ 12 + robots ≤ 2
    ledger: { buckets: [['schauhalle', 12], ['robots', 2]], total: 165 },
  },
  kanzel240: {
    desc: 'Kanzel 240 (farm view), looking out and down',
    flight: 'ground',
    setup: teleport([k240x, 0, k240z], (Math.atan2(k240x, k240z) * 180) / Math.PI, -20),
    gpuMs: 6.0,
    js4x: 8.4,
    tris: 1.2e6,
    ledger: { buckets: [], total: 300 },
  },
  clouddown: {
    desc: 'Kanzel 240 looking down into the cloud sea, airborne (the GPU-heaviest rc4 view)',
    flight: 'airborne',
    setup: teleport([k240x, 0, k240z], (Math.atan2(-Math.sin(240 * deg), Math.cos(240 * deg)) * 180) / Math.PI, -25),
    gpuMs: 7.0,
    // rc4: no ledger of its own (§5.5 „rc4“); the GDD gate applies
    ledger: { buckets: [] },
  },
  ausguck: {
    desc: 'Ausguck +44, grounded, looking over the Revier (bearing 258, the farm)',
    flight: 'ground',
    setup: teleport([ausX, 44.05, ausZ], yawOf(258), -8),
    gpuMs: 6.0,
    js4x: 8.4,
    tris: 1.2e6,
    ledger: { buckets: [['region', 30]], total: 300 },
  },
  schauhalle: {
    desc: 'Schauhalle Nord interior, from the south door toward the north window',
    flight: 'ground',
    owner: 'WP11',
    hook: 'view:schauhalle',
    requires: areaReady('schauhalle'),
    setup: teleport([0, 0, -56], 0, 0),
    gpuMs: 5.0,
    js4x: 8.4,
    tris: 0.9e6,
    ledger: {
      buckets: [['schauhalle', 80], ['world', 90], ['areas', 10]],
      total: 180,
      trisBy: [['schauhalle', 300e3]],
      // WP11's request (wave 2): lobes 02 and 03 show their exteriors through the hall's frosted side walls;
      // since WP17 the Regelgarten shows its mid set while you are inside (8 → 5), the Greifwerkstatt has none yet
      known: [{ bucket: 'areas', upTo: 17, owner: 'WP11/WP17', note: 'other areas ≤ 10 inside the hall: the Regelgarten mid set (5) and the Greifwerkstatt exterior (8) through the side glass' }],
    },
  },
  duckfield: {
    desc: 'Regelgarten C duck field, training (MuJoCo worker generations running)',
    flight: 'ground',
    owner: 'WP5',
    hook: 'view:duckfield',
    requires: areaReady('regelgarten'),
    gpuMs: 4.5,
    js4x: 8.4,
    tris: 0.9e6,
    ledger: { buckets: [['regelgarten', 80], ['world', 100], ['others', 40]], total: 220 },
  },
  'lerndojo-b': {
    desc: 'Lern-Dojo B (SO-101 VLA)',
    flight: 'ground',
    owner: 'WP6',
    hook: 'view:lerndojo-b',
    requires: areaReady('lern-dojo'),
    gpuMs: 4.5,
    js4x: 8.4,
    tris: 0.8e6,
    ledger: { buckets: [['lern-dojo', 80]], total: 220 },
  },
  'sonnenacker-c': {
    desc: 'Sonnenacker C, the automated day',
    flight: 'ground',
    owner: 'WP9',
    hook: 'view:sonnenacker-c',
    requires: areaReady('sonnenacker'),
    gpuMs: 6.0,
    js4x: 9.5,
    tris: 1.1e6,
    // „island seen from the ground ≤ 80“ is the world bucket
    ledger: { buckets: [['sonnenacker', 70], ['region', 70], ['world', 80], ['ground', 20], ['life', 20]], total: 260, trisBy: [['sonnenacker', 130e3]] },
  },
  kreislaufhof: {
    desc: 'Kreislaufhof hall (use-case scene)',
    flight: 'ground',
    owner: 'WP14',
    hook: 'view:kreislaufhof',
    requires: areaReady('kreislaufhof'),
    setup: `__academy.teleport('kreislaufhof');`,
    js4x: 9.5,
    tris: 1.2e6,
    ledger: { buckets: [['region', 140]], total: 320, trisBy: [['region', 550e3]] },
  },
  'traumhangar-ghost': {
    desc: 'Traumhangar, Space held (5 ghosts)',
    flight: 'ground',
    owner: 'WP10',
    // the hangar is a site: it and its robots load before the Revier opens only as the deep-link area
    // (plan §5.6), so the page opens with ?zone=traumhangar (WP10's request)
    query: { zone: 'traumhangar' },
    hook: 'view:traumhangar-ghost',
    requires: areaReady('traumhangar'),
    gpuMs: 5.0,
    js4x: 9.0,
    tris: 0.8e6,
    ledger: { buckets: [['traumhangar', 80], ['others', 40]], total: 120, trisBy: [['robots', 70e3]] },
  },
  'kielraum-f1': {
    desc: 'Kielraum, F1 hover',
    flight: 'ground',
    owner: 'WP13',
    hook: 'view:kielraum-f1',
    // rc4 numbers are the budget (≤ 296 draws)
    ledger: { buckets: [], total: 296 },
  },
  climb: {
    desc: 'lift-off climb at h = 300',
    flight: 'ground',
    owner: 'WP13',
    hook: 'view:climb',
    gpuMs: 7.0,
    js4x: 8.4,
    tris: 1.2e6,
    ledger: { buckets: [], total: 320 },
  },
  // ── rc4 survey views (perf-cpu and progdiag defaults; no Phase 7 ledger of their own) ──────────
  ...Object.fromEntries(
    Object.entries(ZONE_ANCHORS).map(([z, [x, zz]]) => [
      z,
      {
        desc: `inside ${z}, from the gate's bearing`,
        flight: 'ground',
        requires: areaReady(z),
        setup: `__academy.teleport('${z}'); await new Promise((r) => setTimeout(r, 600)); const y = __academy.state().player.yawDeg; __academy.teleport([${(x * 0.85).toFixed(2)},0.1,${(zz * 0.85).toFixed(2)}]); __academy.look(y,0);`,
        rc4: true,
      },
    ]),
  ),
  keel: { desc: 'Kielraum (rc4 finale-goto)', flight: 'ground', setup: `await __academy.solve('world','finale-goto'); __academy.look(0,-10);`, rc4: true },
};

/** The §5.10 view names (the rc4 survey views are extra). */
export const PHASE7_VIEWS = Object.keys(VIEWS).filter((v) => !VIEWS[v].rc4);

export function knownView(name) {
  return Object.prototype.hasOwnProperty.call(VIEWS, name);
}

/** Budgets of a view for a tool: { gpuMs, ab, js4x, tris, ledger } (undefined when it has none). */
export function viewBudget(name) {
  const v = VIEWS[name];
  if (!v) throw new Error(`unknown view ${name} (${Object.keys(VIEWS).join(', ')})`);
  return { gpuMs: v.gpuMs, ab: !!v.ab, js4x: v.js4x, tris: v.tris, ledger: v.ledger };
}

/** URL of the page with the view's flight state and query (null when the page already has them). */
function urlFor(page, v) {
  const u = new URL(page.url());
  let changed = false;
  // a page without ?flight= is grounded (a fresh profile); an explicit value wins over a saved one
  const want = v.flight === 'airborne' ? 'airborne' : 'ground';
  if ((u.searchParams.get('flight') ?? 'ground') !== want) {
    u.searchParams.set('flight', want);
    changed = true;
  }
  for (const [k, val] of Object.entries(v.query ?? {}))
    if (u.searchParams.get(k) !== val) {
      u.searchParams.set(k, val);
      changed = true;
    }
  return changed ? u.toString() : null;
}

/**
 * Is the view measurable on this page? null when it is, else the reason it is pending. Checks the
 * hook (when the view has no setup to fall back on) and `requires`.
 */
export async function viewPending(page, name) {
  const v = VIEWS[name];
  if (!v) throw new Error(`unknown view ${name} (${Object.keys(VIEWS).join(', ')})`);
  const hasHook = await page.evaluate((hook) => {
    const A = window.__academy;
    return !!hook && typeof A.ext === 'function' && typeof A.ext(hook) === 'function';
  }, v.hook ?? null);
  const who = v.owner ? ` (content: ${v.owner})` : '';
  if (v.hook && !hasHook && !v.setup) return `no ${v.hook} hook registered yet${who}`;
  if (v.requires && !hasHook) {
    const ok = await page.evaluate(`(() => { try { return !!(${v.requires}); } catch (e) { return false; } })()`);
    if (!ok) return `its content does not exist on this build yet${who}`;
  }
  return null;
}

/**
 * Place the camera at a named view. Reloads the page first when the view needs another flight state
 * or query (then waits for `ready`, and loads every area again when the page was opened with all:
 * see measure.mjs openGame). Returns { ok: true, cleanup? } or { pending: reason }.
 */
export async function gotoView(page, name, settle = 1500) {
  const v = VIEWS[name];
  if (!v) throw new Error(`unknown view ${name} (${Object.keys(VIEWS).join(', ')})`);
  // a dev zone that this build does not have (e.g. _traum-spike before WP2) is pending without a reload
  if (v.query?.zone) {
    const known = await page.evaluate((id) => window.__academy.zones().some((z) => z.id === id), v.query.zone);
    if (!known) return { pending: `the zone ${v.query.zone} is not in this build${v.owner ? ` (content: ${v.owner})` : ''}` };
  }
  const url = urlFor(page, v);
  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 180000, polling: 200 });
    if (page.__academyAll) {
      const { loadAllAreas } = await import('./measure.mjs');
      await loadAllAreas(page);
    }
    await page.waitForTimeout(1000);
  }
  await page.evaluate(`(async () => { ${RELEASE} })()`);
  if (page.__viewCleanup) {
    await page.evaluate(() => {
      const c = window.__viewCleanup;
      window.__viewCleanup = null;
      if (typeof c === 'function') return c();
    });
    page.__viewCleanup = false;
  }
  const pending = await viewPending(page, name);
  if (pending) return { pending };
  const usedHook = await page.evaluate(async (hook) => {
    const A = window.__academy;
    const fn = hook && typeof A.ext === 'function' ? A.ext(hook) : null;
    if (typeof fn !== 'function') return false;
    const r = await fn();
    window.__viewCleanup = typeof r === 'function' ? r : null;
    return true;
  }, v.hook ?? null);
  if (!usedHook) await page.evaluate(`(async () => { ${v.setup ?? ''} })()`);
  page.__viewCleanup = usedHook;
  await page.waitForTimeout(settle);
  return { ok: true, hook: usedHook };
}

/** Split a --views list into the measurable names and the unknown ones (gates.mjs, the tools). */
export function splitViews(names) {
  return { known: names.filter(knownView), unknown: names.filter((n) => !knownView(n)) };
}
