/**
 * The hangar's entrance and its plaques (plan §4.8): the hall sign with the house line, the honesty
 * lectern (the toy world model's card, the motion chip, the Unitree credit line), and one datasheet
 * plaque per dock — the robot's facts as Unitree states them (HERSTELLERANGABE, R3 §1.1, accessed
 * 2026-10-17; walking speed „nicht angegeben“ where Unitree gives none) beside its height measured on
 * the 3D model (MODELL), the licence line from the robot manifest. A plaque opens a small panel (≤ 35
 * words, every number chipped), never a card by itself.
 */
import * as THREE from 'three';
import type { ZoneContext } from '@/core/zones';
import { DOCKS, ROBOT_ID, ROBOTS, ROSTER, type RosterKey } from './tuning';
import type { Hangar } from './shared';
import { el } from './ui';

export interface Lobby {
  update(dt: number): void;
}

/** Facts per robot (Unitree's product pages, R3 §1.1; the keys of strings.ts `sheet.<k>.*`). */
const FACTS: Record<RosterKey, string[]> = {
  r1: ['weight', 'dof', 'arm', 'speed', 'battery'],
  g1: ['weight', 'dof', 'arm', 'speed', 'battery'],
  h12: ['weight', 'dof', 'arm', 'speed', 'battery'],
  h2: ['weight', 'dof', 'arm', 'speed', 'battery'],
};

