import * as THREE from 'three';
import type { I18n } from '@/i18n/I18n';
import type { Text } from '@/core/types';
import { logoSvg } from '@/core/brand/logo3d';
import { h } from './dom';

export interface CompassMarkerOptions {
  kind?: 'zone' | 'objective' | 'poi';
  /** hide when closer than this (m), default 6 */
  hideWithin?: number;
}

export interface CompassMarkerHandle {
  setLabel(t: Text): void;
  /** hide without removing (e.g. an objective marker whose objective is not the one shown) */
  setHidden(hidden: boolean): void;
  setPosition(p: THREE.Vector3): void;
  remove(): void;
}

interface Marker {
  target: THREE.Object3D | THREE.Vector3;
  label: Text;
  kind: string;
  hideWithin: number;
  el: HTMLElement;
  span: HTMLElement;
  owner: string;
  hidden: boolean;
  /** last written opacity state / x (C11d: style writes only on change) */
  shown: boolean | null;
  x: number;
}

const PX_PER_DEG = 2.4;
const HALF_W = 230;
/** label texts (names, distances) refresh at 10 Hz; positions every frame (C11d) */
const LABEL_MS = 100;
const _p = new THREE.Vector3();

/** C11d: move by transform (compositor only, no layout); keeps the stylesheet's -50 % centring. */
function place(el: HTMLElement, x: number): void {
  el.style.transform = `translateX(${x.toFixed(1)}px) translateX(-50%)`;
}
function setShown(m: { el: HTMLElement; shown: boolean | null }, show: boolean): void {
  if (m.shown === show) return;
  m.shown = show;
  m.el.style.opacity = show ? '1' : '0';
}

/**
 * Heading strip (0° = north = −Z, clockwise) with zone / objective markers and distances.
 * Bearing of a point: atan2(dx, −dz) → 90° = +X ("east").
 *
 * Layout (QA-08): the strip and the zone/poi icons sit in a masked band; the ORANGE objective lives
 * outside the mask: it is clamped to the strip edge with an arrow when it is off the strip (also
 * behind you), and its label („Ziel · 76 m") has its own row on a dark backplate under the strip.
 * The centre needle draws above every marker. A 12 px mark icon shows the tower (ART-V2 §5.2).
 */
export class Compass {
  readonly root = h('div', { id: 'compass' });
  private band = h('div', { class: 'band' });
  private strip = h('div', { class: 'strip' });
  private objLabel = h('div', { class: 'obj-label' });
  private markers = new Set<Marker>();
  private cards: HTMLElement[] = [];
  private tower: { el: HTMLElement; target: THREE.Vector3; shown: boolean | null } | null = null;
  private lastLabels = -Infinity;
  private lastHeading = NaN;

  constructor(private i18n: I18n) {
    this.band.appendChild(this.strip);
    this.root.append(this.band, this.objLabel, h('div', { class: 'center' }));
    // ticks every 15°, rendered for −360…+720 so wrapping is seamless
    for (let d = -360; d <= 720; d += 15) {
      const t = h('div', { class: d % 45 === 0 ? 'tick major' : 'tick' });
      t.style.left = `${d * PX_PER_DEG}px`;
      this.strip.appendChild(t);
      if (d % 90 === 0) {
        const c = h('div', { class: 'card' });
        c.style.left = `${d * PX_PER_DEG}px`;
        c.dataset.deg = String(((d % 360) + 360) % 360);
        this.strip.appendChild(c);
        this.cards.push(c);
      }
    }
    this.renderCards();
    this.objLabel.style.left = '0px';
    i18n.onChange(() => {
      this.lastLabels = -Infinity;
      this.renderCards();
      for (const m of this.markers) if (m.kind !== 'objective') m.span.textContent = this.i18n.resolve(m.label);
    });
  }

  private renderCards(): void {
    const names = this.i18n.lang === 'de' ? ['N', 'O', 'S', 'W'] : ['N', 'E', 'S', 'W'];
    for (const c of this.cards) {
      const d = Number(c.dataset.deg);
      c.textContent = names[d / 90];
      c.classList.toggle('n', d === 0);
    }
  }

  /** The tower marker: the mark icon at the hub (world point), hidden within 14 m. */
  setTower(target: THREE.Vector3 | null): void {
    this.tower?.el.remove();
    this.tower = null;
    if (!target) return;
    const el = h('div', { class: 'mk tower', html: logoSvg({ size: 12, stroke: 26 }) });
    el.style.left = '0px';
    this.band.appendChild(el);
    this.tower = { el, target: target.clone(), shown: null };
  }

  add(owner: string, target: THREE.Object3D | THREE.Vector3, label: Text, opts: CompassMarkerOptions = {}): CompassMarkerHandle {
    const kind = opts.kind ?? 'zone';
    const span = h('span');
    const el = h('div', { class: `mk ${kind}` }, h('i'), span);
    el.style.left = '0px';
    // the objective is never masked: it clamps to the edge instead (root, not band)
    (kind === 'objective' ? this.root : this.band).appendChild(el);
    const m: Marker = { target, label, kind, hideWithin: opts.hideWithin ?? 6, el, span, owner, hidden: false, shown: null, x: NaN };
    this.lastLabels = -Infinity;
    if (kind !== 'objective') span.textContent = this.i18n.resolve(label);
    this.markers.add(m);
    return {
      setLabel: (t) => {
        m.label = t;
        if (m.kind !== 'objective') span.textContent = this.i18n.resolve(t);
      },
      setPosition: (p) => {
        m.target = p.clone();
      },
      setHidden: (b) => {
        m.hidden = b;
      },
      remove: () => {
        el.remove();
        this.markers.delete(m);
      },
    };
  }

