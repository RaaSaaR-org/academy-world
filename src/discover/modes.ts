/** The mode registry (WP-D0; both paths). Game-free. */
import type { DiscoverMode, DiscoverModeName, ModeRegistry } from './types';

export class Modes implements ModeRegistry {
  current: DiscoverModeName | null = null;
  private readonly map = new Map<DiscoverModeName, DiscoverMode>();

  register(name: DiscoverModeName, mode: DiscoverMode): void {
    this.map.set(name, mode);
  }

  has(name: DiscoverModeName): boolean {
    return this.map.has(name);
  }

  async enter(name: DiscoverModeName, arg?: unknown): Promise<void> {
    const m = this.map.get(name);
    if (!m) {
      console.warn(`[discover] no mode "${name}" registered`);
      return;
    }
    if (this.current && this.current !== name) await this.map.get(this.current)?.exit?.();
    this.current = name;
    await m.enter(arg);
  }
}
