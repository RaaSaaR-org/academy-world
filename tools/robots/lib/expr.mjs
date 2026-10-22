// A tiny, safe evaluator for xacro's ${...} expressions (a Python subset): numbers, strings,
// names, + - * / % **, comparisons, and / or / not, and a fixed list of math functions.
// Downloaded text is never handed to eval() or Function().

const FUNCS = {
  radians: (d) => (d * Math.PI) / 180,
  degrees: (r) => (r * 180) / Math.PI,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sqrt: Math.sqrt,
  abs: Math.abs,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  ceil: Math.ceil,
  float: (x) => Number(x),
  int: (x) => Math.trunc(Number(x)),
  str: (x) => String(x),
};
const CONSTS = { pi: Math.PI, e: Math.E, True: true, False: false, true: true, false: false };

function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const numM = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(s.slice(i));
    if (numM) {
      out.push({ t: 'num', v: Number(numM[1]) });
      i += numM[1].length;
      continue;
    }
    if (c === "'" || c === '"') {
      const j = s.indexOf(c, i + 1);
      if (j < 0) throw new Error(`unterminated string in "${s}"`);
      out.push({ t: 'str', v: s.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    const idM = /^[A-Za-z_][\w.]*/.exec(s.slice(i));
    if (idM) {
      const v = idM[0];
      out.push({ t: ['and', 'or', 'not'].includes(v) ? 'op' : 'id', v });
      i += v.length;
      continue;
    }
    const opM = /^(\*\*|==|!=|<=|>=|[-+*/%()<>,])/.exec(s.slice(i));
    if (opM) {
      out.push({ t: 'op', v: opM[1] });
      i += opM[1].length;
      continue;
    }
    throw new Error(`unexpected "${c}" in expression "${s}"`);
  }
  return out;
}

/** Evaluate `src` with `lookup(name)` resolving properties (throws on an unknown name). */
export function evaluate(src, lookup) {
  const tk = tokenize(src);
  let p = 0;
  const peek = () => tk[p];
  const isOp = (v) => tk[p] && tk[p].t === 'op' && tk[p].v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new Error(`expected "${v}" in "${src}"`);
    p++;
  };
  const orE = () => {
    let a = andE();
    while (isOp('or')) {
      p++;
      const b = andE();
      a = a || b;
    }
    return a;
  };
  const andE = () => {
    let a = notE();
    while (isOp('and')) {
      p++;
      const b = notE();
      a = a && b;
    }
    return a;
  };
  const notE = () => {
    if (isOp('not')) {
      p++;
      return !notE();
    }
    return cmpE();
  };
  const cmpE = () => {
    const a = addE();
    for (const op of ['==', '!=', '<=', '>=', '<', '>']) {
      if (isOp(op)) {
        p++;
        const b = addE();
        // xacro compares numbers numerically and everything else as text
        const [x, y] = typeof a === 'number' && typeof b === 'number' ? [a, b] : [String(a), String(b)];
        if (op === '==') return x === y;
        if (op === '!=') return x !== y;
        if (op === '<=') return x <= y;
        if (op === '>=') return x >= y;
        if (op === '<') return x < y;
        return x > y;
      }
    }
    return a;
  };
  const addE = () => {
    let a = mulE();
    while (isOp('+') || isOp('-')) {
      const op = tk[p++].v;
      const b = mulE();
      a = op === '+' ? (typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : a + b) : a - b;
    }
    return a;
  };
  const mulE = () => {
    let a = unE();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = tk[p++].v;
      const b = unE();
      a = op === '*' ? a * b : op === '/' ? a / b : a % b;
    }
    return a;
  };
  const unE = () => {
    if (isOp('-')) {
      p++;
      return -unE();
    }
    if (isOp('+')) {
      p++;
      return +unE();
    }
    return powE();
  };
  const powE = () => {
    const a = atom();
    if (isOp('**')) {
      p++;
      return a ** unE();
    }
    return a;
  };
  const atom = () => {
    const t = peek();
    if (!t) throw new Error(`unexpected end of "${src}"`);
    if (t.t === 'num' || t.t === 'str') {
      p++;
      return t.v;
    }
    if (isOp('(')) {
      p++;
      const v = orE();
      expect(')');
      return v;
    }
    if (t.t === 'id') {
      p++;
      const name = t.v.replace(/^math\./, '');
      if (isOp('(')) {
        p++;
        const args = [];
        if (!isOp(')')) {
          args.push(orE());
          while (isOp(',')) {
            p++;
            args.push(orE());
          }
        }
        expect(')');
        const f = FUNCS[name];
        if (!f) throw new Error(`unknown function ${name}() in "${src}"`);
        return f(...args);
      }
      if (Object.prototype.hasOwnProperty.call(CONSTS, name)) return CONSTS[name];
      return lookup(t.v);
    }
    throw new Error(`unexpected "${t.v}" in "${src}"`);
  };
  const v = orE();
  if (p !== tk.length) throw new Error(`trailing tokens in "${src}"`);
  return v;
}

/** Python-like formatting of a value substituted into text. */
export function formatValue(v) {
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 1e15 ? String(v) : String(v);
  return String(v);
}

/** A property's text as a value: numbers become numbers, the rest stays text. */
export function asValue(s) {
  if (typeof s !== 'string') return s;
  const t = s.trim();
  if (t !== '' && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return Number(t);
  if (t === 'True' || t === 'true') return true;
  if (t === 'False' || t === 'false') return false;
  return s;
}
