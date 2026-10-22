import * as THREE from 'three';
import type { Game } from '@/core/Game';
import type { TriggerRecord } from '@/core/Physics';
import type { TriggerOptions } from '@/core/zones/types';
import { toVec3 } from '@/core/types';

/** ?debug=1 / F3: stats text + Rapier collider wireframes + trigger volumes. */
export class DebugOverlay {
  enabled = false;
  private lines: THREE.LineSegments;
  private geo = new THREE.BufferGeometry();
  private frame = 0;
  private triggerViz = new Map<TriggerRecord, THREE.Object3D>();
  private textTimer = 0;

  constructor(private game: Game) {
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthTest: true, fog: false, toneMapped: false });
    mat.name = 'core:debug-lines';
    this.lines = new THREE.LineSegments(this.geo, mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.lines.renderOrder = 998;
    game.rs.scene.add(this.lines);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.lines.visible = on;
    this.game.hud.debugEl.classList.toggle('hidden', !on);
    for (const o of this.triggerViz.values()) o.visible = on;
  }

  addTriggerViz(rec: TriggerRecord, o: TriggerOptions, root: THREE.Object3D): void {
    let geo: THREE.BufferGeometry;
    if (o.shape === 'box') {
      const s = toVec3(o.size);
      geo = new THREE.BoxGeometry(s.x, s.y, s.z);
    } else if (o.shape === 'sphere') geo = new THREE.SphereGeometry(o.radius, 16, 10);
    else geo = new THREE.CylinderGeometry(o.radius, o.radius, o.height, 20);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.12, depthWrite: false, wireframe: false }));
    const p = toVec3(o.position);
    m.position.set(p.x, p.y, p.z);
    if (o.rotation) {
      const r = toVec3(o.rotation);
      m.rotation.set(r.x, r.y, r.z);
    }
    m.userData.noCollide = true;
    m.raycast = () => {};
    m.visible = this.enabled;
    root.add(m);
    this.triggerViz.set(rec, m);
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.frame++;
    if (this.frame % 3 === 0) {
      const { vertices, colors } = this.game.physics.world.debugRender();
      this.geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      this.geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
      this.geo.attributes.position.needsUpdate = true;
    }
    for (const [rec, obj] of this.triggerViz) {
      if (rec.removed) {
        obj.removeFromParent();
        this.triggerViz.delete(rec);
        continue;
      }
      ((obj as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(rec.inside.size ? 0xff6700 : 0x2dd4bf);
    }
    this.textTimer -= dt;
    if (this.textTimer > 0) return;
    this.textTimer = 0.25;
    const g = this.game;
    const info = g.rs.info();
    const p = g.player.feet;
    const zones = g.zones.status();
    const zl = zones
      .filter((z) => z.status !== 'skipped')
      .map((z) => (z.status === 'error' ? `<span class="bad">${z.id}: ${escape(z.error ?? 'error')}</span>` : `${z.id}: ${z.status}${z.plot?.fallback ? ' (fallback plot)' : ''}`))
      .join('\n');
    g.hud.debugEl.innerHTML =
      `<b>FPS</b> ${g.rs.fps.toFixed(0)}  <b>Q</b> ${g.rs.level}${g.rs.setting === 'auto' ? ' (auto)' : ''}  <b>PR</b> ${g.rs.renderer.getPixelRatio().toFixed(2)}${g.rs.renderScale < 0.999 ? ` (×${g.rs.renderScale.toFixed(1)})` : ''}${g.rs.cloudLite ? ' clouds-lite' : ''}  <b>cpu</b> ${g.cpuMs.toFixed(1)} ms${g.rs.gpuMs != null ? `  <b>gpu</b> ${g.rs.gpuMs.toFixed(1)} ms` : ''}\n` +
      `<b>draw</b> ${info.calls}  <b>tris</b> ${(info.triangles / 1000).toFixed(1)}k  <b>geo</b> ${info.geometries}  <b>tex</b> ${info.textures}  <b>prog</b> ${info.programs}\n` +
      `<b>bodies</b> ${g.physics.world.bodies.len()}  <b>colliders</b> ${g.physics.world.colliders.len()}  <b>dyn</b> ${g.physics.dynamics.size}\n` +
      `<b>pos</b> ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}  <b>yaw</b> ${THREE.MathUtils.radToDeg(g.player.yaw).toFixed(0)}°  <b>pitch</b> ${THREE.MathUtils.radToDeg(g.player.pitch).toFixed(0)}°  ${g.player.grounded ? 'grounded' : 'air'}\n` +
      `<b>zone</b> ${g.zones.current() ?? '—'}  <b>surface</b> ${g.player.surface}\n` +
      (zl ? `<b>zones</b>\n${zl}` : '');
  }
}

function escape(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}
