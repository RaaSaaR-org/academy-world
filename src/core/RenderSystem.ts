import * as THREE from 'three';
import { BlendFunction, BloomEffect, Effect, EffectComposer, EffectPass, RenderPass, VignetteEffect } from 'postprocessing';
import { syncBrandExact } from './brand/materials';
import { loadJSON, saveJSON } from './storage';

/**
 * C10: adaptive quality ('auto'). All thresholds in one place — tune them here (the Integrate stage
 * re-tunes after the draw-call work). The controller reads the p90 of the last `windowFrames` frame
 * intervals, the main-thread ms per frame and, where the browser has a GPU timer, the GPU ms.
 *  - GPU-bound (slow frames, the main thread is not the cause): render scale 1.0 → scaleMin in
 *    scaleStep steps, then light clouds (no supersampling, 12 steps), and only after levelAfterMs at
 *    the bottom the preset steps down (that preset is not tried again in the session).
 *  - CPU-bound (main thread ≥ cpuShare of the median frame interval): nothing changes — a cheaper
 *    GPU setting would not help.
 *  - Headroom (every frame on time, not CPU-bound): back up in reverse order. When the GPU timer says
 *    the next step fits, after holdUpMs; otherwise a probe after probeUpMs that doubles after every
 *    failed probe (a step down within failWindowMs of a step up) and relaxes again after a kept one.
 *  - The GPU timer is a hint, not the truth: ANGLE on Metal times the frame's latency (it read 26 ms
 *    at a steady 60 fps), so a reading above the median frame interval is ignored.
 * Integrate stage (rc4) tuning on the M5 Pro: CPU ×6 and ×10 change nothing; 3840×2160@2 steps the
 * scale down until frames are on time and climbs back when the window shrinks.
 */
export const AUTO_QUALITY = {
  targetMs: 1000 / 60,
  windowFrames: 120,
  /** p90 frame interval above slow × target: too slow */
  slow: 1.12,
  /** GPU ms × (cost of the next step up) below fit × target: room to step up */
  fit: 0.82,
  /** main-thread ms ≥ cpuShare × the median frame interval: CPU-bound (the smoothed CPU ms is a mean, so not p90) */
  cpuShare: 0.6,
  /** a GPU timer reading above plausible × the median frame interval is not pure GPU time: ignored */
  plausible: 1.05,
  scaleMin: 0.6,
  scaleStep: 0.1,
  /** at least this long between two steps */
  holdMs: 2000,
  /** this long at the bottom of the scale (light clouds on) before the preset steps down */
  levelAfterMs: 4000,
  /** sustained headroom before a step up when the GPU timer says the next step fits */
  holdUpMs: 6000,
  /** otherwise: a step-up probe after this much on-time play, doubled after every failed probe (up to ×16) */
  probeUpMs: 15000,
  /** a step down this soon after a step up means the step up (probe) failed */
  failWindowMs: 10000,
  /** title screen: full frame rate this long, so the scale settles before play */
  probeMs: 2500,
  storageKey: 'quality-auto',
};
/**
 * C10: MSAA samples by the display's pixel ratio after the preset cap: [max ratio, samples].
 * The plan asked for 0× at 1.5; at 1.5 without MSAA the far railings break into dashes and the
 * Regelgarten trough slats shimmer (QA-04 view, screenshot A/B), so 1.5 keeps 2×.
 */
export const MSAA_BY_PIXEL_RATIO: [number, number][] = [
  [1.0, 4],
  [1.5, 2],
  [Infinity, 0],
];

// ── Phase 7 seam (plan §5.2, §5.5): objects whose programs the boot warm-up compiles ──────────────
const bootWarmups = new Map<string, () => THREE.Object3D>();

/**
 * Register a dummy whose programs (and, if it casts shadows, shadow-depth programs) are compiled in the
 * boot warm-up, behind the loading screen: robot and crowd variants (skinned, instanced per body,
 * the teal ghost, the silhouette; WP4). EAGER code only (registered before Game.boot's warm-up). The
 * dummy is drawn once in front of the camera in the hidden boot frame, then stays in the scene hidden,
 * so its programs are never released.
 */
export function registerBootWarmup(name: string, make: () => THREE.Object3D): void {
  bootWarmups.set(name, make);
}

const percentile = (a: number[], q: number): number => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};

