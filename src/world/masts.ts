import * as THREE from 'three';
import { css, type ZoneContext, type ZoneManifest } from '@/core/zones';
import { DEG, ZONE_PLOTS, gateMastPosition, type ZonePlotInfo } from './layout';
import { drawGlyph } from './glyphs';
import { merge } from './util';
import { paint, sharedBatch } from './landscape/batch';
import { markStatic } from './statics';

/**
 * Gate pylons (§4.4, §6.1; ART-V2 §4.4): beside each spoke (r 57, 5 m clockwise) a 14 m tapered
 * ceramic blade (1.35 → 0.75 m, 0.36 m deep, chamfered) on a carbon foot, the vertical sign
 * (number, verb, glyph, name, the zone's stamps and ★ x/9 — FUN-PLAN W3) behind a dark-glass
 * inset, a vertical light slot on both edges and a halo ring at the top in the state colour
 * (stone = off, teal = visited, orange = current objective; steady, never blinking), and a white
 * LiDAR puck on top.
 */
export interface Masts {
  setState(zoneId: string, state: 'unvisited' | 'visited' | 'objective'): void;
  update(dt: number, t: number): void;
}

const H = 14;
const W0 = 1.35,
  W1 = 0.75,
  D = 0.36,
  CH = 0.06;
const SIGN = { w: 0.88, h: 6.0, y: 7.6 };

