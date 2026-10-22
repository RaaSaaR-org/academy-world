import * as THREE from 'three';
import type { Game } from './Game';
import type { Text } from './types';
import { h, kbd } from '@/ui/dom';

export interface OperateRequest {
  owner: string;
  /** world-space camera pose */
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  title?: Text;
  panel?: (el: HTMLElement, exit: () => void) => void | (() => void);
  panelPosition?: 'right' | 'left' | 'bottom';
  /**
   * Phase 7 (piloting, plan §5.2): keys that go to the station only, the mouse kept captured with its
   * movement for `onLook`, and a camera pose (world) the station updates every frame.
   */
  capture?: {
    keys: ReadonlySet<string>;
    pointerLock: boolean;
    onLook?(dx: number, dy: number): void;
    camera?(out: { position: THREE.Vector3; quaternion: THREE.Quaternion }): void;
  };
  /** world-space ray; 'wheel' carries deltaY (positive = wheel towards the user, one notch ≈ 100) */
  onPointer?(e: { type: 'down' | 'move' | 'up' | 'wheel'; ndc: { x: number; y: number }; origin: THREE.Vector3; direction: THREE.Vector3; button: number; deltaY?: number }): void;
  onExit?(): void;
}

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

/**
 * Bedienmodus (GDD §5.1 ctx.interact.enterOperate): the camera eases to a fixed pose in
 * 0.4 s, the cursor is freed (passthrough modal → pointer lock released), WASD and look are
 * disabled. Esc or exit() leaves; the camera eases back and the mouse is re-captured.
 */
export class OperateManager {
  active: OperateRequest | null = null;
  private blend = 0;
  private target = 0;
  /** the camera override this manager owns (other systems, e.g. world cinematics, may own another) */
  private ov: { position: THREE.Vector3; quaternion: THREE.Quaternion; blend: number } | null = null;
  private unlock: (() => void) | null = null;
  private closeModal: (() => void) | null = null;
  private cleanup: void | (() => void) = undefined;
  private offLang: (() => void) | null = null;

  constructor(private game: Game) {
    const canvas = game.rs.canvas;
    const handler = (type: 'down' | 'move' | 'up' | 'wheel') => (e: PointerEvent | WheelEvent) => {
      const a = this.active;
      if (!a?.onPointer || this.blend < 0.95) return;
      const r = canvas.getBoundingClientRect();
      _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      _ray.setFromCamera(_ndc, game.camera);
      // line/page wheel modes (Firefox) → pixels, so one notch is ≈ 100 everywhere
      const deltaY = type === 'wheel' ? (e as WheelEvent).deltaY * ((e as WheelEvent).deltaMode === 1 ? 33 : (e as WheelEvent).deltaMode === 2 ? 400 : 1) : undefined;
      try {
        a.onPointer({ type, ndc: { x: _ndc.x, y: _ndc.y }, origin: _ray.ray.origin.clone(), direction: _ray.ray.direction.clone(), button: e.button, deltaY });
      } catch (err) {
        console.error(`[operate] onPointer of "${a.owner}" threw`, err);
      }
    };
    canvas.addEventListener('pointerdown', handler('down'));
    canvas.addEventListener('pointermove', handler('move'));
    window.addEventListener('pointerup', handler('up'));
    canvas.addEventListener('wheel', handler('wheel'), { passive: true });
  }

  get isActive(): boolean {
    return !!this.active;
  }

  /** The active operate mode captures this key for its station (piloting): the engine's own key handling skips it. */
  captures(code: string): boolean {
    return !!this.active?.capture?.keys.has(code);
  }

  /** The active operate mode keeps the pointer locked (piloting with mouse look). */
  get capturesPointer(): boolean {
    return !!this.active?.capture?.pointerLock;
  }

  enter(req: OperateRequest): () => void {
    if (this.active) this.exit();
    const g = this.game;
    this.active = req;
    this.target = 1;
    this.unlock = g.player.lock({ look: true });
    this.ov = { position: req.position.clone(), quaternion: req.quaternion.clone(), blend: this.blend };
    g.player.cameraOverride = this.ov;
    const panelEl = h('div', { class: `modal operate-panel glass hairline ${req.panelPosition ?? 'right'}` });
    const titleEl = req.title ? h('span', { class: 'eyebrow' }, g.i18n.resolve(req.title)) : null;
    const leaveEl = h('span', null, g.i18n.resolve({ de: 'Bedienmodus verlassen', en: 'Leave operate mode' }));
    const bar = h('div', { class: 'operate-bar glass' }, titleEl, kbd('Esc'), leaveEl);
    // the bar follows live language / mode switches like the zone's own panel
    this.offLang?.();
    this.offLang = g.i18n.onChange(() => {
      if (titleEl && req.title) titleEl.textContent = g.i18n.resolve(req.title);
      leaveEl.textContent = g.i18n.resolve({ de: 'Bedienmodus verlassen', en: 'Leave operate mode' });
    });
    const wrap = h('div', { style: 'display:contents' }, bar, req.panel ? panelEl : null);
    this.closeModal = g.hud.modals.open('operate', wrap, {
      passthrough: true,
      onClose: () => {
        this.closeModal = null;
        this.exit();
      },
      onKey: (code) => code === 'Escape' && (this.exit(), true),
    });
    if (req.panel) {
      try {
        this.cleanup = req.panel(panelEl, () => this.exit());
      } catch (err) {
        console.error(`[operate] panel of "${req.owner}" threw`, err);
      }
    }
    // piloting with mouse look: the pointer stays locked (Game skips the modal's release); lock it if it is not
    if (req.capture?.pointerLock && !g.input.locked) void g.input.requestLock();
    g.audio.play('open', { pitch: 0.8 });
    g.events.emit('operate:enter', { owner: req.owner });
    return () => {
      if (this.active === req) this.exit();
    };
  }

  exit(): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.target = 0;
    this.offLang?.();
    this.offLang = null;
    this.unlock?.();
    this.unlock = null;
    try {
      if (typeof this.cleanup === 'function') this.cleanup();
    } catch (err) {
      console.error('[operate] panel cleanup threw', err);
    }
    this.cleanup = undefined;
    const close = this.closeModal;
    this.closeModal = null;
    close?.();
    try {
      a.onExit?.();
    } catch (err) {
      console.error(`[operate] onExit of "${a.owner}" threw`, err);
    }
    this.game.audio.play('close', { pitch: 0.8 });
    this.game.events.emit('operate:exit', { owner: a.owner });
  }

  removeOwner(owner: string): void {
    if (this.active?.owner === owner) this.exit();
  }

  update(dt: number): void {
    const p = this.game.player;
    const cap = this.active?.capture;
    if (cap && this.ov) {
      try {
        // the station's camera (a robot's head camera) and its mouse look, this frame
        if (cap.camera) cap.camera(this.ov);
        const inp = this.game.input;
        if (cap.onLook && (inp.mouseDX || inp.mouseDY)) cap.onLook(inp.mouseDX, inp.mouseDY);
      } catch (err) {
        console.error(`[operate] capture of "${this.active?.owner}" threw`, err);
      }
    }
    const speed = dt / 0.4;
    this.blend = this.target > this.blend ? Math.min(1, this.blend + speed) : Math.max(0, this.blend - speed);
    if (this.ov && p.cameraOverride === this.ov) {
      const e = this.blend * this.blend * (3 - 2 * this.blend); // smoothstep ease
      this.ov.blend = e;
      if (this.blend <= 0 && !this.active) {
        p.cameraOverride = null;
        this.ov = null;
      }
    } else if (this.ov && !this.active) this.ov = null;
  }
}
