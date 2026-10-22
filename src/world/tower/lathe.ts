import * as THREE from 'three';

/**
 * Lathe around the z axis through (cx, cy): profile points (r, z) from front to back. Each profile
 * band has its own vertices with analytic normals: smooth around, sharp at the profile corners.
 */
export function lathe(prof: [number, number][], seg: number, cx: number, cy: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j < prof.length - 1; j++) {
    const [r0, z0] = prof[j];
    const [r1, z1] = prof[j + 1];
    const dr = r1 - r0,
      dz = z1 - z0;
    const l = Math.hypot(dr, dz) || 1;
    const nr = -dz / l,
      nz = dr / l;
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const sx = Math.sin(a),
        sy = -Math.cos(a);
      pos.push(cx + sx * r0, cy + sy * r0, z0, cx + sx * r1, cy + sy * r1, z1);
      nrm.push(sx * nr, sy * nr, nz, sx * nr, sy * nr, nz);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
