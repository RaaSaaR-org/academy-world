/**
 * The Revier on the map (plan §5.2 MapPanel.addLayer, §2.2; WP14): the wide view's „Revier“ tab draws the
 * pit lake, the managed fields, WP3's tracks, the four ground pads, the sites with their state and the
 * Grubenrand. Ships in the region chunk (src/world/region/index.ts adds it); pure drawing from the layout
 * data plus a small state source, so it never touches the game.
 *
 * Colours follow the map's legend: orange = the objective, teal = visited / a jump pad; sites still closed
 * (before the first rotor) are dashed.
 */
import { css } from '@/core/brand/palette';
import { GROUND_PADS, LANDMARKS, REVIER, SITE_PLOTS, bearingDir, shapeOf } from '@/world/layout';
import { FIELDS, PATHS, SHORE } from '@/world/ground/plan';
import type { MapLayer, MapView } from '@/ui/MapPanel';

export type SiteMapState = 'closed' | 'open' | 'visited' | 'stamped';

/** what the layer reads each frame (the region module provides it) */
export interface RegionMapSource {
  /** the site's name in the current language */
  name(id: string): string;
  state(id: string): SiteMapState;
  /** the map's objective area (from 'objective:changed'), or null */
  objective(): string | null;
  /** pads armed (the Revier is open and the island docked) */
  padsArmed(): boolean;
  /** a region string in the current language (map.lake, map.grubenrand, map.werft, map.closed) */
  t(key: string): string;
  /** the excavator's slewing centre and the board (world x, z) */
  grubenrand: { body: [number, number]; board: [number, number] };
}

const DEG = Math.PI / 180;

export function regionMapLayer(src: RegionMapSource): MapLayer {
  return {
    id: 'region',
    view: 'wide',
    extent: REVIER.walkableRadius + 30,
    order: 0,
    label: { de: 'Revier', en: 'Revier' },
    draw(c, v) {
      drawLake(c, v, src);
      drawFields(c, v);
      drawPaths(c, v);
      drawGrubenrand(c, v, src);
      drawSites(c, v, src);
      drawPads(c, v, src);
      // the walkable boundary (shore W, wind rise N, Werft fence E/S)
      c.beginPath();
      c.arc(v.x(0), v.y(0), REVIER.walkableRadius * v.scale, 0, Math.PI * 2);
      c.setLineDash([3, 6]);
      c.strokeStyle = 'rgba(168,162,158,0.28)';
      c.lineWidth = 1;
      c.stroke();
      c.setLineDash([]);
    },
  };
}

/** the flooded pit lake: everything beyond the shore line (proj(295°) ≈ 600 m, its wave) */
function drawLake(c: CanvasRenderingContext2D, v: MapView, src: RegionMapSource): void {
  const [ux, uz] = bearingDir(SHORE.bearing);
  const px = -uz,
    pz = ux;
  const pts: [number, number][] = [];
  for (let s = -1600; s <= 1600; s += 40) {
    let off = 0;
    for (const [a, l, ph] of SHORE.wave) off += a * Math.sin(s / l + ph);
    const d = SHORE.line + off;
    pts.push([ux * d + px * s, uz * d + pz * s]);
  }
  c.beginPath();
  pts.forEach(([x, z], i) => (i ? c.lineTo(v.x(x), v.y(z)) : c.moveTo(v.x(x), v.y(z))));
  const far = 4000;
  c.lineTo(v.x(ux * far + px * 1600), v.y(uz * far + pz * 1600));
  c.lineTo(v.x(ux * far - px * 1600), v.y(uz * far - pz * 1600));
  c.closePath();
  c.fillStyle = 'rgba(94,107,102,0.6)';
  c.fill();
  c.strokeStyle = 'rgba(185,166,138,0.55)';
  c.lineWidth = 1.2;
  c.stroke();
  const lx = ux * (SHORE.line + 120),
    lz = uz * (SHORE.line + 120);
  label(c, v.x(lx), v.y(lz), src.t('map.lake'), css.textSecondary, 'center');
}

function drawFields(c: CanvasRenderingContext2D, v: MapView): void {
  for (const f of FIELDS) {
    c.save();
    c.translate(v.x(f.at[0]), v.y(f.at[1]));
    c.rotate((f.yawDeg ?? 0) * DEG);
    c.fillStyle = f.kind === 'pasture' ? 'rgba(111,122,80,0.32)' : 'rgba(95,112,70,0.42)';
    c.fillRect((-f.size[0] / 2) * v.scale, (-f.size[1] / 2) * v.scale, f.size[0] * v.scale, f.size[1] * v.scale);
    c.restore();
  }
}

