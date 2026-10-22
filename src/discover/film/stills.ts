/** The stills path shares too (WP-D3): the same share chain, Game-free (./share.ts). */
import type { StillsHandle } from '../types';
import { share } from './share';

export default function install(h: StillsHandle): void {
  h.share = (what) => share(h, what).then(() => undefined);
}
