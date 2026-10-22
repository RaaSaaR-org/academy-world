/**
 * WP15 — egg 14 „Fotopunkt“ (plan §4.13 H0, R9 §5 #14): a camera mark on the Ausguck floor. E starts the
 * photo mode: the HUD goes away, a frame shows the picture, the focal length (24 / 35 / 50 / 85 mm on a
 * full-frame sensor, mouse wheel or 1–4) sets the field of view, E or Space takes the photo, Esc leaves.
 * The photo is saved locally as a PNG with the EmAI wordmark (as the certificate: the mark and „Em“ +
 * orange „AI“), „Academy · Schwebewerk“ and the date: nothing is uploaded. The first photo is the find.
 * Offered once after the lift-off; and after it, H on the Ausguck names the way to the nearest egg you
 * have not found (levels H0–H2, ctx.game.secrets.nearestHint; never the H3 riddles).
 */
import * as THREE from 'three';
import { logoSvg, type Text, type ZoneContext } from '@/core/zones';
import type { Director } from '../life/director';
import { FOTO } from '../life/tuning';
import { PAL, at, box, col, mergeParts } from '../life/geo';
import { TOWER } from '../layout';

const T = (de: string, en: string): Text => ({ de, en });
/** full-frame sensor: 36 × 24 mm, so the vertical field of view is 2·atan(12 mm / f) */
const vfov = (mm: number): number => 2 * Math.atan(12 / mm);
const CSS = `
body.life-photo #hud > *:not(#modals) { opacity: 0 !important; transition: opacity .25s; }
#life-photo-frame { position: fixed; inset: 0; pointer-events: none; z-index: 30; }
#life-photo-frame .f { position: absolute; inset: 4.5% 4.5% 13% 4.5%; border: 1px solid rgba(245,245,244,.7); }
#life-photo-frame .t { position: absolute; border-left: 1px solid rgba(245,245,244,.18); top: 4.5%; bottom: 13%; }
#life-photo-frame .h { position: absolute; border-top: 1px solid rgba(245,245,244,.18); left: 4.5%; right: 4.5%; }
#life-photo-frame .cap { position: absolute; left: 4.5%; bottom: 6.5%; font: 500 13px "Geist Mono", ui-monospace, monospace; letter-spacing: .1em; color: rgba(245,245,244,.85); text-transform: uppercase; }
#life-photo-frame .flash { position: absolute; inset: 0; background: #fff; opacity: 0; transition: opacity .35s ease-out; }
`;

