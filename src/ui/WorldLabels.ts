import * as THREE from 'three';
import type { I18n } from '@/i18n/I18n';
import type { Text } from '@/core/types';
import { h } from './dom';

export interface WorldLabelOptions {
  eyebrow?: Text;
  /** fade out beyond this distance (m), default 22 */
  maxDistance?: number;
  /** extra height above the target (m), default 0 */
  offsetY?: number;
  /** visual tone */
  kind?: 'default' | 'accent' | 'muted';
}

export interface WorldLabelHandle {
  setText(text: Text): void;
  setEyebrow(text: Text | null): void;
  setVisible(v: boolean): void;
  remove(): void;
}

interface Label {
  target: THREE.Object3D | THREE.Vector3;
  text: Text;
  eyebrow: Text | null;
  opts: WorldLabelOptions;
  el: HTMLElement;
  tEl: HTMLElement;
  eEl: HTMLElement;
  visible: boolean;
  owner: string;
  lastOpacity: number;
  /** occlusion fade 0…1 (1 = fully visible) and the last test result */
  occ: number;
  occluded: boolean;
}

const _p = new THREE.Vector3();
const _w = new THREE.Vector3();
const _cam = new THREE.Vector3();

/** A short-lived rising label (ctx.game.juice.popup): pooled DOM, no allocation per frame. */
interface Popup {
  el: HTMLElement;
  target: THREE.Object3D | THREE.Vector3 | null;
  base: THREE.Vector3;
  age: number;
  life: number;
  rise: boolean;
  active: boolean;
}
const POPUP_POOL = 10;

/** DOM labels anchored to 3D positions (crisp brand typography, no texture cost). */
export class WorldLabels {
  readonly root = h('div', { id: 'labels' });
  private labels = new Set<Label>();
  private popups: Popup[] = [];
  private lastUpdate = 0;
  /**
   * QA-10: true when static geometry hides `to` from `from` (set by the engine: a Rapier ray against
   * the static world, glass excluded). Tested at ≈ 10 Hz per visible label; occluded labels fade out.
   */
  occlusionTest: ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | null = null;
  private lastOcc = 0;

  constructor(private i18n: I18n) {
    i18n.onChange(() => {
      for (const l of this.labels) this.renderText(l);
    });
  }

  add(owner: string, target: THREE.Object3D | THREE.Vector3, text: Text, opts: WorldLabelOptions = {}): WorldLabelHandle {
    const eEl = h('div', { class: 'eyebrow' });
    const tEl = h('div', { class: 't' });
    const el = h('div', { class: `wlabel glass ${opts.kind ?? 'default'}` }, eEl, tEl);
    el.style.opacity = '0';
    this.root.appendChild(el);
    const l: Label = { target, text, eyebrow: opts.eyebrow ?? null, opts, el, tEl, eEl, visible: true, owner, lastOpacity: 0, occ: 1, occluded: false };
    this.labels.add(l);
    this.renderText(l);
    return {
      setText: (t) => {
        l.text = t;
        this.renderText(l);
      },
      setEyebrow: (t) => {
        l.eyebrow = t;
        this.renderText(l);
      },
      setVisible: (v) => (l.visible = v),
      remove: () => this.remove(l),
    };
  }

  private remove(l: Label): void {
    l.el.remove();
    this.labels.delete(l);
  }

  removeOwner(owner: string): void {
    for (const l of [...this.labels]) if (l.owner === owner) this.remove(l);
  }

  private renderText(l: Label): void {
    l.tEl.textContent = this.i18n.resolve(l.text);
    const e = l.eyebrow ? this.i18n.resolve(l.eyebrow) : '';
    l.eEl.textContent = e;
    l.eEl.style.display = e ? '' : 'none';
  }

