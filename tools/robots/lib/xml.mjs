// A small ordered XML tree for URDF, xacro, MJCF and COLLADA. Downloads are untrusted data: the
// text is parsed, never evaluated. fast-xml-parser's preserveOrder output is turned into plain
// { tag, attrs, children, text } elements so the readers can walk them in document order (the
// order matters for COLLADA transforms, MJCF joints and xacro blocks).
import fs from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  commentPropName: false,
  // the files are large CAD exports; entity expansion stays at the five predefined entities
  processEntities: true,
  htmlEntities: false,
});

/** @typedef {{ tag: string, attrs: Record<string, string>, children: El[], text: string }} El */

function convert(nodes) {
  const out = [];
  for (const n of nodes) {
    const keys = Object.keys(n).filter((k) => k !== ':@');
    for (const k of keys) {
      if (k === '#text') continue;
      if (k.startsWith('?')) continue; // <?xml ...?>
      const kids = Array.isArray(n[k]) ? n[k] : [];
      const el = { tag: k, attrs: { ...(n[':@'] ?? {}) }, children: [], text: '' };
      const texts = [];
      for (const c of kids) {
        if (Object.prototype.hasOwnProperty.call(c, '#text')) texts.push(String(c['#text']));
      }
      el.text = texts.join(' ');
      el.children = convert(kids.filter((c) => !Object.prototype.hasOwnProperty.call(c, '#text')));
      out.push(el);
    }
  }
  return out;
}

/** Parse an XML string into its root element. */
export function parseXml(text) {
  const nodes = convert(parser.parse(text));
  const root = nodes.find((n) => !n.tag.startsWith('!'));
  if (!root) throw new Error('XML without a root element');
  return root;
}

export function readXml(file) {
  return parseXml(fs.readFileSync(file, 'utf8'));
}

/** Local name without a namespace prefix (xacro:macro → macro is NOT stripped; COLLADA has none). */
export const children = (el, tag) => el.children.filter((c) => c.tag === tag);
export const child = (el, tag) => el.children.find((c) => c.tag === tag) ?? null;

/** Depth-first search for the first element with this tag. */
export function find(el, tag) {
  for (const c of el.children) {
    if (c.tag === tag) return c;
    const r = find(c, tag);
    if (r) return r;
  }
  return null;
}

export function findAll(el, tag, out = []) {
  for (const c of el.children) {
    if (c.tag === tag) out.push(c);
    findAll(c, tag, out);
  }
  return out;
}

export const nums = (s, fallback = null) => {
  if (s === undefined || s === null || String(s).trim() === '') return fallback;
  return String(s).trim().split(/[\s,]+/).map(Number);
};

export const num = (s, fallback = null) => (s === undefined || s === null || String(s).trim() === '' ? fallback : Number(s));

/** Deep copy (xacro expands macros by cloning their bodies). */
export function cloneEl(el) {
  return { tag: el.tag, attrs: { ...el.attrs }, children: el.children.map(cloneEl), text: el.text };
}

/** Back to XML text (used to write the expanded xacro for the independent FK reference). */
export function toXml(el, indent = '') {
  const attrs = Object.entries(el.attrs)
    .map(([k, v]) => ` ${k}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`)
    .join('');
  const text = el.text ? el.text.replace(/&/g, '&amp;').replace(/</g, '&lt;') : '';
  if (!el.children.length && !text) return `${indent}<${el.tag}${attrs}/>`;
  if (!el.children.length) return `${indent}<${el.tag}${attrs}>${text}</${el.tag}>`;
  return `${indent}<${el.tag}${attrs}>${text}\n${el.children.map((c) => toXml(c, indent + '  ')).join('\n')}\n${indent}</${el.tag}>`;
}
