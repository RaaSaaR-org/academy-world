import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { css, recamanArcs, type ZoneContext, type ZoneManifest } from '@/core/zones';
import { DEG, ISLAND, TOWER, ZONE_PLOTS, outlineRadius } from './layout';
import { drawGlyph } from './glyphs';
import { merge } from './util';
import { towerState } from './tower/state';
import { markStatic, mergeScope } from './statics';
import type { StartDisplay } from './start/state';
import type { SystemLamp } from './start/contract';

/**
 * Foyer contents (§6.2): Pass-Terminal (4, 0, 3), Inselmodell map table (−4, 0, 3),
 * Lernpfad-Wand (W facets: verb, question, stamps 0–3 and ★ 0–9 per zone) and the island's
 * Selbstmessung (E facets: six rotor Kennlinien, ILLUSTRATIV). v2 look: boards in alu frames,
 * ceramic terminal and table on carbon feet (ART-V2 §3.2, §6.0).
 */
export interface Foyer {
  /** onboarding hook: called when the player uses the Pass-Terminal */
  onTerminal(fn: () => void): void;
  setObjective(zoneId: string | null): void;
  /** WP12: the board of the three systems reads the island's start display */
  setSystems(display: StartDisplay): void;
  refresh(): void;
}

const QUESTIONS: Record<string, { de: string; en: string }> = {
  sensordom: { de: 'Was sieht ein Roboter – und was nicht?', en: 'What does a robot see – and what not?' },
  regelgarten: { de: 'Wie bleibt aufrecht, was ständig fällt?', en: 'How does something that keeps falling stay up?' },
  greifwerkstatt: { de: 'Warum ist Greifen so schwer?', en: 'Why is grasping so hard?' },
  'lern-dojo': { de: 'Wie lernt ein Roboter aus Vorführungen?', en: 'How does a robot learn from demonstrations?' },
  dunkelfabrik: { de: 'Welche harte Arbeit kann ein Roboter übernehmen?', en: 'Which hard work can a robot take over?' },
  prueffeld: { de: 'Wie misst man, ob ein Roboter wirklich gut ist?', en: 'How do you measure whether a robot is really good?' },
};

const WALL_R = TOWER.inradius - 0.45 - 0.06;

function wallPanel(ctx: ZoneContext, parent: THREE.Object3D, bearing: number, w: number, h: number, y: number, canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: true });
  ctx.onDispose(() => {
    tex.dispose();
    mat.dispose();
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  // panel faces the tower centre
  const a = bearing * DEG;
  mesh.position.set(Math.sin(a) * WALL_R, y, -Math.cos(a) * WALL_R);
  mesh.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
  parent.add(mesh);
  const frame = new THREE.Mesh(new RoundedBoxGeometry(w + 0.16, h + 0.16, 0.06, 2, 0.025), ctx.materials.standard({ color: 0xc9c4bf, roughness: 0.3, metalness: 0.95 }));
  frame.position.copy(mesh.position).addScaledVector(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)), 0.035);
  frame.rotation.copy(mesh.rotation);
  parent.add(markStatic(frame));
  return tex;
}

