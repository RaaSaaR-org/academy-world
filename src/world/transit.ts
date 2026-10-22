import * as THREE from 'three';
import type { Text, TriggerHandle, ZoneContext } from '@/core/zones';
import { GROUND_HOP, GROUND_PADS, KANZEL_PADS, PADS, ZONE_PLOTS, hopNumbers, polar, type ZonePlotInfo } from './layout';
import { paint } from './landscape/batch';
import { merge } from './util';
import { HOP } from './start/tuning';
import { START } from './start/strings';

/** QA-13: landing overshoot past the target pad (m). */
export const PAD_OVERSHOOT = 2.5;
/** Landing point of a hop from the pad at `kind` on `bearing` (world, y 0). */
export function padLanding(bearing: number, kind: 'hub' | 'zone'): [number, number, number] {
  return kind === 'hub' ? polar(bearing, PADS.zoneRadius + PAD_OVERSHOOT) : polar(bearing, PADS.hubRadius - PAD_OVERSHOOT);
}

/**
 * Sprungplatten (§4.6, §6.4): 6 hub pads (r 27) and 6 zone pads (r 52), paired by
 * bearing. Phase 7 (WP12, plan §2.4): four Kanzel pads (r 85, the stub ends at 60/120/240/300) and
 * their ground pads in the Revier (r 150), hops both ways in T = 3.0 s (d 65 m, apex 11 m); armed
 * once the Revier is open, dark while it is closed and when airborne („Kein Boden unter uns.“). Standing on a pad shows a teal dotted parabola (40 instanced dots) and the
 * hop numbers; E launches a ballistic hop of T = 2.5 s (Appendix B) along the exact path.
 * QA-13: you land 2.5 m PAST the target pad (toward the gate, or toward the tower on the way
 * back) and a pad arms only when you walk onto it, so a reflexive jump or E after landing never
 * flings you back. Space no longer launches. Reduced motion: a short fade teleport instead.
 * The hub pad leading to the current objective wears an orange ring.
 */
export interface Transit {
  setObjective(zoneId: string | null): void;
  /** WP12: the Revier is open and the island docked: the Kanzel and ground pads are armed */
  setRegion(open: boolean, o?: { airborne?: boolean }): void;
  /** the Kanzel and ground pads are armed (tools) */
  readonly regionArmed: boolean;
  update(dt: number, t: number): void;
}

interface Pad {
  /** the lobe a hub/zone pad serves (null for the Kanzel and ground pads) */
  zone: ZonePlotInfo | null;
  kind: 'hub' | 'zone' | 'kanzel' | 'ground';
  bearing: number;
  pos: THREE.Vector3;
  dest: THREE.Vector3;
  /** flight time (s): 2.5 on the island, 3.0 between a Kanzel and the ground */
  T: number;
  index: number;
}

export interface TransitDeps {
  /** the ground area a Kanzel pad leads to (the pad's bearing), for the label and the objective ring */
  siteAt(bearing: number): { id: string; name: { de: string; en: string } } | null;
  /** the ground frame's root (the ground pads ride on it), or null before the ground exists */
  groundRoot(): THREE.Object3D | null;
  /** terrain height at h = 0 (the ground pads' landing) */
  heightAt(x: number, z: number): number;
}

