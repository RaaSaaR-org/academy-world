/** Shared primitive types used across engine and zones. */

export type Lang = 'de' | 'en';
export type Mode = 'entdecker' | 'entscheider';
export type QualityLevel = 'low' | 'medium' | 'high';
export type QualitySetting = QualityLevel | 'auto';

/** Anything with x/y/z — THREE.Vector3, Rapier vectors and plain objects all work. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export type Vec3Tuple = [number, number, number];
export type Vec3Input = Vec3Like | Vec3Tuple;

export function toVec3(v: Vec3Input | undefined, fallback: Vec3Like = { x: 0, y: 0, z: 0 }): Vec3Like {
  if (!v) return { x: fallback.x, y: fallback.y, z: fallback.z };
  if (Array.isArray(v)) return { x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0 };
  return { x: v.x, y: v.y, z: v.z };
}

/**
 * A string value in a string table may differ per audience mode — only where the CONTENT
 * differs; both modes say "du" (docs/DECISIONS.md D1).
 * `{ entdecker: 'Probier es aus …', entscheider: 'Für die Planung zählt …' }`
 */
export type ModeString = string | { entdecker: string; entscheider: string };

/**
 * Localisable text accepted by every HUD / label / sign API.
 * - plain `string` → shown as-is (use for language-neutral text such as numbers or units)
 * - `{ de, en }`   → picked by current language (each value may itself be mode-dependent)
 * - `{ key, params }` → looked up in the string tables (`i18n.registerStrings`)
 * - function      → called with (lang, mode) every time the text is (re-)rendered
 */
export type Text =
  | string
  | { de: ModeString; en?: ModeString }
  | { key: string; params?: Record<string, string | number> }
  | ((lang: Lang, mode: Mode) => string);
