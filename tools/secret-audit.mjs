#!/usr/bin/env node
// Easter eggs never gate and are findable (docs/PHASE7-PLAN.md §4.13, §5.10, D35; skeleton WP7, content
// WP15). Per secret: its distance to the main path, a cue on the route, reachable, and the find rate of
// a curiosity bot; per run: how many it found, and whether one came in the first 10 minutes of the route;
// plus a quick playtest with 0 and with all secrets found (secrets never gate).
//
//   node tools/secret-audit.mjs [--runs 30] [--no-playtest] [--dev | --dist <dir>]
//   node tools/secret-audit.mjs --selftest   # two injected test secrets (proximity triggers), 4 bot runs
//
// The audit contract (WP15 registers it once the eggs exist):
//   __academy.ext('secrets:audit', () => [{ id, area, level, at: [x, y, z], cue: [x, y, z] | null, trigger }])
//     at       where the secret is found (world); cue: the thing on the route that hints at it (or null)
//     trigger  the area whose code makes it findable when that is not the island alone (WP5's duck
//              station, WP9's farm, WP10's hangar; the hall the route leads through), or null; with no code
//              there yet the secret is reported as pending (no distance, cue or rate check)
//     play     true: found by playing a station (three reward settings …), which the bot does not do: its
//              rate is reported, not checked
// The secrets themselves come from ctx.game.secrets (WP1; __academy.game.gameLayer.secrets). The main
// path is the Entdecker route in its order (src/world/layout.ts ROUTE_STEPS, read from the source): the
// bridge head, the Allee, the plaza and the Libelle, then per area its gate (spawn) and its stations
// (the area's interactables, the way a player plays them), back to the plaza, and at the end the Kiel and
// the Ausguck (the Startprüfung and the lift-off). Every path point carries the route's design minute.
// Checks per secret (level 0–1 = on or by the path, 2 = a detour, 3 = hidden; §4.13):
//   distance  ≤ 15 m (level 0), ≤ 40 m (level 1), ≤ 120 m (level 2) from the path; level 3 any
//   cue       a cue within 25 m of the path for every level ≥ 1 secret
//   reachable the player stands at `at` (a floor within 2 m below it) one second after a teleport
//   bot       --runs curiosity runs (R9 §6.1: a wanderer that leaves the route now and then and goes to
//             anything that moves or makes a sound): it walks the path in 5 m steps with random detours
//             (≤ 30 m), steps up to a cue it passes (half the time), looks at it, now and then wiggles the
//             view (a reply to something that waves at it) and presses E, tries a choice when one is
//             offered and the key a panel offers (E) when one opens; on the deck it stops in front of a
//             rover that comes by (it moves: what will it do?) and watches it for a moment. Per secret the share of runs that found it: level 0 ≥ 50 %, level 1 ≥ 20 %,
//             level 2 ≥ 5 %, level 3 reported only. Per run (§4.13, §6.6 WP15): the median of finds
//             ≥ 5, and ≥ 1 find in the route's first 10 minutes in ≥ 80 % of the runs (4 of 5)
// The playtest pair: `playtest --quick` with no secret found and with every secret found first
// (--secrets all): both must pass. Until WP15 registers secrets and the audit hook the tool prints
// pending and exits 0. Exit 1 on a miss.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Verdict, gameServer, launchChromium, median, openGame, parseArgs, saveJson, round, ROOT } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
const selftest = !!args.selftest;
const runs = Number(args.runs ?? (selftest ? 4 : 30));
/**
 * --selftest: two test secrets with proximity triggers and the audit hook, injected into every page:
 * '_t-plaza' (level 0, by the plaza, its cue on the path) and '_t-far' (level 2, on the deck far off the
 * path, cue near the path). The audit machinery must measure them; no playtest.
 */
