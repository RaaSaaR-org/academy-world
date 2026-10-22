/**
 * Screen-door fade for opaque meshes that must appear without a blending (= a second, transparent)
 * program: `if (emaiDitherCut(uFade)) discard;`. The threshold pattern is fixed per pixel
 * (interleaved gradient noise), so as uFade rises every pixel switches on once and stays on: no
 * flicker (flash-safe), and the program never changes (no link during the lift-off).
 */
export const DITHER_FADE_GLSL = /* glsl */ `
bool emaiDitherCut(float fade) {
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  return n >= fade;
}
`;
