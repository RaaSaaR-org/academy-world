// discover-check scenario `load` (WP-D0, plan §2.3): bytes, as the brotli host sends them.
//   first load    everything requested until the start card ≤ 1.85 MB (the desktop title's 1.75 MB + Discover)
//   core chunks   the Discover core chunk with its own static imports and CSS (the chunk graph of the build,
//                 through index.html's import map), not counting what the game already loaded: core + tour +
//                 content ≤ 60 KB
//   viewer, film  the JS / CSS requested while modes.enter('viewer') / ('film') runs: ≤ 30 KB / ≤ 10 KB
//                 (pending until D2 / D3 register the modes)
//   stills        the stills chunk graph (≤ 400 KB before the first image is checked by `gate` on the wire)
import fs from 'node:fs';
import path from 'node:path';

export const scenario = { name: 'load' };

const KB = 1024;

/** the build's chunk graph: file → static imports (resolved through the import map) */
function graph(dist, prefix) {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const map = JSON.parse(html.match(/<script type="importmap"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '{"imports":{}}').imports ?? {};
  const files = fs.readdirSync(path.join(dist, 'assets'));
  const resolve = (spec) => {
    const key = spec.startsWith('./') ? `${prefix}assets/${spec.slice(2)}` : spec;
    const real = map[key] ?? key;
    return path.basename(real);
  };
  const deps = new Map();
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dist, 'assets', f), 'utf8');
    const imps = [...src.matchAll(/(?:\bfrom|\bimport)\s*"(\.\/[^"]+\.js)"/g)].map((m) => resolve(m[1]));
    deps.set(f, { src, imps: [...new Set(imps)] });
  }
  const closure = (start) => {
    const seen = new Set();
    const walk = (f) => {
      if (seen.has(f) || !deps.has(f)) return;
      seen.add(f);
      for (const d of deps.get(f).imps) walk(d);
    };
    walk(start);
    return seen;
  };
  const br = (f) => {
    const p = path.join(dist, 'assets', f);
    return fs.existsSync(p + '.br') ? fs.statSync(p + '.br').size : fs.existsSync(p) ? fs.statSync(p).size : 0;
  };
  const cssOf = (f) => {
    const stem = f.replace(/-[\w-]{8}\.js$/, '');
    return files.filter((x) => x.endsWith('.css') && x.replace(/-[\w-]{8}\.css$/, '') === stem);
  };
  const find = (needle) => [...deps.entries()].find(([, d]) => d.src.includes(needle))?.[0] ?? null;
  const entry = path.basename(html.match(/<script type="module"[^>]*\ssrc="([^"]+\.js)"/)?.[1] ?? '');
  return { deps, closure, br, cssOf, find, entry };
}

export default async function run(t) {
  const g = graph(t.dist, t.prefix);
  // the game's side: the entry and the Game chunk (loaded before Discover's chunk)
  const game = g.find('[boot] fatal');
  const base = new Set([...g.closure(g.entry), ...(game ? g.closure(game) : [])]);
  const core = g.find('discover:state');
  if (!core) t.require('the Discover core chunk exists', false);
  else {
    const own = [...g.closure(core)].filter((f) => !base.has(f));
    const css = [...new Set(own.flatMap((f) => g.cssOf(f)))];
    const total = [...own, ...css].reduce((s, f) => s + g.br(f), 0) / KB;
    t.log(`core: ${[...own, ...css].map((f) => `${f} ${(g.br(f) / KB).toFixed(1)} KB`).join(', ')}`);
    t.check('Discover core + tour + content (brotli)', total, '<=', 60, ' KB');
  }
  const stills = g.find('dsc-stage');
  if (stills) {
    const own = [...g.closure(stills)].filter((f) => !g.closure(g.entry).has(f));
    const css = [...new Set(own.flatMap((f) => g.cssOf(f)))];
    const total = [...own, ...css].reduce((s, f) => s + g.br(f), 0) / KB;
    t.log(`stills chunks: ${total.toFixed(1)} KB (${own.length} JS, ${css.length} CSS)`);
    const heavy = own.filter((f) => /^(Game|world|vendor-three|rapier)/.test(f));
    t.require('the stills chunks import no game, three, world or Rapier chunk', heavy.length === 0, heavy.join(', '));
  }

  // the first load to the start card, on the wire
  const from = Date.now();
  const h = await t.open('?discover=1&stills=0', { throttle: false });
  await t.waitState(h.page, (s) => s.startCard, 180000);
  const until = Date.now();
  const first = t.serverLog.filter((e) => e.t >= from && e.t <= until && e.status === 200);
  const kb = first.reduce((s, e) => s + e.br, 0) / KB;
  t.check('first load to the start card (brotli)', kb / 1024, '<=', 1.85, ' MB');
  t.log(`first load ${(kb / 1024).toFixed(2)} MB in ${first.length} requests`);

  // the lazy modes (D2, D3)
  for (const [mode, cap, arg] of [
    ['viewer', 30, {}],
    ['film', 10, { stills: true }],
  ]) {
    const has = await h.page.evaluate((m) => window.__discover.handle.modes.has(m), mode);
    if (!has) {
      t.pending(`${mode} chunk ≤ ${cap} KB: no '${mode}' mode registered yet`);
      continue;
    }
    if (mode === 'viewer') {
      await h.page.evaluate(() => window.__discover.start());
      await t.waitState(h.page, (s) => s.stop != null && !s.flying, 120000);
    }
    if (mode === 'film') {
      // the finale's chunk is the game's (loaded in idle time after game:ready, plan §1.3): the film's own
      // chunk is measured, so the finale (its tool hook loads it) and the deferred areas are in first
      await t.waitState(h.page, (s) => s.ready, 180000);
      await h.page.evaluate(async () => {
        const lo = window.__academy.ext('liftoff');
        if (lo) await lo();
      });
      for (let k = 0; k < 60 && t.serverLog.some((e) => e.t >= Date.now() - 2000 && /\.(js|css)$/.test(e.path)); k++) await h.page.waitForTimeout(500);
    }
    const t0 = Date.now();
    await h.page.evaluate(([m, a]) => void window.__discover.handle.modes.enter(m, a), [mode, arg]);
    await h.page.waitForTimeout(8000);
    const got = t.serverLog.filter((e) => e.t >= t0 && /\.(js|css)$/.test(e.path) && e.status === 200);
    const size = got.reduce((s, e) => s + e.br, 0) / KB;
    t.log(`${mode}: ${got.map((e) => `${path.basename(e.path)} ${(e.br / KB).toFixed(1)} KB`).join(', ') || 'nothing new'}`);
    t.check(`${mode} chunks (JS + CSS on entering, brotli)`, size, '<=', cap, ' KB');
  }
  await h.close();
}