const SELFTEST_INIT = () => {
  const iv = setInterval(() => {
    const A = window.__academy;
    if (!A || !A.ready || !A.game.gameLayer?.secrets) return;
    clearInterval(iv);
    const S = A.game.gameLayer.secrets;
    const list = [
      { id: '_t-plaza', area: 'deck', level: 0, at: [6, 0, 30], cue: [4, 0, 28] },
      { id: '_t-far', area: 'deck', level: 2, at: [-30, 0, 55], cue: [-10, 0, 40] },
    ];
    for (const t of list) S.register({ id: t.id, area: t.area, level: t.level, title: t.id, hint: t.id, card: () => ({ title: t.id }), reward: { kind: 'album', albumId: t.id } });
    A.ext('secrets:audit', () => list);
    setInterval(() => {
      const p = A.game.player.feet;
      for (const t of list) if (Math.hypot(p.x - t.at[0], p.z - t.at[2]) < 3) S.find(t.id);
    }, 50);
  }, 50);
};
const v = new Verdict('secret-audit');
const DIST = { 0: 15, 1: 40, 2: 120 };
const RATE = { 0: 0.5, 1: 0.2, 2: 0.05 };
const CUE_DIST = 25;
/** the route targets of §4.13 / §6.6 WP15 */
const MEDIAN_FINDS = 5;
const FIRST_MIN = 10;
const FIRST_SHARE = 0.8;
const out = {};

