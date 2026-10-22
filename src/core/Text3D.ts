import * as THREE from 'three';
import { Text as TroikaText, configureTextBuilder, preloadFont } from 'troika-three-text';
import type { I18n } from '@/i18n/I18n';
import type { Text } from './types';
import { toVec3 } from './types';
import type { MaterialLibrary } from './brand/materials';
import { canvasTexture } from './brand/textures';
import type { SignOptions, Text3DOptions } from './zones/types';

// troika parses TTF/OTF/WOFF but not WOFF2, so the 3D text gets lossless WOFF copies (same glyph
// sets: a missing glyph would make troika fetch a fallback font from a CDN). Hashed by Vite.
import displayFont from '@/ui/fonts/SpaceGrotesk-Bold.woff?url';
import displayMediumFont from '@/ui/fonts/SpaceGrotesk-Medium.woff?url';
import sansFont from '@/ui/fonts/Geist-Regular.woff?url';
import sansSemiboldFont from '@/ui/fonts/Geist-SemiBold.woff?url';
import monoFont from '@/ui/fonts/GeistMono-Regular.woff?url';
import monoMediumFont from '@/ui/fonts/GeistMono-Medium.woff?url';

// C1: troika looks up a fallback font for every glyph its font lacks (σ on the Sensordom sign …). Its
// default source is a third-party CDN; the files the game needs are self-hosted instead
// (public/fonts/unicode-resolver/README.md). Absolute URL: the lookup runs in a worker. Must run before
// the first text is built, so it sits at module level.
configureTextBuilder({ unicodeFontsURL: new URL(`${import.meta.env.BASE_URL}fonts/unicode-resolver`, window.location.href).href });

export const FONT_FILES = {
  display: displayFont,
  'display-medium': displayMediumFont,
  sans: sansFont,
  'sans-semibold': sansSemiboldFont,
  mono: monoFont,
  'mono-medium': monoMediumFont,
} as const;

interface Item {
  mesh: TroikaText;
  text: Text;
  uppercase: boolean;
  billboard: boolean;
  owner: string;
  onSync?: () => void;
}

const _cam = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** troika SDF text (brand fonts) with language refresh, billboards and branded signs. */
export class Text3DFactory {
  private items = new Set<Item>();
  private hairlineMat: THREE.MeshBasicMaterial | null = null;

  constructor(
    private i18n: I18n,
    private materials: MaterialLibrary,
  ) {
    i18n.onChange(() => {
      for (const it of this.items) this.applyText(it);
    });
  }

