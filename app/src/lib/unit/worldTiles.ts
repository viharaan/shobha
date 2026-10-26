import * as THREE from 'three';
import { VectorTile, type VectorTileFeature } from '@mapbox/vector-tile';
import { PbfReader as Pbf } from 'pbf';
import { lngLatToSite, siteBoundary } from '@/data/sobha/siteFrame';
import type { UnitPlacement } from '@/data/sobha/traced/placement';
import { tileUrl } from './osmTiles';

/**
 * REAL-WORLD SURROUNDINGS for the 1:1 unit viewer — data + geometry (no React).
 *
 * Data: OpenFreeMap vector tiles (OpenMapTiles schema, © OpenMapTiles, © OpenStreetMap
 * contributors, ODbL) decoded in the browser with @mapbox/vector-tile + pbf, or — for the
 * "OSM map" ground — OSM Standard raster tiles draped flat.
 *
 * Frames (see siteFrame.ts / traced/placement.ts):
 *   site 3-D  X = east, Y = up, Z = −north, metres, origin SITE_ORIGIN. All geometry built here is
 *             in site 3-D. The unit viewer keeps the UNIT at its own origin and puts this world in
 *             a group with the INVERSE placement transform (worldGroupTransform).
 */

export type XZ = [number, number]; // site 3-D (X, Z)

/* ------------------------------ frames ------------------------------- */

/**
 * Group transform that maps site 3-D into the unit frame, i.e. the inverse of
 *   P_site = R_y(yaw)·P_unit + [offsetX, floorY, offsetZ]
 * →  P_unit = R_y(−yaw)·(P_site − offset).
 * In three.js: OUTER group rotation.y = −yaw, INNER group position = −offset (a child's position is
 * applied before its parent's rotation).
 */
export function worldGroupTransform(p: Pick<UnitPlacement, 'yawRad' | 'offsetX' | 'offsetZ'>, floorY: number) {
  return { rotY: -p.yawRad, pos: [-p.offsetX, -floorY, -p.offsetZ] as [number, number, number] };
}

/** Unit-frame point (X, Y, Z metres) → site 3-D (forward transform, for tests / centring). */
export function unitToSite3D(p: Pick<UnitPlacement, 'yawRad' | 'offsetX' | 'offsetZ'>, floorY: number, [x, y, z]: [number, number, number]): [number, number, number] {
  const c = Math.cos(p.yawRad);
  const s = Math.sin(p.yawRad);
  return [c * x + s * z + p.offsetX, y + floorY, -s * x + c * z + p.offsetZ];
}

/** Compass bearing (deg clockwise from true north) of a horizontal unit-frame direction (dx, dz). */
export function bearingDeg(p: Pick<UnitPlacement, 'yawRad'>, dx: number, dz: number): number {
  const c = Math.cos(p.yawRad);
  const s = Math.sin(p.yawRad);
  const X = c * dx + s * dz; // east
  const Z = -s * dx + c * dz; // −north
  return ((Math.atan2(X, -Z) * 180) / Math.PI + 360) % 360;
}

export const compassPoint = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];

/* ------------------------------ tile math ---------------------------- */

export interface TileId {
  z: number;
  x: number;
  y: number;
}

/** Fractional slippy-map tile coordinates of a lng/lat. */
export function lngLatToTile(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
}

/** Fractional tile coordinates → [lng, lat]. */
export function tileToLngLat(x: number, y: number, z: number): [number, number] {
  const n = 2 ** z;
  return [(x / n) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI];
}

/** Fractional tile coordinates → site 3-D (X, Z). */
function tileToXZ(x: number, y: number, z: number): XZ {
  const [lng, lat] = tileToLngLat(x, y, z);
  const s = lngLatToSite(lng, lat);
  return [s.x, -s.y];
}

/** site 3-D (X, Z) → [lng, lat] (inverse of lngLatToSite, via a 1 m finite difference — the frame is affine). */
function xzToLngLat([X, Z]: XZ): [number, number] {
  const o = lngLatToSite(0, 0);
  const ex = lngLatToSite(1, 0).x - o.x; // m per degree lng
  const ny = lngLatToSite(0, 1).y - o.y; // m per degree lat
  return [(X - o.x) / ex, (-Z - o.y) / ny];
}

