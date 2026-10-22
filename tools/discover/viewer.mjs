// discover-check scenario `viewer` (WP-D2, plan §3.4, §5 WP-D2): the Schauhalle viewer and the robot cards.
//   bundle    the viewer's chunks (core install, robot data, studio) carry no amber exhibit — no id, name or
//             the amber line — unless the build has VITE_AMBER=1 (--amber), and then the data has all four
//   cards     handle.robots: ids() = the hall's robots (17, 21 with --amber), in the hall's order; every
//             card has kind, „Kann heute“, size, MODELL, payload and the licence row (attribution), a chip
//             on every measured number, the sources with „Stand“; amber ids → null unless --amber (then the
//             amber line); the SO-101 leader arm and the G1 Dex3 get their hall robot's card
//   open      every robot opens: 0 program links from the call to the robot on screen (INSTRUMENT, after the
//             world settled at the hall), ≤ 2 parsed files of the viewer's own, ≤ 60 draws, the camera sees
//             only the studio's layer
//   touch     a category tab and a robot of the strip by touch, the sheet's › to the next robot, a drag
//             orbits (pitch within −60…5°), a pinch stays within 0.6–3 × the fit, „Nah“ frames closer,
//             reduced motion stops the turntable, DE · EN relabels in place, the back button returns to
//             the tour with the camera's layers and projection restored
//   rules     0 third-party requests, nothing outside /academy-world/, 0 MuJoCo requests, 0 page errors
//   shots     4 robots (GEHEN, GREIFEN & FAHREN, SELBST BAUEN, the H2) at 390×844, one at 844×390
import fs from 'node:fs';
import path from 'node:path';
import { INSTRUMENT, ROOT } from '../lib/measure.mjs';
import { inKeep } from '../lib/glyphs.mjs';
import { tapEl } from './boot.mjs';

export const scenario = { name: 'viewer' };

const GEN = path.join(ROOT, 'src', 'discover', 'data', 'robots.gen.ts');
const SHOTS = ['unitree-g1', 'fanuc-r2000ic-165f', 'so101', 'unitree-h2'];

/** the generated robot entries (one JSON object per line) */
function genRobots() {
  const lines = fs.readFileSync(GEN, 'utf8').split('\n');
  const out = [];
  for (const l of lines) {
    const m = /^\s*(\{ "id": .*\}),\s*$/.exec(l);
    if (m) out.push(JSON.parse(m[1]));
  }
  return out;
}

