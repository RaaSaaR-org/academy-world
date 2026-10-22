/**
 * WP12: the bridge-head plaque (plan §2.8 touchpoint 1, D43): „Das Revier: Früher wurde hier im
 * Tagebau gegraben. Trockendock 3 liegt in der letzten Grube.“ (FIKTION: no dates, no real places).
 * It stands on the apron at the mouth of the bridge, facing the bridge, so it greets the player who
 * turns round at the spawn and everyone who comes back from the island. Ground frame: it rides on the
 * ground root (§2.1). Two draws: the plate (one vertex-coloured mesh) and one text.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ZoneContext } from '@/core/zones';
import { REVIER } from '../layout';
import { paint } from '../landscape/batch';
import { merge } from '../util';
import { cullTinyText } from '../detail';
import { START } from './strings';

/** on the apron, left of the bridge mouth (the bridge runs x 0, z 101 → 114) */
const AT: [number, number, number] = [-4.6, 0, REVIER.bridge.toZ + 2.0];

export function buildBridgePlaque(ctx: ZoneContext): THREE.Group {
  const M = ctx.materials;
  const g = new THREE.Group();
  g.name = 'start:bridge-plaque';
  g.position.set(...AT);
  // the face looks at the bridge mouth (0, 112)
  g.rotation.y = Math.atan2(REVIER.bridge.x - AT[0], REVIER.bridge.toZ - 2 - AT[2]);
  // the ground root once the engine has attached it (WP4), else the island root (the WPS stub keeps it detached)
  const gr = ctx.frames.ground;
  (gr?.parent ? gr : ctx.root).add(g);
  // a dark-glass plate in an alu frame on two posts, leaning back (one vertex-coloured mesh)
  const lean = -0.42;
  const plate = merge([
    paint(new RoundedBoxGeometry(1.5, 0.72, 0.05, 2, 0.02).rotateX(lean).translate(0, 1.12, 0), 0x1c1917),
    paint(new RoundedBoxGeometry(1.57, 0.79, 0.03, 2, 0.012).translate(0, 0, -0.025).rotateX(lean).translate(0, 1.12, 0), 0xc9c4bf),
    paint(new THREE.CylinderGeometry(0.04, 0.05, 0.86, 10).translate(-0.6, 0.43, 0.1), 0xc9c4bf),
    paint(new THREE.CylinderGeometry(0.04, 0.05, 0.86, 10).translate(0.6, 0.43, 0.1), 0xc9c4bf),
    paint(new THREE.BoxGeometry(1.5, 0.05, 0.3).translate(0, 0.025, 0.1), 0x1c1917),
  ]);
  const mesh = new THREE.Mesh(plate, M.standard({ vertexColors: true, roughness: 0.32, metalness: 0.6 }));
  mesh.name = 'start:bridge-plaque:plate';
  mesh.castShadow = true;
  g.add(mesh);
  const holder = new THREE.Group();
  holder.position.set(0, 1.12, 0.03);
  holder.rotation.x = lean;
  g.add(holder);
  const t = ctx.text3d.create(
    {
      text: (lang) => {
        const pick = (x: { de: string; en: string }): string => (lang === 'de' ? x.de : x.en);
        return `${pick(START.bridgePlaqueTitle)}\n${pick(START.bridgePlaque)}\n${pick(START.fiktion)}`;
      },
      font: 'mono-medium',
      size: 0.062,
      color: 0xe7e5e4,
      anchorX: 'center',
      anchorY: 'middle',
      textAlign: 'center',
      lineHeight: 1.45,
      maxWidth: 1.32,
      position: [0, 0, 0.012],
    },
    holder,
  );
  cullTinyText(ctx, t);
  // a ground-frame collider: on only while docked (WP4's frames)
  ctx.frames.adopt(ctx.physics.addStaticBox({ size: [1.6, 1.4, 0.4], position: [AT[0], 0.7, AT[2]], rotation: [0, g.rotation.y, 0], surface: 'metal' }));
  ctx.freezeStatic(g);
  return g;
}