/** Tiles at zoom z that intersect the square of half-side `radius` m around site 3-D point `c`. */
export function tilesAround(c: XZ, radius: number, z: number): TileId[] {
  const [lng0, lat0] = xzToLngLat([c[0] - radius, c[1] + radius]); // SW corner (Z = −north)
  const [lng1, lat1] = xzToLngLat([c[0] + radius, c[1] - radius]); // NE corner
  const [x0, y1] = lngLatToTile(lng0, lat0, z);
  const [x1, y0] = lngLatToTile(lng1, lat1, z);
  const out: TileId[] = [];
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) out.push({ z, x, y });
  return out;
}

/* ---------------------------- vector tiles --------------------------- */

const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
export const VECTOR_Z = 14; // z14 tile ≈ 2.38 km wide at 13° N
export const WORLD_RADIUS_M = 2000;

export interface Poly {
  outer: XZ[];
  holes: XZ[][];
}
export interface Building extends Poly {
  h: number;
  minH: number;
  /** render_height was present in the tile (OpenMapTiles fills it from height / building:levels, else a default). */
  tagged: boolean;
}
export interface Road {
  pts: XZ[];
  width: number;
}
export interface WorldFeatures {
  buildings: Building[];
  water: Poly[];
  green: (Poly & { tone: number })[];
  roads: Road[];
}

const ROAD_W: Record<string, number> = {
  motorway: 14,
  trunk: 14,
  primary: 10,
  secondary: 8,
  tertiary: 6.5,
  minor: 5,
  service: 3.5,
  raceway: 6,
  busway: 6,
};
// landcover / park classes → green tone index (0 grass, 1 wood, 2 farmland)
const GREEN: Record<string, number> = { grass: 0, park: 0, wetland: 0, wood: 1, forest: 1, farmland: 2 };
export const DEFAULT_BUILDING_H = 9; // m when a tile has no render_height (assumed)

let tileTemplate: Promise<string> | null = null;
function tileUrlTemplate(): Promise<string> {
  if (!tileTemplate) {
    tileTemplate = fetch(TILEJSON_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`TileJSON HTTP ${r.status}`);
        return r.json() as Promise<{ tiles: string[] }>;
      })
      .then((j) => j.tiles[0])
      .catch((e) => {
        tileTemplate = null; // allow a retry later
        throw e;
      });
  }
  return tileTemplate;
}

