/**
 * Keyboard / mouse / pointer-lock input. Uses `event.code` (layout independent,
 * so WASD works on QWERTZ too). Edge states (`pressed`) are valid for one render frame.
 * Tests can inject virtual key holds via `inject(code, ms)`.
 */
export type MouseButton = 'MouseLeft' | 'MouseRight' | 'MouseMiddle';

const BUTTON_CODES: Record<number, MouseButton> = { 0: 'MouseLeft', 1: 'MouseMiddle', 2: 'MouseRight' };

/**
 * The UI state the keyboard policy needs (C3, C5). The HUD keeps it current (Hud.setPlaying and the
 * modal stack), so the engine loop does not have to: `playing` = the in-play HUD is up (not the
 * title or the loading screen), `blockingModal` = a modal other than operate mode is open.
 */
export const uiGate = { playing: false, blockingModal: false };

/** The key went to the 3D view (the canvas or nothing focused), not to a menu control. */
function isGameTarget(t: EventTarget | null): boolean {
  return !t || t === window || t === document || t === document.body || t === document.documentElement || t instanceof HTMLCanvasElement;
}

function isControl(t: EventTarget | null): boolean {
  return t instanceof HTMLButtonElement || t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.getAttribute('role') === 'button');
}

/** Chromium (Chrome, Edge, Opera): the only engines where `unadjustedMovement` is known to work. */
function isChromium(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  return !!brands?.some((b) => /Chromium/i.test(b.brand));
}

export class Input {
  private down = new Set<string>();
  private pressedSet = new Set<string>();
  private releasedSet = new Set<string>();
  private virtual = new Map<string, number>(); // code → release time (ms)
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  /** Test hook (`__academy.lookDelta`): this frame's mouse delta is synthetic and counts without pointer lock. */
  syntheticLook = false;
  /** Set when lock was released by the engine on purpose (modal opening) — not a user pause. */
  expectingUnlock = false;
  /** true once the pointer has been locked at least once in this session. */
  everLocked = false;
  /** When true (HTML form element focused etc.) keyboard is ignored. */
  private lockListeners = new Set<(locked: boolean) => void>();
  private keyListeners = new Set<(code: string, e: KeyboardEvent) => void>();

