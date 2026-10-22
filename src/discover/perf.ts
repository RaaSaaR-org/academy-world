/**
 * Discover's performance monitor and readout (WP-D0, plan §2.2–§2.4). Frame intervals between drawn
 * frames (game.frameHook, unclamped), the main-thread ms (game.cpuMs), the renderer's counters, an
 * estimate of the GPU memory (scene walk: geometry buffers, textures w×h×4×1.33, the composer's
 * targets, the shadow and environment maps, the drawing buffer) and the JS heap where the browser
 * has performance.memory. ?perf=1 shows the readout (tap to collapse). Nothing is sent anywhere.
 */
import * as THREE from 'three';
import type { Game } from '@/core/Game';
import type { CrashMarker, DiscoverTier, PerfMonitor, PerfStats, PerfWindow, TextResolver } from './types';
import { S } from './strings';
import { el } from './ui/el';

const N = 4096;
const r1 = (v: number): number => Math.round(v * 10) / 10;

export class PerfMonitorImpl implements PerfMonitor {
  private readonly at = new Float64Array(N);
  private readonly iv = new Float32Array(N);
  private readonly js = new Float32Array(N);
  private n = 0;
  private last = 0;
  readonly marks: { t: number; label: string }[] = [];
  private gpuCache = { t: -1e9, mb: 0 };
  stop: string | null = null;
  /** the frame probe's result (detect.ts), once it ran */
  probe: { p90: number; verdict: string } | null = null;

  constructor(
    private game: Game,
    private tier: DiscoverTier,
    readonly crash: CrashMarker | null,
  ) {
    game.frameHook = () => this.sample();
  }

  private sample(): void {
    const now = performance.now();
    if (this.last) {
      const i = this.n++ % N;
      this.at[i] = now;
      this.iv[i] = now - this.last;
      this.js[i] = this.game.cpuMs;
    }
    this.last = now;
  }

  /** frame intervals (ms) of the last `ms` */
  intervals(ms: number): number[] {
    const now = performance.now();
    const out: number[] = [];
    for (let k = 1; k <= Math.min(this.n, N); k++) {
      const i = (this.n - k) % N;
      if (now - this.at[i] > ms) break;
      out.push(this.iv[i]);
    }
    return out;
  }

  window(ms: number): PerfWindow {
    const a = this.intervals(ms);
    const s = a.slice().sort((x, y) => x - y);
    const q = (p: number): number => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0);
    const sum = a.reduce((t, x) => t + x, 0);
    return { n: a.length, p50: r1(q(0.5)), p90: r1(q(0.9)), p99: r1(q(0.99)), over50: a.filter((x) => x > 50).length, fps: sum ? r1((a.length / sum) * 1000) : 0, jsMs: r1(this.game.cpuMs) };
  }

  mark(label: string): void {
    this.marks.push({ t: Math.round(performance.now()), label });
  }

  stats(): PerfStats {
    const g = this.game;
    const info = g.rs.info();
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const size = g.rs.renderer.getDrawingBufferSize(new THREE.Vector2());
    return {
      ...this.window(2000),
      draws: info.calls,
      tris: info.triangles,
      programs: info.programs,
      geometries: info.geometries,
      textures: info.textures,
      gpuMB: this.gpuMB(),
      heapMB: heap ? r1(heap.usedJSHeapSize / 1048576) : null,
      pixelRatio: r1(g.rs.pixelRatio * 100) / 100,
      buffer: [size.x, size.y],
      renderer: g.rs.rendererName,
      tier: `${this.tier.name} · ${g.rs.level}${g.rs.renderScale < 0.999 ? ` · ${Math.round(g.rs.renderScale * 100)} %` : ''}`,
      stop: this.stop,
      crash: this.crash,
    };
  }

  /** estimated GPU memory (MB), recomputed at most every 2 s */
  gpuMB(): number {
    const now = performance.now();
    if (now - this.gpuCache.t < 2000) return this.gpuCache.mb;
    this.gpuCache = { t: now, mb: r1(estimateGpuBytes(this.game) / 1048576) };
    return this.gpuCache.mb;
  }
}