function signCanvas(ctx: ZoneContext, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.MeshBasicMaterial {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  ctx.onDispose(() => (tex.dispose(), mat.dispose()));
  const redraw = (): void => {
    g.clearRect(0, 0, w, h);
    draw(g);
    tex.needsUpdate = true;
  };
  redraw();
  ctx.i18n.onChange(redraw);
  return mat;
}

export function buildLobby(H: Hangar): Lobby {
  const { ctx } = H;
  const T = H.T;
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const G = <G2 extends THREE.BufferGeometry>(g: G2): G2 => (ctx.onDispose(() => g.dispose()), g);
  const steel = M.standard({ color: 0x5b5b5e, roughness: 0.5, metalness: 0.6 });

  // ── the hall sign inside the doors (faces the arriving player) ───────────────────────────────
  const signMat = signCanvas(ctx, 1024, 384, (g) => {
    g.fillStyle = '#1f1f1f';
    g.fillRect(0, 0, 1024, 384);
    g.fillStyle = 'rgba(255,103,0,0.95)';
    g.fillRect(0, 0, 1024, 6);
    g.fillStyle = 'rgba(45,212,191,0.95)';
    g.fillRect(0, 6, 1024, 3);
    g.font = '600 30px "Geist Mono", monospace';
    g.fillStyle = 'rgba(255,103,0,0.95)';
    g.fillText(ctx.t('lobby.eyebrow'), 48, 78);
    g.font = '700 92px "Space Grotesk", sans-serif';
    g.fillStyle = 'rgba(245,245,244,0.97)';
    g.fillText(ctx.t('lobby.title'), 44, 180);
    g.font = '500 38px "Geist", sans-serif';
    g.fillStyle = 'rgba(214,211,209,0.95)';
    g.fillText(ctx.t('lobby.line'), 48, 260);
    g.font = '500 26px "Geist Mono", monospace';
    g.fillStyle = 'rgba(168,162,158,0.9)';
    g.fillText(ctx.t('lobby.sub'), 48, 330);
  });
  const sign = new THREE.Mesh(G(new THREE.PlaneGeometry(4.8, 1.8)), signMat);
  sign.position.set(-5.2, 2.6, 11.0);
  sign.userData.noMerge = true;
  det.add(sign);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(G(new THREE.BoxGeometry(0.08, 1.8, 0.08)), steel);
    leg.position.set(-5.2 + sx * 2.2, 0.9, 10.96);
    det.add(leg);
  }

  // ── the honesty lectern: the card (asked for with E, never by itself) ─────────────────────────
  const lectern = new THREE.Mesh(G(new THREE.BoxGeometry(0.6, 1.1, 0.5)), M.standard({ color: 0xb9a68a, roughness: 0.8 }));
  lectern.position.set(-1.6, 0.55, 11.2);
  lectern.castShadow = false; // under the roof: its shadow falls in the roof's (JS budget, §5.5)
  lectern.name = 'traum:lectern';
  det.add(lectern);
  const top = new THREE.Mesh(G(new THREE.BoxGeometry(0.66, 0.04, 0.56)), M.standard({ color: 0x2dd4bf, roughness: 0.5, emissive: 0x2dd4bf, emissiveIntensity: 0.2 }));
  top.position.set(-1.6, 1.12, 11.2);
  det.add(top);
  ctx.physics.addStaticBox({ size: [0.6, 1.1, 0.5], position: [-1.6, 0.55, 11.2] });
  ctx.addInteractable({
    object: lectern,
    label: T('lobby.lectern'),
    hint: T('lobby.lecternHint'),
    range: 2.6,
    onInteract: () =>
      void ctx.ui.card({
        eyebrow: T('lobby.card.eyebrow'),
        title: T('lobby.card.title'),
        body: [T('lobby.card.toy'), T('lobby.card.motion'), T('lobby.card.wma')],
        bullets: [T('lobby.card.b1'), T('lobby.card.b2'), T('lobby.card.b3')],
        forDecisionMakers: { title: T('lobby.card.dmTitle'), body: T('lobby.card.dm') },
      }),
  });

  // ── a datasheet plaque per dock ────────────────────────────────────────────────────────────
  for (const k of ROSTER) {
    const x = DOCKS.x[k] - 1.75;
    const post = new THREE.Mesh(G(new THREE.BoxGeometry(0.08, 1.15, 0.08)), steel);
    post.position.set(x, 0.575, DOCKS.robotZ + 0.9);
    det.add(post);
    const plaque = new THREE.Mesh(G(new THREE.BoxGeometry(0.42, 0.3, 0.04)), M.standard({ color: 0xe7e5e4, roughness: 0.6 }));
    plaque.position.set(x, 1.22, DOCKS.robotZ + 0.92);
    plaque.rotation.x = -0.35;
    plaque.name = `traum:plaque-${k}`;
    det.add(plaque);
    ctx.addInteractable({
      object: plaque,
      label: ctx.i18n.text('lobby.plaque', { robot: ctx.i18n.resolve(T(`robot.${k}`)) }),
      range: 2.4,
      onInteract: () => openSheet(k),
    });
  }

  const openSheet = (k: RosterKey): void => {
    const h = ROBOTS[k].heightM;
    ctx.player.enterOperate({
      title: T('lobby.sheetBar'),
      cameraPose: { position: [DOCKS.x[k] + 0.4, 1.3, DOCKS.robotZ + 3.1], lookAt: [DOCKS.x[k], h * 0.6, DOCKS.robotZ] },
      panelPosition: 'right',
      panel: (root) => {
        root.dataset.th = `panel-sheet-${k}`;
        root.append(el('div', 'eyebrow', ctx.t(`robot.${k}`)));
        const model = el('div', 'mono row', undefined, 'display:flex;align-items:center;gap:8px;font-size:12.5px;margin-top:6px');
        model.append(el('span', '', ctx.t('sheet.height', { h: ctx.i18n.num(h, 2) }), 'flex:1'), ctx.ui.chip('modell', T('sheet.modelNote')));
        root.append(model);
        // the vendor's facts under one header chip with its date
        const sec = el('section');
        const head = el('header', 'mono', undefined, 'display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-3);margin-top:8px');
        head.append(ctx.ui.chip('herstellerangabe', T('sheet.source')), el('span', '', ctx.t('sheet.date')));
        sec.append(head);
        for (const f of FACTS[k]) sec.append(el('div', 'mono row', ctx.t(`sheet.${k}.${f}`), 'font-size:12.5px;margin-top:4px'));
        root.append(sec);
        const credit = el('div', 'mono credit', '…', 'font-size:11px;color:var(--text-3);margin-top:8px');
        void ctx.robots.info(ROBOT_ID[k]).then((info) => (credit.textContent = ctx.t('sheet.credit', { vendor: info.vendor, spdx: info.license.spdx })));
        root.append(credit);
      },
    });
  };

  return {
    update() {},
  };
}