function drawPaths(c: CanvasRenderingContext2D, v: MapView): void {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const p of PATHS) {
    c.beginPath();
    p.pts.forEach(([x, z], i) => (i ? c.lineTo(v.x(x), v.y(z)) : c.moveTo(v.x(x), v.y(z))));
    if (p.closed) c.closePath();
    c.strokeStyle = p.kind === 'road' ? 'rgba(185,179,170,0.7)' : 'rgba(168,160,146,0.75)';
    c.lineWidth = Math.max(1.2, p.width * v.scale);
    c.stroke();
  }
}

function drawSites(c: CanvasRenderingContext2D, v: MapView, src: RegionMapSource): void {
  const obj = src.objective();
  for (const p of SITE_PLOTS) {
    const sh = shapeOf(p);
    if (sh.kind !== 'rect') continue;
    const st = src.state(p.id);
    const yaw = (p.facingDeg ?? 0) * DEG;
    c.save();
    c.translate(v.x(p.anchor[0]), v.y(p.anchor[2]));
    // three's yaw turns local +z toward (sin f, cos f): on the canvas (y = world z) that is a rotation by −f
    c.rotate(-yaw);
    const w = sh.w * v.scale,
      d = sh.d * v.scale;
    if (st === 'stamped') {
      c.fillStyle = 'rgba(45,212,191,0.22)';
      c.fillRect(-w / 2, -d / 2, w, d);
    }
    c.setLineDash(st === 'closed' ? [4, 4] : []);
    c.lineWidth = obj === p.id ? 2.6 : 1.5;
    c.strokeStyle = obj === p.id ? css.orange : st === 'visited' || st === 'stamped' ? css.teal : st === 'closed' ? 'rgba(168,162,158,0.5)' : css.textSecondary;
    c.strokeRect(-w / 2, -d / 2, w, d);
    c.setLineDash([]);
    c.restore();
    label(c, v.x(p.anchor[0]), v.y(p.anchor[2]) + 4, src.name(p.id), obj === p.id ? css.orange : st === 'closed' ? css.textMuted : css.text, 'center', 600);
  }
}

function drawPads(c: CanvasRenderingContext2D, v: MapView, src: RegionMapSource): void {
  const armed = src.padsArmed();
  for (const g of GROUND_PADS) {
    const x = v.x(g.position[0]),
      y = v.y(g.position[2]);
    c.beginPath();
    c.arc(x, y, 4, 0, Math.PI * 2);
    c.fillStyle = armed ? css.teal : '#57534e';
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = '#0c0a09';
    c.stroke();
    label(c, x + 7, y + 4, g.id, css.textSecondary, 'left', 500, 10);
  }
}

function drawGrubenrand(c: CanvasRenderingContext2D, v: MapView, src: RegionMapSource): void {
  const [bx, bz] = src.grubenrand.body;
  const x = v.x(bx),
    y = v.y(bz);
  c.strokeStyle = '#a89a7c';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(x - 6, y - 6, 4, 0, Math.PI * 2);
  c.moveTo(x - 3, y - 3);
  c.lineTo(x + 5, y + 5);
  c.stroke();
  label(c, x + 9, y + 12, src.t('map.grubenrand'), css.textSecondary, 'left', 500, 10.5);
  // the Hofladen and the Werft cranes as dots
  const [hx, , hz] = LANDMARKS.hofladen;
  c.fillStyle = '#b08a72';
  c.fillRect(v.x(hx) - 2.5, v.y(hz) - 2.5, 5, 5);
  for (const [cx, , cz] of LANDMARKS.cranes) {
    c.fillStyle = '#78716c';
    c.fillRect(v.x(cx) - 2, v.y(cz) - 2, 4, 4);
  }
  label(c, v.x(LANDMARKS.cranes[0][0]) + 8, v.y(LANDMARKS.cranes[0][2]) - 6, src.t('map.werft'), css.textMuted, 'left', 500, 10);
}

function label(c: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, align: CanvasTextAlign, weight = 500, px = 11): void {
  c.font = `${weight} ${px}px "Geist Mono", monospace`;
  c.textAlign = align;
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(12,10,9,0.85)';
  c.strokeText(text, x, y);
  c.fillStyle = color;
  c.fillText(text, x, y);
}
