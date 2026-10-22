/**
 * Station C ◆ „Traumdaten“ (Messen; plan §4.8, R3 §5.5): the Unitree H1-2 has 20 real demos of lifting a
 * crate; the new task — push a cart onto the lift — has none. The hangar's world model dreams 200.
 *   1 Prüfen      the dream wall shows 8 sample tiles: find the 3 physics errors with the Physik-Lupe
 *   2 Mischen     nur echt / echt + alle Träume / echt + geprüfte Träume → the offline bars, and a
 *                 hidden fourth bar wins offline: „Stillstand“ (the trap: name it)
 *   3 Selbst      drive one closed-loop trial yourself with your mix (velocity commands, the policy grasps)
 *   4 Prüfzelle   n = 20 per mix in parallel lanes → the ◆: the best closed-loop mix becomes the island's
 *                 Flugmodell (NAVIGATION, D23) — never the offline winner, never Stillstand — and T2 starts
 * „Geprüfte Träume: +35 pp [+8, +58] im geschlossenen Lauf · n = 20 · offline hätte Stillstand gewonnen“
 * (toy values, ILLUSTRATIV) · ★ offline + closed loop for ≥ 2 mixes · ★★ all 3 errors with ≤ 1 false flag
 * · ★★★ the Stillstand bar named as the trap before the closed-loop result.
 * Entscheider: „Der Traumdaten-Deal“ — offer A „10.000 Träume, offline +40 %“ or B „1.000 geprüfte Träume
 * + Messung im geschlossenen Lauf“, the Stillstand bar visible from the start, then the Befundkarte.
 */
import * as THREE from 'three';
import type { ChallengeHandle, InfoCardSpec, Stars } from '@/core/zones';
import { C, DOCKS, FLOOR, JUICE } from './tuning';
import { closedRate, gainPp, installedMix, offlineBars, pruefzelle, rng, tiles as makeTiles, wilson, type Mix, type PruefRow, type Tile } from './model';
import { bakedClips, createDreamWall } from './dreamwall';
import type { Hangar } from './shared';
import { bakeParts } from './kit';
import { button, chipRow, el, legend, segmented } from './ui';

type Step = 'tiles' | 'mix' | 'trial' | 'pruef' | 'done';

export interface StationC {
  /** debug (traum-check): the self test from just behind the cart's handle */
  trialNear(): void;
  /** debug: select tile i (the Lupe), or flag the errors the player would find */
  pick(i: number): void;
  start(): void;
  console(): void;
  solve(stars?: Stars): void;
  readonly status: Record<string, unknown>;
  update(dt: number): void;
  readonly challenge: ChallengeHandle;
  /** the flash sequence: the glitch tiles looping, then the upload fold (flash-check) */
  glitchSequence(rm: boolean): Promise<void>;
  /** the Befundkarte (Entscheider; also from the console) */
  befund(): InfoCardSpec;
}

