import type { Game } from '@/core/Game';
import { css } from '@/core/brand/palette';
import { DEG, ISLAND, PADS, PATHS, ZONE_PLOTS, bearingDir, outlineRadius, polar, type ZonePlotInfo } from '@/world/layout';
import { drawGlyph } from '@/world/glyphs';
import { TURMSPRUNG } from '@/world/landscape/plan';
import { starSvg } from './ResultUi';
import { h, keepFocus } from './dom';

/**
 * M key: top-down map drawn from the §4 layout constants (GDD §6.5): the real six-lobed
 * outline with Landedeck, Glasbalkon and the four Kanzeln, the plaza, ring path, spokes,
 * avenue and Kanzel stubs, the twelve jump pads, the six plots with glyph, name and stamps
 * (0–3), the current objective in orange (with a dashed line from the player), and the
 * player arrow. Per zone: „Als Ziel setzen" (emits `map:set-target { zone }`; the island
 * overrides its route until you arrive; again → „Ziel aufheben") and „Hinreisen" (fast
 * travel to visited zones). The island tells the map its objective via `objective:changed
 * { zone, manual, target, lift }` (lift: the KIEL lift while KIEL −36 is open). Live while open (player arrow moves).
 */
/** How a map layer draws (canvas px; world x/z → px). */
export interface MapView {
  /** 'island': the rc4 island map; 'wide': the dock and the Revier around it */
  readonly mode: 'island' | 'wide';
  /** canvas size in CSS px (square) */
  readonly size: number;
  /** px per metre */
  readonly scale: number;
  /** metres from the island centre to the canvas edge */
  readonly extent: number;
  x(worldX: number): number;
  y(worldZ: number): number;
  readonly lang: 'de' | 'en';
}

/** A map layer (plan §5.2: MapPanel.addLayer; WP14's region, WP4's sites). Drawn after the island, before the player arrow. */
export interface MapLayer {
  id: string;
  /** 'island' (default) draws on the island map, 'wide' on the wide view (shown as a second tab once a wide layer exists), 'both' on both */
  view?: 'island' | 'wide' | 'both';
  /** wide view: the metres from the island centre this layer needs (the wide view fits the largest) */
  extent?: number;
  /** draw order, low first (default 0) */
  order?: number;
  /** tab label of the wide view (the first wide layer's wins; default „Revier“) */
  label?: { de: string; en: string };
  draw(c: CanvasRenderingContext2D, v: MapView): void;
}

/** The page's MapPanel (Game makes one); `addMapLayer` reaches it from packages without a Game handle. */
let current: MapPanel | null = null;
const early = new Map<string, { layer: MapLayer; detach: (() => void) | null }>();

/**
 * Phase 7 (WP14 request, additive): add a map layer from code that has no Game handle — the world
 * packages (WP14's region, a ZoneContext has no map). Same as MapPanel.addLayer; a layer added before the
 * panel exists is attached when it is made. Returns remove.
 */
export function addMapLayer(layer: MapLayer): () => void {
  if (current) return current.addLayer(layer);
  const entry = { layer, detach: null as (() => void) | null };
  early.set(layer.id, entry);
  return () => {
    if (early.get(layer.id) === entry) early.delete(layer.id);
    entry.detach?.();
  };
}

interface ObjectiveInfo {
  zone: string | null;
  manual: boolean;
  target: [number, number, number] | null;
  /** PT-08: the KIEL lift door while KIEL −36 is open and the finale has not ended, else null */
  lift: [number, number, number] | null;
}

export class MapPanel {
  private close: (() => void) | null = null;
  disabled = false;
  private objective: ObjectiveInfo = { zone: null, manual: false, target: null, lift: null };
  private raf = 0;
  private readonly layers = new Map<string, MapLayer>();
  private mode: 'island' | 'wide' = 'island';

  /** Add a layer (one per id; a second add replaces it). Returns remove. */
  addLayer(layer: MapLayer): () => void {
    this.layers.set(layer.id, layer);
    this.rerender?.();
    return () => {
      if (this.layers.get(layer.id) !== layer) return;
      this.layers.delete(layer.id);
      if (this.mode === 'wide' && !this.wideLayers().length) this.mode = 'island';
      this.rerender?.();
    };
  }

