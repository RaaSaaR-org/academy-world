import * as THREE from 'three';
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** URL relative to the deployment base (works under a sub-path). */
export function assetUrl(path: string): string {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const base = import.meta.env.BASE_URL || '/';
  return base.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
}

/**
 * Cached loaders. Models are returned as deep clones; the cache keeps the original.
 * C13 (PL-12): GLTFLoader and SkeletonUtils load on the first model request, not with the boot.
 */
export class Assets {
  private loader: Promise<GLTFLoader> | null = null;
  private gltfs = new Map<string, Promise<GLTF>>();
  private textures = new Map<string, Promise<THREE.Texture>>();
  private texLoader = new THREE.TextureLoader();

  loadGLTF(url: string): Promise<GLTF> {
    const u = assetUrl(url);
    let p = this.gltfs.get(u);
    if (!p) {
      this.loader ??= import('three/examples/jsm/loaders/GLTFLoader.js').then((m) => new m.GLTFLoader());
      const loader = this.loader;
      p = loader.then((l) => l.loadAsync(u));
      loader.catch(() => (this.loader = null));
      this.gltfs.set(u, p);
      p.catch(() => this.gltfs.delete(u));
    }
    return p;
  }

  async loadModel(url: string, o: { castShadow?: boolean; receiveShadow?: boolean } = {}): Promise<THREE.Group> {
    const gltf = await this.loadGLTF(url);
    let skinned = false;
    gltf.scene.traverse((n) => {
      if ((n as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
    });
    const obj = (skinned ? (await import('three/examples/jsm/utils/SkeletonUtils.js')).clone(gltf.scene) : gltf.scene.clone(true)) as THREE.Group;
    obj.traverse((n) => {
      const m = n as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = o.castShadow ?? true;
      m.receiveShadow = o.receiveShadow ?? true;
    });
    return obj;
  }

  loadTexture(url: string): Promise<THREE.Texture> {
    const u = assetUrl(url);
    let p = this.textures.get(u);
    if (!p) {
      p = this.texLoader.loadAsync(u).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        return t;
      });
      this.textures.set(u, p);
    }
    return p;
  }
}
