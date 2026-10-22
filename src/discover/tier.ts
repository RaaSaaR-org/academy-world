/**
 * Discover's render tier (WP-D0, plan §2.1). `phone` is the default with ?discover=1 (also on the
 * desktop): the low preset pinned (composer + grade, no bloom, no MSAA), pixel ratio ≤ 1.25 with a
 * scale-only auto at 30 fps, 1024² shadows over ±35 m, plot tiers × 0.8. `full` (?tier=full) pins the
 * preset auto would start with and draws at the display rate. The spike's A/B knobs: ?dpr=, ?fps=,
 * ?shadows= (chosen at boot, never toggled: no relinks). Nothing here is ever saved.
 */
import type { LaunchParams } from '@/core/params';
import { tierForRenderer, type RenderTier } from '@/core/RenderSystem';
import type { DiscoverTier } from './types';

export function discoverTier(p: Pick<LaunchParams, 'tier' | 'dpr' | 'fps' | 'shadows'>): DiscoverTier {
  const full = p.tier === 'full';
  const t: DiscoverTier = full
    ? { name: 'full', level: null, pixelRatioCap: 1.5, scaleMin: 0.6, fpsCap: null, shadows: true, shadowMapSize: 2048, shadowExtent: 45, lodScale: 1, life: true, film: 'full', viewerFiles: 4 }
    : { name: 'phone', level: 'low', pixelRatioCap: 1.25, scaleMin: 0.7, fpsCap: 30, shadows: true, shadowMapSize: 1024, shadowExtent: 35, lodScale: 0.8, life: true, film: 'auto', viewerFiles: 2 };
  if (p.dpr != null) t.pixelRatioCap = p.dpr;
  if (p.fps != null) t.fpsCap = p.fps;
  if (p.shadows != null) t.shadows = p.shadows;
  return t;
}

/** What RenderSystem.setTier gets. `full` pins the start tier auto would choose for this GPU (auto itself would save). */
export function renderTier(t: DiscoverTier, rendererName: string): RenderTier {
  if (t.level == null) {
    const level = tierForRenderer(rendererName);
    return { level, preset: { pixelRatioCap: t.pixelRatioCap, shadows: t.shadows }, fpsCap: t.fpsCap, scaleMin: t.scaleMin };
  }
  return {
    level: t.level,
    preset: { pixelRatioCap: t.pixelRatioCap, multisampling: 0, bloom: false, shadows: t.shadows, shadowMapSize: t.shadowMapSize, shadowExtent: t.shadowExtent },
    fpsCap: t.fpsCap,
    scaleMin: t.scaleMin,
  };
}

/**
 * Half-float render targets (the composer's buffers): WebGL2 needs EXT_color_buffer_float or
 * EXT_color_buffer_half_float to draw into them. Without either the composer gets 8-bit buffers.
 */
export function halfFloatTargets(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const ok = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}
