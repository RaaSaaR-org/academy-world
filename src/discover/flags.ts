/**
 * „Entdecken“ release switch (founder decision 1, 2026-10-22).
 *
 * false: touch-only phones see the „needs mouse and keyboard“ notice; Discover opens only with
 *        ?discover=1 (on any device, for testing).
 * true:  touch-only phones skip the notice and land in Discover. Flip it once the real-phone spike passes.
 *
 * This line is the only place to change: the vite.config.ts plugin „discover flag (WP-D0)“ writes the value
 * into the pre-boot gate of index.html at build (and dev) time, and tools/robust-check.mjs --only phone
 * reads it (the notice is checked while it is false).
 */
export const DISCOVER_DEFAULT_ON_TOUCH: boolean = false;