/**
 * QA-04: three r186's PCF takes 5 Vogel-disk taps rotated by per-pixel interleaved-gradient noise.
 * Nothing resolves that noise over time, so every soft shadow edge (railings under the 16° sun) became
 * a dithered stipple. Replace it with a fixed 3×3 tent of hardware-PCF taps (no noise, no rotation):
 * smooth, stable edges at the cost of 4 extra taps.
 */
function patchShadowFilter(): void {
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  const src = C.shadowmap_pars_fragment;
  if (src.includes('emaiTentPCF')) return;
  const re = /float phi = interleavedGradientNoise\( gl_FragCoord\.xy \) \* PI2;\s*shadow = \([\s\S]*?\) \* 0\.2;/;
  if (!re.test(src)) {
    console.warn('[render] shadow chunk layout changed: keeping three\'s PCF');
    return;
  }
  C.shadowmap_pars_fragment = src.replace(
    re,
    `// emaiTentPCF: fixed 3x3 tent (weights 1-2-1), spacing from shadow.radius
				vec2 tentD = texelSize * max( 1.0, shadowRadius * 0.6 );
				shadow = 0.0;
				for ( int ti = - 1; ti <= 1; ti ++ ) {
					for ( int tj = - 1; tj <= 1; tj ++ ) {
						float tw = ( ti == 0 ? 2.0 : 1.0 ) * ( tj == 0 ? 2.0 : 1.0 );
						shadow += tw * texture( shadowMap, vec3( shadowCoord.xy + vec2( float( ti ), float( tj ) ) * tentD, shadowCoord.z ) );
					}
				}
				shadow *= 0.0625;`,
  );
}
patchShadowFilter();

/**
 * Colour grade (art pass): tone map (ACES or AgX) → gentle filmic S-curve in display space →
 * saturation → split toning (cool shadows, warm highlights). One GLSL body, used twice:
 *  - as a postprocessing Effect with live uniforms (medium/high), and
 *  - baked into three's CustomToneMapping chunk for the direct render path (low), so all
 *    presets share the same look.
 */
export interface GradeParams {
  contrast: number;
  saturation: number;
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
}
export const DEFAULT_GRADE: GradeParams = {
  contrast: 0.2,
  saturation: 1.1,
  // ART-V2 §2.6: softened from (−0.01, −0.002, 0.014): the cool tint turned stone neutrals bluish
  shadowTint: [-0.006, -0.001, 0.008],
  highlightTint: [0.016, 0.006, -0.012],
};

const TM_CALL: Record<'aces' | 'agx', string> = { aces: 'ACESFilmicToneMapping', agx: 'AgXToneMapping' };

function gradeBody(name: string, tm: string, contrast: string, saturation: string, shadow: string, high: string): string {
  return /* glsl */ `
vec3 ${name}(vec3 c) {
  c = ${tm}(c);
  vec3 p = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  vec3 sc = p * p * (3.0 - 2.0 * p);
  p = mix(p, sc, ${contrast});
  float l = dot(p, vec3(0.2126, 0.7152, 0.0722));
  p = mix(vec3(l), p, ${saturation});
  p += ${shadow} * (1.0 - smoothstep(0.0, 0.55, l)) + ${high} * smoothstep(0.45, 1.0, l);
  return pow(clamp(p, 0.0, 1.0), vec3(2.2));
}`;
}
const v3 = (a: [number, number, number]): string => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;

/** Low path: three's CustomToneMapping = the same grade with baked constants. */
let baseTonemapChunk: string | null = null;
function patchCustomToneMapping(kind: 'aces' | 'agx', g: GradeParams): void {
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  if (baseTonemapChunk === null) baseTonemapChunk = C.tonemapping_pars_fragment;
  const body = gradeBody('emaiGradeC', TM_CALL[kind], g.contrast.toFixed(4), g.saturation.toFixed(4), v3(g.shadowTint), v3(g.highlightTint));
  C.tonemapping_pars_fragment = baseTonemapChunk.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    `${body}\nvec3 CustomToneMapping( vec3 color ) { return emaiGradeC( color ); }`,
  );
}