const ringArea = (r: XZ[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
};

/** Vector-tile polygon rings → polygons (outer + holes), following the MVT winding rule. */
function polygonsOf(f: VectorTileFeature, t: TileId): Poly[] {
  const ext = f.extent;
  const rings = f.loadGeometry().map((ring) => ring.map((p) => tileToXZ(t.x + p.x / ext, t.y + p.y / ext, t.z)));
  const out: Poly[] = [];
  let outerSign = 0;
  for (const r of rings) {
    if (r.length < 4) continue;
    const a = ringArea(r);
    if (a === 0) continue;
    if (!outerSign) outerSign = Math.sign(a);
    if (Math.sign(a) === outerSign || !out.length) out.push({ outer: r, holes: [] });
    else out[out.length - 1].holes.push(r);
  }
  return out;
}

function inRing(x: number, y: number, ring: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const centroid = (r: XZ[]): XZ => {
  let x = 0;
  let z = 0;
  for (const p of r) {
    x += p[0];
    z += p[1];
  }
  return [x / r.length, z / r.length];
};

/** Decode one z14 tile into site-frame features, dropping anything farther than `radius` from `c`. */
function decodeTile(buf: ArrayBuffer, t: TileId, c: XZ, radius: number, out: WorldFeatures) {
  const vt = new VectorTile(new Pbf(new Uint8Array(buf)));
  const near = (p: XZ) => Math.hypot(p[0] - c[0], p[1] - c[1]) < radius;
  const each = (layer: string, fn: (f: VectorTileFeature) => void) => {
    const L = vt.layers[layer];
    if (L) for (let i = 0; i < L.length; i++) fn(L.feature(i));
  };

  each('building', (f) => {
    if (f.type !== 3 || f.properties.hide_3d) return;
    const rh = f.properties.render_height;
    const h = typeof rh === 'number' ? rh : DEFAULT_BUILDING_H;
    const minH = typeof f.properties.render_min_height === 'number' ? (f.properties.render_min_height as number) : 0;
    if (h <= minH) return;
    for (const p of polygonsOf(f, t)) {
      const cc = centroid(p.outer);
      if (!near(cc)) continue;
      if (inRing(cc[0], -cc[1], siteBoundary.ring)) continue; // project site: replaced by the SOBHA wing massing
      out.buildings.push({ ...p, h, minH, tagged: typeof rh === 'number' });
    }
  });
  each('water', (f) => {
    if (f.type !== 3 || f.properties.brunnel === 'tunnel') return;
    for (const p of polygonsOf(f, t)) out.water.push(p);
  });
  const green = (f: VectorTileFeature) => {
    if (f.type !== 3) return;
    const tone = GREEN[String(f.properties.class ?? (f.properties.subclass || 'park'))];
    if (tone === undefined) return;
    for (const p of polygonsOf(f, t)) out.green.push({ ...p, tone });
  };
  each('landcover', green);
  each('park', green);
  each('transportation', (f) => {
    if (f.type !== 2 || f.properties.brunnel === 'tunnel') return;
    const cls = String(f.properties.class ?? '').replace(/_construction$/, '');
    const width = ROAD_W[cls];
    if (!width) return; // rail, path, track, ferry, …
    const ext = f.extent;
    for (const line of f.loadGeometry()) {
      const pts = line.map((p) => tileToXZ(t.x + p.x / ext, t.y + p.y / ext, t.z));
      if (pts.length > 1 && (near(pts[0]) || near(pts[pts.length - 1]))) out.roads.push({ pts, width });
    }
  });
}

export interface WorldLoad {
  features: WorldFeatures;
  tiles: number;
  failed: number;
  bytes: number;
}

const worldCache = new Map<string, Promise<WorldLoad>>();

/** Fetch + decode the z14 vector tiles covering `radius` m around site 3-D point `c` (cached per tile set). */
export function loadWorld(c: XZ, radius = WORLD_RADIUS_M): Promise<WorldLoad> {
  const tiles = tilesAround(c, radius, VECTOR_Z);
  // cache on the tile set + a 50 m-rounded centre (the radius cull depends on it)
  const key = `${tiles.map((t) => `${t.x}/${t.y}`).join(',')}@${Math.round(c[0] / 50)},${Math.round(c[1] / 50)}`;
  const hit = worldCache.get(key);
  if (hit) return hit;
  const job = (async () => {
    const tpl = await tileUrlTemplate();
    const features: WorldFeatures = { buildings: [], water: [], green: [], roads: [] };
    let failed = 0;
    let bytes = 0;
    const bufs = await Promise.all(
      tiles.map((t) =>
        fetch(tpl.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y)))
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .catch(() => null)
      )
    );
    bufs.forEach((b, i) => {
      if (!b) {
        failed++;
        return;
      }
      bytes += b.byteLength;
      try {
        decodeTile(b, tiles[i], c, radius, features);
      } catch {
        failed++;
      }
    });
    if (failed === tiles.length) throw new Error('no surroundings tiles could be loaded');
    return { features, tiles: tiles.length, failed, bytes };
  })();
  worldCache.set(key, job);
  job.catch(() => worldCache.delete(key));
  return job;
}

/* ------------------------------ geometry ----------------------------- */

