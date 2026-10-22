/**
 * „Am Laptop spielen“ until D3's share lands (WP-D0): a card with the line where the full game is played
 * (S.laptopNote), the link in readable form (the site's base URL, without ?discover) and „Kopieren“.
 * Game-free.
 */
import type { CardSpec, DiscoverUi, Sheet } from '../types';
import { S } from '../strings';

/** The link to share: the site root under BASE_PATH (e.g. https://…/academy-world/), never with ?discover. */
export function gameUrl(): string {
  return new URL(import.meta.env.BASE_URL, location.origin).href;
}

export function showLaptopCard(sheet: Sheet, ui: DiscoverUi): void {
  const url = gameUrl();
  const card: CardSpec = {
    id: 'laptop',
    title: S.playOnLaptop,
    blocks: [{ kind: 'p', text: S.laptopNote }, { kind: 'p', text: url }],
    actions: [
      {
        id: 'copy',
        primary: true,
        label: S.copy,
        onSelect: () => {
          const ok = (): void => {
            ui.toast(S.linkCopied);
            ui.announce(S.linkCopied);
          };
          try {
            void navigator.clipboard.writeText(url).then(ok, () => undefined);
          } catch {
            /* the link stays readable and selectable on the card */
          }
        },
      },
    ],
  };
  sheet.show(card, 'half');
}
