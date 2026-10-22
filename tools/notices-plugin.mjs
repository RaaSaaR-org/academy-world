// Vite build plugin: third-party notices for what the build really ships.
//
//  - dist/THIRD-PARTY-NOTICES.txt: every npm package whose code is in the bundle (found from the
//    chunks' module ids, so a new dependency can't be forgotten), with its licence text from its
//    own folder; separately licensed files inside a package (three's bundled meshoptimizer decoder);
//    the fonts (LICENSES/OFL-1.1.txt); the robot models (LICENSES/robots/NOTICES.txt, written by
//    tools/robots/build.mjs).
//  - dist/licenses/**: a copy of LICENSES/ (the credits page links these same-origin files).
//  - showAmber false (VITE_AMBER unset, src/core/release.ts): the amber robot models are not in the
//    build, so their entries leave the robots' notices, and a licence text only they use is neither
//    reproduced nor copied to dist/licenses/ (the texts stay in LICENSES/robots/ in the repository).
// The build fails when a bundled package has no licence it can name.
import fs from 'node:fs';
import path from 'node:path';

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;
/** Files inside a package that carry their own licence header (kept verbatim from the header). */
const OWN_HEADER = [/three[\\/]examples[\\/]jsm[\\/]libs[\\/][^\\/]+\.js$/];

function packageOf(id) {
  const clean = id.replace(/^\0/, '').split('?')[0];
  const i = clean.lastIndexOf('/node_modules/');
  if (i < 0) return null;
  const rest = clean.slice(i + 14).split('/');
  const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  return { name, dir: clean.slice(0, i + 14) + name, file: clean };
}

/**
 * The amber robot models (docs/LEGAL-REVIEW.md item 2) from the generated credits (src/robots/credits.ts,
 * written by tools/robots/build.mjs): id, the notices' entry line, licence files.
 */
export function amberRobots(root) {
  const text = fs.readFileSync(path.join(root, 'src', 'robots', 'credits.ts'), 'utf8');
  const m = /ROBOT_CREDITS: readonly RobotCredit\[\] = (\[[\s\S]*\]);\s*$/.exec(text);
  if (!m) throw new Error('src/robots/credits.ts: ROBOT_CREDITS not found (tools/robots/build.mjs changed its layout?)');
  return JSON.parse(m[1])
    .filter((c) => c.amber)
    .map((c) => ({ id: c.id, entry: `* ${c.name.en} (${c.maker})`, files: [...c.licenseFiles, ...(c.notice ? [c.notice] : [])] }));
}

/**
 * The robots' notices without the amber models: their entries go, and so does every licence section no
 * remaining entry names. Returns the text and the licence files (licenses/robots/…) that are left out.
 */
