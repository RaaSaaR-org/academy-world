// Main-pass draw calls by owner (promoted from the phase 6 perf-runtime audit's drawcalls.mjs and
// worlddraws.mjs) and the Phase 7 per-owner ledger (docs/PHASE7-PLAN.md §5.5, [C1 M2]). Used by
// tools/perf.mjs (W1 / Z1 targets) and tools/drawcalls.mjs (--ledger).
//
// Counted with onBeforeRender during one real frame: every mesh / line / point / sprite drawn in
// the main pass (the shadow pass does not call onBeforeRender for depth materials; post passes
// are not scene objects). A multi-material mesh counts once per group (one draw call each).
//
// Owner tags (the ledger owners), resolved per drawn object, the nearest tag up the parent chain wins:
//   1. `object.userData.ledger = '<owner>'` on any ancestor: an explicit tag. Packages without a frame
//      or area group of their own tag their root group: region (WP14) 'region', life (WP15) 'life';
//      any other value names an area or a package as it is.
//   2. `userData.robot` (RobotModel.object and silhouettes, WP0) or the line-up mesh 'robots:lineup':
//      'robots' (meshes created through ctx.robots).
//   3. the root registered with ctx.frames.register('ground', …) (WP3): 'ground'. Areas of the
//      ground frame parent under it, so their own group (rule 4) is nearer and wins.
//   4. a group named 'zone:<id>': the area <id>; 'zone:world' (the island module): 'world'; the
//      engine's stand-in plot 'core:fallback-plot:<id>': the area <id>.
//   5. engine objects 'env:*' and 'core:*' (sky dome, cloud sea, Sensorkapseln): 'engine'. No view
//      budgets them; they count for the view's total (the phase 6 W1 'world' count left them out too).
//   6. anything else: 'world', listed as unowned so a new package can tag itself.
// The detail key per draw is '<owner>/<sub>': the zone tier (exterior, detail, far …), the world
// module (island, tower, emi …), the robot id, or the ground child.

/** In-page: draws and triangles by owner during one frame. */
export const DRAWS_BY_OWNER = async () => {
  const G = window.__academy.game;
  const groundRoot = (G.worldCtx && G.worldCtx.frames && G.worldCtx.frames.ground) || null;
  const FIXED = new Set(['world', 'ground', 'region', 'life', 'robots', 'engine']);
  const resolve = (o) => {
    const names = [];
    let child = null;
    for (let q = o; q; child = q, q = q.parent) {
      const ud = q.userData || {};
      if (typeof ud.ledger === 'string' && ud.ledger) return { owner: ud.ledger, sub: (child && child.name) || q.name || q.type, tagged: true };
      if (ud.robot || q.name === 'robots:lineup') return { owner: 'robots', sub: String(ud.robot || 'lineup') };
      if (groundRoot && q === groundRoot) return { owner: 'ground', sub: (child && (child.name || child.type)) || 'root' };
      const n = q.name || '';
      // the engine's stand-in plot of an area without its own ground yet (ZoneManager): the area's
      const fb = n.match(/^core:fallback-plot:(.+)$/);
      if (fb) return { owner: fb[1], sub: 'fallback-plot' };
      if (n.startsWith('zone:')) {
        const id = n.slice(5);
        if (id === 'world') return { owner: 'world', sub: ((child && child.name) || (child && child.type) || 'root').split(':')[0] };
        const tier = (child && child.name) || '';
        return { owner: id, sub: tier.split(':')[1] || tier || 'root' };
      }
      names.push(n || q.type);
    }
    names.reverse();
    // names[0] is the scene; names[1] the top-level object (env:sky, core:capsules, …)
    const top = names[1] || names[0] || 'scene';
    if (/^(env|core):/.test(top)) return { owner: 'engine', sub: top };
    return { owner: 'world', sub: 'unowned/' + names.slice(1, 3).join('/'), unowned: true };
  };
  const trianglesOf = (o, geometry, group) => {
    if (!o.isMesh || !geometry) return 0;
    const idx = geometry.index;
    const pos = geometry.attributes && geometry.attributes.position;
    let count = group && group.count != null && Number.isFinite(group.count) ? group.count : idx ? idx.count : pos ? pos.count : 0;
    const dr = geometry.drawRange;
    if (dr && Number.isFinite(dr.count)) count = Math.min(count, dr.count);
    let inst = 1;
    if (o.isInstancedMesh) inst = o.count;
    else if (geometry.isInstancedBufferGeometry && Number.isFinite(geometry.instanceCount)) inst = geometry.instanceCount;
    return Math.floor(count / 3) * inst;
  };
  const draws = new Map(); // owner → draws
  const tris = new Map(); // owner → main-pass triangles
  const detail = new Map(); // owner/sub → draws
  const legacy = new Map(); // the phase 6 key (world/<module>, zone:<id>/<tier>, first two names)
  const unowned = new Map();
  const legacyOf = (o) => {
    const path = [];
    for (let q = o; q; q = q.parent) path.push(q.name || q.type);
    path.reverse();
    const i = path.findIndex((p) => p.startsWith('zone:'));
    if (i < 0) return path.slice(1, 3).join('/');
    const z = path[i];
    const tier = path[i + 1] || '';
    if (z === 'zone:world') return 'world/' + tier.split(':')[0];
    return z + '/' + (tier.split(':')[1] || tier);
  };
  const cache = new Map();
  let on = false;
  const hooked = [];
  G.rs.scene.traverse((o) => {
    if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) return;
    const prev = o.onBeforeRender;
    o.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
      if (on) {
        let r = cache.get(o);
        if (!r) cache.set(o, (r = { ...resolve(o), legacy: legacyOf(o) }));
        draws.set(r.owner, (draws.get(r.owner) || 0) + 1);
        tris.set(r.owner, (tris.get(r.owner) || 0) + trianglesOf(o, geometry, group));
        const k = r.owner + '/' + r.sub;
        detail.set(k, (detail.get(k) || 0) + 1);
        legacy.set(r.legacy, (legacy.get(r.legacy) || 0) + 1);
        if (r.unowned) unowned.set(r.sub, (unowned.get(r.sub) || 0) + 1);
      }
      return prev.apply(this, arguments);
    };
    hooked.push([o, prev]);
  });
  // a frame must really render: wait for one, count the next (the paused / frozen render skip
  // of C9 would leave this at 0, so callers measure while playing)
  await new Promise((r) => requestAnimationFrame(() => r()));
  on = true;
  await new Promise((r) => requestAnimationFrame(() => r()));
  on = false;
  for (const [o, prev] of hooked) o.onBeforeRender = prev;
  const sorted = (m) => Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
  const list = [...legacy.entries()].sort((a, b) => b[1] - a[1]);
  const byOwner = Object.fromEntries(list);
  const byGroup = {};
  for (const [k, v] of list) {
    const g = k.split('/')[0];
    byGroup[g] = (byGroup[g] || 0) + v;
  }
  const world = byGroup.world || 0;
  const zones = Object.entries(byGroup).filter(([k]) => k.startsWith('zone:')).reduce((a, [, v]) => a + v, 0);
  const owners = sorted(draws);
  const areas = Object.keys(owners).filter((k) => !FIXED.has(k));
  return {
    total: [...draws.values()].reduce((s, v) => s + v, 0),
    world,
    zones,
    byGroup,
    byOwner,
    info: window.__academy.renderInfo(),
    ledger: { owners, tris: sorted(tris), detail: sorted(detail), areas, unowned: sorted(unowned), ground: !!groundRoot },
  };
};