  private layersFor(mode: 'island' | 'wide'): MapLayer[] {
    return [...this.layers.values()].filter((l) => (l.view ?? 'island') === mode || l.view === 'both').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private wideLayers(): MapLayer[] {
    return this.layersFor('wide');
  }

  /** one layer's draw, guarded (a broken layer never breaks the map) */
  private drawLayers(c: CanvasRenderingContext2D, v: MapView): void {
    for (const l of this.layersFor(v.mode)) {
      c.save();
      try {
        l.draw(c, v);
      } catch (err) {
        console.error(`[map] layer "${l.id}" threw`, err);
      }
      c.restore();
    }
  }

  constructor(private game: Game) {
    current = this;
    for (const e of early.values()) e.detach = this.addLayer(e.layer);
    early.clear();
    game.events.on('objective:changed', (p) => {
      const o = (p ?? {}) as Partial<ObjectiveInfo>;
      this.objective = { zone: o.zone ?? null, manual: !!o.manual, target: o.target ?? null, lift: o.lift ?? null };
      if (this.close) this.rerender?.();
    });
  }

  private rerender: (() => void) | null = null;

  get isOpen(): boolean {
    return !!this.close;
  }

  toggle(): void {
    if (this.close) this.close();
    else this.open();
  }

  open(): void {
    if (this.close || this.disabled) return;
    const g = this.game;
    const card = h('div', { class: 'modal mapcard hairline', role: 'dialog' });
    let draw: (() => void) | null = null;
    const render = (): void =>
      keepFocus(card, () => {
        const { nodes, redraw } = this.build();
        card.replaceChildren(...nodes);
        draw = redraw;
      });
    this.rerender = render;
    const unsub = g.i18n.onChange(render);
    render();
    // the player arrow follows live (the game keeps running behind the modal)
    const tick = (): void => {
      draw?.();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    g.audio.play('open');
    this.close = g.hud.modals.open('map', card, {
      onClose: () => {
        unsub();
        cancelAnimationFrame(this.raf);
        this.rerender = null;
        this.close = null;
        g.audio.play('close');
      },
      onKey: (code) => {
        if (code === 'KeyM') {
          this.close?.();
          return true;
        }
        return false;
      },
    });
  }

  private build(): { nodes: HTMLElement[]; redraw: () => void } {
    const g = this.game;
    const de = g.i18n.lang === 'de';
    const t = (a: string, b: string): string => (de ? a : b);
    const manifests = g.zones.manifests();
    const byId = new Map(manifests.map((m) => [m.id, m]));
    const extra = manifests.filter((m) => !ZONE_PLOTS.some((p) => p.id === m.id) && (!m.isFallback || g.debugEnabled));
    const nameOf = (p: ZonePlotInfo): string => {
      const m = byId.get(p.id);
      return m ? g.i18n.resolve(m.name) : de ? p.name.de : p.name.en;
    };

    const canvas = h('canvas') as HTMLCanvasElement;
    const S = 440;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = S * dpr;
    canvas.height = S * dpr;
    const c = canvas.getContext('2d')!;
    const wide = this.mode === 'wide' && this.wideLayers().length > 0;
    const extent = wide ? Math.max(ISLAND.outerRadius * 3, ...this.wideLayers().map((l) => l.extent ?? 0)) : ISLAND.outerRadius + 8;
    const sc = (S / 2 - 14) / extent;
    const X = (x: number): number => S / 2 + x * sc;
    const Y = (z: number): number => S / 2 + z * sc;
    const view: MapView = { mode: wide ? 'wide' : 'island', size: S, scale: sc, extent, x: X, y: Y, lang: de ? 'de' : 'en' };

    const capSum = g.gameLayer.summary();
    const leapOpen = capSum.capsulesTotal > 0 && capSum.capsules >= capSum.capsulesTotal;
    const redraw = (): void => {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, S, S);
      if (wide) {
        drawWide();
        return;
      }
      // faint survey grid
      c.strokeStyle = 'rgba(255,255,255,0.035)';
      c.lineWidth = 1;
      for (let k = -100; k <= 100; k += 20) {
        c.beginPath();
        c.moveTo(X(k), Y(-extent));
        c.lineTo(X(k), Y(extent));
        c.moveTo(X(-extent), Y(k));
        c.lineTo(X(extent), Y(k));
        c.stroke();
      }
      // island outline: main disc ∪ six lobes ∪ Landedeck ∪ Kanzeln (solid deck)
      c.beginPath();
      for (let i = 0; i <= 720; i++) {
        const b = i / 2;
        const r = outlineRadius(b, true);
        const [dx, dz] = bearingDir(b);
        if (i === 0) c.moveTo(X(dx * r), Y(dz * r));
        else c.lineTo(X(dx * r), Y(dz * r));
      }
      c.closePath();
      c.fillStyle = '#24211f';
      c.fill();
      c.strokeStyle = '#4a4542';
      c.lineWidth = 1.5;
      c.stroke();
      // lobe join seams (r 85 arcs inside the lobes)
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 1;
      for (const p of ZONE_PLOTS) {
        const half = Math.asin(21.9 / 85) / DEG;
        c.beginPath();
        c.arc(X(0), Y(0), 85 * sc, (p.bearing - half - 90) * DEG, (p.bearing + half - 90) * DEG);
        c.stroke();
      }
      // Glasbalkon (glass floor)
      const gb = ISLAND.glasbalkon;
      c.beginPath();
      c.arc(X(gb.center[0]), Y(gb.center[2]), gb.radius * sc, 0, Math.PI * 2);
      c.fillStyle = 'rgba(45,212,191,0.07)';
      c.fill();
      c.setLineDash([3, 3]);
      c.strokeStyle = 'rgba(45,212,191,0.55)';
      c.stroke();
      c.setLineDash([]);
      // Kanzeln (glass floors)
      for (const b of ISLAND.kanzeln.bearings) {
        const p = polar(b, ISLAND.kanzeln.ring);
        c.beginPath();
        c.arc(X(p[0]), Y(p[2]), ISLAND.kanzeln.radius * sc, 0, Math.PI * 2);
        c.fillStyle = 'rgba(45,212,191,0.07)';
        c.fill();
        c.strokeStyle = 'rgba(45,212,191,0.4)';
        c.stroke();
      }
      // paths
      const pathCol = '#3a3532';
      const strip = (b: number, r0: number, r1: number, w: number): void => {
        const [dx, dz] = bearingDir(b);
        c.beginPath();
        c.moveTo(X(dx * r0), Y(dz * r0));
        c.lineTo(X(dx * r1), Y(dz * r1));
        c.lineWidth = Math.max(1.2, w * sc);
        c.strokeStyle = pathCol;
        c.lineCap = 'butt';
        c.stroke();
      };
      for (const p of ZONE_PLOTS) strip(p.bearing, PATHS.plazaRadius, PATHS.spoke.to, PATHS.spoke.width);
      strip(0, PATHS.plazaRadius, PATHS.northSpoke.to, PATHS.northSpoke.width);
      strip(180, PATHS.plazaRadius, PATHS.avenue.to + 2, PATHS.avenue.width);
      for (const b of ISLAND.kanzeln.bearings) strip(b, PATHS.kanzelStub.from, PATHS.kanzelStub.to, PATHS.kanzelStub.width);
      c.beginPath();
      c.arc(X(0), Y(0), ((PATHS.ring.inner + PATHS.ring.outer) / 2) * sc, 0, Math.PI * 2);
      c.lineWidth = (PATHS.ring.outer - PATHS.ring.inner) * sc;
      c.strokeStyle = pathCol;
      c.stroke();
      // plaza + tower + Landedeck
      c.beginPath();
      c.arc(X(0), Y(0), PATHS.plazaRadius * sc, 0, Math.PI * 2);
      c.fillStyle = '#3d3936';
      c.fill();
      c.beginPath();
      for (let k = 0; k <= 12; k++) {
        const a = (k * 30 + 15) * DEG;
        const px = X(Math.sin(a) * 9),
          py = Y(-Math.cos(a) * 9);
        if (k === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.fillStyle = '#141414';
      c.fill();
      c.strokeStyle = '#57534e';
      c.lineWidth = 1;
      c.stroke();
      const ld = ISLAND.landedeck;
      c.beginPath();
      c.arc(X(ld.center[0]), Y(ld.center[2]), ld.radius * sc, 0, Math.PI * 2);
      c.fillStyle = '#34302d';
      c.fill();
      // jump pads (hub r 27 ↔ zone r 52), teal; the objective's pair orange
      for (const p of ZONE_PLOTS) {
        const obj = this.objective.zone === p.id;
        for (const r of [PADS.hubRadius, PADS.zoneRadius]) {
          const q = polar(p.bearing, r);
          c.beginPath();
          c.arc(X(q[0]), Y(q[2]), Math.max(2, (PADS.diameter / 2) * sc), 0, Math.PI * 2);
          c.fillStyle = obj ? css.orange : css.teal;
          c.globalAlpha = obj ? 1 : 0.7;
          c.fill();
          c.globalAlpha = 1;
        }
      }
      // the Turmsprung pad (FUN-PLAN W4), once all Sensorkapseln are found: a teal ring with an up
      // chevron (the leap to the Ausguck) NW of the tower
      if (leapOpen) {
        const q = polar(TURMSPRUNG.bearing, TURMSPRUNG.r);
        const qx = X(q[0]),
          qy = Y(q[2]);
        const rr = Math.max(5, 1.5 * sc);
        c.beginPath();
        c.arc(qx, qy, rr, 0, Math.PI * 2);
        c.fillStyle = '#141414';
        c.fill();
        c.lineWidth = 1.8;
        c.strokeStyle = css.teal;
        c.stroke();
        c.beginPath();
        c.moveTo(qx - rr * 0.5, qy + rr * 0.22);
        c.lineTo(qx, qy - rr * 0.32);
        c.lineTo(qx + rr * 0.5, qy + rr * 0.22);
        c.lineWidth = 1.5;
        c.stroke();
        c.font = '500 11px "Geist Mono", monospace';
        c.fillStyle = css.teal;
        c.textAlign = 'right';
        c.fillText(t('TURMSPRUNG', 'TOWER LEAP'), qx - rr - 4, qy + 3.5);
      }
      // plots
      for (const p of ZONE_PLOTS) {
        const obj = this.objective.zone === p.id;
        const visited = g.progress.visited(p.id);
        const n = g.progress.stampsInZone(p.id);
        const ax = X(p.anchor[0]),
          ay = Y(p.anchor[2]);
        c.beginPath();
        c.arc(ax, ay, p.radius * sc, 0, Math.PI * 2);
        c.fillStyle = obj ? 'rgba(255,103,0,0.10)' : '#2c2826';
        c.fill();
        c.lineWidth = obj ? 2.2 : 1.4;
        c.strokeStyle = obj ? css.orange : visited ? css.teal : '#57534e';
        c.stroke();
        drawGlyph(c, p.glyph, ax, ay - 13, 7, obj ? css.orange : visited ? css.teal : css.textSecondary, 1.5);
        c.textAlign = 'center';
        c.fillStyle = css.text;
        c.font = '700 11px "Space Grotesk", sans-serif';
        c.fillText(`${String(p.number).padStart(2, '0')} ${nameOf(p)}`, ax, ay + 6);
        c.font = '500 11px "Geist Mono", monospace';
        c.fillStyle = n ? css.orange : css.textSecondary;
        c.fillText(`${'●'.repeat(Math.min(3, n))}${'○'.repeat(Math.max(0, 3 - n))}`, ax, ay + 20);
        // ★ x/9 (drawn as a path: no glyph dependency)
        const st = g.gameLayer.stars(p.id);
        const label = `${st.stars}/${st.max}`;
        c.font = '500 11px "Geist Mono", monospace';
        const tw = c.measureText(label).width;
        mapStar(c, ax - tw / 2 - 6, ay + 30, 4.6, st.stars > 0);
        c.fillStyle = st.stars ? css.text : css.textSecondary;
        c.fillText(label, ax + 4, ay + 34);
      }
      // found Sensorkapseln: teal dots (the unfound ones stay a secret)
      const found = new Set(g.progress.collectibles());
      for (const id of g.gameLayer.capsules.ids()) {
        if (!found.has(id)) continue;
        const q = g.gameLayer.capsules.position(id);
        if (!q) continue;
        c.beginPath();
        c.arc(X(q.x), Y(q.z), 3.2, 0, Math.PI * 2);
        c.fillStyle = css.teal;
        c.fill();
        c.lineWidth = 1;
        c.strokeStyle = '#0c0a09';
        c.stroke();
      }
      // labels
      c.font = '500 11px "Geist Mono", monospace';
      c.fillStyle = css.textSecondary;
      c.textAlign = 'center';
      c.fillText(t('AKADEMIE', 'ACADEMY'), X(0), Y(-12));
      c.fillText(t('LANDEDECK', 'LANDING DECK'), X(0), Y(ld.center[2] + ld.radius + 7));
      c.fillText(t('GLASBALKON', 'GLASS BALCONY'), X(0), Y(gb.center[2] - gb.radius - 4));
      // PT-08: the KIEL lift (inside the tower) while KIEL −36 is open; orange when it is the objective
      const lf = this.objective.lift;
      if (lf) {
        const lx = X(lf[0]),
          ly = Y(lf[2]);
        const tg = this.objective.target;
        const isObj = !!tg && tg[0] === lf[0] && tg[2] === lf[2];
        c.fillStyle = isObj ? css.orange : css.teal;
        c.fillRect(lx - 4, ly - 4, 8, 8);
        c.lineWidth = 1;
        c.strokeStyle = '#0c0a09';
        c.strokeRect(lx - 4, ly - 4, 8, 8);
        c.font = '500 11px "Geist Mono", monospace';
        c.fillStyle = css.text;
        c.textAlign = 'left';
        // right of and a little below the square: „AKADEMIE“ sits just above the lift
        c.fillText(t('LIFT · KIEL −36', 'LIFT · KEEL −36'), lx + 9, ly + 10);
      }
      // Phase 7 layers (MapPanel.addLayer), then the player
      this.drawLayers(c, view);
      drawPlayer();
    };
    /** the player arrow and the dashed line to the objective (both views) */
    const drawPlayer = (): void => {
      const pf = g.player.renderFeet;
      const tgt = this.objective.target;
      if (tgt) {
        c.beginPath();
        c.moveTo(X(pf.x), Y(pf.z));
        c.lineTo(X(tgt[0]), Y(tgt[2]));
        c.setLineDash([4, 4]);
        c.strokeStyle = 'rgba(255,103,0,0.85)';
        c.lineWidth = 1.5;
        c.stroke();
        c.setLineDash([]);
        c.beginPath();
        c.arc(X(tgt[0]), Y(tgt[2]), 4, 0, Math.PI * 2);
        c.fillStyle = css.orange;
        c.fill();
      }
      c.save();
      c.translate(X(Math.max(-extent, Math.min(extent, pf.x))), Y(Math.max(-extent, Math.min(extent, pf.z))));
      c.rotate(-g.player.yaw);
      c.beginPath();
      c.moveTo(0, -9);
      c.lineTo(6, 7);
      c.lineTo(0, 3);
      c.lineTo(-6, 7);
      c.closePath();
      c.fillStyle = css.text;
      c.strokeStyle = '#0c0a09';
      c.lineWidth = 1.5;
      c.stroke();
      c.fill();
      c.restore();
      // compass
      c.font = '600 11px "Geist Mono", monospace';
      c.fillStyle = css.textSecondary;
      c.textAlign = 'left';
      c.fillText('N ↑', 12, 20);
      c.textAlign = 'right';
      c.fillStyle = css.textSecondary;
      const bar = wide ? 500 : 50;
      c.fillText(`${bar} m`, S - 14, S - 12);
      c.fillRect(S - 14 - bar * sc, S - 26, bar * sc, 2);
    };
    /** the wide view: the island as its outline, the wide layers, the player */
    const drawWide = (): void => {
      c.strokeStyle = 'rgba(255,255,255,0.035)';
      c.lineWidth = 1;
      for (let k = -2000; k <= 2000; k += 200) {
        c.beginPath();
        c.moveTo(X(k), Y(-extent));
        c.lineTo(X(k), Y(extent));
        c.moveTo(X(-extent), Y(k));
        c.lineTo(X(extent), Y(k));
        c.stroke();
      }
      c.beginPath();
      for (let i = 0; i <= 360; i++) {
        const r = outlineRadius(i, true);
        const [dx, dz] = bearingDir(i);
        if (i === 0) c.moveTo(X(dx * r), Y(dz * r));
        else c.lineTo(X(dx * r), Y(dz * r));
      }
      c.closePath();
      c.fillStyle = '#24211f';
      c.fill();
      c.strokeStyle = '#57534e';
      c.lineWidth = 1.2;
      c.stroke();
      this.drawLayers(c, view);
      drawPlayer();
    };
    redraw();

    // per-zone actions
    const rows = ZONE_PLOTS.map((p) => {
      const n = g.progress.stampsInZone(p.id);
      const visited = g.progress.visited(p.id) || g.debugEnabled;
      const isObj = this.objective.zone === p.id;
      const manualHere = isObj && this.objective.manual;
      const setBtn = h(
        'button',
        {
          class: manualHere ? 'btn ghost' : 'btn',
          style: 'padding:6px 10px;font-size:12px',
          onclick: () => {
            g.events.emit('map:set-target', { zone: manualHere ? null : p.id });
            g.audio.play('click');
          },
        },
        manualHere ? t('Ziel aufheben', 'Clear objective') : isObj ? t('Ist Ziel', 'Objective') : t('Als Ziel setzen', 'Set as objective'),
      ) as HTMLButtonElement;
      if (isObj && !manualHere) setBtn.disabled = true;
      // C5: not yet visited = aria-disabled, not disabled: the keyboard still reaches it and hears why
      const goBtn = h(
        'button',
        {
          class: 'btn ghost',
          style: 'padding:6px 10px;font-size:12px',
          'aria-disabled': visited ? null : 'true',
          title: visited ? '' : t('Erst besuchen, dann hinreisen.', 'Visit first to travel there.'),
          onclick: () => {
            if (!visited) return;
            this.close?.();
            g.teleportTo(p.id, true);
          },
        },
        t('Hinreisen', 'Travel'),
      );
      return h(
        'div',
        { class: `maprow${isObj ? ' obj' : ''}` },
        h(
          'div',
          { class: 'mapname' },
          h('span', { class: 'mono num' }, String(p.number).padStart(2, '0')),
          ' ',
          nameOf(p),
          h('span', { class: 'mono stamps' }, `${'●'.repeat(Math.min(3, n))}${'○'.repeat(Math.max(0, 3 - n))}`),
          h('span', { class: 'mono mapstars', html: `${starSvg(g.gameLayer.stars(p.id).stars > 0, 11)} ${g.gameLayer.stars(p.id).stars}/${g.gameLayer.stars(p.id).max}` }),
        ),
        h('div', { class: 'mapbtns' }, setBtn, goBtn),
      );
    });
    const extraRows = extra.map((z) =>
      h(
        'div',
        { class: 'maprow' },
        h('div', { class: 'mapname' }, g.i18n.resolve(z.name)),
        h('div', { class: 'mapbtns' }, h('button', { class: 'btn ghost', style: 'padding:6px 10px;font-size:12px', onclick: () => { this.close?.(); g.teleportTo(z.id, true); } }, t('Hinreisen', 'Travel'))),
      ),
    );
    const legend = h(
      'div',
      { class: 'maplegend mono' },
      h('span', { class: 'sw o' }),
      t('Ziel', 'Objective'),
      h('span', { class: 'sw t' }),
      t('besucht · Sprungplatte', 'visited · jump pad'),
      h('span', { class: 'sw g' }),
      t('Glasboden', 'glass floor'),
      h('span', { class: 'sw c' }),
      (() => {
        const sum = g.gameLayer.summary();
        return sum.capsulesTotal ? `${t('Kapseln', 'Capsules')} ${sum.capsules}/${sum.capsulesTotal}` : t('Kapseln', 'Capsules');
      })(),
      leapOpen ? h('span', { class: 'sw l' }) : null,
      leapOpen ? t('Turmsprung → Ausguck', 'Tower leap → lookout') : null,
    );
    // a second view once a wide layer exists (the Revier around the dock)
    const wl = this.wideLayers();
    const viewTabs = wl.length
      ? h(
          'div',
          { class: 'tabs', role: 'group', style: 'margin:6px 0 2px' },
          ...(['island', 'wide'] as const).map((m) =>
            h(
              'button',
              {
                class: this.mode === m ? 'on' : '',
                'aria-pressed': this.mode === m ? 'true' : 'false',
                onclick: () => {
                  this.mode = m;
                  g.audio.play('click');
                  this.rerender?.();
                },
              },
              m === 'island' ? t('Insel', 'Island') : g.i18n.resolve(wl.find((l) => l.label)?.label ?? { de: 'Revier', en: 'Revier' }),
            ),
          ),
        )
      : null;
    return {
      nodes: [
        h('button', { class: 'x', onclick: () => this.close?.() }, '✕'),
        h('div', { class: 'eyebrow' }, t('// Karte · Schwebewerk · Insel 17', '// Map · The Floating Works · Island 17')),
        ...(viewTabs ? [viewTabs] : []),
        h('div', { class: 'mapgrid' }, h('div', { class: 'mapcanvas' }, canvas, legend), h('div', { class: 'maplist' }, ...rows, ...extraRows)),
      ],
      redraw,
    };
  }
}

/** a small five-point star path (filled orange when earned) */
function mapStar(c: CanvasRenderingContext2D, x: number, y: number, r: number, on: boolean): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr,
      py = y + Math.sin(a) * rr;
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  }
  c.closePath();
  if (on) {
    c.fillStyle = '#ff6700';
    c.fill();
  } else {
    c.lineWidth = 1;
    c.strokeStyle = '#78716c';
    c.stroke();
  }
}