  removeOwner(owner: string): void {
    for (const m of [...this.markers]) {
      if (m.owner !== owner) continue;
      m.el.remove();
      this.markers.delete(m);
    }
  }

  private relOf(target: THREE.Object3D | THREE.Vector3, from: THREE.Vector3, heading: number): { rel: number; dist: number } {
    if ((target as THREE.Object3D).isObject3D) (target as THREE.Object3D).getWorldPosition(_p);
    else _p.copy(target as THREE.Vector3);
    const dx = _p.x - from.x,
      dz = _p.z - from.z;
    const bearing = THREE.MathUtils.radToDeg(Math.atan2(dx, -dz));
    let rel = bearing - heading;
    rel = ((((rel + 180) % 360) + 360) % 360) - 180;
    return { rel, dist: Math.hypot(dx, dz) };
  }

  update(yaw: number, from: THREE.Vector3): void {
    const heading = ((-THREE.MathUtils.radToDeg(yaw) % 360) + 360) % 360;
    if (heading !== this.lastHeading) {
      this.lastHeading = heading;
      this.strip.style.transform = `translateX(${(-heading * PX_PER_DEG).toFixed(1)}px)`;
    }
    const now = performance.now();
    const labels = now - this.lastLabels >= LABEL_MS;
    if (labels) this.lastLabels = now;
    const cand = this.cand;
    cand.length = 0;
    let objective: { m: Marker; x: number; dist: number; edge: number } | null = null;
    for (const m of this.markers) {
      const { rel, dist } = this.relOf(m.target, from, heading);
      const x = rel * PX_PER_DEG;
      if (m.kind === 'objective') {
        const show = !m.hidden && dist > m.hideWithin;
        setShown(m, show);
        if (!show) continue;
        // off the strip (or behind): pin to the edge with an arrow pointing the way to turn
        const lim = HALF_W - 14;
        const edge = x > lim ? 1 : x < -lim ? -1 : 0;
        const cx = edge ? edge * lim : x;
        if (!(Math.abs(cx - m.x) <= 0.05)) {
          m.x = cx;
          place(m.el, HALF_W + cx);
          m.el.classList.toggle('edge-l', edge < 0);
          m.el.classList.toggle('edge-r', edge > 0);
        }
        if (!objective || dist < objective.dist) objective = { m, x: cx, dist, edge };
        continue;
      }
      const show = !m.hidden && Math.abs(x) < HALF_W - 8 && dist > m.hideWithin;
      setShown(m, show);
      if (!show) continue;
      if (!(Math.abs(x - m.x) <= 0.05)) {
        m.x = x;
        place(m.el, HALF_W + x);
      }
      // labels only near the centre (the band fades its edges)
      if (!labels) continue;
      if (Math.abs(rel) < 12) cand.push({ m, x, rel, dist });
      else if (m.span.textContent !== '') m.span.textContent = '';
    }
    if (this.tower) {
      const t = this.tower;
      const { rel, dist } = this.relOf(t.target, from, heading);
      const x = rel * PX_PER_DEG;
      const show = Math.abs(x) < HALF_W - 8 && dist > 14;
      setShown(t, show);
      if (show) place(t.el, HALF_W + x);
    }
    // objective label: its own row on a dark backplate, kept inside the strip width
    if (objective) {
      if (labels) {
        const txt = `${this.i18n.t('core.hud.objective')} · ${Math.round(objective.dist)} m`;
        if (this.objLabel.textContent !== txt) this.objLabel.textContent = txt;
      }
      const half = (this.objLabel.textContent ?? '').length * 3.4 + 12;
      const lx = THREE.MathUtils.clamp(objective.x, -HALF_W + half, HALF_W - half);
      place(this.objLabel, HALF_W + lx);
      if (!this.objShown) {
        this.objShown = true;
        this.objLabel.classList.add('show');
      }
    } else if (this.objShown) {
      this.objShown = false;
      this.objLabel.classList.remove('show');
    }
    if (!labels) return;
    // zone/poi labels without overlap, the most centred first; the rest stay icons
    cand.sort((a, b) => Math.abs(a.rel) - Math.abs(b.rel));
    const placed = this.placed;
    placed.length = 0;
    for (const c of cand) {
      const txt = `${this.i18n.resolve(c.m.label)} · ${Math.round(c.dist)} m`;
      const half = txt.length * 3.2 + 6; // ≈ 6.4 px per mono glyph at 9.5 px
      let free = true;
      for (let i = 0; i < placed.length; i += 2) if (c.x + half > placed[i] && c.x - half < placed[i + 1]) free = false;
      const want = free ? txt : '';
      if (free) placed.push(c.x - half, c.x + half);
      if (c.m.span.textContent !== want) c.m.span.textContent = want;
    }
  }

  private objShown = false;
  private cand: { m: Marker; x: number; rel: number; dist: number }[] = [];
  private placed: number[] = [];
}
