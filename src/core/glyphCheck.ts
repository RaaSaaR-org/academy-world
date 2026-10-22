/**
 * Dev only (Text3DFactory imports it behind `import.meta.env.DEV`): warns when a 3D label has a
 * character that its WOFF font lacks and that has no self-hosted fallback in
 * public/fonts/unicode-resolver/. troika would fetch the fallback from a third-party CDN in
 * production (C1). Reads the font's cmap (WOFF 1.0, zlib tables via DecompressionStream).
 */

/** Unicode ranges whose fallback font is self-hosted (see public/fonts/unicode-resolver/README.md). */
const HOSTED: [number, number][] = [[0x0370, 0x03ff]];

const coverage = new Map<string, Promise<Set<number> | null>>();
const warned = new Set<string>();

export function checkGlyphs(fontUrl: string, text: string, owner: string): void {
  let p = coverage.get(fontUrl);
  if (!p) coverage.set(fontUrl, (p = loadCoverage(fontUrl).catch(() => null)));
  void p.then((cmap) => {
    if (!cmap) return;
    for (const ch of new Set(text)) {
      const cp = ch.codePointAt(0)!;
      if (cp < 0x21 || cmap.has(cp) || /\s/.test(ch) || HOSTED.some(([a, b]) => cp >= a && cp <= b)) continue;
      const key = `${fontUrl}|${cp}`;
      if (warned.has(key)) continue;
      warned.add(key);
      const font = fontUrl.split('/').pop()?.split('?')[0];
      console.warn(`[text3d] "${ch}" (U+${cp.toString(16).toUpperCase().padStart(4, '0')}) is not in ${font} and has no self-hosted fallback: in production troika would fetch a font from a CDN (public/fonts/unicode-resolver/README.md). ${owner}: "${text.slice(0, 60)}"`);
    }
  });
}

async function loadCoverage(url: string): Promise<Set<number>> {
  const buf = new DataView(await (await fetch(url)).arrayBuffer());
  if (buf.getUint32(0) !== 0x774f4646) throw new Error('not a WOFF 1.0 file');
  const numTables = buf.getUint16(12);
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    if (buf.getUint32(e) !== 0x636d6170) continue; // 'cmap'
    const off = buf.getUint32(e + 4);
    const comp = buf.getUint32(e + 8);
    const orig = buf.getUint32(e + 12);
    let raw = new Uint8Array(buf.buffer, buf.byteOffset + off, comp);
    if (comp < orig) raw = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    return parseCmap(new DataView(raw.buffer, raw.byteOffset, raw.byteLength));
  }
  throw new Error('no cmap');
}

function parseCmap(d: DataView): Set<number> {
  const out = new Set<number>();
  const n = d.getUint16(2);
  let best = -1;
  let bestRank = -1;
  for (let i = 0; i < n; i++) {
    const pid = d.getUint16(4 + i * 8);
    const eid = d.getUint16(6 + i * 8);
    const off = d.getUint32(8 + i * 8);
    const fmt = d.getUint16(off);
    const rank = fmt === 12 ? 2 : fmt === 4 && (pid === 0 || (pid === 3 && eid === 1)) ? 1 : -1;
    if (rank > bestRank) (best = off), (bestRank = rank);
  }
  if (best < 0) return out;
  if (d.getUint16(best) === 12) {
    const groups = d.getUint32(best + 12);
    for (let g = 0; g < groups; g++) {
      const s = d.getUint32(best + 16 + g * 12);
      const e = d.getUint32(best + 20 + g * 12);
      for (let c = s; c <= e && c - s < 0x10000; c++) out.add(c);
    }
    return out;
  }
  const segX2 = d.getUint16(best + 6);
  const seg = segX2 / 2;
  const ends = best + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let s = 0; s < seg; s++) {
    const end = d.getUint16(ends + s * 2);
    const start = d.getUint16(starts + s * 2);
    const delta = d.getInt16(deltas + s * 2);
    const ro = d.getUint16(ranges + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let gid: number;
      if (ro === 0) gid = (c + delta) & 0xffff;
      else {
        gid = d.getUint16(ranges + s * 2 + ro + (c - start) * 2);
        if (gid) gid = (gid + delta) & 0xffff;
      }
      if (gid) out.add(c);
    }
  }
  return out;
}