export function buildFotopunkt(ctx: ZoneContext, h: { director: Director; paint: THREE.Material }): { stats(): Record<string, unknown> } {
  const D = h.director;
  const [mx, my, mz] = FOTO.mark;
  // the mark: a dark disc with a white camera pictogram, flush on the Ausguck deck
  const mark = new THREE.Mesh(
    mergeParts([
      at(col(new THREE.CylinderGeometry(0.36, 0.36, 0.008, 28), PAL.carbon), 0, 0.006, 0),
      at(col(new THREE.TorusGeometry(0.33, 0.012, 4, 36).rotateX(Math.PI / 2), PAL.teal), 0, 0.012, 0),
      box(0.26, 0.004, 0.16, PAL.white, 0, 0.012, 0.02),
      box(0.08, 0.004, 0.04, PAL.white, -0.06, 0.012, -0.08),
      at(col(new THREE.CylinderGeometry(0.05, 0.05, 0.006, 16), PAL.carbon), 0, 0.015, 0.02),
    ]),
    h.paint,
  );
  mark.name = 'life:fotopunkt-mark';
  mark.position.set(mx, my, mz);
  // the pictogram's top faces outward (toward the view over the Revier)
  mark.rotation.y = Math.atan2(mx, mz);
  mark.receiveShadow = true;
  D.roots.island.add(mark);
  D.track(mark);
  D.area('fotopunkt', { center: [mx, my, mz], radius: 2, frame: 'island' });
  D.register({ id: 'egg:fotopunkt', area: 'fotopunkt', job: T('Fotografieren', 'Take pictures'), kind: 'machine', tier: (t) => void (mark.visible = t === 'near') });

  let mm = FOTO.defaultMm;
  let yaw = 0;
  let pitch = 0;
  let photos = 0;
  let exit: (() => void) | null = null;
  let frame: HTMLElement | null = null;
  let readout: HTMLElement | null = null;
  let offKeys: (() => void) | null = null;
  const eye = new THREE.Vector3(mx, my + 1.62, mz);
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const setZoom = (): void => {
    const cam = ctx.camera;
    cam.zoom = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / Math.tan(vfov(mm) / 2);
    cam.updateProjectionMatrix();
    if (readout) readout.textContent = `${mm} mm · ${ctx.i18n.num(THREE.MathUtils.radToDeg(vfov(mm)), 0)}°`;
  };
  const date = (): string => new Date().toLocaleDateString(ctx.lang === 'de' ? 'de-DE' : 'en-GB');

  const shoot = (): void => {
    photos++;
    ctx.audio.play('click', { volume: 0.8 });
    ctx.audio.play('whoosh', { volume: 0.12, pitch: 2.4 });
    // one soft flash (a single ramp: flash-safe), none under reduced motion
    const fl = frame?.querySelector<HTMLElement>('.flash');
    if (fl && !ctx.settings.reducedMotion) {
      fl.style.transition = 'none';
      fl.style.opacity = '0.32';
      requestAnimationFrame(() => {
        fl.style.transition = 'opacity .45s ease-out';
        fl.style.opacity = '0';
      });
    }
    capture();
    if (photos === 1) ctx.game.secrets.find('fotopunkt', [mx, my + 1.2, mz]);
  };

  // the picture: the frame the renderer draws next (read right after it, before the browser presents it)
  const capture = (): void => {
    const scene = ctx.scene;
    const prev = scene.onAfterRender;
    scene.onAfterRender = function (renderer, ...rest) {
      scene.onAfterRender = prev;
      prev.call(this, renderer, ...rest);
      const gl = renderer.domElement;
      // the post passes finish in the same task; the microtask runs after them, before the frame is shown
      queueMicrotask(() => void compose(gl).catch((err) => console.warn('[life] the photo failed', err)));
    };
  };
  let logo: Promise<HTMLImageElement | null> | null = null;
  const logoImg = (): Promise<HTMLImageElement | null> =>
    (logo ??= new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoSvg({ disc: true, size: 256, stroke: 14 }));
    }));
  const compose = async (gl: HTMLCanvasElement): Promise<void> => {
    const W = FOTO.png.w;
    const Hh = Math.round((W * gl.height) / Math.max(1, gl.width));
    const band = Math.round(W * 0.07);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = Hh + band;
    const g = c.getContext('2d')!;
    g.drawImage(gl, 0, 0, W, Hh);
    // the band: the mark, „Em“ + orange „AI“, the line, the date and the focal length (brand rules as the certificate)
    g.fillStyle = '#141414';
    g.fillRect(0, Hh, W, band);
    const img = await logoImg();
    const pad = band * 0.2;
    if (img) g.drawImage(img, pad, Hh + pad, band - 2 * pad, band - 2 * pad);
    const x0 = band + pad * 0.4;
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(band * 0.36)}px "Space Grotesk", sans-serif`;
    g.fillStyle = '#F5F5F4';
    g.fillText('Em', x0, Hh + band * 0.42);
    const em = g.measureText('Em').width;
    g.fillStyle = '#FF6700';
    g.fillText('AI', x0 + em, Hh + band * 0.42);
    g.font = `500 ${Math.round(band * 0.17)}px "Geist Mono", ui-monospace, monospace`;
    g.fillStyle = '#A8A29E';
    g.fillText(ctx.lang === 'de' ? 'ACADEMY · SCHWEBEWERK' : 'ACADEMY · FLOATING WORKS', x0, Hh + band * 0.76);
    const right = `${date()} · ${mm} mm`;
    g.font = `500 ${Math.round(band * 0.2)}px "Geist Mono", ui-monospace, monospace`;
    g.fillStyle = '#F5F5F4';
    g.fillText(right, W - pad * 2 - g.measureText(right).width, Hh + band * 0.5);
    await new Promise<void>((res) =>
      c.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `emai-schwebewerk-foto-${new Date().toISOString().slice(0, 10)}.png`;
          a.style.display = 'none';
          document.body.append(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 4000);
        }
        res();
      }, 'image/png'),
    );
    ctx.game.juice.popup([mx, my + 1.9, mz], T('Foto gespeichert', 'Photo saved'), { tone: 'teal', seconds: 2 });
  };

  const leave = (): void => {
    offKeys?.();
    offKeys = null;
    frame?.remove();
    frame = null;
    readout = null;
    document.body.classList.remove('life-photo');
    ctx.camera.zoom = 1;
    ctx.camera.updateProjectionMatrix();
    exit = null;
  };
  const enter = (): void => {
    if (exit) return;
    if (!document.getElementById('life-photo-css')) {
      const st = document.createElement('style');
      st.id = 'life-photo-css';
      st.textContent = CSS;
      document.head.append(st);
    }
    yaw = ctx.player.yaw;
    pitch = Math.min(0.1, ctx.player.pitch);
    frame = document.createElement('div');
    frame.id = 'life-photo-frame';
    frame.innerHTML = '<div class="f"></div><div class="t" style="left:34.33%"></div><div class="t" style="left:65.67%"></div><div class="h" style="top:31.3%"></div><div class="h" style="top:58.7%"></div><div class="cap"></div><div class="flash"></div>';
    frame.querySelector('.cap')!.textContent = `EmAI Academy · Schwebewerk · ${date()}`;
    document.body.append(frame);
    document.body.classList.add('life-photo');
    const keys = ['KeyE', 'Space', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Minus', 'Equal'];
    exit = ctx.player.enterOperate({
      cameraPose: { position: [eye.x, eye.y, eye.z], yawDeg: THREE.MathUtils.radToDeg(yaw), pitchDeg: THREE.MathUtils.radToDeg(pitch) },
      title: T('// FOTOPUNKT', '// PHOTO SPOT'),
      panelPosition: 'bottom',
      panel: (el) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:12px;align-items:center;flex-wrap:wrap';
        readout = document.createElement('span');
        readout.style.cssText = 'font-family:var(--font-mono);font-size:14px';
        row.append(readout, ctx.ui.chip('modell', T('Kleinbild 36 × 24 mm: Bildwinkel = 2 · atan(12 mm / Brennweite)', 'Full frame 36 × 24 mm: field of view = 2 · atan(12 mm / focal length)')));
        const keysLine = document.createElement('div');
        keysLine.style.cssText = 'margin-top:8px;color:var(--text-2);font-size:13px';
        keysLine.dataset.chip = 'ui';
        keysLine.textContent = ctx.i18n.resolve(T('Mausrad oder 1–4: Brennweite · E: Foto · Esc: zurück', 'Wheel or 1–4: focal length · E: photo · Esc: back'));
        el.append(row, keysLine);
        setZoom();
      },
      capture: {
        keys,
        pointerLock: true,
        onLook: (dx, dy) => {
          const k = 0.0022 / Math.max(1, ctx.camera.zoom * 0.8);
          yaw -= dx * k;
          pitch = THREE.MathUtils.clamp(pitch - dy * k, -1.2, 0.9);
        },
        camera: (out) => {
          out.position.copy(eye);
          out.quaternion.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
          // the player's fov update never touches zoom; keep it in step with the focal length
          const want = Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2) / Math.tan(vfov(mm) / 2);
          if (Math.abs(ctx.camera.zoom - want) > 1e-4) setZoom();
        },
      },
      onPointer: (e) => {
        if (e.type !== 'wheel' || !e.deltaY) return;
        const i = FOTO.mm.indexOf(mm);
        const j = THREE.MathUtils.clamp(i + (e.deltaY < 0 ? 1 : -1), 0, FOTO.mm.length - 1);
        if (j !== i) {
          mm = FOTO.mm[j];
          setZoom();
          ctx.audio.play('click', { volume: 0.25, pitch: 1.6 });
        }
      },
      onExit: leave,
    });
    offKeys = ctx.input.onKey(
      keys,
      (code) => {
        if (code === 'KeyE' || code === 'Space') shoot();
        else if (code.startsWith('Digit')) {
          mm = FOTO.mm[Number(code.slice(5)) - 1] ?? mm;
          setZoom();
        } else {
          const i = FOTO.mm.indexOf(mm);
          mm = FOTO.mm[THREE.MathUtils.clamp(i + (code === 'Equal' ? 1 : -1), 0, FOTO.mm.length - 1)];
          setZoom();
        }
      },
      { anywhere: true, whileOperating: true },
    );
  };
  ctx.addInteractable({ object: mark, label: T('Fotopunkt: Foto machen', 'Photo spot: take a picture'), range: 2.6, onInteract: enter });
  ctx.onDispose(() => exit?.());

  // offered once after the lift-off (plan §4.13): EMI-01 points at the mark when the flight has settled
  ctx.events.on('flight:state', (p?: { state?: string }) => {
    if (p?.state !== 'airborne' || ctx.progress.get<boolean>('lifeFotoOffered', false) || ctx.game.secrets.has('fotopunkt')) return;
    ctx.progress.set('lifeFotoOffered', true);
    ctx.after(70, () => {
      if (!ctx.game.secrets.has('fotopunkt')) ctx.events.emit('radio:say', { owner: 'life', line: T('Jetzt gibt es das beste Bild. Die Kameramarke liegt auf dem Ausguck.', 'Now there is the best picture. The camera mark is on the lookout.'), delay: 1 });
    });
  });
  // after the lift-off: H on the Ausguck names the way to the nearest egg not yet found (H0–H2)
  const DIRS: Text[] = [T('Norden', 'north'), T('Nordosten', 'north-east'), T('Osten', 'east'), T('Südosten', 'south-east'), T('Süden', 'south'), T('Südwesten', 'south-west'), T('Westen', 'west'), T('Nordwesten', 'north-west')];
  ctx.events.on('emi:ask', (p?: { zone?: string | null }) => {
    if (p?.zone) return;
    const pp = ctx.player.position;
    const onAusguck = pp.y > TOWER.ausguck.y - 2 && Math.hypot(pp.x, pp.z) < TOWER.ausguck.outer + 0.5;
    if (!onAusguck || !ctx.quest.snapshot().flight.liftoffSeen) return;
    const hint = ctx.game.secrets.nearestHint(pp, 2);
    if (!hint) return;
    const dir = DIRS[Math.round(hint.bearing / 45) % 8] as { de: string; en: string };
    const m = Math.round(hint.distance / 10) * 10;
    const line: Text = { de: `Ein Fundstück wartet noch: Richtung ${dir.de}, etwa ${m} Meter.`, en: `A find is still waiting: towards the ${dir.en}, about ${m} metres.` };
    ctx.after(0.2, () => void ctx.hud.say([{ speaker: T('EMI-01 › Funk', 'EMI-01 › radio'), text: line }]));
  });
  ctx.debug.register('egg-foto', () => {
    photos++;
    ctx.game.secrets.find('fotopunkt', [mx, my + 1.2, mz]);
    return ctx.game.secrets.has('fotopunkt');
  });
  ctx.debug.register('egg-foto-enter', () => {
    enter();
    return !!exit;
  });
  ctx.debug.register('egg-foto-shoot', () => {
    shoot();
    return photos;
  });
  return { stats: () => ({ photos, active: !!exit, mm }) };
}
