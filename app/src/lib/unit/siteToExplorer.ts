import { TOWERS } from '@/data/project';
import { imagePxToLocal, localToWorld } from '@/lib/geo';
import { TOWERS as TRACE_TOWERS } from '@/lib/unit/siteLayout';

/**
 * Two frames describe the site: the explorer's raster georeference (SITE_IMAGE: px/m, up-bearing,
 * anchor — approximate) and the master-plan trace's site frame (registered to the OSM wing outlines).
 * They disagree by 60–90 m and a small rotation. The explorer draws its raster, towers, labels and
 * tour in ITS frame, so trace-derived content (roads, club, trees, amenity props) must be mapped into
 * it or it lands beside the drawn features. This is a least-squares similarity (scale, rotation,
 * translation) fitted on the 14 tower centroids: site 3-D (X east, Z = −north) → explorer world xz.
 */
function fit() {
  const pairs: [number, number, number, number][] = [];
  for (const t of TOWERS) {
    const tr = TRACE_TOWERS.find((w) => w.n === t.wing);
    if (!tr) continue;
    const [ex, , ez] = localToWorld(imagePxToLocal(t.imagePx[0], t.imagePx[1]));
    pairs.push([tr.x, tr.z, ex, ez]);
  }
  const n = pairs.length || 1;
  const ms = pairs.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0]);
  const me = pairs.reduce((a, p) => [a[0] + p[2] / n, a[1] + p[3] / n], [0, 0]);
  // complex least squares: a = Σ conj(ps − μs)(pe − μe) / Σ |ps − μs|²
  let nre = 0, nim = 0, den = 0;
  for (const [sx, sz, ex, ez] of pairs) {
    const px = sx - ms[0], pz = sz - ms[1], qx = ex - me[0], qz = ez - me[1];
    nre += px * qx + pz * qz;
    nim += px * qz - pz * qx;
    den += px * px + pz * pz;
  }
  const are = den ? nre / den : 1, aim = den ? nim / den : 0;
  const bx = me[0] - (are * ms[0] - aim * ms[1]);
  const bz = me[1] - (aim * ms[0] + are * ms[1]);
  const map = (x: number, z: number): [number, number] => [are * x - aim * z + bx, aim * x + are * z + bz];
  let rms = 0;
  for (const [sx, sz, ex, ez] of pairs) { const [mx, mz] = map(sx, sz); rms += (mx - ex) ** 2 + (mz - ez) ** 2; }
  return { are, aim, bx, bz, scale: Math.hypot(are, aim), thetaRad: Math.atan2(aim, are), rmsM: Math.sqrt(rms / n), pairs: pairs.length, map };
}

export const SITE_TO_EXPLORER = fit();

/** Site 3-D xz → explorer world xz. */
export const siteToExplorer = SITE_TO_EXPLORER.map;

/** Explorer world xz → site 3-D xz (inverse similarity). */
export function explorerToSite(x: number, z: number): [number, number] {
  const { are, aim, bx, bz } = SITE_TO_EXPLORER;
  const dx = x - bx, dz = z - bz;
  const d = are * are + aim * aim || 1;
  return [(are * dx + aim * dz) / d, (are * dz - aim * dx) / d];
}

/**
 * three.js group transform that places site-frame children in the explorer: matrix = T · R_y · S.
 * (x + i z)·a rotates XZ by θ; rotation.y = φ maps x' = x cos φ + z sin φ, so φ = −θ.
 */
export const SITE_GROUP_TRANSFORM = {
  position: [SITE_TO_EXPLORER.bx, 0, SITE_TO_EXPLORER.bz] as [number, number, number],
  rotationY: -SITE_TO_EXPLORER.thetaRad,
  scale: [SITE_TO_EXPLORER.scale, 1, SITE_TO_EXPLORER.scale] as [number, number, number],
};