/** Growable non-indexed triangle soup (position, normal, optional colour / uv) → one BufferGeometry. */
export class TriSoup {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] | null;
  uv: number[] | null;
  constructor({ color = false, uv = false } = {}) {
    this.col = color ? [] : null;
    this.uv = uv ? [] : null;
  }
  get triangles() {
    return this.pos.length / 9;
  }
  /** Triangle with face normal n; the winding is flipped if needed so the front face looks along n. */
  tri(a: number[], b: number[], c: number[], n: number[], rgb?: number[], uvs?: number[][]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]; // prettier-ignore
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; // prettier-ignore
    const flip = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0;
    const vs = flip ? [a, c, b] : [a, b, c];
    for (const v of vs) {
      this.pos.push(v[0], v[1], v[2]);
      this.nor.push(n[0], n[1], n[2]);
      if (this.col && rgb) this.col.push(rgb[0], rgb[1], rgb[2]);
    }
    if (this.uv && uvs) {
      const us = flip ? [uvs[0], uvs[2], uvs[1]] : uvs;
      for (const u of us) this.uv.push(u[0], u[1]);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

const UP = [0, 1, 0];
const DOWN = [0, -1, 0];

function dedupe(r: XZ[]): XZ[] {
  const out: XZ[] = [];
  for (const p of r) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > 1e-3 || Math.abs(q[1] - p[1]) > 1e-3) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3) out.pop();
  }
  return out;
}

/** Ground height (m, site 3-D Y) at (X, Z) — terrain draping; flat ground when omitted. */
export type HeightFn = (x: number, z: number) => number;

/** Flat polygon (with holes) at height y (+ terrain hAt per vertex), facing `n` (up by default). */
export function flatPoly(s: TriSoup, p: Poly, y: number, rgb?: number[], n = UP, hAt?: HeightFn) {
  const outer = dedupe(p.outer);
  if (outer.length < 3) return;
  const holes = p.holes.map(dedupe).filter((h) => h.length >= 3);
  const v2 = (r: XZ[]) => r.map(([x, z]) => new THREE.Vector2(x, z));
  const all = [outer, ...holes].flat();
  let faces: number[][];
  try {
    faces = THREE.ShapeUtils.triangulateShape(v2(outer), holes.map(v2));
  } catch {
    return;
  }
  for (const [i, j, k] of faces) {
    const a = all[i], b = all[j], c = all[k]; // prettier-ignore
    const Y = (q: XZ) => (hAt ? y + hAt(q[0], q[1]) : y);
    s.tri([a[0], Y(a), a[1]], [b[0], Y(b), b[1]], [c[0], Y(c), c[1]], n, rgb);
  }
}

/** Vertical walls of a prism between y0 and y1 for every ring of p (normals point out of the solid). */
export function prismWalls(s: TriSoup, p: Poly, y0: number, y1: number, rgb?: number[], vScale = 0) {
  const rings = [{ r: dedupe(p.outer), hole: false }, ...p.holes.map((h) => ({ r: dedupe(h), hole: true }))];
  for (const { r, hole } of rings) {
    if (r.length < 3) continue;
    const sgn = (ringArea(r) > 0 ? 1 : -1) * (hole ? -1 : 1);
    let u = 0;
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz);
      if (l < 1e-4) continue;
      const n = [(sgn * dz) / l, 0, (-sgn * dx) / l];
      const A0 = [a[0], y0, a[1]], B0 = [b[0], y0, b[1]], A1 = [a[0], y1, a[1]], B1 = [b[0], y1, b[1]]; // prettier-ignore
      const uv = vScale
        ? [[u, y0 / vScale], [u + l, y0 / vScale], [u + l, y1 / vScale], [u, y1 / vScale]]
        : undefined;
      s.tri(A0, B0, B1, n, rgb, uv && [uv[0], uv[1], uv[2]]);
      s.tri(A0, B1, A1, n, rgb, uv && [uv[0], uv[2], uv[3]]);
      u += l;
    }
  }
}

/** Closed prism (walls + roof, optional floor). */
export function prism(s: TriSoup, p: Poly, y0: number, y1: number, rgb?: number[], { bottom = false } = {}) {
  prismWalls(s, p, y0, y1, rgb);
  flatPoly(s, p, y1, rgb, UP);
  if (bottom) flatPoly(s, p, y0, rgb, DOWN);
}