export function buildFoyer(ctx: ZoneContext, parent: THREE.Group, manifests: ZoneManifest[]): Foyer {
  const M = ctx.materials;
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const name = (id: string): { de: string; en: string } => byId.get(id)?.name ?? ZONE_PLOTS.find((z) => z.id === id)!.name;
  let terminalFn: (() => void) | null = null;
  let objective: string | null = null;

  // ── Lernpfad-Wand (W facets 240 / 270 / 300) ─────────────────────────────
  const lernCanvases: { c: HTMLCanvasElement; tex: THREE.CanvasTexture; zones: string[] }[] = [];
  const westOrder: [number, string[]][] = [
    [300, ['sensordom', 'regelgarten']],
    [270, ['greifwerkstatt', 'lern-dojo']],
    [240, ['dunkelfabrik', 'prueffeld']],
  ];
  for (const [b, zones] of westOrder) {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 560;
    const tex = wallPanel(ctx, parent, b, 3.6, 3.15, 3.0, c);
    lernCanvases.push({ c, tex, zones });
  }
  const drawLern = (): void => {
    const lang = ctx.lang;
    for (const { c, tex, zones } of lernCanvases) {
      const g = c.getContext('2d')!;
      g.fillStyle = '#1F1F1F';
      g.fillRect(0, 0, c.width, c.height);
      const grd = g.createLinearGradient(0, 0, c.width, 0);
      grd.addColorStop(0, css.orange);
      grd.addColorStop(1, css.teal);
      g.fillStyle = grd;
      g.fillRect(0, 0, c.width, 3);
      g.font = '500 17px "Geist Mono", monospace';
      g.fillStyle = css.textMuted;
      g.fillText(lang === 'de' ? '// LERNPFAD' : '// LEARNING PATH', 28, 40);
      zones.forEach((id, k) => {
        const z = ZONE_PLOTS.find((p) => p.id === id)!;
        const y0 = 70 + k * 245;
        const isObj = objective === id;
        g.strokeStyle = isObj ? css.orange : '#2A2A2A';
        g.lineWidth = isObj ? 3 : 2;
        g.strokeRect(20, y0, c.width - 40, 220);
        drawGlyph(g, z.glyph, 74, y0 + 70, 26, css.teal, 4);
        g.fillStyle = css.textSecondary;
        g.font = '500 18px "Geist Mono", monospace';
        g.fillText(`${String(z.number).padStart(2, '0')} · ${(byId.get(id)?.verb ?? z.verb)[lang]}`, 128, y0 + 48);
        g.fillStyle = css.text;
        g.font = '700 40px "Space Grotesk", sans-serif';
        g.fillText(name(id)[lang], 128, y0 + 92);
        g.fillStyle = css.textSecondary;
        g.font = '400 22px "Geist", sans-serif';
        g.fillText(QUESTIONS[id][lang], 44, y0 + 150);
        const n = ctx.zones.stamps(id);
        for (let s = 0; s < 3; s++) {
          g.beginPath();
          g.arc(56 + s * 40, y0 + 190, 13, 0, Math.PI * 2);
          if (s < n) {
            g.fillStyle = css.orange;
            g.fill();
          } else {
            g.strokeStyle = '#57534E';
            g.lineWidth = 2;
            g.stroke();
          }
        }
        g.fillStyle = css.textMuted;
        g.font = '500 16px "Geist Mono", monospace';
        g.fillText(lang === 'de' ? `${n}/3 STEMPEL` : `${n}/3 STAMPS`, 186, y0 + 196);
        // stars of the zone's three stations (FUN-PLAN §6.7), drawn as shapes (no glyph dependency)
        const st = ctx.game.stars(id);
        const sx = 340;
        for (let i = 0; i < st.max; i++) {
          const filled = i < st.stars;
          drawStar(g, sx + (i % 9) * 24, y0 + 190, 9, filled ? css.orange : null, filled ? null : '#57534E');
        }
        g.fillStyle = css.textMuted;
        g.fillText(`${st.stars}/${st.max}`, sx + Math.min(st.max, 9) * 24 + 4, y0 + 196);
        if (isObj) {
          g.fillStyle = css.orange;
          g.fillText(lang === 'de' ? 'NÄCHSTES ZIEL' : 'NEXT OBJECTIVE', c.width - 210, y0 + 196);
        }
      });
      tex.needsUpdate = true;
    }
  };

  // ── the three systems (E facets 60 / 90 / 120; rc4 „Selbstmessung“, Phase 7 §3.4) ─────────────────
  // 60: AUFTRIEB M1–M3 · 90: M4–M6 (each rotor with its state and the rc4 torque-drift curve, ILLUSTRATIV)
  // · 120: ENERGIE (the Startakku) and NAVIGATION (the Flugmodell). Same states as the Libelle panel.
  const drift = [3, 5, 4, 12, 6, 2];
  const selfCanvases: { c: HTMLCanvasElement; tex: THREE.CanvasTexture; rotors: number[] }[] = [];
  for (const [b, rotors] of [
    [60, [1, 2, 3]],
    [90, [4, 5, 6]],
    [120, []],
  ] as [number, number[]][]) {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 560;
    selfCanvases.push({ c, tex: wallPanel(ctx, parent, b, 3.6, 3.15, 3.0, c), rotors });
  }
  let systems: StartDisplay | null = null;
  const LAMP_CSS: Record<SystemLamp, string> = { dark: '#57534E', red: '#F87171', amber: '#FBBF24', teal: '#2DD4BF', 'teal-halo': '#5EEAD4', crew: '#2DD4BF' };
  const stateWord = (lamp: SystemLamp, state: string, lang: 'de' | 'en'): string => {
    if (lamp === 'crew') return lang === 'de' ? 'BODENCREW' : 'GROUND CREW';
    const de: Record<string, string> = { kalt: 'KALT', arbeit: 'IN ARBEIT', bereit: 'BEREIT', geprueft: 'GEPRÜFT' };
    const en: Record<string, string> = { kalt: 'COLD', arbeit: 'IN PROGRESS', bereit: 'READY', geprueft: 'VERIFIED' };
    return (lang === 'de' ? de : en)[state] ?? state.toUpperCase();
  };
  const chipAt = (g: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, filled: boolean): number => {
    g.font = '500 15px "Geist Mono", monospace';
    const w = g.measureText(text).width + 26;
    g.fillStyle = filled ? color : 'rgba(255,255,255,0.04)';
    g.globalAlpha = filled ? 0.18 : 1;
    roundRect(g, x - w, y, w, 30, 15);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = color;
    g.lineWidth = 1.5;
    roundRect(g, x - w, y, w, 30, 15);
    g.stroke();
    g.fillStyle = color;
    g.fillText(text, x - w + 13, y + 21);
    return w;
  };
  const header = (g: CanvasRenderingContext2D, c: HTMLCanvasElement, text: string, chip: string | null): void => {
    g.fillStyle = '#1F1F1F';
    g.fillRect(0, 0, c.width, c.height);
    const grd = g.createLinearGradient(0, 0, c.width, 0);
    grd.addColorStop(0, css.orange);
    grd.addColorStop(1, css.teal);
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, 3);
    g.font = '500 17px "Geist Mono", monospace';
    g.fillStyle = css.textMuted;
    g.fillText(text, 28, 40);
    if (!chip) return;
    g.font = '500 14px "Geist Mono", monospace';
    const cw = g.measureText(chip).width + 24;
    g.fillStyle = chip.startsWith('ILLUS') ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)';
    roundRect(g, c.width - cw - 24, 20, cw, 28, 14);
    g.fill();
    g.fillStyle = chip.startsWith('ILLUS') ? css.warning : css.textSecondary;
    g.fillText(chip, c.width - cw - 12, 39);
  };
  const drawSelf = (): void => {
    const lang = ctx.lang;
    const p = systems?.panel() ?? null;
    for (const { c, tex, rotors } of selfCanvases) {
      const g = c.getContext('2d')!;
      if (rotors.length) {
        const n = systems?.liftShown() ?? 0;
        header(g, c, lang === 'de' ? `// STARTKLAR · AUFTRIEB ${n}/6` : `// READY FOR TAKE-OFF · LIFT ${n}/6`, lang === 'de' ? 'ILLUSTRATIV' : 'ILLUSTRATIVE');
        rotors.forEach((m, k) => {
          const y0 = 62 + k * 164;
          const lamp: SystemLamp = p ? p.lamps[m - 1] : 'dark';
          const col = LAMP_CSS[lamp];
          g.strokeStyle = lamp === 'dark' ? '#2A2A2A' : col;
          g.globalAlpha = lamp === 'dark' ? 1 : 0.55;
          g.lineWidth = 2;
          g.strokeRect(20, y0, c.width - 40, 150);
          g.globalAlpha = 1;
          g.fillStyle = col;
          g.beginPath();
          g.arc(52, y0 + 36, 11, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = css.text;
          g.font = '700 30px "Space Grotesk", sans-serif';
          g.fillText(`M${m}`, 76, y0 + 47);
          g.fillStyle = css.textSecondary;
          g.font = '400 19px "Geist", sans-serif';
          g.fillText(name(ZONE_PLOTS[m - 1].id)[lang], 140, y0 + 46);
          const st = systems?.shown(`M${m}` as 'M1') ?? 'kalt';
          chipAt(g, c.width - 36, y0 + 18, stateWord(lamp, st, lang), lamp === 'dark' ? css.textSecondary : col, lamp !== 'dark');
          // the rc4 torque drift (ILLUSTRATIV): how the island measures its own rotors
          const d = drift[m - 1];
          const x0 = 44,
            x1 = c.width - 170,
            yb = y0 + 132,
            yt = y0 + 72;
          g.strokeStyle = '#2A2A2A';
          g.lineWidth = 1;
          for (let i = 0; i <= 2; i++) {
            const yy = yb - ((yb - yt) * i) / 2;
            g.beginPath();
            g.moveTo(x0, yy);
            g.lineTo(x1, yy);
            g.stroke();
          }
          const pts: [number, number][] = [];
          for (let i = 0; i <= 16; i++) {
            const t = i / 16;
            const v = (d * (1 - Math.exp(-t * 2.2))) / (1 - Math.exp(-2.2));
            pts.push([x0 + (x1 - x0) * t, yb - (v / 14) * (yb - yt)]);
          }
          g.strokeStyle = css.text;
          g.lineWidth = 2;
          g.beginPath();
          pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.stroke();
          g.fillStyle = d >= 10 ? css.orange : css.text;
          g.font = '700 32px "Space Grotesk", sans-serif';
          g.fillText(`${d} %`, x1 + 22, y0 + 128);
          g.fillStyle = css.textMuted;
          g.font = '500 13px "Geist Mono", monospace';
          g.fillText(lang === 'de' ? 'DREHMOMENT-DRIFT · 8 h · 45 °C' : 'TORQUE DRIFT · 8 h · 45 °C', x0, y0 + 66);
        });
        continue;
      }
      // ENERGIE · NAVIGATION
      header(g, c, lang === 'de' ? '// STARTKLAR · ENERGIE · NAVIGATION' : '// READY FOR TAKE-OFF · ENERGY · NAVIGATION', lang === 'de' ? 'FIKTION' : 'FICTION');
      const bar = p?.bar ?? { lamp: 'dark' as SystemLamp, segments: 0 };
      const akkuState = systems?.shown('AKKU') ?? 'kalt';
      const y0 = 70;
      g.strokeStyle = bar.lamp === 'dark' ? '#2A2A2A' : LAMP_CSS[bar.lamp];
      g.globalAlpha = bar.lamp === 'dark' ? 1 : 0.55;
      g.lineWidth = 2;
      g.strokeRect(20, y0, c.width - 40, 220);
      g.globalAlpha = 1;
      g.fillStyle = css.text;
      g.font = '700 30px "Space Grotesk", sans-serif';
      g.fillText(lang === 'de' ? 'Startakku' : 'Start battery', 44, y0 + 50);
      chipAt(g, c.width - 36, y0 + 22, stateWord(bar.lamp, akkuState, lang), bar.lamp === 'dark' ? css.textSecondary : LAMP_CSS[bar.lamp], bar.lamp !== 'dark');
      for (let i = 0; i < 10; i++) {
        const x = 44 + i * 55;
        const lit = i < bar.segments;
        g.fillStyle = lit ? LAMP_CSS[bar.lamp] : bar.lamp === 'red' ? 'rgba(248,113,113,0.22)' : '#2A2A2A';
        roundRect(g, x, y0 + 80, 46, 56, 6);
        g.fill();
      }
      g.fillStyle = css.textSecondary;
      g.font = '400 19px "Geist", sans-serif';
      const crewA = systems?.crewShown('AKKU') ?? false;
      g.fillText(
        crewA ? (lang === 'de' ? 'von der Bodencrew bereitgestellt' : 'provided by the ground crew') : bar.segments >= 10 ? (lang === 'de' ? 'vom Sonnenacker geladen' : 'charged at the Sun Field') : lang === 'de' ? 'lädt am Sonnenacker, unten im Revier' : 'charges at the Sun Field, down in the Revier',
        44,
        y0 + 176,
      );
      g.fillStyle = css.textMuted;
      g.font = '500 15px "Geist Mono", monospace';
      g.fillText(`${Math.round((systems?.chargeShown() ?? 0) * 100)} %`, 44, y0 + 204);
      const nav = p?.nav ?? ('dark' as SystemLamp);
      const navState = systems?.shown('NAV') ?? 'kalt';
      const y1 = 310;
      g.strokeStyle = nav === 'dark' ? '#2A2A2A' : LAMP_CSS[nav];
      g.globalAlpha = nav === 'dark' ? 1 : 0.55;
      g.strokeRect(20, y1, c.width - 40, 220);
      g.globalAlpha = 1;
      g.fillStyle = LAMP_CSS[nav];
      g.beginPath();
      g.arc(70, y1 + 112, 26, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = css.text;
      g.font = '700 30px "Space Grotesk", sans-serif';
      g.fillText(lang === 'de' ? 'Flugmodell' : 'Flight model', 44, y1 + 50);
      chipAt(g, c.width - 36, y1 + 22, stateWord(nav, navState, lang), nav === 'dark' ? css.textSecondary : LAMP_CSS[nav], nav !== 'dark');
      g.fillStyle = css.textSecondary;
      g.font = '400 19px "Geist", sans-serif';
      const crewN = systems?.crewShown('NAV') ?? false;
      g.fillText(
        crewN ? (lang === 'de' ? 'von der Bodencrew bereitgestellt' : 'provided by the ground crew') : nav === 'teal' || nav === 'teal-halo' ? (lang === 'de' ? 'im Traumhangar geprüft' : 'checked in the Dream Hangar') : lang === 'de' ? 'lernt im Traumhangar, unten in der Werft' : 'learns in the Dream Hangar, down at the shipyard',
        120,
        y1 + 120,
      );
      g.fillStyle = css.textMuted;
      g.font = '500 15px "Geist Mono", monospace';
      g.fillText(lang === 'de' ? 'DIE NADEL AM TURM ZEIGT ES ALLEN' : 'THE TOWER’S NEEDLE SHOWS IT TO EVERYONE', 120, y1 + 160);
      tex.needsUpdate = true;
    }
    for (const { tex } of selfCanvases) tex.needsUpdate = true;
  };

  // tagline plate between the two walls (N side of the E wall)
  // ── Pass-Terminal (4, 0, 3), screen faces the door (+z) ──────────────────
  const term = new THREE.Group();
  term.position.set(4, 0, 3);
  term.rotation.y = -0.35;
  parent.add(term);
  const body = merge([new RoundedBoxGeometry(0.9, 0.98, 0.55, 2, 0.06).translate(0, 0.6, 0)]);
  term.add(markStatic(new THREE.Mesh(body, M.standard({ color: 0xd6d3d1, roughness: 0.5, metalness: 0 }))));
  const foot = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.11, 0.46, 2, 0.03).translate(0, 0.055, 0), M.standard({ color: 0x1c1917, roughness: 0.38, metalness: 0.2 }));
  term.add(markStatic(foot));
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.03, 0.57).translate(0, 1.08, 0), M.standard({ color: 0xc9c4bf, roughness: 0.3, metalness: 0.95 }));
  term.add(markStatic(trim));
  const scrCanvas = document.createElement('canvas');
  scrCanvas.width = 512;
  scrCanvas.height = 340;
  const scrTex = new THREE.CanvasTexture(scrCanvas);
  scrTex.colorSpace = THREE.SRGBColorSpace;
  const scrMat = new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: true });
  ctx.onDispose(() => {
    scrTex.dispose();
    scrMat.dispose();
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.7), scrMat);
  screen.position.set(0, 1.36, 0.06);
  screen.rotation.x = -0.42;
  term.add(screen);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.8, 0.06, 2, 0.025), M.standard({ color: 0x1c1917, roughness: 0.38, metalness: 0.2 }));
  bezel.position.set(0, 1.35, 0.03);
  bezel.rotation.x = -0.42;
  term.add(markStatic(bezel));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 16), M.standard({ color: 0xc9c4bf, roughness: 0.3, metalness: 0.95 }));
  neck.position.set(0, 1.1, -0.05);
  term.add(markStatic(neck));
  ctx.physics.addStaticBox({ size: [1.0, 1.6, 0.7], position: [4, 0.8, 3], rotation: [0, -0.35, 0] });
  const drawScreen = (): void => {
    const g = scrCanvas.getContext('2d')!;
    const lang = ctx.lang;
    g.fillStyle = '#0F0E0D';
    g.fillRect(0, 0, 512, 340);
    // mark with per-arc opacity (stamps), like the Pass cover (§8.1)
    // the same rule as the Pass cover and the tower: earned (non-skipped) stamps light the mark
    const total = ctx.game.progress().earnedStamps;
    const cx = 128,
      cy = 170,
      R = 112,
      s = R / 400;
    g.fillStyle = css.base;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8 * s * 1.5;
    g.strokeStyle = css.orange;
    g.globalAlpha = total >= 1 ? 1 : 0.2;
    g.beginPath();
    g.arc(cx, cy, 375 * s, 0, Math.PI * 2);
    g.stroke();
    for (const a of recamanArcs()) {
      g.globalAlpha = total >= a.k + 1 ? 1 : 0.2;
      g.beginPath();
      // canvas y grows down: mark +y up → flip
      const start = a.side === 1 ? -Math.PI / 2 : Math.PI / 2;
      g.arc(cx, cy - a.cy * s, a.r * s, start, start + Math.PI, false);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = css.textMuted;
    g.font = '500 15px "Geist Mono", monospace';
    g.fillText(lang === 'de' ? '// ACADEMY-PASS' : '// ACADEMY PASS', 268, 64);
    g.fillStyle = css.text;
    g.font = '700 40px "Space Grotesk", sans-serif';
    g.fillText(`${total} / 18`, 268, 118);
    g.fillStyle = css.textSecondary;
    g.font = '400 18px "Geist", sans-serif';
    g.fillText(lang === 'de' ? 'Stempel' : 'stamps', 268, 146);
    g.fillStyle = css.teal;
    g.font = '500 17px "Geist Mono", monospace';
    g.fillText(lang === 'de' ? '[E] Pass öffnen' : '[E] Open pass', 268, 236);
    g.fillStyle = css.textMuted;
    g.font = '500 14px "Geist Mono", monospace';
    g.fillText(lang === 'de' ? 'Jederzeit: [Tab]' : 'Anytime: [Tab]', 268, 266);
    scrTex.needsUpdate = true;
  };
  ctx.addInteractable({
    object: screen,
    label: { de: 'Academy Pass öffnen', en: 'Open Academy Pass' },
    hint: { de: 'Pass-Terminal', en: 'Pass terminal' },
    range: 3,
    onInteract: () => {
      ctx.events.emit('ui:open-pass');
      terminalFn?.();
    },
  });

  // ── Inselmodell (−4, 0, 3), Ø 3 m, scale 1:70 ────────────────────────────
  // the table is the interactable: its static parts merge inside it (raycast + highlight keep working)
  const table = mergeScope(new THREE.Group());
  table.position.set(-4, 0, 3);
  parent.add(table);
  table.add(markStatic(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.68, 0.88, 32).translate(0, 0.5, 0), M.standard({ color: 0xd6d3d1, roughness: 0.5, metalness: 0 }))));
  table.add(markStatic(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.62, 0.08, 32).translate(0, 0.04, 0), M.standard({ color: 0x1c1917, roughness: 0.38, metalness: 0.2 }))));
  table.add(markStatic(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.55, 0.1, 64).translate(0, 0.95, 0), M.standard({ color: 0x1c1917, roughness: 0.38, metalness: 0.2 }))));
  table.add(markStatic(new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.03, 6, 96).rotateX(Math.PI / 2).translate(0, 1.0, 0), M.standard({ color: 0xc9c4bf, roughness: 0.3, metalness: 0.95 }))));
  ctx.physics.addStaticCylinder({ radius: 1.6, height: 1.05, position: [-4, 0.52, 3] });
  const S = 1 / 70;
  const model = new THREE.Group();
  model.position.y = 1.0;
  table.add(model);
  {
    const shape = new THREE.Shape();
    const n = 240;
    for (let i = 0; i < n; i++) {
      const b = (i / n) * 360;
      const r = outlineRadius(b, true) * S;
      const x = Math.sin(b * DEG) * r,
        y = Math.cos(b * DEG) * r; // shape y = −z (rotated below)
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const deck = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false }).rotateX(-Math.PI / 2);
    model.add(markStatic(new THREE.Mesh(deck, M.standard({ color: 0xb8b1aa, roughness: 0.8 }))));
    const keel = new THREE.ConeGeometry(80 * S, 56 * S, 24).rotateX(Math.PI).translate(0, -28 * S, 0);
    model.add(markStatic(new THREE.Mesh(keel, M.standard({ color: 0x57534e, roughness: 0.9, flatShading: true }))));
    const tower = new THREE.CylinderGeometry(7 * S, 9 * S, 44 * S, 12).translate(0, 0.05 + 22 * S, 0);
    model.add(markStatic(new THREE.Mesh(tower, M.standard({ color: 0xd6d3d1, roughness: 0.5, metalness: 0 }))));
    const plots = merge(ZONE_PLOTS.map((p) => new THREE.CylinderGeometry(22 * S, 22 * S, 0.012, 32).translate(p.anchor[0] * S, 0.056, p.anchor[2] * S)));
    model.add(markStatic(new THREE.Mesh(plots, M.standard({ color: 0x57534e, roughness: 0.8 }))));
  }
  const beaconMat = {
    stone: M.standard({ color: 0x78716c, roughness: 0.5 }),
    teal: M.standard({ color: 0x2dd4bf, emissive: 0x2dd4bf, emissiveIntensity: 1.5 }),
    orange: M.standard({ color: 0xff6700, emissive: 0xff6700, emissiveIntensity: 1.8 }),
  };
  const miniBeacons = new Map<string, THREE.Mesh>();
  for (const p of ZONE_PLOTS) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), beaconMat.stone);
    b.position.set(p.anchor[0] * S, 0.2, p.anchor[2] * S);
    model.add(b);
    miniBeacons.set(p.id, b);
  }
  ctx.addInteractable({
    object: table,
    label: { de: 'Inselkarte öffnen', en: 'Open island map' },
    hint: { de: 'Inselmodell 1:70', en: 'Island model 1:70' },
    range: 3.2,
    onInteract: () => ctx.events.emit('ui:open-map'),
  });
  void ISLAND;

  const refresh = (): void => {
    drawLern();
    drawSelf();
    drawScreen();
    for (const p of ZONE_PLOTS) {
      const b = miniBeacons.get(p.id)!;
      b.material = p.id === objective ? beaconMat.orange : ctx.zones.visited(p.id) ? beaconMat.teal : beaconMat.stone;
    }
  };
  refresh();
  ctx.i18n.onChange(refresh);
  for (const ev of ['stamp:awarded', 'stamp:updated', 'zone:enter', 'progress:reset', 'stars:changed']) ctx.events.on(ev, refresh);

  // everything in the foyer stands still (C11b)
  ctx.freezeStatic(parent);

  return {
    onTerminal(fn) {
      terminalFn = fn;
    },
    setObjective(id) {
      objective = id;
      towerState.objective = id;
      towerState.beaconsDirty = true;
      refresh();
    },
    setSystems(display) {
      systems = display;
      // redraw only when what the board shows changed (a pulse repaints the lamps 30× a second)
      let key = '';
      const check = (): void => {
        const p = display.panel();
        const k = `${p.lamps.join()}|${p.bar.lamp}:${p.bar.segments}|${p.nav}|${display.crewShown('AKKU')}${display.crewShown('NAV')}|${ctx.lang}`;
        if (k === key) return;
        key = k;
        drawSelf();
      };
      display.onChange(check);
      check();
    },
    refresh,
  };
}

function drawStar(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string | null, stroke: string | null): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = 1.5;
    g.stroke();
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
