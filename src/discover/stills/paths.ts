/**
 * Where the stills live (WP-D0; D1 renders them): public/discover/stills/<stop>-720.webp and
 * <stop>-1280.webp (≤ 120 KB each), served under BASE_PATH. Game-free.
 */
import { publicUrl } from '../ui/el';

export const STILL_WIDTHS = [720, 1280] as const;

export function stillUrl(stop: string, width: (typeof STILL_WIDTHS)[number]): string {
  return publicUrl(`discover/stills/${encodeURIComponent(stop)}-${width}.webp`);
}

export function stillSrcset(stop: string): string {
  return STILL_WIDTHS.map((w) => `${stillUrl(stop, w)} ${w}w`).join(', ');
}

/** The placeholder while a still is missing: the brand gradient, the mark's rings and the stop's name. */
export function placeholderSvg(label: string): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 720 1280');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.innerHTML =
    '<defs><radialGradient id="dsc-ph" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#2a2420"/><stop offset="0.6" stop-color="#171615"/><stop offset="1" stop-color="#121212"/></radialGradient>' +
    '<linearGradient id="dsc-hz" x1="0" x2="1"><stop offset="0" stop-color="#ff6700"/><stop offset="1" stop-color="#2dd4bf"/></linearGradient></defs>' +
    '<rect width="720" height="1280" fill="url(#dsc-ph)"/>' +
    '<g fill="none" stroke="#ff6700" stroke-opacity="0.22" stroke-width="2">' +
    [60, 120, 180, 240, 300].map((r) => `<circle cx="360" cy="470" r="${r}"/>`).join('') +
    '</g><rect x="160" y="700" width="400" height="2" fill="url(#dsc-hz)" opacity="0.8"/>';
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', '360');
  text.setAttribute('y', '770');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('fill', '#a8a29e');
  text.setAttribute('font-family', 'Geist Mono, ui-monospace, monospace');
  text.setAttribute('font-size', '30');
  text.setAttribute('letter-spacing', '4');
  text.textContent = label.toUpperCase();
  svg.appendChild(text);
  return svg;
}
