/**
 * WP15 — the island's small egg props (plan §4.13, R9 §5):
 *  - egg 3 „Robota“: the night shift's locker in the Dunkelfabrik's forecourt, a theatre ticket „R.U.R.
 *    · 1921“ (our own design) sticking out of its door (H1). E: the ticket slides out → the find;
 *  - egg 15 „Werkbank der Offenen“: a timber door „DANKE“ behind the Schauhalle, on the Glasbalkon
 *    side (H1). E: the credits page (every real model and the software with its makers and licence)
 *    → the find. WP11's credits room can send 'schauhalle:danke' when you step into it: the same find;
 *  - egg 1 „Die nächste Zahl“ (promoted by the secret-audit rule, §4.13): a small console at the
 *    plaza end of the Allee, where the floor's 17 arcs end, asks „a(17) = 25. Und dann?“. 43 sends the
 *    next eight arcs a(18…25) up over the plaza entrance in teal light for 10 s.
 * Each prop is one or two meshes with the shared paint (life ledger), built when the life chunk loads.
 */
import * as THREE from 'three';
import type { Text, ZoneContext } from '@/core/zones';
import { openCredits } from '@/ui/Credits';
import type { Director } from '../life/director';
import { NAECHSTE } from '../life/tuning';
import { PAL, at, box, col, mergeParts } from '../life/geo';
import { DANKE_DOOR, LOCKER } from './defs';
import { cullTinyText } from '../detail';

const T = (de: string, en: string): Text => ({ de, en });

