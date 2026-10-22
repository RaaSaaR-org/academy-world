import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { DITHER_FADE_GLSL, ENV_TUNING, FLIGHT_AIR, FLIGHT_GROUND } from '@/core/env';
import { registerDebugExt } from '@/core/DebugApi';
import { bearingDir } from './layout';
import { fbm3, merge, noise3, rng, tint } from './util';

/**
 * Sky dressing (§9.5, ART-V2 §4.7): wisps drifting past the rim (−60 … −20), the three distant
 * Prüfinseln (900–1,400 m, bearings 40/160/260) as sister hexacopter-platform silhouettes (one draw
 * call each, six tiny teal rotor lights that come up at dusk), three nearer sister platforms for
 * parallax, two unbranded six-rotor cargo multicopters on slow transits, six rescue drones circling
 * the island and two inspection drones circling the tower (r 24, y 33–37: ≥ 3 m clear of the arm
 * under the halo and the Turmsprung flight). Everything rides the environment tilt (gusts) via `tiltGroup`.
 *
 * Phase 7 (WP2, plan §5.3 rule 2b, §5.7): the sky frame. While grounded the sky dressing (wisps,
 * Prüfinseln, sister platforms) is hidden; in the lift-off `reveal(t01)` (WP13) fades it in after the
 * break-out at its rc4 positions offset by (570 − h), with a screen-door fade (no transparent variant,
 * no program link mid-flight); airborne it is rc4. The dressing lives in 'island:sky' (tools count its
 * draws: 0 while grounded). Grounded the cargo copters ('island:cargo', the same tilt) cross the Revier
 * under the cloud bank (ground frame, y − h) and the rescue drones patrol above the dock; airborne both
 * keep rc4.
 * The island module applies the quest's flight look here: `ctx.env.setFlight(FLIGHT_GROUND | FLIGHT_AIR)`.
 */
export interface Sky {
  update(dt: number, t: number, cam: THREE.Camera, tiltQ: THREE.Quaternion): void;
  /** a drone flies to a world point (rescue cameo); resolves when it arrives */
  dispatchDrone(to: THREE.Vector3): void;
  // ── Phase 7 (WP2 contract, plan §5.2, §5.3 rule 2b; stubs committed by WPS) ──
  /** grounded: the sky dressing hides, the cargo copters cross the Revier under the cloud bank (stub: no-op) */
  setGrounded(on: boolean): void;
  /** the lift-off reveal 0…1 of the sky dressing, driven by WP13 (stub: no-op) */
  reveal(t01: number): void;
  /** the unbranded cargo multicopter's geometry (shared with the Revier and the lift-off) */
  copterGeometry(): THREE.BufferGeometry;
}

