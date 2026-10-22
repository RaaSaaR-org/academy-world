/**
 * Where every tour text comes from (WP-D1, plan §3.1). tools/discover/content.mjs reads this spec, loads
 * each named source through Vite's SSR loader (or reads the literal out of the named file) and writes
 * src/discover/data/content.gen.ts, where every text carries its `from`. Nothing here is retyped: a text
 * is a key of an existing string table, a manifest field, or an inline { de, en } literal of a game file.
 * `pick` keeps a part of the source string (it must occur in it), `form` only changes letter case.
 * `--check` regenerates in memory and fails on any difference (drift).
 *
 * Plain data: no imports, so the generator, the 3D tour and the stills tour can all read it.
 */

/** a module under src/ and the dotted path of an export; `{lang}` = de / en, else the value is a { de, en } object */
export interface ModSrc {
  mod: string;
  key: string;
  pick?: { de: string; en: string };
  form?: 'title' | 'cap';
}
/** an inline { de: '…', en: '…' } literal (or t('…', '…') call) in `file` whose German text contains `find` */
export interface FileSrc {
  file: string;
  find: string;
  pick?: { de: string; en: string };
  form?: 'title' | 'cap';
}
export type Src = ModSrc | FileSrc;
/** several sources joined (eyebrows and titles of the two-zone stops) */
export interface JoinSrc {
  join: Src[];
  sep?: string;
  prefix?: string;
}
export type SrcText = Src | JoinSrc;

/** the chips of src/ui/Kit.ts (the `.chip chip-<type>` contract) */
export type SpecChip = 'quelle' | 'fiktion' | 'herstellerangabe' | 'modell' | 'richtwert' | 'studie';

export type BlockSrc =
  | { p: SrcText; chip?: SpecChip; src?: SrcText }
  | { rows: { label: SrcText; value: SrcText; chip?: SpecChip }[] };

export interface CardSrc {
  eyebrow?: SrcText;
  title: SrcText;
  blocks: BlockSrc[];
  srcLine?: SrcText;
}

/**
 * A number (or point) the stops and spots are built from: an export path, or a call of an exported
 * function; `fields` keeps only these keys (of the value, or of each element of an array).
 */
export type AnchorSrc = ({ mod: string; key: string } | { mod: string; call: string; args: unknown[] }) & { fields?: string[] };

// ── sources ──────────────────────────────────────────────────────────────────────────────────────

const CORE = '/src/i18n/core.ts';
const LAYOUT = '/src/world/layout.ts';
const LAYOUT_CAM = '/src/world/ground/camera.ts';
const START = '/src/world/start/strings.ts';
const REGION = '/src/world/region/strings.ts';
const LIFT = '/src/world/finale/liftoff/strings.ts';
const man = (id: string, field: 'title' | 'eyebrow' | 'verb' | 'takeaway' | 'systemLabel'): ModSrc => ({ mod: `/src/zones/${id}/manifest.ts`, key: `default.${field}` });
const zs = (id: string, path: string): ModSrc => ({ mod: `/src/zones/${id}/strings.ts`, key: `STRINGS.{lang}.${path}` });
const core = (path: string): ModSrc => ({ mod: CORE, key: `coreStrings.{lang}.${path}` });
const start = (k: string): ModSrc => ({ mod: START, key: `START.${k}` });
const region = (path: string): ModSrc => ({ mod: REGION, key: `STRINGS.{lang}.region.${path}` });
const lift = (k: string): ModSrc => ({ mod: LIFT, key: `L.${k}` });
const zonePair = (a: string, b: string): { eyebrow: JoinSrc; title: JoinSrc } => ({
  eyebrow: { join: [man(a, 'verb'), man(b, 'verb')], sep: ' · ', prefix: '// ' },
  title: { join: [man(a, 'title'), man(b, 'title')], sep: ' · ' },
});
const lessonRow = (id: string, path: string): { label: SrcText; value: SrcText } => ({ label: man(id, 'title'), value: zs(id, path) });

/** The top bar's stop titles (plan §3.2 table). */
export const STOP_TITLES: Record<string, SrcText> = {
  // „Trockendock 3 liegt in der letzten Grube.“
  dock: { ...start('bridgePlaque'), pick: { de: 'Trockendock 3', en: 'Dry Dock 3' } },
  // the bridge-head plaque „DAS REVIER“
  brueckenkopf: { ...start('bridgePlaqueTitle'), form: 'title' },
  // „Geh über die Brücke und die Allee hinauf zur Libelle.“
  libelle: { ...start('toLibelle'), pick: { de: 'Libelle', en: 'spirit level' }, form: 'cap' },
  'zonen-west': zonePair('sensordom', 'prueffeld').title,
  'zonen-nord': zonePair('regelgarten', 'greifwerkstatt').title,
  schauhalle: man('schauhalle', 'title'),
  'zonen-ost': zonePair('lern-dojo', 'dunkelfabrik').title,
  // „Komm zum Ausguck – wir starten.“
  ausguck: { ...start('readyGo'), pick: { de: 'Ausguck', en: 'lookout' }, form: 'cap' },
  grubenrand: region('way.grubenrand'),
  sonnenacker: man('sonnenacker', 'title'),
  traumhangar: man('traumhangar', 'title'),
  abheben: lift('liftOff'),
};

