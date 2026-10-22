import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { amberRobots, thirdPartyNotices } from './tools/notices-plugin.mjs';
import { stripWasm } from './tools/mujoco/strip.mjs'; // worker (WP5)

/**
 * Rapier's compat package inlines its 3 MB WebAssembly as base64 inside rapier.mjs (4.3 MB of
 * JS, 1.65 MB gzip). For production we hand the init a URL of the package's own .wasm file
 * instead: Vite emits it with a content hash, the browser compiles it while streaming, and the
 * transfer shrinks to ≈ 1.17 MB gzip / 0.85 MB brotli. Dev keeps the inlined module. If the
 * package layout ever changes, the pattern does not match and the build keeps the inlined copy.
 */
function rapierWasmAsFile(): Plugin {
  return {
    name: 'emai:rapier-wasm-file',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!/@dimforge[\\/]rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/.test(id)) return null;
      // `module_or_path: X.toByteArray("AGFzbQ…").buffer` (the base64 of the module, "\0asm…")
      const re = /module_or_path:\s*([A-Za-z_$][\w$]*)\.toByteArray\("AGFzbQ[A-Za-z0-9+/=]+"\)(\.buffer)?/;
      if (!re.test(code)) {
        this.warn('rapier.mjs layout changed: keeping the inlined WebAssembly');
        return null;
      }
      return { code: code.replace(re, 'module_or_path: new URL("./rapier_wasm3d_bg.wasm", import.meta.url)'), map: null };
    },
  };
}

// Text-like files worth compressing (fonts and images are compressed already). GLB: the robot
// models are meshopt-encoded, and brotli still saves 30–49 % on them (R7 §4.2).
const COMPRESSIBLE = /\.(js|mjs|css|wasm|svg|html|json|txt|glb|bin)$/;
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary',
  // the ground's baked terrain heights (WP3, public/world/ground/*.bin): Uint16 residuals, brotli 6–12×
  '.bin': 'application/octet-stream',
};

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/**
 * After the build writes dist/, put a .br (brotli 11) and a .gz (gzip 9) next to every text-like
 * file, so a host can serve them as they are (README "Hosting") instead of compressing on the fly
 * or not at all. Only written when smaller than the original. PRECOMPRESS=0 skips it.
 */
function precompress(): Plugin {
  let outDir = '';
  const brotli = promisify(zlib.brotliCompress);
  const gzip = promisify(zlib.gzip);
  return {
    name: 'emai:precompress',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (process.env.PRECOMPRESS === '0' || !outDir || !fs.existsSync(outDir)) return;
      const files = filesUnder(outDir).filter((f) => COMPRESSIBLE.test(f));
      let raw = 0;
      let br = 0;
      const queue = [...files];
      const worker = async (): Promise<void> => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          const data = await fs.promises.readFile(f);
          const mode = /\.(wasm|glb|bin)$/.test(f) ? zlib.constants.BROTLI_MODE_GENERIC : zlib.constants.BROTLI_MODE_TEXT;
          const [b, g] = await Promise.all([
            brotli(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: mode, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length } }),
            gzip(data, { level: 9 }),
          ]);
          raw += data.length;
          br += Math.min(b.length, data.length);
          if (b.length < data.length) await fs.promises.writeFile(f + '.br', b);
          if (g.length < data.length) await fs.promises.writeFile(f + '.gz', g);
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      this.info?.(`precompressed ${files.length} files: ${(raw / 1048576).toFixed(2)} MB → ${(br / 1048576).toFixed(2)} MB brotli`);
    },
  };
}

/**
 * `vite preview` like a production host: serves the build's own .br / .gz files by
 * Accept-Encoding (with the right Content-Type, application/wasm for Rapier), `immutable` caching
 * for the content-hashed /assets/*, `no-cache` (+ ETag) for index.html and the other unhashed files.
 * Plain `vite preview` gzips on the fly, sends the 3 MB wasm uncompressed and sets no cache headers.
 */
