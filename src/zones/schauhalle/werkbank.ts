/**
 * The „Danke“ room behind the SELBST BAUEN pylon (plan §4.9 „credits-room shell“, §4.13 egg 15
 * „Werkbank der Offenen“, R9 §5 #15): every real model of the game as a small cast on a long workbench
 * (the line-up at 1:4, one draw), and a board with who published each model and the software, from the
 * same data as the credits page (src/core/credits.ts, loaded only when you come near). E at the board
 * opens the full credits page. Entering the room the first time announces 'schauhalle:werkbank' — the
 * egg itself (its secret, its radio line) is WP15's; the hall finds it when WP15 has registered it.
 */
import * as THREE from 'three';
import type { SecretDef, ZoneContext, ZoneSecrets } from '@/core/zones';
import { canvasTex, FONT } from './geo';
import { DANKE } from './layout';
import { fitText, INK, para } from './look';
import { zs } from './sheet';

type SecretsPlus = ZoneSecrets & { list?(): SecretDef[] };

export interface Werkbank {
  update(dt: number): void;
  openCredits(): void;
  readonly visited: boolean;
}

export function buildWerkbank(ctx: ZoneContext): Werkbank {
  const det = ctx.groups.detail;
  const { x0, x1, z0, z1 } = DANKE;
  let visited = ctx.progress.get<boolean>('werkbank', false);

  // ── the board on the room's west wall, facing east (lit canvas) ───────────
  const bw = z1 - z0 - 0.7;
  const bh = 1.9;
  const t = canvasTex(1024, 500);
  let drawn = false;
  const draw = async (): Promise<void> => {
    const { g, w, h } = t;
    const L = ctx.i18n.lang;
    g.fillStyle = INK.bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = INK.teal;
    g.fillRect(0, 0, w, 5);
    g.textBaseline = 'alphabetic';
    fitText(g, zs(L, 'danke.title'), 28, 56, w - 56, 38, (px) => FONT.display(px), INK.text);
    fitText(g, zs(L, 'danke.sub'), 28, 88, w - 56, 18, FONT.sans, INK.text2);
    try {
      const { CREDITS } = await import('@/core/credits');
      const rows = CREDITS.robots;
      const colW = (w - 56) / 2;
      let i = 0;
      for (const r of rows) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 28 + col * colW;
        const y = 122 + row * 24;
        if (y > h - 70) break;
        fitText(g, `${r.name[L]} · ${r.maker} · ${r.spdx}`, x, y, colW - 16, 15, (px) => FONT.mono(px, 500), INK.text);
        i++;
      }
      const soft = [...CREDITS.software.map((s) => `${s.name} (${s.license})`), ...CREDITS.fonts.map((f) => `${f.name} (${f.license})`)].join(' · ');
      para(g, soft, 28, h - 62, w - 56, 13, 17, INK.text2, (px) => FONT.mono(px, 400), 3);
    } catch (err) {
      console.warn('[schauhalle] credits for the Danke board failed', err);
    }
    t.tex.needsUpdate = true;
  };
  const geo = new THREE.PlaneGeometry(bw, bh);
  geo.rotateY(Math.PI / 2).translate(x0 + 0.07, 0.9 + bh / 2, (z0 + z1) / 2 - 0.1);
  const mat = new THREE.MeshStandardMaterial({ map: t.tex, roughness: 0.7, metalness: 0, name: 'schauhalle:danke-board' });
  const board = new THREE.Mesh(geo, mat);
  board.name = 'schauhalle:danke-board';
  board.matrixAutoUpdate = false;
  det.add(board);
  ctx.onDispose(() => {
    geo.dispose();
    mat.dispose();
    t.tex.dispose();
  });
  ctx.i18n.onChange(() => {
    if (drawn) void draw();
  });

  // ── the casts: the line-up at 1:4 along the workbench ─────────────────────
  void (async () => {
    try {
      const [m, info] = await Promise.all([ctx.robots.lineup(), ctx.robots.lineupInfo()]);
      if (!info) return;
      const k = Math.min(0.25, (z1 - z0 - 1.0) / info.lengthM);
      m.userData.ledger = 'schauhalle';
      m.scale.setScalar(k);
      m.rotation.y = Math.PI / 2;
      m.position.set(x1 - 0.55, 0.86, z1 - 0.6);
      m.castShadow = false;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      det.add(m);
      ctx.onDispose(() => m.removeFromParent());
    } catch {
      /* the room stays a room */
    }
  })();

  // ── entering the room: the egg's cue (WP15 owns the secret) ────────────────
  ctx.physics.addTrigger({
    shape: 'box',
    size: [x1 - x0 - 0.3, 2.4, z1 - z0 - 0.3],
    position: [(x0 + x1) / 2, 1.2, (z0 + z1) / 2],
    onEnter: (e) => {
      if (!e.isPlayer) return;
      if (!drawn) {
        drawn = true;
        void draw();
      }
      if (!visited) {
        visited = true;
        ctx.progress.set('werkbank', true);
        ctx.game.juice.cue('collect', { at: [(x0 + x1) / 2, 1.5, (z0 + z1) / 2] });
      }
      ctx.events.emit('schauhalle:werkbank', { at: ctx.toWorld([(x0 + x1) / 2, 1, (z0 + z1) / 2]).toArray() });
      // WP15's egg 15 „Werkbank der Offenen“ listens for this: stepping in is the same find as its door
      ctx.events.emit('schauhalle:danke', {});
      const S = ctx.game.secrets as SecretsPlus;
      const def = S.list?.().find((d) => /werkbank/i.test(d.id));
      if (def && !S.has(def.id)) S.find(def.id, ctx.toWorld([(x0 + x1) / 2, 1, (z0 + z1) / 2]));
    },
  });

  return {
    update() {
      // draw the board when you come near the room (the credits data loads lazily)
      if (!drawn) {
        const p = ctx.player.positionLocal();
        if (Math.hypot(p.x - (x0 + x1) / 2, p.z - (z0 + z1) / 2) < 9) {
          drawn = true;
          void draw();
        }
      }
    },
    openCredits() {
      void import('@/ui/Credits').then((m) => m.openCredits()).catch((err) => console.warn('[schauhalle] credits page failed', err));
    },
    get visited() {
      return visited;
    },
  };
}