export function buildMasts(ctx: ZoneContext, manifests: ZoneManifest[]): Masts {
  const M = ctx.materials;
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const batch = sharedBatch(ctx);

  // tapered blade with chamfered edges (extruded trapezoid, bevel = chamfer)
  const shape = new THREE.Shape();
  shape.moveTo(-W0 / 2 + CH, 0);
  shape.lineTo(W0 / 2 - CH, 0);
  shape.lineTo(W1 / 2 - CH, H - CH);
  shape.lineTo(-W1 / 2 + CH, H - CH);
  shape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: D - 2 * CH, bevelEnabled: true, bevelThickness: CH, bevelSize: CH, bevelSegments: 1, curveSegments: 1 }).translate(0, 0.16, -(D - 2 * CH) / 2);
  const blades = new THREE.InstancedMesh(bladeGeo, M.hull, ZONE_PLOTS.length);
  blades.castShadow = true;
  blades.receiveShadow = true;
  blades.name = 'island:gate-blades';
  ctx.root.add(markStatic(blades));

  const slotOff = M.carbon;
  const slotTeal = M.light(0x2dd4bf);
  const slotOrange = M.light(0xff6700, 'T1');
  // W1: the six state halos are three meshes, one per state (carbon / teal / orange); setState
  // re-indexes them, so the masts cost ≤ 3 draws for the halos instead of 6
  const haloGeos: THREE.BufferGeometry[] = [];
  const state = new Map<string, 'unvisited' | 'visited' | 'objective'>();
  // W1: the six signs (both faces) are one mesh; each keeps its own canvas texture (a redraw uploads
  // only its own sign, as before) and the shader picks the zone's texture per vertex
  const SW = 256,
    SH = 1744;
  const signTex: THREE.CanvasTexture[] = [];
  const signGeos: THREE.BufferGeometry[] = [];
  const widthAt = (y: number): number => W0 + (W1 - W0) * ((y - 0.16) / H);
  const m4 = new THREE.Matrix4();

  ZONE_PLOTS.forEach((z, i) => {
    const [x, , zz] = gateMastPosition(z.bearing);
    const yaw = -z.bearing * DEG; // local +Z faces the hub
    const group = new THREE.Group();
    group.position.set(x, 0, zz);
    group.rotation.y = yaw;
    ctx.root.add(group);
    group.updateMatrixWorld(true);
    blades.setMatrixAt(i, m4.copy(group.matrixWorld));
    ctx.physics.addStaticBox({ size: [1.1, H, 0.5], position: [x, H / 2, zz], rotation: [0, yaw, 0], surface: 'metal' });
    const toWorld = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.applyMatrix4(group.matrixWorld);

    // foot: carbon plinth (inset reveal) + alu collar
    batch.add(M.carbon, toWorld(new THREE.BoxGeometry(W0 - 0.3, 0.16, D - 0.1).translate(0, 0.08, 0)), { name: 'carbon' });
    batch.add(M.carbon, toWorld(new THREE.BoxGeometry(W0 + 0.5, 0.06, D + 0.5).translate(0, 0.03, 0)), { name: 'carbon' });
    // dark-glass insets on both faces, alu frames
    for (const s of [1, -1]) {
      batch.add(M.darkGlass, toWorld(new THREE.BoxGeometry(SIGN.w + 0.06, SIGN.h + 0.06, 0.02).translate(0, SIGN.y, s * (D / 2 + 0.002))), { name: 'dark-glass' });
      for (const [w, h, ox, oy] of [
        [SIGN.w + 0.12, 0.035, 0, SIGN.h / 2 + 0.05],
        [SIGN.w + 0.12, 0.035, 0, -SIGN.h / 2 - 0.05],
        [0.035, SIGN.h + 0.12, SIGN.w / 2 + 0.05, 0],
        [0.035, SIGN.h + 0.12, -SIGN.w / 2 - 0.05, 0],
      ])
        batch.add(M.brushedAlu, toWorld(new THREE.BoxGeometry(w, h, 0.03).translate(ox, SIGN.y + oy, s * (D / 2 + 0.012))), { name: 'alu' });
    }
    // top: alu collar, white LiDAR puck with a dark window band
    batch.add(M.brushedAlu, toWorld(new THREE.CylinderGeometry(0.3, 0.34, 0.08, 20).translate(0, H + 0.2, 0)), { name: 'alu' });
    batch.add(M.standard({ vertexColors: true, roughness: 0.4, metalness: 0.15 }), toWorld(merge([paint(new THREE.CylinderGeometry(0.24, 0.26, 0.16, 24).translate(0, H + 0.32, 0), 0xe7e5e4), paint(new THREE.CylinderGeometry(0.245, 0.245, 0.09, 24).translate(0, H + 0.445, 0), 0x0f0e0d), paint(new THREE.CylinderGeometry(0.2, 0.245, 0.06, 24).translate(0, H + 0.52, 0), 0xc9c4bf)])), { name: 'pucks' });

    // sign (canvas, both faces)
    const canvas = document.createElement('canvas');
    canvas.width = SW;
    canvas.height = SH;
    const layer = i;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    signTex.push(tex);
    const draw = (): void => drawSign(canvas, z, byId.get(z.id) ?? null, ctx.lang, signStats(ctx, z.id), () => (tex.needsUpdate = true));
    draw();
    ctx.i18n.onChange(draw);
    ctx.events.on('stars:changed', (e: { zoneId?: string } | undefined) => {
      if (!e || e.zoneId === z.id) draw();
    });
    ctx.events.on('stamp:awarded', draw);
    const sg = merge([new THREE.PlaneGeometry(SIGN.w, SIGN.h).translate(0, SIGN.y, D / 2 + 0.014), new THREE.PlaneGeometry(SIGN.w, SIGN.h).rotateY(Math.PI).translate(0, SIGN.y, -D / 2 - 0.014)]);
    sg.setAttribute('aLayer', new THREE.Float32BufferAttribute(new Float32Array(sg.getAttribute('position').count).fill(layer), 1));
    signGeos.push(toWorld(sg));

    // state light: a slot on both blade edges (full sign height) + a halo ring around the top
    const slotH = SIGN.h + 1.2;
    const y0 = SIGN.y - slotH / 2,
      y1 = SIGN.y + slotH / 2;
    const xa = widthAt(y0) / 2 + 0.004,
      xb = widthAt(y1) / 2 + 0.004;
    const slotGeo = (s: number): THREE.BufferGeometry => {
      const g = new THREE.BufferGeometry();
      const hw = 0.03;
      const p = [s * xa, y0, -hw, s * xa, y0, hw, s * xb, y1, hw, s * xb, y1, -hw];
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setIndex(s > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
      g.computeVertexNormals();
      return g;
    };
    haloGeos.push(toWorld(merge([slotGeo(1), slotGeo(-1), new THREE.TorusGeometry(0.8, 0.05, 8, 64).rotateX(Math.PI / 2).translate(0, H - 0.25, 0).toNonIndexed()].map((g) => (g.index ? g.toNonIndexed() : g)))));
    state.set(z.id, 'unvisited');
    // the halo's carbon carrier ring and three spokes to the blade
    batch.add(M.carbon, toWorld(new THREE.TorusGeometry(0.8, 0.075, 8, 64).rotateX(Math.PI / 2).translate(0, H - 0.31, 0)), { name: 'carbon' });
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) batch.add(M.carbon, toWorld(new THREE.BoxGeometry(0.42, 0.04, 0.04).translate(0.6, H - 0.31, 0).rotateY(a)), { name: 'carbon' });
    // the group only placed the parts (they are baked into world space)
    group.removeFromParent();
  });
  blades.computeBoundingSphere();

  // signs: unlit, kept below the bloom band (white text ×0.8 → L ≈ 0.73); a polygon offset keeps
  // them in front of the dark-glass inset 2 mm behind whatever the draw order
  const signMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.8, 0.8), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  signMat.name = 'island:mast-signs';
  // sampler arrays only take constant indices in GLSL ES 3.0: a branch per sign, sampled with the
  // gradients taken outside the branch (same mip level and anisotropy as a plain map lookup)
  const N = signTex.length;
  const signUni: Record<string, { value: THREE.Texture }> = {};
  signTex.forEach((t, i) => (signUni[`uSign${i}`] = { value: t }));
  const pick = signTex.map((_, i) => `${i ? 'else ' : ''}if (si == ${i}) sc = textureGrad(uSign${i}, vSignUv, sdx, sdy);`).join('\n  ');
  signMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, signUni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLayer;\nvarying vec2 vSignUv;\nflat out int vSignI;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSignUv = uv;\nvSignI = int(aLayer + 0.5);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${signTex.map((_, i) => `uniform sampler2D uSign${i};`).join('\n')}\nvarying vec2 vSignUv;\nflat in int vSignI;`)
      .replace(
        '#include <map_fragment>',
        `{
  vec2 sdx = dFdx(vSignUv), sdy = dFdy(vSignUv);
  int si = vSignI;
  vec4 sc = vec4(1.0);
  ${pick}
  diffuseColor *= sc;
}`,
      );
  };
  void N;
  signMat.customProgramCacheKey = () => 'emai-mast-signs';
  const signs = new THREE.Mesh(merge(signGeos), signMat);
  signs.name = 'island:mast-signs';
  ctx.root.add(signs);
  ctx.freezeStatic(signs);
  ctx.onDispose(() => {
    for (const t of signTex) t.dispose();
    signMat.dispose();
  });

  // halos: all six in each state mesh; the index lists the masts in that state
  const haloAll = merge(haloGeos);
  const perHalo = haloAll.getAttribute('position').count / ZONE_PLOTS.length;
  const haloMeshes = (['unvisited', 'visited', 'objective'] as const).map((st) => {
    const g = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(haloAll.attributes)) g.setAttribute(name, a);
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(perHalo * ZONE_PLOTS.length), 1));
    haloAll.computeBoundingSphere();
    g.boundingSphere = haloAll.boundingSphere;
    const mesh = new THREE.Mesh(g, st === 'objective' ? slotOrange : st === 'visited' ? slotTeal : slotOff);
    mesh.name = `island:mast-halos:${st}`;
    ctx.root.add(mesh);
    ctx.freezeStatic(mesh);
    return { st, mesh, g };
  });
  const reindex = (): void => {
    for (const h of haloMeshes) {
      const index = h.g.index!;
      const a = index.array as Uint32Array;
      let n = 0;
      ZONE_PLOTS.forEach((z, i) => {
        if (state.get(z.id) !== h.st) return;
        for (let k = 0; k < perHalo; k++) a[n++] = i * perHalo + k;
      });
      index.needsUpdate = true;
      h.g.setDrawRange(0, n);
      h.mesh.visible = n > 0;
    }
  };
  reindex();

  return {
    setState(id, s) {
      if (!state.has(id) || state.get(id) === s) return;
      state.set(id, s);
      reindex();
    },
    update() {},
  };
}

/** The zone's stamps (0–3) and stars (x/9) for the sign (FUN-PLAN W3). */
function signStats(ctx: ZoneContext, zoneId: string): { stamps: number; stars: number; max: number } {
  const st = ctx.game?.stars(zoneId) ?? { stars: 0, max: 9 };
  return { stamps: Math.min(3, ctx.zones.stamps(zoneId)), stars: st.stars, max: st.max || 9 };
}

function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, filled: boolean, color: string): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const x = cx + Math.cos(a) * rr,
      y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  if (filled) {
    g.fillStyle = color;
    g.fill();
  } else {
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.stroke();
  }
}

function drawSign(canvas: HTMLCanvasElement, z: ZonePlotInfo, m: ZoneManifest | null, lang: 'de' | 'en', stats: { stamps: number; stars: number; max: number }, done: () => void): void {
  const g = canvas.getContext('2d')!;
  const W = canvas.width,
    Hc = canvas.height;
  const name = m?.name?.[lang] ?? z.name[lang];
  const verb = m?.verb?.[lang] ?? z.verb[lang];
  const eyebrow = m?.eyebrow?.[lang] ?? z.eyebrow[lang];
  const glyph = m?.glyph ?? z.glyph;
  g.fillStyle = '#151312';
  g.fillRect(0, 0, W, Hc);
  // orange → teal hairline (brand card)
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, css.orange);
  grd.addColorStop(1, css.teal);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, 6);
  g.fillStyle = css.text;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `700 150px "Space Grotesk", sans-serif`;
  g.fillText(String(z.number).padStart(2, '0'), W / 2, 176);
  g.font = `500 30px "Geist Mono", monospace`;
  g.fillStyle = css.textSecondary;
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '4px';
  g.fillText(verb, W / 2, 228);
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
  drawGlyph(g, glyph, W / 2, 330, 52, css.teal, 7);
  // W3: stamps (three rings, filled when earned) and ★ x/9 (drawn, not a font glyph)
  const sy = 452;
  for (let k = 0; k < 3; k++) {
    const cx = W / 2 + (k - 1) * 58;
    g.beginPath();
    g.arc(cx, sy, 17, 0, Math.PI * 2);
    if (k < stats.stamps) {
      g.fillStyle = css.orange;
      g.fill();
    } else {
      g.strokeStyle = '#57534E';
      g.lineWidth = 4;
      g.stroke();
    }
  }
  star(g, W / 2 - 46, 528, 22, stats.stars > 0, stats.stars > 0 ? css.teal : '#57534E');
  g.fillStyle = stats.stars > 0 ? css.text : css.textMuted;
  g.font = `600 40px "Geist Mono", monospace`;
  g.textAlign = 'left';
  g.fillText(`${stats.stars}/${stats.max}`, W / 2 - 14, 543);
  g.textAlign = 'center';
  g.fillStyle = '#2A2725';
  g.fillRect(40, 590, W - 80, 2);
  // vertical name (reads bottom → top)
  g.save();
  g.translate(W / 2 + 34, Hc - 70);
  g.rotate(-Math.PI / 2);
  g.textAlign = 'left';
  let size = 120;
  g.font = `700 ${size}px "Space Grotesk", sans-serif`;
  const maxLen = Hc - 70 - 640;
  while (g.measureText(name).width > maxLen && size > 60) {
    size -= 4;
    g.font = `700 ${size}px "Space Grotesk", sans-serif`;
  }
  g.fillStyle = css.text;
  g.fillText(name, 0, 0);
  g.restore();
  // vertical eyebrow
  g.save();
  g.translate(W / 2 - 64, Hc - 70);
  g.rotate(-Math.PI / 2);
  g.textAlign = 'left';
  g.font = `500 22px "Geist Mono", monospace`;
  g.fillStyle = css.textMuted;
  g.fillText(eyebrow.toUpperCase(), 0, 0);
  g.restore();
  done();
}
