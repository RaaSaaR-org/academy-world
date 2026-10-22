// Read the character map and the name table of a TTF / OTF / WOFF / WOFF2 font without a
// dependency (node:zlib inflates WOFF tables and decompresses the WOFF2 Brotli stream).
//   readFont(buffer) → { flavor, cmap: Set<codepoint>, names: { [nameId]: string }, tables: [tag…] }
import zlib from 'node:zlib';

const WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

/** { tag: Buffer } of the tables we need (cmap, name, plus the tag list). */
function tablesOf(buf, want = ['cmap', 'name']) {
  const sig = buf.toString('latin1', 0, 4);
  const out = {};
  const tags = [];
  if (sig === 'wOFF') {
    const n = buf.readUInt16BE(12);
    for (let i = 0; i < n; i++) {
      const o = 44 + i * 20;
      const tag = buf.toString('latin1', o, o + 4);
      tags.push(tag);
      if (!want.includes(tag)) continue;
      const off = buf.readUInt32BE(o + 4);
      const comp = buf.readUInt32BE(o + 8);
      const orig = buf.readUInt32BE(o + 12);
      const data = buf.subarray(off, off + comp);
      out[tag] = comp < orig ? zlib.inflateSync(data) : data;
    }
    return { flavor: 'woff', out, tags };
  }
  if (sig === 'wOF2') {
    const n = buf.readUInt16BE(12);
    const totalCompressed = buf.readUInt32BE(20);
    let p = 48;
    const base128 = () => {
      let v = 0;
      for (let i = 0; i < 5; i++) {
        const b = buf[p++];
        v = v * 128 + (b & 0x7f);
        if (!(b & 0x80)) return v;
      }
      throw new Error('bad UIntBase128');
    };
    const dir = [];
    for (let i = 0; i < n; i++) {
      const flags = buf[p++];
      let tag;
      if ((flags & 0x3f) === 63) {
        tag = buf.toString('latin1', p, p + 4);
        p += 4;
      } else tag = WOFF2_TAGS[flags & 0x3f];
      const version = flags >> 6;
      const origLength = base128();
      const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
      const length = transformed ? base128() : origLength;
      dir.push({ tag, length });
      tags.push(tag);
    }
    if (buf.toString('latin1', 4, 8) === 'ttcf') throw new Error('WOFF2 collections are not supported');
    const stream = zlib.brotliDecompressSync(buf.subarray(p, p + totalCompressed));
    let off = 0;
    for (const t of dir) {
      if (want.includes(t.tag)) out[t.tag] = stream.subarray(off, off + t.length);
      off += t.length;
    }
    return { flavor: 'woff2', out, tags };
  }
  // plain sfnt (TTF / OTF)
  const n = buf.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    const tag = buf.toString('latin1', o, o + 4);
    tags.push(tag);
    if (want.includes(tag)) out[tag] = buf.subarray(buf.readUInt32BE(o + 8), buf.readUInt32BE(o + 8) + buf.readUInt32BE(o + 12));
  }
  return { flavor: sig === 'OTTO' ? 'otf' : 'ttf', out, tags };
}

function parseCmap(t) {
  const set = new Set();
  if (!t) return set;
  const n = t.readUInt16BE(2);
  const subs = [];
  for (let i = 0; i < n; i++) subs.push({ pid: t.readUInt16BE(4 + i * 8), eid: t.readUInt16BE(6 + i * 8), off: t.readUInt32BE(8 + i * 8) });
  const rank = (s) => {
    const f = t.readUInt16BE(s.off);
    if (f === 12 && (s.pid === 3 || s.pid === 0)) return 0;
    if (f === 4 && (s.pid === 3 || s.pid === 0)) return 1;
    return 9;
  };
  subs.sort((a, b) => rank(a) - rank(b));
  const s = subs[0];
  if (!s || rank(s) === 9) return set;
  const f = t.readUInt16BE(s.off);
  if (f === 12) {
    const groups = t.readUInt32BE(s.off + 12);
    for (let g = 0; g < groups; g++) {
      const o = s.off + 16 + g * 12;
      const start = t.readUInt32BE(o);
      const end = t.readUInt32BE(o + 4);
      const glyph = t.readUInt32BE(o + 8);
      for (let c = start; c <= end; c++) if (glyph + (c - start) !== 0) set.add(c);
    }
  } else {
    const segX2 = t.readUInt16BE(s.off + 6);
    const ends = s.off + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let i = 0; i < segX2 / 2; i++) {
      const end = t.readUInt16BE(ends + i * 2);
      const start = t.readUInt16BE(starts + i * 2);
      const delta = t.readInt16BE(deltas + i * 2);
      const ro = t.readUInt16BE(ranges + i * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g;
        if (ro === 0) g = (c + delta) & 0xffff;
        else {
          const gi = ranges + i * 2 + ro + (c - start) * 2;
          g = t.readUInt16BE(gi);
          if (g !== 0) g = (g + delta) & 0xffff;
        }
        if (g !== 0) set.add(c);
      }
    }
  }
  return set;
}

function parseNames(t) {
  const names = {};
  if (!t) return names;
  const count = t.readUInt16BE(2);
  const strOff = t.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 12;
    const pid = t.readUInt16BE(o);
    const id = t.readUInt16BE(o + 6);
    const len = t.readUInt16BE(o + 8);
    const off = t.readUInt16BE(o + 10);
    const raw = t.subarray(strOff + off, strOff + off + len);
    let s;
    if (pid === 3 || pid === 0) {
      s = '';
      for (let k = 0; k + 1 < raw.length; k += 2) s += String.fromCharCode(raw.readUInt16BE(k));
    } else s = raw.toString('latin1');
    if (names[id] === undefined || pid === 3) names[id] = s;
  }
  return names;
}

export function readFont(buf) {
  const { flavor, out, tags } = tablesOf(buf);
  return { flavor, cmap: parseCmap(out.cmap), names: parseNames(out.name), tables: tags };
}
