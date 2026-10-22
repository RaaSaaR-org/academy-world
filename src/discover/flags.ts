/**
 * „Entdecken“ release switch (founder decision 1, 2026-10-22; turned on by the founder on 2026-10-23).
 *
 * true:  touch-only phones skip the „needs mouse and keyboard“ notice and land in Discover; Discover tells
 *        them the full game is played on a laptop or desktop (strings.ts S.laptopNote). The founder turned
 *        it on before the real-phone test: docs/RELEASE.md §7c stays as a check, not as the gate.
 * false: touch-only phones see the notice; Discover opens only with ?discover=1 (on any device, for
 *        testing). The fallback if the real-phone test fails and the phone tier or the stills tour cannot fix it.
 *
 * This line is the only place to change: the vite.config.ts plugin „discover flag (WP-D0)“ writes the value
 * into the pre-boot gate of index.html at build (and dev) time, and tools/robust-check.mjs --only phone and
 * tools/discover/gate.mjs read it (the notice is checked while it is false, the landing in Discover while
 * it is true).
 */
export const DISCOVER_DEFAULT_ON_TOUCH: boolean = true;
