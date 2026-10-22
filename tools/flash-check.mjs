#!/usr/bin/env node
// Flash safety of the Phase 7 sequences (docs/PHASE7-PLAN.md §5.10, §4 conventions; WCAG 2.3.1 general
// flash threshold). The game renders into a 1024 × 768 canvas; after every rendered frame the page reads
// the frame back (gl.readPixels, in the same task as the render) and averages the relative luminance in
// a 6 × 6 cell grid; every 2 × 2 block of cells is one 341 × 256 window (25 overlapping windows, the
// WCAG 10° field at 1024 × 768). A flash is a pair of opposing luminance changes of ≥ 10 % of the
// maximum where the darker frame is below 0.80; a window fails with more than 3 flashes in any
// one-second period.
//
//   node tools/flash-check.mjs --sequence liftoff|traum-glitch|duck-slowmo|hail|spray|all [--rm] [--dev | --dist <dir>]
//   node tools/flash-check.mjs --selftest        # a flashing test page fails, a slow fade passes
//
// Sequences are registered by their owners: __academy.ext('sequence:<name>', async ({ rm }) => { … })
// starts the sequence and resolves when it has ended (WP13 liftoff, WP10 traum-glitch, WP5 duck-slowmo,
// WP9 hail, WP3/WP12 spray). `all` = every registered sequence:* hook; a named sequence that is not
// registered yet is skipped with a warning (pending). --rm runs with reduced motion (a fresh profile
// with prefers-reduced-motion: reduce). Exit 1 when a sequence fails or the self-test judges wrongly.
import { gameServer, launchChromium, parseArgs, saveJson, round } from './lib/measure.mjs';

const args = parseArgs(process.argv.slice(2));
export const KNOWN_SEQUENCES = { liftoff: 'WP13', 'traum-glitch': 'WP10', 'duck-slowmo': 'WP5', hail: 'WP9', spray: 'WP3/WP12' };
const W = 1024;
const H = 768;
const MAX_FLASHES = 3;
const DELTA = 0.1;
const DARK = 0.8;

/**
 * In-page: window.__flash = { attach(gl), sample(), take() }. sample() reads the drawing buffer of `gl`
 * (call it right after the frame was drawn) and stores the mean relative luminance of a 6 × 6 grid.
 */
export const PROBE = () => {
  if (window.__flash) return;
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const N = 6;
  let gl = null;
  let buf = null;
  const frames = [];
  window.__flash = {
    attach(g) {
      gl = g;
      frames.length = 0;
    },
    sample() {
      if (!gl) return;
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      if (!buf || buf.length !== w * h * 4) buf = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER ?? gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const sums = new Float64Array(N * N);
      const counts = new Uint32Array(N * N);
      const step = 2;
      for (let y = 0; y < h; y += step) {
        // readPixels rows run bottom-up: row y is cell row (h - 1 - y)
        const cy = Math.min(N - 1, Math.floor(((h - 1 - y) * N) / h));
        const row = y * w * 4;
        for (let x = 0; x < w; x += step) {
          const i = row + x * 4;
          const L = 0.2126 * lut[buf[i]] + 0.7152 * lut[buf[i + 1]] + 0.0722 * lut[buf[i + 2]];
          const c = cy * N + Math.min(N - 1, Math.floor((x * N) / w));
          sums[c] += L;
          counts[c]++;
        }
      }
      const cells = new Array(N * N);
      for (let c = 0; c < N * N; c++) cells[c] = Math.round((sums[c] / Math.max(1, counts[c])) * 10000) / 10000;
      frames.push({ t: performance.now() / 1000, cells, w, h });
    },
    take() {
      const out = frames.slice();
      frames.length = 0;
      return out;
    },
  };
};

/** The 25 windows (2 × 2 cells of the 6 × 6 grid) of one frame: mean luminance each. */
function windows(cells) {
  const out = [];
  for (let wy = 0; wy < 5; wy++)
    for (let wx = 0; wx < 5; wx++) out.push((cells[wy * 6 + wx] + cells[wy * 6 + wx + 1] + cells[(wy + 1) * 6 + wx] + cells[(wy + 1) * 6 + wx + 1]) / 4);
  return out;
}

