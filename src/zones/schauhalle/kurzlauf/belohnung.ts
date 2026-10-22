/**
 * Kurzlauf „Belohnung“ (plan §4.9, §4.3 Entscheider view; R2 §6.7): the duck station's Entscheider run,
 * recorded by WP5's own code in real MuJoCo (tools/duck/kurzlauf.mjs → duck.bin, format 'DKZL' v2, chip
 * SIM · AUFZEICHNUNG). Four real Open Duck Mini v2 models replay it on the little test track in front
 * of the console: „Nur Vorwärts“ → the belly flop the training stops on → one tap „Durchhalten +
 * Aufrecht dazu“ → walking → the test track, one world against random worlds, 20 runs each.
 */
import * as THREE from 'three';
import type { RobotModel, ZoneContext } from '@/core/zones';
import duckUrl from './duck.bin?url';
import type { Befund } from '../befund';
import { KURZLAUF } from '../layout';
import { bar, fitText, FONT, INK, para, screenHead, type StandDef, type StandStep } from './stand';
import { zs } from '../sheet';

interface Seg {
  kind: 'generation' | 'track';
  gen?: number;
  ducks: number;
  samples: number;
  off: number;
  len: number;
  hack?: string | null;
  stats?: { fallFrac: number; medianDist: number };
  fallT?: number[];
  dist?: number[];
  k?: number;
  n?: number;
  falls?: number;
  medianDist?: number;
  gait?: string;
}
interface Header {
  rate: number;
  seconds: number;
  trackSeconds: number;
  actuators: string[];
  scale: { pos: number; quat: number; joint: number };
  stride: number;
  steps: { id: string; segments: Seg[]; stoppedBy?: string | null; hidden?: Record<string, [number, number]>; successM?: number }[];
}

/** MuJoCo world → the duck GLB's root frame (x → z, y → x, z → y), as in regelgarten/duck/field.ts */
const C = new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);
const LANES = 4;

