/**
 * WP12: the system panel of the three systems (plan §3.3, D23) — on the Libelle plinth at eye height
 * for the player at the lever, and the same build for WP13's launch console on the Ausguck.
 *
 *   AUFTRIEB: six rotor lamps (SEHEN … MESSEN) · ENERGIE: the 10-segment Startakku bar · NAVIGATION: one lamp
 *
 * One InstancedMesh of 17 instances (one draw), one label text (one draw) and, only while the
 * Bodencrew supplies AKKU or NAV, the two small BODENCREW plates (one instanced draw). The labels
 * are one monospace text: every lamp sits on a fixed column of it, so the layout holds in both
 * languages. Instance colours on a white MeshBasicMaterial (the program of the crown beacons).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Lang, ZoneContext } from '@/core/zones';
import { ZONE_PLOTS } from '../layout';
import type { LibellePanelState } from './contract';
import { lampColor } from './lamps';
import { PANEL } from './strings';
import { LAMP } from './tuning';
import { sharedBatch } from '../landscape/batch';

/** columns of the label text (characters): six rotor cells of 9, a gap, the bar (30), a gap, the nav cell (14) */
const COLS = { rotor: 9, gap: 3, bar: 30, nav: 14 } as const;
const BAR_AT = COLS.rotor * 6 + COLS.gap;
const NAV_AT = BAR_AT + COLS.bar + COLS.gap;
const WIDTH_CH = NAV_AT + COLS.nav;
/** Geist Mono advance (em); corrected from the text's real bounds after its first layout */
const ADVANCE_EM = 0.6;
export const PANEL_INSTANCES = 17;

export interface SystemPanel {
  readonly group: THREE.Group;
  /** the 17-instance lamp mesh: 0–5 rotor lamps, 6–15 bar segments, 16 the nav lamp */
  readonly lamps: THREE.InstancedMesh;
  /** paint a state; `k` are pulse factors for the lamps, the bar and the nav lamp */
  set(s: LibellePanelState, o?: { lamps?: number; bar?: number; nav?: number; crew?: { akku: boolean; nav: boolean } }): void;
  /** world position of a lamp (for popups and markers) */
  lampWorld(i: number, out: THREE.Vector3): THREE.Vector3;
}

/**
 * Build a panel `width` metres wide in `parent` (local: x along the board, y up the board, +z out of
 * its face). The board itself goes into the island's static batch (no draw of its own).
 */
