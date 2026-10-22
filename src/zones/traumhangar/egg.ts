/**
 * Egg 12 „Traumraum“ (plan §4.13, R9 §5; album, H1–H2; never gates, no stars, D35): after a dream a
 * door appears in the partition beside lane A, for one round (30 s). Inside is the toy world model's
 * world: the floor ends where it saw no data, objects fade once you look away (and do not come back),
 * and there is a shortcut that exists only in the dream. Use it: back in reality it is a wall.
 * „Im Traum war da eine Tür. In echt ist da eine Wand. Gemessen.“ — Ha & Schmidhuber (2018) trained an
 * agent inside its own world model's dream (R9 S18); agents exploit a model's errors. Flash-safe: every
 * change is a fade over ≥ 0,4 s (≤ 3 per second, R9 S45).
 */
import * as THREE from 'three';
import type { StaticHandle } from '@/core/zones';
import { JUICE } from './tuning';
import type { Hangar } from './shared';

export interface Egg {
  /** a dream happened somewhere in the hangar: the door appears for one round */
  dreamed(): void;
  /** debug: open the door now */
  open(): void;
  /** debug: the whole find (playtest --secrets, the album) */
  solve(): void;
  update(dt: number): void;
  readonly status: Record<string, unknown>;
}

/** the room: x −23,6 … −16, z 0 … 8; its door on the east wall at z 4 */
const R = { x0: -23.6, x1: -16, z0: 0, z1: 8, h: 3.2, door: 4, doorW: 1.3 };

