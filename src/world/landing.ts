import * as THREE from 'three';
import { css, type ZoneContext, type ZoneManifest } from '@/core/zones';
import { DEG, PATHS, ZONE_PLOTS, outlineRadius } from './layout';
import { drawGlyph } from './glyphs';
import { flatRing, rbox, sharedBatch } from './landscape/batch';
import { START } from './start/strings';
import { markStatic } from './statics';
import { cullTinyText } from './detail';

/**
 * Arrival (§6.1, ART-V2 §4.5): the Messpunkt plate on the Landedeck, the island map as a dark-glass
 * totem (out of the arrival frame) and the Glasbalkon plaque. Phase 7 (WP12, plan §2.3 [C1 m9]): the
 * rc4 shuttle pod and its gangway are gone (the player arrives over the bridge); the Glasbalkon plaque
 * reads „TROCKENDOCK 3 · TIEFE 66 m“ while docked and the rc4 line in the air (§4.1).
 */
export interface Landing {
  setObjective(zoneId: string | null): void;
  /** the Glasbalkon plaque's second line follows the flight state */
  setFlight(state: 'ground' | 'airborne'): void;
}

export function buildLanding(ctx: ZoneContext, manifests: ZoneManifest[]): Landing {
  const M = ctx.materials;
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const batch = sharedBatch(ctx);

  // ── Messpunkt (spawn): flush alu disc Ø 0.6 with a teal ring and an eye mark ──
  {
    const [x, , z] = [0, 0, 94.5];
    const plateMat = M.standard({ color: 0xc9c4bf, roughness: 0.35, metalness: 0.9, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 });
    batch.add(plateMat, new THREE.CircleGeometry(0.3, 40).rotateX(-Math.PI / 2).translate(x, 0.036, z), { name: 'messpunkt' });
    batch.add(M.carbon, flatRing(x, z, 0.3, 0.36, 0.037, 48), { name: 'carbon' });
    batch.add(M.light(0x2dd4bf), flatRing(x, z, 0.315, 0.345, 0.04, 48), { name: 'teal-lines' });
    // eye mark: an almond outline and a pupil, engraved (carbon)
    const eye: [number, number][] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI;
      eye.push([Math.cos(a) * 0.17, Math.sin(a) * 0.075]);
    }
    for (let i = 1; i < 24; i++) {
      const a = Math.PI + (i / 24) * Math.PI;
      eye.push([Math.cos(a) * 0.17, Math.sin(a) * 0.075]);
    }
    const pts = eye.map(([u, v]) => new THREE.Vector3(x + u, 0.0385, z + v));
    pts.push(pts[0].clone());
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i],
        q = pts[i + 1];
      const len = p.distanceTo(q);
      batch.add(M.carbon, new THREE.PlaneGeometry(len + 0.004, 0.012).rotateX(-Math.PI / 2).rotateY(-Math.atan2(q.z - p.z, q.x - p.x)).translate((p.x + q.x) / 2, 0.0385, (p.z + q.z) / 2), { name: 'carbon' });
    }
    batch.add(M.carbon, new THREE.CircleGeometry(0.035, 16).rotateX(-Math.PI / 2).translate(x, 0.0386, z), { name: 'carbon' });
  }

  // ── map totem on the Landedeck, left of the arrival view (out of the §4.7 spawn frame) ──
  const BOARD: [number, number, number] = [-6.0, 0, 92.5];
  const BOARD_YAW = 1.25;
  const board = new THREE.Group();
  board.position.set(...BOARD);
  board.rotation.y = BOARD_YAW;
  ctx.root.add(board);
  board.updateMatrixWorld(true);
  const TW = 1.3,
    TH = 2.35,
    TD = 0.14;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 1152;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.82, 0.82, 0.82) });
  ctx.onDispose(() => {
    tex.dispose();
    mat.dispose();
  });
  const FW = TW - 0.16,
    FH = FW * (1152 / 768);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), mat);
  face.position.set(0, 0.42 + TH - 0.12 - FH / 2, TD / 2 + 0.004);
  board.add(face);
  const toW = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.applyMatrix4(board.matrixWorld);
  batch.add(M.darkGlass, toW(rbox(TW, TH, TD).translate(0, 0.42 + TH / 2, 0)), { name: 'dark-glass' });
  batch.add(M.brushedAlu, toW(rbox(TW + 0.06, 0.05, TD + 0.06).translate(0, 0.42 + TH + 0.02, 0)), { name: 'alu' });
  for (const s of [-1, 1]) batch.add(M.brushedAlu, toW(new THREE.BoxGeometry(0.035, TH, TD + 0.03).translate(s * (TW / 2 + 0.005), 0.42 + TH / 2, 0)), { name: 'alu' });
  batch.add(M.carbon, toW(rbox(TW - 0.2, 0.42, TD + 0.1).translate(0, 0.21, 0)), { name: 'carbon' });
  batch.add(M.light(0x2dd4bf), toW(new THREE.BoxGeometry(TW - 0.3, 0.02, 0.01).translate(0, 0.42 + TH - 0.05, TD / 2 + 0.006)), { name: 'teal-lines' });
  ctx.physics.addStaticBox({ size: [TW + 0.1, 2.8, 0.35], position: [BOARD[0], 1.4, BOARD[2]], rotation: [0, BOARD_YAW, 0] });
  ctx.freezeStatic(board);
  ctx.addInteractable({ object: face, label: { de: 'Inselkarte öffnen', en: 'Open island map' }, hint: { de: 'Jederzeit: [M]', en: 'Anytime: [M]' }, range: 4, onInteract: () => ctx.events.emit('ui:open-map') });

  let objective: string | null = null;
  const draw = (): void => {
    const g = canvas.getContext('2d')!;
    const lang = ctx.lang;
    const W = canvas.width,
      H = canvas.height;
    g.fillStyle = '#141211';
    g.fillRect(0, 0, W, H);
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, css.orange);
    grd.addColorStop(1, css.teal);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, 5);
    g.fillStyle = css.textMuted;
    g.font = '500 19px "Geist Mono", monospace';
    g.fillText(lang === 'de' ? '// SCHWEBEWERK · INSEL 17 · LAGEPLAN' : '// THE FLOATING WORKS · ISLAND 17 · SITE PLAN', 40, 54);
    g.fillStyle = css.text;
    g.font = '700 52px "Space Grotesk", sans-serif';
    g.fillText('EmAI Academy', 40, 118);
    g.fillStyle = css.textSecondary;
    g.font = '400 24px "Geist", sans-serif';
    const lines = lang === 'de' ? ['Sechs Zonen, achtzehn Stempel.', 'Folge der Allee zum Turm.', 'Sprungplatten bringen dich von der Plaza zu den Zonen.'] : ['Six zones, eighteen stamps.', 'Follow the avenue to the tower.', 'Jump pads take you from the plaza to the zones.'];
    let ly = 168;
    for (const l of lines) {
      // simple wrap at the card width
      const words = l.split(' ');
      let row = '';
      for (const w of words) {
        const t = row ? `${row} ${w}` : w;
        if (g.measureText(t).width > W - 80) {
          g.fillText(row, 40, ly);
          ly += 32;
          row = w;
        } else row = t;
      }
      g.fillText(row, 40, ly);
      ly += 32;
    }
    // plan (north up)
    const cx = W / 2,
      cy = 690,
      s = 3.15;
    g.save();
    g.translate(cx, cy);
    g.fillStyle = '#2B2826';
    g.strokeStyle = '#57534E';
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= 360; i++) {
      const r = outlineRadius(i, true) * s;
      const x = Math.sin(i * DEG) * r,
        y = -Math.cos(i * DEG) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = '#6B635C';
    g.lineCap = 'round';
    g.lineWidth = 5 * s * 0.5;
    g.beginPath();
    g.arc(0, 0, 46 * s, 0, Math.PI * 2);
    g.stroke();
    for (const z of ZONE_PLOTS) {
      g.beginPath();
      g.moveTo(Math.sin(z.bearing * DEG) * 32 * s, -Math.cos(z.bearing * DEG) * 32 * s);
      g.lineTo(Math.sin(z.bearing * DEG) * 58 * s, -Math.cos(z.bearing * DEG) * 58 * s);
      g.strokeStyle = z.id === objective ? css.orange : '#6B635C';
      g.stroke();
    }
    g.strokeStyle = '#6B635C';
    g.lineWidth = 8 * s * 0.5;
    g.beginPath();
    g.moveTo(0, 32 * s);
    g.lineTo(0, 84 * s);
    g.stroke();
    g.lineWidth = 4 * s * 0.5;
    g.beginPath();
    g.moveTo(0, -32 * s);
    g.lineTo(0, -92 * s);
    g.stroke();
    g.fillStyle = '#8A8178';
    g.beginPath();
    g.arc(0, 0, PATHS.plazaRadius * s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1C1917';
    g.beginPath();
    g.arc(0, 0, 9 * s, 0, Math.PI * 2);
    g.fill();
    for (const z of ZONE_PLOTS) {
      const x = z.anchor[0] * s,
        y = z.anchor[2] * s;
      g.fillStyle = '#3A3532';
      g.strokeStyle = z.id === objective ? css.orange : ctx.zones.visited(z.id) ? css.teal : '#57534E';
      g.lineWidth = z.id === objective ? 4 : 2;
      g.beginPath();
      g.arc(x, y, 22 * s, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      drawGlyph(g, z.glyph, x, y - 20, 13, css.teal, 3);
      g.fillStyle = css.text;
      g.textAlign = 'center';
      g.font = '700 18px "Space Grotesk", sans-serif';
      g.fillText((byId.get(z.id)?.name ?? z.name)[lang], x, y + 14);
      g.fillStyle = css.textMuted;
      g.font = '500 14px "Geist Mono", monospace';
      g.fillText(String(z.number).padStart(2, '0'), x, y + 33);
      g.textAlign = 'left';
    }
    // you are here
    g.fillStyle = css.orange;
    g.beginPath();
    g.arc(0, 94.5 * s, 7, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = css.orange;
    g.font = '500 20px "Geist Mono", monospace';
    g.fillText(lang === 'de' ? '● DU BIST HIER' : '● YOU ARE HERE', 40, H - 64);
    g.fillStyle = css.textMuted;
    g.fillText(lang === 'de' ? 'N ↑   ·   Maßstab 1 : 320' : 'N ↑   ·   scale 1 : 320', 40, H - 30);
    tex.needsUpdate = true;
  };
  draw();
  ctx.i18n.onChange(draw);
  ctx.events.on('zone:enter', draw);

  // ── Glasbalkon plaque: dark glass in an alu frame on a tapered post ───────
  let flight: 'ground' | 'airborne' = 'ground';
  let depthLine: ReturnType<ZoneContext['text3d']['create']> | null = null;
  {
    const plaque = new THREE.Group();
    plaque.position.set(2.9, 0, -86.4);
    plaque.rotation.y = Math.PI * 0.12;
    ctx.root.add(plaque);
    const plate = new THREE.Mesh(rbox(1.6, 0.62, 0.05), M.darkGlass);
    plate.position.set(0, 1.05, 0);
    plate.rotation.x = -0.5;
    plaque.add(markStatic(plate));
    const frame = new THREE.Mesh(rbox(1.66, 0.68, 0.035), M.brushedAlu);
    frame.position.set(0, 1.05, 0);
    frame.rotation.x = -0.5;
    frame.translateZ(-0.02);
    plaque.add(markStatic(frame));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.9, 12), M.hull);
    post.position.y = 0.45;
    plaque.add(markStatic(post));
    const holder = new THREE.Group();
    holder.position.set(0, 1.05, 0.03);
    holder.rotation.x = -0.5;
    plaque.add(holder);
    const lines = [
      ctx.text3d.create({ text: { de: 'SCHWEBEWERK · INSEL 17', en: 'THE FLOATING WORKS · ISLAND 17' }, font: 'mono-medium', size: 0.075, color: 0xe7e5e4, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.1, position: [0, 0.14, 0.01] }, holder),
      ctx.text3d.create({ text: (lang) => (flight === 'airborne' ? START.balconyAir : START.balconyGround)[lang === 'de' ? 'de' : 'en'], font: 'mono-medium', size: 0.075, color: 0xff6700, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.1, position: [0, -0.02, 0.01] }, holder),
      ctx.text3d.create({ text: { de: 'FIKTION', en: 'FICTION' }, font: 'mono', size: 0.06, color: 0x78716c, anchorX: 'center', anchorY: 'middle', letterSpacing: 0.12, position: [0, -0.18, 0.01] }, holder),
    ];
    for (const t of lines) cullTinyText(ctx, t);
    ctx.freezeStatic(plaque);
    depthLine = lines[1];
  }

  return {
    setObjective(id) {
      objective = id;
      draw();
    },
    setFlight(state) {
      if (state === flight) return;
      flight = state;
      if (depthLine) {
        depthLine.text = ctx.i18n.resolve((lang) => (flight === 'airborne' ? START.balconyAir : START.balconyGround)[lang === 'de' ? 'de' : 'en']);
        depthLine.sync();
      }
    },
  };
}
