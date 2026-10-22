/**
 * Discover's settings (WP-D0): in memory only, never stored. Reduced motion starts from the media query
 * (a later OS change follows until the menu sets it), sound starts on. Game-free; the 3D path mirrors
 * them into game.settings (persist = false) and the audio.
 */
import type { DiscoverSettings } from './types';
import { systemReducedMotion } from './ui/el';

export class MemorySettings implements DiscoverSettings {
  reducedMotion = systemReducedMotion();
  sound = true;
  private chosen = false;
  private readonly listeners = new Set<() => void>();

  constructor() {
    try {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
        if (!this.chosen) this.apply(() => (this.reducedMotion = e.matches));
      });
    } catch {
      /* no matchMedia */
    }
  }

  setReducedMotion(on: boolean): void {
    this.chosen = true;
    if (on !== this.reducedMotion) this.apply(() => (this.reducedMotion = on));
  }

  setSound(on: boolean): void {
    if (on !== this.sound) this.apply(() => (this.sound = on));
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private apply(change: () => void): void {
    change();
    document.documentElement.classList.toggle('dsc-rm', this.reducedMotion);
    for (const fn of [...this.listeners]) fn();
  }
}