export function buildEgg(H: Hangar): Egg {
  const { ctx, sound } = H;
  const T = H.T;
  const M = ctx.materials;
  const det = ctx.groups.detail;
  const G = <G2 extends THREE.BufferGeometry>(g: G2): G2 => (ctx.onDispose(() => g.dispose()), g);
  const wallMat = M.standard({ color: 0xd6d3d1, roughness: 0.85 });

  // the partition (always there): three walls and the east wall with its doorway
  const walls: [number, number, number, number][] = [
    [(R.x0 + R.x1) / 2, R.z0, R.x1 - R.x0, 0.12],
    [(R.x0 + R.x1) / 2, R.z1, R.x1 - R.x0, 0.12],
    [R.x1, (R.z0 + R.door - R.doorW / 2) / 2, 0.12, R.door - R.doorW / 2 - R.z0],
    [R.x1, (R.door + R.doorW / 2 + R.z1) / 2, 0.12, R.z1 - R.door - R.doorW / 2],
  ];
  for (const [x, z, w, d] of walls) {
    const m = new THREE.Mesh(G(new THREE.BoxGeometry(w, R.h, d)), wallMat);
    m.position.set(x, R.h / 2, z);
    m.castShadow = m.receiveShadow = true;
    det.add(m);
    ctx.physics.addStaticBox({ size: [w, R.h, d], position: [x, R.h / 2, z] });
  }
  const lintel = new THREE.Mesh(G(new THREE.BoxGeometry(0.12, R.h - 2.2, R.doorW)), wallMat);
  lintel.position.set(R.x1, 2.2 + (R.h - 2.2) / 2, R.door);
  det.add(lintel);
  // the door: a panel that is a wall in reality; while the dream door is open, a teal frame instead
  const panel = new THREE.Mesh(G(new THREE.BoxGeometry(0.1, 2.2, R.doorW)), wallMat);
  panel.position.set(R.x1, 1.1, R.door);
  panel.userData.noMerge = true;
  det.add(panel);
  let panelCollider: StaticHandle | null = ctx.physics.addStaticBox({ size: [0.2, 2.2, R.doorW], position: [R.x1, 1.1, R.door] });
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0, depthWrite: false });
  ctx.onDispose(() => frameMat.dispose());
  const frame = new THREE.Group();
  frame.userData.noMerge = true;
  frame.name = 'traum:egg-door';
  for (const [y, h, z, d] of [
    [1.1, 2.2, R.door - R.doorW / 2, 0.06],
    [1.1, 2.2, R.door + R.doorW / 2, 0.06],
    [2.2, 0.06, R.door, R.doorW],
  ] as [number, number, number, number][]) {
    const b = new THREE.Mesh(G(new THREE.BoxGeometry(0.14, h, d)), frameMat);
    b.position.set(R.x1 + 0.02, y, z);
    frame.add(b);
  }
  frame.visible = false;
  det.add(frame);

  // the dream inside: a teal grid where the model saw data, darkness where it did not, crates that
  // vanish once you look away, and the shortcut on the far wall (in reality: the hangar's wall)
  const room = new THREE.Group();
  room.name = 'traum:egg-room';
  room.userData.noMerge = true;
  room.visible = false;
  det.add(room);
  const voidMat = M.standard({ color: 0x050707, roughness: 1 });
  const voidFloor = new THREE.Mesh(G(new THREE.BoxGeometry(R.x1 - R.x0 - 0.2, 0.02, R.z1 - R.z0 - 0.2)), voidMat);
  voidFloor.position.set((R.x0 + R.x1) / 2, 0.02, (R.z0 + R.z1) / 2);
  room.add(voidFloor);
  const gridMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, wireframe: true, transparent: true, opacity: 0.45, depthWrite: false });
  ctx.onDispose(() => gridMat.dispose());
  const grid = new THREE.Mesh(G(new THREE.PlaneGeometry(4.6, 6.6, 9, 13).rotateX(-Math.PI / 2)), gridMat);
  grid.position.set(R.x1 - 2.6, 0.04, R.door);
  room.add(grid);
  // the edge of the data: an invisible rail keeps you on the grid (the void is not walkable)
  const rails: StaticHandle[] = [];
  const crateMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.5, depthWrite: false });
  ctx.onDispose(() => crateMat.dispose());
  const crates = [
    [R.x1 - 1.8, 1.8],
    [R.x1 - 3.4, 2.4],
    [R.x1 - 2.2, 6.0],
    [R.x1 - 4.0, 5.4],
  ].map(([x, z]) => {
    const c = new THREE.Mesh(G(new THREE.BoxGeometry(0.5, 0.5, 0.5)), crateMat.clone());
    c.position.set(x, 0.3, z);
    room.add(c);
    ctx.onDispose(() => (c.material as THREE.Material).dispose());
    return { mesh: c, away: 0, gone: false };
  });
  // the shortcut: a teal opening in the far wall, through the hangar's outer wall (it exists only here)
  const shortcutMat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.6, depthWrite: false });
  ctx.onDispose(() => shortcutMat.dispose());
  const shortcut = new THREE.Mesh(G(new THREE.PlaneGeometry(1.1, 2.1)), shortcutMat);
  shortcut.rotation.y = Math.PI / 2;
  shortcut.position.set(R.x1 - 4.95, 1.05, R.door);
  room.add(shortcut);

  // ── state ────────────────────────────────────────────────────────────────────────────────────
  const st = { open: 0, openFor: 0, inside: false, found: ctx.game.secrets.has('traumraum'), fade: 0 };
  ctx.pass.registerAlbum({ id: 'traumraum', title: T('egg.album.title'), text: T('egg.album.text'), hint: T('egg.album.hint') });

  const setDoor = (open: boolean): void => {
    if (open) {
      panel.visible = false;
      panelCollider?.remove();
      panelCollider = null;
      frame.visible = true;
      room.visible = true;
      if (!rails.length) {
        // the data's edge, the void beyond
        const gx = R.x1 - 2.6;
        rails.push(ctx.physics.addStaticBox({ size: [0.1, 1.2, 6.6], position: [gx - 2.35, 0.6, R.door] }));
        rails.push(ctx.physics.addStaticBox({ size: [4.6, 1.2, 0.1], position: [gx, 0.6, R.door - 3.35] }));
        rails.push(ctx.physics.addStaticBox({ size: [4.6, 1.2, 0.1], position: [gx, 0.6, R.door + 3.35] }));
      }
    } else {
      panel.visible = true;
      if (!panelCollider) panelCollider = ctx.physics.addStaticBox({ size: [0.2, 2.2, R.doorW], position: [R.x1, 1.1, R.door] });
      frame.visible = false;
      room.visible = false;
      for (const r of rails) r.remove();
      rails.length = 0;
      crates.forEach((c) => {
        c.gone = false;
        c.away = 0;
        c.mesh.visible = true;
      });
    }
  };

  const find = (): void => {
    st.inside = false;
    // back in reality: in front of the door, which is a wall again
    ctx.player.teleport([R.x1 + 1.4, 0, R.door], { yawDeg: 90, fade: true });
    st.openFor = 0;
    setDoor(false);
    sound.snap();
    const isNew = ctx.game.secrets.find('traumraum', ctx.toWorld([R.x1, 1.2, R.door]));
    ctx.pass.unlockAlbum('traumraum');
    st.found = true;
    ctx.after(0.8, () => H.say(T('egg.radio'), true));
    ctx.events.emit('traumhangar:egg', { egg: 12, id: 'traumraum', isNew });
  };

  const _p = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _c = new THREE.Vector3();
  return {
    dreamed() {
      if (st.openFor <= 0) sound.wake([R.x1, 1.4, R.door]);
      st.openFor = JUICE.doorS;
      setDoor(true);
    },
    open() {
      st.openFor = JUICE.doorS;
      setDoor(true);
    },
    solve() {
      st.openFor = JUICE.doorS;
      setDoor(true);
      find();
    },
    get status() {
      return { open: st.openFor > 0, inside: st.inside, found: st.found, crates: crates.filter((c) => !c.gone).length };
    },
    update(dt) {
      // the door fades in and out (≥ 0,4 s: flash-safe)
      const want = st.openFor > 0 ? 0.9 : 0;
      st.fade += THREE.MathUtils.clamp(want - st.fade, -dt / 0.5, dt / 0.5);
      frameMat.opacity = st.fade;
      if (st.openFor > 0 && !st.inside) {
        st.openFor -= dt;
        if (st.openFor <= 0) setDoor(false);
      }
      if (!room.visible) return;
      const p = ctx.player.positionLocal(_p);
      const inRoom = p.x < R.x1 - 0.1 && p.x > R.x0 && p.z > R.z0 && p.z < R.z1;
      if (inRoom && !st.inside) {
        st.inside = true;
        sound.hum(true);
      } else if (!inRoom && st.inside) {
        st.inside = false;
        sound.hum(false);
      }
      if (!st.inside) return;
      // objects fade once you look away — and do not come back (object permanence)
      ctx.toLocal(ctx.player.eye, _c);
      ctx.player.direction.clone();
      const dir = ctx.player.direction;
      const fwd = _d.copy(dir).transformDirection(new THREE.Matrix4().copy(ctx.root.matrixWorld).invert());
      for (const c of crates) {
        if (c.gone) continue;
        const to = c.mesh.position.clone().sub(_c).normalize();
        const seen = to.dot(fwd) > Math.cos(THREE.MathUtils.degToRad(38));
        c.away = seen ? 0 : c.away + dt;
        const mat = c.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = THREE.MathUtils.clamp(0.5 - Math.max(0, c.away - 0.6) * 1.2, 0, 0.5);
        if (c.away > 1.1) {
          c.gone = true;
          c.mesh.visible = false;
        }
      }
      // the shortcut: step into it
      if (p.x < R.x1 - 4.5 && Math.abs(p.z - R.door) < 0.7) find();
    },
  };
}