function previewLikeProduction(): Plugin {
  return {
    name: 'emai:preview-like-production',
    configurePreviewServer(server) {
      const dist = path.resolve(server.config.root, server.config.build.outDir);
      const base = server.config.base || '/';
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        let p: string;
        try {
          p = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
        } catch {
          return next();
        }
        if (base !== '/' && p.startsWith(base)) p = '/' + p.slice(base.length);
        if (p.endsWith('/')) p += 'index.html';
        const file = path.join(dist, p);
        if (!file.startsWith(dist + path.sep)) return next();
        let st: fs.Stats;
        try {
          st = fs.statSync(file);
        } catch {
          return next(); // SPA fallback, 404: Vite's own middlewares
        }
        if (!st.isFile()) return next();
        const ae = String(req.headers['accept-encoding'] ?? '');
        let body = file;
        let enc: string | null = null;
        if (/\bbr\b/.test(ae) && fs.existsSync(file + '.br')) [body, enc] = [file + '.br', 'br'];
        else if (/\bgzip\b/.test(ae) && fs.existsSync(file + '.gz')) [body, enc] = [file + '.gz', 'gzip'];
        const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}${enc ? '-' + enc : ''}"`;
        res.setHeader('Content-Type', CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', p.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
        if (COMPRESSIBLE.test(file)) res.setHeader('Vary', 'Accept-Encoding');
        if (enc) res.setHeader('Content-Encoding', enc);
        res.setHeader('ETag', etag);
        if (req.headers['if-none-match'] === etag) {
          res.statusCode = 304;
          return res.end();
        }
        // a build without the precompressed files (PRECOMPRESS=0, an old dist): compress on the fly
        const live = !enc && COMPRESSIBLE.test(file) && st.size >= 1024 ? (/\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : null) : null;
        if (live) res.setHeader('Content-Encoding', live);
        else res.setHeader('Content-Length', fs.statSync(body).size);
        if (req.method === 'HEAD') return res.end();
        const stream = fs.createReadStream(body);
        if (live === 'br') stream.pipe(zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })).pipe(res);
        else if (live === 'gzip') stream.pipe(zlib.createGzip({ level: 6 })).pipe(res);
        else stream.pipe(res);
      });
    },
  };
}