class GradeEffect extends Effect {
  constructor(g: GradeParams) {
    super(
      'EmaiGrade',
      /* glsl */ `#include <tonemapping_pars_fragment>
uniform float uContrast; uniform float uSaturation; uniform vec3 uShadowTint; uniform vec3 uHighTint; uniform float uAgx;
vec3 emaiTonemapU(vec3 c) { return uAgx > 0.5 ? AgXToneMapping(c) : ACESFilmicToneMapping(c); }
${gradeBody('emaiGradeU', 'emaiTonemapU', 'uContrast', 'uSaturation', 'uShadowTint', 'uHighTint')}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // C10: NaN/Inf from a buggy shader become black, extreme HDR is clamped (was a separate full-screen pass)
  vec4 c = inputColor;
  if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
  outputColor = vec4(emaiGradeU(min(c.rgb, vec3(48.0))), c.a);
}`,
      {
        blendFunction: BlendFunction.SRC,
        uniforms: new Map<string, THREE.Uniform>([
          ['uAgx', new THREE.Uniform(0)],
          ['uContrast', new THREE.Uniform(g.contrast)],
          ['uSaturation', new THREE.Uniform(g.saturation)],
          ['uShadowTint', new THREE.Uniform(new THREE.Vector3(...g.shadowTint))],
          ['uHighTint', new THREE.Uniform(new THREE.Vector3(...g.highlightTint))],
        ]),
      },
    );
  }
  setKind(kind: 'aces' | 'agx'): void {
    this.uniforms.get('uAgx')!.value = kind === 'agx' ? 1 : 0;
  }
  setParams(g: GradeParams): void {
    this.uniforms.get('uContrast')!.value = g.contrast;
    this.uniforms.get('uSaturation')!.value = g.saturation;
    (this.uniforms.get('uShadowTint')!.value as THREE.Vector3).set(...g.shadowTint);
    (this.uniforms.get('uHighTint')!.value as THREE.Vector3).set(...g.highlightTint);
  }
}

/**
 * C10: the bloom's luminance input drops NaN/Inf pixels and clamps extreme HDR values (otherwise a
 * single bad pixel smears into a black block through the mip blur). The grade does the same for the
 * image itself, so no separate sanitize pass is needed.
 */
function sanitizeBloomInput(bloom: BloomEffect): void {
  const m = bloom.luminanceMaterial;
  const from = 'vec4 texel=texture2D(inputBuffer,vUv);';
  if (!m.fragmentShader.includes(from)) {
    console.warn('[render] bloom luminance shader changed: bloom input is not sanitised');
    return;
  }
  m.fragmentShader = m.fragmentShader.replace(from, `${from}if(any(isnan(texel))||any(isinf(texel)))texel=vec4(0.0,0.0,0.0,1.0);texel.rgb=min(texel.rgb,vec3(48.0));`);
  m.needsUpdate = true;
}
import type { EventBus } from './EventBus';
import type { QualityLevel, QualitySetting } from './types';

export interface QualityPreset {
  pixelRatioCap: number;
  /** most MSAA samples; the effective pixel ratio picks fewer (C10: 4× at ≤ 1.0, 2× at ≤ 1.25, 0× at ≥ 1.5) */
  multisampling: number;
  post: boolean; // composer path (grade + vignette, bloom when on); false = direct render with the baked grade (unused since C10)
  bloom: boolean;
  /** bloom resolution scale — no effect with mipmapBlur (the mip chain sets its own sizes); kept for a non-mip bloom */
  bloomScale: number;
  shadows: boolean;
  shadowMapSize: number;
  shadowRadius: number;
  shadowExtent: number; // half-size (m) of the sun shadow frustum around the player
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  // GDD §9.4/§11: DPR caps 1.0/1.25/1.5, sun shadow 90×90 m following the player, 2048² (1024² low)
  // C10: low shares medium's shader path (composer, no MSAA, bloom off): a switch never relinks the scene's programs
  low: { pixelRatioCap: 1, multisampling: 0, post: true, bloom: false, bloomScale: 0.5, shadows: true, shadowMapSize: 1024, shadowRadius: 1, shadowExtent: 35 },
  medium: { pixelRatioCap: 1.25, multisampling: 2, post: true, bloom: true, bloomScale: 0.5, shadows: true, shadowMapSize: 2048, shadowRadius: 2.5, shadowExtent: 45 },
  high: { pixelRatioCap: 1.5, multisampling: 4, post: true, bloom: true, bloomScale: 0.5, shadows: true, shadowMapSize: 2048, shadowRadius: 3, shadowExtent: 45 },
};

const ORDER: QualityLevel[] = ['low', 'medium', 'high'];

/**
 * Start tier for 'auto' from the GPU's name (C10): Intel HD/UHD and software renderers → low;
 * Iris, AMD integrated graphics and the base Apple M1/M2 → medium; everything else → high.
 */
