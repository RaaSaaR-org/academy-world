/**
 * Split-flap sign (landmark): two rows of mechanical flap modules, double-sided, ONE
 * instanced draw call for every flap on both faces. Each module = 4 quads:
 *   top static (upper half of the next glyph) · bottom static (lower half of the current glyph)
 *   flap front (upper half of the current glyph, falls 0 → 90°) · flap back (lower half of the
 *   next glyph, 90 → 180°). Modules run through a few intermediate glyphs like a real drum.
 */
import * as THREE from 'three';
import { atlasQuads, FONT_DISPLAY, makeCanvas, patchInstancedUv, ZERO } from './geom';

export const GLYPHS = " ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ0123456789%±·°=*.,-/n–";
const COLS = 8;
const ROWS = Math.ceil(GLYPHS.length / COLS);
const CW = 80,
  CH = 112;

export interface RowSpec {
  modules: number;
  /** module width/height (m) */
  w: number;
  h: number;
  gap: number;
  /** centre height of the row (m, sign-local) */
  y: number;
}

export interface FlapSign {
  readonly group: THREE.Group;
  /** Set the target text of a row (centred, uppercase except 'n'); color multiplies the glyphs. */
  setRow(row: number, text: string, color?: THREE.ColorRepresentation, instant?: boolean): void;
  /** true while any module is flipping */
  readonly busy: boolean;
  update(dt: number): void;
  /** current resolved text of a row */
  rowText(row: number): string;
  dispose(): void;
}

const FLIP = 0.075; // s per flap