// ── worker (WP5) ────────────────────────────────────────────────────────────────
// The Regelgarten duck station's MuJoCo worker (Phase 7 plan §5.4, D30). Owner: WP5.
//  - `duckWorker.worker`: workers are ES modules, each one self-contained (`codeSplitting: false`, the
//    successor of `inlineDynamicImports: true`): no shared chunks and no import-map specifiers, which
//    the page's `build.chunkImportMap` does not reach inside a worker.
//  - `duckWorker.plugins` (main build): the glue's `?url` import of the wasm emits the STRIPPED module
//    (custom and debug sections removed by tools/mujoco/strip.mjs: 10.75 → 4.87 MB raw, ≈ 1.03 MB brotli),
//    content-hashed; precompress() then writes its .br / .gz like Rapier's.
//  - `mujocoGlue()` (worker build, dev and production): the Emscripten glue's Node branch and its own
//    `new URL('mujoco.wasm', import.meta.url)` go away (the station always passes locateFile), so the
//    worker bundle has no `import('module')` bare specifier and Vite never emits the unstripped wasm.
//    If the glue's layout changes, the build fails instead of shipping either of them.
const MUJOCO_WASM = '@mujoco/mujoco/mujoco.wasm?url';
function mujocoStrippedWasm(): Plugin {
  const virtual = '\0emai:mujoco-wasm-url';
  return {
    name: 'emai:mujoco-stripped-wasm',
    apply: 'build',
    enforce: 'pre',
    resolveId(source) {
      return source === MUJOCO_WASM ? virtual : null;
    },
    load(id) {
      if (id !== virtual) return null;
      const file = fileURLToPath(new URL('./node_modules/@mujoco/mujoco/mujoco.wasm', import.meta.url));
      const { bytes } = stripWasm(fs.readFileSync(file));
      const ref = this.emitFile({ type: 'asset', name: 'mujoco.wasm', source: bytes });
      return `export default import.meta.ROLLDOWN_FILE_URL_${ref};`;
    },
  };
}
function mujocoGlue(): Plugin {
  const PATCHES: [RegExp, string][] = [
    [/var ENVIRONMENT_IS_NODE = typeof process == 'object' && process\.versions\?\.node && process\.type != 'renderer';/, 'var ENVIRONMENT_IS_NODE = false;'],
    [/const \{ createRequire \} = await import\('module'\);/, 'const { createRequire } = {};'],
    [/return new URL\('mujoco\.wasm', import\.meta\.url\)\.href;/, "return 'mujoco.wasm';"],
  ];
  return {
    name: 'emai:mujoco-glue',
    enforce: 'pre',
    transform(code, id) {
      if (!/@mujoco[\\/]mujoco[\\/]mujoco\.js$/.test(id.split('?')[0])) return null;
      let out = code;
      for (const [re, to] of PATCHES) {
        if (!re.test(out)) this.error(`@mujoco/mujoco glue layout changed (${re.source.slice(0, 40)}…): update vite.config.ts „worker (WP5)"`);
        out = out.replace(re, to);
      }
      return { code: out, map: null };
    },
  };
}
/**
 * The worker bundle is built apart from the page's chunks, so tools/notices-plugin.mjs never sees its
 * modules: add MuJoCo to the generated THIRD-PARTY-NOTICES.txt (SOFTWARE section) from its licence copy.
 */
function mujocoNotice(): Plugin {
  return {
    name: 'emai:mujoco-notice',
    apply: 'build',
    enforce: 'post',
    generateBundle(_o, bundle) {
      const notices = bundle['THIRD-PARTY-NOTICES.txt'];
      const lic = fileURLToPath(new URL('./LICENSES/npm/@mujoco__mujoco.txt', import.meta.url));
      if (!notices || notices.type !== 'asset' || !fs.existsSync(lic)) return;
      const text = String(notices.source);
      if (text.includes('@mujoco/mujoco')) return;
      const entry = `* @mujoco/mujoco 3.16.0 — Apache-2.0 — https://github.com/google-deepmind/mujoco (in the Regelgarten duck station's worker)\n\n${fs.readFileSync(lic, 'utf8').trim()}\n\n\n`;
      notices.source = text.replace(/\nFONTS\n-----/, `\n${entry}FONTS\n-----`);
    },
  };
}
/**
 * The recorded generations (src/zones/regelgarten/duck/rec/duck-rec.bin, loaded only by the fallback)
 * are binary: precompress() skips `.bin`, so write their .br / .gz here (3.9 MB raw → ≈ 1.25 MB brotli).
 */
function duckRecordingsCompressed(): Plugin {
  let outDir = '';
  return {
    name: 'emai:duck-recordings-br',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (process.env.PRECOMPRESS === '0' || !outDir || !fs.existsSync(path.join(outDir, 'assets'))) return;
      for (const f of fs.readdirSync(path.join(outDir, 'assets')).filter((n) => /^duck-rec-.*\.bin$/.test(n))) {
        const file = path.join(outDir, 'assets', f);
        // precompress() already did it once `.bin` is in COMPRESSIBLE (WP3's request d7a9891)
        if (fs.existsSync(file + '.br')) continue;
        const data = await fs.promises.readFile(file);
        const br = await promisify(zlib.brotliCompress)(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_GENERIC, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: data.length } });
        await fs.promises.writeFile(file + '.br', br);
        await fs.promises.writeFile(file + '.gz', await promisify(zlib.gzip)(data, { level: 9 }));
      }
    },
  };
}
const duckWorker = {
  plugins: [mujocoStrippedWasm(), mujocoNotice(), duckRecordingsCompressed()],
  worker: {
    format: 'es' as const,
    plugins: () => [mujocoGlue()],
    rolldownOptions: { output: { codeSplitting: false } },
  },
  /** the glue is not pre-bundled in dev (its Node branch and wasm URL stay for the patch above) */
  optimizeDepsExclude: ['@mujoco/mujoco'],
};
// ── end worker (WP5) ────────────────────────────────────────────────────────────

