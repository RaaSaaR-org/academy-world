/**
 * Sonnenacker — the small things around the stations (plan §4.10, §4.13; R8 §2.7, R9 §5):
 *  - egg 24 „Herztomate“ (album, H0/H1): a heart-shaped tomato lies on bed 1's edge; the arm passing it
 *    hesitates and skips it (out of distribution). Grab it (F) and put it into a crate: the find.
 *  - the plaques: the SO-101 at the Lernkiste and the LeKiwi at the depot (names, attribution from the
 *    robot manifest, the honest card), the Referenzbeete sign („Arizona ist nicht Brandenburg“), the
 *    bumblebee box (EMI-08's line on pollination), the gate sign.
 * Every number in a card sits in a paragraph with its chip.
 */
import * as THREE from 'three';
import { BEDS, ROOFS, SITE } from './tuning';
import { TOK, box, merge, paint } from './look';
import type { Shared } from './shared';
import { chipCard } from './ui';

export interface Extras {
  readonly heartFound: boolean;
  /** tools: put the heart into a crate (the find) */
  findHeart(): boolean;
  /** the playtest's album pass (solve hook 'album'): the heart in the crate at once, no physics */
  heartAtOnce(): void;
  update(dt: number): void;
}

/** A heart-shaped cherry tomato (≤ 300 triangles, the Fundvitrine rule): two lobes and a point. */
function heartGeometry(): THREE.BufferGeometry {
  const r = 0.024;
  return merge([
    paint(new THREE.IcosahedronGeometry(r, 1).translate(-r * 0.62, 0, 0), TOK.tomato),
    paint(new THREE.IcosahedronGeometry(r, 1).translate(r * 0.62, 0, 0), TOK.tomato),
    paint(new THREE.ConeGeometry(r * 1.45, r * 2.1, 10).rotateZ(Math.PI).translate(0, -r * 1.05, 0), 0xa52c24),
    paint(new THREE.ConeGeometry(r * 0.35, r * 0.6, 6).translate(0, r * 0.95, 0), 0x55663c),
  ]);
}