export function buildStationC(H: Hangar, o: { onInstall(mix: Mix): void }): StationC {
  const { ctx, roster, pilot, ghosts, sound } = H;
  const T = H.T;
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const G = <G2 extends THREE.BufferGeometry>(g: G2): G2 => (ctx.onDispose(() => g.dispose()), g);

  // ── the dream wall and the bars screen on the right wall, the console in front ───────────────
  const wall = createDreamWall();
  const wallMat = new THREE.MeshBasicMaterial({ map: wall.texture, toneMapped: false });
  ctx.onDispose(() => (wall.texture.dispose(), wallMat.dispose()));
  const wallMesh = new THREE.Mesh(G(new THREE.PlaneGeometry(C.wall.w, C.wall.h)), wallMat);
  wallMesh.rotation.y = -Math.PI / 2;
  wallMesh.position.set(C.wall.x, C.wall.y + C.wall.h / 2, C.wall.z);
  wallMesh.userData.noMerge = true;
  wallMesh.name = 'traum:c-wall';
  det.add(wallMesh);
  const frameMat = M.standard({ color: 0x1f1f1f, roughness: 0.5 });
  const frame = new THREE.Mesh(G(new THREE.BoxGeometry(0.1, C.wall.h + 0.2, C.wall.w + 0.2)), frameMat);
  frame.position.set(C.wall.x + 0.06, C.wall.y + C.wall.h / 2, C.wall.z);
  det.add(frame);
  const barsCv = document.createElement('canvas');
  barsCv.width = 1024;
  barsCv.height = 576;
  const bg = barsCv.getContext('2d')!;
  const barsTex = new THREE.CanvasTexture(barsCv);
  barsTex.colorSpace = THREE.SRGBColorSpace;
  const barsMat = new THREE.MeshBasicMaterial({ map: barsTex, toneMapped: false });
  ctx.onDispose(() => (barsTex.dispose(), barsMat.dispose()));
  const barsMesh = new THREE.Mesh(G(new THREE.PlaneGeometry(C.bars.w, C.bars.h)), barsMat);
  barsMesh.rotation.y = -Math.PI / 2;
  barsMesh.position.set(C.bars.x, C.bars.y + C.bars.h / 2, C.bars.z);
  barsMesh.userData.noMerge = true;
  det.add(barsMesh);
  const frame2 = new THREE.Mesh(G(new THREE.BoxGeometry(0.1, C.bars.h + 0.2, C.bars.w + 0.2)), frameMat);
  frame2.position.set(C.bars.x + 0.06, C.bars.y + C.bars.h / 2, C.bars.z);
  det.add(frame2);
  const desk = new THREE.Mesh(G(new THREE.BoxGeometry(0.6, 1.0, 1.6)), M.standard({ color: 0x3d3d3d, roughness: 0.55, metalness: 0.3 }));
  desk.position.set(C.console[0], 0.5, C.console[1]);
  desk.castShadow = false; // under the roof: its shadow falls in the roof's (JS budget, §5.5)
  desk.name = 'traum:c-desk';
  det.add(desk);
  ctx.physics.addStaticBox({ size: [0.6, 1.0, 1.6], position: [C.console[0], 0.5, C.console[1]] });

  // ── the cart, the ramp and the lift in the C lane ─────────────────────────────────────────────
  const cart = new THREE.Group();
  cart.name = 'traum:c-cart';
  cart.userData.noMerge = true;
  {
    // deck, handle, posts and wheels baked into one vertex-coloured mesh (one draw; the crate is its own;
    // their shadows fall in the roof's)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 1.1), M.standard({ color: 0x5b5b5e, roughness: 0.5 }));
    deck.position.y = 0.3;
    const load = new THREE.Mesh(G(new THREE.BoxGeometry(0.6, 0.4, 0.6)), M.crate);
    load.position.y = 0.53;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.04), M.standard({ color: 0xff6700, roughness: 0.5 }));
    handle.position.set(0, 0.95, -0.62);
    const posts = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.66, 0.03), M.standard({ color: 0x5b5b5e, roughness: 0.5 }));
    posts.position.set(0, 0.62, -0.58);
    const parts: THREE.Mesh[] = [deck, handle, posts];
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 14).rotateZ(Math.PI / 2), M.standard({ color: 0x1c1917, roughness: 0.9 }));
        w.position.set(sx * 0.4, 0.1, sz * 0.4);
        parts.push(w);
      }
    cart.add(bakeParts(ctx, parts, 'traum:c-cart-body'), load);
  }
  det.add(cart);
  const placeCart = (): void => {
    cart.position.set(C.cart[0], 0, C.cart[1]);
    cart.rotation.set(0, 0, 0);
  };
  placeCart();
  const rampLen = C.ramp.z1 - C.ramp.z0;
  const ramp = new THREE.Mesh(G(new THREE.BoxGeometry(C.lift.w, 0.04, Math.hypot(rampLen, C.lift.h))), M.standard({ color: 0x8f8a83, roughness: 0.8, metalness: 0.2 }));
  ramp.position.set(C.lift.x, C.lift.h / 2, (C.ramp.z0 + C.ramp.z1) / 2);
  ramp.rotation.x = -Math.atan2(C.lift.h, rampLen);
  ramp.receiveShadow = true;
  det.add(ramp);
  const lift = new THREE.Mesh(G(new THREE.BoxGeometry(C.lift.w, C.lift.h, C.lift.d)), M.standard({ color: 0x6f6a64, roughness: 0.7, metalness: 0.3 }));
  lift.position.set(C.lift.x, C.lift.h / 2, C.lift.z);
  lift.receiveShadow = true;
  det.add(lift);
  for (const s of [-1, 1]) {
    const hz = new THREE.Mesh(G(new THREE.BoxGeometry(0.08, 0.02, C.lift.d)), M.hazard(3));
    hz.position.set(C.lift.x + (s * C.lift.w) / 2, C.lift.h + 0.012, C.lift.z);
    det.add(hz);
  }
  ctx.physics.addStaticBox({ size: [C.lift.w, C.lift.h, C.lift.d], position: [C.lift.x, C.lift.h / 2, C.lift.z] });

  // ── state ────────────────────────────────────────────────────────────────────────────────────
  type Saved = { found: number; falseFlags: number; mix: Mix | null; offline: boolean; trapNamed: boolean; rows: PruefRow[] | null; installed: Mix | null; trial: boolean | null; offer: 'a' | 'b' | null };
  const saved = ctx.progress.get<Saved>('c.state', { found: 0, falseFlags: 0, mix: null, offline: false, trapNamed: false, rows: null, installed: null, trial: null, offer: null });
  const st = {
    ...saved,
    step: 'tiles' as Step,
    tiles: makeTiles(C, 1) as Tile[],
    revealed: saved.trapNamed,
    trialPhase: 'off' as 'off' | 'walkout' | 'drive' | 'grasp' | 'push' | 'result',
    trialT: 0,
    pushT: 0,
    trialOk: false,
    lanes: 0,
    lanesT: -1,
    foldT: -1,
    greeted: ctx.progress.get('c.greeted', false),
  };
  const persist = (): void => ctx.progress.set('c.state', { found: st.found, falseFlags: st.falseFlags, mix: st.mix, offline: st.offline, trapNamed: st.trapNamed, rows: st.rows, installed: st.installed, trial: st.trial, offer: st.offer });
  const stepNow = (): Step => (st.installed ? 'done' : st.offline && st.found > 0 ? (st.trial == null && ctx.mode !== 'entscheider' ? 'trial' : 'pruef') : st.found > 0 || st.falseFlags > 0 ? 'mix' : 'tiles');
  st.step = stepNow();
  wall.setTiles(st.tiles);

  // the clips: baked from the H1-2's own kinematic chain (clips.json, `bakeClips` re-records them), so the
  // wall plays before the robot has streamed in and no spare model is loaded
  const baked = bakedClips();
  const clipsReady = !!baked;
  if (baked) wall.setClips(baked);

  const challenge = ctx.game.challenge({
    id: 'traumdaten',
    title: T('c.title'),
    metric: { label: T('c.metric'), unit: 'pp', better: 'higher', digits: 0 },
    goals: [{ text: T('c.g1') }, { text: T('c.g2') }, { text: T('c.g3') }],
    lesson: T('c.lesson'),
    why: () => api.befund(),
    retry: () => openConsole(),
  });

  // ── the bars screen ──────────────────────────────────────────────────────────────────────────
  const mixLabel = (m: Mix | 'stillstand'): string => ctx.t(`c.mix.${m}`);
  const drawBars = (): void => {
    const g = bg;
    const W = barsCv.width,
      Hh = barsCv.height;
    g.fillStyle = '#141414';
    g.fillRect(0, 0, W, Hh);
    g.font = '600 26px "Geist Mono", monospace';
    g.fillStyle = 'rgba(245,245,244,0.92)';
    g.fillText(ctx.t('c.screen.title'), 28, 44);
    if (!st.offline && !st.rows && ctx.mode !== 'entscheider') {
      g.font = '500 20px "Geist Mono", monospace';
      g.fillStyle = 'rgba(168,162,158,0.8)';
      g.fillText(ctx.t('c.screen.wait'), 28, 100);
      barsTex.needsUpdate = true;
      return;
    }
    const bars = offlineBars(C);
    const showStill = st.revealed || ctx.mode === 'entscheider';
    // offline (left half): lower looks better
    g.font = '600 18px "Geist Mono", monospace';
    g.fillStyle = 'rgba(168,162,158,0.9)';
    g.fillText(ctx.t('c.screen.offline'), 28, 90);
    g.fillText('ILLUSTRATIV', 300, 90);
    bars.forEach((b, i) => {
      const y = 120 + i * 92;
      const hidden = b.mix === 'stillstand' && !showStill;
      g.font = '600 18px "Geist", sans-serif';
      g.fillStyle = 'rgba(245,245,244,0.9)';
      g.fillText(hidden ? '?' : mixLabel(b.mix), 28, y + 18);
      const w = (b.error / 0.32) * 380;
      g.fillStyle = hidden ? 'rgba(168,162,158,0.35)' : b.mix === 'stillstand' ? 'rgba(251,191,36,0.9)' : b.mix === st.mix ? 'rgba(255,103,0,0.95)' : 'rgba(168,162,158,0.75)';
      g.fillRect(28, y + 28, w, 26);
      g.font = '500 17px "Geist Mono", monospace';
      g.fillStyle = 'rgba(245,245,244,0.9)';
      g.fillText(hidden ? '?' : ctx.i18n.num(b.error, 2), 36 + w, y + 47);
    });
    // closed loop (right half): n = 20 lanes per mix, then k/n with Wilson
    const x0 = 540;
    g.font = '600 18px "Geist Mono", monospace';
    g.fillStyle = 'rgba(168,162,158,0.9)';
    g.fillText(ctx.t('c.screen.closed'), x0, 90);
    g.fillStyle = 'rgba(45,212,191,0.9)';
    g.fillText('SIM · LIVE', x0 + 330, 90);
    const rows = st.rows;
    const order: (Mix | 'stillstand')[] = ['echt', 'alle', 'geprueft', 'stillstand'];
    order.forEach((m, i) => {
      const y = 120 + i * 92;
      const hidden = m === 'stillstand' && !showStill;
      g.font = '600 18px "Geist", sans-serif';
      g.fillStyle = 'rgba(245,245,244,0.9)';
      g.fillText(hidden ? '?' : mixLabel(m), x0, y + 18);
      const row = rows?.find((r) => r.mix === m);
      for (let k = 0; k < C.n; k++) {
        const x = x0 + k * 21;
        const shown = row && k < st.lanes;
        g.fillStyle = !shown ? 'rgba(61,61,61,0.9)' : row!.lanes[k] ? 'rgba(45,212,191,0.95)' : 'rgba(120,113,108,0.9)';
        g.fillRect(x, y + 28, 17, 26);
      }
      if (row && st.lanes >= C.n) {
        const [, lo, hi] = wilson(row.k, row.n);
        g.font = '500 17px "Geist Mono", monospace';
        g.fillStyle = 'rgba(245,245,244,0.92)';
        g.fillText(`${row.k}/${row.n} · [${Math.round(lo * 100)}–${Math.round(hi * 100)} %]`, x0, y + 76);
      }
    });
    if (st.installed && st.rows) {
      const gp = gainPp(st.rows, st.installed, 'echt');
      g.font = '700 22px "Space Grotesk", sans-serif';
      g.fillStyle = 'rgba(45,212,191,1)';
      g.fillText(ctx.t('c.screen.installed', { mix: mixLabel(st.installed), pp: gp.pp }), 28, Hh - 24);
    }
    barsTex.needsUpdate = true;
  };
  drawBars();
  ctx.i18n.onChange(drawBars);

  // ── the Prüfzelle: n = 20 per mix in parallel lanes (≤ 6 s), then the ◆ ───────────────────────
  const runPruefzelle = (onDone?: () => void): void => {
    if (st.lanesT >= 0) return;
    st.rows = pruefzelle(C, { seed: H.seed(), found: st.found, falseFlags: st.falseFlags, withStillstand: true });
    st.lanes = 0;
    st.lanesT = 0;
    ctx.game.unattended(true, 'traumdaten');
    sound.swell();
    persist();
    const tick = ctx.every(C.lanesS / C.n, () => {
      st.lanes++;
      drawBars();
      ctx.audio.beep(600 + st.lanes * 18, 0.03, { volume: 0.2 });
      if (st.lanes >= C.n) {
        tick();
        st.lanesT = -1;
        ctx.game.unattended(false, 'traumdaten');
        install();
        onDone?.();
      }
    });
  };

  const install = (): void => {
    if (!st.rows) return;
    const mix = installedMix(st.rows)!;
    const first = !st.installed;
    st.installed = mix;
    persist();
    drawBars();
    award();
    if (first) {
      // the hangar side of the upload beat (§3.3): the tiles fold into one line that climbs the mast
      st.foldT = 0;
      o.onInstall(mix);
    }
  };

  const award = (): void => {
    if (!st.rows || !st.installed) return;
    const gp = gainPp(st.rows, 'geprueft', 'echt');
    const val = (lang: 'de' | 'en'): string =>
      lang === 'de' ? `Geprüfte Träume: +${gp.pp} pp [${gp.lo >= 0 ? '+' : ''}${gp.lo}, +${gp.hi}] im geschlossenen Lauf · n = ${gp.n} · offline hätte Stillstand gewonnen` : `Checked dreams: +${gp.pp} pp [${gp.lo >= 0 ? '+' : ''}${gp.lo}, +${gp.hi}] closed-loop · n = ${gp.n} · offline, standing still would have won`;
    const isNew = ctx.pass.award('traumdaten', { value: { de: val('de'), en: val('en') } });
    const two = ctx.mode === 'entscheider' ? st.offer === 'b' : st.found >= C.errors && st.falseFlags <= C.falseFlags;
    const stars = (1 + (two ? 1 : 0) + (st.trapNamed ? 1 : 0)) as Stars;
    challenge.submit(gp.pp, { stars, detail: T('c.detail', { pp: gp.pp }) });
    if (isNew) {
      H.deliver('h12');
      H.refreshObjective();
    }
  };

  // ── the console (walk-up, mouse free) ────────────────────────────────────────────────────────
  let lupeCv: HTMLCanvasElement | null = null;
  let lupeRows: HTMLElement | null = null;
  let render: (() => void) | null = null;
  const openConsole = (): void => {
    H.active = null;
    st.step = stepNow();
    if (!st.greeted) {
      st.greeted = true;
      ctx.progress.set('c.greeted', true);
      H.say(T('emi.c.start'));
    }
    ctx.player.enterOperate({
      title: T('c.deskBar'),
      cameraPose: { position: [...C.cam.at], lookAt: [...C.cam.look] },
      panelPosition: 'right',
      panel: (root) => {
        root.dataset.th = 'panel-c';
        const body = el('div');
        root.append(el('div', 'eyebrow', ctx.t('c.title')));
        const goal = challenge.chips();
        goal.style.margin = '6px 0 4px';
        root.append(goal, body);
        render = () => buildStep(body);
        render();
        const off = ctx.i18n.onChange(() => render?.());
        return () => {
          render = null;
          lupeCv = null;
          lupeRows = null;
          void off;
        };
      },
      onPointer: (e) => {
        if (e.type !== 'down' || e.button !== 0) return;
        // a click on the dream wall picks a tile (the wall faces −x at x = C.wall.x)
        if (Math.abs(e.direction.x) < 1e-3) return;
        const t = (C.wall.x - 0.02 - e.origin.x) / e.direction.x;
        if (t <= 0) return;
        const y = e.origin.y + e.direction.y * t,
          z = e.origin.z + e.direction.z * t;
        const u = (z - (C.wall.z - C.wall.w / 2)) / C.wall.w,
          v = 1 - (y - C.wall.y) / C.wall.h;
        if (u < 0 || u > 1 || v < 0 || v > 1) return;
        // the wall canvas runs along +z, which is to the right when you face the wall (+x)
        const col = Math.min(3, Math.floor(u * 4)),
          row = Math.min(1, Math.floor(v * 2));
        wall.selected = row * 4 + col;
        ctx.audio.play('click');
        render?.();
      },
    });
  };

  const buildStep = (body: HTMLElement): void => {
    body.replaceChildren();
    if (ctx.mode === 'entscheider' && !st.installed) return buildDeal(body);
    const step = (st.step = stepNow());
    if (step === 'tiles' || (step === 'mix' && wall.selected >= 0 && !st.offline)) {
      body.append(el('div', '', ctx.t('c.tiles'), 'font-size:13px;margin-top:4px'));
      // the Physik-Lupe of the selected tile
      if (wall.selected >= 0) {
        lupeCv = el('canvas') as HTMLCanvasElement;
        lupeCv.width = 300;
        lupeCv.height = 170;
        lupeCv.style.cssText = 'width:100%;max-width:300px;border-radius:6px;margin-top:6px;background:#0d1514';
        body.append(lupeCv);
        lupeRows = el('div');
        body.append(lupeRows);
        const row = el('div', 'op-row');
        row.append(
          button(ctx.t('c.flag'), 'btn', () => {
            wall.flags[wall.selected] = true;
            ctx.audio.play('beep', { pitch: 1.3, volume: 0.4 });
            render?.();
          }, 'c-flag'),
          button(ctx.t('c.unflag'), 'btn ghost', () => {
            wall.flags[wall.selected] = false;
            render?.();
          }, 'c-unflag'),
        );
        body.append(row);
      }
      const n = wall.flags.filter(Boolean).length;
      const done = el('div', 'op-row');
      const b = button(ctx.t('c.filter', { n }), 'btn primary', () => applyFilter(), 'c-filter');
      b.disabled = n === 0;
      done.append(b);
      body.append(done);
      return;
    }
    if (step === 'mix') {
      body.append(chipRowText('c.found', { n: st.found, f: st.falseFlags }, 'traum'));
      body.append(el('div', '', ctx.t('c.mixQ'), 'font-size:13px;margin-top:6px'));
      const seg = segmented<Mix>((['echt', 'alle', 'geprueft'] as Mix[]).map((m) => ({ value: m, label: ctx.t(`c.mixShort.${m}`) })), st.mix ?? 'geprueft', (m) => {
        st.mix = m;
        seg.set(m);
        persist();
      }, 'c-mix');
      if (!st.mix) st.mix = 'geprueft';
      body.append(seg.el);
      const row = el('div', 'op-row');
      row.append(button(ctx.t('c.offline'), 'btn primary', () => {
        st.offline = true;
        persist();
        drawBars();
        sound.ok();
        render?.();
      }, 'c-offline'));
      body.append(row);
      return;
    }
    // the offline bars are up: the hidden bar, the trap, then the self test and the Prüfzelle
    if (!st.revealed) {
      body.append(el('div', '', ctx.t('c.offlineQ'), 'font-size:13px;margin-top:4px'));
      const row = el('div', 'op-row');
      row.append(button(ctx.t('c.reveal'), 'btn', () => {
        st.revealed = true;
        drawBars();
        H.say(T('emi.c.trap'), true);
        ctx.pass.unlockAlbum('stillstand-gewinnt');
        render?.();
      }, 'c-reveal'));
      body.append(row);
    } else if (!st.trapNamed && !st.rows) {
      body.append(el('div', '', ctx.t('c.trapQ'), 'font-size:13px;margin-top:4px'));
      const row = el('div', 'op-row');
      row.append(
        button(ctx.t('c.trapYes'), 'btn', () => {
          st.trapNamed = true;
          persist();
          sound.ok();
          ctx.game.juice.pulse('teal', 0.5);
          render?.();
        }, 'c-trap'),
        button(ctx.t('c.trapNo'), 'btn ghost', () => {
          H.say(T('emi.c.trapNo'), true);
        }, 'c-trap-no'),
      );
      body.append(row);
    }
    if (step === 'trial') {
      body.append(chipRowText('c.trialGo', {}, 'sim'));
      const row = el('div', 'op-row');
      row.append(button(ctx.t('c.skipTrial'), 'btn ghost', () => {
        st.trial = false;
        persist();
        render?.();
      }, 'c-skip-trial'));
      body.append(row);
      return;
    }
    if (st.trial != null && st.trial !== false) body.append(chipRowText(st.trial ? 'c.trialOk' : 'c.trialFail', { mix: mixLabel(st.mix ?? 'geprueft') }, 'sim'));
    const row = el('div', 'op-row');
    row.append(button(ctx.t(st.rows ? 'c.again' : 'c.pruef'), 'btn primary', () => runPruefzelle(() => render?.()), 'c-pruef'));
    body.append(row);
    if (st.installed && st.rows) {
      const gp = gainPp(st.rows, 'geprueft', 'echt');
      body.append(chipRowText('c.result', { pp: gp.pp, lo: gp.lo, hi: gp.hi }, 'sim'));
    }
  };

  const chipRowText = (key: string, p: Record<string, string | number>, chip: 'sim' | 'traum'): HTMLElement => {
    const r = chipRow(ctx, chip);
    r.set(ctx.t(key, p));
    return r.el;
  };

  const applyFilter = (): void => {
    let found = 0,
      falseFlags = 0;
    st.tiles.forEach((t, i) => {
      if (wall.flags[i] && t.error) found++;
      else if (wall.flags[i] && !t.error) falseFlags++;
    });
    st.found = found;
    st.falseFlags = falseFlags;
    wall.selected = -1;
    lupeCv = null;
    lupeRows = null;
    persist();
    ctx.game.juice.popup([C.wall.x - 0.5, 3.2, C.wall.z], T('c.pop.found', { n: found, f: falseFlags }), { tone: found >= C.errors ? 'good' : 'muted', seconds: 2.4 });
    if (found >= C.errors && falseFlags <= C.falseFlags) sound.ok();
    st.step = stepNow();
    render?.();
  };

  // ── Entscheider: the Traumdaten-Deal ─────────────────────────────────────────────────────────
  const buildDeal = (body: HTMLElement): void => {
    body.append(el('div', '', ctx.t('c.deal.q'), 'font-size:13px;margin-top:4px'));
    const row = el('div', 'op-row', undefined, 'flex-direction:column;align-items:stretch;gap:6px');
    for (const k of ['a', 'b'] as const)
      row.append(
        button(ctx.t(`c.deal.${k}`), st.offer === k ? 'btn primary' : 'btn', () => {
          st.offer = k;
          st.found = k === 'b' ? C.errors : 0;
          st.mix = k === 'b' ? 'geprueft' : 'alle';
          st.offline = true;
          persist();
          drawBars();
          render?.();
        }, `c-deal-${k}`),
      );
    body.append(row);
    if (!st.offer) return;
    if (!st.trapNamed) {
      const r2 = el('div', 'op-row');
      r2.append(button(ctx.t('c.trapYes'), 'btn ghost', () => {
        st.trapNamed = true;
        st.revealed = true;
        persist();
        drawBars();
        render?.();
      }, 'c-trap'));
      body.append(r2);
    }
    const r3 = el('div', 'op-row');
    r3.append(button(ctx.t('c.pruef'), 'btn primary', () => runPruefzelle(() => void ctx.ui.card(api.befund())), 'c-pruef'));
    body.append(r3);
  };

  // ── the self test: pilot the H1-2 to the cart, the policy grasps and pushes ───────────────────
  const handle = new THREE.Vector3();
  const hooks = {
    title: T('c.bar'),
    keys: ['KeyR'],
    mu: (): number => FLOOR.train,
    command: (simDt: number): { v: number; w: number } | null => {
      const rig = roster.rig('h12');
      if (!rig) return null;
      const g = rig.gait;
      if (st.trialPhase === 'walkout') {
        const dz = -12.4 - g.pos.z;
        if (dz < 0.05) {
          st.trialPhase = 'drive';
          setStatus('c.s.drive');
          return { v: 0, w: 0 };
        }
        return { v: Math.min(g.p.vMax, dz * 1.5 + 0.15), w: 0 };
      }
      if (st.trialPhase === 'drive') return pilot.keys();
      if (st.trialPhase === 'grasp') {
        // the policy lines up behind the handle
        let e = rig.gait.psiFacing(0, 1) - g.psi;
        e = Math.atan2(Math.sin(e), Math.cos(e));
        return { v: 0, w: THREE.MathUtils.clamp(e * 2, -0.6, 0.6) };
      }
      if (st.trialPhase === 'push') {
        st.pushT += simDt;
        // the closed loop: the mix's policy pushes the cart up the ramp — or does not quite
        const failAt = st.trialOk ? Infinity : 2.4;
        if (st.pushT < failAt) return { v: 0.42, w: 0 };
        return { v: 0, w: 0 };
      }
      return { v: 0, w: 0 };
    },
    clamp: (p: THREE.Vector3) => {
      p.x = THREE.MathUtils.clamp(p.x, C.laneX - 3.2, C.laneX + 3.2);
      p.z = THREE.MathUtils.clamp(p.z, -15, -0.4);
      // the cart stops the robot before the policy has it
      if (st.trialPhase === 'drive' && Math.abs(p.x - cart.position.x) < 0.75 && p.z > cart.position.z - 1.2 && p.z < cart.position.z + 0.6) p.z = Math.min(p.z, cart.position.z - 1.2);
    },
    onKey: (code: string) => {
      if (code === 'KeyR') {
        placeCart();
        const rig = roster.rig('h12');
        rig?.place(C.laneX, -12.4, 0, 1);
        if (rig) rig.armMode = 'rest';
        st.trialPhase = 'drive';
        st.trialT = 0;
        setStatus('c.s.drive');
      }
    },
    onImagine: () => {
      // the dream is optimistic: it shows the cart on the lift whatever the mix
      const rig = roster.rig('h12');
      if (!rig) return;
      sound.swell();
      sound.hum(true);
      ghosts.show('h12', [{ x: C.lift.x, z: C.lift.z - 1.2, head: 0, alpha: 0.9 }], rig.model.getPose(), [], [{ x: C.lift.x, y: C.lift.h + 0.5, z: C.lift.z, hx: 0.45, hy: 0.3, hz: 0.55 }], { holdS: 0 });
    },
    onAct: () => {
      sound.hum(false);
      ghosts.hide();
    },
    update: (_dt: number, simDt: number) => {
      const rig = roster.rig('h12');
      if (!rig) return;
      const g = rig.gait;
      if (g.touchdown) sound.step([g.pos.x, 0.05, g.pos.z], 0.6);
      if (st.trialPhase === 'drive' || st.trialPhase === 'grasp' || st.trialPhase === 'push') st.trialT += simDt;
      handle.set(cart.position.x, 0.95, cart.position.z - 0.62);
      if (st.trialPhase === 'drive' && Math.hypot(g.pos.x - handle.x, g.pos.z - (handle.z - 0.45)) < C.graspR) {
        st.trialPhase = 'grasp';
        st.pushT = 0;
        rig.armMode = 'reach';
        st.trialOk = rng(H.seed())() < closedRate(C, st.mix ?? 'geprueft', st.found, st.falseFlags);
        setStatus('c.s.grasp');
        sound.snap();
        ctx.after(1.0, () => {
          if (st.trialPhase === 'grasp') {
            st.trialPhase = 'push';
            setStatus('c.s.push');
          }
        });
      }
      if (rig.armMode === 'reach') {
        g.side(_l);
        rig.handL.copy(handle).addScaledVector(_l, 0.24);
        rig.handR.copy(handle).addScaledVector(_l, -0.24);
      }
      if (st.trialPhase === 'push') {
        // the cart rides ahead of the hands; up the ramp it climbs; a failed policy lets it roll back
        cart.position.z = g.pos.z + 0.45 + 0.62;
        cart.position.x += (C.laneX - cart.position.x) * 0.05;
        const z = cart.position.z;
        cart.position.y = z > C.ramp.z0 ? Math.min(C.lift.h, ((z - C.ramp.z0) / rampLen) * C.lift.h) : 0;
        cart.rotation.x = z > C.ramp.z0 && z < C.ramp.z1 ? -Math.atan2(C.lift.h, rampLen) : 0;
        if (!st.trialOk && st.pushT > 2.4) {
          // the hands slip off the handle: the cart rolls back down
          rig.armMode = 'rest';
          trialEnd(false);
        } else if (st.trialOk && z >= C.lift.z) trialEnd(true);
      }
      if (st.trialT > C.trialS && (st.trialPhase === 'drive' || st.trialPhase === 'grasp')) trialEnd(false);
    },
    onExit: () => {
      sound.hum(false);
      ghosts.hide();
      H.active = null;
      if (st.trialPhase !== 'result') st.trialPhase = 'off';
      const rig = roster.rig('h12');
      if (rig) rig.armMode = 'rest';
      H.refreshObjective();
    },
    panel: (root: HTMLElement) => {
      root.dataset.th = 'panel-c-trial';
      root.append(el('div', 'eyebrow', ctx.t('c.trialTitle')));
      const s = chipRow(ctx, 'sim', T('c.chipNote'));
      status = s;
      root.append(s.el);
      root.append(chipRowText('c.mixNow', { mix: mixLabel(st.mix ?? 'geprueft') }, 'sim'));
      root.append(legend([[['W', 'A', 'D'], ctx.t('k.walk')], [['␣'], ctx.t('k.dream')], [['R'], ctx.t('k.retry')], [['V'], ctx.t('k.chase')]]));
      setStatus(st.trialPhase === 'walkout' ? 'c.s.walkout' : 'c.s.drive');
      return () => {
        status = null;
      };
    },
  };
  const _l = new THREE.Vector3();
  let status: { set(s: string): void } | null = null;
  const setStatus = (key: string): void => status?.set(ctx.t(key));

  const trialEnd = (ok: boolean): void => {
    if (st.trialPhase === 'result') return;
    st.trialPhase = 'result';
    st.trial = ok;
    persist();
    const rig = roster.rig('h12');
    if (rig) rig.armMode = 'rest';
    if (ok) {
      sound.ok();
      ctx.game.juice.burst([C.lift.x, 1.0, C.lift.z], { tone: 'teal', count: 40, spread: 1 });
      ctx.game.juice.popup([C.lift.x, 1.8, C.lift.z], T('c.pop.ok'), { tone: 'good', seconds: 2 });
    } else {
      ctx.game.juice.popup([cart.position.x, 1.8, cart.position.z], T('c.pop.fail'), { tone: 'bad', seconds: 2.4 });
      sound.thud([cart.position.x, 0.4, cart.position.z]);
      ctx.after(0.6, () => {
        cart.position.y = 0;
        cart.rotation.x = 0;
        cart.position.z = Math.min(cart.position.z, C.ramp.z0 - 0.7);
      });
    }
    status?.set(ctx.t(ok ? 'c.s.ok' : 'c.s.fail'));
    H.say(T(ok ? 'emi.c.trialOk' : 'emi.c.trialFail'));
    ctx.after(2.5, () => {
      if (pilot.rig?.key === 'h12') pilot.exit();
      H.refreshObjective();
    });
  };

  const start = (): void => {
    if (H.waitFor('h12')) return;
    if (roster.state('h12') === 'crouched') {
      ctx.hud.toast(T('c.locked'), { kind: 'info' });
      return;
    }
    if (!st.offline) {
      ctx.hud.toast(T('c.firstMix'), { kind: 'info' });
      return;
    }
    const rig = roster.rig('h12')!;
    H.active = 'c';
    roster.setActive('h12');
    void ghosts.prepare('h12');
    placeCart();
    rig.place(DOCKS.x.h12, DOCKS.robotZ, 0, 1);
    rig.armMode = 'rest';
    st.trialPhase = 'walkout';
    st.trialT = 0;
    pilot.enter(rig, hooks);
  };

  ctx.addInteractable({ object: desk, label: T('c.desk'), hint: T('c.deskHint'), range: 2.8, onInteract: () => openConsole() });

  const api: StationC = {
    trialNear() {
      const rig = roster.rig('h12');
      if (!rig || pilot.rig?.key !== 'h12') return;
      st.trialPhase = 'drive';
      rig.place(cart.position.x, cart.position.z - 0.62 - 0.6, 0, 1);
    },
    pick(i) {
      wall.selected = i;
      render?.();
    },
    start,
    console: openConsole,
    challenge,
    solve(stars = 1) {
      st.found = stars >= 2 ? C.errors : 1;
      st.falseFlags = 0;
      st.mix = 'geprueft';
      st.offline = true;
      st.revealed = true;
      st.trapNamed = stars >= 3;
      st.offer = stars >= 2 ? 'b' : 'a';
      st.rows = pruefzelle(C, { seed: 1, found: st.found, falseFlags: 0, withStillstand: true });
      st.lanes = C.n;
      install();
    },
    get status() {
      return { step: stepNow(), found: st.found, falseFlags: st.falseFlags, mix: st.mix, offline: st.offline, revealed: st.revealed, trapNamed: st.trapNamed, rows: st.rows?.map((r) => ({ mix: r.mix, k: r.k, n: r.n })) ?? null, installed: st.installed, trial: st.trial, trialPhase: st.trialPhase, offer: st.offer, flags: wall.flags, tiles: st.tiles.map((t) => t.error), clips: clipsReady };
    },
    update(dt) {
      // the wall loops at ≈ 15 fps while you are near (2 MB per upload): a still under reduced motion
      wallT += dt;
      const near = ctx.playerDistance < 60 && (ctx.toLocal(ctx.player.position, _p).x > 8 || H.active === 'c');
      if (st.foldT >= 0) {
        st.foldT += dt;
        wall.fold = Math.min(1, st.foldT / JUICE.foldS);
        if (st.foldT > JUICE.foldS + JUICE.climbS + 1) {
          st.foldT = -1;
          wall.fold = 0;
        }
        wall.draw(wallT, ctx.settings.reducedMotion);
      } else if (near && wallT - wallDrawn > 1 / 15) {
        wallDrawn = wallT;
        wall.draw(wallT, ctx.settings.reducedMotion);
      }
      if (lupeCv && wall.selected >= 0 && wallT - lupeDrawn > 1 / 15) {
        lupeDrawn = wallT;
        const ms = wall.lupe(lupeCv.getContext('2d')!, lupeCv.width, lupeCv.height, wall.selected, wallT, ctx.settings.reducedMotion);
        if (lupeRows) {
          lupeRows.replaceChildren();
          for (const m of ms) {
            if (m.label === 'present' && m.value === 1) continue;
            const r = chipRow(ctx, 'traum');
            r.set(ctx.t(`c.lupe.${m.label}`, { v: m.unit === 'm/s' ? ctx.i18n.num(m.value, 1) : m.value }) + (m.bad ? ' !' : ''));
            if (m.bad) r.el.style.color = 'var(--amber, #FBBF24)';
            lupeRows.append(r.el);
          }
        }
      }
    },
    async glitchSequence(rm) {
      // the dream wall full in view, its glitch loops for 6 s, then the upload fold (flash-check)
      for (let k = 0; k < 40 && !wallReady(); k++) await new Promise((r) => setTimeout(r, 100));
      ctx.player.teleport([C.cam.at[0], 0, C.cam.at[2]], { yawDeg: -90, pitchDeg: 4 });
      const t0 = performance.now();
      while (performance.now() - t0 < 6000) {
        wall.draw(wallT, rm);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      st.foldT = 0;
      await new Promise((r) => setTimeout(r, (JUICE.foldS + 0.6) * 1000));
    },
    befund(): InfoCardSpec {
      const rows = st.rows ?? pruefzelle(C, { seed: 1, found: C.errors, falseFlags: 0 });
      const gp = gainPp(rows, 'geprueft', 'echt');
      return {
        eyebrow: T('c.befund.eyebrow'),
        title: T('c.befund.title'),
        body: [T('c.befund.lesson')],
        bullets: [T('c.befund.mess'), T('c.befund.grenze'), T('c.befund.frage'), T('c.befund.f1'), T('c.befund.f2'), T('c.befund.f3')],
        forDecisionMakers: { title: T('c.befund.werkTitle'), body: T('c.befund.werk') },
        illustrative: true,
        illustrativeNote: T('c.befund.note', { pp: gp.pp }),
      };
    },
  };
  let wallT = 0;
  let wallDrawn = -1;
  let lupeDrawn = -1;
  const _p = new THREE.Vector3();
  const wallReady = (): boolean => clipsReady;
  wall.draw(0, true);
  return api;
}