export function tierForRenderer(name: string): QualityLevel {
  const n = name.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|microsoft basic render/.test(n)) return 'low';
  if (/intel/.test(n) && /\b(u?hd) graphics/.test(n) && !/iris/.test(n)) return 'low';
  if (/iris/.test(n)) return 'medium';
  if (/radeon(\(tm\))? (graphics|vega)|radeon \d{3}m\b|amd .*(graphics|vega)/.test(n) && !/\brx\b|pro w|radeon pro/.test(n)) return 'medium';
  if (/apple m[12]\b(?! (pro|max|ultra))/.test(n)) return 'medium';
  return 'high';
}

interface AutoState {
  level: QualityLevel;
  scale: number;
  renderer: string;
}

/**
 * WebGLRenderer + postprocessing (bloom on emissives > 1, ACES tone mapping, vignette),
 * pixel-ratio cap, quality presets and the adaptive 'auto' controller (C10, AUTO_QUALITY).
 */
export class RenderSystem {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: BloomEffect;
  private effectPass: EffectPass;
  private grade: GradeEffect;
  private vignette: VignetteEffect;
  private toneMappingKind: 'aces' | 'agx' = 'aces';
  gradeParams: GradeParams = { ...DEFAULT_GRADE };
  private baseVignette = 0.28;
  private extraVignette = 0;
  level: QualityLevel = 'high';
  setting: QualitySetting = 'auto';
  preset: QualityPreset = QUALITY_PRESETS.high;
  exposure = 1.0;