  /**
   * Rising, fading world label (juice). Pooled (oldest is reused), resolved once (short-lived).
   * rise = false with reduced motion: it fades in place.
   */
  popup(target: THREE.Object3D | THREE.Vector3, text: string, o: { tone?: string; seconds?: number; rise?: boolean } = {}): void {
    let p = this.popups.find((x) => !x.active);
    if (!p && this.popups.length < POPUP_POOL) {
      const el = h('div', { class: 'wpopup' });
      el.style.opacity = '0';
      this.root.appendChild(el);
      p = { el, target: null, base: new THREE.Vector3(), age: 0, life: 1, rise: true, active: false };
      this.popups.push(p);
    }
    if (!p) p = this.popups.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    p.el.className = `wpopup ${o.tone ?? 'good'}`;
    p.el.textContent = text;
    if ((target as THREE.Object3D).isObject3D) {
      p.target = target;
      (target as THREE.Object3D).getWorldPosition(p.base);
    } else {
      p.target = null;
      p.base.copy(target as THREE.Vector3);
    }
    p.age = 0;
    p.life = Math.max(0.6, o.seconds ?? 1.6);
    p.rise = o.rise !== false;
    p.active = true;
  }

  private updatePopups(camera: THREE.PerspectiveCamera, visible: boolean, dt: number, w: number, hh: number): void {
    for (const p of this.popups) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life || !visible) {
        p.active = false;
        p.el.style.opacity = '0';
        p.el.style.visibility = 'hidden';
        continue;
      }
      if (p.target && (p.target as THREE.Object3D).isObject3D) (p.target as THREE.Object3D).getWorldPosition(p.base);
      const k = p.age / p.life;
      _p.copy(p.base);
      if (p.rise) _p.y += 0.35 + 0.9 * (1 - (1 - k) * (1 - k));
      else _p.y += 0.35;
      _p.project(camera);
      if (!(_p.z < 1 && _p.z > -1)) {
        p.el.style.visibility = 'hidden';
        continue;
      }
      const op = Math.min(1, p.age / 0.12) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      const x = (_p.x * 0.5 + 0.5) * w;
      const y = (-_p.y * 0.5 + 0.5) * hh;
      const s = p.rise ? 0.9 + 0.18 * Math.min(1, p.age / 0.18) - 0.08 * k : 1;
      p.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
      p.el.style.opacity = op.toFixed(2);
      p.el.style.visibility = 'visible';
    }
  }

  update(camera: THREE.PerspectiveCamera, visible: boolean): void {
    const w = window.innerWidth,
      hh = window.innerHeight;
    const now = performance.now();
    const dt = this.lastUpdate ? Math.min(0.1, (now - this.lastUpdate) / 1000) : 0;
    this.lastUpdate = now;
    if (this.popups.length) this.updatePopups(camera, visible, dt, w, hh);
    camera.getWorldPosition(_cam);
    const testOcc = !!this.occlusionTest && now - this.lastOcc > 100;
    if (testOcc) this.lastOcc = now;
    for (const l of this.labels) {
      let op = 0;
      if (visible && l.visible) {
        if ((l.target as THREE.Object3D).isObject3D) (l.target as THREE.Object3D).getWorldPosition(_p);
        else _p.copy(l.target as THREE.Vector3);
        _p.y += l.opts.offsetY ?? 0;
        _w.copy(_p);
        const dist = _p.distanceTo(_cam);
        const maxD = l.opts.maxDistance ?? 22;
        _p.project(camera);
        if (_p.z < 1 && _p.z > -1 && Math.abs(_p.x) < 1.2 && Math.abs(_p.y) < 1.2) {
          op = 1 - THREE.MathUtils.smoothstep(dist, maxD * 0.75, maxD);
          if (op > 0.01 && testOcc) l.occluded = this.occlusionTest!(_cam, _w);
          l.occ += ((l.occluded ? 0 : 1) - l.occ) * Math.min(1, dt * 9);
          op *= l.occ;
          if (op > 0.01) {
            const x = (_p.x * 0.5 + 0.5) * w;
            const y = (-_p.y * 0.5 + 0.5) * hh;
            const s = THREE.MathUtils.clamp(1.15 - dist / (maxD * 1.6), 0.7, 1.05);
            l.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
          }
        }
      }
      if (Math.abs(op - l.lastOpacity) > 0.01) {
        l.el.style.opacity = op.toFixed(2);
        l.el.style.visibility = op > 0.01 ? 'visible' : 'hidden';
        l.lastOpacity = op;
      }
    }
  }
}