/** Road centre-lines → flat ribbons (per-segment quads; joints overlap, no caps). */
function ribbons(s: TriSoup, roads: Road[], y: number, hAt?: HeightFn) {
  for (const { pts, width } of roads) {
    const h = width / 2;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz);
      if (l < 1e-3) continue;
      // extend each segment by half a width so joints don't show notches
      const ex = (dx / l) * h * 0.5, ez = (dz / l) * h * 0.5; // prettier-ignore
      const nx = (-dz / l) * h, nz = (dx / l) * h; // prettier-ignore
      const ya = hAt ? y + hAt(a[0], a[1]) : y;
      const yb = hAt ? y + hAt(b[0], b[1]) : y;
      const p0 = [a[0] - ex + nx, ya, a[1] - ez + nz];
      const p1 = [a[0] - ex - nx, ya, a[1] - ez - nz];
      const p2 = [b[0] + ex - nx, yb, b[1] + ez - nz];
      const p3 = [b[0] + ex + nx, yb, b[1] + ez + nz];
      s.tri(p0, p1, p2, UP);
      s.tri(p0, p2, p3, UP);
    }
  }
}

const hexRgb = (hex: string) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const BUILDING_RGB = hexRgb('#c9c2b6');
const GREEN_RGB = [hexRgb('#9fbf7a'), hexRgb('#6f9a5a'), hexRgb('#c4c98f')];

export interface WorldMeshes {
  buildings: THREE.BufferGeometry;
  water: THREE.BufferGeometry;
  green: THREE.BufferGeometry;
  roads: THREE.BufferGeometry;
  stats: { buildings: number; taggedHeights: number; triangles: number };
}

/**
 * Merged geometry per class (one draw call each). Flat layers sit on the ground (y = 0, or the terrain
 * via hAt — drawn painter-style, so big triangles cutting through gentle relief don't matter); each
 * building stands on the terrain height sampled at its centroid.
 */
export function buildWorldMeshes(f: WorldFeatures, hAt?: HeightFn): WorldMeshes {
  const b = new TriSoup({ color: true });
  let tagged = 0;
  let k = 0;
  for (const bl of f.buildings) {
    // ±7 % brightness jitter per building so neighbours read as separate masses
    const j = 0.93 + (((k++ * 2654435761) >>> 0) % 1000) / 1000 * 0.14;
    const rgb = BUILDING_RGB.map((v) => Math.min(1, v * j));
    const c = hAt ? centroid(bl.outer) : null;
    const base = c && hAt ? hAt(c[0], c[1]) : 0;
    prism(b, bl, bl.minH + base, bl.h + base, rgb, { bottom: bl.minH > 0 });
    if (bl.tagged) tagged++;
  }
  const w = new TriSoup();
  for (const p of f.water) flatPoly(w, p, 0, undefined, UP, hAt);
  const g = new TriSoup({ color: true });
  for (const p of f.green) flatPoly(g, p, 0, GREEN_RGB[p.tone], UP, hAt);
  const r = new TriSoup();
  ribbons(r, f.roads, 0, hAt);
  return {
    buildings: b.geometry(),
    water: w.geometry(),
    green: g.geometry(),
    roads: r.geometry(),
    stats: { buildings: f.buildings.length, taggedHeights: tagged, triangles: b.triangles + w.triangles + g.triangles + r.triangles },
  };
}

/* ----------------------------- raster ground ---------------------------- */

/*
 * Raster ground sources (each tile = one textured grid draped on the terrain):
 *  - 'osm'  OSM Standard tiles (© OpenStreetMap contributors) via src/lib/osmTiles.ts (tileUrl honours
 *           NEXT_PUBLIC_TILE_SERVER). Tile usage policy (https://operations.osmfoundation.org/policies/tiles/):
 *           tile.openstreetmap.org is fine for a low-volume demo / development, but production use needs
 *           its own tile server or a commercial provider — set NEXT_PUBLIC_TILE_SERVER for that.
 *  - 'sat'  EOX Sentinel-2 cloudless **2016** (CC BY 4.0 — open; the later s2cloudless years are
 *           CC BY-NC-SA, so not used). ~10 m/px source: blurry up close; z16+ on the server is upsampled,
 *           so we stop at z15.
 *  - 'esri' Esri World Imagery — PROPRIETARY; free for development / non-commercial use under Esri's
 *           terms only — check them before production. Sharp (z ≤ 18 here).
 * Not used: Google Photorealistic 3D Tiles and Cesium World Terrain need API keys / tokens and are not
 * open data — a possible future option if the project gets a key.
 */
