/**
 * Boot warm-up dummies for the programs that still linked during play (plan §5.5 „Programs“: 0 links on a
 * rendered frame, 0 frames over 33 ms caused by a link; WPF item 6 for WP4). Found with a link spy over the
 * hitches lap, the same six programs in Chromium and WebKit; Safari has no KHR_parallel_shader_compile, so
 * there each one was a frame of 37–68 ms:
 *  - the hover highlight's rim (src/systems/Highlight.ts), first shown in the onboarding on the foyer;
 *  - the shadow pass's depth variant of an instanced, double-sided caster with a map (the depth material
 *    takes the map, so it samples uv): the Prüffeld's exterior; any such caster of a later area shares it;
 *  - an instanced, instance-coloured, transparent MeshBasicMaterial first shown inside an area after its
 *    warm-up (the Greifwerkstatt at B).
 * The dummies stand in front of the camera for the hidden boot frame (registerBootWarmup), so the frame's
 * shadow pass compiles the depth variant too; then they stay in the scene hidden and keep their programs.
 * (The Greifwerkstatt's offscreen screen scene — no lights, a linear target — is its area's to compile.)
 */
import * as THREE from 'three';
import { registerBootWarmup } from '../../RenderSystem';
import { Highlighter } from '../../../systems/Highlight';

registerBootWarmup('play', () => {
  const g = new THREE.Group();
  g.name = 'warmup:play';
  const box = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const glass = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
  glass.name = 'warmup:basic-transparent';
  // the highlight's overlay rides on its target (a plain mesh: the focus of a non-skinned interactable)
  const target = new THREE.Mesh(box, glass);
  new Highlighter().focus(target);
  g.add(target);
  // an instanced, double-sided shadow caster with a map (1 × 1 white map: only the variant matters); the
  // boot frame's shadow pass compiles its depth variant
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const leaf = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide });
  leaf.name = 'warmup:instanced-caster';
  const one = new THREE.Matrix4();
  const cut = new THREE.InstancedMesh(box, leaf, 1);
  cut.setMatrixAt(0, one.makeTranslation(0.3, 0, 0));
  cut.castShadow = true;
  g.add(cut);
  // instanced, instance-coloured and transparent, unlit
  const dots = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }), 1);
  dots.setMatrixAt(0, one.makeTranslation(-0.3, 0, 0));
  dots.setColorAt(0, new THREE.Color(0xffffff));
  g.add(dots);
  return g;
});
