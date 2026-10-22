// Minimal type declarations for troika-three-text (the package ships no .d.ts).
declare module 'troika-three-text' {
  import type { Color, Material, Mesh } from 'three';

  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    fontWeight: number | 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    color: string | number | Color | null;
    anchorX: number | 'left' | 'center' | 'right' | string;
    anchorY: number | 'top' | 'top-baseline' | 'top-cap' | 'top-ex' | 'middle' | 'bottom-baseline' | 'bottom' | string;
    maxWidth: number;
    lineHeight: number | 'normal';
    letterSpacing: number;
    textAlign: 'left' | 'right' | 'center' | 'justify';
    whiteSpace: 'normal' | 'nowrap';
    overflowWrap: 'normal' | 'break-word';
    outlineWidth: number | string;
    outlineColor: string | number | Color;
    outlineOpacity: number;
    outlineBlur: number | string;
    fillOpacity: number;
    depthOffset: number;
    sdfGlyphSize: number | null;
    glyphGeometryDetail: number;
    curveRadius: number;
    material: Material;
    readonly textRenderInfo: {
      blockBounds: [number, number, number, number];
      visibleBounds: [number, number, number, number];
    } | null;
    sync(callback?: () => void): void;
    dispose(): void;
  }

  export function preloadFont(
    options: { font?: string; characters?: string | string[]; sdfGlyphSize?: number },
    callback: () => void,
  ): void;

  export function configureTextBuilder(config: {
    defaultFontURL?: string;
    /** base URL of the unicode-font-resolver data (fallback glyphs); default: a CDN */
    unicodeFontsURL?: string;
    sdfGlyphSize?: number;
    sdfMargin?: number;
    textureWidth?: number;
    useWorker?: boolean;
  }): void;
}