/** The cards: `stop:<id>` (the stop's own card) and `spot:<id>` (a hotspot, plan §3.3). */
export const CARD_SPEC: Record<string, CardSrc> = {
  'stop:dock': {
    eyebrow: core('start.kicker'),
    title: core('brand.tagline'),
    blocks: [{ p: { join: [lift('capFalling'), lift('capCatching')], sep: ' ' }, chip: 'fiktion' }],
  },
  'stop:brueckenkopf': {
    eyebrow: { join: [start('bridgePlaqueTitle')], prefix: '// ' },
    title: STOP_TITLES.brueckenkopf,
    blocks: [{ p: start('bridgePlaque'), chip: 'fiktion' }, { p: region('chronik.fiktion') }],
  },
  'stop:libelle': {
    eyebrow: start('airEyebrow'),
    title: STOP_TITLES.libelle,
    blocks: [{ p: start('libelleAsk') }, { p: start('libelleGround'), chip: 'fiktion' }, { p: { ...start('libelleFiktion'), pick: { de: 'Der Regelkreis dahinter ist echt.', en: 'The control loop behind it is real.' } } }],
  },
  'stop:zonen-west': {
    ...zonePair('sensordom', 'prueffeld'),
    blocks: [{ p: start('first2') }, { rows: [lessonRow('sensordom', 'game.a.lesson'), lessonRow('prueffeld', 'game.a.lesson')] }],
  },
  'stop:zonen-nord': {
    ...zonePair('regelgarten', 'greifwerkstatt'),
    blocks: [
      { rows: [lessonRow('regelgarten', 'game.b.lesson'), lessonRow('greifwerkstatt', 'game.c.lesson')] },
      // the Greifwerkstatt C plaque (RELEASE §5: UR5e datasheet, R4 S40)
      { p: zs('greifwerkstatt', 'c.urBody'), chip: 'herstellerangabe', src: zs('greifwerkstatt', 'c.urSrc') },
    ],
  },
  'stop:schauhalle': {
    eyebrow: man('schauhalle', 'eyebrow'),
    title: man('schauhalle', 'title'),
    blocks: [{ p: zs('schauhalle', 'lh.lesson') }, { p: zs('schauhalle', 'plaque') }],
    srcLine: zs('schauhalle', 'disclaimer'),
  },
  'stop:zonen-ost': {
    ...zonePair('lern-dojo', 'dunkelfabrik'),
    blocks: [{ rows: [lessonRow('lern-dojo', 'game.c.lesson'), lessonRow('dunkelfabrik', 'game.a.lesson')] }],
  },
  'stop:ausguck': {
    eyebrow: { join: [region('map.tab')], prefix: '// ' },
    title: STOP_TITLES.ausguck,
    // D43: the pit is fiction
    blocks: [{ p: lift('pit'), chip: 'fiktion' }],
  },
  'stop:grubenrand': {
    eyebrow: region('chronik.eyebrow'),
    title: region('chronik.title'),
    blocks: [
      {
        rows: [
          { label: region('chronik.t1'), value: region('chronik.b1') },
          { label: region('chronik.t2'), value: region('chronik.b2') },
          { label: region('chronik.t3'), value: region('chronik.b3') },
        ],
      },
      { p: region('chronik.fiktion'), chip: 'fiktion' },
    ],
  },
  'stop:sonnenacker': {
    eyebrow: man('sonnenacker', 'eyebrow'),
    title: man('sonnenacker', 'title'),
    blocks: [
      { p: man('sonnenacker', 'takeaway') },
      // RELEASE §5 „Agrivoltaics and the Sonnenacker“: Kujawa et al. 2025 (R8 S15), Barron-Gafford et al. 2019 (R8 S13)
      { p: zs('sonnenacker', 'b.card.p1'), chip: 'quelle', src: zs('sonnenacker', 'src.almeria') },
      { p: zs('sonnenacker', 'b.card.p2'), chip: 'quelle', src: zs('sonnenacker', 'src.arizona') },
    ],
  },
  'stop:traumhangar': {
    eyebrow: man('traumhangar', 'eyebrow'),
    title: man('traumhangar', 'title'),
    blocks: [{ p: zs('traumhangar', 'request') }, { p: man('traumhangar', 'takeaway') }, { p: zs('traumhangar', 'a.lesson') }],
  },
  'stop:abheben': {
    eyebrow: lift('consoleTitle'),
    title: lift('liftOff'),
    blocks: [{ p: start('startklar') }, { p: lift('fiction'), chip: 'fiktion' }],
  },

  // ── spots (plan §3.3) ──
  'spot:turm': {
    // the Allee's floor plaque (src/world/landscape/numberline.ts)
    eyebrow: { join: [{ file: 'src/world/landscape/numberline.ts', find: 'RECAMÁN-FOLGE', pick: { de: 'RECAMÁN-FOLGE · OEIS A005132', en: 'RECAMÁN SEQUENCE · OEIS A005132' } }], prefix: '// ' },
    title: { file: 'src/world/radio.ts', find: 'Turm', form: 'cap' },
    blocks: [{ p: { file: 'src/world/landscape/numberline.ts', find: 'a(n) = a(n−1) − n' }, chip: 'quelle', src: { file: 'src/world/landscape/numberline.ts', find: 'RECAMÁN-FOLGE', pick: { de: 'OEIS A005132', en: 'OEIS A005132' } } }],
  },
  'spot:haltearme': {
    title: { ...core('quest.telemetry.arms'), form: 'title' },
    blocks: [{ p: { ...start('dock'), pick: { de: 'Die Haltearme fangen jede Böe ab.', en: 'The holding arms catch every gust.' } }, chip: 'fiktion' }, { p: { ...start('libelleAsk'), pick: { de: 'Am Boden hält der Regelkern die Insel über die Haltearme.', en: 'On the ground the control core holds the island through the holding arms.' } } }],
  },
  'spot:rotoren': {
    title: { mod: START, key: 'PANEL.lift', form: 'title' },
    blocks: [
      { p: { ...start('first2'), pick: { de: 'Auftrieb kommt aus den sechs Zonen.', en: 'Lift comes from the six zones.' } }, chip: 'fiktion' },
      {
        rows: (
          [
            ['sensordom', 'M1'],
            ['regelgarten', 'M2'],
            ['greifwerkstatt', 'M3'],
            ['lern-dojo', 'M4'],
            ['dunkelfabrik', 'M5'],
            ['prueffeld', 'M6'],
          ] as const
        ).map(([id, m]) => ({ label: man(id, 'systemLabel'), value: { mod: START, key: `ROTOR_LINE.${m}` } })),
      },
    ],
  },
  'spot:glasbalkon': {
    title: { file: 'src/ui/MapPanel.ts', find: 'Glasboden', form: 'cap' },
    blocks: [{ p: start('balconyGround'), chip: 'fiktion' }],
  },
  'spot:kreislaufhof': {
    eyebrow: zs('kreislaufhof', 'card.info.eyebrow'),
    title: man('kreislaufhof', 'title'),
    blocks: [
      { p: man('kreislaufhof', 'takeaway') },
      // RELEASE §5 „Revier scenes“: UNITAR/ITU, Global E-waste Monitor 2024 (R8 S33)
      { p: zs('kreislaufhof', 'card.info.b1'), chip: 'quelle', src: zs('kreislaufhof', 'card.info.srcUn') },
    ],
  },
  'spot:unkrautacker': {
    title: man('unkrautacker', 'title'),
    blocks: [{ p: man('unkrautacker', 'takeaway') }, { p: zs('unkrautacker', 'game.lesson') }],
  },
};

