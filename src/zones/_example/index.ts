/**
 * _example — reference zone that exercises EVERY engine API once.
 * Dev-only (ids starting with "_" never ship): open /?zone=_example&skipIntro=1
 * Copy patterns from here; keep your own zone inside src/zones/<id>/.
 *
 * Stations (GDD three-stamp arc): A "waage" (Probieren), B "wurf" (Verstehen),
 * C "fallturm" ◆ (Messen, see dropTower.ts). Debug hooks: __academy.solve('_example', 'solve-a'|'solve-b'|'solve-c').
 */
import * as THREE from 'three';
import { defineZone, type ChallengeDef, type DynamicHandle, type EmiHandle, type ZoneContext } from '@/core/zones';
import { STRINGS } from './strings';
import { buildDropTower, type DropTower } from './dropTower';

const CRATES = [
  { mass: 1, size: 0.3 },
  { mass: 5, size: 0.42 },
  { mass: 20, size: 0.58 },
  { mass: 60, size: 0.78 },
];

// Module state is fine: a zone module is instantiated exactly once. Reset it in dispose().
let turntable: { setPose(p: [number, number, number], r: [number, number, number]): void } | null = null;
let turnAngle = 0;
let robot: { animate(t: number, o?: { walk?: number }): void; object: THREE.Object3D } | null = null;

/**
 * A small unbranded transport robot (AMR) from primitives: chassis, lift deck, sensor mast and
 * four wheels that spin with the drive speed. Two merged materials keep it to a few draw calls.
 */
function buildAmr(ctx: ZoneContext): { animate(t: number, o?: { walk?: number }): void; object: THREE.Object3D } {
  const M = ctx.materials;
  const g = new THREE.Group();
  g.name = 'amr:hersteller-x';
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 1.2), M.standard({ color: 0x3d3a37, roughness: 0.55, metalness: 0.35 }));
  body.position.y = 0.26;
  body.castShadow = true;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 1.1), M.rubber);
  deck.position.y = 0.445;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10), M.metal);
  mast.position.set(0, 0.7, 0.5);
  const scanner = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 18), M.accentTeal);
  scanner.position.set(0, 0.97, 0.5);
  g.add(body, deck, mast, scanner);
  const wheels: THREE.Mesh[] = [];
  const wGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.47, -0.4], [0.47, -0.4], [-0.47, 0.4], [0.47, 0.4]]) {
    const w = new THREE.Mesh(wGeo, M.rubber);
    w.position.set(x, 0.11, z);
    wheels.push(w);
    g.add(w);
  }
  let last = -1;
  return {
    object: g,
    animate(t, o = {}) {
      const dt = last < 0 ? 0 : Math.min(0.1, t - last);
      last = t;
      const spin = (o.walk ?? 0) * 0.77 / 0.11; // 0.77 m/s on the 2.2 m circle → wheel rad/s
      for (const w of wheels) w.rotation.x += spin * dt;
      scanner.rotation.y = t * 6;
    },
  };
}
let restoreGravity: (() => void) | null = null;
let tower: DropTower | null = null;
let emi: EmiHandle | null = null;
let crates: DynamicHandle[] = [];