function withoutAmber(notices, amber) {
  const [head, ...sections] = notices.split(/\n(?=-{78}\nlicenses\/robots\/)/);
  const blocks = head.split(/\n\n(?=\* )/);
  const kept = blocks.filter((b) => !amber.some((a) => b.startsWith(a.entry + '\n')));
  if (blocks.length - kept.length !== amber.length) throw new Error(`robot notices: found ${blocks.length - kept.length} of ${amber.length} amber entries (LICENSES/robots/NOTICES.txt layout changed?)`);
  const named = new Set(kept.join('\n').match(/licenses\/robots\/[\w.-]+\.txt/g) ?? []);
  const dropped = [];
  const keptSections = sections.filter((sec) => {
    const file = /^-{78}\n(licenses\/robots\/[\w.-]+\.txt)/.exec(sec)?.[1];
    if (!file || named.has(file)) return true;
    dropped.push(file);
    return false;
  });
  // the entries end with a blank line before the first licence section, as in the full file
  return { text: [kept.join('\n\n').replace(/\s*$/, '\n'), ...keptSections].join('\n'), dropped };
}

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/** @param {{ root: string, showAmber?: boolean }} o */
export function thirdPartyNotices(o) {
  const root = o.root;
  const showAmber = o.showAmber !== false;
  return {
    name: 'emai:third-party-notices',
    apply: 'build',
    generateBundle(_options, bundle) {
      const pkgs = new Map();
      const headers = new Map();
      for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') continue;
        const ids = item.moduleIds ?? Object.keys(item.modules ?? {});
        for (const id of ids) {
          const p = packageOf(id);
          if (!p) continue;
          if (!pkgs.has(p.name)) pkgs.set(p.name, p.dir);
          if (OWN_HEADER.some((re) => re.test(p.file)) && fs.existsSync(p.file)) {
            const head = fs.readFileSync(p.file, 'utf8').split('\n').slice(0, 6).filter((l) => /^\s*(\/\/|\/\*|\*)/.test(l) && /licen|copyright/i.test(l));
            if (head.length) headers.set(path.relative(p.dir, p.file), { pkg: p.name, text: head.map((l) => l.replace(/^\s*(\/\/|\/\*+|\*\/?)\s?/, '')).join('\n') });
          }
        }
      }
      const out = [];
      out.push('THIRD-PARTY NOTICES — EmAI Academy · Schwebewerk', '='.repeat(48), '');
      out.push('This game (© EmAI) contains the third-party software, fonts and 3D models listed below,');
      out.push('each under its own licence. The licence texts follow each entry or are in licenses/.');
      out.push('Generated by the build from the modules it bundles (tools/notices-plugin.mjs).', '', '');
      out.push('SOFTWARE', '--------', '');
      const missing = [];
      const noRepoCopy = [];
      for (const name of [...pkgs.keys()].sort()) {
        const dir = pkgs.get(name);
        let pj = {};
        try {
          pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        } catch {
          /* no package.json (unusual) */
        }
        const lic = typeof pj.license === 'string' ? pj.license : pj.license?.type ?? null;
        const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => LICENSE_FILE.test(f)) : null;
        if (!lic && !file) missing.push(name);
        const home = pj.homepage ?? (typeof pj.repository === 'string' ? pj.repository : pj.repository?.url) ?? '';
        out.push(`* ${name} ${pj.version ?? ''} — ${lic ?? 'see licence text'}${home ? ` — ${home.replace(/^git\+/, '')}` : ''}`);
        out.push('');
        out.push(file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : `(no licence file in the package; package.json: ${lic})`);
        out.push('', '');
        for (const [rel, h] of headers) {
          if (h.pkg !== name) continue;
          out.push(`  - ${name}/${rel} carries its own notice:`, '', h.text.split('\n').map((l) => '    ' + l).join('\n'), '');
          // the meshoptimizer decoder: its project's full MIT text (LICENSES/npm/, tools/licenses-npm.mjs)
          const mo = path.join(root, 'LICENSES', 'npm', 'meshoptimizer.txt');
          if (/meshopt/.test(rel) && fs.existsSync(mo)) out.push(fs.readFileSync(mo, 'utf8').trim().split('\n').map((l) => '    ' + l).join('\n'), '');
          out.push('');
        }
        if (!fs.existsSync(path.join(root, 'LICENSES', 'npm', name.replace('/', '__') + '.txt'))) noRepoCopy.push(name);
      }
      if (missing.length) this.error(`no licence found for bundled package(s): ${missing.join(', ')}`);
      if (noRepoCopy.length) this.warn(`no LICENSES/npm/ copy for bundled package(s) ${noRepoCopy.join(', ')}: run node tools/licenses-npm.mjs`);
      // the in-game credits (src/core/credits.ts) should name every bundled package
      const creditsFile = path.join(root, 'src', 'core', 'credits.ts');
      if (fs.existsSync(creditsFile)) {
        const credits = fs.readFileSync(creditsFile, 'utf8');
        const unlisted = [...pkgs.keys()].filter((n) => !credits.includes(n === 'three' ? 'three.js' : n));
        if (unlisted.length) this.warn(`bundled but not in src/core/credits.ts SOFTWARE_CREDITS: ${unlisted.join(', ')}`);
      }
      out.push('FONTS', '-----', '');
      const ofl = path.join(root, 'LICENSES', 'OFL-1.1.txt');
      if (fs.existsSync(ofl)) out.push(fs.readFileSync(ofl, 'utf8').trim(), '');
      out.push('The 3D text\'s fallback glyph data (troika\'s unicode-font-resolver, MIT; Noto Sans Greek, OFL 1.1)', 'ships with its licences in fonts/unicode-resolver/.', '', '');
      const robots = path.join(root, 'LICENSES', 'robots', 'NOTICES.txt');
      let dropped = new Set();
      if (fs.existsSync(robots)) {
        let text = fs.readFileSync(robots, 'utf8').trim();
        if (!showAmber) {
          const r = withoutAmber(text, amberRobots(root));
          text = r.text.trim();
          dropped = new Set(r.dropped);
        }
        out.push(text, '');
      }
      this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY-NOTICES.txt', source: out.join('\n') + '\n' });
      for (const f of filesUnder(path.join(root, 'LICENSES'))) {
        const fileName = 'licenses/' + path.relative(path.join(root, 'LICENSES'), f).split(path.sep).join('/');
        if (dropped.has(fileName)) continue;
        // the robots' NOTICES.txt is the full list (amber included); the shipped one is THIRD-PARTY-NOTICES.txt
        if (!showAmber && fileName === 'licenses/robots/NOTICES.txt') {
          this.emitFile({ type: 'asset', fileName, source: withoutAmber(fs.readFileSync(f, 'utf8'), amberRobots(root)).text });
          continue;
        }
        this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(f) });
      }
    },
  };
}