/** Button labels the game already has (copied like the card texts). */
export const LABELS: Record<string, SrcText> = {
  /** the title's „Abheben ansehen“: the abheben card's way into D3's film */
  replay: core('start.replay'),
};

/** The spots whose card is a stop's card (plan §3.3: „libelle“ START.libelle*, „grubenrand“ region.chronik). */
export const CARD_ALIAS: Record<string, string> = {
  'spot:libelle': 'stop:libelle',
  'spot:grubenrand': 'stop:grubenrand',
};

/** The layout numbers the stops and spots are built from (copied into content.gen.ts, checked for drift). */
export const ANCHOR_SPEC: Record<string, AnchorSrc> = {
  /** the drone R-3 at the dock (plan §3.2 stop 1): outsideCamera('C1', h 0, t 24) */
  c1: { mod: LAYOUT_CAM, call: 'outsideCamera', args: ['C1', 0, 24] },
  revierSpawn: { mod: LAYOUT, key: 'REVIER.spawn' },
  libelle: { mod: LAYOUT, key: 'LIBELLE.center' },
  sculpture: { mod: LAYOUT, key: 'TOWER.sculpture.center' },
  ausguckY: { mod: LAYOUT, key: 'TOWER.ausguck.y' },
  arms: { mod: LAYOUT, key: 'TROCKENDOCK.arms' },
  glasbalkon: { mod: LAYOUT, key: 'ISLAND.glasbalkon.center' },
  zones: { mod: LAYOUT, key: 'ZONE_PLOTS', fields: ['id', 'bearing', 'anchor', 'radius'] },
  hall: { mod: LAYOUT, key: 'HALL_PLOTS.0', fields: ['id', 'anchor', 'shape'] },
  sites: { mod: LAYOUT, key: 'SITE_PLOTS', fields: ['id', 'anchor', 'facingDeg', 'shape', 'spawn'] },
  grubenrand: { mod: LAYOUT, key: 'LANDMARKS.grubenrand.position' },
  /** the launch console's stand (src/world/finale/liftoff/console.ts standPose, the finale's toConsole) */
  console: { mod: '/src/world/finale/liftoff/console.ts', call: 'standPose', args: [] },
  /** the Sonnenacker's own spawn at the east gate (plot-local) */
  sonnenackerSpawn: { mod: '/src/zones/sonnenacker/manifest.ts', key: 'default.spawn' },
};