// ── amber gate (release) ────────────────────────────────────────────────────────
// The amber exhibits of docs/LEGAL-REVIEW.md item 2 ship only when the build sets VITE_AMBER=1 (the same
// switch as src/core/release.ts, which drops them from the manifest, the Schauhalle and the credits).
// With the switch off, every import of their GLBs (model and silhouette) and of the full line-up mesh
// (lineup.l2.glb holds their geometry) resolves to one stub module, so the build never emits those
// files; with it on, the line-up without them (lineup-noamber.l2.glb) is the one left out. The amber
// ids come from the generated credits (src/robots/credits.ts, `amber: true`).
const AMBER_STUB = '\0emai:amber-off';
function amberGate(root: string, showAmber: boolean): Plugin {
  const real = (p: string): string => {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  };
  const glbDir = real(path.join(root, 'src', 'robots', 'glb'));
  // file stems under src/robots/glb/ whose imports become the stub
  const off = new Set(showAmber ? ['lineup-noamber.l2'] : [...amberRobots(root).flatMap((r) => [r.id, `${r.id}.l2`]), 'lineup.l2']);
  return {
    name: 'emai:amber-gate',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !/\.glb\?url$/.test(source)) return null;
      const file = path.resolve(path.dirname(importer.split('?')[0]), source.split('?')[0]);
      if (real(path.dirname(file)) !== glbDir || !off.has(path.basename(file, '.glb'))) return null;
      return AMBER_STUB;
    },
    load(id) {
      if (id !== AMBER_STUB) return null;
      return `throw new Error('not in this build: an amber exhibit (VITE_AMBER=1, src/core/release.ts)');`;
    },
    // a model that slipped past the gate fails the build instead of shipping
    generateBundle(_o, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== 'asset' || !item.fileName.endsWith('.glb')) continue;
        const names = [...(item.names ?? []), ...(item.originalFileNames ?? []).map((f) => path.basename(f))];
        const hit = names.find((n) => off.has(n.replace(/\.glb$/, '')));
        if (hit) this.error(`${hit} is in the bundle although the amber gate is ${showAmber ? 'on' : 'off'} (VITE_AMBER, src/core/release.ts)`);
      }
    },
  };
}
// ── end amber gate ──────────────────────────────────────────────────────────────

// ── discover flag (WP-D0) ───────────────────────────────────────────────────────
// src/discover/flags.ts DISCOVER_DEFAULT_ON_TOUCH is the one line that decides whether touch-only phones
// land in „Entdecken“ instead of the mouse-and-keyboard notice (founder decision 1). The pre-boot gate in
// index.html is a classic inline script that cannot import it: this plugin writes the value into the
// gate's /*DISCOVER_DEFAULT_ON_TOUCH*/ marker (build and dev). A lost marker or flag fails the build.
function discoverFlag(root: string): Plugin {
  const file = path.join(root, 'src', 'discover', 'flags.ts');
  return {
    name: 'emai:discover-flag',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const flag = fs.readFileSync(file, 'utf8').match(/export const DISCOVER_DEFAULT_ON_TOUCH(?:\s*:\s*boolean)?\s*=\s*(true|false)\s*;/);
        if (!flag) throw new Error('src/discover/flags.ts: `export const DISCOVER_DEFAULT_ON_TOUCH = true | false;` not found');
        const marker = /\/\*DISCOVER_DEFAULT_ON_TOUCH\*\/\s*(true|false)/;
        if (!marker.test(html)) throw new Error('index.html: the pre-boot gate lost its /*DISCOVER_DEFAULT_ON_TOUCH*/ marker');
        return html.replace(marker, `/*DISCOVER_DEFAULT_ON_TOUCH*/ ${flag[1]}`);
      },
    },
  };
}
// ── end discover flag ───────────────────────────────────────────────────────────

