// Minimal xacro expander (what FANUC's and DFKI's MiR descriptions use): include, arg, property
// (text and block), macro (defaults, ^ inheritance, *block / **blocks), insert_block, if / unless,
// ${...} expressions, $(arg ...) and $(find ...). The result is a plain URDF element tree.
// Expressions go through lib/expr.mjs, never through eval().
import fs from 'node:fs';
import path from 'node:path';
import { readXml, cloneEl } from './xml.mjs';
import { evaluate, formatValue, asValue } from './expr.mjs';
import { findPackage } from './paths.mjs';

const X = 'xacro:';

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.props = new Map(); // name -> { text } | { block: El[] }
  }
  get(name) {
    for (let s = this; s; s = s.parent) if (s.props.has(name)) return s.props.get(name);
    return undefined;
  }
}

/**
 * @param {string} file the .xacro / .urdf.xacro entry
 * @param {{ root: string, args?: Record<string, string> }} o root: the checkout folder (for $(find))
 */
export function expandXacro(file, o) {
  const args = { ...(o.args ?? {}) };
  const macros = new Map();
  const global = new Scope();

  const substArgs = (s) =>
    s.replace(/\$\((\w+)\s+([^)]*)\)/g, (_m, fn, rest) => {
      const a = rest.trim();
      if (fn === 'arg') {
        if (!(a in args)) throw new Error(`xacro: $(arg ${a}) is not defined`);
        return args[a];
      }
      if (fn === 'find') return findPackage(o.root, a);
      throw new Error(`xacro: $(${fn} …) is not supported`);
    });

  const valueOf = (name, scope, depth = 0) => {
    if (depth > 50) throw new Error(`xacro: property recursion at ${name}`);
    const p = scope.get(name);
    if (!p) throw new Error(`xacro: unknown property "${name}"`);
    if (p.block) throw new Error(`xacro: block property "${name}" used as a value`);
    if (!('value' in p)) p.value = asValue(subst(p.text, p.scope ?? scope, depth + 1));
    return p.value;
  };

  // text substitution: $(…) first, then every ${…}; a text that is ONE ${…} keeps its type via asValue later
  function subst(s, scope, depth = 0) {
    if (typeof s !== 'string' || (!s.includes('$') && !s.includes('${'))) return s;
    s = substArgs(s);
    let out = '';
    let i = 0;
    while (i < s.length) {
      const j = s.indexOf('${', i);
      if (j < 0) {
        out += s.slice(i);
        break;
      }
      out += s.slice(i, j);
      let k = j + 2;
      let level = 1;
      while (k < s.length && level) {
        if (s[k] === '{') level++;
        else if (s[k] === '}') level--;
        k++;
      }
      if (level) throw new Error(`xacro: unterminated \${ in "${s}"`);
      const v = evaluate(s.slice(j + 2, k - 1), (n) => valueOf(n, scope, depth));
      out += formatValue(v);
      i = k;
    }
    return out;
  }

  const truthy = (v) => {
    const x = asValue(v);
    if (typeof x === 'boolean') return x;
    if (typeof x === 'number') return x !== 0;
    throw new Error(`xacro: condition "${v}" is not a boolean`);
  };

  function parseParams(spec) {
    // e.g. prefix:='' parent *origin child x:=^|1.0 **content
    const out = [];
    const re = /(\*{0,2})([\w]+)(?::?=((?:'[^']*'|"[^"]*"|[^\s])*))?/g;
    for (let m = re.exec(spec); m; m = re.exec(spec)) {
      let dflt = m[3];
      if (dflt !== undefined) dflt = dflt.replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
      out.push({ name: m[2], block: m[1].length, dflt });
    }
    return out;
  }

  /** Expand the children of `el` in `scope`, returning the new list of elements. */
  function expandChildren(list, scope, blocks, baseDir) {
    const out = [];
    for (const el of list) out.push(...expandEl(el, scope, blocks, baseDir));
    return out;
  }

  function expandEl(el, scope, blocks, baseDir) {
    const t = el.tag;
    if (t === X + 'include') {
      const f = substArgs(subst(el.attrs.filename, scope));
      const abs = path.isAbsolute(f) ? f : path.resolve(baseDir, f);
      if (!abs.startsWith(o.root + path.sep)) throw new Error(`xacro: include leaves the checkout: ${f}`);
      const inc = readXml(abs);
      return expandChildren(inc.children, scope, blocks, path.dirname(abs));
    }
    if (t === X + 'arg') {
      if (!(el.attrs.name in args)) args[el.attrs.name] = subst(el.attrs.default ?? '', scope);
      return [];
    }
    if (t === X + 'property') {
      const target = el.attrs.scope === 'global' ? global : scope;
      if ('value' in el.attrs) target.props.set(el.attrs.name, { text: el.attrs.value, scope });
      else if ('default' in el.attrs) {
        if (!scope.get(el.attrs.name)) target.props.set(el.attrs.name, { text: el.attrs.default, scope });
      } else target.props.set(el.attrs.name, { block: el.children.map(cloneEl), scope });
      return [];
    }
    if (t === X + 'macro') {
      macros.set(el.attrs.name, { params: parseParams(el.attrs.params ?? ''), body: el.children, scope, baseDir });
      return [];
    }
    if (t === X + 'if' || t === X + 'unless') {
      const v = truthy(subst(el.attrs.value, scope));
      return v === (t === X + 'if') ? expandChildren(el.children, scope, blocks, baseDir) : [];
    }
    if (t === X + 'insert_block') {
      const name = subst(el.attrs.name, scope);
      if (blocks && blocks.has(name)) return expandChildren(blocks.get(name), scope, blocks, baseDir);
      const p = scope.get(name);
      if (p && p.block) return expandChildren(p.block, p.scope ?? scope, blocks, baseDir);
      throw new Error(`xacro: unknown block "${name}"`);
    }
    if (t.startsWith(X)) {
      const name = t.slice(X.length);
      const m = macros.get(name);
      if (!m) throw new Error(`xacro: unknown macro or tag <${t}>`);
      const callScope = new Scope(m.scope);
      const callBlocks = new Map();
      const elementKids = el.children.filter((c) => !c.tag.startsWith('!'));
      let bi = 0;
      for (const prm of m.params) {
        if (prm.block === 1) {
          const kid = elementKids[bi++];
          if (!kid) throw new Error(`xacro: macro ${name} needs block *${prm.name}`);
          callBlocks.set(prm.name, [kid]);
        } else if (prm.block === 2) {
          const kid = elementKids[bi++];
          callBlocks.set(prm.name, kid ? kid.children : []);
        } else if (prm.name in el.attrs) {
          callScope.props.set(prm.name, { value: asValue(subst(el.attrs[prm.name], scope)) });
        } else if (prm.dflt !== undefined) {
          let d = prm.dflt;
          if (d.startsWith('^')) {
            const outer = scope.get(prm.name);
            if (outer) {
              callScope.props.set(prm.name, { value: valueOf(prm.name, scope) });
              continue;
            }
            d = d.startsWith('^|') ? d.slice(2) : '';
          }
          callScope.props.set(prm.name, { value: asValue(subst(d, scope)) });
        } else throw new Error(`xacro: macro ${name} misses parameter ${prm.name}`);
      }
      // blocks passed in from the caller are expanded in the caller's scope
      const wrapped = new Map([...callBlocks].map(([k, v]) => [k, v.map((b) => ({ ...b, __scope: scope, __blocks: blocks }))]));
      return expandChildren(m.body, callScope, wrapped, m.baseDir);
    }
    // a block element handed into a macro: expand in its own scope
    const sc = el.__scope ?? scope;
    const bl = el.__blocks ?? blocks;
    const attrs = {};
    for (const [k, v] of Object.entries(el.attrs)) if (!k.startsWith('xmlns')) attrs[k] = subst(v, sc);
    return [{ tag: t, attrs, children: expandChildren(el.children, sc, bl, baseDir), text: subst(el.text ?? '', sc) }];
  }

  const root = readXml(file);
  const kids = expandChildren(root.children, global, null, path.dirname(file));
  const attrs = {};
  for (const [k, v] of Object.entries(root.attrs)) if (!k.startsWith('xmlns')) attrs[k] = subst(v, global);
  return { tag: root.tag, attrs, children: kids, text: '' };
}

/** True when the file needs the expander (xacro namespace or extension). */
export function isXacro(file) {
  if (/\.xacro$/i.test(file)) return true;
  const head = fs.readFileSync(file, 'utf8').slice(0, 2000);
  return /xmlns:xacro=/.test(head);
}
