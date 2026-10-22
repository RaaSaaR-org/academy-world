/**
 * Gestures on canvas#game (WP-D0, plan §4): Pointer Events, so touch, pen and mouse take one path.
 * One finger orbits / looks (inertia on release, none under reduced motion), two fingers pinch, a tap
 * (≤ 250 ms, ≤ 10 px) picks, a double tap resets the rig; the wheel zooms on the desktop. ←/→ and Esc
 * are page keys (ui/shell.ts wireKeys) and reach onNav through the same hub as the sheet's ‹ ›.
 */
import type { CameraImpl } from './camera';
import type { Gestures, TapPoint } from './types';
import type { NavHub } from './ui/shell';

type TapFn = (ndc: TapPoint, px: TapPoint) => void;

export class GesturesImpl implements Gestures {
  enabled = true;
  private readonly taps = new Set<TapFn>();
  private readonly dbls = new Set<TapFn>();
  private readonly pts = new Map<number, { x: number; y: number }>();
  private one: { id: number; x0: number; y0: number; t0: number; moved: boolean; vx: number; vy: number; tm: number } | null = null;
  private pinchD = 0;
  private lastTap = { t: -1e9, x: 0, y: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private cam: CameraImpl,
    private nav: NavHub,
  ) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('lostpointercapture', this.cancel);
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.cam.pinch(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)));
      },
      { passive: false },
    );
  }

  onTap(fn: TapFn): () => void {
    this.taps.add(fn);
    return () => void this.taps.delete(fn);
  }

  onDoubleTap(fn: TapFn): () => void {
    this.dbls.add(fn);
    return () => void this.dbls.delete(fn);
  }

  onNav(fn: (dir: -1 | 1) => void): () => void {
    return this.nav.on(fn);
  }

  private down = (e: PointerEvent): void => {
    if (!this.enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* fine */
    }
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size === 1) this.one = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, vx: 0, vy: 0, tm: performance.now() };
    else {
      // a second finger: pinch (no tap, no orbit)
      if (this.one) this.one.moved = true;
      this.pinchD = this.spread();
    }
  };

  private move = (e: PointerEvent): void => {
    const p = this.pts.get(e.pointerId);
    if (!p || !this.enabled) return;
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pts.size >= 2) {
      const d = this.spread();
      if (this.pinchD > 0 && d > 0) this.cam.pinch(d / this.pinchD);
      this.pinchD = d;
      return;
    }
    const o = this.one;
    if (!o || o.id !== e.pointerId) return;
    if (!o.moved && Math.hypot(e.clientX - o.x0, e.clientY - o.y0) > 10) o.moved = true;
    if (!o.moved) return;
    const now = performance.now();
    const dt = Math.max(1, now - o.tm);
    o.vx = o.vx * 0.5 + (dx / dt) * 1000 * 0.5;
    o.vy = o.vy * 0.5 + (dy / dt) * 1000 * 0.5;
    o.tm = now;
    this.cam.drag(dx, dy, this.canvas.clientHeight);
  };

  private up = (e: PointerEvent): void => {
    if (!this.pts.delete(e.pointerId)) return;
    const o = this.one;
    if (this.pts.size === 1) {
      // pinch → one finger left: continue as a drag from here, never a tap
      const [id, p] = [...this.pts.entries()][0];
      this.one = { id, x0: p.x, y0: p.y, t0: performance.now(), moved: true, vx: 0, vy: 0, tm: performance.now() };
      return;
    }
    this.one = null;
    if (!o || o.id !== e.pointerId || !this.enabled) return;
    const now = performance.now();
    if (o.moved) {
      // inertia only from a moving release
      if (now - o.tm < 80) this.cam.release(o.vx, o.vy, this.canvas.clientHeight);
      return;
    }
    if (now - o.t0 > 250) return;
    const r = this.canvas.getBoundingClientRect();
    const px = { x: e.clientX - r.left, y: e.clientY - r.top };
    const ndc = { x: (px.x / r.width) * 2 - 1, y: -((px.y / r.height) * 2 - 1) };
    const dbl = now - this.lastTap.t < 320 && Math.hypot(px.x - this.lastTap.x, px.y - this.lastTap.y) < 30;
    this.lastTap = dbl ? { t: -1e9, x: 0, y: 0 } : { t: now, x: px.x, y: px.y };
    for (const fn of [...(dbl ? this.dbls : this.taps)]) fn(ndc, px);
  };

  private cancel = (e: PointerEvent): void => {
    this.pts.delete(e.pointerId);
    if (this.one?.id === e.pointerId) this.one = null;
  };

  private spread(): number {
    const [a, b] = [...this.pts.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
