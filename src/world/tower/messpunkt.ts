import * as THREE from 'three';
import type { Text, ZoneContext } from '@/core/zones';
import { SCULPTURE } from './constants';
import type { TowerKit } from './kit';
import { markStatic } from '../statics';

/**
 * Messpunkt (ART-V2 §3.5, Phase 5): the plate at the arrival point (0, 0, 94.5) with a teal ring.
 * [E] opens a short card that measures the tower from here: the logo disc (21 m) fills a known
 * angle, and only the known width turns that angle into a distance; a disc a tenth the size at a
 * tenth the distance looks the same (one camera image has no scale). The numbers are computed from
 * the built geometry (eye height 1.65 m to the dial's centre).
 * Source: Hartley & Zisserman (2004), Multiple View Geometry in Computer Vision, 2nd ed., §6.1
 * (the pinhole camera model: an image point fixes only the ray, x = f·X / Z).
 */
const fmt = (v: number, digits: number): { de: string; en: string } => ({ de: v.toFixed(digits).replace('.', ','), en: v.toFixed(digits) });
const GEO = (() => {
  const [ex, ey, ez] = SCULPTURE.eye;
  const [cx, cy] = SCULPTURE.center;
  const d = Math.hypot(cx - ex, cy - ey, SCULPTURE.faceZ - ez);
  const W = 2 * SCULPTURE.radius;
  const half = Math.atan(SCULPTURE.radius / d);
  return { d, W, angle: (2 * half * 180) / Math.PI, half: (half * 180) / Math.PI };
})();
const W = Math.round(GEO.W);
const ANGLE = fmt(GEO.angle, 1);
const HALF = fmt(GEO.half, 2);
const DIST = Math.round(GEO.d);
const W10 = fmt(GEO.W / 10, 1);
const D10 = fmt(GEO.d / 10, 1);
const T = {
  label: { de: 'Messpunkt', en: 'Measuring point' } as Text,
  hint: { de: 'Wie weit ist der Turm weg?', en: 'How far away is the tower?' } as Text,
  eyebrow: { de: '// MESSPUNKT · PROJEKTION', en: '// MEASURING POINT · PROJECTION' } as Text,
  title: { de: 'Ein Bild, keine Tiefe', en: 'One image, no depth' } as Text,
  body: [
    {
      de: `Messpunkt. Die Logo-Scheibe am Turm ist ${W}\u00A0m breit. Von hier aus füllt sie einen Winkel von ${ANGLE.de}°.`,
      en: `Measuring point. The logo disc on the tower is ${W}\u00A0m wide. From here it fills an angle of ${ANGLE.en}°.`,
    },
    {
      de: `Mehr zeigt ein Kamerabild nicht: Richtungen und Winkel. Eine ${W10.de}\u00A0m breite Scheibe in ${D10.de}\u00A0m Abstand sähe genauso aus. Erst die bekannte Breite macht aus dem Winkel einen Abstand: ${W}\u00A0m\u00A0÷\u00A0(2\u00A0·\u00A0tan\u00A0${HALF.de}°)\u00A0≈\u00A0${DIST}\u00A0m.`,
      en: `That is all one camera image shows: directions and angles. A ${W10.en}\u00A0m disc ${D10.en}\u00A0m away would look exactly the same. Only the known width turns the angle into a distance: ${W}\u00A0m\u00A0÷\u00A0(2\u00A0·\u00A0tan\u00A0${HALF.en}°)\u00A0≈\u00A0${DIST}\u00A0m.`,
    },
    {
      de: 'Quelle: Hartley & Zisserman (2004), Multiple View Geometry in Computer Vision, 2. Aufl., Cambridge University Press, §6.1.',
      en: 'Source: Hartley & Zisserman (2004), Multiple View Geometry in Computer Vision, 2nd ed., Cambridge University Press, §6.1.',
    },
  ] as Text[],
  decider: {
    de: 'Ein Kamerabild allein misst keine Abstände, es kann sie höchstens schätzen. Frag bei jedem Robotik-Angebot: Womit misst das System Tiefe?',
    en: 'A camera image alone measures no distances; at best it estimates them. Ask of every robotics offer: what does the system measure depth with?',
  } as Text,
  caption: { de: 'Gleicher Winkel, anderer Abstand: gleiches Bild.', en: 'Same angle, different distance: the same image.' } as Text,
};

export function buildMesspunkt(ctx: ZoneContext, kit: TowerKit): void {
  const [ex, , ez] = SCULPTURE.eye;
  const g = new THREE.Group();
  g.name = 'tower:messpunkt';
  g.position.set(ex, 0, ez);
  ctx.root.add(g);
  // a dark plate with an alu rim and a teal eye: reads as "stand here" on the light deck
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.03, 48), kit.carbon);
  plate.position.y = 0.012;
  g.add(plate);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.022, 6, 64).rotateX(Math.PI / 2), kit.alu);
  rim.position.y = 0.022;
  g.add(markStatic(rim));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 4, 64).rotateX(Math.PI / 2), kit.light('teal'));
  ring.position.y = 0.03;
  g.add(markStatic(ring));
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32).rotateX(-Math.PI / 2), kit.light('teal'));
  pupil.position.y = 0.031;
  g.add(markStatic(pupil));
  ctx.freezeStatic(g);

  ctx.addInteractable({
    object: plate,
    label: T.label,
    hint: T.hint,
    range: 1.6,
    onInteract: () =>
      void ctx.hud.openInfoCard({
        eyebrow: T.eyebrow,
        title: T.title,
        body: T.body,
        forDecisionMakers: { body: T.decider },
        diagram: { draw: drawRays, animate: true, aspect: 2, caption: T.caption },
      }),
  });
}

/**
 * Eye at the left, one viewing cone, the image on the image plane; a disc slides along the cone and
 * grows with its distance (always filling the same angle) next to the far, big disc: one image.
 */
function drawRays(g: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  g.fillStyle = '#141414';
  g.fillRect(0, 0, w, h);
  const eye = { x: w * 0.07, y: h * 0.56 };
  const img = w * 0.2;
  const far = w * 0.9;
  const tanA = (h * 0.36) / (far - eye.x);
  const at = (x: number): number => (x - eye.x) * tanA;
  // the viewing cone
  g.strokeStyle = 'rgba(45,212,191,0.5)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(eye.x, eye.y);
  g.lineTo(far + w * 0.04, eye.y - at(far + w * 0.04));
  g.moveTo(eye.x, eye.y);
  g.lineTo(far + w * 0.04, eye.y + at(far + w * 0.04));
  g.stroke();
  // image plane and the image (the same for both discs)
  g.strokeStyle = '#57534E';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(img, h * 0.08);
  g.lineTo(img, h * 0.96);
  g.stroke();
  g.fillStyle = '#2DD4BF';
  g.fillRect(img - 4, eye.y - at(img), 8, 2 * at(img));
  // discs, edge-on: the far one, and a near one sliding along the cone
  const disc = (x: number, wPx: number): void => {
    const r = at(x);
    g.fillStyle = '#FF6700';
    g.fillRect(x - wPx / 2, eye.y - r, wPx, 2 * r);
  };
  disc(far, 7);
  const k = 0.5 + 0.5 * Math.sin(t * 0.9);
  disc(THREE.MathUtils.lerp(w * 0.3, w * 0.62, k), 4);
  // eye
  g.strokeStyle = '#E7E5E4';
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(eye.x, eye.y, 16, 9, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#E7E5E4';
  g.beginPath();
  g.arc(eye.x, eye.y, 3.5, 0, Math.PI * 2);
  g.fill();
}
