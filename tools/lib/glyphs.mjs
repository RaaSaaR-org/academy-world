// Which characters can the game show? Shared by tools/glyph-check.mjs and tools/subset-fonts.mjs.
//
// sourceChars() reads every string the code can put on screen: string and template literals in
// src/**/*.ts (comments and regular expressions skipped, escapes decoded, so 'σ' counts as σ),
// quoted strings in src/**/*.css (content: '→' …) and the text, attributes and inline scripts of
// index.html. KEEP_RANGES is what the font subsets keep in any case (plan B2).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './shotlib.mjs';

/** Unicode ranges every subset keeps, whether the code uses them today or not. */
export const KEEP_RANGES = [
  [0x20, 0x7e], // Basic Latin
  [0xa0, 0xff], // Latin-1 Supplement (ä ö ü ß é ° ± ² ³ µ · × ÷ « » …)
  [0x100, 0x17f], // Latin Extended-A (Polish, Czech, Turkish … names on a certificate)
  [0x2010, 0x2027], // dashes, quotes „“ ‚‘ ’ ” •, … (typographic punctuation)
  [0x2030, 0x203a], // ‰ ′ ″ ‹ ›
  [0x2070, 0x2079], // superscripts ⁰ ⁴…⁹
  [0x2080, 0x2089], // subscripts ₀…₉
  [0x20ac, 0x20ac], // €
  [0x2190, 0x2195], // ← ↑ → ↓ ↔ ↕
  [0x2212, 0x2212], // − (minus)
  [0x2248, 0x2248], // ≈
  [0x2260, 0x2265], // ≠ ≤ ≥
];

const inKeep = (cp) => KEEP_RANGES.some(([a, b]) => cp >= a && cp <= b);
export { inKeep };

function walk(dir, exts) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'fonts' || e.name === 'node_modules') continue;
      out.push(...walk(p, exts));
    } else if (exts.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}

const decodeEscape = (src, i) => {
  // src[i] === '\\'; returns [text, nextIndex]
  const c = src[i + 1];
  if (c === 'u') {
    if (src[i + 2] === '{') {
      const j = src.indexOf('}', i + 3);
      return [String.fromCodePoint(parseInt(src.slice(i + 3, j), 16)), j + 1];
    }
    return [String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)), i + 6];
  }
  if (c === 'x') return [String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16)), i + 4];
  const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
  if (c === '\n') return ['', i + 2];
  return [map[c] ?? c, i + 2];
};

const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);