  // fps tracking
  private frameTimes: number[] = [];
  private lastChange = 0;
  fps = 0;
  /** C10: render scale on top of the pixel-ratio cap (auto only; 1 for a manual preset) */
  renderScale = 1;
  /** C10: light clouds (no supersampling, 12 relief steps) while GPU-bound at the bottom of the scale */
  cloudLite = false;
  /** C10: smoothed GPU ms per frame (EXT_disjoint_timer_query_webgl2), null when the browser has no timer */
  gpuMs: number | null = null;
  /** C10: unmasked renderer string (WEBGL_debug_renderer_info), '' when hidden */
  readonly rendererName: string;
  /** C10: the controller's thresholds (shared object — tests and tuning may change them at runtime) */
  readonly auto = AUTO_QUALITY;
  /** C10: until this time (performance.now) the title renders at full rate so the controller can measure */
  probeUntil = 0;
  private bottomSince = 0;
  private fastSince = 0;
  private upTries = 0;
  /** C10: time of the last step up (0 once it has held for failWindowMs) */
  private lastUpAt = 0;
  private gpuSamples: number[] = [];
  private timer: { ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }; free: WebGLQuery[]; busy: WebGLQuery[]; n: number } | null = null;
  /** Directional light whose shadow follows the player (set by Environment). */
  sun: THREE.DirectionalLight | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private events: EventBus,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // MSAA happens in the composer; low preset relies on pixel density
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // soft via shadow.radius (Vogel disk)
    // C11c: the sun's shadow map redraws when the light or a caster moved (markShadowsDirty), else every second frame
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setClearColor(0x1c1917, 1);
    this.renderer.info.autoReset = false; // composer renders several passes per frame
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 3000);
    this.camera.position.set(0, 1.7, 0);
    this.scene.add(this.camera); // so camera-attached objects (held props, effects) render

    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 4 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 1.0,
      luminanceSmoothing: 0.25,
      // ART-V2 §2.7: 0.7 by day, 1.0 at dusk (EnvParams.bloomIntensity, driven by the island's dusk)
      intensity: 0.7,
      radius: 0.72,
      levels: 6,
    });
    patchCustomToneMapping(this.toneMappingKind, this.gradeParams);
    this.grade = new GradeEffect(this.gradeParams);
    this.vignette = new VignetteEffect({ offset: 0.3, darkness: this.baseVignette });
    const vignette = this.vignette;
    this.effectPass = new EffectPass(this.camera, this.bloom, this.grade, vignette);
    this.composer.addPass(this.effectPass);
    sanitizeBloomInput(this.bloom);
    // bloom off (low): skip its luminance and mip-blur passes entirely; the merged shader stays the same
    const bloomUpdate = this.bloom.update.bind(this.bloom);
    this.bloom.update = (r, input, dt) => {
      if (this.preset.bloom) bloomUpdate(r, input, dt);
    };

    const gl = this.renderer.getContext();
    let name = '';
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      name = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    } catch {
      /* hidden */
    }
    this.rendererName = name;
    try {
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
      if (ext) this.timer = { ext, free: [], busy: [], n: 0 };
    } catch {
      this.timer = null;
    }

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  get maxAnisotropy(): number {
    return Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
  }

  /** Effective pixel ratio: device ratio, capped by the preset, times the auto render scale. */
  get pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, this.preset.pixelRatioCap) * this.renderScale;
  }

  private lastSize = '';

  resize = (): void => {
    const w = window.innerWidth,
      h = window.innerHeight;
    // C10: a new window size is a new load: failed step-up probes no longer count, headroom is measured afresh
    const size = `${w}x${h}`;
    if (size !== this.lastSize) {
      if (this.lastSize) this.upTries = this.fastSince = 0;
      this.lastSize = size;
    }
    const pr = this.pixelRatio;
    // C10: MSAA from the display's pixel ratio after the preset cap (dense pixels need less of it), at
    // most the preset's. The auto render scale never raises it (that would undo a GPU-bound step).
    const dense = Math.min(window.devicePixelRatio || 1, this.preset.pixelRatioCap);
    const samples = Math.min(this.preset.multisampling, MSAA_BY_PIXEL_RATIO.find(([max]) => dense <= max + 1e-3)?.[1] ?? 0);
    if (this.composer.multisampling !== samples) this.composer.multisampling = samples;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  };

  applyQualitySetting(setting: QualitySetting): void {
    this.setting = setting;
    this.bottomSince = this.fastSince = this.upTries = this.lastUpAt = 0;
    this.cloudLite = false;
    this.failedLevels.clear();
    if (setting !== 'auto') {
      this.renderScale = 1;
      this.setLevel(setting, false);
      return;
    }
    // C10: the last settled state for this GPU, else the start tier from its name
    const saved = loadJSON<AutoState | null>(AUTO_QUALITY.storageKey, null);
    const same = !!saved && saved.renderer === this.rendererName && !!QUALITY_PRESETS[saved.level];
    this.renderScale = same ? THREE.MathUtils.clamp(saved!.scale, AUTO_QUALITY.scaleMin, 1) : 1;
    this.setLevel(same ? saved!.level : tierForRenderer(this.rendererName), true);
  }

  private saveAuto(): void {
    if (this.setting !== 'auto') return;
    saveJSON(AUTO_QUALITY.storageKey, { level: this.level, scale: +this.renderScale.toFixed(2), renderer: this.rendererName } satisfies AutoState);
  }

  setLevel(level: QualityLevel, auto = false): void {
    this.level = level;
    this.preset = QUALITY_PRESETS[level];
    const p = this.preset;
    this.bloom.resolution.scale = p.bloomScale;
    this.bloom.blendMode.opacity.value = p.bloom ? 1 : 0;
    // Direct path: three's CustomToneMapping (= the grade, baked); composer path: GradeEffect (renderer stays linear).
    this.renderer.toneMapping = p.post ? THREE.NoToneMapping : THREE.CustomToneMapping;
    this.renderer.toneMappingExposure = this.exposure;
    syncBrandExact(this.exposure, p.post, this.gradeParams);
    this.renderer.shadowMap.enabled = p.shadows;
    if (this.sun) this.configureSunShadow(this.sun);
    this.shadowDirty = true;
    this.resize();
    this.lastChange = performance.now();
    this.frameTimes.length = 0;
    this.events.emit('quality:changed', { level, auto });
  }

  configureSunShadow(sun: THREE.DirectionalLight): void {
    const p = this.preset;
    sun.castShadow = p.shadows;
    const sh = sun.shadow;
    if (sh.mapSize.x !== p.shadowMapSize) {
      sh.mapSize.set(p.shadowMapSize, p.shadowMapSize);
      sh.map?.dispose();
      sh.map = null as unknown as THREE.WebGLRenderTarget;
    }
    sh.radius = p.shadowRadius;
    sh.blurSamples = 8;
    const cam = sh.camera;
    cam.left = -p.shadowExtent;
    cam.right = p.shadowExtent;
    cam.top = p.shadowExtent;
    cam.bottom = -p.shadowExtent;
    cam.near = 1;
    cam.far = 400;
    cam.updateProjectionMatrix();
    sh.bias = -0.0004;
    sh.normalBias = 0.02;
  }

  /** 'aces' (default per engine brief) or 'agx' (GDD §9.4). Both run through the same grade. */
  setToneMapping(kind: 'aces' | 'agx'): void {
    if (kind === this.toneMappingKind) return;
    this.toneMappingKind = kind;
    this.grade.setKind(kind);
    this.refreshDirectGrade();
  }

  /** Change the colour grade (live on medium/high; the low path recompiles its shaders). */
  setGrade(g: Partial<GradeParams>): void {
    Object.assign(this.gradeParams, g);
    this.grade.setParams(this.gradeParams);
    this.refreshDirectGrade();
    syncBrandExact(this.exposure, this.preset.post, this.gradeParams);
  }

  /** Bloom strength (ART-V2 §2.7: 0.7 by day, 1.0 at dusk). Threshold 1.0 / smoothing 0.25 stay fixed (light tiers). */
  setBloomIntensity(v: number): void {
    this.bloom.intensity = Math.max(0, v);
  }

  private refreshDirectGrade(): void {
    patchCustomToneMapping(this.toneMappingKind, this.gradeParams);
    if (this.preset.post) return; // direct-path programs rebuild lazily when the preset switches
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
    });
  }

  /** Extra vignette 0…1 on top of the base (player.setVignette). */
  setExtraVignette(a: number): void {
    this.extraVignette = Math.min(1, Math.max(0, a));
    this.vignette.darkness = this.baseVignette + this.extraVignette * 0.6;
  }

  setExposure(v: number): void {
    this.exposure = v;
    this.renderer.toneMappingExposure = v;
    syncBrandExact(v, this.preset.post, this.gradeParams);
  }

  private shadowDirty = true;
  private shadowTick = 0;

  /** The sun moved, its frustum re-centred, or a shadow caster moved: redraw the shadow map this frame. */
  markShadowsDirty(): void {
    this.shadowDirty = true;
  }

  render(dt: number): void {
    // animated parts nobody reports (zone machines, rovers) still get a fresh shadow at 30 Hz
    if (this.shadowDirty || (++this.shadowTick & 1) === 0) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    this.renderer.info.reset();
    const q = this.beginGpuTimer();
    if (this.preset.post) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    if (q) (this.renderer.getContext() as WebGL2RenderingContext).endQuery(this.timer!.ext.TIME_ELAPSED_EXT);
  }

  /** C10: time every 4th frame on the GPU (when the browser offers a timer); results arrive a few frames later. */
  private beginGpuTimer(): WebGLQuery | null {
    const t = this.timer;
    if (!t || this.setting !== 'auto') return null;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    try {
      // collect finished queries
      while (t.busy.length) {
        const q = t.busy[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        t.busy.shift();
        const disjoint = gl.getParameter(t.ext.GPU_DISJOINT_EXT);
        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
        t.free.push(q);
        if (disjoint) continue;
        this.gpuSamples.push(ns / 1e6);
        if (this.gpuSamples.length > 30) this.gpuSamples.shift();
        this.gpuMs = percentile(this.gpuSamples, 0.9);
      }
      if (++t.n % 4 !== 0 || t.busy.length > 6) return null;
      const q = t.free.pop() ?? gl.createQuery();
      if (!q) return null;
      gl.beginQuery(t.ext.TIME_ELAPSED_EXT, q);
      t.busy.push(q);
      return q;
    } catch {
      this.timer = null;
      this.gpuMs = null;
      return null;
    }
  }

  /** > 0 while warmUp() waits for programs (the loop keeps the last frame on screen meanwhile). */
  warming = 0;

  /**
   * C2: compile every program the current preset needs, once, for the target it really renders
   * into: on the composer path the scene renders into the linear HalfFloat input buffer (no tone
   * mapping, linear output), so compiling against the canvas (sRGB) built a second, unused set.
   * three's compile() walks hidden objects too (far tiers, interiors, dusk-only parts), so they
   * need no visibility flip. With `frame`, one full frame follows (shadow depth programs, the
   * composer's own passes, texture and geometry uploads) — call it behind the loading screen.
   */
  async warmUp(o: { frame?: boolean; root?: THREE.Object3D } = {}): Promise<void> {
    const r = this.renderer;
    // a subtree (a zone built after the title) compiles in the background: the loop keeps drawing
    const background = !!o.root;
    const dummies = o.frame ? this.mountBootWarmups() : null;
    if (!background) this.warming++;
    try {
      const prev = r.getRenderTarget();
      let pending: Promise<unknown>;
      try {
        if (this.preset.post) r.setRenderTarget(this.composer.inputBuffer);
        // compile() runs synchronously inside compileAsync; only the readiness polling is async
        pending = o.root ? r.compileAsync(o.root, this.camera, this.scene) : r.compileAsync(this.scene, this.camera);
      } finally {
        r.setRenderTarget(prev);
      }
      // never wait forever (a lost context never reports its programs ready)
      await Promise.race([pending, new Promise((res) => window.setTimeout(res, 4000))]);
    } catch (err) {
      console.warn('[render] warm-up compile failed (optimisation only)', err);
    } finally {
      if (!background) this.warming--;
    }
    if (o.frame) {
      this.renderer.shadowMap.needsUpdate = true;
      this.render(0);
    }
    if (dummies) {
      dummies.visible = false;
      this.markShadowsDirty();
    }
  }

  private warmupRoot: THREE.Group | null = null;
  private readonly warmupMounted = new Set<string>();

  /** registerBootWarmup's dummies, visible in front of the camera for the boot frame (null when none are registered). */
  private mountBootWarmups(): THREE.Group | null {
    if (!bootWarmups.size) return null;
    if (!this.warmupRoot) {
      this.warmupRoot = new THREE.Group();
      this.warmupRoot.name = 'core:boot-warmup';
      this.scene.add(this.warmupRoot);
    }
    const g = this.warmupRoot;
    for (const [name, make] of bootWarmups) {
      if (this.warmupMounted.has(name)) continue;
      this.warmupMounted.add(name);
      try {
        const obj = make();
        obj.name ||= `warmup:${name}`;
        g.add(obj);
      } catch (err) {
        console.error(`[render] boot warm-up "${name}" failed`, err);
      }
    }
    const cam = this.camera;
    cam.updateMatrixWorld();
    g.position.copy(cam.position).addScaledVector(cam.getWorldDirection(new THREE.Vector3()), 4);
    g.updateMatrixWorld(true);
    g.visible = true;
    return g;
  }

  /**
   * Called once per frame with the real frame delta (seconds) and the main-thread ms of the frame.
   * Drives the adaptive 'auto' controller (C10, AUTO_QUALITY); `measuring` is false on the title
   * (outside its probe), while paused, behind panels and while loading.
   */
  trackFrame(dt: number, measuring: boolean, cpuMs = 0): void {
    const A = AUTO_QUALITY;
    const now = performance.now();
    if (dt > 0 && dt < 0.25 && document.visibilityState === 'visible') {
      this.frameTimes.push(dt);
      if (this.frameTimes.length > A.windowFrames) this.frameTimes.shift();
    }
    if (this.frameTimes.length >= 20) {
      let s = 0;
      for (const t of this.frameTimes) s += t;
      this.fps = this.frameTimes.length / s;
    }
    if (this.setting !== 'auto' || !measuring) {
      this.fastSince = 0;
      return;
    }
    // a step up that has held: the next probe may come sooner again
    if (this.lastUpAt && now - this.lastUpAt > A.failWindowMs) {
      this.lastUpAt = 0;
      this.upTries = Math.max(0, this.upTries - 1);
    }
    if (this.frameTimes.length < A.windowFrames || now - this.lastChange < A.holdMs) return;
    const p90 = percentile(this.frameTimes, 0.9) * 1000;
    const p50 = percentile(this.frameTimes, 0.5) * 1000;
    const cpuBound = cpuMs >= A.cpuShare * p50;
    // ANGLE on Metal times the frame's latency, not its GPU work: a reading above the frame interval is no evidence
    const gpu = this.gpuMs != null && this.gpuMs <= A.plausible * Math.max(p50, A.targetMs) ? this.gpuMs : null;
    if (p90 > A.slow * A.targetMs) {
      this.fastSince = 0;
      // CPU-bound: resolution and presets cannot help (and a preset switch only costs a freeze)
      if (cpuBound) return;
      if (gpu != null && gpu < 0.8 * A.targetMs) return; // the GPU keeps up: something else is slow
      this.stepDown(now, p90, cpuMs);
      return;
    }
    // headroom: every frame on time and the main thread not the limit
    const next = this.nextUpCost();
    if (next <= 0 || cpuBound || p90 > 1.03 * A.targetMs) {
      this.fastSince = 0;
      return;
    }
    if (!this.fastSince) this.fastSince = now;
    // the timer says the next step fits: soon; else a probe that backs off after every failure
    const fits = gpu != null && gpu * next < A.fit * A.targetMs;
    const hold = fits ? A.holdUpMs : A.probeUpMs * 2 ** Math.min(4, this.upTries);
    if (now - this.fastSince >= hold) {
      this.fastSince = 0;
      this.lastUpAt = now;
      this.stepUp(now);
    }
  }

  /** Relative GPU cost of the next step up (0: nothing left to raise). */
  private nextUpCost(): number {
    const A = AUTO_QUALITY;
    if (this.cloudLite) return 1.15;
    if (this.renderScale < 1 - 1e-3) {
      const s = this.renderScale;
      const n = Math.min(1, s + A.scaleStep);
      return (n * n) / (s * s);
    }
    const i = ORDER.indexOf(this.level);
    const startIdx = ORDER.indexOf(this.ceiling);
    // never climb back to a preset that was too slow earlier in this session
    return i < startIdx && !this.failedLevels.has(ORDER[i + 1]) ? 1.6 : 0;
  }
  private failedLevels = new Set<QualityLevel>();

  /** the highest level auto may climb back to (the start tier or the saved level) */
  private get ceiling(): QualityLevel {
    const saved = loadJSON<AutoState | null>(AUTO_QUALITY.storageKey, null);
    const tier = tierForRenderer(this.rendererName);
    return saved && saved.renderer === this.rendererName && ORDER.indexOf(saved.level) > ORDER.indexOf(tier) ? saved.level : tier;
  }

  private stepDown(now: number, p90: number, cpuMs: number): void {
    const A = AUTO_QUALITY;
    // right after a step up: that step (probe) failed — wait longer before the next one
    if (this.lastUpAt && now - this.lastUpAt <= A.failWindowMs) this.upTries = Math.min(4, this.upTries + 1);
    this.lastUpAt = 0;
    const why = `p90 ${p90.toFixed(1)} ms, cpu ${cpuMs.toFixed(1)} ms${this.gpuMs != null ? `, gpu ${this.gpuMs.toFixed(1)} ms` : ''}`;
    if (this.renderScale > A.scaleMin + 1e-3) {
      this.renderScale = Math.max(A.scaleMin, +(this.renderScale - A.scaleStep).toFixed(2));
      console.info(`[render] auto quality: render scale ${this.renderScale.toFixed(1)} (${why})`);
      this.applyScale(now);
      return;
    }
    // light clouds only change high (medium already uses 12 steps, low none)
    if (!this.cloudLite && this.level === 'high') {
      this.cloudLite = true;
      this.bottomSince = now;
      console.info(`[render] auto quality: light clouds (${why})`);
      this.lastChange = now;
      this.frameTimes.length = 0;
      this.saveAuto();
      return;
    }
    if (!this.bottomSince) this.bottomSince = now;
    if (now - this.bottomSince < A.levelAfterMs) return;
    const i = ORDER.indexOf(this.level);
    if (i <= 0) return;
    console.info(`[render] auto quality: ${this.level} → ${ORDER[i - 1]} (${why})`);
    this.failedLevels.add(this.level);
    this.cloudLite = false;
    this.bottomSince = 0;
    this.setLevel(ORDER[i - 1], true);
    this.saveAuto();
  }

  private stepUp(now: number): void {
    const A = AUTO_QUALITY;
    if (this.cloudLite) {
      this.cloudLite = false;
      console.info('[render] auto quality: full clouds');
      this.lastChange = now;
      this.frameTimes.length = 0;
    } else if (this.renderScale < 1 - 1e-3) {
      this.renderScale = Math.min(1, +(this.renderScale + A.scaleStep).toFixed(2));
      console.info(`[render] auto quality: render scale ${this.renderScale.toFixed(1)}`);
      this.applyScale(now);
      return;
    } else {
      const i = ORDER.indexOf(this.level);
      if (i >= ORDER.length - 1) return;
      console.info(`[render] auto quality: ${this.level} → ${ORDER[i + 1]}`);
      this.renderScale = A.scaleMin + A.scaleStep * 2; // a heavier preset starts lower and climbs
      this.setLevel(ORDER[i + 1], true);
    }
    this.saveAuto();
  }

  private applyScale(now: number): void {
    this.resize();
    this.lastChange = now;
    this.frameTimes.length = 0;
    this.saveAuto();
    this.events.emit('quality:scale', { scale: this.renderScale });
  }

  /** Debug info for overlays/tests. */
  info(): { calls: number; triangles: number; geometries: number; textures: number; programs: number; scale: number; gpuMs: number | null } {
    const r = this.renderer.info;
    return {
      scale: this.renderScale,
      gpuMs: this.gpuMs,
      calls: r.render.calls,
      triangles: r.render.triangles,
      geometries: r.memory.geometries,
      textures: r.memory.textures,
      programs: r.programs?.length ?? 0,
    };
  }
}
