#!/usr/bin/env node
// Strips the custom sections (DWARF `.debug_*`, `name`, `sourceMappingURL`, `target_features`, …)
// from a WebAssembly module: the code and data sections stay byte-identical, so the module
// compiles and steps exactly as before (R2 §7.2: MuJoCo 3.16.0, 10.75 MB → 4.87 MB raw,
// 1.99 → 1.03 MB brotli). The build uses stripWasm() for the duck station's mujoco.wasm
// (vite.config.ts, block „worker (WP5)"); the duck tools use it so Node runs the same bytes.
//
//   node tools/mujoco/strip.mjs [<in.wasm> [<out.wasm>]]   default in: node_modules/@mujoco/mujoco/mujoco.wasm
//
// Without <out> it only reports what it would remove.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const MAGIC = [0x00, 0x61, 0x73, 0x6d];

function leb(b, i) {
  let r = 0;
  let s = 0;
  for (;;) {
    const c = b[i++];
    r += (c & 0x7f) * 2 ** s;
    s += 7;
    if (c < 0x80) return [r, i];
    if (s > 35) throw new Error('wasm: bad LEB128');
  }
}

/**
 * @param {Uint8Array} input a WebAssembly binary
 * @returns {{ bytes: Uint8Array, removed: { name: string, size: number }[], kept: number }}
 */
export function stripWasm(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (MAGIC.some((v, k) => b[k] !== v)) throw new Error('not a WebAssembly module');
  const parts = [b.subarray(0, 8)];
  const removed = [];
  let kept = 0;
  let i = 8;
  while (i < b.length) {
    const start = i;
    const id = b[i];
    const [size, body] = leb(b, i + 1);
    const end = body + size;
    if (end > b.length) throw new Error('wasm: section runs past the end');
    if (id === 0) {
      const [nl, n0] = leb(b, body);
      removed.push({ name: new TextDecoder().decode(b.subarray(n0, n0 + nl)), size: end - start });
    } else {
      parts.push(b.subarray(start, end));
      kept++;
    }
    i = end;
  }
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return { bytes: out, removed, kept };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const inFile = process.argv[2] ?? path.join(ROOT, 'node_modules', '@mujoco', 'mujoco', 'mujoco.wasm');
  const outFile = process.argv[3];
  const src = fs.readFileSync(inFile);
  const { bytes, removed, kept } = stripWasm(src);
  const br = (d) => zlib.brotliCompressSync(d, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_GENERIC, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: d.length } }).length;
  const ok = await WebAssembly.compile(bytes).then(() => true, (e) => (console.error(String(e)), false));
  console.log(
    JSON.stringify(
      {
        in: path.relative(ROOT, inFile),
        raw: src.length,
        stripped: bytes.length,
        brotli: { before: br(src), after: br(bytes) },
        keptSections: kept,
        removed: removed.map((r) => `${r.name} ${r.size}`),
        compiles: ok,
      },
      null,
      1,
    ),
  );
  if (outFile) fs.writeFileSync(outFile, bytes);
  process.exitCode = ok ? 0 : 1;
}
