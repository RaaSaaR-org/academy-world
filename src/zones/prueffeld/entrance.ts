/**
 * The entrance fork: from the gate two lanes split — left a glossy white runway with the vendor's
 * roll-up banners toward the showroom („MARKETING“), right an industrial lane with metre ticks
 * toward the Messzelle („MESSUNG“). The brand line, laid out as the zone's floor plan.
 */
import * as THREE from 'three';
import { atlasQuads, FONT_DISPLAY, FONT_MONO, makeCanvas, Painter, patchInstancedUv, place } from './geom';
import type { Shared } from './state';

export function buildEntrance(S: Shared): void {
  const ctx = S.ctx;
  const M = ctx.materials;
  const ext = ctx.groups.exterior;
  const det = ctx.groups.detail;

  // ── lanes: a fork right behind the gate (one merged mesh, vertex colours) ──
  // band A runs across at the gate, band B turns toward the stage / the Messzelle
  const FZ0 = 16.9,
    FZ1 = 19.4;
  const L = { x: -5.0, w: 3.0, z0: 4.65, z1: FZ0, ax0: -6.5, ax1: -1.3 };
  const R = { x: 10.0, w: 3.0, z0: 9.7, z1: FZ0, ax0: 1.3, ax1: 11.5 };
  const lanes = new Painter()
    .box(L.ax1 - L.ax0, 0.03, FZ1 - FZ0, [(L.ax0 + L.ax1) / 2, 0.035, (FZ0 + FZ1) / 2], 0xf5f5f4)
    .box(L.w, 0.03, L.z1 - L.z0, [L.x, 0.035, (L.z0 + L.z1) / 2], 0xf5f5f4)
    .box(R.ax1 - R.ax0, 0.03, FZ1 - FZ0, [(R.ax0 + R.ax1) / 2, 0.035, (FZ0 + FZ1) / 2], 0x2b2826)
    .box(R.w, 0.03, R.z1 - R.z0, [R.x, 0.035, (R.z0 + R.z1) / 2], 0x2b2826);
  // casts like the stage body (same packed material): mergeStatic folds both into one draw (Z1)
  ext.add(lanes.mesh(M.standard({ vertexColors: true, roughness: 0.2, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }), { cast: true }));
  // vendor runway: warm LED dots along the edges
  const dots = new Painter();
  for (let z = L.z0 + 0.6; z < L.z1; z += 1.2) for (const dx of [-L.w / 2 + 0.12, L.w / 2 - 0.12]) dots.add(new THREE.CircleGeometry(0.045, 10).rotateX(-Math.PI / 2), 0xffffff, [L.x + dx, 0.053, z]);
  for (let x = L.ax0 + 0.6; x < L.ax1; x += 1.2) for (const z of [FZ0 + 0.12, FZ1 - 0.12]) dots.add(new THREE.CircleGeometry(0.045, 10).rotateX(-Math.PI / 2), 0xffffff, [x, 0.053, z]);
  const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1dc).multiplyScalar(1.5) });
  ctx.onDispose(() => dotMat.dispose());
  const dotMesh = new THREE.Mesh(dots.merge(), dotMat);
  dotMesh.userData.noCollide = true;
  det.add(dotMesh);

  // ── floor print: fork words, chevrons, metre ticks (one canvas, one mesh) ──
  const fp = makeCanvas(1024, 1024);
  ctx.onDispose(() => fp.tex.dispose());
  const draw = (): void => {
    const g = fp.g;
    g.clearRect(0, 0, 1024, 1024);
    // cell A (0..512 × 0..256): MARKETING on white  ·  cell B (512..1024 × 0..256): MESSUNG on dark
    const word = (text: string, x: number, color: string, arrow: 'l' | 'r'): void => {
      g.save();
      g.fillStyle = color;
      g.font = `700 92px ${FONT_DISPLAY}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const w = Math.min(430, g.measureText(text).width);
      g.fillText(text, x + 256, 112, 430);
      g.font = `500 30px ${FONT_MONO}`;
      g.fillText(arrow === 'l' ? '← ' + ctx.t('floor.demo') : ctx.t('floor.cell') + ' →', x + 256, 196, 430);
      g.globalAlpha = 0.18;
      g.fillRect(x + 256 - w / 2, 150, w, 3);
      g.restore();
    };
    word(ctx.t('floor.left'), 0, '#1c1917', 'l');
    word(ctx.t('floor.right'), 512, '#E7E5E4', 'r');
    // cell C (0..1024 × 256..512): metre tape along the measuring lane, 0–9 m
    g.fillStyle = '#E7E5E4';
    for (let m = 0; m <= 100; m++) {
      const x = 10 + m * 10;
      const len = m % 10 === 0 ? 120 : m % 5 === 0 ? 80 : 46;
      g.fillRect(x, 256 + 10, m % 10 === 0 ? 5 : 3, len);
      if (m % 10 === 0 && m < 100) {
        g.font = `500 52px ${FONT_MONO}`;
        g.fillText(`${m / 10}`, x + 12, 256 + 186);
      }
    }
    g.font = `500 30px ${FONT_MONO}`;
    g.fillStyle = '#2DD4BF';
    g.fillText('m', 1000 - 40, 256 + 186);
    // cell D (0..1024 × 512..1024): stencil chevrons (white paint, worn)
    g.fillStyle = '#D6D3D1';
    for (let i = 0; i < 3; i++) {
      const x = 170 + i * 300;
      g.beginPath();
      g.moveTo(x, 600);
      g.lineTo(x + 120, 760);
      g.lineTo(x, 920);
      g.lineTo(x - 70, 920);
      g.lineTo(x + 50, 760);
      g.lineTo(x - 70, 600);
      g.closePath();
      g.fill();
    }
    // wear
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) {
      g.globalAlpha = 0.25 + Math.random() * 0.5;
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    fp.tex.needsUpdate = true;
  };
  draw();
  ctx.i18n.onChange(draw);
  const quad = (w: number, d: number, u0: number, v0: number, u1: number, v1: number, p: [number, number, number], rotY = 0): THREE.BufferGeometry => {
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    g.rotateX(-Math.PI / 2);
    return place(g, p, [0, rotY, 0]);
  };
  const prints = new Painter();
  prints.parts.push(quad(4.2, 2.1, 0, 0.75, 0.5, 1, [(L.ax0 + L.ax1) / 2 + 0.2, 0.056, (FZ0 + FZ1) / 2]));
  prints.parts.push(quad(4.2, 2.1, 0.5, 0.75, 1, 1, [R.ax0 + 2.4, 0.056, (FZ0 + FZ1) / 2]));
  // metre tape along the measuring lane toward the cell (reads from the lane), 7 m
  prints.parts.push(quad(7.0, 0.5, 0.0, 0.5, 0.7, 0.75, [R.x + R.w / 2 - 0.3, 0.056, R.z1 - 3.5], Math.PI / 2));
  // chevrons: across the fork band toward the right, then down toward the cell
  prints.parts.push(quad(1.5, 1.5, 0, 0.0, 1, 0.5, [7.6, 0.056, (FZ0 + FZ1) / 2]));
  prints.parts.push(quad(1.5, 1.5, 0, 0.0, 1, 0.5, [R.x - 0.25, 0.056, 12.4], -Math.PI / 2));
  const printMat = new THREE.MeshStandardMaterial({ map: fp.tex, transparent: true, roughness: 0.75, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 });
  ctx.onDispose(() => printMat.dispose());
  const printMesh = new THREE.Mesh(prints.merge(), printMat);
  printMesh.receiveShadow = true;
  printMesh.renderOrder = 1;
  ext.add(printMesh);
  // hazard edges of the measuring lane
  const tapes = new THREE.Mesh(
    new Painter()
      .addUv(new THREE.BoxGeometry(R.z1 - R.z0, 0.012, 0.08), [R.x - R.w / 2, 0.056, (R.z0 + R.z1) / 2], [0, Math.PI / 2, 0])
      .addUv(new THREE.BoxGeometry(FZ1 - R.z0, 0.012, 0.08), [R.x + R.w / 2, 0.056, (R.z0 + FZ1) / 2], [0, Math.PI / 2, 0])
      .addUv(new THREE.BoxGeometry(R.ax1 - R.ax0, 0.012, 0.08), [(R.ax0 + R.ax1) / 2, 0.056, FZ1])
      .addUv(new THREE.BoxGeometry(R.x - R.w / 2 - R.ax0, 0.012, 0.08), [(R.ax0 + R.x - R.w / 2) / 2, 0.056, FZ0])
      .merge(),
    M.hazard((R.z1 - R.z0) / 0.08),
  );
  det.add(tapes);

  // ── vendor roll-up banners (FIKTION) ───────────────────────────────────────
  const ban = makeCanvas(768, 640);
  ctx.onDispose(() => ban.tex.dispose());
  const drawBanners = (): void => {
    const g = ban.g;
    const texts = [ctx.t('banner.b1'), ctx.t('banner.b2'), ctx.t('banner.b3')];
    for (let i = 0; i < 3; i++) {
      const x = i * 256;
      const grd = g.createLinearGradient(0, 0, 0, 640);
      grd.addColorStop(0, '#FAFAF9');
      grd.addColorStop(1, '#E7E5E4');
      g.fillStyle = grd;
      g.fillRect(x, 0, 256, 640);
      // glossy swoosh
      g.strokeStyle = 'rgba(28,25,23,0.10)';
      g.lineWidth = 18;
      g.beginPath();
      g.moveTo(x - 20, 470);
      g.bezierCurveTo(x + 80, 380, x + 160, 560, x + 290, 420);
      g.stroke();
      g.fillStyle = '#1c1917';
      g.font = `500 15px ${FONT_MONO}`;
      g.textAlign = 'center';
      g.fillText(ctx.t('backdrop.brand').split('').join(' '), x + 128, 52);
      g.font = `700 ${i === 0 ? 92 : 46}px ${FONT_DISPLAY}`;
      const lines = texts[i].split('\n');
      lines.forEach((ln, k) => g.fillText(ln, x + 128, 240 + k * 54 - (lines.length - 1) * 27, 228));
      g.font = `500 13px ${FONT_MONO}`;
      g.fillStyle = '#78716C';
      g.fillText(ctx.t('fiction'), x + 128, 612);
    }
    ban.tex.needsUpdate = true;
  };
  drawBanners();
  ctx.i18n.onChange(drawBanners);
  const banMat = new THREE.MeshStandardMaterial({ map: ban.tex, roughness: 0.35, metalness: 0, emissiveMap: ban.tex, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide });
  patchInstancedUv(banMat, 'prueffeld-banner');
  ctx.onDispose(() => banMat.dispose());
  const { mesh: banners, uv } = atlasQuads(3, banMat);
  const BAN: [number, number, number][] = [
    [-7.1, 16.6, 0.55],
    [-7.1, 12.4, 0.55],
    [-7.1, 8.2, 0.55],
  ];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const stands = new Painter();
  BAN.forEach(([x, z, yaw], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    m4.compose(new THREE.Vector3(x, 0.12, z), q, new THREE.Vector3(0.95, 2.38, 1));
    banners.setMatrixAt(i, m4);
    uv.setXYZW(i, i / 3, 0, 1 / 3, 1);
    stands.box(1.05, 0.1, 0.24, [x, 0.05, z], 0x1c1917, [0, yaw, 0]);
    stands.box(0.02, 0.02, 0.02, [x, 2.52, z], 0x292524);
  });
  banners.instanceMatrix.needsUpdate = true;
  uv.needsUpdate = true;
  banners.castShadow = true;
  det.add(banners);
  det.add(stands.mesh(M.standard({ vertexColors: true, roughness: 0.4, metalness: 0.4 })));
}
