/**
 * A hall robot as a Discover card (WP-D2, plan §3.4): the hall's Datenblatt rows, copied — kind, „Kann
 * heute“, size, the size measured on the model (MODELL), payload with its condition, model & licence
 * (the attribution the licences require; the amber line on an amber exhibit) and, at the foot, the
 * sources with „Stand 17.10.2026“. Every number keeps the chip the hall gives it. Plain data.
 */
import type { CardAction, CardSpec } from '../types';
import type { Bi, GenRobot, GenRow, ViewerText } from './types';

type Row = Extract<CardSpec['blocks'][number], { kind: 'rows' }>['rows'][number];

const join = (a: Bi, sep: string, b: Bi): Bi => ({ de: `${a.de}${sep}${b.de}`, en: `${a.en}${sep}${b.en}` });

export function robotCard(r: GenRobot, text: Pick<ViewerText, 'ka'>, actions?: CardAction[]): CardSpec {
  const row = (g: GenRow): Row => ({ label: g.label, value: g.value ?? text.ka, chip: g.chip ?? undefined, cond: g.cond ?? undefined });
  const rows: Row[] = [
    row(r.kind),
    { label: r.can.label, value: r.can.value ?? text.ka, chip: r.can.chip ?? undefined },
    row(r.rows.size),
    row(r.rows.model),
    row(r.rows.payload),
    row(r.rows.license),
  ];
  const src = r.rows.source;
  return {
    id: `robot:${r.id}`,
    eyebrow: join(r.catLabel, ' · ', r.status),
    title: r.name,
    blocks: [{ kind: 'rows', rows }],
    actions,
    srcLine: src.value ? join(join(src.label, ': ', src.value), ' · ', r.asOf) : join(src.label, ': ', r.asOf),
  };
}