export function buildSystemPanel(ctx: ZoneContext, parent: THREE.Object3D, o: { width: number; name: string; board?: boolean }): SystemPanel {
  const M = ctx.materials;
  const group = new THREE.Group();
  group.name = o.name;
  parent.add(group);
  const W = o.width;
  let cw = W / WIDTH_CH; // metres per character column
  const fontSize = cw / ADVANCE_EM;
  // rows (local y) on the label text's line pitch: headers, the lamp row, the verbs, the crew plates
  const LH = 2.6;
  const H = fontSize * 10; // board height
  const yHead = H / 2 - fontSize * 1.1;
  const yLamp = yHead - fontSize * LH;
  const yVerb = yLamp - fontSize * LH;
  const yCrew = yVerb - fontSize * LH;

  if (o.board !== false) {
    // dark-glass board in an alu frame with a carbon back (static: merged with the island's batches)
    group.updateWorldMatrix(true, false);
    const toW = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.applyMatrix4(group.matrixWorld);
    const batch = sharedBatch(ctx);
    batch.add(M.darkGlass, toW(new RoundedBoxGeometry(W + 0.16, H, 0.05, 2, 0.02).translate(0, 0, -0.03)), { name: 'dark-glass' });
    batch.add(M.brushedAlu, toW(new RoundedBoxGeometry(W + 0.22, H + 0.06, 0.03, 2, 0.012).translate(0, 0, -0.06)), { name: 'alu' });
    // group dividers: thin alu ticks between AUFTRIEB | ENERGIE | NAVIGATION
    for (const ch of [BAR_AT - COLS.gap / 2, NAV_AT - COLS.gap / 2]) batch.add(M.brushedAlu, toW(new THREE.BoxGeometry(0.008, H * 0.72, 0.006).translate(-W / 2 + ch * cw, -fontSize * 0.6, 0.0)), { name: 'alu' });
    // the bar's frame (alu): the empty bar's red reads inside it
    const bx0 = -W / 2 + (BAR_AT + 0.6) * cw,
      bx1 = -W / 2 + (BAR_AT + COLS.bar - 0.6) * cw;
    const bh = fontSize * 1.55;
    const frame = (x0: number, x1: number, y0: number, y1: number): void => {
      const t = 0.006;
      batch.add(M.brushedAlu, toW(new THREE.BoxGeometry(x1 - x0, t, 0.006).translate((x0 + x1) / 2, y0, 0.002)), { name: 'alu' });
      batch.add(M.brushedAlu, toW(new THREE.BoxGeometry(x1 - x0, t, 0.006).translate((x0 + x1) / 2, y1, 0.002)), { name: 'alu' });
      batch.add(M.brushedAlu, toW(new THREE.BoxGeometry(t, y1 - y0, 0.006).translate(x0, (y0 + y1) / 2, 0.002)), { name: 'alu' });
      batch.add(M.brushedAlu, toW(new THREE.BoxGeometry(t, y1 - y0, 0.006).translate(x1, (y0 + y1) / 2, 0.002)), { name: 'alu' });
    };
    frame(bx0, bx1, yLamp - bh / 2, yLamp + bh / 2);
  }

  // ── the 17 lamps ────────────────────────────────────────────────────────────
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  mat.name = `${o.name}:lamps`;
  mat.userData.noEnrich = true;
  const geo = new RoundedBoxGeometry(1, 1, 0.5, 2, 0.18);
  const lamps = new THREE.InstancedMesh(geo, mat, PANEL_INSTANCES);
  lamps.name = `${o.name}:lamps`;
  lamps.frustumCulled = false; // a small board: its bounds would be recomputed after every layout fix
  group.add(lamps);
  // the crew plates (bar, nav): shown only while the Bodencrew supplies them
  const plateMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  plateMat.userData.noEnrich = true;
  const plates = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 0.4, 2, 0.15), plateMat, 2);
  plates.name = `${o.name}:crew-plates`;
  plates.frustumCulled = false;
  plates.visible = false;
  group.add(plates);
  // instance colours from the start: the first frame that shows a plate links no new program
  for (let i = 0; i < 2; i++) plates.setColorAt(i, new THREE.Color(0x0b2a27));
  ctx.onDispose(() => {
    geo.dispose();
    mat.dispose();
    plates.geometry.dispose();
    plateMat.dispose();
  });
  const colX = (ch: number): number => -W / 2 + ch * cw;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const layout = (): void => {
    const lampS = cw * 3.3;
    for (let k = 0; k < 6; k++) {
      m4.compose(p.set(colX(k * COLS.rotor + COLS.rotor / 2), yLamp, 0.012), q, s.set(lampS, lampS, 0.02));
      lamps.setMatrixAt(k, m4);
    }
    for (let k = 0; k < 10; k++) {
      const c = BAR_AT + 1.5 + k * ((COLS.bar - 3) / 10) + (COLS.bar - 3) / 20;
      m4.compose(p.set(colX(c), yLamp, 0.012), q, s.set(cw * 2.25, fontSize * 1.15, 0.02));
      lamps.setMatrixAt(6 + k, m4);
    }
    m4.compose(p.set(colX(NAV_AT + COLS.nav / 2), yLamp, 0.012), q, s.set(lampS * 1.25, lampS * 1.25, 0.022));
    lamps.setMatrixAt(16, m4);
    lamps.instanceMatrix.needsUpdate = true;
    // crew plates behind the BODENCREW words of the crew line
    const pw = cw * 13.4,
      ph = fontSize * 1.5;
    m4.compose(p.set(colX(BAR_AT + COLS.bar / 2), yCrew, 0.004), q, s.set(pw, ph, 0.01));
    plates.setMatrixAt(0, m4);
    m4.compose(p.set(colX(NAV_AT + COLS.nav / 2), yCrew, 0.004), q, s.set(pw, ph, 0.01));
    plates.setMatrixAt(1, m4);
    plates.instanceMatrix.needsUpdate = true;
  };
  layout();

  // ── one label text: headers, (lamp row), verbs, crew line ────────────────────
  let crew = { akku: false, nav: false };
  const centre = (word: string, width: number): string => {
    const pad = Math.max(0, width - word.length);
    const l = Math.floor(pad / 2);
    return ' '.repeat(l) + word + ' '.repeat(pad - l);
  };
  const pick = (t: { de: string; en: string }, lang: Lang): string => (lang === 'de' ? t.de : t.en);
  const labelText = (lang: Lang): string => {
    const head = centre(pick(PANEL.lift, lang), COLS.rotor * 6) + ' '.repeat(COLS.gap) + centre(pick(PANEL.energy, lang), COLS.bar) + ' '.repeat(COLS.gap) + centre(pick(PANEL.nav, lang), COLS.nav);
    const verbs = ZONE_PLOTS.map((z) => centre(pick(z.verb, lang), COLS.rotor)).join('') + ' '.repeat(COLS.gap) + centre(pick(PANEL.akku, lang), COLS.bar) + ' '.repeat(COLS.gap) + centre(pick(PANEL.model, lang), COLS.nav);
    const cr = pick(PANEL.crew, lang);
    const crewLine = ' '.repeat(BAR_AT) + centre(crew.akku ? cr : '', COLS.bar) + ' '.repeat(COLS.gap) + centre(crew.nav ? cr : '', COLS.nav);
    // the lamp row stays blank; non-breaking spaces keep troika from trimming the leading columns
    return [head, '', verbs, crewLine.trimEnd() || ' '].map((l) => l.replace(/ /g, ' ')).join('\n');
  };
  const text = ctx.text3d.create(
    {
      text: (lang) => labelText(lang),
      font: 'mono-medium',
      size: fontSize,
      color: 0xd6d3d1,
      anchorX: 'left',
      anchorY: 'top',
      textAlign: 'left',
      lineHeight: LH,
      letterSpacing: 0,
      // anchorY 'top' is the top of the first line box: its glyphs centre half a line pitch lower
      position: [-W / 2, yHead + (fontSize * LH) / 2, 0.006],
    },
    group,
  );
  text.name = `${o.name}:labels`;
  // the real advance of the font: re-place the lamps on the text's columns after its first layout
  const fixColumns = (): void => {
    const info = (text as unknown as { textRenderInfo?: { blockBounds?: number[] } }).textRenderInfo;
    const bb = info?.blockBounds;
    if (!bb) return;
    const lines = labelText(ctx.lang).split('\n');
    const longest = Math.max(...lines.map((l) => l.length));
    const real = (bb[2] - bb[0]) / Math.max(1, longest);
    if (real > 0 && Math.abs(real - cw) / cw > 0.01) {
      cw = real;
      layout();
    }
  };
  text.sync(fixColumns);
  // the crew line changed: re-lay the text (a language change re-resolves the same function)
  const relabel = (): void => {
    text.text = labelText(ctx.lang);
    text.sync(fixColumns);
  };

  const c = new THREE.Color();
  return {
    group,
    lamps,
    set(st, k = {}) {
      for (let i = 0; i < 6; i++) lamps.setColorAt(i, lampColor(M, st.lamps[i], c, k.lamps ?? 1));
      for (let i = 0; i < 10; i++) {
        if (i < st.bar.segments) lampColor(M, st.bar.lamp, c, k.bar ?? 1);
        else if (st.bar.lamp === 'red') lampColor(M, 'red', c, LAMP.emptyRed);
        else lampColor(M, 'dark', c, LAMP.segmentOff / LAMP.gain.dark);
        lamps.setColorAt(6 + i, c);
      }
      lamps.setColorAt(16, lampColor(M, st.nav, c, k.nav ?? 1));
      if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
      const want = k.crew ?? { akku: false, nav: false };
      if (want.akku !== crew.akku || want.nav !== crew.nav) {
        crew = { ...want };
        relabel();
        // a hidden plate: zero scale (one instanced draw for both)
        const pw = cw * 13.4,
          ph = fontSize * 1.5;
        const put = (i: number, on: boolean, ch: number): void => {
          m4.compose(p.set(colX(ch), yCrew, 0.004), q, on ? s.set(pw, ph, 0.01) : s.set(0, 0, 0));
          plates.setMatrixAt(i, m4);
          plates.setColorAt(i, lampColor(M, 'teal', c, 0.22));
        };
        put(0, crew.akku, BAR_AT + COLS.bar / 2);
        put(1, crew.nav, NAV_AT + COLS.nav / 2);
        plates.instanceMatrix.needsUpdate = true;
        if (plates.instanceColor) plates.instanceColor.needsUpdate = true;
        plates.visible = crew.akku || crew.nav;
      }
    },
    lampWorld(i, out) {
      lamps.getMatrixAt(i, m4);
      out.setFromMatrixPosition(m4);
      return lamps.localToWorld(out);
    },
  };
}