const WISP_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
varying vec2 vUv;
varying float vAlpha;
varying float vDist;
void main() {
  vUv = uv;
  vAlpha = aAlpha;
  vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  mv.xy += position.xy * aSize;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const WISP_FRAG = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uColor; uniform vec3 uFog; uniform float uFade;
varying vec2 vUv; varying float vAlpha; varying float vDist;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vAlpha * uFade * smoothstep(4.0, 40.0, vDist);
  if (a < 0.004) discard;
  vec3 col = mix(uColor * (0.94 + 0.06 * t.r), uFog, clamp(vDist / 900.0, 0.0, 0.6));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function buildSky(ctx: ZoneContext): Sky {
  const M = ctx.materials;
  const env = ctx.env.params;
  const scene = ctx.root;
  // everything here rotates with the environment tilt (sky, clouds, distant islands)
  const tiltGroup = new THREE.Group();
  tiltGroup.name = 'island:sky';
  scene.add(tiltGroup);
  // Phase 7: the sky frame (wisps, Prüfinseln, islets): hidden grounded, offset by (570 − h) in the lift-off
  const dress = new THREE.Group();
  dress.name = 'island:sky-dressing';
  // far away and fading by a screen door: the surface pass keeps its hands off
  dress.userData.noEnrich = true;
  dress.userData.skyDressing = true;
  tiltGroup.add(dress);
  // the cargo copters are no sky dressing (they fly grounded too, §5.3 rule 2b): their own group, same tilt
  const cargoGroup = new THREE.Group();
  cargoGroup.name = 'island:cargo';
  scene.add(cargoGroup);
  /** the dressing's fade 0…1 (wisps: alpha; Prüfinseln and islets: screen door) */
  const fadeU = { value: 1 };
  const owned: { dispose(): void }[] = [];
  ctx.onDispose(() => owned.forEach((o) => o.dispose()));

  // ── wisps near the rim ───────────────────────────────────────────────────
  const wispTex = M.canvasTexture(128, 128, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (x / w) * 2 - 1,
          dy = (y / h) * 2 - 1;
        const r = Math.hypot(dx, dy * 1.6);
        const n = fbm3(x * 0.05, y * 0.05, 3.3, 4);
        const a = Math.max(0, 1 - r) ** 1.5 * (0.55 + 0.45 * THREE.MathUtils.smoothstep(n, 0.25, 0.75));
        const o = (y * w + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
        img.data[o + 3] = Math.round(a * 255);
      }
    g.putImageData(img, 0, 0);
  });
  wispTex.wrapS = wispTex.wrapT = THREE.ClampToEdgeWrapping;
  owned.push(wispTex);
  const WISPS = 30;
  const wispGeo = new THREE.PlaneGeometry(1, 1);
  const size = new Float32Array(WISPS),
    alpha = new Float32Array(WISPS);
  const r = rng(303);
  const wispState: { b: number; r: number; y: number; v: number }[] = [];
  for (let i = 0; i < WISPS; i++) {
    size[i] = 34 + r() * 50;
    alpha[i] = 0.08 + r() * 0.12;
    // drifting below and beside the island (not in front of the rock): depth between island and sea
    wispState.push({ b: r() * 360, r: 125 + r() * 140, y: -95 + r() * 55, v: (0.6 + r() * 1.4) * (r() < 0.5 ? -1 : 1) });
  }
  wispGeo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
  wispGeo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
  const wispMat = new THREE.ShaderMaterial({
    vertexShader: WISP_VERT,
    fragmentShader: WISP_FRAG,
    uniforms: { uMap: { value: wispTex }, uColor: { value: new THREE.Color(0xf4efe9) }, uFog: { value: new THREE.Color(env.fogColor) }, uFade: fadeU },
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  owned.push(wispMat);
  const wisps = new THREE.InstancedMesh(wispGeo, wispMat, WISPS);
  wisps.frustumCulled = false;
  wisps.name = 'island:wisps';
  wisps.renderOrder = 5;
  dress.add(wisps);

  // ── distant Prüfinseln (fog-tinted silhouettes) + nearer islets ──────────
  // W1: the three silhouettes are one mesh (their bob and fog tint per island come from uniform
  // arrays, indexed per vertex), their rotor lights one mesh, the three islets one mesh (bob as
  // morph targets), the two cargo copters one instanced mesh: ≤ 4 draws instead of up to 11
  const farBob = [0, 0, 0];
  const farCol = [new THREE.Color(0x2e2925), new THREE.Color(0x2e2925), new THREE.Color(0x2e2925)];
  const farGeos: THREE.BufferGeometry[] = [];
  const farLightGeos: THREE.BufferGeometry[] = [];
  const nearGeos: THREE.BufferGeometry[] = [];
  const bobs: { phase: number; amp: number }[] = [];
  const islandAttr = (g: THREE.BufferGeometry, i: number): THREE.BufferGeometry => {
    g.setAttribute('aIsland', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(i), 1));
    return g;
  };
  const far = [
    { bearing: 40, dist: 1150, scale: 1.0, seed: 11 },
    { bearing: 160, dist: 1380, scale: 1.35, seed: 12 },
    { bearing: 260, dist: 920, scale: 0.8, seed: 13 },
  ];
  // silhouettes recoloured every frame from the live fog colour (day → dusk), warmer toward the sun
  const farMats: { i: number; k: number; warm: number }[] = [];
  const sunAz = env.sunAzimuthDeg;
  const farLightMat = M.light(0x2dd4bf);
  far.forEach((f, i) => {
    const warm = Math.pow(Math.max(0, Math.cos((f.bearing - sunAz) * (Math.PI / 180))) , 3);
    farMats.push({ i, k: 0.5 + f.dist / 4200, warm });
    const [x, z] = bearingDir(f.bearing);
    const base = new THREE.Vector3(x * f.dist, -30 - f.dist * 0.04, z * f.dist);
    const g = platformGeometry(f.seed, f.scale, true).translate(base.x, base.y, base.z);
    g.deleteAttribute('color');
    farGeos.push(islandAttr(g, i));
    // six rotor lights (T0 by day → T1 at dusk; sub-pixel by day, a ring of points at dusk)
    const R = 60 * f.scale;
    const lg: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      lg.push(new THREE.SphereGeometry(R * 0.035, 6, 4).translate(Math.cos(a) * R * 0.98, -R * 0.08, Math.sin(a) * R * 0.98));
    }
    farLightGeos.push(islandAttr(merge(lg).translate(base.x, base.y, base.z), i));
    bobs.push({ phase: f.seed, amp: 2 });
  });
  // one unlit mesh: silhouettes (aIsland 0–2, the island's fog tint uFarCol, no fog) and their
  // rotor lights (aIsland 3–5, the brand 'line' light colour, scene fog), both bobbing (uFarBob)
  const farLightCol = farLightMat.color.clone();
  const farUni = { uFarBob: { value: farBob }, uFarCol: { value: farCol }, uFarLight: { value: farLightCol }, uFade: fadeU };
  const farMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  farMat.name = 'island:far-islands';
  farMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, farUni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aIsland;\nvarying float vIsland;\nuniform float uFarBob[3];')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvIsland = aIsland;\ntransformed.y += uFarBob[int(aIsland + 0.5) % 3];');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vIsland;\nuniform vec3 uFarCol[3];\nuniform vec3 uFarLight;\nuniform float uFade;\n${DITHER_FADE_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (emaiDitherCut(uFade)) discard;\nint fi = int(vIsland + 0.5);\ndiffuseColor.rgb = fi < 3 ? uFarCol[fi] : uFarLight;')
      // three's fog_fragment, applied to the lights only (the silhouettes carry their own fog tint)
      .replace(
        '#include <fog_fragment>',
        `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, vIsland > 2.5 ? fogFactor : 0.0 );
#endif`,
      );
  };
  farMat.customProgramCacheKey = () => 'emai-far-islands';
  owned.push(farMat);
  const farMesh = new THREE.Mesh(merge([...farGeos, ...farLightGeos.map((g, i) => islandAttr(g, i + 3))]), farMat);
  farMesh.name = 'island:far-islands';
  farMesh.frustumCulled = false;
  dress.add(farMesh);
  const farLightSync = (): void => void farLightCol.copy(farLightMat.color);
  const near = [
    { bearing: 112, dist: 300, scale: 0.28, y: -24, seed: 21 },
    { bearing: 205, dist: 420, scale: 0.36, y: 8, seed: 22 },
    { bearing: 318, dist: 360, scale: 0.22, y: -40, seed: 23 },
  ];
  // its own material (not the cached M.standard): the screen-door fade of the reveal
  const islMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.05, flatShading: true });
  islMat.name = 'island:near-islets';
  islMat.onBeforeCompile = (sh) => {
    sh.uniforms.uFade = fadeU;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uFade;\n${DITHER_FADE_GLSL}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (emaiDitherCut(uFade)) discard;');
  };
  islMat.customProgramCacheKey = () => 'emai-near-islets';
  owned.push(islMat);
  near.forEach((f) => {
    const [x, z] = bearingDir(f.bearing);
    nearGeos.push(platformGeometry(f.seed, f.scale, false).rotateY(f.seed).translate(x * f.dist, f.y, z * f.dist));
    bobs.push({ phase: f.seed * 1.7, amp: 1.2 });
  });
  // one mesh; each islet's bob is a morph target (a unit +y shift of its own vertices)
  const nearGeo = merge(nearGeos.map((g, i) => islandAttr(g, i)));
  {
    const isl = nearGeo.getAttribute('aIsland');
    nearGeo.morphAttributes.position = near.map((_, i) => {
      const d = new Float32Array(isl.count * 3);
      for (let v = 0; v < isl.count; v++) if (Math.round(isl.getX(v)) === i) d[v * 3 + 1] = 1;
      return new THREE.BufferAttribute(d, 3);
    });
    nearGeo.morphTargetsRelative = true;
    nearGeo.deleteAttribute('aIsland');
    nearGeo.computeBoundingSphere();
    nearGeo.boundingSphere!.radius += 2;
  }
  const nearMesh = new THREE.Mesh(nearGeo, islMat);
  nearMesh.name = 'island:near-islets';
  nearMesh.morphTargetInfluences = near.map(() => 0);
  dress.add(nearMesh);

  // ── cargo multicopters (unbranded, six rotors, 12 m span) on slow transits ──
  const shipGeo = copterGeometry();
  const ships: { r: number; y: number; w: number; a: number }[] = [];
  const shipMat = M.standard({ vertexColors: true, roughness: 0.45, metalness: 0.2 });
  for (const s of [
    { r: 520, y: 46, w: 0.011, a: 1.2 },
    { r: 640, y: 18, w: -0.008, a: 4.1 },
  ]) {
    ships.push({ ...s });
  }
  // Phase 7, grounded: the same two cross the Revier under the cloud bank (base +330) on long loops
  // over the sites (ground frame, h = 0), ≈ 8 m/s; seen from the bridge head, the plaza and the Ausguck
  const groundShips = GROUND_TRANSITS.map((g) => {
    const rot = g.rotDeg * (Math.PI / 180);
    return { ...g, c: Math.cos(rot), s: Math.sin(rot) };
  });
  const shipMesh = new THREE.InstancedMesh(shipGeo, shipMat, ships.length);
  const shipScale = new THREE.Vector3().setScalar(1.6);
  for (let i = 0; i < ships.length; i++) shipMesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); // placed by update()
  shipMesh.name = 'island:cargo-copters';
  shipMesh.frustumCulled = false;
  cargoGroup.add(shipMesh);

  // ── drones: six rescue drones around the island, two inspection drones at the tower ──
  const NDRONES = 8;
  const droneGeo = droneGeometry();
  const drones = new THREE.InstancedMesh(droneGeo, M.standard({ vertexColors: true, roughness: 0.4, metalness: 0.3 }), NDRONES);
  drones.frustumCulled = false;
  ctx.root.add(drones);
  ctx.freezeStatic(drones);
  const droneNav = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), M.light(0x2dd4bf, 'T1'), NDRONES * 2);
  droneNav.frustumCulled = false;
  ctx.root.add(droneNav);
  ctx.freezeStatic(droneNav);
  const droneState = Array.from({ length: NDRONES }, (_, i) => {
    const tower = i >= 6;
    return {
      r: tower ? 24 : 112 + (i % 3) * 18,
      y: tower ? 33 + (i - 6) * 4 : -14 + (i % 4) * 9,
      // Phase 7, grounded: above the dock rim and the Werft gantries (28 m), not inside the terrain
      yGround: tower ? 33 + (i - 6) * 4 : 30 + (i % 4) * 4,
      w: tower ? (i === 6 ? 0.09 : -0.07) : (0.045 + (i % 2) * 0.015) * (i % 2 ? -1 : 1),
      a: tower ? (i - 6) * Math.PI : i * 1.05,
      tower,
      pos: new THREE.Vector3(),
      mission: null as null | { to: THREE.Vector3; from: THREE.Vector3; t: number },
    };
  });

  const fogC = new THREE.Color(),
    warmC = new THREE.Color(),
    tintC = new THREE.Color(),
    sunC = new THREE.Color(),
    silhouette = new THREE.Color(0x2e2925);
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    one = new THREE.Vector3(1, 1, 1),
    v = new THREE.Vector3(),
    navOff = [new THREE.Vector3(0.62, 0.05, 0), new THREE.Vector3(-0.62, 0.05, 0)];

  // ── Phase 7: the sky frame's state ──
  let grounded = false;
  let revealT = 0;
  const dressing = [wisps, farMesh, nearMesh];
  const applyDressing = (): void => {
    const fade = grounded ? revealT : 1;
    fadeU.value = fade;
    for (const m of dressing) m.visible = fade > 0.001;
  };
  /** altitude h (WP4 fan-out; 0 until it lands) */
  const altitude = (): number => ctx.flight?.altitude ?? 0;

  const api: Sky = {
    setGrounded(on) {
      // idempotent: a repeated grounded call keeps a reveal that is running
      if (on === grounded) return applyDressing();
      grounded = on;
      // grounded: hidden until reveal(); airborne: rc4 (fully shown)
      revealT = on ? 0 : 1;
      applyDressing();
    },
    reveal(t01) {
      revealT = THREE.MathUtils.clamp(t01, 0, 1);
      applyDressing();
    },
    copterGeometry: () => shipGeo,
    dispatchDrone(to) {
      // the nearest rescue drone breaks formation and visits the rescue point
      let best = droneState[0],
        bd = Infinity;
      for (const d of droneState) {
        if (d.tower) continue;
        const dd = d.pos.distanceToSquared(to);
        if (dd < bd) {
          bd = dd;
          best = d;
        }
      }
      best.mission = { to: to.clone().add(new THREE.Vector3(0, 3.2, 0)), from: best.pos.clone(), t: 0 };
    },
    update(dt, t, cam, tiltQ) {
      tiltGroup.quaternion.copy(tiltQ);
      cargoGroup.quaternion.copy(tiltQ);
      // §5.3 rule 2b: during the lift-off the sky frame sits (570 − h) above its rc4 place, so the
      // platforms wait at their altitude while the world sinks; airborne (h = 570) the offset is 0
      const h = altitude();
      dress.position.y = grounded && revealT > 0 ? Math.max(0, ENV_TUNING.airborneAltitude - h) : 0;
      fogC.set(env.fogColor);
      for (const f of farMats) farCol[f.i].copy(silhouette).lerp(warmC.copy(fogC).multiply(tintC.setRGB(1 + 0.3 * f.warm, 1 + 0.06 * f.warm, 1 - 0.2 * f.warm)), f.k);
      farLightSync();
      (wispMat.uniforms.uColor.value as THREE.Color).set(env.cloudLight).multiply(sunC.set(env.sunColor)).lerp(fogC, 0.25);
      (wispMat.uniforms.uFog.value as THREE.Color).copy(fogC);
      // wisps drift around the rim
      for (let i = 0; i < WISPS; i++) {
        const s = wispState[i];
        s.b += (s.v * dt * 57.3) / s.r;
        const [x, z] = bearingDir(s.b);
        m4.makeTranslation(x * s.r, s.y + Math.sin(t * 0.05 + i) * 2, z * s.r);
        wisps.setMatrixAt(i, m4);
      }
      wisps.instanceMatrix.needsUpdate = true;
      bobs.forEach((b, i) => {
        const y = Math.sin(t * 0.12 + b.phase) * b.amp;
        if (i < 3) farBob[i] = y;
        else nearMesh.morphTargetInfluences![i - 3] = y;
      });
      ships.forEach((s, i) => {
        if (grounded) {
          // ground frame: a loop over the Revier, moving down with the ground (y − h) in the climb
          const g = groundShips[i];
          const a = g.a0 + t * g.w;
          const lx = Math.cos(a) * g.ax,
            lz = Math.sin(a) * g.az;
          v.set(g.cx + lx * g.c - lz * g.s, g.y + Math.sin(t * 0.2 + g.a0) * 1.5 - h, g.cz + lx * g.s + lz * g.c);
          // nose along the tangent (the mesh's +z)
          const sg = g.w > 0 ? 1 : -1;
          const tx = -Math.sin(a) * g.ax * sg,
            tz = Math.cos(a) * g.az * sg;
          q.setFromEuler(e.set(0, Math.atan2(tx * g.c - tz * g.s, tx * g.s + tz * g.c), Math.sin(t * 0.3 + g.a0) * 0.02));
          shipMesh.setMatrixAt(i, m4.compose(v, q, shipScale));
          return;
        }
        const a = s.a + t * s.w;
        v.set(Math.cos(a) * s.r, s.y + Math.sin(t * 0.2 + s.a) * 1.5, Math.sin(a) * s.r);
        // nose along the direction of travel
        q.setFromEuler(e.set(0, -a + (s.w > 0 ? 0 : Math.PI), Math.sin(t * 0.3 + s.a) * 0.02));
        shipMesh.setMatrixAt(i, m4.compose(v, q, shipScale));
      });
      shipMesh.instanceMatrix.needsUpdate = true;
      droneState.forEach((d, i) => {
        if (d.mission) {
          const m = d.mission;
          m.t += dt / 3.2;
          const k = Math.min(1, m.t);
          const s = k * k * (3 - 2 * k);
          d.pos.lerpVectors(m.from, m.to, s);
          d.pos.y += Math.sin(Math.PI * k) * 6;
          if (m.t > 2.6) {
            // fly back into formation
            d.mission = null;
          } else if (m.t > 1.6) d.pos.copy(m.to).y += (m.t - 1.6) * 8;
          e.set(0.08, -Math.atan2(m.to.x - m.from.x, -(m.to.z - m.from.z)), 0);
        } else {
          d.a += d.w * dt;
          const target = v.set(Math.cos(d.a) * d.r, (grounded ? d.yGround : d.y) + Math.sin(t * 0.4 + i) * (d.tower ? 1.2 : 3), Math.sin(d.a) * d.r);
          if (d.pos.lengthSq() === 0) d.pos.copy(target);
          else d.pos.lerp(target, 1 - Math.exp(-dt * 0.8));
          e.set(0.12, -d.a + (d.w > 0 ? -Math.PI / 2 : Math.PI / 2), Math.sin(t + i) * 0.05);
        }
        q.setFromEuler(e);
        drones.setMatrixAt(i, m4.compose(d.pos, q, one));
        for (let k = 0; k < 2; k++) droneNav.setMatrixAt(i * 2 + k, m4.compose(v.copy(navOff[k]).applyQuaternion(q).add(d.pos), q, one));
      });
      drones.instanceMatrix.needsUpdate = true;
      droneNav.instanceMatrix.needsUpdate = true;
      void noise3;
    },
  };

  // the island module applies the quest's flight state to the environment and the sky frame: grounded
  // (the default of a new save) the slab ceiling, ground fog and no cloud sea; airborne rc4. Applied
  // before the boot warm-up, so the env map is built once for the look the title shows (§5.7)
  const applyFlight = (state: 'ground' | 'airborne'): void => {
    ctx.env.setFlight(state === 'ground' ? FLIGHT_GROUND : FLIGHT_AIR);
    api.setGrounded(state === 'ground');
  };
  applyFlight(ctx.flight?.state ?? 'ground');
  ctx.flight?.onChange((st) => applyFlight(st));
  // tools (ending-check, liftoff-check): __academy.ext('sky')() → state; ('reveal', t) · ('grounded', 0|1)
  ctx.onDispose(
    registerDebugExt('sky', (cmd?: 'reveal' | 'grounded', v?: number) => {
      if (cmd === 'reveal') api.reveal(Number(v));
      else if (cmd === 'grounded') api.setGrounded(!!v);
      return { grounded, reveal: revealT, fade: fadeU.value, offsetY: dress.position.y, visible: Object.fromEntries(dressing.map((m) => [m.name, m.visible])) };
    }),
  );
  return api;
}