/** Opposing luminance changes of one series ({ t, L }): hysteresis ≥ DELTA, the darker side < DARK. */
export function changes(series) {
  const out = [];
  if (!series.length) return out;
  let dir = 0;
  let ref = series[0].L;
  let lo = ref;
  let hi = ref;
  for (const { t, L } of series) {
    if (dir === 0) {
      lo = Math.min(lo, L);
      hi = Math.max(hi, L);
      if (hi - lo >= DELTA && lo < DARK) {
        dir = L === hi ? 1 : -1;
        out.push({ t, dir });
        ref = L;
      }
    } else if (dir === 1) {
      if (L > ref) ref = L;
      else if (ref - L >= DELTA && L < DARK) {
        out.push({ t, dir: -1 });
        dir = -1;
        ref = L;
      }
    } else {
      if (L < ref) ref = L;
      else if (L - ref >= DELTA && ref < DARK) {
        out.push({ t, dir: 1 });
        dir = 1;
        ref = L;
      }
    }
  }
  return out;
}

/** The most flashes (pairs of opposing changes) in any one second of a change list. */
export function maxFlashesPerSecond(ch) {
  let best = 0;
  let at = null;
  for (let i = 0, j = 0; i < ch.length; i++) {
    while (ch[i].t - ch[j].t >= 1) j++;
    const n = Math.floor((i - j + 1) / 2);
    if (n > best) {
      best = n;
      at = ch[j].t;
    }
  }
  return { flashes: best, at };
}

/** Judge recorded frames: per window the worst second. */
export function analyse(frames) {
  if (frames.length < 2) return { ok: true, frames: frames.length, worst: null, windows: [] };
  const t0 = frames[0].t;
  const per = Array.from({ length: 25 }, () => []);
  for (const f of frames) {
    const ws = windows(f.cells);
    for (let k = 0; k < 25; k++) per[k].push({ t: f.t - t0, L: ws[k] });
  }
  const res = per.map((s, k) => ({ window: k, ...maxFlashesPerSecond(changes(s)), range: [round(Math.min(...s.map((x) => x.L)), 3), round(Math.max(...s.map((x) => x.L)), 3)] }));
  const worst = res.reduce((a, b) => (b.flashes > a.flashes ? b : a));
  const span = frames[frames.length - 1].t - t0;
  return { ok: worst.flashes <= MAX_FLASHES, frames: frames.length, fps: round((frames.length - 1) / Math.max(1e-3, span), 1), seconds: round(span, 1), worst, windows: res };
}

const describe = (name, r) => {
  const w = r.worst;
  const where = w ? `window ${w.window} (col ${w.window % 5}, row ${Math.floor(w.window / 5)}), ${w.flashes} flash(es) in one second${w.at != null ? ` from ${round(w.at, 1)} s` : ''}, luminance ${w.range[0]}–${w.range[1]}` : 'no frames';
  return `${r.ok ? 'PASS' : 'FAIL'}  ${name.padEnd(28)} ${String(r.frames).padStart(5)} frames ${r.seconds ?? 0} s @ ${r.fps ?? 0} fps · worst ${where} (fail > ${MAX_FLASHES})`;
};

// ───────────────────────────── self-test ─────────────────────────────

/** In-page test pattern on a 1024 × 768 WebGL2 canvas: run(kind, seconds) → frames. */
const PATTERN = async ([kind, seconds]) => {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 768;
  document.body.style.margin = '0';
  document.body.appendChild(c);
  const gl = c.getContext('webgl2', { preserveDrawingBuffer: false });
  window.__flash.attach(gl);
  const t0 = performance.now();
  await new Promise((done) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t > seconds) return done();
      let v = 0;
      let area = null;
      if (kind === 'flash5hz') v = Math.floor(t * 10) % 2;
      else if (kind === 'fade05hz') v = 0.5 + 0.5 * Math.sin(t * Math.PI);
      else if (kind === 'flicker-low') v = 0.3 + 0.03 * (Math.floor(t * 10) % 2);
      else if (kind === 'patch5hz') {
        area = [341, 256, 341, 256];
        v = Math.floor(t * 10) % 2;
      } else if (kind === 'flash3hz') v = Math.floor(t * 6) % 2;
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0.1, 0.1, 0.1, 1);
      if (!area) gl.clearColor(v, v, v, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (area) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(...area);
        gl.clearColor(v, v, v, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.disable(gl.SCISSOR_TEST);
      }
      window.__flash.sample();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  c.remove();
  return window.__flash.take();
};