  constructor(private element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('keyup', this.onKeyUp, { capture: true });
    window.addEventListener('blur', this.onBlur);
    element.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.onLockChange);
    // A refused request is NOT a lock loss — stay unlocked silently (the capture hint shows).
    document.addEventListener('pointerlockerror', () => {
      this.expectingUnlock = false;
    });
  }

  private isTyping(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    const tag = t.tagName;
    return tag === 'INPUT' && (t as HTMLInputElement).type === 'text' || tag === 'TEXTAREA' || t.isContentEditable;
  }

  /** performance.now() of the last keydown / mouse button (tests: was a card opened by the player?) */
  lastInputAt = -1e9;

  /** QA-28: the player walked or turned with the keyboard while the mouse was free (keyboard player) */
  keyboardOnly = false;

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.isTyping(e)) return;
    this.lastInputAt = performance.now();
    // C5: Tab and the arrows belong to the browser (focus, sliders, scrolling) except while playing on the 3D view
    const inGame = uiGate.playing && !uiGate.blockingModal && isGameTarget(e.target);
    // C3 (QA-28): only a real ← → turn while playing marks a keyboard player (W on the title did before)
    if (inGame && !this.locked && e.isTrusted && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) this.keyboardOnly = true;
    if (e.code === 'F3' || (e.code === 'Space' && !isControl(e.target)) || ((e.code === 'Tab' || e.code.startsWith('Arrow')) && inGame)) e.preventDefault();
    if (!e.repeat) {
      if (!this.down.has(e.code)) this.pressedSet.add(e.code);
      this.down.add(e.code);
    }
    for (const fn of this.keyListeners) fn(e.code, e);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.down.delete(e.code)) this.releasedSet.add(e.code);
  };

  private onBlur = (): void => {
    for (const c of this.down) this.releasedSet.add(c);
    this.down.clear();
  };

  private onMouseDown = (e: MouseEvent): void => {
    this.lastInputAt = performance.now();
    const code = BUTTON_CODES[e.button];
    if (!code) return;
    if (!this.down.has(code)) this.pressedSet.add(code);
    this.down.add(code);
  };

  private onMouseUp = (e: MouseEvent): void => {
    const code = BUTTON_CODES[e.button];
    if (code && this.down.delete(code)) this.releasedSet.add(code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    // Chrome occasionally reports huge spikes with pointer lock — drop them.
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.locked) this.wheel += Math.sign(e.deltaY);
  };

  private onLockChange = (): void => {
    const locked = document.pointerLockElement === this.element;
    const was = this.locked;
    this.locked = locked;
    if (locked) {
      this.everLocked = true;
      this.keyboardOnly = false; // the mouse is back: the capture hint may show again after the next Esc
    }
    if (was !== locked) this.emitLock(locked);
  };

  private emitLock(locked: boolean): void {
    for (const fn of this.lockListeners) fn(locked);
    if (!locked) {
      // releasing the lock should also release held mouse buttons
      for (const b of ['MouseLeft', 'MouseRight', 'MouseMiddle']) if (this.down.delete(b)) this.releasedSet.add(b);
    }
    this.expectingUnlock = false;
  }

  onLockChanged(fn: (locked: boolean) => void): () => void {
    this.lockListeners.add(fn);
    return () => this.lockListeners.delete(fn);
  }

  /** Raw keydown hook (fires for every keydown including repeats). */
  onKey(fn: (code: string, e: KeyboardEvent) => void): () => void {
    this.keyListeners.add(fn);
    return () => this.keyListeners.delete(fn);
  }

  /**
   * Request pointer lock. Must be called from a user gesture (click / keydown). C3: one request per
   * gesture: a second request after an `await` can arrive after the gesture has expired (WebKit refused
   * it). Raw mouse deltas (`unadjustedMovement`) only on Chromium; its retry without them (e.g. Linux,
   * NotSupportedError) is safe there because Chromium keeps the user activation for several seconds.
   */
  async requestLock(): Promise<boolean> {
    if (this.locked) return true;
    const el = this.element as HTMLElement & {
      requestPointerLock(options?: { unadjustedMovement?: boolean }): Promise<void> | void;
    };
    const chromium = isChromium();
    try {
      try {
        await (chromium ? el.requestPointerLock({ unadjustedMovement: true }) : el.requestPointerLock());
      } catch (err) {
        if (!chromium || !(err instanceof DOMException) || err.name !== 'NotSupportedError') throw err;
        await el.requestPointerLock();
      }
      return true;
    } catch {
      return false;
    }
  }

  releaseLock(intentional = true): void {
    if (!this.locked) return;
    this.expectingUnlock = intentional;
    document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.down.has(code) || this.virtual.has(code);
  }

  pressed(code: string): boolean {
    return this.pressedSet.has(code);
  }

  released(code: string): boolean {
    return this.releasedSet.has(code);
  }

  anyDown(...codes: string[]): boolean {
    for (const c of codes) if (this.isDown(c)) return true;
    return false;
  }

  anyPressed(...codes: string[]): boolean {
    for (const c of codes) if (this.pressedSet.has(c)) return true;
    return false;
  }

  anyReleased(...codes: string[]): boolean {
    for (const c of codes) if (this.releasedSet.has(c)) return true;
    return false;
  }

  /** Swallow this frame's press edge (e.g. the key was used to close a modal). */
  consume(code: string): void {
    this.pressedSet.delete(code);
  }

  private consumedEvents = new WeakSet<KeyboardEvent>();
  /** Mark a keydown as handled by the engine (zone onKey handlers skip it, e.g. R = retry on the banner). */
  consumeEvent(e: KeyboardEvent): void {
    this.consumedEvents.add(e);
  }
  isConsumed(e: KeyboardEvent): boolean {
    return this.consumedEvents.has(e);
  }

  /**
   * Test hook: hold a key for `ms` milliseconds. Keyboard codes dispatch real keydown/keyup
   * events (so every listener — HUD, modals, zone onKey — sees them); mouse buttons
   * ('MouseLeft'/'MouseRight') are held virtually.
   */
  inject(code: string, ms = 120): void {
    if (code.startsWith('Mouse')) {
      if (!this.virtual.has(code) && !this.down.has(code)) this.pressedSet.add(code);
      this.virtual.set(code, performance.now() + ms);
      return;
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    window.setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })), ms);
  }

  /**
   * Test hook: add a mouse movement (pixels) for the next frame, routed through the real look
   * code (sensitivity, invert-Y, pitch clamp) even without pointer lock (headless browsers refuse it).
   */
  injectMouse(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
    this.syntheticLook = true;
  }

  /** Call at the END of each render frame. */
  endFrame(): void {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.syntheticLook = false;
    this.wheel = 0;
    if (this.virtual.size) {
      const now = performance.now();
      for (const [code, until] of this.virtual) {
        if (now >= until) {
          this.virtual.delete(code);
          if (!this.down.has(code)) this.releasedSet.add(code);
        }
      }
    }
  }
}