/**
 * Grounded transits of the two cargo copters (ground frame, m): a loop centred at (cx, cz) with half
 * axes ax / az, rotated by rotDeg, at y (under the slab base +330, over the Werft and the sites), ω rad/s.
 */
const GROUND_TRANSITS = [
  { cx: -70, cz: -60, ax: 640, az: 400, rotDeg: 22, y: 150, w: 0.0135, a0: 0.5 },
  { cx: 60, cz: 40, ax: 560, az: 340, rotDeg: -38, y: 205, w: -0.0155, a0: 3.4 },
] as const;

/**
 * A sister platform (another hexacopter works island): a flat ceramic deck with six lobes, a lower
 * fairing, a slim tower and six rotor ducts underneath (vertex colours; white for silhouettes).
 */
function platformGeometry(seed: number, scale: number, silhouette: boolean): THREE.BufferGeometry {
  const r = rng(seed);
  const R = 60 * scale;
  const parts: THREE.BufferGeometry[] = [];
  const c = (hex: number): number => (silhouette ? 0xffffff : hex);
  // deck: central disc + six lobes on the rim
  parts.push(paintT(new THREE.CylinderGeometry(R * 0.82, R * 0.8, R * 0.05, 36).translate(0, -R * 0.025, 0), c(0xc9c4bf)));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    parts.push(paintT(new THREE.CylinderGeometry(R * 0.24, R * 0.23, R * 0.05, 20).translate(Math.cos(a) * R * 0.86, -R * 0.025, Math.sin(a) * R * 0.86), c(0xc9c4bf)));
    // rotor duct under each lobe
    parts.push(paintT(new THREE.TorusGeometry(R * 0.16, R * 0.03, 6, 20).rotateX(Math.PI / 2).translate(Math.cos(a) * R * 0.92, -R * 0.12, Math.sin(a) * R * 0.92), c(0xd6d3d1)));
  }
  // lower fairing to a keel point
  parts.push(paintT(new THREE.CylinderGeometry(R * 0.8, R * 0.3, R * 0.16, 36).translate(0, -R * 0.13, 0), c(0xb4aea8)));
  parts.push(paintT(new THREE.ConeGeometry(R * 0.3, R * 0.55, 24).rotateX(Math.PI).translate(0, -R * 0.48, 0), c(0x8f8a84)));
  // slim tower with a halo, a few low buildings
  parts.push(paintT(new THREE.CylinderGeometry(R * 0.035, R * 0.05, R * 0.55, 10).translate(0, R * 0.275, 0), c(0xd6d3d1)));
  parts.push(paintT(new THREE.CylinderGeometry(R * 0.11, R * 0.08, R * 0.02, 16).translate(0, R * 0.5, 0), c(0xd6d3d1)));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + r() * 0.5;
    const w = R * (0.12 + r() * 0.08),
      h = R * (0.04 + r() * 0.05);
    parts.push(paintT(new THREE.BoxGeometry(w, h, w * (0.6 + r() * 0.5)).translate(Math.cos(a) * R * 0.45, h / 2, Math.sin(a) * R * 0.45), c(0x57534e)));
  }
  return merge(parts);
}
function paintT(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  tint(g, hex);
  return g.index ? g.toNonIndexed() : g;
}

