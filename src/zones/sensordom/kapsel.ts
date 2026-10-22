/**
 * Sensorkapsel of the Sensordom (FUN-PLAN S4): a visor discovery.
 *
 * A black velvet cloth lies in the dark corner beside the Samtkiste, at the shelf's end. In RGB it is
 * a black heap on a dark floor (contrast ≈ 1 %, like the box); the depth camera gets no echo from
 * it. LiDAR and SEG see it, exactly like the Samtkiste (labor.ts MATRIX). When the crosshair finds
 * the cloth in LIDAR or SEG (≤ 9 m), or the player walks right up to it in any view (≤ 1.4 m), the
 * cloth slips off and the capsule underneath lights up. Until then the capsule waits inside the
 * deck slab under the cloth (the deck is 4 m thick), so RGB never gives it away and EMI-01's
 * radio hint still points at the right corner.
 */
import * as THREE from 'three';
import type { Sd } from './types';
import { G_SOLID } from './lidar';
import type { VisorMode } from './visor';
import { own } from './materials';
import { popupAnchor, shelfPt } from './labor';

export const KAPSEL_ID = 'sensordom.kapsel';
/** the cloth: past the shelf's right end, 1.5 m behind the Samtkiste (zone-local) */
const AT = shelfPt(1.75, 0, -0.9);
/** debug viewpoint: the open floor to the front right, the Samtkiste off to the side */
const VIEW = shelfPt(2.9, 0, 2.2);
const CLOTH_R = 0.44;
const CLOTH_H = 0.5;
const REVEAL_NEAR = 1.4;
const REVEAL_FAR = 9;

export interface Kapsel {
  /** the probe saw the cloth (mode = current visor mode, distance in m) */
  probed(target: string | undefined, mode: VisorMode, distance: number): void;
  /** every frame (player feet, zone-local) */
  update(dt: number, feet: THREE.Vector3): void;
  /** debug: reveal as if the LiDAR had found it */
  reveal(): void;
  /** a spot 3.6 m away that looks at the cloth (debug teleport) */
  readonly viewpoint: { pos: [number, number, number]; yawDeg: number };
  readonly center: THREE.Vector3;
}

/** a draped velvet cloth: a lathe with a rounded top, a flared hem and soft folds */
function clothGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 = hem, 1 = top
    const y = CLOTH_H * Math.sin((t * Math.PI) / 2) ** 0.85;
    const r = CLOTH_R * (1 - t) ** 0.62 * (1 + 0.12 * (1 - t) ** 3);
    pts.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  pts.push(new THREE.Vector2(0, CLOTH_H));
  const g = new THREE.LatheGeometry(pts, 48);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const a = Math.atan2(z, x);
    const low = 1 - y / CLOTH_H;
    // folds grow toward the hem; one side sags a little (it was thrown over, not placed)
    const fold = 1 + low * low * (0.1 * Math.sin(7 * a + 0.6) + 0.05 * Math.sin(13 * a)) + 0.05 * low * Math.cos(a);
    p.setX(i, x * fold);
    p.setZ(i, z * fold);
    p.setY(i, y * (1 - 0.08 * Math.max(0, Math.cos(a - 0.8)) * (1 - low)));
  }
  g.computeVertexNormals();
  return g;
}