/**
 * In-page: add `n` small meshes tagged with ledger owner `owner` in front of the camera (a seeded
 * miss for the ledger's self-test). They stay until window.__seededDraws() removes them.
 */
export const SEED_DRAWS = ([owner, n]) => {
  const G = window.__academy.game;
  const cam = G.rs.camera;
  // reuse three.js classes from a live mesh: the page has no module handle on 'three'
  let probe = null;
  G.rs.scene.traverse((o) => {
    if (!probe && o.isMesh && o.geometry && o.material && !o.isInstancedMesh && !o.isSkinnedMesh) probe = o;
  });
  if (!probe) throw new Error('no mesh to clone a seeded draw from');
  const group = new probe.parent.constructor();
  group.name = 'seed:ledger';
  group.userData.ledger = owner;
  const dir = new probe.position.constructor();
  cam.getWorldDirection(dir);
  for (let i = 0; i < n; i++) {
    const m = new probe.constructor(probe.geometry, probe.material);
    m.frustumCulled = false;
    m.scale.setScalar(0.001);
    m.position.copy(cam.position).addScaledVector(dir, 2 + i * 0.01);
    group.add(m);
  }
  G.rs.scene.add(group);
  G.requestRender(4);
  window.__seededDraws = () => {
    G.rs.scene.remove(group);
    G.requestRender(2);
  };
  return group.children.length;
};

/** Place the camera (in-page setup code), settle, count. */
export async function drawsByOwner(page, setup = null, settle = 1500) {
  if (setup) await page.evaluate(`(async () => { ${setup} })()`);
  if (setup) await page.waitForTimeout(settle);
  return page.evaluate(DRAWS_BY_OWNER);
}

/** Phase 6 targets (W1, Z1) per view: [label, value(r), op, target]. */
export const DRAW_TARGETS = {
  spawn: [
    ['world draws at the spawn (W1)', (r) => r.world, '<=', 110],
    ['zone draws at the spawn (Z1)', (r) => r.zones, '<=', 50],
  ],
  plaza: [
    ['world draws at the plaza (W1)', (r) => r.world, '<=', 110],
    ['all main-pass draws at the plaza (W1 + Z1)', (r) => r.total, '<=', 200],
    ['Regelgarten exterior at the plaza (Z1)', (r) => r.byOwner['zone:regelgarten/exterior'] ?? 0, '<=', 10],
    ['Greifwerkstatt exterior at the plaza (Z1)', (r) => r.byOwner['zone:greifwerkstatt/exterior'] ?? 0, '<=', 10],
  ],
};

export const DRAW_VIEWS = {
  spawn: `__academy.teleport([0,0,94.5]); __academy.look(0,6);`,
  plaza: `__academy.teleport([0,0,30]); __academy.look(0,0);`,
};