/** Unbranded cargo multicopter: white body, six carbon arms (12 m span) with rotor ducts, an alu cargo pod. */
function copterGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paintT(new THREE.CylinderGeometry(1.6, 1.9, 1.2, 24), 0xe7e5e4));
  parts.push(paintT(new THREE.SphereGeometry(1.6, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(0, 0.6, 0), 0xe7e5e4));
  parts.push(paintT(new THREE.CylinderGeometry(1.92, 1.92, 0.22, 24).translate(0, -0.1, 0), 0x1c1917));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    parts.push(paintT(new THREE.BoxGeometry(4.4, 0.22, 0.3).translate(3.6, 0.2, 0).rotateY(a), 0x292524));
    parts.push(paintT(new THREE.TorusGeometry(1.35, 0.12, 6, 24).rotateX(Math.PI / 2).translate(6, 0.3, 0).rotateY(a), 0xd6d3d1));
    parts.push(paintT(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 10).translate(6, 0.3, 0).rotateY(a), 0x292524));
    parts.push(paintT(new THREE.BoxGeometry(2.4, 0.04, 0.18).translate(6, 0.42, 0).rotateY(a + k), 0x57534e));
  }
  // cargo pod under the body (alu container on a sling frame)
  parts.push(paintT(new THREE.BoxGeometry(2.4, 1.6, 3.6).translate(0, -2.4, 0), 0xb4aea8));
  for (const x of [-0.9, 0.9]) parts.push(paintT(new THREE.BoxGeometry(0.08, 1.0, 0.08).translate(x, -1.1, 0), 0x292524));
  return merge(parts);
}

/** Small rescue/inspection quadcopter (≈ 1.3 m): white shell body, carbon arms, ceramic ducts, a winch hook. */
function droneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paintT(new THREE.CylinderGeometry(0.26, 0.3, 0.2, 16).scale(1, 1, 1.3), 0xe7e5e4));
  parts.push(paintT(new THREE.SphereGeometry(0.1, 10, 6).translate(0, -0.08, -0.32), 0x0f0e0d));
  for (const [x, z] of [
    [0.55, 0.55],
    [-0.55, 0.55],
    [0.55, -0.55],
    [-0.55, -0.55],
  ]) {
    parts.push(paintT(new THREE.BoxGeometry(Math.abs(x) * 2 * 0.8, 0.05, 0.07).rotateY(Math.atan2(z, x)).translate(x / 2, 0.02, z / 2), 0x292524));
    parts.push(paintT(new THREE.TorusGeometry(0.28, 0.045, 6, 18).rotateX(Math.PI / 2).translate(x, 0.05, z), 0xd6d3d1));
  }
  parts.push(paintT(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4).translate(0, -0.35, 0), 0x57534e));
  return merge(parts);
}