async function selftest(browser) {
  let bad = 0;
  const out = [];
  const cases = [
    { kind: 'flash5hz', expect: false, about: 'full-screen black/white at 5 flashes per second' },
    { kind: 'patch5hz', expect: false, about: 'one 341 × 256 patch at 5 flashes per second' },
    { kind: 'flash3hz', expect: true, about: '3 flashes per second (the limit, allowed)' },
    { kind: 'fade05hz', expect: true, about: 'slow full-contrast fade, 0.5 Hz' },
    { kind: 'flicker-low', expect: true, about: '5 Hz flicker of 3 % luminance (below 10 %)' },
  ];
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.evaluate(PROBE);
  for (const c of cases) {
    const frames = await page.evaluate(PATTERN, [c.kind, 3]);
    const r = analyse(frames);
    const right = r.ok === c.expect;
    if (!right) bad++;
    out.push({ ...c, ok: r.ok, worst: r.worst, frames: r.frames });
    console.log(`${right ? 'OK  ' : 'BAD '} ${describe(c.kind, r)}  — ${c.about}: expected ${c.expect ? 'pass' : 'fail'}`);
  }
  await page.close();
  // the game path: the render hook on the real canvas, through the sequence:* contract
  const srv = await gameServer(args, { prefer: 'dev' });
  try {
    const gp = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await gp.goto(`${srv.url}/?skipIntro=1&quality=high`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await gp.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 180000, polling: 200 });
    await gp.evaluate(PROBE);
    const hasExt = await gp.evaluate(() => typeof window.__academy.ext === 'function');
    if (!hasExt) {
      console.log('BAD  the build has no __academy.ext (the sequence contract)');
      bad++;
    } else {
      await gp.evaluate(SELFTEST_SEQUENCES);
      for (const [name, expect] of [['_selftest-flash', false], ['_selftest-calm', true]]) {
        const r = await runSequence(gp, name, false);
        const right = r.ok === expect && r.frames > 30;
        if (!right) bad++;
        out.push({ kind: name, expect, ok: r.ok, worst: r.worst, frames: r.frames });
        console.log(`${right ? 'OK  ' : 'BAD '} ${describe(`game ${name}`, r)}  — expected ${expect ? 'pass' : 'fail'}`);
      }
    }
    await gp.close();
  } finally {
    await srv.close();
  }
  return { bad, out };
}

// ───────────────────────────── the game ─────────────────────────────

/**
 * In-page: sample after every frame the game draws (RenderSystem.render), until stopped. The self-test
 * paints window.__flashOverlay (a grey level) over the finished frame through the renderer's own clear,
 * so three's state cache stays in sync.
 */
const HOOK = () => {
  const rs = window.__academy.game.rs;
  window.__flash.attach(rs.renderer.getContext());
  if (!rs.__flashOrig) {
    rs.__flashOrig = rs.render;
    let color = null;
    rs.scene.traverse((o) => {
      if (!color && o.material && !Array.isArray(o.material) && o.material.color && o.material.color.isColor) color = o.material.color.clone();
    });
    rs.render = function (dt) {
      const r = rs.__flashOrig.call(this, dt);
      const v = window.__flashOverlay;
      if (v != null && color) {
        const R = rs.renderer;
        const old = R.getClearColor(color.clone());
        const oldA = R.getClearAlpha();
        R.setRenderTarget(null);
        R.setClearColor(color.clone().setRGB(v, v, v), 1);
        R.clear(true, false, false);
        R.setClearColor(old, oldA);
      }
      if (window.__flashOn) window.__flash.sample();
      return r;
    };
  }
};

/** In-page: the self-test sequences on the real game canvas (registered only by --selftest). */
const SELFTEST_SEQUENCES = () => {
  const A = window.__academy;
  A.ext('sequence:_selftest-flash', async () => {
    const t0 = performance.now();
    await new Promise((done) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        if (t > 3) {
          window.__flashOverlay = null;
          return done();
        }
        window.__flashOverlay = Math.floor(t * 10) % 2;
        A.game.requestRender(2);
        requestAnimationFrame(tick);
      };
      tick();
    });
  });
  A.ext('sequence:_selftest-calm', async () => {
    await new Promise((r) => setTimeout(r, 3000));
  });
};

