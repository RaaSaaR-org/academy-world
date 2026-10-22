/**
 * Release switches: what a build ships, decided once at build time (Vite env, so `vite.config.ts` reads
 * the same variable).
 *
 * SHOW_AMBER: the amber exhibits of docs/LEGAL-REVIEW.md item 2, Boston Dynamics Spot (and „Spot mit
 * Arm“), MiR250, KUKA LBR iiwa 14 and Robotiq 2F-85. Their licences are permissive, but the licensor is
 * not the vendor, and the legal review is open. Off unless the build sets VITE_AMBER=1:
 *   - src/robots/manifest.ts leaves them out of ROBOTS and uses the line-up without them;
 *   - the Schauhalle has no plinth, card, price band, Vorführung or Lastenheft job of theirs;
 *   - the credits page and THIRD-PARTY-NOTICES.txt do not list them (tools/notices-plugin.mjs);
 *   - vite.config.ts („amber gate“) keeps their GLBs and the full line-up mesh out of dist/.
 * After legal clearance, `VITE_AMBER=1 npm run build` brings all of it back. The source GLBs and their
 * LICENSES/robots/ texts stay in the repository either way.
 */
export const SHOW_AMBER: boolean = import.meta.env.VITE_AMBER === '1';