// ── egg 3: the night-shift locker ────────────────────────────────────────────────────────────────────
export function buildLocker(ctx: ZoneContext, h: { director: Director; paint: THREE.Material }): { found(): boolean } {
  const D = h.director;
  const [lx, , lz] = LOCKER.at;
  const g = new THREE.Group();
  g.name = 'life:robota-locker';
  g.position.set(lx, 0, lz);
  g.rotation.y = THREE.MathUtils.degToRad(LOCKER.yawDeg);
  D.roots.island.add(g);
  const W = 0.52,
    H = 1.86,
    Dp = 0.46;
  // a slate steel locker with vents, a timber bench in front, a number plate; the door stands ajar a finger's width
  const body = new THREE.Mesh(
    mergeParts([
      box(W, H, Dp, PAL.slate, 0, H / 2, 0),
      box(W + 0.02, 0.03, Dp + 0.02, PAL.carbon, 0, H + 0.015, 0),
      ...[0, 1, 2, 3].map((k) => box(0.26, 0.012, 0.004, PAL.carbon, 0.02, H - 0.22 - k * 0.04, Dp / 2 + 0.006)),
      ...[0, 1, 2, 3].map((k) => box(0.26, 0.012, 0.004, PAL.carbon, 0.02, 0.32 + k * 0.04, Dp / 2 + 0.006)),
      at(col(new THREE.BoxGeometry(W - 0.03, H - 0.06, 0.018), 0x67707c), 0, H / 2, Dp / 2 + 0.01, 0, 0.05, 0),
      box(0.03, 0.12, 0.03, PAL.stoneDark, W / 2 - 0.07, H * 0.55, Dp / 2 + 0.03),
      box(0.16, 0.06, 0.006, PAL.sand, 0, H - 0.12, Dp / 2 + 0.022),
      // the bench of the changing room
      box(1.3, 0.05, 0.34, PAL.timberFresh, 0, 0.44, 0.62),
      box(0.05, 0.44, 0.3, PAL.timberSilver, -0.55, 0.22, 0.62),
      box(0.05, 0.44, 0.3, PAL.timberSilver, 0.55, 0.22, 0.62),
    ]),
    h.paint,
  );
  body.name = 'life:robota-locker-body';
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  D.track(body);
  ctx.physics.addStaticBox({ size: [W, H, Dp], position: g.localToWorld(new THREE.Vector3(0, H / 2, 0)).toArray() as [number, number, number], rotation: [0, g.rotation.y, 0], surface: 'metal' });
  // the ticket: cream card with a darker stub, sticking out of the door's gap at eye height
  const ticket = new THREE.Mesh(
    mergeParts([box(0.15, 0.065, 0.003, PAL.paper, 0, 0, 0), box(0.034, 0.065, 0.0035, 0xc9bfa6, 0.058, 0, 0.0004), ...[0, 1, 2].map((k) => box(0.07, 0.006, 0.0036, PAL.carbon, -0.025, 0.014 - k * 0.012, 0.0005))]),
    h.paint,
  );
  ticket.name = 'life:robota-ticket';
  const tIn = new THREE.Vector3(W / 2 + 0.02, H * 0.62, Dp / 2 - 0.02);
  ticket.position.copy(tIn);
  ticket.rotation.set(0, Math.PI / 2 - 0.15, 0.08);
  g.add(ticket);
  D.track(ticket);
  const label = ctx.text3d.create({ text: { de: 'R.U.R. · 1921', en: 'R.U.R. · 1921' }, font: 'mono-medium', size: 0.012, color: 0x2a2622, anchorX: 'center', anchorY: 'middle', position: [-0.02, 0.019, 0.003] }, ticket);
  cullTinyText(ctx, label);
  const plate = ctx.text3d.create({ text: { de: 'NACHTSCHICHT', en: 'NIGHT SHIFT' }, font: 'mono', size: 0.026, color: 0x2a2622, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.06, position: [0, H - 0.12, Dp / 2 + 0.027] }, g);
  cullTinyText(ctx, plate);

  let out = 0;
  let found = ctx.game.secrets.has('robota');
  const tick = (dt: number): void => {
    if (found && out < 1) {
      out = Math.min(1, out + dt / 0.7);
      const k = out * out * (3 - 2 * out);
      ticket.position.set(tIn.x + 0.16 * k, tIn.y + 0.02 * k, tIn.z + 0.1 * k);
      ticket.rotation.set(-0.25 * k, Math.PI / 2 - 0.15 + 0.9 * k, 0.08 * (1 - k));
    }
  };
  D.area('robota', { center: [lx, 1, lz], radius: 2, frame: 'island' });
  // a small prop: drawn only in its near tier (≤ 42 m), so it costs nothing from the plaza or the bridge head
  D.register({ id: 'egg:robota', area: 'robota', job: T('Nachtschicht', 'Night shift'), kind: 'machine', near: tick, tier: (t) => void (g.visible = t === 'near') });
  const take = (): void => {
    if (found) return;
    found = true;
    ctx.audio.play('open', { volume: 0.5, at: [lx, 1.2, lz] });
    ctx.game.juice.popup([lx, 1.5, lz], T('R.U.R. · 1921', 'R.U.R. · 1921'), { tone: 'teal', seconds: 2.6 });
    ctx.game.secrets.find('robota', [lx, 1.2, lz]);
  };
  ctx.addInteractable({ object: ticket, label: T('Ticket ansehen', 'Look at the ticket'), range: 2.4, isEnabled: () => !found || out < 1, onInteract: take });
  ctx.addInteractable({ object: body, label: T('Spind der Nachtschicht', 'Night-shift locker'), hint: T('Da steckt etwas in der Tür.', 'Something is stuck in the door.'), range: 2.2, highlight: false, isEnabled: () => !found, onInteract: take });
  ctx.debug.register('egg-robota', () => {
    take();
    return ctx.game.secrets.has('robota');
  });
  return { found: () => found };
}

