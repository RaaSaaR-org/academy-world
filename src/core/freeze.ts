import type * as THREE from 'three';

/**
 * Static subtrees (C11b): bake every local matrix once and stop recomputing it per frame.
 * After this, moving a node of the subtree needs an explicit `updateMatrix()` (and
 * `updateMatrixWorld()`); a moving parent still carries the frozen subtree along.
 */
export function freezeStatic(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });
  obj.updateMatrixWorld(true);
}

type SchedulerLike = { yield?: () => Promise<void> };

/** Optional hook run on every yield (the loading bar advances its sub-step). */
let onYield: (() => void) | null = null;
export function setYieldHook(fn: (() => void) | null): void {
  onYield = fn;
}

/**
 * Give the main thread back for one task (C13): `scheduler.yield()` where it exists,
 * else a macrotask. Lets the browser paint the loading bar and handle input between
 * long build steps.
 */
export function yieldToMain(): Promise<void> {
  try {
    onYield?.();
  } catch {
    /* the hook is cosmetic */
  }
  const s = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (s && typeof s.yield === 'function') return s.yield.call(s).catch(() => undefined);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });
}
