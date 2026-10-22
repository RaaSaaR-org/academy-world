/**
 * Pannen-Wand + Fundvitrine (plan §4.9, §3.4, §4.13; R6, R9 §5): the failure-mode album as small
 * exhibits on the west wall, and next to it the 25-compartment cabinet for the secrets. Secret objects
 * are WP15's (ctx.game.secrets.registerObject, ≤ 300 triangles each): the hall places a copy of each
 * found one by id in the next compartment. E at either opens a close-up; clicking an exhibit opens its
 * story (the album text, or the secret's card). Nothing here gates anything (D35).
 */
import * as THREE from 'three';
import type { SecretDef, Text, ZoneContext, ZoneSecrets } from '@/core/zones';
import { buildAtlas, type TextAtlas } from './atlas';
import { FONT } from './geo';
import { PANNEN, VITRINE } from './layout';
import { fitText, INK, para } from './look';
import { zs } from './sheet';
import { el, ensureCss } from './ui';

/** the album view the Pannen-Wand reads (ctx.pass.album(), additive in WP4's ZonePass) */
interface AlbumEntry {
  id: string;
  zoneId: string;
  title: Text;
  text: Text;
  found: boolean;
}

type SecretsPlus = ZoneSecrets & { list?(): SecretDef[]; openCard?(id: string): boolean };

export interface Vitrine {
  update(dt: number): void;
  openPannen(): void;
  openVitrine(): void;
  /** found secrets shown / album entries found (hall-check) */
  stats(): { secrets: number; placed: number; album: number; albumTotal: number };
}

const SLOTS = 12;

