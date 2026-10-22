/**
 * Hotspot markers (WP-D1, plan §3.3): teal DOM rings over the 3D view, projected after every drawn
 * frame, at most 6, a 44 px hit area. A spot with several anchors (the six rotors, the six holding arms)
 * shows one marker on its nearest anchor in view. Hidden while flying, behind the top bar or the sheet,
 * and when the anchor is occluded (hud.labels.occlusionTest, re-tested at 5 Hz). The markers are a
 * pointer shortcut only (aria-hidden, not in the tab order): every card lists the same spots as
 * „Hier zu sehen“ chips, so keyboard and screen-reader users reach them there.
 */
import * as THREE from 'three';
import type { DiscoverHandle, Vec3 } from '../types';
import type { SpotData } from './spots';
import { el } from '../ui/el';

const MAX = 6;
const EDGE = 22;
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _from = new THREE.Vector3();

/**
 * hud.labels.occlusionTest from a little in front of the camera: the camera is no player, so a railing
 * or a pane right at it (the Ausguck's parapet) must not hide everything beyond
 */
export function occluded(h: DiscoverHandle, cam: THREE.Vector3, p: THREE.Vector3): boolean {
  const test = h.game.hud.labels.occlusionTest;
  if (!test) return false;
  const d = cam.distanceTo(p);
  if (d < 4) return false;
  _from.copy(p).sub(cam).multiplyScalar(2.5 / d).add(cam);
  return test(_from, p);
}

export interface ActiveSpot {
  spot: SpotData;
  /** the anchors, fitted to the ground where the spot says so */
  pts: Vec3[];
}

interface Free {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export class Markers {
  readonly root: HTMLElement;
  private active: ActiveSpot[] = [];
  private readonly els = new Map<string, HTMLButtonElement>();
  /** spot id + anchor index → occluded */
  private readonly occluded = new Map<string, boolean>();
  private lastSlow = -1e9;
  private free: Free = { top: 0, bottom: 0, left: 0, right: 0 };
  private shown = new Set<string>();

  constructor(
    private h: DiscoverHandle,
    private onSelect: (s: SpotData) => void,
  ) {
    this.root = el('div', { class: 'dsc-marks', 'aria-hidden': 'true' });
    // under the top bar and the sheet (later siblings paint on top)
    h.ui.root.insertBefore(this.root, h.topbar.el);
  }

  /** the spots of the stop just reached */
  show(spots: ActiveSpot[]): void {
    this.clear();
    this.active = spots;
    for (const a of spots) {
      const b = el('button', { type: 'button', class: 'dsc-mark', tabindex: '-1', hidden: true, 'data-spot': a.spot.id, onclick: () => this.onSelect(a.spot) }, el('i'));
      this.els.set(a.spot.id, b);
      this.root.append(b);
    }
    this.lastSlow = -1e9;
  }

  clear(): void {
    this.active = [];
    this.els.clear();
    this.occluded.clear();
    this.shown.clear();
    this.root.replaceChildren();
  }

  /** ids of the markers on screen now (tools) */
  visible(): string[] {
    return [...this.shown];
  }

  /** after each drawn frame (game.frameHook) */
  update(): void {
    if (!this.active.length) return;
    const h = this.h;
    if (h.camera.flying || !h.camera.attached || h.modes.current !== 'tour') return this.hideAll();
    const cam = h.game.camera;
    const now = performance.now();
    const slow = now - this.lastSlow > 200;
    if (slow) {
      this.lastSlow = now;
      this.free = this.freeRect();
    }
    const W = window.innerWidth,
      H = window.innerHeight;
    const f = this.free;
    const cand: { id: string; x: number; y: number; d: number }[] = [];
    for (const a of this.active) {
      let best: { x: number; y: number; d: number } | null = null;
      for (let i = 0; i < a.pts.length; i++) {
        const p = a.pts[i];
        _p.set(p[0], p[1], p[2]);
        _v.copy(_p).project(cam);
        if (_v.z < -1 || _v.z > 1) continue;
        const x = ((_v.x + 1) / 2) * W,
          y = ((1 - _v.y) / 2) * H;
        if (x < f.left + EDGE || x > f.right - EDGE || y < f.top + EDGE || y > f.bottom - EDGE) continue;
        const key = `${a.spot.id}:${i}`;
        if (slow) this.occluded.set(key, occluded(h, cam.position, _p));
        if (this.occluded.get(key)) continue;
        const d = cam.position.distanceTo(_p);
        if (!best || d < best.d) best = { x, y, d };
      }
      if (best) cand.push({ id: a.spot.id, ...best });
    }
    cand.sort((a, b) => a.d - b.d);
    const on = new Set(cand.slice(0, MAX).map((c) => c.id));
    for (const c of cand) {
      if (!on.has(c.id)) continue;
      const b = this.els.get(c.id)!;
      b.hidden = false;
      b.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0)`;
    }
    for (const [id, b] of this.els) if (!on.has(id)) b.hidden = true;
    this.shown = on;
  }

  private hideAll(): void {
    if (!this.shown.size) return;
    for (const b of this.els.values()) b.hidden = true;
    this.shown.clear();
  }

  /** the part of the screen neither the top bar nor the sheet covers */
  private freeRect(): Free {
    const W = window.innerWidth,
      H = window.innerHeight;
    const out: Free = { top: 0, bottom: H, left: 0, right: W };
    out.top = Math.max(0, this.h.topbar.el.getBoundingClientRect().bottom);
    if (this.h.sheet.snap !== 'hidden') {
      const r = this.h.sheet.el.getBoundingClientRect();
      if (r.width > W * 0.75) out.bottom = Math.min(out.bottom, r.top);
      else out.right = Math.min(out.right, r.left);
    }
    return out;
  }
}
