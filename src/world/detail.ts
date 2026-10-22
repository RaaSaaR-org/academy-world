import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { staticMerger } from './statics';

/**
 * Detail culling (W1): label texts are not drawn while their glyphs are smaller than ~0.3 px on
 * screen (they would only add a draw call and a few pixels of sub-pixel shimmer). The check uses the
 * full device resolution (innerHeight × devicePixelRatio), runs ten times a second and is switched
 * off for the static-merge A/B reference (`?mergeab`).
 */
interface Item {
  o: THREE.Object3D;
  /** feature size in metres (text: cap height) */
  size: number;
}

const REG = new WeakMap<THREE.Object3D, Item[]>();
const _p = new THREE.Vector3();
const _c = new THREE.Vector3();
/** below this many device pixels a glyph is not drawn */
const MIN_PX = 0.3;

/** Hide `text` (a troika label of font size `fontSize` m) while its glyphs are under ~0.3 px tall. */
export function cullTinyText<T extends THREE.Object3D & { fontSize?: number }>(ctx: Pick<ZoneContext, 'root' | 'camera' | 'every' | 'materials' | 'debug'>, text: T, fontSize = text.fontSize ?? 0.25): T {
  let list = REG.get(ctx.root);
  if (!list) {
    const items: Item[] = [];
    list = items;
    REG.set(ctx.root, items);
    const merger = staticMerger(ctx);
    const tick = (): void => {
      const cam = ctx.camera as THREE.PerspectiveCamera;
      _c.setFromMatrixPosition(cam.matrixWorld);
      const h = (typeof innerHeight === 'number' ? innerHeight : 1080) * (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
      const ppm = h / 2 / Math.tan(THREE.MathUtils.degToRad((cam.fov ?? 60) / 2));
      for (const it of items) {
        _p.setFromMatrixPosition(it.o.matrixWorld);
        const d = Math.max(1e-3, _p.distanceTo(_c));
        it.o.visible = merger.reference || (it.size * ppm) / d >= MIN_PX;
      }
    };
    ctx.every(0.1, tick);
    merger.onReference(tick);
  }
  list.push({ o: text, size: 0.7 * fontSize });
  return text;
}