/** The Entdecker route from src/world/layout.ts ROUTE_STEPS (area, minutes) and ROUTE_ENDS. */
function entdeckerRoute() {
  const src = fs.readFileSync(path.join(ROOT, 'src/world/layout.ts'), 'utf8');
  const block = src.slice(src.indexOf('entdecker: ['), src.indexOf('entscheider: ['));
  const steps = [...block.matchAll(/area:\s*'([\w-]+)',\s*minutes:\s*([\d.]+)/g)].map((m) => ({ area: m[1], minutes: Number(m[2]) }));
  const ends = src.match(/entdecker:\s*\{\s*start:\s*([\d.]+),\s*pruefung:\s*([\d.]+),\s*liftoff:\s*([\d.]+)/);
  return { steps, start: ends ? Number(ends[1]) : 1, pruefung: ends ? Number(ends[2]) : 6, liftoff: ends ? Number(ends[3]) : 3 };
}

/** Distance from point p (x, z) to a polyline of [x, z, …] points. */
function distToPath(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz, jump] = pts[i];
    // a pad hop is a flight, not a path on the ground
    if (jump) continue;
    const dx = bx - ax;
    const dz = bz - az;
    const L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / L));
    best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (az + t * dz)));
  }
  return best;
}
/** a small seeded RNG (mulberry32) so a run can be repeated */
const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const srv = await gameServer(args);
const browser = await launchChromium();
let pendingWhy = null;
try {
  const open = async () => {
    const r = await openGame(browser, `${srv.url}/?reset=1&skipIntro=1&lang=de&mode=entdecker`, { instrument: false, all: true, init: selftest ? [SELFTEST_INIT] : [] });
    // the island's eggs live in the lazy life chunk (WP15): load it before the bot walks
    await r.page.evaluate(async () => {
      const A = window.__academy;
      A.start?.();
      const load = A.ext('life:load');
      if (typeof load === 'function') await load();
    });
    return r;
  };
  let { page, ctx } = await open();
  if (selftest) await page.waitForFunction(() => typeof window.__academy.ext('secrets:audit') === 'function', null, { timeout: 30000 });
  const info = await page.evaluate(() => {
    const A = window.__academy;
    const S = A.game.gameLayer?.secrets;
    const hook = typeof A.ext === 'function' ? A.ext('secrets:audit') : null;
    const ids = S && S.defs ? [...S.defs.keys()] : [];
    return { total: S ? S.total() : 0, ids, audit: typeof hook === 'function' ? hook() : null };
  });
  if (!info.total || !info.audit) {
    pendingWhy = !info.total ? 'no secret registered yet (ctx.game.secrets, WP15)' : "no __academy.ext('secrets:audit') hook yet (WP15)";
  } else {
    // ── the main path: the route in its order, with the stations and the design minutes ──
    const route = entdeckerRoute();
    const built = await page.evaluate(async (route) => {
      const A = window.__academy;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const coded = new Set(A.manifests('all').filter((m) => m.hasCode).map((m) => m.id));
      // [x, z, minute]
      const pts = [[0, 114, 0], [0, 101, 0.15], [0, 84, 0.3], [0, 34, 0.55], [0, 22, 0.7], [-3.3, 22.7, 0.8], [0, 26, route.start]];
      let minute = route.start;
      // the ground sites are reached by the hop Kanzel pad → ground pad (layout KANZEL_PADS, 3 s): a jump
      const HOPS = { kreislaufhof: 60, traumhangar: 120, sonnenacker: 240, unkrautacker: 300 };
      const polar = (b, r) => [Math.sin((b * Math.PI) / 180) * r, -Math.cos((b * Math.PI) / 180) * r];
      for (const step of route.steps) {
        const sp = A.game.zones.spawnOf(step.area);
        if (!sp) {
          minute += step.minutes;
          continue;
        }
        const gate = [sp.pos.x, sp.pos.z];
        const hop = HOPS[step.area];
        if (hop) {
          pts.push([...polar(hop, 85), minute + 0.3]);
          pts.push([...polar(hop, 150), minute + 0.4, 'jump']);
        }
        pts.push([gate[0], gate[1], minute + 0.5]);
        // its stations: the area's interactables, in the order of their distance from the gate
        let stations = [];
        if (coded.has(step.area)) {
          A.teleport([sp.pos.x, sp.pos.y + 0.3, sp.pos.z]);
          await wait(700);
          stations = A.interactables(45)
            .filter((x) => x.owner === step.area)
            .map((x) => [x.pos[0], x.pos[2]]);
        }
        const k = stations.length;
        stations.forEach((s, i) => pts.push([s[0], s[1], minute + 0.5 + ((i + 1) / (k + 1)) * (step.minutes - 1)]));
        pts.push([gate[0], gate[1], minute + step.minutes - 0.3]);
        if (hop) {
          pts.push([...polar(hop, 150), minute + step.minutes - 0.2]);
          pts.push([...polar(hop, 85), minute + step.minutes - 0.1, 'jump']);
        }
        minute += step.minutes;
        pts.push([0, 26, minute]);
      }
      // the Startprüfung in the Kiel (the lift by the tower) and the lift-off on the Ausguck, then a look
      // around the Ausguck in the air (§1.5: free roam; EMI-01 offers the Fotopunkt once)
      pts.push([0, -10, minute + 0.2]);
      minute += route.pruefung;
      // the lift's exit, the launch stand west of the shaft (WP13: polar(327.5, 9.5)), then the ring
      pts.push([0, -10, minute]);
      pts.push([-5.1, -8.0, minute + 0.5]);
      pts.push([-5.1, -8.0, minute + route.liftoff]);
      for (const b of [340, 300, 250, 215, 180, 320]) pts.push([Math.sin((b * Math.PI) / 180) * 11.0, -Math.cos((b * Math.PI) / 180) * 11.0, minute + route.liftoff + 1]);
      return pts;
    }, route);
    const pathXZ = built.map((p) => [p[0], p[1], p[3] === 'jump']);
    // the Ausguck points stand 44 m up: the path keeps them (2D distances), the bot steps there at +44
    const secrets = info.audit;
    out.route = route;
    out.path = built;
    out.secrets = [];
    const codedAreas = await page.evaluate(() => window.__academy.manifests('all').filter((m) => m.hasCode).map((m) => m.id));
    for (const s of secrets) {
      const d = distToPath([s.at[0], s.at[2]], pathXZ);
      const cue = s.cue ? distToPath([s.cue[0], s.cue[2]], pathXZ) : null;
      const reach = await page.evaluate(async (at) => {
        const A = window.__academy;
        A.game.player.gravityScale = 1;
        A.teleport([at[0], at[1] + 0.5, at[2]]);
        await new Promise((r) => setTimeout(r, 1000));
        const p = A.state().player.pos;
        return { pos: p, ok: Math.abs(p[1] - at[1]) <= 2 && Math.hypot(p[0] - at[0], p[2] - at[2]) <= 2 };
      }, s.at);
      const pending = s.trigger && !codedAreas.includes(s.trigger) ? `${s.trigger} has no code yet` : null;
      const row = { id: s.id, area: s.area, level: s.level, distance: round(d, 1), cueDistance: cue == null ? null : round(cue, 1), reachable: reach.ok, finds: 0, early: 0, pending, play: !!s.play };
      out.secrets.push(row);
      if (pending) continue;
      if (DIST[s.level] != null) v.check(`${s.id} (level ${s.level}): distance to the main path`, row.distance, '<=', DIST[s.level], ' m');
      if (s.level >= 1) v.require(`${s.id}: a cue within ${CUE_DIST} m of the path`, cue != null && cue <= CUE_DIST, cue == null ? 'no cue' : `${row.cueDistance} m`);
      v.require(`${s.id}: reachable`, reach.ok, JSON.stringify(reach.pos));
    }
    // ── the curiosity bot ──
    await ctx.close();
    const perRun = [];
    for (let run = 0; run < runs; run++) {
      ({ page, ctx } = await open());
      const r = rng(1000 + run);
      const cues = secrets.filter((s) => s.cue).map((s) => s.cue);
      const steps = [];
      for (let i = 1; i < built.length; i++) {
        const [ax, az, am] = built[i - 1];
        const [bx, bz, bm, jump] = built[i];
        // a pad hop: no steps in the air
        if (jump) {
          steps.push({ x: bx, y: 0, z: bz, yaw: r() * 360, look: null, wiggle: false, press: false, choice: false, rover: false, minute: bm });
          continue;
        }
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 5));
        for (let k = 0; k < n; k++) {
          let x = ax + ((bx - ax) * k) / n;
          let z = az + ((bz - az) * k) / n;
          let y = 0;
          // the Ausguck: the last points of the route stand on the deck at +44
          if (i >= built.length - 8 && Math.hypot(x, z) < 13) y = 44;
          const minute = am + ((bm - am) * k) / n;
          let near = cues.find((c) => Math.hypot(c[0] - x, c[2] - z) < 30 && Math.abs(c[1] - y) < 8);
          let look = null;
          if (near && r() < 0.5) {
            // steps up to the cue (something moves or makes a sound there) and looks at it
            [x, z] = [near[0] + (r() - 0.5) * 4, near[2] + (r() - 0.5) * 4];
            y = near[1] > 30 ? near[1] : 0;
            look = near;
          } else if (r() < 0.2) {
            const a = r() * Math.PI * 2;
            const d = r() * 30;
            x += Math.cos(a) * d;
            z += Math.sin(a) * d;
            near = null;
          }
          steps.push({ x, y, z, yaw: r() * 360, look, wiggle: !!look && r() < 0.35, press: look ? r() < 0.45 : r() < 0.3, choice: r() < 0.6, rover: !look && y === 0 && Math.hypot(x, z) < 95 && r() < 0.5, minute });
        }
      }
      const res = await page.evaluate(async (steps) => {
        const A = window.__academy;
        const S = A.game.gameLayer.secrets;
        const wait = (ms) => new Promise((res) => setTimeout(res, ms));
        const times = {};
        let before = new Set(S.found());
        const rovers = async () => (A.debugActions().includes('world:life-rovers') ? (await A.solve('world', 'life-rovers')).rovers : []);
        for (const st of steps) {
          A.teleport([st.x, st.y, st.z], { yaw: st.yaw, pitch: -5 });
          await wait(120);
          if (st.rover) {
            // a rover comes by: step into its way and watch what it does
            const list = await rovers();
            const i = list.findIndex((rv) => Math.hypot(rv.pos[0] - st.x, rv.pos[2] - st.z) < 18 && rv.state === 'drive');
            if (i >= 0) {
              const at = await A.solve('world', `life-rover-front-${i}`);
              A.teleport(at);
              A.lookAt(list[i].pos[0], 0.4, list[i].pos[2]);
              await wait(2600);
            }
          }
          if (st.look) A.lookAt(st.look[0], st.look[1] + 0.9, st.look[2]);
          else A.look(st.yaw + 120, 0);
          await wait(60);
          if (st.wiggle) for (let i = 0; i < 6; i++) {
            A.lookDelta(i % 2 ? -70 : 70, 0);
            await wait(80);
          }
          if (st.press) {
            A.interactNearest(3.5);
            await wait(150);
            // a panel opened (operate mode): try the key it offers
            if (A.game.operate?.isActive) {
              await wait(500);
              A.press('KeyE');
              await wait(400);
            }
            // a curious player answers a question it is asked (a choice modal): one of its buttons
            const btns = [...document.querySelectorAll('.modal-backdrop:not(.passthrough) .modal button.btn')];
            if (btns.length && st.choice) {
              btns[Math.floor(Math.random() * btns.length)].click();
              await wait(150);
            }
          }
          A.closeModals();
          A.exitOperate();
          for (const id of S.found()) if (!before.has(id)) times[id] = st.minute;
          before = new Set(S.found());
        }
        return { found: S.found(), times };
      }, steps);
      perRun.push(res);
      for (const id of res.found) {
        const row = out.secrets.find((x) => x.id === id);
        if (!row) continue;
        row.finds++;
        if ((res.times[id] ?? Infinity) <= FIRST_MIN) row.early++;
      }
      await ctx.close();
      process.stdout.write(`\rcuriosity bot: run ${run + 1}/${runs} · ${res.found.length} found`);
    }
    process.stdout.write('\n');
    for (const row of out.secrets) {
      row.rate = round(row.finds / runs, 2);
      console.log(`${row.id.padEnd(24)} level ${row.level} · ${row.area} · path ${row.distance} m · cue ${row.cueDistance ?? '—'} m · ${row.reachable ? 'reachable' : 'NOT reachable'} · found in ${row.finds}/${runs} runs${row.early ? ` (${row.early} in the first ${FIRST_MIN} min)` : ''}${row.pending ? ` · pending: ${row.pending}` : ''}${row.play ? ' · found by playing its station (not checked)' : ''}`);
      if (RATE[row.level] != null && !row.pending && !row.play) v.check(`${row.id} (level ${row.level}): curiosity-bot find rate`, row.rate, '>=', RATE[row.level]);
    }
    // per run: the median of finds, and a find in the first 10 minutes (§4.13 discoverability target)
    const counts = perRun.map((x) => x.found.length);
    const early = perRun.filter((x) => Object.values(x.times).some((m) => m <= FIRST_MIN)).length;
    out.runs = counts;
    out.median = median(counts);
    out.firstShare = round(early / Math.max(1, perRun.length), 2);
    const pendingIds = out.secrets.filter((x) => x.pending).map((x) => x.id);
    console.log(`finds per run: ${counts.join(' ')} · median ${out.median} · a find in the first ${FIRST_MIN} min in ${early}/${perRun.length} runs${pendingIds.length ? ` · pending (no trigger yet): ${pendingIds.join(', ')}` : ''}`);
    if (!selftest) {
      v.check(`curiosity bot: median finds per run`, out.median, '>=', MEDIAN_FINDS);
      v.check(`curiosity bot: share of runs with a find in the first ${FIRST_MIN} min`, out.firstShare, '>=', FIRST_SHARE);
    }
  }
} finally {
  await browser.close().catch(() => {});
  await srv.close();
}
if (pendingWhy) {
  console.log(`secret-audit: pending — ${pendingWhy}`);
  v.note(`pending: ${pendingWhy}`);
} else if (!args['no-playtest'] && !selftest) {
  // secrets never gate (D35): the quick playtest with none and with every secret found
  for (const set of ['none', 'all']) {
    const r = spawnSync(process.execPath, ['tools/playtest.mjs', '--lang', 'de', '--mode', 'entdecker', '--quick', '--secrets', set], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, PT_DIR: `playtest-secrets-${set}` } });
    const last = (r.stdout || '').trim().split('\n').slice(-1)[0];
    console.log(`playtest --quick --secrets ${set}: ${last}`);
    v.require(`playtest with ${set === 'none' ? 'no secret' : 'every secret'} found`, r.status === 0, last);
  }
}
saveJson(`secret-audit${selftest ? '-selftest' : ''}.json`, out);
if (selftest) {
  const t = out.secrets ?? [];
  const plaza = t.find((x) => x.id === '_t-plaza');
  const far = t.find((x) => x.id === '_t-far');
  const ok = !!plaza && !!far && plaza.distance <= 15 && plaza.reachable && plaza.finds > 0 && Number.isFinite(far.distance) && far.cueDistance != null && typeof far.reachable === 'boolean';
  console.log(ok ? `OK   selftest: the audit measured both test secrets (plaza found in ${plaza.finds}/${runs} runs, far ${far.finds}/${runs})` : `FAIL selftest: ${JSON.stringify(t)}`);
  process.exit(ok ? 0 : 1);
}
v.exit(args);
