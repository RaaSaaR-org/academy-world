/**
 * Share (WP-D3, plan §4 „Share“): the Web Share API; on a failure other than the user's cancel (or without
 * it) the clipboard and the toast „Link kopiert“; else a read-only, selectable URL field with „Kopieren“.
 * The link shows in readable form on the card in both fallbacks. It is the game's own address
 * (BASE_URL, e.g. https://…/academy-world/, never ?discover): stop and robot links wait until Discover is
 * public (plan §7 question 1). Game-free: the stills path shares through it too (./stills.ts).
 */
import type { CardAction, CardSpec, DiscoverUi, ShareWhat, Sheet, TextResolver } from '../types';
import { S } from '../strings';
import { el } from '../ui/el';
import { gameUrl } from '../ui/laptop';
import { F } from './strings';

export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'field';

export interface ShareDeps {
  text: TextResolver;
  ui: DiscoverUi;
  sheet: Sheet;
}

const CSS = `.dsc-url{display:grid;gap:6px}.dsc-url textarea{display:block;width:100%;min-height:48px;padding:12px;border-radius:8px;border:1px solid var(--border);background:var(--base);font-family:var(--font-mono);font-size:1rem;line-height:1.4;resize:none;overflow:hidden;word-break:break-all;-webkit-user-select:all;user-select:all}`;

/** The link a share sends (always the game for now; see the header). */
export function shareUrl(what: ShareWhat): string {
  void what;
  return gameUrl();
}

/** What navigator.share gets: the game's title, its own subtitle and its mouse-and-keyboard line, the link. */
export function shareData(t: TextResolver, what: ShareWhat): ShareData {
  return { title: t.resolve(F.shareTitle), text: `${t.resolve(F.subtitle)} ${t.resolve(S.laptopNote)}`, url: shareUrl(what) };
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** `back`: an extra action on the fallback card (the film's end card comes back with it). */
export async function share(d: ShareDeps, what: ShareWhat, o: { back?: CardAction } = {}): Promise<ShareResult> {
  const data = shareData(d.text, what);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
      // NotAllowedError, TypeError (a target that refuses the data), …: the clipboard
    }
  }
  const copied = await writeClipboard(data.url!);
  showCard(d, data.url!, o.back);
  if (copied) {
    d.ui.toast(S.linkCopied);
    d.ui.announce(S.linkCopied);
  }
  return copied ? 'copied' : 'field';
}

const relang = new WeakSet<ShareDeps>();

function showCard(d: ShareDeps, url: string, back?: CardAction): void {
  if (!document.getElementById('dsc-share-css')) document.head.append(el('style', { id: 'dsc-share-css' }, CSS));
  const card: CardSpec = {
    id: 'share',
    eyebrow: F.share,
    title: S.playOnLaptop,
    blocks: [{ kind: 'p', text: S.laptopNote }],
    actions: [{ id: 'copy', primary: true, label: S.copy, onSelect: () => void copyField(d, url) }, ...(back ? [back] : [])],
  };
  d.sheet.show(card, 'half');
  field(d, url);
  // the sheet renders the card again on a language change: the field comes back with it
  if (!relang.has(d)) {
    relang.add(d);
    d.text.onChange(() => {
      if (d.sheet.card?.id === 'share' && !d.sheet.el.querySelector('.dsc-url')) field(d, url);
    });
  }
}

/** The link as a read-only field above the actions: wrapped, never cut off; focus selects it all. */
function field(d: ShareDeps, url: string): void {
  const body = d.sheet.el.querySelector<HTMLElement>('.dsc-card');
  if (!body) return;
  const box = el('textarea', { readonly: true, rows: 1, 'aria-label': d.text.resolve(F.link), spellcheck: 'false', autocomplete: 'off', onfocus: (e: Event) => (e.target as HTMLTextAreaElement).select() });
  box.value = url;
  const wrap = el('label', { class: 'dsc-url' }, el('span', { class: 'eyebrow' }, d.text.resolve(F.link)), box);
  body.insertBefore(wrap, body.querySelector('.dsc-actions'));
  const fit = (): void => {
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight + 2}px`;
  };
  fit();
  requestAnimationFrame(fit);
}

async function copyField(d: ShareDeps, url: string): Promise<void> {
  let ok = await writeClipboard(url);
  const input = d.sheet.el.querySelector<HTMLTextAreaElement>('.dsc-url textarea');
  if (!ok && input) {
    input.focus();
    input.select();
    input.setSelectionRange(0, url.length);
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
  }
  // not copied: the link stays selected for the phone's own „Kopieren“
  if (ok) {
    d.ui.toast(S.linkCopied);
    d.ui.announce(S.linkCopied);
  }
}