/** the viewer's chunks of the build: the core (install), the robot data, the studio */
function viewerChunks(dist) {
  const dir = path.join(dist, 'assets');
  const files = fs.readdirSync(dir).filter((f) => /\.(js|css)$/.test(f));
  const pick = (needle) => files.filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes(needle));
  return [...new Set([...pick('discover:state'), ...pick('zone.schauhalle.wall.line'), ...pick('discover:studio'), ...pick('.dsv-pick')])].map((f) => ({ f, text: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

const CAM = () => {
  const c = window.__academy.game.camera;
  const d = c.getWorldDirection(c.position.clone());
  const rig = window.__discover.handle.camera.rig;
  const tgt = rig && rig.kind === 'orbit' ? rig.target : null;
  const dist = tgt ? Math.hypot(c.position.x - tgt[0], c.position.y - tgt[1], c.position.z - tgt[2]) : null;
  return { yaw: (Math.atan2(-d.x, -d.z) * 180) / Math.PI, pitch: (Math.asin(d.y) * 180) / Math.PI, dist, fit: rig?.distance ?? null, limits: rig?.limits ?? null };
};

/** pointer events on the canvas (touch): a drag of dx, dy px; a pinch by `scale` */
const GESTURE = ([kind, a, b]) => {
  const cv = document.getElementById('game');
  const r = cv.getBoundingClientRect();
  const cx = r.left + r.width / 2,
    cy = r.top + r.height * 0.45;
  const ev = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  if (kind === 'drag') {
    ev('pointerdown', 1, cx, cy);
    for (let i = 1; i <= 12; i++) ev('pointermove', 1, cx + (a * i) / 12, cy + (b * i) / 12);
    ev('pointerup', 1, cx + a, cy + b);
  } else {
    const d0 = 50;
    ev('pointerdown', 1, cx - d0, cy);
    ev('pointerdown', 2, cx + d0, cy);
    for (let i = 1; i <= 12; i++) {
      const d = d0 * (1 + ((a - 1) * i) / 12);
      ev('pointermove', 1, cx - d, cy);
      ev('pointermove', 2, cx + d, cy);
    }
    ev('pointerup', 1, cx - d0 * a, cy);
    ev('pointerup', 2, cx + d0 * a, cy);
  }
};

const VS = () => window.__discoverViewer.state();

/** open a robot in the viewer and wait until it is on screen; INSTRUMENT links and frames in between */
async function openRobot(page, id) {
  return page.evaluate(async (robot) => {
    const P = window.__perf;
    P.start();
    const t0 = performance.now();
    await Promise.race([window.__discover.handle.modes.enter('viewer', { robot }), new Promise((r) => setTimeout(r, 60000))]);
    const until = performance.now() + 60000;
    while (performance.now() < until) {
      const s = window.__discoverViewer.state();
      if (s.shown && s.robot === robot) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    // two drawn frames with the robot
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));
    P.stop();
    const links = P.frames.reduce((s, f) => s + (f.d.link || 0), 0);
    const s = window.__discoverViewer.state();
    const perf = window.__discover.perf();
    const sheet = document.querySelector('.dsc-sheet');
    return { ms: Math.round(performance.now() - t0), links, shown: s.shown && s.robot === robot, files: s.files, draws: perf.draws, mask: s.cameraMask, layer: s.layer, card: sheet?.dataset.card ?? null };
  }, id);
}

export default async function run(t) {
  const amber = !!t.args.amber;
  const gen = genRobots();
  const amberIds = gen.filter((r) => r.amber).map((r) => r.id);
  const cleared = gen.filter((r) => !r.amber);

  // ── the viewer's own UI words: DE and EN, every character in the kept font ranges ──
  const { V } = await import(path.join(ROOT, 'src', 'discover', 'viewer', 'strings.ts'));
  const half = Object.entries(V).filter(([, v]) => !(v?.de && v?.en)).map(([k]) => k);
  t.require('viewer/strings.ts: every UI string in DE and EN', half.length === 0, half.join(', '));
  const chars = [...new Set([...Object.values(V).flatMap((v) => [v.de, v.en]).join(''), ...fs.readFileSync(GEN, 'utf8')].filter((c) => !/\s/.test(c) && !inKeep(c.codePointAt(0))))];
  t.require('viewer strings and robot data: every character in the kept font ranges', chars.length === 0, chars.join(' '));

  // ── bundle ──
  const chunks = viewerChunks(t.dist);
  t.require('the viewer chunks are in the build (core, data, studio)', chunks.length >= 3, chunks.map((c) => c.f).join(', '));
  const needles = gen.filter((r) => r.amber).flatMap((r) => [r.name.de, r.name.en, ...(r.short.length >= 4 ? [r.short] : []), `\`${r.id}\``, `"${r.id}"`, `'${r.id}'`]);
  const amberLine = gen.find((r) => r.amber)?.rows.license.cond;
  if (amberLine) needles.push(amberLine.de, amberLine.en);
  const hits = chunks.flatMap((c) => [...new Set(needles.filter((n) => c.text.includes(n)))].map((n) => `${c.f}: ${n}`));
  if (amber) t.require('VITE_AMBER=1: the amber exhibits and the amber line are in the viewer data', needles.every((n) => n.startsWith('`') || n.startsWith('"') || n.startsWith("'") || chunks.some((c) => c.text.includes(n))) && hits.length > 0, `${hits.length} hits`);
  else t.require('without VITE_AMBER: no amber exhibit and no amber line in the viewer bundle text', hits.length === 0, hits.slice(0, 6).join(' · '));

  const h = await t.open('?discover=1&stills=0', { init: [INSTRUMENT] });
  const { page } = h;
  await t.waitState(page, (s) => s.startCard, 180000);
  await page.evaluate(() => window.__discover.start());
  await t.waitState(page, (s) => s.stop != null && !s.flying, 120000);

  // ── cards ──
  const reg = await page.evaluate(() => ({ robots: !!window.__discover.handle.robots, viewer: window.__discover.handle.modes.has('viewer') }));
  t.require('handle.robots and the viewer mode are registered', reg.robots && reg.viewer, JSON.stringify(reg));
  const want = (amber ? gen : cleared).slice().sort((a, b) => a.order - b.order).map((r) => r.id);
  const ids = await page.evaluate(() => window.__discover.handle.robots.ids());
  t.require(`ids(): the ${want.length} hall robots of this build, in the hall's order`, JSON.stringify(ids) === JSON.stringify(want), ids.join(', '));
  const cards = await page.evaluate(
    ([all, aliases]) => {
      const R = window.__discover.handle.robots;
      const t = window.__discover.handle.text;
      const one = (id) => {
        const c = R.card(id);
        if (!c) return null;
        const rows = c.blocks.flatMap((b) => (b.kind === 'rows' ? b.rows : []));
        return {
          id: c.id,
          title: t.resolve(c.title),
          rows: rows.map((r) => ({ label: t.resolve(r.label), value: t.resolve(r.value), chip: r.chip ?? null, cond: r.cond ? t.resolve(r.cond) : null })),
          src: t.resolve(c.srcLine),
          action: c.actions?.[0]?.id ?? null,
        };
      };
      return { cards: Object.fromEntries(all.map((id) => [id, one(id)])), aliases: Object.fromEntries(aliases.map((id) => [id, R.card(id)?.id ?? null])) };
    },
    [gen.map((r) => r.id), ['so101-leader', 'unitree-g1-dex3', 'unitree-h1']],
  );
  const lang = (await t.state(page)).lang;
  const L = (bi) => bi[lang] ?? bi.de;
  const unit = /\d\s*(m|cm|mm|kg|h|min|°|%|km\/h|m\/s|Nm|W|Wh|V|N)\b/;
  const bad = [];
  for (const r of gen) {
    const c = cards.cards[r.id];
    if (r.amber && !amber) {
      if (c) bad.push(`${r.id}: an amber card without VITE_AMBER`);
      continue;
    }
    if (!c) {
      bad.push(`${r.id}: no card`);
      continue;
    }
    const byLabel = Object.fromEntries(c.rows.map((x) => [x.label, x]));
    for (const k of ['kind', 'size', 'model', 'payload', 'license']) if (!byLabel[L(r.rows[k]?.label ?? r[k].label)]) bad.push(`${r.id}: no ${k} row`);
    if (!byLabel[L(r.can.label)]) bad.push(`${r.id}: no „Kann heute“`);
    const lic = byLabel[L(r.rows.license.label)];
    if (!lic || !lic.value.includes(L(r.rows.license.value))) bad.push(`${r.id}: the licence row lacks the attribution`);
    if (r.amber && (!lic?.cond || lic.cond !== L(r.rows.license.cond))) bad.push(`${r.id}: no amber line`);
    if (!r.amber && lic?.cond) bad.push(`${r.id}: an amber line on a cleared robot`);
    for (const x of c.rows) if (unit.test(x.value) && x.label !== L(r.rows.license.label) && !x.chip) bad.push(`${r.id}: „${x.label}“ has a number without a chip`);
    if (!c.src.includes(L(r.asOf))) bad.push(`${r.id}: no „${L(r.asOf)}“ in the source line`);
    if (c.action !== 'view3d') bad.push(`${r.id}: no „In 3D ansehen“`);
  }
  t.require('every card: kind, „Kann heute“, size, MODELL, payload, licence + attribution, chips, sources with the date', bad.length === 0, bad.slice(0, 5).join(' · '));
  t.require('amber ids give no card without VITE_AMBER (hotspots filter them)', amber || amberIds.every((id) => cards.cards[id] === null), amberIds.join(', '));
  t.require('the SO-101 leader arm and the G1 Dex3 get their hall robot’s card; the H1 none', cards.aliases['so101-leader'] === 'robot:so101' && cards.aliases['unitree-g1-dex3'] === 'robot:unitree-g1' && cards.aliases['unitree-h1'] === null, JSON.stringify(cards.aliases));

  // ── open every robot (from the hall stop, once the world settled) ──
  const stops = await page.evaluate(() => window.__discover.stops().map((s) => s.id));
  if (stops.includes('schauhalle')) {
    await page.evaluate(() => window.__discover.goto('schauhalle'));
    await t.waitState(page, (s) => s.stop === 'schauhalle' && !s.flying, 120000);
  }
  await t.waitState(page, (s) => s.ready, 180000).catch(() => t.note('the world did not settle within 3 min (links may include its zone inits)'));
  await page.waitForTimeout(1500);
  const rows = [];
  for (const id of ids) rows.push({ id, ...(await openRobot(page, id)) });
  const notShown = rows.filter((r) => !r.shown).map((r) => r.id);
  t.require(`every robot opens (${ids.length})`, notShown.length === 0, notShown.join(', '));
  t.check('program links while opening a robot (max)', Math.max(...rows.map((r) => r.links)), '<=', 0);
  t.check('parsed files the viewer keeps (max)', Math.max(...rows.map((r) => r.files.length)), '<=', 2);
  t.check('draws in the studio (max)', Math.max(...rows.map((r) => r.draws)), '<=', 60);
  t.require('the camera sees only the studio layer', rows.every((r) => r.mask === 1 << r.layer), String(rows[0]?.mask));
  t.require('the sheet shows the robot’s card', rows.every((r) => r.card === `robot:${r.id}`), rows.filter((r) => r.card !== `robot:${r.id}`).map((r) => r.id).join(', '));
  t.log(`opened ${rows.length}: ${rows.map((r) => `${r.id} ${r.ms} ms`).join(' · ')}`);

  // ── touch ──
  await tapEl(t, page, '.dsv-tab[data-cat="bauen"]');
  await page.waitForTimeout(200);
  const strip = await page.evaluate(() => [...document.querySelectorAll('.dsv-rb')].map((b) => b.dataset.robot));
  const bauen = want.filter((id) => gen.find((r) => r.id === id).cat === 'bauen');
  t.require('the SELBST BAUEN tab shows its robots in the strip', JSON.stringify(strip) === JSON.stringify(bauen), strip.join(', '));
  await tapEl(t, page, `.dsv-rb[data-robot="${bauen[0]}"]`);
  await page.waitForFunction((id) => { const s = window.__discoverViewer.state(); return s.shown && s.robot === id; }, bauen[0], { timeout: 60000 }).catch(() => {});
  t.require('a tap on the strip opens that robot', (await page.evaluate(VS)).robot === bauen[0]);
  await tapEl(t, page, '.dsc-sheet .dsc-nav.next');
  await page.waitForFunction((id) => window.__discoverViewer.state().robot === id, bauen[1], { timeout: 60000 }).catch(() => {});
  t.require('the sheet’s › steps to the next robot', (await page.evaluate(VS)).robot === bauen[1]);
  await page.evaluate((id) => window.__discover.handle.modes.enter('viewer', { robot: id }), 'unitree-g1');
  await page.waitForTimeout(600);
  const c0 = await page.evaluate(CAM);
  await page.evaluate(GESTURE, ['drag', 140, 0]);
  await page.waitForTimeout(500);
  await page.evaluate(GESTURE, ['drag', 0, 900]);
  await page.waitForTimeout(600);
  const c1 = await page.evaluate(CAM);
  const dYaw = Math.abs(((c1.yaw - c0.yaw + 540) % 360) - 180);
  t.require('a drag orbits the robot', dYaw > 5, `Δyaw ${dYaw.toFixed(1)}°`);
  t.require('pitch stays within −60…5° (rig convention)', c1.pitch >= -60.5 && c1.pitch <= 5.5, c1.pitch.toFixed(1));
  await page.evaluate(GESTURE, ['pinch', 6]);
  await page.waitForTimeout(400);
  const cIn = await page.evaluate(CAM);
  await page.evaluate(GESTURE, ['pinch', 0.1]);
  await page.waitForTimeout(400);
  const cOut = await page.evaluate(CAM);
  const lo = cIn.dist / cIn.fit,
    hi = cOut.dist / cOut.fit;
  t.require('a pinch stays within 0.6–3 × the fit distance', lo >= 0.59 && hi <= 3.01 && hi > lo, `${lo.toFixed(2)} … ${hi.toFixed(2)}`);
  await page.evaluate(() => window.__discover.handle.camera.reset());
  await page.waitForTimeout(900);
  const you = await page.evaluate(CAM);
  await tapEl(t, page, '.dsv-frame [data-framing="near"]');
  await page.waitForTimeout(1300);
  const near = await page.evaluate(CAM);
  t.require('„Nah“ frames the robot closer than „Neben dir“', near.fit < you.fit, `${near.fit?.toFixed(2)} < ${you.fit?.toFixed(2)}`);
  await tapEl(t, page, '.dsv-frame [data-framing="you"]');
  await page.waitForTimeout(900);
  const spin = await page.evaluate(async () => {
    const h = window.__discover.handle;
    const table = window.__academy.game.rs.scene.getObjectByName('discover:studio-turntable').parent;
    const a0 = table.rotation.y;
    await new Promise((r) => setTimeout(r, 4000));
    const a1 = table.rotation.y;
    h.settings.setReducedMotion(true);
    await new Promise((r) => setTimeout(r, 300));
    const b0 = table.rotation.y;
    await new Promise((r) => setTimeout(r, 1200));
    const b1 = table.rotation.y;
    h.settings.setReducedMotion(false);
    return { turns: Math.abs(a1 - a0) > 0.05, still: Math.abs(b1 - b0) < 1e-6 };
  });
  t.require('the turntable turns, and stands still under reduced motion', spin.turns && spin.still, JSON.stringify(spin));
  const other = lang === 'de' ? 'en' : 'de';
  const l0 = await page.evaluate(() => document.querySelector('.dsv-line').textContent);
  await tapEl(t, page, `.dsc-lang-btn[lang="${other}"]`);
  await page.waitForTimeout(300);
  const l1 = await page.evaluate(() => ({ line: document.querySelector('.dsv-line').textContent, tab: document.querySelector('.dsv-tab[data-cat="gehen"]').textContent, du: document.querySelector('.dsv-lab.du').textContent }));
  const wantLine = await page.evaluate((o) => (o === 'de' ? 'Du:' : 'You:'), other);
  t.require(`DE · EN relabels the viewer in place (${other.toUpperCase()})`, l1.line !== l0 && l1.line.startsWith(wantLine), `${l0} → ${l1.line} · ${l1.tab} · ${l1.du}`);
  await tapEl(t, page, `.dsc-lang-btn[lang="${lang}"]`);
  await tapEl(t, page, '.dsc-top .dsv-back');
  await page.waitForFunction(() => window.__discover.state().mode === 'tour', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => {
    const c = window.__academy.game.camera;
    const own = Object.prototype.hasOwnProperty.call(c, 'updateProjectionMatrix');
    const e = c.projectionMatrix.elements;
    return { mode: window.__discover.state().mode, mask: c.layers.mask, own, shift: [e[8], e[9]].map((x) => Math.round(x * 1e4) / 1e4), layer: !!document.querySelector('.dsv'), btn: !!document.querySelector('.dsv-back'), studio: !!window.__academy.game.rs.scene.getObjectByName('discover:studio') };
  });
  t.require('the back button returns to the tour: camera layers, projection and DOM restored', back.mode === 'tour' && back.mask === 1 && !back.own && back.shift[0] === 0 && !back.layer && !back.btn && !back.studio, JSON.stringify(back));

  // ── the rules ──
  const urls = h.requests.map((r) => r.url);
  t.check('third-party requests', t.thirdParty(h.requests).length, '<=', 0);
  t.check('requests outside /academy-world/', t.outside(h.requests).length, '<=', 0);
  t.check('MuJoCo / duck worker requests', urls.filter((u) => /mujoco|duck\.worker|duck-rec|\/duck-[\w-]+\.bin/i.test(u)).length, '<=', 0);
  t.check('page and console errors', h.errors.length, '<=', 0);
  if (h.errors.length) t.log(h.errors.slice(0, 4));
  await h.close();

  // ── screenshots: 4 robots at 390×844, one at 844×390 ──
  for (const [w, hgt, list] of [
    [390, 844, SHOTS],
    [844, 390, ['unitree-h2']],
  ]) {
    const dev = { ...t.dev, cpu: 1, net: null, context: { ...t.dev.context, viewport: { width: w, height: hgt } } };
    const s = await t.open('?discover=1&stills=0', { dev, throttle: false });
    await t.waitState(s.page, (x) => x.startCard, 180000);
    await s.page.evaluate(() => window.__discover.start());
    await t.waitState(s.page, (x) => x.stop != null && !x.flying, 120000);
    for (const id of list.filter((x) => ids.includes(x))) {
      await s.page.evaluate((robot) => window.__discover.handle.modes.enter('viewer', { robot }), id);
      await s.page.waitForFunction((r) => { const v = window.__discoverViewer.state(); return v.shown && v.robot === r; }, id, { timeout: 60000 }).catch(() => {});
      await s.page.waitForTimeout(900);
      await t.shot(s.page, `${w}x${hgt}-${id}`);
    }
    await s.close();
  }
}
