/**
 * One robot's Datenblatt as rows (plan §4.9 „Datenblatt“, R4 §7.4): the stand's plate, the DOM card, the
 * compare stage and tools/hall-check all read this, so a number shows the same way with the same chip
 * everywhere. Language-bound: `sheet(r, lang)` returns plain strings.
 */
import type { Lang, RobotId, RobotManifestEntry } from '@/core/zones';
import { BAND_LABEL, PRICE_LABEL, PRICE_NOT_INVOICE, PRICE_ON_REQUEST, PRICES, type Price } from './data/prices';
import type { Bi, HallRobot, RowChip, RowKey, Val } from './data/robots';
import { AS_OF, SOURCES, type SourceId } from './data/sources';
import { STRINGS } from './strings';
import { CLIPS } from './data/clips';

export type ChipId = RowChip;
export interface SheetRow {
  key: RowKey | 'price' | 'limits' | 'model' | 'source' | 'license';
  label: string;
  /** null = „k. A.“ */
  value: string | null;
  chip: ChipId | null;
  cond: string | null;
  /** source label (tooltip / „Mehr“) */
  src: string | null;
}

export interface Sheet {
  id: RobotId;
  name: string;
  vendor: string;
  kind: string;
  cat: string;
  status: string;
  /** the open view (≤ 35 words): size, payload, price */
  head: SheetRow[];
  /** everything on „Mehr“ */
  more: SheetRow[];
  price: { band: string; basis: string; date: string; also: string | null; line: string; chip: ChipId };
  asOf: string;
  animated: boolean;
  amber: boolean;
}

/** a string of the zone table in one language (no i18n instance needed: the stand plates and the tools) */
export function zs(lang: Lang, key: string, params: Record<string, string | number> = {}): string {
  const pick = (t: unknown): unknown => key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), t);
  let v = pick(lang === 'en' ? STRINGS.en : STRINGS.de) ?? pick(STRINGS.de);
  if (v && typeof v === 'object' && 'entdecker' in (v as object)) v = (v as { entdecker: string }).entdecker;
  const s = typeof v === 'string' ? v : key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

const bi = (b: Bi, lang: Lang): string => (lang === 'en' ? b.en : b.de);

function row(key: SheetRow['key'], label: string, v: Val | null, lang: Lang): SheetRow {
  return {
    key,
    label,
    value: v ? (lang === 'en' ? v.en : v.de) : null,
    chip: v ? v.chip : null,
    cond: v?.cond ? bi(v.cond, lang) : null,
    src: v?.src ? SOURCES[v.src].label : null,
  };
}

export function priceText(p: Price, lang: Lang): Sheet['price'] {
  const band = bi(BAND_LABEL[p.band], lang);
  const basis = zs(lang, `price.${p.basis}`);
  const src = p.source ? SOURCES[p.source].label : null;
  let line = p.band === 'anfrage' ? bi(PRICE_ON_REQUEST, lang) : bi(PRICE_NOT_INVOICE, lang);
  if (p.historical) line = `${zs(lang, 'price.historical')} · ${line}`;
  const also = p.also ? zs(lang, 'price.also', { band, upTo: bi(p.also.upTo, lang) }) : null;
  void src;
  return { band, basis, date: lang === 'en' ? p.date.en : p.date.de, also, line, chip: 'quelle' };
}

/** the model height (MODELL) from the manifest, formatted like the vendor value */
export function modelHeight(info: Pick<RobotManifestEntry, 'heightM'> | null, lang: Lang): string | null {
  if (!info) return null;
  const v = info.heightM;
  const s = v >= 1 ? `${v.toFixed(2)} m` : `${v.toFixed(2)} m`;
  return lang === 'de' ? s.replace('.', ',') : s;
}