/** String and template literal contents of a JS/TS source (comments and regex literals skipped). */
export function jsStrings(src) {
  const out = [];
  let i = 0;
  let prev = ''; // last significant token kind: 'word' | 'num' | ')' | ']' | '}' | 'op'
  let lastWord = '';
  const braceStack = []; // for template ${ … } nesting: 'tpl' marks a template expression brace
  const readString = (q) => {
    let s = '';
    i++;
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') {
        const [t, n] = decodeEscape(src, i);
        s += t;
        i = n;
      } else s += src[i++];
    }
    i++;
    return s;
  };
  // returns when the template ends (`) — pushes text chunks
  const readTemplate = () => {
    let s = '';
    i++;
    while (i < src.length) {
      const c = src[i];
      if (c === '`') {
        i++;
        out.push(s);
        return;
      }
      if (c === '\\') {
        const [t, n] = decodeEscape(src, i);
        s += t;
        i = n;
        continue;
      }
      if (c === '$' && src[i + 1] === '{') {
        out.push(s);
        s = '';
        i += 2;
        braceStack.push('tpl');
        code(true);
        continue;
      }
      s += c;
      i++;
    }
    out.push(s);
  };
  const code = (inTemplateExpr) => {
    while (i < src.length) {
      const c = src[i];
      const n = src[i + 1];
      if (c === '/' && n === '/') {
        const e = src.indexOf('\n', i);
        i = e < 0 ? src.length : e;
        continue;
      }
      if (c === '/' && n === '*') {
        const e = src.indexOf('*/', i + 2);
        i = e < 0 ? src.length : e + 2;
        continue;
      }
      if (c === "'" || c === '"') {
        out.push(readString(c));
        prev = 'str';
        continue;
      }
      if (c === '`') {
        readTemplate();
        prev = 'str';
        continue;
      }
      if (c === '/') {
        const isRegex = !(prev === 'word' || prev === 'num' || prev === ')' || prev === ']' || prev === '}' || prev === 'str') || (prev === 'word' && REGEX_AFTER_WORD.has(lastWord));
        if (isRegex) {
          i++;
          let cls = false;
          while (i < src.length) {
            const d = src[i];
            if (d === '\\') {
              i += 2;
              continue;
            }
            if (d === '[') cls = true;
            else if (d === ']') cls = false;
            else if (d === '/' && !cls) break;
            else if (d === '\n') break;
            i++;
          }
          i++;
          while (/[a-z]/i.test(src[i] ?? '')) i++;
          prev = 'str';
          continue;
        }
        prev = 'op';
        i++;
        continue;
      }
      if (c === '{') {
        braceStack.push('code');
        prev = 'op';
        i++;
        continue;
      }
      if (c === '}') {
        const top = braceStack.pop();
        i++;
        if (top === 'tpl' && inTemplateExpr) return;
        prev = '}';
        continue;
      }
      if (/[A-Za-z_$À-￿]/.test(c)) {
        let j = i;
        while (j < src.length && /[\w$À-￿]/.test(src[j])) j++;
        lastWord = src.slice(i, j);
        prev = 'word';
        i = j;
        continue;
      }
      if (/[0-9]/.test(c)) {
        while (i < src.length && /[\w.]/.test(src[i])) i++;
        prev = 'num';
        continue;
      }
      if (c === ')' || c === ']') prev = c;
      else if (!/\s/.test(c)) prev = 'op';
      i++;
    }
  };
  code(false);
  return out;
}

/** Quoted strings in CSS (content: '…', font names …), comments skipped. */
export function cssStrings(src) {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /(["'])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(s))) out.push(m[2].replace(/\\([0-9a-f]{1,6})\s?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1'));
  return out;
}

/** Text, attribute values and inline-script strings of an HTML file. */
export function htmlStrings(src) {
  const out = [];
  const scripts = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const sc of scripts) out.push(...jsStrings(sc));
  const styles = [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  for (const st of styles) out.push(...cssStrings(st));
  const rest = src.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  for (const m of rest.matchAll(/\b(?:title|alt|aria-label|content|placeholder)="([^"]*)"/gi)) out.push(m[1]);
  out.push(rest.replace(/<[^>]+>/g, ' ').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'));
  return out;
}

/** Map<char, Set<relative file>> of every character the code can show (whitespace excluded). */
export function sourceChars() {
  const chars = new Map();
  const add = (file, strings) => {
    const rel = path.relative(ROOT, file);
    for (const s of strings)
      for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0) || /\s/.test(ch) && ch !== ' ' && ch !== ' ') continue;
        if (cp === 0xfe0f || cp === 0xfe0e || cp === 0x200d) continue; // variation selectors, ZWJ
        if (!chars.has(ch)) chars.set(ch, new Set());
        chars.get(ch).add(rel);
      }
  };
  const src = path.join(ROOT, 'src');
  for (const f of walk(src, ['.ts'])) add(f, jsStrings(fs.readFileSync(f, 'utf8')));
  for (const f of walk(src, ['.css'])) add(f, cssStrings(fs.readFileSync(f, 'utf8')));
  const html = path.join(ROOT, 'index.html');
  if (fs.existsSync(html)) add(html, htmlStrings(fs.readFileSync(html, 'utf8')));
  return chars;
}

export const hex = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