export function buildKapsel(sd: Sd): Kapsel {
  const { ctx, visor, lidar } = sd;
  const G = ctx.game;
  const center = new THREE.Vector3(AT[0], 0, AT[2]);
  const found = (): boolean => G.collectibles.has(KAPSEL_ID);

  // velvet: the Samtkiste's black, with a faint sheen so the folds catch the lamp at arm's length
  const velvet = own(new THREE.MeshPhysicalMaterial({ color: 0x060606, roughness: 1, metalness: 0, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x24211f), name: 'sensordom:kapsel-cloth' }));
  const cloth = new THREE.Mesh(own(clothGeometry()), velvet);
  cloth.position.copy(center);
  cloth.rotation.y = 0.7;
  cloth.receiveShadow = true;
  ctx.groups.detail.add(cloth);
  // like the Samtkiste: SEG labels it, the depth camera gets no echo, LiDAR returns points
  visor.register(cloth, { seg: 'kiste', depth: 'none', lidar: 'occlude' });

  let revealed = found();
  let collapse = revealed ? 1 : 0;
  const applyCollapse = (k: number): void => {
    // the cloth slides down into a flat puddle around the capsule
    const e = k * k * (3 - 2 * k);
    cloth.scale.set(1 + 0.45 * e, 1 - 0.93 * e, 1 + 0.45 * e);
  };
  applyCollapse(collapse);

  let body = revealed ? null : ctx.physics.addStaticBox({ size: [CLOTH_R * 1.5, CLOTH_H, CLOTH_R * 1.5], position: [center.x, CLOTH_H / 2, center.z], rotation: [0, 0.7, 0], surface: 'rubber' });
  let ray = revealed ? null : lidar.addBox([CLOTH_R * 1.6, CLOTH_H * 0.9, CLOTH_R * 1.6], [center.x, CLOTH_H * 0.45, center.z], [0, 0.7, 0], G_SOLID, { seg: 'kiste', depth: 'none', contrast: 1, target: 'kapsel' });

  // the capsule waits inside the deck slab until the cloth is gone (never visible, never picked up by accident)
  const HIDDEN: [number, number, number] = [center.x, -1.6, center.z];
  const SHOWN: [number, number, number] = [center.x, 0.48, center.z];
  if (!found()) G.collectibles.place({ id: KAPSEL_ID, position: revealed ? SHOWN : HIDDEN, radius: revealed ? 0.9 : 0.4 });

  const doReveal = (how: VisorMode | 'near'): void => {
    if (revealed || found()) return;
    revealed = true;
    body?.remove();
    body = null;
    if (ray) {
      lidar.world.removeCollider(ray, false);
      ray = null;
    }
    lidar.addBox([CLOTH_R * 2.4, 0.05, CLOTH_R * 2.4], [center.x, 0.025, center.z], null, G_SOLID, { seg: 'kiste', depth: 'none', contrast: 1 });
    G.collectibles.place({ id: KAPSEL_ID, position: SHOWN, radius: 0.9 });
    const top = center.clone().setY(0.55);
    G.juice.burst(top, { tone: 'teal', count: 36, spread: 0.45 });
    lidar.splash(top, 0.22, 140, ctx.time.elapsed);
    G.juice.cue('good', { at: top, pitch: 1.12 });
    const via = how === 'near' ? null : ctx.t(`mode.${how}`);
    G.juice.popup(popupAnchor(ctx, top), () => (via ? ctx.t('kapsel.popVia', { m: via }) : ctx.t('kapsel.pop')), { tone: 'teal', seconds: 2.6 });
    ctx.after(0.9, () => sd.say(how === 'near' ? 'kapsel.emiNear' : how === 'seg' ? 'kapsel.emiSeg' : 'kapsel.emi'));
  };

  const vp = new THREE.Vector3(VIEW[0], 0, VIEW[2]);
  const yawDeg = THREE.MathUtils.radToDeg(Math.atan2(-(center.x - vp.x), -(center.z - vp.z)));

  return {
    center,
    viewpoint: { pos: [vp.x, 0, vp.z], yawDeg },
    probed(target, mode, distance) {
      if (target === 'kapsel' && (mode === 'lidar' || mode === 'seg') && distance <= REVEAL_FAR && sd.region() === 'dome') doReveal(mode);
    },
    update(dt, feet) {
      if (!revealed && sd.region() === 'dome' && Math.hypot(feet.x - center.x, feet.z - center.z) <= REVEAL_NEAR) doReveal('near');
      if (revealed && collapse < 1) {
        collapse = Math.min(1, collapse + dt / 0.55);
        applyCollapse(collapse);
      }
    },
    reveal() {
      doReveal('lidar');
    },
  };
}