export function createFlapSign(rows: RowSpec[], depth: number): FlapSign {
  // ── atlas ─────────────────────────────────────────────────────────────────
  const { canvas, g, tex } = makeCanvas(COLS * CW, ROWS * CH);
  tex.anisotropy = 8;
  for (let i = 0; i < GLYPHS.length; i++) {
    const cx = (i % COLS) * CW,
      cy = Math.floor(i / COLS) * CH;
    const grd = g.createLinearGradient(0, cy, 0, cy + CH);
    grd.addColorStop(0, '#24211f');
    grd.addColorStop(0.5, '#171514');
    grd.addColorStop(0.5, '#1d1b19');
    grd.addColorStop(1, '#121110');
    g.fillStyle = grd;
    g.fillRect(cx + 1, cy + 1, CW - 2, CH - 2);
    const ch = GLYPHS[i];
    if (ch !== ' ') {
      g.fillStyle = '#F5F5F4';
      g.font = `700 ${ch === '·' || ch === '°' ? 96 : 92}px ${FONT_DISPLAY}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ch, cx + CW / 2, cy + CH / 2 + 6);
    }
    // hinge gap
    g.fillStyle = '#050505';
    g.fillRect(cx, cy + CH / 2 - 1.5, CW, 3);
  }
  tex.needsUpdate = true;
  void canvas;

  const glyphIndex = (c: string): number => {
    const i = GLYPHS.indexOf(c);
    return i < 0 ? 0 : i;
  };
  const uvTop = (gi: number, out: number[]): void => {
    const u0 = (gi % COLS) / COLS,
      row = Math.floor(gi / COLS);
    // canvas y down → texture v up (flipY): glyph cell spans v ∈ [1 − (row+1)/ROWS, 1 − row/ROWS]
    const vTop = 1 - row / ROWS,
      vMid = 1 - (row + 0.5) / ROWS;
    out[0] = u0;
    out[1] = vMid;
    out[2] = 1 / COLS;
    out[3] = vTop - vMid;
  };
  const uvBottom = (gi: number, out: number[]): void => {
    const u0 = (gi % COLS) / COLS,
      row = Math.floor(gi / COLS);
    const vMid = 1 - (row + 0.5) / ROWS,
      vBot = 1 - (row + 1) / ROWS;
    // quad is mirrored in y (scale −h/2): local v=0 at the hinge, v=1 at the bottom edge
    out[0] = u0;
    out[1] = vMid;
    out[2] = 1 / COLS;
    out[3] = vBot - vMid;
  };

  // ── modules ───────────────────────────────────────────────────────────────
  interface Mod {
    row: number;
    x: number;
    cur: number;
    queue: number[];
    t: number;
    delay: number;
    color: THREE.Color;
  }
  const mods: Mod[] = [];
  rows.forEach((r, ri) => {
    const pitch = r.w + r.gap;
    for (let i = 0; i < r.modules; i++) mods.push({ row: ri, x: (i - (r.modules - 1) / 2) * pitch, cur: 0, queue: [], t: 0, delay: 0, color: new THREE.Color(1, 1, 1) });
  });
  const SIDES = 2,
    QUADS = 4;
  const count = mods.length * SIDES * QUADS;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: true });
  patchInstancedUv(mat, 'prueffeld-flap');
  const { mesh, uv } = atlasQuads(count, mat);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const group = new THREE.Group();
  group.add(mesh);

  const tmpUv = [0, 0, 0, 0];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const sideQ = [new THREE.Quaternion(), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)];
  const sideM = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const white = new THREE.Color(1, 1, 1);

  const setQuad = (idx: number, mi: number, kind: 0 | 1 | 2 | 3, angle: number, gi: number, visible: boolean): void => {
    const md = mods[mi];
    const r = rows[md.row];
    for (let side = 0; side < SIDES; side++) {
      const k = (mi * SIDES + side) * QUADS + kind;
      if (!visible) {
        mesh.setMatrixAt(k, ZERO);
        continue;
      }
      const top = kind === 0 || kind === 2;
      const zOff = depth / 2 + (kind >= 2 ? 0.012 : 0.004);
      e.set(kind === 2 ? angle : kind === 3 ? angle - Math.PI : 0, 0, 0);
      q.setFromEuler(e);
      s.set(r.w, top ? r.h / 2 : -r.h / 2, 1);
      p.set(md.x, r.y, zOff);
      local.compose(p, q, s);
      sideM.makeRotationFromQuaternion(sideQ[side]);
      m4.multiplyMatrices(sideM, local);
      mesh.setMatrixAt(k, m4);
      (top ? uvTop : uvBottom)(gi, tmpUv);
      uv.setXYZW(k, tmpUv[0], tmpUv[1], tmpUv[2], tmpUv[3]);
      mesh.setColorAt(k, md.color);
    }
    void idx;
  };

  const renderModule = (mi: number): void => {
    const md = mods[mi];
    const flipping = md.queue.length > 0 && md.delay <= 0;
    const next = md.queue.length ? md.queue[0] : md.cur;
    if (!flipping) {
      setQuad(0, mi, 0, 0, md.cur, true);
      setQuad(0, mi, 1, 0, md.cur, true);
      setQuad(0, mi, 2, 0, md.cur, false);
      setQuad(0, mi, 3, 0, md.cur, false);
      return;
    }
    const a = md.t * Math.PI; // 0 … π
    setQuad(0, mi, 0, 0, next, true);
    setQuad(0, mi, 1, 0, md.cur, true);
    setQuad(0, mi, 2, a, md.cur, a < Math.PI / 2);
    setQuad(0, mi, 3, a, next, a >= Math.PI / 2);
  };

  for (let i = 0; i < mods.length; i++) renderModule(i);
  if (mesh.instanceColor) mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  uv.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const rowTexts = rows.map(() => '');
  let active = 0;

  const api: FlapSign = {
    group,
    get busy() {
      return active > 0;
    },
    setRow(row, text, color = white, instant = false) {
      const r = rows[row];
      const t = text.length > r.modules ? text.slice(0, r.modules) : text;
      rowTexts[row] = t;
      const pad = Math.floor((r.modules - t.length) / 2);
      const col = new THREE.Color(color);
      let k = 0;
      for (let mi = 0; mi < mods.length; mi++) {
        const md = mods[mi];
        if (md.row !== row) continue;
        const ci = k - pad;
        const ch = ci >= 0 && ci < t.length ? t[ci] : ' ';
        const gi = glyphIndex(ch === 'n' ? 'n' : ch.toUpperCase());
        k++;
        md.color.copy(col);
        const endGlyph = md.queue.length ? md.queue[md.queue.length - 1] : md.cur;
        if (instant) {
          md.cur = gi;
          md.queue.length = 0;
          md.t = 0;
          renderModule(mi);
          continue;
        }
        if (endGlyph === gi && md.queue.length === 0) {
          renderModule(mi);
          continue;
        }
        // run through a few drum glyphs, like a real split-flap
        if (md.queue.length === 0) {
          const steps = 3 + ((mi * 7 + row * 3) % 6);
          let gg = md.cur;
          for (let s2 = 0; s2 < steps; s2++) {
            gg = (gg + 1 + ((mi + s2) % 3)) % GLYPHS.length;
            md.queue.push(gg);
          }
          md.queue.push(gi);
          md.delay = k * 0.035 + row * 0.12;
          md.t = 0;
          active++;
        } else {
          md.queue[md.queue.length - 1] = gi;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      uv.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    update(dt) {
      if (active <= 0) return;
      let changed = false;
      for (let mi = 0; mi < mods.length; mi++) {
        const md = mods[mi];
        if (!md.queue.length) continue;
        if (md.delay > 0) {
          md.delay -= dt;
          continue;
        }
        md.t += dt / FLIP;
        changed = true;
        if (md.t >= 1) {
          md.cur = md.queue.shift()!;
          md.t = 0;
          if (!md.queue.length) active--;
        }
        renderModule(mi);
      }
      if (changed) {
        mesh.instanceMatrix.needsUpdate = true;
        uv.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
    rowText: (row) => rowTexts[row],
    dispose() {
      tex.dispose();
      mat.dispose();
      mesh.geometry.dispose();
    },
  };
  return api;
}