// ── egg 15: the „Danke“ door behind the Schauhalle ────────────────────────────────────────────────────
export function buildDankeDoor(ctx: ZoneContext, h: { director: Director; paint: THREE.Material }): void {
  const D = h.director;
  const find0 = (): void => void ctx.game.secrets.find('werkbank');
  // WP11's hall has its own „Danke“ room (it finds the egg itself and announces 'schauhalle:werkbank'):
  // then this door stays away; it is the fallback while the hall has no code
  ctx.events.on('schauhalle:werkbank', find0);
  ctx.events.on('schauhalle:danke', find0);
  ctx.debug.register('egg-werkbank', () => {
    find0();
    return ctx.game.secrets.has('werkbank');
  });
  if (ctx.zones.list({ kind: 'all' }).find((m) => m.id === 'schauhalle')?.hasCode) return;
  const [x, , z] = DANKE_DOOR;
  const g = new THREE.Group();
  g.name = 'life:danke-door';
  g.position.set(x, 0, z);
  // it faces the Glasbalkon walkway (west), standing against the hall's north wall
  g.rotation.y = -Math.PI / 2;
  D.roots.island.add(g);
  const frame = new THREE.Mesh(
    mergeParts([
      box(0.12, 2.3, 0.16, PAL.timberSilver, -0.56, 1.15, 0),
      box(0.12, 2.3, 0.16, PAL.timberSilver, 0.56, 1.15, 0),
      box(1.24, 0.14, 0.16, PAL.timberSilver, 0, 2.37, 0),
      // the door leaf: light glulam with a glass strip and a brass-free alu handle
      box(1.0, 2.2, 0.05, PAL.timberFresh, 0, 1.1, -0.02),
      box(0.16, 1.2, 0.052, 0x8fa3a6, -0.28, 1.25, -0.019),
      box(0.04, 0.24, 0.06, 0xc9c4bf, 0.38, 1.05, 0.02),
      box(1.3, 0.05, 0.5, PAL.stoneDark, 0, 0.025, 0.12),
    ]),
    h.paint,
  );
  frame.name = 'life:danke-frame';
  frame.castShadow = true;
  g.add(frame);
  D.track(frame);
  ctx.physics.addStaticBox({ size: [0.5, 2.4, 1.3], position: [x, 1.2, z], surface: 'wood' });
  D.area('danke', { center: [x, 1.2, z], radius: 2, frame: 'island' });
  D.register({ id: 'egg:werkbank', area: 'danke', job: T('Danke sagen', 'Say thank you'), kind: 'machine', tier: (t) => void (g.visible = t === 'near') });
  const sign = ctx.text3d.create({ text: { de: 'DANKE', en: 'THANK YOU' }, font: 'display', size: 0.14, color: 0xe7e5e4, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.08, position: [0, 2.37, 0.085] }, g);
  cullTinyText(ctx, sign);
  const sub = ctx.text3d.create({ text: { de: 'Werkbank der Offenen', en: 'The open workbench' }, font: 'mono', size: 0.045, color: 0x2a2622, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.05, position: [0, 1.95, 0.012] }, g);
  cullTinyText(ctx, sub);
  const find = (): void => void ctx.game.secrets.find('werkbank', [x, 1.4, z]);
  ctx.addInteractable({
    object: frame,
    label: T('Tür „Danke“ öffnen', 'Open the „Thank you“ door'),
    hint: T('Wer die echten Modelle gebaut hat.', 'Who built the real models.'),
    range: 2.6,
    onInteract: () => {
      ctx.audio.play('open', { volume: 0.5, at: [x, 1.2, z] });
      find();
      void openCredits({ focus: 'so101' });
    },
  });
}

// ── egg 1: „Die nächste Zahl“ at the plaza end of the Allee ──────────────────────────────────────────
/** a(17…25) of Recamán's sequence (OEIS A005132): the floor ends at a(17) = 25 */
const NEXT = [25, 43, 62, 42, 63, 41, 18, 42, 17];