/**
 * BASE_PATH: the public URL path the build is served from, e.g. `BASE_PATH=/academy-world/ npm run build`
 * for GitHub Pages (.github/workflows/pages.yml). Default `/`, so dev, preview and every tools/* script
 * work as before. Runtime URLs go through import.meta.env.BASE_URL (src/core/Assets.ts assetUrl).
 */
function basePath(): string {
  const raw = (process.env.BASE_PATH ?? '').trim();
  if (!raw || raw === '/') return '/';
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`;
}

// Vanilla three.js + TypeScript. No framework plugins needed.
export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const showAmber = loadEnv(mode, root, 'VITE_').VITE_AMBER === '1';
  return {
    base: basePath(),
    plugins: [discoverFlag(root) /* discover flag (WP-D0) */, amberGate(root, showAmber), rapierWasmAsFile(), ...duckWorker.plugins /* worker (WP5) */, thirdPartyNotices({ root, showAmber }), precompress(), previewLikeProduction()],
    worker: duckWorker.worker, // worker (WP5)
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // The full-screen Vite error overlay would hide the game when ONE zone is broken.
      // Zone load errors are surfaced as toasts + window.__academy.zones() instead.
      hmr: { overlay: false },
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 5000, // Rapier inlines its WASM as base64 (~2 MB) — expected.
      // A public build ships no sourcemaps (they would publish the source). SOURCEMAP=1 npm run build
      // writes 'hidden' maps (no sourceMappingURL comment) for symbolicating error reports; keep
      // them out of the deployed folder.
      sourcemap: process.env.SOURCEMAP === '1' ? 'hidden' : false,
      // fonts (≈ 20–30 KB each) and other assets get content hashes: cache them forever
      assetsInlineLimit: 4096,
      // Chunks import each other through an import map in index.html instead of by hashed file name,
      // so a changed zone changes only its own chunk (and index.html), not every chunk that imports a
      // chunk that imports it. A zone-only deploy costs a returning visitor ≈ 0.04 MB instead of
      // ≈ 0.46 MB. Import maps: Chrome/Edge 89, Safari 16.4, Firefox 108 (the pre-boot gate checks).
      chunkImportMap: true,
      rolldownOptions: {
        output: {
          // three, postprocessing and troika (with their own dependencies) in one chunk with a stable
          // name: it changes only with a library update, so a returning visitor keeps it cached across
          // game deploys. three/examples stays out, so its loaders can still load lazily.
          codeSplitting: {
            groups: [
              {
                name: 'vendor-three',
                test: /[\\/]node_modules[\\/](three[\\/](?!examples[\\/])|postprocessing[\\/]|troika-three-text[\\/]|troika-three-utils[\\/]|troika-worker-utils[\\/]|webgl-sdf-generator[\\/]|bidi-js[\\/])/,
              },
            ],
          },
        },
      },
    },
    optimizeDeps: {
      exclude: duckWorker.optimizeDepsExclude, // worker (WP5)
      // The deep three/examples imports are listed too: otherwise a fresh dev cache discovers them on
      // the first page load and Vite reloads the page once (tools on PT_DEV=1 lost their first page).
      include: [
        'three',
        'three/examples/jsm/geometries/RoundedBoxGeometry.js',
        'three/examples/jsm/utils/BufferGeometryUtils.js',
        'three/examples/jsm/utils/SkeletonUtils.js',
        'three/examples/jsm/loaders/GLTFLoader.js',
        'postprocessing',
        'troika-three-text',
        '@dimforge/rapier3d-compat',
      ],
    },
  };
});