  /** Warm the font cache (call during loading). */
  preload(): Promise<void> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜabcdefghijklmnopqrstuvwxyzäöüß0123456789·.,:;-–—/%°()[]+=→←↑↓ ';
    const fonts = Object.values(FONT_FILES);
    return Promise.race([
      Promise.all(fonts.map((f) => new Promise<void>((res) => preloadFont({ font: f, characters: chars }, () => res())))).then(() => undefined),
      new Promise<void>((res) => window.setTimeout(res, 6000)),
    ]);
  }

  create(owner: string, o: Text3DOptions, parent: THREE.Object3D | null): TroikaText {
    const t = new TroikaText();
    t.font = FONT_FILES[o.font ?? 'sans'];
    t.fontSize = o.size ?? 0.25;
    t.anchorX = o.anchorX ?? 'center';
    t.anchorY = o.anchorY ?? 'middle';
    t.textAlign = o.textAlign ?? 'left';
    if (o.maxWidth) t.maxWidth = o.maxWidth;
    t.letterSpacing = o.letterSpacing ?? (o.font?.startsWith('display') ? -0.02 : 0);
    if (o.lineHeight) t.lineHeight = o.lineHeight;
    const c = new THREE.Color(o.color ?? 0xf5f5f4);
    if (o.glow) c.multiplyScalar(o.glow);
    t.color = c;
    if (o.position) {
      const p = toVec3(o.position);
      t.position.set(p.x, p.y, p.z);
    }
    if (o.rotationY) t.rotation.y = o.rotationY;
    t.castShadow = false;
    t.receiveShadow = false;
    t.userData.noCollide = true; // labels never become collider geometry
    t.userData.noHighlight = true;
    const it: Item = { mesh: t, text: o.text, uppercase: !!o.uppercase, billboard: !!o.billboard, owner };
    this.items.add(it);
    this.applyText(it);
    if (parent) parent.add(t);
    return t;
  }

  private applyText(it: Item): void {
    let s = this.i18n.resolve(it.text);
    if (it.uppercase) s = s.toUpperCase();
    it.mesh.text = s;
    it.mesh.sync(() => it.onSync?.());
    // dev: a glyph the font lacks and that has no self-hosted fallback would be fetched from the CDN
    if (import.meta.env.DEV && /[^\x20-\x7e]/.test(s)) void import('./glyphCheck').then((m) => m.checkGlyphs(String(it.mesh.font), s, it.owner));
  }

  /** Change the text of a mesh created by create() (keeps language binding). */
  setText(mesh: TroikaText, text: Text): void {
    for (const it of this.items)
      if (it.mesh === mesh) {
        it.text = text;
        this.applyText(it);
      }
  }

  private gradientMaterial(): THREE.MeshBasicMaterial {
    if (!this.hairlineMat) {
      const tex = canvasTexture(256, 4, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, w, 0);
        grd.addColorStop(0, '#FF6700');
        grd.addColorStop(1, '#2DD4BF');
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
      });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      this.hairlineMat = new THREE.MeshBasicMaterial({ map: tex });
      this.hairlineMat.name = 'core:sign-hairline';
    }
    return this.hairlineMat;
  }

  /**
   * Branded sign. Origin = bottom centre of the panel (with `stand`: ground point, the
   * panel then starts at 0.9 m). Panel height adapts to the text after layout.
   */
  sign(owner: string, o: SignOptions, parent: THREE.Object3D | null): THREE.Group {
    const W = o.width ?? 2.4;
    const pad = W * 0.06;
    const depth = Math.max(0.04, W * 0.025);
    const base = o.stand ? 0.9 : 0;
    const g = new THREE.Group();
    g.name = 'sign';
    if (o.position) {
      const p = toVec3(o.position);
      g.position.set(p.x, p.y, p.z);
    }
    if (o.rotationY) g.rotation.y = o.rotationY;

    const panelGeo = new THREE.BoxGeometry(W, 1, depth);
    panelGeo.translate(0, 0.5, 0);
    const panel = new THREE.Mesh(panelGeo, this.materials.panel);
    panel.position.y = base;
    panel.castShadow = true;
    panel.receiveShadow = true;
    g.add(panel);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(W, Math.max(0.008, W * 0.004)), this.gradientMaterial());
    g.add(line);

    const z = depth / 2 + 0.004;
    const eyebrow = o.eyebrow
      ? this.create(owner, { text: o.eyebrow, font: 'mono-medium', size: W / 36, color: 0xff6700, glow: 1.25, uppercase: true, letterSpacing: 0.12, anchorX: 'left', anchorY: 'top', maxWidth: W - 2 * pad }, g)
      : null;
    const title = this.create(owner, { text: o.title, font: 'display', size: o.titleSize ?? W / 12, color: 0xf5f5f4, anchorX: 'left', anchorY: 'top', maxWidth: W - 2 * pad, lineHeight: 1.1 }, g);
    const body = o.body ? this.create(owner, { text: o.body, font: 'sans', size: W / 28, color: 0xa8a29e, anchorX: 'left', anchorY: 'top', maxWidth: W - 2 * pad, lineHeight: 1.45 }, g) : null;
    const texts = [eyebrow, title, body].filter((x): x is TroikaText => !!x);

    const layout = (): void => {
      const gap = W * 0.025;
      let hgt = 0;
      const heights = texts.map((t) => {
        const b = t.textRenderInfo?.blockBounds;
        return b ? b[3] - b[1] : t.fontSize * 1.2;
      });
      hgt = heights.reduce((a, b) => a + b, 0) + gap * (texts.length - 1);
      const H = hgt + pad * 2;
      panel.scale.y = H;
      line.position.set(0, base + H - 0.002, z);
      let y = base + H - pad;
      texts.forEach((t, i) => {
        t.position.set(-W / 2 + pad, y, z);
        y -= heights[i] + gap;
      });
    };
    for (const t of texts) {
      const it = [...this.items].find((x) => x.mesh === t);
      if (it) it.onSync = layout;
    }
    layout();

    if (o.stand) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, base, 12), this.materials.metalDark);
      post.position.set(0, base / 2, -depth / 2 - 0.04);
      post.castShadow = true;
      g.add(post);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.05, 24), this.materials.metalDark);
      foot.position.set(0, 0.025, -depth / 2 - 0.04);
      foot.receiveShadow = true;
      g.add(foot);
    }
    if (parent) parent.add(g);
    return g;
  }

  removeOwner(owner: string): void {
    for (const it of [...this.items]) {
      if (it.owner !== owner) continue;
      it.mesh.removeFromParent();
      it.mesh.dispose();
      this.items.delete(it);
    }
  }

  update(camera: THREE.Camera): void {
    camera.getWorldPosition(_cam);
    for (const it of this.items) {
      if (!it.billboard || !it.mesh.parent) continue;
      it.mesh.getWorldPosition(_p);
      const yaw = Math.atan2(_cam.x - _p.x, _cam.z - _p.z);
      // compensate parent world yaw
      const parentQ = it.mesh.parent.getWorldQuaternion(_q);
      const parentYaw = _e.setFromQuaternion(parentQ, 'YXZ').y;
      it.mesh.rotation.y = yaw - parentYaw;
    }
  }
}
