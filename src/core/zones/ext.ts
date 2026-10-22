/**
 * Context extensions (Phase 7 plan §5.2, §6.2): how a package adds a field to every ZoneContext
 * without editing createZoneContext.ts or types.ts.
 *
 *   // src/core/zones/types.<pkg>.ts — the type (module augmentation)
 *   declare module './ext' {
 *     interface ZoneContextExtensions { readonly quest: QuestApi }
 *   }
 *
 *   // the package's eager boot code — the value, made once per area (and once for the island module)
 *   registerContextExtension('quest', (area) => questApiFor(area.id));
 *
 * `ZoneContext extends ZoneContextExtensions`, so `ctx.quest` is typed in every zone. Register before
 * the first context is made (boot code that runs before the island module's init); a late
 * registration reaches only the contexts made after it, and says so in dev.
 */
import type { Scope } from '../Scheduler';
import type { AreaManifest } from './manifest';
import type { ZoneLayout } from './types';

/** Augmented per package: types.quest.ts, types.frames.ts, types.robots.ts, types.env.ts. Empty in rc4. */
export interface ZoneContextExtensions {}

/** What an extension factory knows about the area it builds for. */
export interface AreaHandle {
  /** area id; 'world' for the island module */
  readonly id: string;
  /** the eager manifest, or null (the island module, code-only dev zones) */
  readonly manifest: AreaManifest | null;
  readonly layout: ZoneLayout;
  /** run on dispose of this area's context (unsubscribe, free GPU resources) */
  onDispose(fn: () => void): void;
  /** @internal the area's scope */
  readonly scope: Scope;
}

type Factory = (area: AreaHandle) => unknown;
const factories = new Map<string, Factory>();
let contextsMade = 0;

/** Register the factory of one ctx field. One factory per name; a second registration replaces the first (HMR). */
export function registerContextExtension<K extends keyof ZoneContextExtensions>(name: K, make: (area: AreaHandle) => ZoneContextExtensions[K]): void {
  if (import.meta.env.DEV && contextsMade > 0 && !factories.has(name as string))
    console.warn(`[zones] context extension "${String(name)}" registered after ${contextsMade} context(s) were made: they lack ctx.${String(name)}`);
  factories.set(name as string, make);
}

/** @internal createZoneContext: add every registered extension to a new context. A throwing factory leaves its field undefined. */
export function applyContextExtensions(target: object, area: AreaHandle): void {
  contextsMade++;
  for (const [name, make] of factories) {
    try {
      Object.defineProperty(target, name, { value: make(area), enumerable: true, configurable: true });
    } catch (err) {
      console.error(`[zones] context extension "${name}" failed for "${area.id}"`, err);
    }
  }
}

/** Names of the registered extensions (DebugApi, tests). */
export function contextExtensionNames(): string[] {
  return [...factories.keys()];
}
