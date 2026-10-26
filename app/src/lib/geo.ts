import { SITE_IMAGE } from '@/data/manifest';

/**
 * Coordinate systems used in this app, and the only places they are converted:
 *
 *  image px  (u right, v down on masterplan.jpg)
 *     │ imagePxToLocal: scale by pxPerMetre, rotate by upBearingDeg
 *     ▼
 *  local ENU metres (east, north) about the anchor  — the Site 3D scene uses x = east, y = up, z = -north
 *     │ localToLonLat / lonLatToLocal: equirectangular about the anchor (fine for a < 5 km site)
 *     ▼
 *  WGS84 lon/lat  — the map
 *
 * Floor plans have their own local frame (metres from the wall-polygon centre) and are not georeferenced:
 * the collateral does not say where a unit sits in a tower footprint, so we never pretend it does.
 */

const R_EARTH = 6378137;
const deg2rad = (d: number) => (d * Math.PI) / 180;

export type LonLat = [number, number];
export type Local = { east: number; north: number };

export function imagePxToLocal(u: number, v: number, img = SITE_IMAGE): Local {
  const ex = (u - img.anchorPx[0]) / img.pxPerMetre;
  const ny = -(v - img.anchorPx[1]) / img.pxPerMetre;
  const t = deg2rad(img.upBearingDeg);
  // rotate the image frame clockwise by the up-bearing so that image "up" points to that bearing
  return { east: ex * Math.cos(t) + ny * Math.sin(t), north: -ex * Math.sin(t) + ny * Math.cos(t) };
}

/** Inverse of imagePxToLocal: local ENU metres → raster pixel (u right, v down). */
export function localToImagePx(p: Local, img = SITE_IMAGE): [number, number] {
  const t = deg2rad(img.upBearingDeg);
  const ex = p.east * Math.cos(t) - p.north * Math.sin(t);
  const ny = p.east * Math.sin(t) + p.north * Math.cos(t);
  return [img.anchorPx[0] + ex * img.pxPerMetre, img.anchorPx[1] - ny * img.pxPerMetre];
}

export function localToLonLat(p: Local, anchor: LonLat = SITE_IMAGE.anchorLonLat): LonLat {
  const lat0 = deg2rad(anchor[1]);
  const dLat = p.north / R_EARTH;
  const dLon = p.east / (R_EARTH * Math.cos(lat0));
  return [anchor[0] + (dLon * 180) / Math.PI, anchor[1] + (dLat * 180) / Math.PI];
}

export function lonLatToLocal(ll: LonLat, anchor: LonLat = SITE_IMAGE.anchorLonLat): Local {
  const lat0 = deg2rad(anchor[1]);
  return {
    east: deg2rad(ll[0] - anchor[0]) * R_EARTH * Math.cos(lat0),
    north: deg2rad(ll[1] - anchor[1]) * R_EARTH,
  };
}

export function imagePxToLonLat(u: number, v: number): LonLat {
  return localToLonLat(imagePxToLocal(u, v));
}

/** Three.js position for a local ENU point (y up, z toward south). */
export function localToWorld(p: Local, y = 0): [number, number, number] {
  return [p.east, y, -p.north];
}

export function haversineM(a: LonLat, b: LonLat): number {
  const dLat = deg2rad(b[1] - a[1]);
  const dLon = deg2rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(a[1])) * Math.cos(deg2rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(s));
}

/** Four corners of the master-plan raster in lon/lat, in MapLibre image-source order (TL, TR, BR, BL). */
export function siteImageCorners(img = SITE_IMAGE): [LonLat, LonLat, LonLat, LonLat] {
  const c = (u: number, v: number) => localToLonLat(imagePxToLocal(u, v, img), img.anchorLonLat);
  return [c(0, 0), c(img.widthPx, 0), c(img.widthPx, img.heightPx), c(0, img.heightPx)];
}

/** Raster-pixel ring → local ENU ring (metres). */
export function imageRingToLocal(ring: [number, number][]): Local[] {
  return ring.map(([u, v]) => imagePxToLocal(u, v));
}

/** Raster-pixel ring → closed lon/lat ring for the map. */
export function imageRingToLonLat(ring: [number, number][]): LonLat[] {
  const r = ring.map(([u, v]) => imagePxToLonLat(u, v));
  return [...r, r[0]];
}

/** Shoelace area of a local ring, m². */
export function ringAreaM2(ring: Local[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p.east * q.north - q.east * p.north;
  }
  return Math.abs(a) / 2;
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`;
}