export function belohnung(ctx: ZoneContext): StandDef {
  let H: Header | null = null;
  let data: Int16Array | null = null;
  const cache = new Map<Seg, Float32Array>();
  const decode = (seg: Seg): Float32Array => {
    let q = cache.get(seg);
    if (q) return q;
    const Q = H!.stride;
    const v = data!.subarray(seg.off, seg.off + seg.len);
    q = new Float32Array(v.length);
    for (let d = 0; d < seg.ducks; d++) {
      const acc = new Int32Array(Q);
      for (let s = 0; s < seg.samples; s++)
        for (let k = 0; k < Q; k++) {
          const o = (d * seg.samples + s) * Q;
          acc[k] += v[o + k];
          q[o + k] = acc[k] / (k < 3 ? H!.scale.pos : k < 7 ? H!.scale.quat : H!.scale.joint);
        }
    }
    cache.set(seg, q);
    return q;
  };

  // ── the four ducks on the test-track table ───────────────────────────────
  const [tx, tz] = KURZLAUF.belohnung;
  const tableZ = tz - 0.95;
  const top = 0.62;
  const lanes: { base: THREE.Group; c: THREE.Group; model: RobotModel | null; inv: THREE.Matrix4 }[] = [];
  for (let i = 0; i < LANES; i++) {
    const base = new THREE.Group();
    base.name = `schauhalle:duck-lane-${i}`;
    base.userData.ledger = 'schauhalle';
    // walking along MuJoCo +x = the GLB's +z = the table's +x
    base.position.set(tx - 0.72, top, tableZ - 0.21 + i * 0.14);
    base.rotation.y = Math.PI / 2;
    const c = new THREE.Group();
    c.matrixAutoUpdate = false;
    c.matrix.copy(C);
    base.add(c);
    ctx.groups.detail.add(base);
    lanes.push({ base, c, model: null, inv: new THREE.Matrix4() });
  }
  // lane lines and the 0.25 / 0.5 / 1.0 m marks on the table (one tiny draw)
  {
    const g: number[] = [];
    for (let i = 0; i <= LANES; i++) g.push(-0.72, 0, -0.28 + i * 0.14, 0.82, 0, -0.28 + i * 0.14);
    for (const m of [0, 0.25, 0.5, 1.0]) g.push(-0.72 + m * 1.3, 0, -0.28, -0.72 + m * 1.3, 0, 0.28);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x78716c, name: 'schauhalle:track-lines' }));
    lines.position.set(tx, top + 0.002, tableZ);
    lines.userData.ledger = 'schauhalle';
    ctx.groups.detail.add(lines);
    ctx.onDispose(() => {
      geo.dispose();
      (lines.material as THREE.Material).dispose();
    });
  }
  let ducksP: Promise<void> | null = null;
  const loadDucks = (): Promise<void> =>
    (ducksP ??= Promise.all(
      lanes.map(async (l) => {
        const m = await ctx.robots.load('open-duck-mini-v2', { priority: 'now', lod: 1, castShadow: false });
        ctx.robots.untrack(m);
        m.object.userData.ledger = 'schauhalle';
        m.object.position.set(0, 0, 0);
        m.object.quaternion.identity();
        m.object.updateMatrixWorld(true);
        const tm = m.getLinkWorldMatrix('trunk_assembly', new THREE.Matrix4());
        if (tm) l.inv.copy(m.object.matrixWorld).invert().multiply(tm).invert();
        m.object.matrixAutoUpdate = false;
        l.c.add(m.object);
        l.model = m;
      }),
    ).then(() => undefined));
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3(1, 1, 1);
  /** pose the lanes from a segment at time t (s); ducks beyond the segment's count stay hidden */
  const pose = (seg: Seg, t: number, offset = 0): void => {
    if (!H) return;
    lastSeg = seg;
    lastOffset = offset;
    const q = decode(seg);
    const Q = H.stride;
    const f = Math.min(seg.samples - 1, Math.max(0, t * H.rate));
    const s0 = Math.floor(f);
    const s1 = Math.min(seg.samples - 1, s0 + 1);
    const a = f - s0;
    lanes.forEach((l, i) => {
      const d = i + offset;
      const m = l.model;
      if (!m) return;
      m.object.visible = d < seg.ducks;
      if (d >= seg.ducks) return;
      const o0 = (d * seg.samples + s0) * Q;
      const o1 = (d * seg.samples + s1) * Q;
      const lerp = (k: number): number => q[o0 + k] + (q[o1 + k] - q[o0 + k]) * a;
      // the lateral drift stays out: each duck keeps to its lane (its own world in the recording)
      _p.set(lerp(0), q[d * seg.samples * Q + 1], lerp(2));
      _q.set(lerp(4), lerp(5), lerp(6), lerp(3)).normalize();
      m.object.matrix.compose(_p, _q, _s).multiply(l.inv);
      m.object.matrixWorldNeedsUpdate = true;
      for (let k = 0; k < H!.actuators.length; k++) m.setJoint(H!.actuators[k], lerp(7 + k));
    });
  };
  const rest = (): void => {
    for (const l of lanes) if (l.model) l.model.object.visible = false;
  };
  /** the segment the lanes show now (a click on a duck pops up its run) */
  let lastSeg: Seg | null = null;
  let lastOffset = 0;
  const raycaster = new THREE.Raycaster();
  const follow = (origin: THREE.Vector3, dir: THREE.Vector3): void => {
    const o = ctx.toWorld(origin);
    const d = dir.clone().applyQuaternion(ctx.root.getWorldQuaternion(new THREE.Quaternion()));
    raycaster.set(o, d);
    let best: number | null = null;
    let bd = Infinity;
    lanes.forEach((l, i) => {
      if (!l.model || !l.model.object.visible) return;
      const hit = raycaster.intersectObject(l.model.object, true)[0];
      if (hit && hit.distance < bd) {
        bd = hit.distance;
        best = i;
      }
    });
    if (best === null || !lastSeg) return;
    const seg = lastSeg;
    const di = best + lastOffset;
    const dist = seg.dist?.[di];
    const ft = seg.fallT?.[di];
    const p = lanes[best].base.position;
    const L = ctx.i18n.lang;
    const txt = `${dist != null ? `${num(dist)} m` : ''}${ft != null && ft >= 0 ? ` · ${L === 'en' ? 'fell at' : 'gefallen nach'} ${num(ft, 1)} s` : ft === -1 ? ` · ${L === 'en' ? 'still up' : 'steht'}` : ''}`;
    if (txt) ctx.game.juice.popup([p.x + 0.4, p.y + 0.6, p.z], txt, { tone: 'teal', seconds: 2.4 });
    ctx.game.juice.cue('tick', { at: [p.x, p.y + 0.3, p.z] });
  };

  const L = (): 'de' | 'en' => ctx.i18n.lang;
  const chipText = (): string => (L() === 'en' ? 'SIM · RECORDED' : 'SIM · AUFZEICHNUNG');
  const eyebrow = (): string => (L() === 'en' ? '// SHOP WINDOW · SHORT RUN 1' : '// SCHAUFENSTER · KURZLAUF 1');
  const title = (): string => (L() === 'en' ? 'Reward' : 'Belohnung');
  const num = (v: number, d = 2): string => (L() === 'de' ? v.toFixed(d).replace('.', ',') : v.toFixed(d));
  const pct = (k: number, n: number): string => {
    const [p, lo, hi] = ctx.ui.wilson(k, n);
    return `${k}/${n} · ${Math.round(p * 100)} % [${Math.round(lo * 100)}–${Math.round(hi * 100)}]`;
  };

  const steps = (): StandStep[] => {
    const flop = H!.steps.find((s) => s.id === 'nur-vorwaerts')!;
    const fix = H!.steps.find((s) => s.id === 'durchhalten-aufrecht')!;
    const track = H!.steps.find((s) => s.id === 'teststrecke')!;
    const [one, rnd] = track.segments;
    const last = fix.segments[fix.segments.length - 1];
    return [
      {
        text: { de: 'Belohnt wird nur „Vorwärts“. 64 Enten probieren, die besten machen weiter. Was lernen sie?', en: 'Only "forward" is rewarded. 64 ducks try, the best carry on. What do they learn?' },
        seconds: 0,
        draw(g, w, h) {
          screenHead(g, w, h, eyebrow(), title(), chipText());
          para(g, L() === 'en' ? 'Reward deck: FORWARD ●●● · nothing else' : 'Belohnung: VORWÄRTS ●●● · sonst nichts', 22, 100, w - 44, 22, 28, INK.text);
          para(g, L() === 'en' ? 'Real Open Duck Mini v2 · real MuJoCo physics · a small learner (12 gait parameters)' : 'Echte Open Duck Mini v2 · echte MuJoCo-Physik · kleiner Lerner (12 Gangparameter)', 22, 150, w - 44, 16, 22, INK.text2);
        },
        tick: () => rest(),
      },
      {
        text: { de: 'Die Enten hechten nach vorn und fallen. Belohnt war Tempo, nicht Ankommen. Klick eine Ente an.', en: 'The ducks lunge forward and fall. Speed was rewarded, not arriving. Click a duck.' },
        button: { de: 'Training starten', en: 'Start training' },
        seconds: 8,
        attended: true,
        tick(k) {
          const seg = k < 0.5 ? flop.segments[0] : flop.segments[1];
          pose(seg, ((k < 0.5 ? k : k - 0.5) * 2) * H!.seconds);
        },
        draw(g, w, h, k) {
          const seg = k < 0.5 ? flop.segments[0] : flop.segments[1];
          screenHead(g, w, h, eyebrow(), `${L() === 'en' ? 'Generation' : 'Generation'} ${seg.gen}`, chipText());
          const fell = Math.round((seg.stats?.fallFrac ?? 0) * 64);
          bar(g, 22, 118, w - 44, L() === 'en' ? 'fallen' : 'gefallen', fell / 64, `${fell} / 64`, INK.amber);
          bar(g, 22, 170, w - 44, L() === 'en' ? 'median distance' : 'Median Strecke', (seg.stats?.medianDist ?? 0) / 1, `${num(seg.stats?.medianDist ?? 0)} m`, INK.teal);
          if (k >= 1 && flop.stoppedBy) {
            g.save();
            g.translate(w - 150, 230);
            g.rotate(-0.12);
            g.strokeStyle = INK.amber;
            g.lineWidth = 3;
            g.strokeRect(-110, -26, 220, 48);
            fitText(g, L() === 'en' ? 'BELLY FLOP' : 'BAUCHKLATSCHER', 0, 8, 200, 24, (px) => FONT.display(px), INK.amber, 'center');
            g.restore();
            fitText(g, L() === 'en' ? 'The training stops early: a hack.' : 'Das Training stoppt früh: ein Hack.', 22, 250, w - 300, 16, FONT.sans, INK.text2);
          }
        },
      },
      {
        text: { de: 'Eine Karte mehr: Durchhalten und Aufrecht. Jetzt lernt die Ente gehen.', en: 'One more card: stay up and stay upright. Now the duck learns to walk.' },
        button: { de: '„Durchhalten + Aufrecht“ dazu', en: 'Add "stay up + upright"' },
        seconds: 8,
        attended: true,
        tick(k) {
          const n = fix.segments.length;
          const j = Math.min(n - 1, Math.floor(k * n));
          pose(fix.segments[j], (k * n - j) * H!.seconds);
        },
        draw(g, w, h, k) {
          const n = fix.segments.length;
          const j = Math.min(n - 1, Math.floor(k * n));
          screenHead(g, w, h, eyebrow(), `${L() === 'en' ? 'Generation' : 'Generation'} ${fix.segments[j].gen}`, chipText());
          // the median distance per shown generation, a small Kennlinie
          const x0 = 40,
            y0 = h - 40,
            cw = w - 80,
            chh = 150;
          g.strokeStyle = INK.line;
          g.lineWidth = 1;
          g.strokeRect(x0, y0 - chh, cw, chh);
          g.strokeStyle = INK.teal;
          g.lineWidth = 3;
          g.beginPath();
          fix.segments.slice(0, j + 1).forEach((s, i) => {
            const x = x0 + ((s.gen ?? 0) / (last.gen ?? 10)) * cw;
            const y = y0 - Math.min(1, (s.stats?.medianDist ?? 0) / 1) * chh;
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          });
          g.stroke();
          fitText(g, `${L() === 'en' ? 'median' : 'Median'} ${num(fix.segments[j].stats?.medianDist ?? 0)} m`, x0 + 8, y0 - chh + 22, 300, 16, (px) => FONT.mono(px, 500), INK.text);
        },
      },
      {
        text: { de: 'Teststrecke: 20 Läufe unter versteckten Bedingungen. Eine Welt gegen zufällige Welten.', en: 'Test track: 20 runs under hidden conditions. One world against random worlds.' },
        button: { de: 'Teststrecke', en: 'Test track' },
        seconds: 8,
        attended: true,
        tick(k) {
          if (k < 0.5) pose(one, k * 2 * H!.trackSeconds);
          else pose(rnd, (k - 0.5) * 2 * H!.trackSeconds);
        },
        draw(g, w, h, k) {
          screenHead(g, w, h, eyebrow(), L() === 'en' ? 'Test track · n = 20 each' : 'Teststrecke · je n = 20', chipText());
          const pOne = ctx.ui.wilson(one.k!, one.n!);
          bar(g, 22, 128, w - 44, L() === 'en' ? 'one world' : 'eine Welt', pOne[0], pct(one.k!, one.n!), INK.amber, [pOne[1], pOne[2]]);
          if (k >= 0.5) {
            const pR = ctx.ui.wilson(rnd.k!, rnd.n!);
            bar(g, 22, 190, w - 44, L() === 'en' ? 'random worlds' : 'zufällige Welten', pR[0], pct(rnd.k!, rnd.n!), INK.teal, [pR[1], pR[2]]);
          }
          const hid = track.hidden;
          if (hid) fitText(g, `${L() === 'en' ? 'friction' : 'Reibung'} ${num(hid.friction[0], 1)}–${num(hid.friction[1], 1)} · ${L() === 'en' ? 'load' : 'Last'} ${Math.round(hid.payload[1] * 1000)} g · ${L() === 'en' ? 'delay' : 'Verzögerung'} ${hid.delay[1] * 20} ms`, 22, h - 18, w - 44, 14, (px) => FONT.mono(px, 500), INK.text2);
        },
      },
    ];
  };

  const befund = (): Befund => {
    const track = H!.steps.find((s) => s.id === 'teststrecke')!;
    const [one, rnd] = track.segments;
    const hid = track.hidden!;
    const chip = 'sim-aufzeichnung' as const;
    return {
      id: 'belohnung',
      title: { de: 'Belohnung: Die Ente lernt, was du belohnst', en: 'Reward: the duck learns what you reward' },
      measure: { de: 'Erfolg auf der Teststrecke, je 20 Läufe, mit Wilson-Intervall.', en: 'Success on the test track, 20 runs each, with a Wilson interval.' },
      limit: { de: 'Gilt nur für die geprüften Bedingungen: Reibung, Last, Steifigkeit, Verzögerung in den gezeigten Bereichen.', en: 'Holds only for the tested conditions: friction, load, stiffness and delay within the ranges shown.' },
      question: { de: 'Mit welcher Belohnung wurde trainiert – und welche Abkürzungen hat das Training gefunden? Was ist das Ergebnis in einer zweiten Umgebung?', en: 'Which reward was it trained on, and which shortcuts did the training find? What is the result in a second environment?' },
      forYou: { de: 'Lass dir Fehlläufe zeigen, nicht nur das beste Video – und teste auf deinem Boden mit deiner Last.', en: 'Ask to see failed runs, not just the best video, and test on your floor with your load.' },
      values: [
        { label: { de: 'Nur Vorwärts', en: 'Forward only' }, value: L() === 'en' ? 'belly flop in generation 2' : 'Bauchklatscher in Generation 2', chip },
        { label: { de: 'Eine Welt', en: 'One world' }, value: pct(one.k!, one.n!), chip },
        { label: { de: 'Zufällige Welten', en: 'Random worlds' }, value: pct(rnd.k!, rnd.n!), chip },
        { label: { de: 'Bedingungen', en: 'Conditions' }, value: `${num(hid.friction[0], 1)}–${num(hid.friction[1], 1)} µ · ≤ ${Math.round(hid.payload[1] * 1000)} g · ≤ ${hid.delay[1] * 20} ms`, chip },
      ],
    };
  };

  return {
    key: 'belohnung',
    eyebrow: (lang) => (lang === 'en' ? '// SHOP WINDOW · SHORT RUN 1' : '// SCHAUFENSTER · KURZLAUF 1'),
    title: { de: 'Belohnung', en: 'Reward' },
    chip: () => 'sim-aufzeichnung',
    async load() {
      const buf = await (await fetch(duckUrl)).arrayBuffer();
      const dv = new DataView(buf);
      const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
      if (magic !== 'DKZL') throw new Error('duck.bin: not a DKZL file');
      const n = dv.getUint32(8, true);
      H = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, n))) as Header;
      const start = 12 + n + ((8 - ((12 + n) % 8)) % 8);
      data = new Int16Array(buf, start, (buf.byteLength - start) >> 1);
      await loadDucks();
      rest();
    },
    steps,
    befund,
    idle(g, w, h) {
      screenHead(g, w, h, eyebrow(), title(), chipText());
      para(g, L() === 'en' ? 'The duck from 02 Control Garden, as a recording: what does a reward teach?' : 'Die Ente aus 02 Regelgarten als Aufzeichnung: Was lehrt eine Belohnung?', 22, 100, w - 44, 22, 28, INK.text);
      fitText(g, '[E]', 22, h - 22, 80, 18, (px) => FONT.mono(px, 600), INK.teal);
      void zs;
    },
    exit: () => rest(),
    pointer: (o, d) => follow(o, d),
  };
}