export function buildExtras(S: Shared): Extras {
  const { ctx, look, arms } = S;
  const T = ctx.i18n.text;

  // ── egg 24 „Herztomate“ ─────────────────────────────────────────────────────────────────
  ctx.pass.registerAlbum({ id: 'herztomate', title: T('egg.heart.title'), text: T('egg.heart.album'), hint: T('egg.heart.hint') });
  ctx.pass.registerAlbum({ id: 'zu-fest-gegriffen', title: T('album.squeeze.title'), text: T('album.squeeze.text'), hint: T('album.squeeze.hint') });
  const bx = BEDS.xs[0] - BEDS.width / 2 + 0.07;
  const hz = 38.6;
  const hy = S.y(bx, hz) + BEDS.height + 0.06;
  const heartWorld = ctx.toWorld([bx, hy, hz]);
  ctx.game.secrets.register({
    id: 'herztomate',
    area: 'sonnenacker',
    level: 0,
    title: T('egg.heart.title'),
    hint: T('egg.heart.hint'),
    card: () => ({ eyebrow: T('egg.heart.eyebrow'), title: T('egg.heart.title'), body: [T('egg.heart.card')] }),
    radio: T('egg.heart.radio'),
    reward: { kind: 'album', albumId: 'herztomate' },
    at: [heartWorld.x, heartWorld.y, heartWorld.z],
  });
  let found = ctx.game.secrets.has('herztomate');
  const geo = heartGeometry();
  const heart = new THREE.Mesh(geo, look.paint);
  heart.name = 'sonnenacker:herztomate';
  heart.castShadow = true;
  heart.position.set(bx, hy, hz);
  heart.rotation.set(0, 0.6, Math.PI / 2.4);
  S.det.add(heart);
  ctx.onDispose(() => geo.dispose());
  const body = found ? null : ctx.physics.addDynamic(heart, { mass: 0.03, label: T('egg.heart.label'), shape: 'box', friction: 0.9, onFall: 'reset' });
  if (found) heart.visible = false;
  else arms.setHeart(hz);
  // the crates at the bed ends of Sonnendach A and the Hofladen's counter take it
  const zEnd = (ROOFS.a.z0 + ROOFS.a.z1) / 2 + BEDS.length / 2;
  const drop = (): void => {
    if (found || !body) return;
    found = true;
    ctx.game.secrets.find('herztomate', ctx.toWorld(body.position()));
    ctx.pass.unlockAlbum('herztomate');
    arms.setHeart(null);
    ctx.game.juice.burst(body.position(), { tone: 'teal', count: 30, spread: 0.4 });
    S.say(T('emi.heart'), true);
    ctx.after(1.2, () => {
      body.remove();
      heart.visible = false;
    });
  };
  for (const x of BEDS.xs) ctx.physics.addTrigger({ shape: 'box', size: [0.62, 0.5, 0.46], position: [x, S.y(x, zEnd + 1.25) + 0.35, zEnd + 1.25], filter: 'dynamic', onEnter: (e) => e.body === body && drop() });
  {
    const H = SITE.hofladen;
    ctx.physics.addTrigger({ shape: 'box', size: [0.7, 0.5, 3.6], position: [H.x + H.w / 2 - 1.2, S.y(H.x, H.z) + 1.25, H.z - H.d / 2 + 2.6], filter: 'dynamic', onEnter: (e) => e.body === body && drop() });
  }
  let picked = false;

  // ── plaques ───────────────────────────────────────────────────────────────────────────
  const plaque = (x: number, z: number, yaw: number, name: string): THREE.Mesh => {
    const g0 = S.y(x, z);
    const m = new THREE.Mesh(merge([paint(box(0.05, 0.95, 0.05, 0, 0.47, 0), TOK.timberDark), paint(box(0.34, 0.24, 0.03, 0, 1.0, 0.02).rotateX(-0.35), TOK.carbon), paint(box(0.3, 0.012, 0.005, 0, 1.11, 0.045).rotateX(-0.35), TOK.orange)]), look.paint);
    m.position.set(x, g0, z);
    m.rotation.y = yaw;
    m.name = `sonnenacker:plaque-${name}`;
    m.castShadow = true;
    m.userData.noMerge = true;
    S.det.add(m);
    return m;
  };
  const attribution = async (id: 'so101' | 'lekiwi-base'): Promise<string> => {
    try {
      const info = await ctx.robots.info(id);
      return info.attribution[ctx.lang];
    } catch {
      return '';
    }
  };
  const so = plaque(SITE.lernkiste.x - 0.2, SITE.lernkiste.z - 0.95, Math.PI / 2, 'so101');
  ctx.addInteractable({
    object: so,
    label: T('plaque.so101'),
    range: 2.4,
    onInteract: async () => {
      const a = await attribution('so101');
      void chipCard(ctx, {
        eyebrow: T('plaque.eyebrow'),
        title: T('plaque.so101Title'),
        paras: [
          { text: T('plaque.so101P1'), chip: 'quelle', source: T('src.so101') },
          { text: T('plaque.so101P2'), chip: 'modell' },
          { text: a, chip: 'quelle', source: T('src.so101') },
        ],
      });
    },
  });
  const [dx, dz] = SITE.depot;
  const lk = plaque(dx - 1.25, dz + 0.9, Math.PI / 2, 'lekiwi');
  ctx.addInteractable({
    object: lk,
    label: T('plaque.lekiwi'),
    range: 2.4,
    onInteract: async () => {
      const a = await attribution('lekiwi-base');
      void chipCard(ctx, { eyebrow: T('plaque.eyebrow'), title: T('plaque.lekiwiTitle'), paras: [{ text: T('plaque.lekiwiP1') }, { text: a, chip: 'quelle', source: T('src.lekiwi') }] });
    },
  });
  const ref = plaque(SITE.referenz.xs[0] - 1.2, SITE.referenz.z1 + 1.0, Math.PI, 'referenz');
  ctx.addInteractable({
    object: ref,
    label: T('plaque.referenz'),
    range: 2.4,
    onInteract: () =>
      void chipCard(ctx, {
        eyebrow: T('b.card.eyebrow'),
        title: T('b.card.title'),
        paras: [
          { text: T('b.card.p1'), chip: 'quelle', source: T('src.almeria') },
          { text: T('b.card.p2'), chip: 'quelle', source: T('src.arizona') },
          { text: T('plaque.referenzP'), chip: 'quelle', source: T('src.freiburg') },
        ],
      }),
  });
  ctx.hud.worldLabel([SITE.referenz.xs[1], S.y(SITE.referenz.xs[1], 28) + 1.6, (SITE.referenz.z0 + SITE.referenz.z1) / 2], T('label.referenz'), { eyebrow: T('label.referenzEyebrow'), maxDistance: 18, kind: 'muted' });
  // the bumblebee boxes: EMI-08 on pollination (R9 L8 „Hummelhotel“)
  for (const [x, z] of SITE.bees) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.45), look.mat(TOK.white));
    m.visible = false;
    m.position.set(x, S.y(x, z) + 0.95, z);
    m.userData.noMerge = true;
    S.det.add(m);
    ctx.addInteractable({ object: m, label: T('bees.act'), range: 2.4, highlight: false, onInteract: () => S.say(T('emi.bees'), true) });
  }
  // the gate sign (troika text: three draws, in the detail tier)
  ctx.text3d.sign({ eyebrow: T('sign.eyebrow'), title: T('sign.title'), body: T('sign.body'), width: 2.6, stand: true, position: [SITE.gate[0] + 3.4, S.y(SITE.gate[0] + 3.4, 73), 73], rotationY: 0 }, S.det);

  return {
    get heartFound() {
      return found;
    },
    heartAtOnce: () => drop(),
    findHeart() {
      if (found || !body) return false;
      const x = BEDS.xs[0];
      body.setPosition([x, S.y(x, zEnd + 1.25) + 0.42, zEnd + 1.25]);
      return true;
    },
    update() {
      if (!body || found || picked) return;
      if (body.held) {
        picked = true;
        arms.setHeart(null);
        if (!ctx.progress.get('heartHint', false)) {
          ctx.progress.set('heartHint', true);
          S.say(T('emi.heartHeld'));
        }
      }
    },
  };
}