export function sheet(r: HallRobot, lang: Lang, info: RobotManifestEntry | null): Sheet {
  const L = (k: string): string => zs(lang, `row.${k}`);
  const p = PRICES[r.id];
  const price = priceText(p, lang);
  const size = row('size', L('size'), r.rows.size, lang);
  const payload = row('payload', L('payload'), r.rows.payload, lang);
  const priceRow: SheetRow = {
    key: 'price',
    label: L('price'),
    value: price.also ?? `${price.band}${p.band === 'anfrage' ? '' : ` · ${price.basis}`}`,
    chip: p.band === 'anfrage' ? null : 'quelle',
    cond: null,
    src: p.source ? SOURCES[p.source].label : null,
  };
  const mh = modelHeight(info, lang);
  const more: SheetRow[] = [];
  more.push({ key: 'kind', label: L('kind'), value: `${bi(r.kind, lang)} · ${zs(lang, `moves.${r.facts.moves}`)}${r.facts.lifts ? '' : ` · ${zs(lang, 'moves.noLift')}`}`, chip: null, cond: null, src: null });
  if (mh) more.push({ key: 'model', label: L('model'), value: r.id === 'open-duck-mini-v2' ? `${mh} · ${L('whyDiffers')}` : mh, chip: 'modell', cond: null, src: null });
  more.push(row('weight', L('weight'), r.rows.weight, lang));
  more.push(row('dof', L('dof'), r.rows.dof, lang));
  if (info) more.push({ key: 'model', label: '', value: L('modelJoints').replace('{n}', String(info.joints.filter((j) => !j.mimic).length)), chip: 'modell', cond: null, src: null });
  for (const k of ['reach', 'speed', 'runtime', 'env'] as const) more.push(row(k, L(k), r.rows[k], lang));
  more.push({ key: 'can', label: L('can'), value: bi(r.can, lang), chip: r.can.chip, cond: null, src: r.can.src ? SOURCES[r.can.src].label : null });
  more.push({ key: 'limits', label: L('limits'), value: bi(r.limits, lang), chip: r.limits.chip, cond: null, src: r.limits.src ? SOURCES[r.limits.src].label : null });
  more.push({ key: 'price', label: bi(PRICE_LABEL, lang), value: p.figure ? `${price.band} · ${bi(p.figure, lang)}` : price.band, chip: p.band === 'anfrage' && !p.figure ? null : 'quelle', cond: price.line, src: p.source ? SOURCES[p.source].label : null });
  if (info) more.push({ key: 'license', label: L('license'), value: `${info.license.spdx} · ${bi(info.attribution, lang)}`, chip: null, cond: r.amber ? zs(lang, 'card.amber') : null, src: null });
  const srcIds = new Set<SourceId>();
  for (const v of Object.values(r.rows)) if (v?.src) srcIds.add(v.src);
  if (r.statusSrc) srcIds.add(r.statusSrc);
  if (p.source) srcIds.add(p.source);
  more.push({ key: 'source', label: L('source'), value: [...srcIds].map((id) => SOURCES[id].label).join(' · '), chip: null, cond: null, src: null });
  return {
    id: r.id,
    name: info ? bi(info.name, lang).replace(/ \(Folgearm\)| \(follower arm\)| \(Fahrbasis\)| \(mobile base\)/, '') : r.short,
    vendor: info?.vendor ?? '',
    kind: bi(r.kind, lang),
    cat: zs(lang, `cat.${r.cat}`),
    status: zs(lang, `status.${r.status}`),
    head: [size, payload, priceRow],
    more,
    price,
    asOf: zs(lang, 'row.asOf', { date: lang === 'en' ? AS_OF.en : AS_OF.de }),
    animated: !!CLIPS[r.id],
    amber: !!r.amber,
  };
}

/** chip label in a language */
export function chipLabel(c: ChipId, lang: Lang): string {
  return zs(lang, `chip.${c === 'herstellerangabe' ? 'ha' : c === 'quelle' ? 'qu' : 'mo'}`);
}