async function runSequence(page, name, rm) {
  await page.evaluate(HOOK);
  await page.evaluate(() => window.__flash.take());
  await page.evaluate(() => (window.__flashOn = true));
  const res = await page.evaluate(
    async ([hook, rm]) => {
      const fn = window.__academy.ext(hook);
      const t0 = performance.now();
      await Promise.race([Promise.resolve(fn({ rm })), new Promise((r) => setTimeout(r, 180000))]);
      await new Promise((r) => setTimeout(r, 500));
      return { ms: performance.now() - t0 };
    },
    [`sequence:${name}`, rm],
  );
  await page.evaluate(() => (window.__flashOn = false));
  const frames = await page.evaluate(() => window.__flash.take());
  return { ...analyse(frames), ms: Math.round(res.ms) };
}

const browser = await launchChromium();
let exit = 0;
const report = { selftest: null, sequences: {} };
try {
  if (args.selftest) {
    const st = await selftest(browser);
    report.selftest = st.out;
    console.log(st.bad ? `FAIL selftest: ${st.bad} pattern(s) judged wrong` : 'OK   selftest: the flashing test pages fail, the safe ones pass');
    exit = st.bad ? 1 : 0;
  } else {
    const want = String(args.sequence ?? 'all');
    const rm = !!args.rm;
    const srv = await gameServer(args);
    try {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: rm ? 'reduce' : 'no-preference' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
      // every sequence starts from a fresh boot (integrator, wave 2): the lift-off leaves the island airborne
      // at dusk, and the duck sequence that ran after it in the same page could not reach its station (its
      // worker was terminated as „far“ while the generation waited)
      const boot = async () => {
        await page.goto(`${srv.url}/?reset=1&skipIntro=1&quality=high`, { waitUntil: 'domcontentloaded', timeout: 180000 });
        await page.waitForFunction(() => window.__academy && window.__academy.ready === true, null, { timeout: 180000, polling: 200 });
        await page.evaluate(() => typeof window.__academy.loadAll === 'function' && window.__academy.loadAll());
        await page.evaluate(PROBE);
      };
      await boot();
      const st = await page.evaluate(() => ({ rm: window.__academy.game.settings.data.reducedMotion, hooks: (window.__academy.ext?.() ?? []).filter((n) => n.startsWith('sequence:')).map((n) => n.slice(9)), size: [window.__academy.game.rs.renderer.getContext().drawingBufferWidth, window.__academy.game.rs.renderer.getContext().drawingBufferHeight] }));
      if (rm && !st.rm) throw new Error('reduced motion did not take (settings.data.reducedMotion is false)');
      if (st.size[0] !== W || st.size[1] !== H) console.log(`note  the drawing buffer is ${st.size.join(' × ')} (the windows scale with it)`);
      const names = want === 'all' ? [...new Set([...Object.keys(KNOWN_SEQUENCES), ...st.hooks])] : want.split(',');
      let ran = 0;
      for (const name of names) {
        if (!st.hooks.includes(name)) {
          console.log(`WARN  ${name.padEnd(28)} pending: no sequence:${name} hook registered yet${KNOWN_SEQUENCES[name] ? ` (owner ${KNOWN_SEQUENCES[name]})` : ''}`);
          report.sequences[name] = { pending: true };
          continue;
        }
        if (ran) await boot();
        let r;
        try {
          r = await runSequence(page, name, rm);
        } catch (e) {
          console.log(`FAIL  ${name}: the sequence threw: ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}`);
          report.sequences[name] = { ok: false, error: String(e?.message ?? e).slice(0, 400) };
          exit = 1;
          ran++;
          continue;
        }
        ran++;
        report.sequences[name] = { ok: r.ok, frames: r.frames, fps: r.fps, seconds: r.seconds, worst: r.worst, ms: r.ms };
        console.log(describe(`${name}${rm ? ' (rm)' : ''}`, r));
        if (!r.ok) exit = 1;
        if (r.frames < 2) {
          console.log(`FAIL  ${name}: no frames were drawn while it ran`);
          exit = 1;
        }
      }
      for (const e of errors) console.log(`page error: ${e.slice(0, 200)}`);
      if (errors.length) exit = 1;
      console.log(exit ? 'FAIL flash-check' : `OK   flash-check: ${ran} sequence(s) within ≤ ${MAX_FLASHES} flashes per second${ran ? '' : ' (none registered yet)'}`);
      await ctx.close();
    } finally {
      await srv.close();
    }
  }
} finally {
  await browser.close().catch(() => {});
}
saveJson(`flash-check${args.rm ? '-rm' : ''}${args.selftest ? '-selftest' : ''}.json`, report);
process.exit(exit);