export default defineZone({
  id: '_example',
  title: { de: 'Beispiel-Zone', en: 'Example zone' },
  // manifest (GDD §5.1) — all optional
  number: 0,
  verb: { de: 'TESTEN', en: 'TEST' },
  eyebrow: { de: '// 00 · TESTEN · ENGINE', en: '// 00 · TEST · ENGINE' },
  glyph: 'kiste',
  stations: [{ id: 'waage' }, { id: 'wurf' }, { id: 'fallturm', star: true }],
  album: 'example-blindflug',
  spawn: { position: [0, 0, 14], yawDeg: 0 },

  async init(ctx) {
    const M = ctx.materials;
    ctx.i18n.register(STRINGS);
    ctx.pass.registerAlbum({
      id: 'example-blindflug',
      title: { de: 'Blindflug im Fallturm', en: 'Flying blind in the drop tower' },
      text: { de: 'Ohne Vorhersage gemessen: Die Zahl stand da, aber niemand wusste, ob sie überrascht.', en: 'Measured without a prediction: the number was there, but nobody knew whether it was surprising.' },
      hint: { de: 'Tipp: Erst tippen, dann messen.', en: 'Hint: predict first, then measure.' },
    });

    // ── floor & entrance sign (exterior tier: visible ≤ 130 m) ─────────────
    const floor = new THREE.Mesh(new THREE.BoxGeometry(24, 0.06, 22), M.floorPlate(24, 22));
    floor.position.set(0, 0.03, 0);
    floor.receiveShadow = true;
    ctx.groups.exterior.add(floor);
    ctx.physics.addStaticBox({ size: [24, 0.06, 22], position: [0, 0.03, 0], surface: 'metal' });
    ctx.text3d.sign({ eyebrow: ctx.i18n.text('sign.eyebrow'), title: ctx.i18n.text('sign.title'), body: ctx.i18n.text('sign.body'), width: 3, stand: true, position: [-6.5, 0, 9], rotationY: 0.5 }, ctx.groups.exterior);
    // far tier: one cheap silhouette (visible > 130 m)
    const silhouette = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), M.metalDark);
    silhouette.position.set(6, 2, -6);
    ctx.groups.far.add(silhouette);

    // ── A: grabbable crates of different masses + scale trigger ───────────
    crates = CRATES.map((c, i) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(c.size, c.size, c.size), M.crate);
      mesh.position.set(-7 + i * 1.3, c.size / 2 + 0.07, 5);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      ctx.root.add(mesh);
      const h = ctx.physics.addDynamic(mesh, { mass: c.mass, label: ctx.i18n.text('crate'), friction: 0.7 });
      ctx.text3d.create({ text: `${c.mass} kg`, font: 'mono-medium', size: c.size * 0.22, color: 0xff6700, glow: 1.3, position: [0, 0, c.size / 2 + 0.003] }, mesh);
      return h;
    });
    ctx.physics.addStaticBox({ size: [1.4, 0.12, 1.4], position: [-4, 0.12, -1.5], material: M.panelElevated, surface: 'metal' });
    const scaleRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 6, 48), M.accentTeal);
    scaleRing.rotation.x = Math.PI / 2;
    scaleRing.position.set(-4, 0.19, -1.5);
    ctx.root.add(scaleRing);
    const scaleReadout = ctx.ui.readout(ctx.i18n.text('scale'), ctx.t('scaleEmpty'));
    const onScale = new Set<DynamicHandle>();
    const updateScale = (): void => {
      const m = [...onScale].reduce((s, b) => s + b.mass, 0);
      scaleReadout.set(m ? `${ctx.i18n.num(m, 1)} kg · ${ctx.i18n.num(m * 9.81)} N` : ctx.t('scaleEmpty'));
    };
    ctx.physics.addTrigger({
      shape: 'box',
      size: [1.3, 0.9, 1.3],
      position: [-4, 0.65, -1.5],
      filter: 'dynamic',
      onEnter: ({ body }) => {
        if (!body) return;
        onScale.add(body);
        updateScale();
        ctx.audio.beep(1320, 0.06, { at: [-4, 0.5, -1.5] });
        const m = [...onScale].reduce((s, b) => s + b.mass, 0);
        if (ctx.pass.award('waage', { value: { de: `m = ${ctx.i18n.num(m, 1)} kg · F = ${ctx.i18n.num(m * 9.81)} N`, en: `m = ${m.toFixed(1)} kg · F = ${Math.round(m * 9.81)} N` } }))
          ctx.hud.setObjective(ctx.i18n.text('objectiveThrow'));
      },
      onExit: ({ body }) => {
        if (body) onScale.delete(body);
        updateScale();
      },
    });
    ctx.hud.worldLabel([-4, 1.3, -1.5], ctx.i18n.text('scale'), { eyebrow: '// TRIGGER', kind: 'accent' });

    // ── B: throws (event bus) + GAME LAYER example (docs/FUN-PLAN.md §4) ───
    // One challenge per station, registered once. ★ = the stamp condition (any throw), ★★/★★★ =
    // thresholds on the metric. Award the stamp AND submit at the same moment: core merges them
    // into one banner (stamp ring + stars + „Linie n/18 für den Turm").
    const wurfDef: ChallengeDef = {
      id: 'wurf',
      title: { de: 'Wirf eine Kiste weit', en: 'Throw a crate far' },
      metric: { label: { de: 'Abwurf', en: 'Release' }, unit: 'm/s', better: 'higher', digits: 1 },
      goals: [
        { text: { de: 'Eine Kiste werfen', en: 'Throw a crate' } },
        { text: { de: 'Abwurf ≥ 6 m/s', en: 'Release ≥ 6 m/s' }, at: 6 },
        { text: { de: 'Abwurf ≥ 9 m/s', en: 'Release ≥ 9 m/s' }, at: 9 },
      ],
      lesson: { de: 'Gleicher Impuls, halbe Masse: doppelte Geschwindigkeit.', en: 'Same impulse, half the mass: twice the speed.' },
      // the former auto card: opened only from the banner ([H]) or the Pass
      why: () => ({ eyebrow: '// 00 · B · WURF', title: { de: 'Impuls: J = m · v', en: 'Impulse: J = m · v' }, body: { de: 'Ein Wurf überträgt einen Impuls.', en: 'A throw transfers an impulse.' } }),
      retry: () => {
        for (const c of crates) c.reset();
      },
    };
    const wurf = ctx.game.challenge(wurfDef);
    let throws = 0;
    ctx.events.on('throw', (p: { owner: string; impulse: number; speed: number; mass: number }) => {
      if (p.owner !== ctx.id) return;
      throws++;
      ctx.game.juice.cue('good');
      ctx.game.juice.popup(ctx.player.positionLocal().setY(1.6), `${ctx.i18n.num(p.speed, 1)} m/s`, { tone: 'teal' });
      if (ctx.pass.award('wurf', { value: { de: `J = ${ctx.i18n.num(p.impulse, 1)} N·s → v = ${ctx.i18n.num(p.speed, 1)} m/s`, en: `J = ${p.impulse.toFixed(1)} N·s → v = ${p.speed.toFixed(1)} m/s` } }))
        ctx.hud.setObjective(ctx.i18n.text('objectiveTower'), { target: [7, 0, -9] });
      const r = wurf.submit(p.speed);
      if (r.stars >= 1) ctx.game.juice.burst(ctx.player.positionLocal().setY(1.2), { tone: 'teal' });
      void throws;
    });
    // a Sensorkapsel on the ramp top (ids: '<zoneId>.kapsel'); core builds the visual and the pickup
    ctx.game.collectibles.place({ id: '_example.kapsel', position: [9.4, 2.4, 3] });

    // ── ramp + rolling ball ───────────────────────────────────────────────
    ctx.physics.addStaticBox({ size: [6, 0.2, 2], position: [6, 0.95, 3], rotation: [0, 0, THREE.MathUtils.degToRad(17)], material: M.concreteGridSized(6, 2), surface: 'concrete', friction: 0.5 });
    ctx.physics.addStaticBox({ size: [1.2, 1.9, 2], position: [9.4, 0.95, 3], material: M.metalDark, surface: 'metal' });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), M.orangePaint);
    ball.position.set(8.5, 2.15, 3);
    ball.castShadow = true;
    ctx.root.add(ball);
    ctx.physics.addDynamic(ball, { mass: 2, label: ctx.i18n.text('ball'), restitution: 0.3, friction: 0.4, angularDamping: 0.05 });

    // ── info console: info card + custom modal ─────────────────────────────
    const consoleBody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.7), M.panel);
    consoleBody.position.set(0, 0.5, -5);
    consoleBody.castShadow = true;
    ctx.root.add(consoleBody);
    ctx.physics.addStaticFromMesh(consoleBody, { shape: 'box', surface: 'metal' });
    const btnInfo = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.06, 24), M.accentOrange);
    btnInfo.position.set(-0.35, 1.03, -4.85);
    const btnGravity = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.06, 24), M.accentTeal);
    btnGravity.position.set(0.35, 1.03, -4.85);
    ctx.root.add(btnInfo, btnGravity);
    let presses = ctx.progress.get('presses', 0);
    ctx.addInteractable({
      object: btnInfo,
      label: ctx.i18n.text('button'),
      hint: ctx.i18n.text('buttonHint'),
      onInteract: () => {
        ctx.progress.set('presses', ++presses);
        void openMassCard(ctx);
      },
    });
    // GDD-style alias with a dynamic enabled() predicate
    ctx.interact.register(btnGravity, { label: ctx.i18n.text('gravity'), onUse: () => void openGravityDial(ctx), enabled: () => !ctx.player.operating });
    ctx.audio.loop('hum', { at: consoleBody, volume: 0.6 });
    ctx.lights.point([0, 2.2, -4], { color: 0xffd2a8, intensity: 5, distance: 7 });

    // ── pendulum: revolute joint to the zone's fixed body ─────────────────
    const R = ctx.physics.rapier;
    const pivot = new THREE.Vector3(6, 3.4, -2);
    for (const x of [-1.1, 1.1]) ctx.physics.addStaticBox({ size: [0.14, 3.5, 0.14], position: [pivot.x + x, 1.75, pivot.z], material: M.metalDark });
    ctx.physics.addStaticBox({ size: [2.4, 0.14, 0.14], position: [pivot.x, pivot.y + 0.07, pivot.z], material: M.metalDark });
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 16), M.steel);
    const L = 2.2;
    bob.position.set(pivot.x, pivot.y - L, pivot.z + 0.0001);
    bob.castShadow = true;
    ctx.root.add(bob);
    const bobH = ctx.physics.addDynamic(bob, { mass: 5, label: ctx.i18n.text('bob'), angularDamping: 0.1, linearDamping: 0.01 });
    ctx.physics.addJoint(R.JointData.revolute({ x: pivot.x, y: pivot.y, z: pivot.z }, { x: 0, y: L, z: 0 }, { x: 1, y: 0, z: 0 }), ctx.physics.zoneBody, bobH.body);
    bob.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, L, 6).translate(0, L / 2, 0), M.steel)); // added after addDynamic → not part of the collider
    bobH.applyImpulse([0, 0, 6]);

    // ── kinematic turntable ───────────────────────────────────────────────
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 48), M.floorPlate(3, 3));
    table.position.set(-7, 0.16, -7);
    table.receiveShadow = true;
    ctx.root.add(table);
    const tk = ctx.physics.addKinematic(table, { friction: 1 });
    turntable = { setPose: (p, r) => tk.setPose(p, r) };
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.01, 0.12), M.hazard(10));
    stripe.position.y = 0.105;
    table.add(stripe);

    // ── C: drop tower measuring station (operate mode, predict, Kennlinie) ─
    tower = buildDropTower(ctx, new THREE.Vector3(7, 0, -9));

    // ── interior: a roofed booth dims the ambient light while inside ───────
    ctx.physics.addStaticBox({ size: [4, 0.15, 3], position: [-7, 3, 1], material: M.metalDark });
    let exitBooth: (() => void) | null = null;
    ctx.physics.addTrigger({
      shape: 'box',
      size: [4, 3, 3],
      position: [-7, 1.5, 1],
      onEnter: () => (exitBooth = ctx.env.enterInterior({ ambient: 0.45 })),
      onExit: () => {
        exitBooth?.();
        exitBooth = null;
      },
    });

    // ── EMI unit (help key H, gestures) ───────────────────────────────────
    emi = ctx.emi.spawn({ unit: 'EMI-01', position: [3.2, 0.06, 6], yawDeg: 200 });
    emi.onAsk(() => {
      void emi!.say(ctx.i18n.text('emiAsk'));
      void emi!.gesture('point');
    });
    // registering the same id again replaces the def and keeps the record: now EMI reacts to results
    ctx.game.challenge({ ...wurfDef, emi });

    // ── procedural, unbranded robot (illustrative motion, labelled) ────────
    // Founder decision D2 (docs/DECISIONS.md): no third-party robot models, names or look-alikes.
    // Robots other than EMI are built in code from primitives, like this "Hersteller X" AMR.
    // ctx.assets.loadModel() loads your own GLBs from public/zones/<id>/ if you ever need one.
    robot = buildAmr(ctx);
    robot.object.position.set(7, 0.06, 8);
    ctx.root.add(robot.object);
    ctx.hud.worldLabel(robot.object, ctx.i18n.text('robot'), { eyebrow: { key: 'core.robot.disclaimer' }, offsetY: 1.2, maxDistance: 14, kind: 'muted' });

    // ── test hooks (Playwright agents complete stations deterministically) ─
    ctx.debug.register('solve-a', () => crates[2].setPosition([-4, 0.6, -1.5]));
    // solve hooks award the stamp AND submit a ★ result; stars3 hooks submit ★★★ (screenshots, playtest)
    ctx.debug.register('solve-b', () => {
      ctx.pass.award('wurf', { value: 'J = 22,0 N·s (debug)' });
      wurf.submit(4.4);
    });
    ctx.debug.register('stars3-b', () => {
      ctx.pass.award('wurf', { value: 'J = 22,0 N·s (debug)' });
      wurf.submit(11);
    });
    ctx.debug.register('solve-c', () => tower?.solve());
    ctx.debug.register('album', () => ctx.pass.unlockAlbum('example-blindflug'));
    ctx.debug.marker([0, 0.2, 0]);
    ctx.every(10, () => ctx.debug.log('alive', ctx.time.elapsed.toFixed(1)));

    // custom procedural sound on the zone bus (distance-attenuated)
    ctx.events.on('grab:start', (p: { owner: string }) => {
      const ac = ctx.audio.context,
        bus = ctx.audio.zoneBus;
      if (p.owner !== ctx.id || !ac || !bus) return;
      const o = ac.createOscillator();
      const gn = ac.createGain();
      o.frequency.value = 180;
      gn.gain.setValueAtTime(0.05, ac.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
      o.connect(gn).connect(bus);
      o.start();
      o.stop(ac.currentTime + 0.13);
    });
  },

  onEnter(ctx) {
    if (!ctx.pass.has('waage')) ctx.hud.setObjective(ctx.i18n.text('objective'), { target: [-4, 0, -1.5] });
    if (!ctx.progress.get('greeted', false)) {
      ctx.progress.set('greeted', true);
      void emi?.gesture('wave');
      void emi?.say([ctx.i18n.text('emi1'), ctx.i18n.text('emi2')]);
    }
  },

  onExit(ctx) {
    ctx.hud.setObjective(null);
    restoreGravity?.();
    restoreGravity = null;
  },

  fixedUpdate(dt) {
    turnAngle += dt * 0.6;
    turntable?.setPose([-7, 0.16, -7], [0, turnAngle, 0]);
    tower?.fixedUpdate(dt);
  },

  update(_dt, ctx) {
    if (!robot) return;
    const t = ctx.time.elapsed;
    const a = t * 0.35;
    robot.object.position.set(7 + Math.sin(a) * 2.2, 0.06, 8 + Math.cos(a) * 2.2);
    robot.object.rotation.y = a + Math.PI / 2;
    robot.animate(t, { walk: 1 });
  },

  dispose() {
    turntable = null;
    robot = null;
    restoreGravity = null;
    tower = null;
    emi = null;
    crates = [];
  },
});