export type RasterSource = 'osm' | 'sat' | 'esri';

export const RASTER_SOURCES: Record<RasterSource, { url: (z: number, x: number, y: number) => string; rings: { z: number; radius: number }[]; attribution: string }> = {
  osm: {
    url: tileUrl,
    rings: [
      { z: 14, radius: 2000 },
      { z: 15, radius: 1100 },
      { z: 16, radius: 650 },
      { z: 17, radius: 300 },
    ],
    attribution: '© OpenStreetMap contributors',
  },
  sat: {
    url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${y}/${x}.jpg`,
    rings: [
      { z: 13, radius: 3000 },
      { z: 14, radius: 1800 },
      { z: 15, radius: 900 },
    ],
    attribution:
      'Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016), CC BY 4.0',
  },
  esri: {
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    rings: [
      { z: 14, radius: 2000 },
      { z: 15, radius: 1100 },
      { z: 16, radius: 600 },
      { z: 17, radius: 300 },
      { z: 18, radius: 120 },
    ],
    attribution: 'Esri, Maxar, Earthstar Geographics — Esri World Imagery (proprietary; dev / non-commercial use, check Esri terms before production)',
  },
};

export interface RasterTile extends TileId {
  url: string;
  /** Corners in site 3-D (X, Z): NW, NE, SE, SW. */
  corners: [XZ, XZ, XZ, XZ];
}

/** Tiles of every zoom ring (coarse far out, fine near the site). Lower zooms are drawn first (painter's order). */
export function rasterTilesAround(c: XZ, src: RasterSource = 'osm'): RasterTile[] {
  const out: RasterTile[] = [];
  const S = RASTER_SOURCES[src];
  for (const { z, radius } of S.rings) {
    for (const t of tilesAround(c, radius, z)) {
      out.push({
        ...t,
        url: S.url(z, t.x, t.y),
        corners: [tileToXZ(t.x, t.y, z), tileToXZ(t.x + 1, t.y, z), tileToXZ(t.x + 1, t.y + 1, z), tileToXZ(t.x, t.y + 1, z)],
      });
    }
  }
  return out;
}

const texCache = new Map<string, Promise<THREE.Texture>>();
const texQueue: (() => void)[] = [];
let texActive = 0;
const MAX_TEX_FETCH = 6;

function pump() {
  while (texActive < MAX_TEX_FETCH && texQueue.length) {
    texActive++;
    texQueue.shift()!();
  }
}

/** Load (cached, ≤ 6 concurrent) a raster tile texture. */
export function loadRasterTexture(url: string, anisotropy = 1): Promise<THREE.Texture> {
  const hit = texCache.get(url);
  if (hit) return hit;
  const p = new Promise<THREE.Texture>((resolve, reject) => {
    texQueue.push(() => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = anisotropy;
          tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
          texActive--;
          pump();
          resolve(tex);
        },
        undefined,
        () => {
          texActive--;
          pump();
          reject(new Error(`tile ${url}`));
        }
      );
    });
    pump();
  });
  texCache.set(url, p);
  p.catch(() => texCache.delete(url));
  return p;
}

/**
 * A raster tile as an indexed grid (site 3-D, facing up), draped on hAt when given. Segments scale with
 * the tile size (~75 m cells, 2…32 per side) — terrain detail where it matters, few triangles far out.
 */
export function rasterTileGeometry(t: RasterTile, hAt?: HeightFn): THREE.BufferGeometry {
  const [nw, ne, se, sw] = t.corners;
  const size = Math.hypot(ne[0] - nw[0], ne[1] - nw[1]);
  const n = hAt ? Math.max(2, Math.min(32, Math.round(size / 75))) : 1;
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  for (let j = 0; j <= n; j++) {
    const v = j / n; // 0 = north edge
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      // bilinear between the 4 corners (the tile is a near-rectangle in site metres)
      const x = (1 - v) * ((1 - u) * nw[0] + u * ne[0]) + v * ((1 - u) * sw[0] + u * se[0]);
      const z = (1 - v) * ((1 - u) * nw[1] + u * ne[1]) + v * ((1 - u) * sw[1] + u * se[1]);
      pos.push(x, hAt ? hAt(x, z) : 0, z);
      uv.push(u, 1 - v);
      nor.push(0, 1, 0);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + n + 1; // next row (south)
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* -------------------------------- terrain -------------------------------- */

/*
 * AWS Terrain Tiles, terrarium encoding (Mapzen open data: SRTM, GMTED, ETOPO1, … — see
 * https://github.com/tilezen/joerd/blob/master/docs/attribution.md). elevation = R·256 + G + B/256 − 32768 (m).
 * z13 (~19 m/px here) over ~3 km; heights are re-based so the tower base is y = 0, exaggeration 1.0.
 */
export const TERRAIN_ATTRIBUTION = 'Terrain: Mapzen / AWS Terrain Tiles (SRTM, GMTED, …)';
const TERRAIN_URL = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
export const TERRAIN_Z = 13;
export const TERRAIN_RADIUS_M = 3000;

export interface Terrain {
  /** Ground height (m) relative to the tower base at site 3-D (X, Z); 0 outside the loaded tiles. */
  hAt: HeightFn;
  /** Absolute elevation of the tower base (m above sea level, terrarium). */
  baseElev: number;
  /** Min / max of the re-based heights over the loaded area. */
  range: [number, number];
  tiles: number;
}

async function terrariumTile(t: TileId): Promise<Float32Array | null> {
  try {
    const r = await fetch(TERRAIN_URL(t.z, t.x, t.y), { mode: 'cors' });
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    const out = new Float32Array(c.width * c.height);
    for (let i = 0; i < out.length; i++) out[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
    return out;
  } catch {
    return null;
  }
}

const terrainCache = new Map<string, Promise<Terrain>>();

/** Load the terrarium tiles around `c` and build a bilinear height sampler re-based at `base` (site 3-D). */
export function loadTerrain(c: XZ, base: XZ, radius = TERRAIN_RADIUS_M): Promise<Terrain> {
  const tiles = tilesAround(c, radius, TERRAIN_Z);
  const key = `${tiles.map((t) => `${t.x}/${t.y}`).join(',')}@${base.map(Math.round).join(',')}`;
  const hit = terrainCache.get(key);
  if (hit) return hit;
  const job = (async () => {
    const data = await Promise.all(tiles.map(terrariumTile));
    const map = new Map<string, Float32Array>();
    tiles.forEach((t, i) => data[i] && map.set(`${t.x}/${t.y}`, data[i]!));
    if (!map.size) throw new Error('no terrain tiles');
    const N = 256;
    const raw = (X: number, Z: number): number | null => {
      const [lng, lat] = xzToLngLat([X, Z]);
      const [fx, fy] = lngLatToTile(lng, lat, TERRAIN_Z);
      const tx = Math.floor(fx);
      const ty = Math.floor(fy);
      const d = map.get(`${tx}/${ty}`);
      if (!d) return null;
      // pixel centres at (i + 0.5); clamp at the tile edge (seams are sub-metre here)
      const px = Math.min(N - 1.001, Math.max(0, (fx - tx) * N - 0.5));
      const py = Math.min(N - 1.001, Math.max(0, (fy - ty) * N - 0.5));
      const i = Math.floor(px);
      const j = Math.floor(py);
      const u = px - i;
      const v = py - j;
      const h = (a: number, b: number) => d[b * N + a];
      return (1 - v) * ((1 - u) * h(i, j) + u * h(i + 1, j)) + v * ((1 - u) * h(i, j + 1) + u * h(i + 1, j + 1));
    };
    const baseElev = raw(base[0], base[1]) ?? 0;
    const hAt: HeightFn = (X, Z) => {
      const r = raw(X, Z);
      return r == null ? 0 : r - baseElev;
    };
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = -radius; x <= radius; x += 250)
      for (let z = -radius; z <= radius; z += 250) {
        const h = hAt(c[0] + x, c[1] + z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    return { hAt, baseElev, range: [lo, hi] as [number, number], tiles: map.size };
  })();
  terrainCache.set(key, job);
  job.catch(() => terrainCache.delete(key));
  return job;
}