function texBytes(t: THREE.Texture): number {
  const img = t.image as { width?: number; height?: number; data?: ArrayBufferView } | { width?: number; height?: number }[] | null;
  if (!img) return 0;
  if (Array.isArray(img)) return img.reduce((s, i) => s + (i?.width ?? 0) * (i?.height ?? 0) * 4, 0) * 1.33;
  const px = (img.width ?? 0) * (img.height ?? 0);
  const bpp = t.type === THREE.HalfFloatType ? 8 : t.type === THREE.FloatType ? 16 : 4;
  return px * bpp * (t.generateMipmaps || t.mipmaps?.length ? 1.33 : 1);
}

/**
 * Geometry buffers (every geometry in the scene: an upper bound, hidden tiers included), the textures
 * the renderer has uploaded (w×h×4, ×1.33 with mipmaps), the composer's targets, the shadow map and the
 * drawing buffer.
 */
export function estimateGpuBytes(game: Game): number {
  const scene = game.rs.scene;
  const props = game.rs.renderer.properties;
  const uploaded = (t: THREE.Texture): boolean => !!(props.get(t) as { __webglTexture?: unknown }).__webglTexture;
  const geos = new Set<THREE.BufferGeometry>();
  const bufs = new Set<ArrayBufferLike>();
  const texs = new Set<THREE.Texture>();
  let bytes = 0;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !geos.has(m.geometry)) {
      geos.add(m.geometry);
      const g = m.geometry;
      for (const a of [...Object.values(g.attributes), ...(g.index ? [g.index] : [])]) {
        const arr = (a as THREE.BufferAttribute).array ?? (a as unknown as THREE.InterleavedBufferAttribute).data?.array;
        if (arr && !bufs.has(arr.buffer)) {
          bufs.add(arr.buffer);
          bytes += arr.byteLength;
        }
      }
    }
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats)
      for (const v of Object.values(mat as unknown as Record<string, unknown>))
        if (v instanceof THREE.Texture && !texs.has(v)) {
          texs.add(v);
          if (uploaded(v)) bytes += texBytes(v);
        }
  });
  for (const t of [scene.environment, scene.background]) if (t instanceof THREE.Texture && !texs.has(t) && uploaded(t)) bytes += texBytes(t);
  const size = game.rs.renderer.getDrawingBufferSize(new THREE.Vector2());
  // the composer's input and output buffers (half float) + depth, and the canvas (front and back)
  bytes += size.x * size.y * (8 * 2 + 4 + 4 * 2);
  const sun = game.rs.sun;
  if (sun?.castShadow) bytes += sun.shadow.mapSize.x * sun.shadow.mapSize.y * 4;
  return bytes;
}

/** The ?perf=1 readout: a small panel, tap to collapse; 2 updates a second. */
export function mountReadout(parent: HTMLElement, perf: PerfMonitorImpl, t: TextResolver): () => void {
  const box = el('button', { type: 'button', class: 'dsc-perf', 'aria-label': t.resolve(S.perfTitle) });
  box.addEventListener('click', () => box.classList.toggle('min'));
  parent.append(box);
  const tick = (): void => {
    const s = perf.stats();
    const mb = (v: number | null): string => (v == null ? t.resolve(S.na) : `${v} MB`);
    box.textContent = [
      `fps ${s.fps} · p50 ${s.p50} · p90 ${s.p90} · p99 ${s.p99} ms · JS ${s.jsMs} ms`,
      `draws ${s.draws} · tris ${r1(s.tris / 1e6)} M · prog ${s.programs}`,
      `geo ${s.geometries} · tex ${s.textures} · GPU ≈ ${mb(s.gpuMB)} · heap ${mb(s.heapMB)}`,
      `DPR ${s.pixelRatio} · ${s.buffer[0]}×${s.buffer[1]} · ${s.tier}`,
      (s.renderer || '–').replace(/^ANGLE \((.*)\)$/, '$1').replace(/, Unspecified Version/, '').slice(0, 48),
      `stop ${s.stop ?? '–'}${perf.probe ? ` · probe p90 ${perf.probe.p90} ms ${perf.probe.verdict}` : ''}${s.crash ? ` · ${t.resolve(S.crashSeen)} (${s.crash.stop ?? '–'})` : ''}`,
    ].join('\n');
  };
  tick();
  const iv = window.setInterval(tick, 500);
  return () => {
    window.clearInterval(iv);
    box.remove();
  };
}