export function buildNaechsteZahl(ctx: ZoneContext, h: { director: Director; paint: THREE.Material }): { stats(): Record<string, unknown> } {
  const D = h.director;
  const [cx, , cz] = NAECHSTE.console;
  const g = new THREE.Group();
  g.name = 'life:naechste-zahl';
  g.position.set(cx, 0, cz);
  // turned toward someone walking up the Allee (from the south-west)
  g.rotation.y = -0.35;
  D.roots.island.add(g);
  const desk = new THREE.Mesh(
    mergeParts([
      at(col(new THREE.CylinderGeometry(0.1, 0.13, 0.92, 12), PAL.white), 0, 0.46, 0),
      at(col(new THREE.BoxGeometry(0.62, 0.05, 0.42), PAL.carbon), 0, 0.96, 0, -0.42, 0, 0),
      at(col(new THREE.BoxGeometry(0.56, 0.004, 0.36), 0x1d2a2a), 0, 0.987, 0.009, -0.42, 0, 0),
      at(col(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 16), PAL.carbon), 0, 0.02, 0),
    ]),
    h.paint,
  );
  desk.name = 'life:naechste-desk';
  desk.castShadow = true;
  g.add(desk);
  D.track(desk);
  ctx.physics.addStaticCylinder({ radius: 0.24, height: 1.0, position: [cx, 0.5, cz], surface: 'metal' });
  const ask = ctx.text3d.create({ text: { de: 'a(17) = 25. Und dann?', en: 'a(17) = 25. And then?' }, font: 'mono-medium', size: 0.046, color: 0x2dd4bf, anchorX: 'center', anchorY: 'middle', position: [0, 0, 0] }, g);
  ask.position.set(0, 1.0, 0.025);
  ask.rotation.x = -Math.PI / 2 + 0.42;
  cullTinyText(ctx, ask);

  // the arcs a(17)→a(25): upright half-circles on a number axis across the plaza entrance (0,42 m per unit),
  // odd steps leaning toward the tower, even ones toward the Allee — a gate of arcs over the walk
  const UNIT = 0.42;
  const X0 = -((25 + 63) / 2) * UNIT;
  const ZA = 31.2;
  const pos: number[] = [];
  const starts: number[] = [];
  for (let k = 1; k < NEXT.length; k++) {
    const a = NEXT[k - 1],
      b = NEXT[k];
    const xa = X0 + a * UNIT,
      xb = X0 + b * UNIT;
    const r = Math.abs(xb - xa) / 2,
      mid = (xa + xb) / 2;
    const lean = (k % 2 ? 1 : -1) * 0.38;
    const SEG = 40;
    starts.push(pos.length / 3);
    for (let i = 0; i < SEG; i++) {
      for (const j of [i, i + 1]) {
        const phi = (j / SEG) * Math.PI;
        const px = mid + Math.cos(phi) * r * Math.sign(xa - xb);
        const up = Math.sin(phi) * r;
        const y = up * Math.cos(lean) + 0.04;
        const zz = ZA - up * Math.sin(lean);
        // a flat ribbon, 5 cm wide (two triangles per segment end pair)
        pos.push(px, y, zz - 0.025, px, y + 0.05, zz + 0.025);
      }
    }
  }
  starts.push(pos.length / 3);
  // ribbons as triangle pairs: (a0, a1, b0) (a1, b1, b0) per segment
  const tri: number[] = [];
  for (let s = 0; s < pos.length / 3; s += 4) tri.push(s, s + 1, s + 2, s + 1, s + 3, s + 2);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  arcGeo.setIndex(tri);
  arcGeo.computeVertexNormals();
  ctx.onDispose(() => arcGeo.dispose());
  const arcs = new THREE.Mesh(arcGeo, ctx.materials.light(0x2dd4bf));
  arcs.name = 'life:naechste-arcs';
  arcs.visible = false;
  arcs.frustumCulled = false;
  D.roots.island.add(arcs);
  D.track(arcs);
  const SEG_IDX = 40 * 6;
  let show = -1;
  const tick = (dt: number): void => {
    if (show < 0) return;
    show += dt;
    const per = NAECHSTE.arcS;
    const total = (NEXT.length - 1) * per;
    if (show < total) arcs.geometry.setDrawRange(0, Math.ceil((show / per) * SEG_IDX));
    else if (show < total + NAECHSTE.holdS) arcs.geometry.setDrawRange(0, (NEXT.length - 1) * SEG_IDX);
    else if (show < total * 2 + NAECHSTE.holdS) arcs.geometry.setDrawRange(Math.floor(((show - total - NAECHSTE.holdS) / per) * SEG_IDX), Infinity);
    else {
      show = -1;
      arcs.visible = false;
    }
    void starts;
  };
  D.area('naechste', { center: [cx, 1, cz], radius: 4, frame: 'island' });
  D.register({ id: 'egg:naechste-zahl', area: 'naechste', job: T('Die Folge weiterzeichnen', 'Draw the sequence on'), kind: 'machine', near: tick, mid: tick, tier: (t) => void (g.visible = t === 'near') });
  let tries = 0;
  const play = (): void => {
    show = 0;
    arcs.visible = true;
    arcs.geometry.setDrawRange(0, 0);
    for (let k = 1; k < NEXT.length; k++) ctx.after(k * NAECHSTE.arcS, () => ctx.game.juice.cue('tick', { at: [X0 + NEXT[k] * UNIT, 0.5, ZA], pitch: Math.pow(2, (NEXT[k] - 30) / 36), volume: 0.6 }));
    ctx.game.secrets.find('naechste-zahl', [cx, 1.1, cz]);
  };
  const open = (): void => {
    tries++;
    void ctx.hud.openModal((el, close) => {
      el.classList.add('life-naechste');
      const msg = document.createElement('p');
      msg.style.cssText = 'margin:0 0 12px;line-height:1.5';
      const head = document.createElement('div');
      head.className = 'eyebrow';
      head.textContent = ctx.i18n.resolve(T('// RECAMÁN-FOLGE · OEIS A005132', '// RECAMÁN SEQUENCE · OEIS A005132'));
      const h2 = document.createElement('h2');
      h2.textContent = ctx.i18n.resolve(T('a(17) = 25. Und dann?', 'a(17) = 25. And then?'));
      msg.textContent = ctx.i18n.resolve(T('Zurück um 18, wenn das positiv und neu ist – sonst vor. Was ist a(18)? ', 'Back by 18 if that is positive and new – otherwise forward. What is a(18)? '));
      msg.append(ctx.ui.chip('quelle', T('OEIS A005132, die Recamán-Folge', 'OEIS A005132, Recamán’s sequence')));
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';
      row.dataset.chip = 'ui';
      for (const n of [7, 26, 42, 43]) {
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = String(n);
        b.onclick = () => {
          if (n === 43) {
            close();
            play();
          } else {
            msg.textContent = ctx.i18n.resolve(n === 7 ? T('25 − 18 = 7 gibt es schon (a(5)). Also vorwärts: 25 + 18. ', '25 − 18 = 7 is taken (a(5)). So forward: 25 + 18. ') : T('Nicht ganz. Zurück geht nicht – 7 gibt es schon. Also 25 + 18. ', 'Not quite. Back is out – 7 is taken. So 25 + 18. '));
            msg.append(ctx.ui.chip('quelle', T('OEIS A005132, die Recamán-Folge', 'OEIS A005132, Recamán’s sequence')));
            ctx.game.juice.cue('oops');
          }
        };
        row.append(b);
      }
      el.append(head, h2, msg, row);
    }, { width: 420 });
  };
  ctx.addInteractable({ object: desk, label: T('Wie geht die Folge weiter?', 'How does the sequence go on?'), range: 2.4, onInteract: open });
  ctx.debug.register('egg-naechste', () => {
    play();
    return ctx.game.secrets.has('naechste-zahl');
  });
  return { stats: () => ({ tries, showing: show >= 0 }) };
}