export function buildTransit(ctx: ZoneContext, deps: TransitDeps): Transit {
  const M = ctx.materials;
  const pads: Pad[] = [];
  ZONE_PLOTS.forEach((z) => {
    const h = new THREE.Vector3(...polar(z.bearing, PADS.hubRadius));
    const o = new THREE.Vector3(...polar(z.bearing, PADS.zoneRadius));
    pads.push({ zone: z, kind: 'hub', bearing: z.bearing, pos: h, dest: new THREE.Vector3(...padLanding(z.bearing, 'hub')), T: PADS.flightTime, index: pads.length });
    pads.push({ zone: z, kind: 'zone', bearing: z.bearing, pos: o, dest: new THREE.Vector3(...padLanding(z.bearing, 'zone')), T: PADS.flightTime, index: pads.length });
  });
  // the Kanzel ↔ ground pairs (§2.3): land 2.5 m past the target pad (QA-13), outward or back toward the island
  const islandPads = pads.length;
  KANZEL_PADS.forEach((k) => {
    const g = GROUND_PADS.find((q) => q.bearing === k.bearing)!;
    const r0 = Math.hypot(k.position[0], k.position[2]),
      r1 = Math.hypot(g.position[0], g.position[2]);
    const out = polar(k.bearing, r1 + PAD_OVERSHOOT);
    pads.push({ zone: null, kind: 'kanzel', bearing: k.bearing, pos: new THREE.Vector3(...k.position), dest: new THREE.Vector3(out[0], deps.heightAt(out[0], out[2]), out[2]), T: HOP.kanzelFlight, index: pads.length });
    const back = polar(k.bearing, r0 - PAD_OVERSHOOT);
    pads.push({ zone: null, kind: 'ground', bearing: k.bearing, pos: new THREE.Vector3(g.position[0], deps.heightAt(g.position[0], g.position[2]), g.position[2]), dest: new THREE.Vector3(...back), T: HOP.kanzelFlight, index: pads.length });
  });
  void GROUND_HOP;
  let regionOpen = false;
  let airborne = false;
  const armed = (p: Pad): boolean => p.kind === 'hub' || p.kind === 'zone' || (regionOpen && !airborne);

  // ── visuals ──────────────────────────────────────────────────────────────
  const R = PADS.diameter / 2;
  // carbon pad with a chamfered alu rim and an alu centre boss (one instanced mesh, vertex colours)
  const discGeo = merge([
    paint(new THREE.CylinderGeometry(R - 0.08, R + 0.05, 0.08, 48).translate(0, 0.04, 0), 0x1c1917),
    paint(new THREE.TorusGeometry(R - 0.04, 0.045, 6, 64).rotateX(Math.PI / 2).translate(0, 0.07, 0), 0xc9c4bf),
    paint(new THREE.CylinderGeometry(0.3, 0.34, 0.03, 24).translate(0, 0.095, 0), 0xc9c4bf),
  ]);
  // the island's pads (hub, zone, Kanzel) are one instanced pair; the four ground pads ride on the ground root
  const onIsland = pads.filter((p) => p.kind !== 'ground');
  const onGround = pads.filter((p) => p.kind === 'ground');
  const discMat = M.standard({ vertexColors: true, roughness: 0.62, metalness: 0.3 });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
  ctx.onDispose(() => ringMat.dispose());
  const discs = new THREE.InstancedMesh(discGeo, discMat, onIsland.length);
  const ringGeo = new THREE.RingGeometry(R - 0.3, R - 0.16, 64, 1).rotateX(-Math.PI / 2).translate(0, 0.085, 0);
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, onIsland.length);
  const gDiscs = new THREE.InstancedMesh(discGeo, discMat, onGround.length);
  const gRings = new THREE.InstancedMesh(ringGeo, ringMat, onGround.length);
  gDiscs.name = 'transit:ground-pads';
  gRings.name = 'transit:ground-pad-rings';
  const m4 = new THREE.Matrix4();
  onIsland.forEach((p, i) => {
    m4.makeTranslation(p.pos.x, 0, p.pos.z);
    discs.setMatrixAt(i, m4);
    rings.setMatrixAt(i, m4);
  });
  onGround.forEach((p, i) => {
    m4.makeTranslation(p.pos.x, p.pos.y, p.pos.z);
    gDiscs.setMatrixAt(i, m4);
    gRings.setMatrixAt(i, m4);
  });
  for (const im of [discs, rings]) {
    im.computeBoundingSphere();
    ctx.root.add(im);
  }
  for (const im of [gDiscs, gRings]) im.computeBoundingSphere();
  // the ground pads live in the ground frame (§2.1): parented to the ground root once it exists
  const groundPads = new THREE.Group();
  groundPads.name = 'transit:ground';
  groundPads.add(gDiscs, gRings);
  const placeGroundPads = (): void => {
    const g = deps.groundRoot();
    const parent = g ?? ctx.root;
    if (groundPads.parent !== parent) parent.add(groundPads);
  };
  placeGroundPads();
  discs.receiveShadow = true;
  gDiscs.receiveShadow = true;
  // light tiers (ART-V2 §2.4): teal ring T0 by day → T1 at dusk; the objective's ring orange T1
  const TEAL = new THREE.Color(0x2dd4bf),
    ORANGE = new THREE.Color(0xff6700);
  const teal = new THREE.Color(),
    orange = new THREE.Color(),
    dark = new THREE.Color(0x2a2725);
  let objective: string | null = null;
  /** the Kanzel pad whose site is the objective */
  const objectivePad = (p: Pad): boolean => (p.kind === 'hub' && p.zone?.id === objective) || (p.kind === 'kanzel' && !!objective && deps.siteAt(p.bearing)?.id === objective);
  const paintRings = (): void => {
    teal.copy(TEAL).multiplyScalar(M.tierScale(TEAL, 'line'));
    orange.copy(ORANGE).multiplyScalar(M.tierScale(ORANGE, 'T1'));
    const col = (p: Pad): THREE.Color => (!armed(p) ? dark : objectivePad(p) ? orange : teal);
    onIsland.forEach((p, i) => rings.setColorAt(i, col(p)));
    onGround.forEach((p, i) => gRings.setColorAt(i, col(p)));
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    if (gRings.instanceColor) gRings.instanceColor.needsUpdate = true;
  };
  paintRings();
  ctx.onDispose(M.onDusk(paintRings));

  // W5 (UX-11): while the player is on the plaza, the objective's hub pad also wears a raised, thicker
  // orange ring and a vertical light beacon (a shape cue that stays distinct under deuteranopia and
  // protanopia, where the orange and teal rings drift toward the same olive/grey). Steady, never blinking.
  const beacon = new THREE.Group();
  beacon.name = 'transit:objective-beacon';
  beacon.visible = false;
  const haloTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  })();
  const BEACON_H = 11;
  const coreMat = M.light(0xff6700, 'line').clone();
  coreMat.transparent = true;
  coreMat.alphaMap = haloTex;
  coreMat.depthWrite = false;
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xff6700, alphaMap: haloTex, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  haloMat.userData.noEnrich = true;
  coreMat.userData.noEnrich = true;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, BEACON_H, 12, 1, true).translate(0, BEACON_H / 2 + 0.1, 0), coreMat);
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, BEACON_H, 20, 1, true).translate(0, BEACON_H / 2 + 0.1, 0), haloMat);
  halo.renderOrder = 2;
  core.renderOrder = 2;
  // the raised ring: a torus standing 0.14 m proud of the pad, twice as thick as the teal ones
  const raised = new THREE.Mesh(new THREE.TorusGeometry(R - 0.23, 0.07, 8, 64).rotateX(Math.PI / 2).translate(0, 0.17, 0), M.light(0xff6700, 'line'));
  const beam = new THREE.Group();
  beam.add(core, halo);
  beacon.add(beam, raised);
  ctx.root.add(beacon);
  ctx.onDispose(() => {
    for (const m of [core, halo, raised]) m.geometry.dispose();
    coreMat.dispose();
    haloMat.dispose();
    haloTex.dispose();
  });
  const placeBeacon = (): void => {
    const p = objective ? pads.find((q) => (q.kind === 'hub' || q.kind === 'kanzel') && objectivePad(q)) : undefined;
    if (p) beacon.position.set(p.pos.x, 0, p.pos.z);
    beacon.userData.pad = p ?? null;
  };

  // trajectory preview: 40 dots on the arc, plus its ground track (dashes) and the landing ring.
  // Seen from straight behind the arc collapses into a vertical column of dots, so the arc fades
  // with the view angle (full from the side, gone along the hop) while the track on the deck and
  // the ring where you land always read correctly.
  const DOTS = 40;
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), M.light(0x2dd4bf, 'T1'), DOTS);
  dots.frustumCulled = false;
  dots.visible = false;
  ctx.root.add(dots);
  const DASHES = 40;
  const trackMat = M.light(0x2dd4bf, 'T1').clone();
  trackMat.polygonOffset = true;
  trackMat.polygonOffsetFactor = -4;
  trackMat.polygonOffsetUnits = -8;
  ctx.onDispose(() => trackMat.dispose());
  const track = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.42).rotateX(-Math.PI / 2), trackMat, DASHES);
  track.frustumCulled = false;
  track.visible = false;
  ctx.root.add(track);
  const target = new THREE.Mesh(
    merge([new THREE.RingGeometry(0.78, 0.9, 48).rotateX(-Math.PI / 2), new THREE.RingGeometry(0.22, 0.3, 32).rotateX(-Math.PI / 2)]),
    trackMat,
  );
  target.visible = false;
  ctx.root.add(target);
  const fwd = new THREE.Vector3(),
    scl = new THREE.Vector3(),
    qI = new THREE.Quaternion(),
    qY = new THREE.Quaternion(),
    UP = new THREE.Vector3(0, 1, 0),
    pos = new THREE.Vector3();

  // ── behaviour ────────────────────────────────────────────────────────────
  let active: Pad | null = null;
  let flying = false;
  let clearHint: (() => void) | null = null;
  const g = PADS.gravity;

  const destName = (p: Pad): { de: string; en: string } => {
    if (p.kind === 'hub') return p.zone!.name;
    if (p.kind === 'zone') return { de: 'Akademie (Plaza)', en: 'Academy (plaza)' };
    if (p.kind === 'ground') return { de: `${START.padToKanzel.de} ${p.bearing}`, en: `${START.padToKanzel.en} ${p.bearing}` };
    const site = deps.siteAt(p.bearing);
    return site ? { de: `${START.padToGround.de} · ${site.name.de}`, en: `${START.padToGround.en} · ${site.name.en}` } : START.padToGround;
  };
  const label = (p: Pad): Text => {
    const T = p.T;
    const d = Math.hypot(p.dest.x - p.pos.x, p.dest.z - p.pos.z);
    const n = hopNumbers(d, p.dest.y - p.pos.y, T);
    const dest = destName(p);
    return (lang, mode) => {
      if (!armed(p)) return lang === 'de' ? (airborne ? START.padAir.de : START.padDark.de) : airborne ? START.padAir.en : START.padDark.en;
      const to = dest[lang];
      const num = (v: number, k = 1): string => (lang === 'de' ? v.toFixed(k).replace('.', ',') : v.toFixed(k));
      // W5: a hub pad that leads somewhere else names the objective
      const obj = p.kind === 'hub' && objective && objective !== p.zone?.id ? ZONE_PLOTS.find((z) => z.id === objective) : undefined;
      const note = obj ? (lang === 'de' ? ` · dein Ziel: ${obj.name.de}` : ` · your objective: ${obj.name.en}`) : '';
      const head = (lang === 'de' ? `[E] Springen → ${to}` : `[E] Jump → ${to}`) + note;
      if (mode === 'entscheider') return head;
      // QA-23: non-breaking spaces keep every number with its unit
      const u = (v: string, unit: string): string => `${v}\u00a0${unit}`;
      return lang === 'de'
        ? `${head}   ·   FLUGZEIT\u00a0${u(num(T), 's')} · SCHEITEL\u00a0${u(num(n.apex), 'm')} · v₀\u00a0${u(num(n.v0), 'm/s')} · g\u00a0=\u00a0${u(num(g, 2), 'm/s²')}`
        : `${head}   ·   FLIGHT\u00a0${u(num(T), 's')} · APEX\u00a0${u(num(n.apex), 'm')} · v₀\u00a0${u(num(n.v0), 'm/s')} · g\u00a0=\u00a0${u(num(g, 2), 'm/s²')}`;
    };
  };

  const showPreview = (p: Pad): void => {
    if (!armed(p)) return hidePreview();
    const T = p.T;
    const from = ctx.player.position;
    const d = p.dest.clone().sub(from);
    const dist = Math.hypot(d.x, d.z);
    const vh = dist / T,
      vy = (d.y + 0.5 * g * T * T) / T;
    const dir = new THREE.Vector3(d.x, 0, d.z).normalize();
    // side factor: |sin| of the angle between the view and the hop direction (horizontal)
    ctx.camera.getWorldDirection(fwd);
    fwd.y = 0;
    const side = fwd.lengthSq() > 1e-6 ? Math.abs(fwd.normalize().x * dir.z - fwd.z * dir.x) : 1;
    const vis = THREE.MathUtils.smoothstep(side, 0.22, 0.55);
    let k = 0;
    for (let i = 0; i < DOTS && vis > 0.02; i++) {
      const t = ((i + 1) / (DOTS + 1)) * T;
      const hx = vh * t;
      // the first metres would sit in the player's face: start where the arc is readable
      const y = from.y + 0.9 + vy * t - 0.5 * g * t * t;
      if (hx < 3.2 && y < 4.5) continue;
      m4.compose(pos.set(from.x + dir.x * hx, y, from.z + dir.z * hx), qI, scl.setScalar(vis));
      dots.setMatrixAt(k++, m4);
    }
    dots.count = k;
    dots.instanceMatrix.needsUpdate = true;
    dots.visible = k > 0;
    // ground track: dashes every 0.9 m from the pad rim to the landing ring, along the hop
    const q = qY.setFromAxisAngle(UP, Math.atan2(dir.x, dir.z));
    let n = 0;
    for (let s = R + 0.5; s < dist - 1.1 && n < DASHES; s += 0.9) {
      m4.compose(pos.set(from.x + dir.x * s, from.y + (d.y * s) / Math.max(1, dist) + 0.075, from.z + dir.z * s), q, scl.setScalar(1));
      track.setMatrixAt(n++, m4);
    }
    track.count = n;
    track.instanceMatrix.needsUpdate = true;
    track.visible = true;
    target.position.set(p.dest.x, p.dest.y + 0.075, p.dest.z);
    target.visible = true;
  };
  const hidePreview = (): void => {
    dots.visible = false;
    track.visible = false;
    target.visible = false;
  };

  /** is there ground to land on at the far pad? (a Kanzel hop needs the Revier's colliders) */
  const landable = (p: Pad): boolean => p.kind !== 'kanzel' || !!ctx.physics.raycast([p.dest.x, p.dest.y + 3, p.dest.z], [0, -1, 0], 8);
  const launch = (): void => {
    const p = active;
    if (!p || flying || ctx.player.operating || ctx.hud.modalOpen) return;
    if (!armed(p) || !landable(p)) {
      ctx.audio.play('error', { volume: 0.5 });
      ctx.hud.toast(airborne || !landable(p) ? START.padAir : START.padDark, { kind: 'info', duration: 3 });
      return;
    }
    const T = p.T;
    flying = true;
    clearHint?.();
    clearHint = null;
    hidePreview();
    ctx.audio.tone({ freq: 196, to: 523, dur: 0.32, type: 'triangle', volume: 0.9 });
    const unlock = ctx.player.lockControls();
    const finish = (): void => {
      ctx.after(0.25, () => {
        unlock();
        flying = false;
        // QA-13: never auto-arm a pad after a landing; a pad arms only when the player walks onto it
      });
    };
    if (ctx.settings.reducedMotion) {
      ctx.player.teleport([p.dest.x, 0, p.dest.z], { fade: true });
      ctx.after(0.5, finish);
      return;
    }
    const from = ctx.player.position;
    const d = p.dest.clone().sub(from);
    const dist = Math.hypot(d.x, d.z);
    const vh = dist / T,
      vy = (p.dest.y - from.y + 0.5 * g * T * T) / T;
    ctx.audio.play('whoosh', { volume: 0.9 });
    void ctx.player.launch([(d.x / dist) * vh, vy, (d.z / dist) * vh], { gravity: g }).then(() => {
      ctx.player.shake(0.06, 0.12);
      finish();
    });
    // safety: never stay locked
    ctx.after(T + 2, () => {
      if (flying) finish();
    });
  };

  const enterPad = (p: Pad): void => {
    active = p;
    clearHint?.();
    clearHint = ctx.ui.hint(label(p), 0);
    showPreview(p);
    ctx.audio.beep(660, 0.05, { volume: 0.5 });
  };
  const padTriggers = new Map<Pad, TriggerHandle>();
  for (const p of pads) {
    const trig = ctx.physics.addTrigger({
      shape: 'cylinder',
      radius: R - 0.1,
      height: 2.2,
      position: [p.pos.x, p.pos.y + 1.1, p.pos.z],
      onEnter: () => {
        if (flying || active === p) return;
        enterPad(p);
      },
      onExit: () => {
        if (active === p) {
          active = null;
          clearHint?.();
          clearHint = null;
          hidePreview();
        }
      },
    });
    padTriggers.set(p, trig);
  }
  ctx.input.onKey('KeyE', () => launch(), { anywhere: true });
  void islandPads;

  return {
    get regionArmed() {
      return regionOpen && !airborne;
    },
    setRegion(open, o = {}) {
      regionOpen = open;
      airborne = !!o.airborne;
      // the ground pads are not drawn while the island flies (the Revier is far below, §2.6)
      groundPads.visible = !airborne;
      placeGroundPads();
      paintRings();
      if (active && !flying) {
        clearHint?.();
        clearHint = ctx.ui.hint(label(active), 0);
        showPreview(active);
      }
    },
    setObjective(zoneId) {
      objective = zoneId;
      paintRings();
      placeBeacon();
      // the hint of the pad you stand on may name the old objective
      if (active && !flying) {
        clearHint?.();
        clearHint = ctx.ui.hint(label(active), 0);
      }
    },
    update() {
      if (active && !flying) showPreview(active);
      // the beacon only while on the plaza (it would clutter the zone views and the aerials), and not
      // from up close: on the pad the ring, the arc and the hint take over (inside the beam it is a wall)
      const pl = ctx.player.position;
      const near = Math.hypot(pl.x - beacon.position.x, pl.z - beacon.position.z) < 5;
      const bp = beacon.userData.pad as Pad | null;
      // a hub pad's beacon on the plaza; a Kanzel pad's from its stub and the ring path (§2.4)
      const zoneOk = bp?.kind === 'kanzel' ? Math.hypot(pl.x - bp.pos.x, pl.z - bp.pos.z) < 48 && armed(bp) : Math.hypot(pl.x, pl.z) < PADS.hubRadius + 9;
      const on = !!bp && !flying && zoneOk && pl.y > -2 && pl.y < 6;
      if (beacon.visible !== on) beacon.visible = on;
      if (beam.visible === near) beam.visible = !near;
    },
  };
}