export function buildVitrine(ctx: ZoneContext): Vitrine {
  const det = ctx.groups.detail;
  const S = ctx.game.secrets as SecretsPlus;
  const album = (): AlbumEntry[] => {
    const list = ctx.pass.album?.();
    if (list) return list;
    // without the album view: the found ids only (titles unknown)
    return ctx.pass.snapshot().album.map((id) => ({ id, zoneId: '', title: id, text: '', found: true }));
  };

  // ── Pannen-Wand plaques: 12 slots (3 rows × 4), one atlas ─────────────────
  const { x, z0, z1 } = PANNEN;
  const pw = (z0 - z1 - 0.2) / 4;
  const plaques: { at: THREE.Vector3 }[] = [];
  const regions = Array.from({ length: SLOTS }, (_, i) => ({
    id: `p${i}`,
    w: 250,
    h: 112,
    draw: (g: CanvasRenderingContext2D, w: number, h: number) => {
      const list = album();
      const e = list[i];
      g.fillStyle = e?.found ? INK.bg2 : '#141210';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = e?.found ? INK.amber : INK.line;
      g.lineWidth = 2;
      g.strokeRect(1, 1, w - 2, h - 2);
      if (!e) return;
      g.textBaseline = 'alphabetic';
      if (e.found) {
        fitText(g, `// ${e.zoneId.toUpperCase()}`, 12, 24, w - 24, 13, (px) => FONT.mono(px, 500), INK.text2);
        para(g, ctx.i18n.resolve(e.title), 12, 34, w - 24, 19, 23, INK.text, (px) => FONT.sans(px, 600), 3);
      } else fitText(g, '?', w / 2, h / 2 + 14, 40, 40, (px) => FONT.display(px), INK.line, 'center');
    },
  }));
  const quads = regions.map((r, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const at = new THREE.Vector3(x + 0.075, 2.05 - row * 0.45, z0 - 0.1 - pw / 2 - col * pw);
    plaques.push({ at });
    return { region: r.id, w: pw - 0.08, h: 0.36, at: [at.x, at.y, at.z] as [number, number, number], ry: Math.PI / 2 };
  });
  const pannenAtlas: TextAtlas = buildAtlas('pannen', [1024, 512], regions, quads);
  det.add(pannenAtlas.mesh);
  ctx.onDispose(() => pannenAtlas.dispose());
  const redrawPannen = (): void => pannenAtlas.redraw();
  ctx.i18n.onChange(redrawPannen);
  ctx.events.on('album:unlocked', redrawPannen);

  // ── Fundvitrine: copies of the found secrets' objects, one per compartment ──
  const content = new THREE.Group();
  content.name = 'schauhalle:vitrine-content';
  det.add(content);
  const cw = (VITRINE.z0 - VITRINE.z1) / VITRINE.cols;
  const chh = (VITRINE.y1 - VITRINE.y0) / VITRINE.rows;
  const cellAt = (i: number): THREE.Vector3 => {
    const r = Math.floor(i / VITRINE.cols);
    const c = i % VITRINE.cols;
    return new THREE.Vector3(VITRINE.x, VITRINE.y1 - (r + 1) * chh + 0.012, VITRINE.z0 - (c + 0.5) * cw);
  };
  const placedIds: string[] = [];
  const objOf = (id: string): string | null => {
    const def = S.list?.().find((dd) => dd.id === id);
    if (def) return def.reward.kind === 'vitrine' ? def.reward.object : null;
    return id;
  };
  const rebuild = (): void => {
    for (const c of [...content.children]) content.remove(c);
    placedIds.length = 0;
    const found = S.found();
    let i = 0;
    for (const id of found) {
      if (i >= VITRINE.cols * VITRINE.rows) break;
      const objectId = objOf(id);
      if (!objectId) continue;
      const src = S.object(objectId);
      if (!src) continue;
      const o = src.clone(true);
      // fit the compartment: ≤ 0.8 of its width and height, standing on its floor
      const b = new THREE.Box3().setFromObject(o);
      const size = b.getSize(new THREE.Vector3());
      const k = Math.min(1, (cw * 0.7) / Math.max(1e-3, size.x, size.z), (chh * 0.75) / Math.max(1e-3, size.y));
      o.scale.multiplyScalar(k);
      const at = cellAt(i);
      o.position.set(at.x - (b.min.x + b.max.x) * 0.5 * k, at.y - b.min.y * k, at.z - (b.min.z + b.max.z) * 0.5 * k);
      o.userData.secret = id;
      o.traverse((m) => {
        m.userData.secret = id;
        m.castShadow = false;
      });
      content.add(o);
      placedIds.push(id);
      i++;
    }
  };
  rebuild();
  ctx.events.on('secret:found', () => rebuild());
  ctx.events.on('progress:reset', () => rebuild());

  // ── close-ups ────────────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const openPanel = (kind: 'pannen' | 'vitrine', render: (host: HTMLElement) => void, pick: (o: THREE.Vector3, d: THREE.Vector3) => void): void => {
    ensureCss();
    const midZ = kind === 'pannen' ? (PANNEN.z0 + PANNEN.z1) / 2 : (VITRINE.z0 + VITRINE.z1) / 2;
    ctx.player.enterOperate({
      cameraPose: { position: [x + (kind === 'pannen' ? 3.4 : 2.8), 1.65, midZ], lookAt: [x, kind === 'pannen' ? 1.6 : 1.35, midZ] },
      title: ctx.i18n.text(`${kind}.title`),
      panel: (h) => render(h),
      panelPosition: 'right',
      onPointer(e) {
        if (e.type === 'down' && e.button === 0) pick(e.origin, e.direction);
      },
    });
  };

  return {
    update() {
      // the finds only near the cabinet (≤ 25 small draws)
      const p = ctx.player.positionLocal();
      content.visible = Math.hypot(p.x - VITRINE.x, p.z - (VITRINE.z0 + VITRINE.z1) / 2) < 9;
    },
    openPannen() {
      const list = album();
      const n = list.filter((e) => e.found).length;
      openPanel(
        'pannen',
        (h) => {
          const root = el('div', { class: 'sh' }, el('div', { class: 'eyebrow' }, zs(ctx.i18n.lang, 'pannen.title')), el('div', { class: 'line', 'data-chip': 'ui' }, n ? zs(ctx.i18n.lang, 'pannen.panel', { n, total: list.length }) : zs(ctx.i18n.lang, 'pannen.empty')));
          h.replaceChildren(root);
        },
        (o, d) => {
          // which plaque: the ray meets the wall plane x = PANNEN.x
          const t = (x + 0.075 - o.x) / d.x;
          if (!(t > 0)) return;
          const hit = o.clone().addScaledVector(d, t);
          let best = -1;
          let bd = 0.3;
          plaques.forEach((p, i) => {
            const dd = Math.hypot(hit.y - p.at.y, hit.z - p.at.z);
            if (dd < bd) {
              bd = dd;
              best = i;
            }
          });
          const e = album()[best];
          if (!e) return;
          ctx.audio.play('click');
          if (!e.found) {
            ctx.hud.toast((lang) => zs(lang, 'pannen.unknown'), { kind: 'info', duration: 2 });
            return;
          }
          void ctx.ui.card({ eyebrow: `// ${e.zoneId.toUpperCase()}`, title: e.title, body: e.text });
        },
      );
    },
    openVitrine() {
      openPanel(
        'vitrine',
        (h) => {
          const n = placedIds.length;
          const total = Math.max(S.total(), 25);
          h.replaceChildren(el('div', { class: 'sh' }, el('div', { class: 'eyebrow' }, zs(ctx.i18n.lang, 'vitrine.title')), el('div', { class: 'line', 'data-chip': 'ui' }, n ? zs(ctx.i18n.lang, 'vitrine.panel', { n, total }) : zs(ctx.i18n.lang, 'vitrine.empty'))));
        },
        (o, d) => {
          raycaster.set(ctx.toWorld(o), d.clone().applyQuaternion(ctx.root.getWorldQuaternion(new THREE.Quaternion())));
          const hit = raycaster.intersectObject(content, true)[0];
          const id = hit?.object.userData.secret as string | undefined;
          if (!id) return;
          ctx.audio.play('click');
          S.openCard?.(id);
        },
      );
    },
    stats() {
      const list = album();
      return { secrets: S.found().length, placed: placedIds.length, album: list.filter((e) => e.found).length, albumTotal: list.length };
    },
  };
}