/** One line per view: total, world, zones and the biggest owners. */
export function formatDraws(name, r, top = 14) {
  const g = Object.entries(r.byGroup).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  const o = Object.entries(r.byOwner).slice(0, top).map(([k, v]) => `${k} ${v}`).join(', ');
  return `${name}: ${r.total} main-pass draws (world ${r.world}, zones ${r.zones}; renderer calls incl. shadow + post ${r.info.calls})\n   by group: ${g}\n   by owner: ${o}`;
}

const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n));

/**
 * The §5.5 ledger of one view against one count. Returns rows
 *   { name, value, cap, status: 'pass' | 'fail' | 'known' | 'fixed', owner?, note? }
 * plus `print` lines. `ledger` is the view's entry of tools/lib/views.mjs; `gate` the GDD gate.
 */
export function checkLedger(view, ledger, r, gate = { total: 500, tris: 1.5e6 }, trisCap = null) {
  const L = r.ledger;
  const rows = [];
  const named = new Set((ledger?.buckets ?? []).map(([b]) => b).filter((b) => b !== 'areas' && b !== 'others'));
  const sum = (pred) => Object.entries(L.owners).filter(([o]) => pred(o)).reduce((a, [, v]) => a + v, 0);
  const FIXED = new Set(['world', 'ground', 'region', 'life', 'robots', 'engine']);
  const valueOf = (bucket) => {
    if (bucket === 'areas') return sum((o) => !FIXED.has(o) && !named.has(o));
    if (bucket === 'others') return sum((o) => !named.has(o));
    return L.owners[bucket] ?? 0;
  };
  const known = ledger?.known ?? [];
  const judge = (name, value, cap, knownEntry) => {
    if (value <= cap) return { name, value, cap, status: knownEntry ? 'fixed' : 'pass', owner: knownEntry?.owner, note: knownEntry ? `known miss fixed: remove it from tools/lib/views.mjs (${knownEntry.note})` : undefined };
    if (knownEntry && value <= knownEntry.upTo) return { name, value, cap, status: 'known', owner: knownEntry.owner, note: `${knownEntry.note}; allowed up to ${knownEntry.upTo} until its owner fixes it` };
    return { name, value, cap, status: 'fail', owner: knownEntry?.owner, note: knownEntry ? `grew past the known ${knownEntry.upTo}` : undefined };
  };
  for (const [bucket, cap] of ledger?.buckets ?? []) rows.push(judge(`${view} ${bucket} draws`, valueOf(bucket), cap, known.find((x) => x.bucket === bucket)));
  for (const kn of known.filter((x) => x.key)) rows.push(judge(`${view} ${kn.key} draws`, L.detail[kn.key] ?? 0, kn.cap, kn));
  // standing per-key caps (an owner's tier, e.g. one lobe's exterior): no known-miss allowance
  for (const lim of ledger?.limits ?? []) rows.push(judge(`${view} ${lim.key} draws`, L.detail[lim.key] ?? 0, lim.cap));
  const total = ledger?.total ?? gate.total;
  rows.push(judge(`${view} main-pass draws`, r.total, Math.min(total, gate.total)));
  for (const [bucket, cap] of ledger?.trisBy ?? []) rows.push(judge(`${view} ${bucket} triangles`, L.tris[bucket] ?? 0, cap));
  const tcap = Math.min(trisCap ?? gate.tris, gate.tris);
  rows.push(judge(`${view} triangles (renderer, all passes)`, r.info.triangles, tcap));
  return rows;
}

/** Print one view's owners (every owner, then the biggest details) and its ledger rows. */
export function formatLedger(view, r, rows) {
  const L = r.ledger;
  const out = [];
  out.push(`${view}: ${r.total} main-pass draws, ${k(Object.values(L.tris).reduce((a, b) => a + b, 0))} main-pass triangles (renderer: ${r.info.calls} calls, ${k(r.info.triangles)} triangles incl. shadow + post)${L.ground ? '' : ' · no ground frame registered'}`);
  out.push(`   owners: ${Object.entries(L.owners).map(([o, v]) => `${o} ${v} (${k(L.tris[o] ?? 0)})`).join(' · ')}`);
  out.push(`   detail: ${Object.entries(L.detail).slice(0, 18).map(([o, v]) => `${o} ${v}`).join(', ')}`);
  if (Object.keys(L.unowned).length) out.push(`   unowned (counted as world; tag the root with userData.ledger): ${Object.entries(L.unowned).map(([o, v]) => `${o} ${v}`).join(', ')}`);
  for (const row of rows) {
    const tag = { pass: 'PASS ', fail: 'FAIL ', known: 'KNOWN', fixed: 'FIXED' }[row.status];
    out.push(`   ${tag} ${row.name.padEnd(46)} ${String(row.value >= 1e4 ? k(row.value) : row.value).padStart(7)} ≤ ${row.cap >= 1e4 ? k(row.cap) : row.cap}${row.owner ? `  owner ${row.owner}` : ''}${row.note ? `  (${row.note})` : ''}`);
  }
  return out.join('\n');
}
