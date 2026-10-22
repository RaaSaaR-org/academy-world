// discover-check scenario `memory` (WP-D0, plan §2.2, §2.3): two laps of the tour (+ 5 viewer robots once
// D2's viewer is registered, + the film's stills version once D3's film is), each followed by a GC.
//   JS heap ≤ 90 MB after the first lap (Chromium: CDP, after a forced GC; WebKit: n/a, noted)
//   estimated GPU ≤ 300 MB (the readout's estimate: geometry, uploaded textures, targets, shadow map)
//   second lap ≤ +5 % on both
export const scenario = { name: 'memory' };

const MB = 1048576;

async function lap(t, page) {
  const stops = await page.evaluate(() => window.__discover.stops());
  for (const s of stops) await page.evaluate((id) => window.__discover.goto(id), s.id);
  const reg = await page.evaluate(() => ({ viewer: window.__discover.handle.modes.has('viewer') && !!window.__discover.handle.robots, film: window.__discover.handle.modes.has('film') }));
  if (reg.viewer) {
    const ids = await page.evaluate(() => window.__discover.handle.robots.ids().slice(0, 5));
    for (const id of ids) {
      await page.evaluate((robot) => window.__discover.handle.modes.enter('viewer', { robot }), id);
      await page.waitForTimeout(2500);
    }
  }
  if (reg.film) await page.evaluate(() => Promise.race([window.__discover.handle.modes.enter('film', { stills: true, bench: true }), new Promise((r) => setTimeout(r, 90000))]));
  if (reg.viewer || reg.film) await page.evaluate((id) => window.__discover.handle.modes.enter('tour', { stop: id }), stops[0].id);
  return reg;
}

async function reading(t, h) {
  let heap = null;
  if (h.cdp) {
    await h.cdp.send('HeapProfiler.collectGarbage');
    await h.page.waitForTimeout(300);
    await h.cdp.send('HeapProfiler.collectGarbage');
    heap = (await h.cdp.send('Runtime.getHeapUsage')).usedSize / MB;
  }
  await h.page.waitForTimeout(2100); // the GPU estimate refreshes every 2 s
  const gpu = await h.page.evaluate(() => window.__discover.perf().gpuMB);
  return { heap, gpu };
}

export default async function run(t) {
  // no CPU or network throttling (the readings, not the timing, matter); CDP stays for the GC on Chromium
  const h = await t.open('?discover=1&stills=0', { dev: { ...t.dev, cpu: 1, net: null } });
  if (h.cdp) await h.cdp.send('HeapProfiler.enable');
  await t.waitState(h.page, (s) => s.startCard, 180000);
  await h.page.evaluate(() => window.__discover.start());
  await t.waitState(h.page, (s) => s.stop != null && !s.flying, 120000);
  const reg = await lap(t, h.page);
  if (!reg.viewer) t.pending('memory: the 5 viewer robots (no viewer registered yet)');
  if (!reg.film) t.pending('memory: the film (no film registered yet)');
  const a = await reading(t, h);
  await lap(t, h.page);
  const b = await reading(t, h);
  t.log(`lap 1: heap ${a.heap?.toFixed(1) ?? 'n/a'} MB, GPU ≈ ${a.gpu} MB · lap 2: heap ${b.heap?.toFixed(1) ?? 'n/a'} MB, GPU ≈ ${b.gpu} MB`);
  if (a.heap == null) t.note('JS heap n/a on this engine (no CDP): the GPU estimate only');
  else {
    t.check('JS heap after the tour (GC)', a.heap, '<=', 90, ' MB');
    t.check('JS heap, second lap vs first', b.heap / a.heap, '<=', 1.05);
  }
  t.check('estimated GPU memory after the tour', a.gpu, '<=', 300, ' MB');
  t.check('estimated GPU memory, second lap vs first', b.gpu / a.gpu, '<=', 1.05);
  t.check('page errors', h.errors.length, '<=', 0);
  await h.close();
}
