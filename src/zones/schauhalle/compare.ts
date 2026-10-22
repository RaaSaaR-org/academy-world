/**
 * The compare stage (plan §4.9, R4 §7.3): Bühne A + B, two robots at true scale side by side, their
 * cards aligned row by row — no winner, no score (ranking real vendors is off-brand, and UR's terms
 * forbid comparative advertising for the meshes we do not use). C in the Inspektion puts a robot on
 * the next stage; E at the console opens the comparison.
 */
import type { RobotId, RobotManifestEntry, ZoneContext } from '@/core/zones';
import { ROBOT_BY_ID } from './data/robots';
import { STAGES } from './layout';
import type { Showroom } from './showroom';
import { sheet, zs, type SheetRow } from './sheet';
import { el, ensureCss } from './ui';

export interface Compare {
  /** put a robot on the next stage (A, then B, then the older one is replaced) */
  add(id: RobotId): 'a' | 'b';
  readonly a: RobotId | null;
  readonly b: RobotId | null;
  open(): void;
  clear(): void;
  /** the delivery takes Bühne A for a moment */
  readonly busy: boolean;
}

export function buildCompare(ctx: ZoneContext, show: Showroom, infos: ReadonlyMap<RobotId, RobotManifestEntry>, deliveryBusy: () => boolean): Compare {
  const slots: { a: RobotId | null; b: RobotId | null } = { a: null, b: null };
  let last: 'a' | 'b' = 'b';
  let viewing = false;
  let host: HTMLElement | null = null;
  let all = false;

  const put = (slot: 'a' | 'b', id: RobotId | null): void => {
    slots[slot] = id;
    if (slot === 'a' && deliveryBusy()) return;
    show.setStage(slot, id, { focus: viewing });
  };

  const render = (): void => {
    if (!host) return;
    ensureCss();
    const L = ctx.i18n.lang;
    const z = (k: string): string => zs(L, k);
    const root = el('div', { class: 'sh' });
    // the operate title bar carries „// BÜHNE A · BÜHNE B“: the panel starts with its name
    root.appendChild(el('h3', null, z('compare.title')));
    if (!slots.a || !slots.b) {
      root.appendChild(el('div', { class: 'line' }, z('compare.empty')));
      host.replaceChildren(root);
      return;
    }
    const A = sheet(ROBOT_BY_ID.get(slots.a)!, L, infos.get(slots.a) ?? null);
    const B = sheet(ROBOT_BY_ID.get(slots.b)!, L, infos.get(slots.b) ?? null);
    const rowsOf = (s: typeof A): SheetRow[] => [...s.head, ...s.more];
    const keys = all ? ['size', 'model', 'weight', 'dof', 'payload', 'reach', 'speed', 'runtime', 'env', 'price'] : ['size', 'payload'];
    const grid = el('div', { class: 'cmp' }, el('div', { class: 'h' }), el('div', { class: 'h', title: A.name }, `A · ${ROBOT_BY_ID.get(slots.a)!.short}`), el('div', { class: 'h', title: B.name }, `B · ${ROBOT_BY_ID.get(slots.b)!.short}`));
    // one row = one block (display: contents keeps the grid): a chip both values share sits once, under
    // the row's label; differing chips sit in their cells
    const cell = (r: SheetRow | undefined, own: boolean): HTMLElement => {
      const v = r?.value ?? z('ka');
      const c = el('div', { class: 'v' }, v);
      if (own && r?.chip && r.value) c.appendChild(ctx.ui.chip(r.chip));
      if (all && r?.cond) c.appendChild(el('div', { class: 'cond' }, r.cond));
      return c;
    };
    for (const k of keys) {
      const ra = rowsOf(A).find((r) => r.key === k && r.label);
      const rb = rowsOf(B).find((r) => r.key === k && r.label);
      const shared = !!ra?.chip && !!ra.value && !!rb?.value && ra.chip === rb?.chip ? ra.chip : null;
      const label = el('div', { class: 'k' }, (ra ?? rb)?.label ?? k);
      if (shared) label.appendChild(el('div', null, ctx.ui.chip(shared)));
      grid.appendChild(el('div', { class: 'row', style: 'display: contents' }, label, cell(ra, !shared), cell(rb, !shared)));
    }
    root.appendChild(grid);
    const btns = el(
      'div',
      { class: 'btns' },
      el('button', { class: 'btn small ghost', onclick: () => ((all = !all), ctx.audio.play('click'), render()) }, all ? z('card.less') : z('compare.all')),
      el('button', { class: 'btn small ghost', onclick: () => (ctx.audio.play('click'), api.clear(), render()) }, z('compare.clear')),
    );
    root.appendChild(btns);
    host.replaceChildren(root);
  };

  const api: Compare = {
    add(id) {
      const slot: 'a' | 'b' = !slots.a ? 'a' : !slots.b ? 'b' : last === 'a' ? 'b' : 'a';
      last = slot;
      if (slots.a === id || slots.b === id) return slots.a === id ? 'a' : 'b';
      put(slot, id);
      const name = ROBOT_BY_ID.get(id)?.short ?? id;
      ctx.hud.toast((lang) => zs(lang, 'compare.added', { name, stage: slot.toUpperCase() }), { kind: 'info', duration: 3 });
      ctx.game.juice.cue('tick');
      ctx.events.emit('schauhalle:compare', { a: slots.a, b: slots.b });
      render();
      return slot;
    },
    get a() {
      return slots.a;
    },
    get b() {
      return slots.b;
    },
    open() {
      viewing = true;
      for (const s of ['a', 'b'] as const) if (slots[s]) put(s, slots[s]);
      const [ax, az] = STAGES.a;
      const [bx] = STAGES.b;
      const mx = (ax + bx) / 2;
      ctx.player.enterOperate({
        cameraPose: { position: [mx, 1.75, az + 5.2], lookAt: [mx, 0.95, az] },
        title: (lang) => zs(lang, 'compare.eyebrow'),
        panel: (h) => {
          host = h;
          render();
          return () => {
            host = null;
          };
        },
        panelPosition: 'right',
        onExit() {
          viewing = false;
          for (const s of ['a', 'b'] as const) if (slots[s]) put(s, slots[s]);
        },
      });
    },
    clear() {
      put('a', null);
      put('b', null);
    },
    get busy() {
      return viewing;
    },
  };
  ctx.i18n.onChange(render);
  return api;
}