function openMassCard(ctx: ZoneContext): Promise<void> {
  const masses = CRATES.map((c) => c.mass);
  return ctx.hud.openInfoCard({
    eyebrow: { de: '// Physik · Masse & Kraft', en: '// Physics · Mass & force' },
    title: { de: 'Warum fühlt sich die 60-kg-Kiste anders an?', en: 'Why does the 60 kg crate feel different?' },
    body: {
      de: 'Deine Arme bringen hier höchstens **400 N** auf. Die Gewichtskraft einer Kiste ist **F = m · g** mit g = 9,81 m/s². 20 kg ergeben 196 N – das geht. 60 kg ergeben 589 N – zu schwer, du kannst sie nur noch schieben.',
      en: 'Your arms can apply at most **400 N** here. A crate’s weight is **F = m · g** with g = 9.81 m/s². 20 kg gives 196 N — fine. 60 kg gives 589 N — too heavy, you can only push it.',
    },
    bullets: [
      { de: 'Gleiche Kraft, größere Masse → kleinere Beschleunigung: **a = F / m**.', en: 'Same force, more mass → less acceleration: **a = F / m**.' },
      { de: 'Werfen heißt: begrenzter Impuls J. Die Geschwindigkeit ist **v = J / m**.', en: 'Throwing means a limited impulse J. The speed is **v = J / m**.' },
    ],
    metrics: [
      { label: { de: 'Armkraft (Spielwert)', en: 'Arm strength (game value)' }, value: 400, unit: 'N' },
      { label: 'g', value: ctx.i18n.num(9.81, 2), unit: 'm/s²' },
      { label: { de: 'Schwerste Kiste', en: 'Heaviest crate' }, value: 60, unit: 'kg' },
    ],
    entscheider: {
      body: {
        de: 'Ein Mensch hebt dauerhaft rund **25 kg** sicher. Lasten darüber sind Kandidaten für Hebehilfen oder Roboter – **wenn eine Messung unter Realbedingungen zeigt, dass sie es zuverlässig können**.',
        en: 'A person can safely lift around **25 kg** repeatedly. Loads above that are candidates for lifting aids or robots — **if a measurement under real conditions shows they do it reliably**.',
      },
      illustrative: true,
    },
    forDecisionMakers: {
      title: { de: 'Was das für deine Halle bedeutet', en: 'What this means for your plant' },
      bullets: [
        { de: 'Erst fragen: Wer hebt diese Last heute – und welche Position bleibt künftig unbesetzt?', en: 'Ask first: who lifts this load today — and which position will stay empty?' },
        { de: 'Zahl vor Adjektiv: Traglast, Zyklen pro Stunde, Erfolgsquote unter Realbedingungen.', en: 'Numbers before adjectives: payload, cycles per hour, success rate under real conditions.' },
        { de: '„Kein Pilot“ ist ein gültiges Ergebnis.', en: '“No pilot” is a valid outcome.' },
      ],
    },
    diagram: {
      aspect: 4 / 3,
      animate: true,
      caption: { de: 'Gewichtskraft je Kiste vs. Armkraft 400 N', en: 'Weight per crate vs. arm strength 400 N' },
      draw(g, w, h, t) {
        const css = ctx.materials.css;
        const pad = 28,
          base = h - pad,
          top = 16,
          maxN = 650;
        const yOf = (n: number): number => base - ((base - top) * n) / maxN;
        g.font = '11px "Geist Mono", monospace';
        g.fillStyle = css.textMuted;
        g.strokeStyle = css.border;
        g.lineWidth = 1;
        for (const n of [0, 200, 400, 600]) {
          g.beginPath();
          g.moveTo(pad, yOf(n));
          g.lineTo(w - 8, yOf(n));
          g.stroke();
          g.fillText(`${n}`, 2, yOf(n) + 4);
        }
        const bw = (w - pad - 20) / masses.length;
        masses.forEach((m, i) => {
          const grow = Math.min(1, t * 1.4 - i * 0.15);
          const n = m * 9.81 * Math.max(0, grow);
          const x = pad + 10 + i * bw;
          g.fillStyle = m * 9.81 > 400 ? css.error : css.orange;
          g.fillRect(x, yOf(n), bw * 0.6, base - yOf(n));
          g.fillStyle = css.textSecondary;
          g.fillText(`${m} kg`, x, base + 14);
        });
        g.strokeStyle = css.teal;
        g.lineWidth = 2;
        g.setLineDash([6, 4]);
        g.beginPath();
        g.moveTo(pad, yOf(400));
        g.lineTo(w - 8, yOf(400));
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = css.teal;
        g.fillText('400 N', pad + 4, yOf(400) - 6);
      },
    },
  });
}

function openGravityDial(ctx: ZoneContext): Promise<void> {
  const presets: [string, number][] = [
    [ctx.lang === 'de' ? 'Mond' : 'Moon', 1.62],
    ['Mars', 3.71],
    [ctx.lang === 'de' ? 'Erde' : 'Earth', 9.81],
  ];
  return ctx.hud.openModal((el, close) => {
    el.innerHTML = `<div class="eyebrow">// MINIGAME · openModal()</div><h2 class="display" style="font-size:26px;margin:6px 0 10px">${ctx.t('gravity')}</h2>
      <p style="margin:0 0 14px">${ctx.lang === 'de' ? 'Gleiche Absprunggeschwindigkeit, andere Schwerkraft → andere Sprunghöhe: h = v² / (2 g).' : 'Same take-off speed, different gravity → different jump height: h = v² / (2 g).'}</p>`;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    for (const [name, g] of presets) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = `${name} · ${ctx.i18n.num(g, 2)} m/s²`;
      b.onclick = () => {
        restoreGravity?.();
        restoreGravity = g === 9.81 ? null : ctx.player.setGravityScale(g / 9.81);
        ctx.audio.play('success');
        close();
      };
      row.appendChild(b);
    }
    el.appendChild(row);
  });
}
