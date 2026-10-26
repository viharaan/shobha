import type { UnitPlacement } from '@/data/sobha/traced/placement';
import { siteToLngLat } from '@/data/sobha/siteFrame';

/**
 * OSM raster-tile math + unit-local → site/geo conversions for the in-VR minimap (VRMapPanel).
 *
 * Tiles: OpenStreetMap Standard raster (EXTERNAL data, © OpenStreetMap contributors, ODbL),
 * server overridable with NEXT_PUBLIC_TILE_SERVER. Web-Mercator "slippy map" scheme, 256 px tiles.
 *
 * Frames (see src/data/traced/placement.ts):
 *   unit 3-D  X = x_mm/1000, Z = y_mm/1000, Y up — the traced viewer renders the unit at its local
 *             origin, so camera poses read from three.js are in this frame.
 *   site 3-D  P_site = R_y(yawRad)·P_unit + [offsetX, floorY, offsetZ]; X east, Z = −north.
 *   site 2-D  x east, y north (siteFrame.ts); ↔ lng/lat via siteToLngLat / lngLatToSite.
 * The placement itself is an ESTIMATE (key-plan matched to an OSM wing outline), so every
 * position derived here is "estimated", never surveyed.
 */

export const TILE_SIZE = 256;
export const OSM_TILE_SERVER =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TILE_SERVER) || 'https://tile.openstreetmap.org';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export function tileUrl(z: number, x: number, y: number): string {
  return `${OSM_TILE_SERVER.replace(/\/$/, '')}/${z}/${x}/${y}.png`;
}

/** [lng, lat] → global Web-Mercator pixel coords at zoom z (256-px tiles). */
export function lngLatToWorldPx(lng: number, lat: number, z: number): [number, number] {
  const n = TILE_SIZE * 2 ** z;
  const latR = (lat * Math.PI) / 180;
  const px = ((lng + 180) / 360) * n;
  const py = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  return [px, py];
}

/** Ground metres per pixel at latitude `lat`, zoom z. */
export function metresPerPx(lat: number, z: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

/** Unit-local 3-D point → site 3-D (X east, Y up, Z = −north). */
export function unitLocalToSite3D(
  p: Pick<UnitPlacement, 'yawRad' | 'offsetX' | 'offsetZ'>,
  floorY: number,
  x: number,
  y: number,
  z: number
): [number, number, number] {
  const c = Math.cos(p.yawRad);
  const s = Math.sin(p.yawRad);
  // three.js R_y: X' = c·X + s·Z, Z' = −s·X + c·Z
  return [c * x + s * z + p.offsetX, y + floorY, -s * x + c * z + p.offsetZ];
}

/** Unit-local 3-D point → site 2-D metres (x east, y north) + altitude above site ground. */
export function unitLocalToSite(
  p: Pick<UnitPlacement, 'yawRad' | 'offsetX' | 'offsetZ'>,
  floorY: number,
  x: number,
  y: number,
  z: number
): { x: number; y: number; alt: number } {
  const [X, Y, Z] = unitLocalToSite3D(p, floorY, x, y, z);
  return { x: X, y: -Z, alt: Y };
}

/** Unit-local point → [lng, lat] (estimated — via the placement). */
export function unitLocalToLngLat(
  p: Pick<UnitPlacement, 'yawRad' | 'offsetX' | 'offsetZ'>,
  floorY: number,
  x: number,
  y: number,
  z: number
): [number, number] {
  const s = unitLocalToSite(p, floorY, x, y, z);
  return siteToLngLat({ x: s.x, y: s.y });
}

/**
 * Horizontal view direction in unit-local 3-D (dx, dz) → compass bearing, degrees clockwise
 * from true north in [0, 360). NaN if the direction is (near) vertical.
 */
export function unitDirToBearingDeg(p: Pick<UnitPlacement, 'yawRad'>, dx: number, dz: number): number {
  if (Math.hypot(dx, dz) < 1e-6) return NaN;
  const c = Math.cos(p.yawRad);
  const s = Math.sin(p.yawRad);
  const east = c * dx + s * dz; // site X
  const north = -(-s * dx + c * dz); // −site Z
  const deg = (Math.atan2(east, north) * 180) / Math.PI;
  return (deg + 360) % 360;
}

// ---------------------------------------------------------------------------------------------
// Browser tile cache: at most MAX_CONCURRENT requests in flight, results kept for the session.

type TileEntry = { status: 'loading' | 'ok' | 'error'; img?: HTMLImageElement; waiters: (() => void)[] };
const cache = new Map<string, TileEntry>();
const queue: (() => void)[] = [];
let inFlight = 0;
const MAX_CONCURRENT = 9;

function pump() {
  while (inFlight < MAX_CONCURRENT && queue.length) queue.shift()!();
}

/**
 * Get a tile image if cached; otherwise start (or join) its download and call `onSettled` when it
 * finishes. Never blocks. Returns the image when ready, 'error' when it failed, null while loading.
 */
export function getTile(z: number, x: number, y: number, onSettled: () => void): HTMLImageElement | 'error' | null {
  const n = 2 ** z;
  if (y < 0 || y >= n) return 'error';
  const xx = ((x % n) + n) % n;
  const key = `${z}/${xx}/${y}`;
  const hit = cache.get(key);
  if (hit) {
    if (hit.status === 'ok') return hit.img!;
    if (hit.status === 'error') return 'error';
    hit.waiters.push(onSettled);
    return null;
  }
  if (typeof Image === 'undefined') return 'error';
  const entry: TileEntry = { status: 'loading', waiters: [onSettled] };
  cache.set(key, entry);
  queue.push(() => {
    inFlight++;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const done = (ok: boolean) => {
      inFlight--;
      entry.status = ok ? 'ok' : 'error';
      if (ok) entry.img = img;
      const w = entry.waiters;
      entry.waiters = [];
      w.forEach((f) => f());
      pump();
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = tileUrl(z, xx, y);
  });
  pump();
  return null;
}
