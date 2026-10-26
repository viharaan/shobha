import type { PlanRecord, PlanRoom } from '@/data/types';
import type { FurnitureItem } from './svgFurniture';
import type { WallData } from './svgWalls';

/**
 * Navigation grid for one unit plan, in plan-local metres (origin = wall-bbox centre, x right, z toward
 * viewer = SVG +y). Walls (the plan's own wall polygon) and visible furniture are rasterised at RES and
 * grown by BODY_R, so a cell is "free" when a person standing there touches nothing. Used for collision,
 * safe room spots, room rectangles and the entry spawn — one grid, so 3D, mini-map and 2D never disagree.
 */
export const RES = 0.05; // m per cell
export const BODY_R = 0.22; // m, half shoulder width
const MARGIN = 2; // m of walkable apron around the unit

export interface NavGrid {
  x0: number; z0: number; nx: number; nz: number;
  blocked: Uint8Array; // walls + furniture, grown by BODY_R
  wall: Uint8Array; // walls only, barely grown (for room-rect orientation)
  clear: Float32Array; // distance to nearest blocked cell, metres
}

export interface RoomRect { room: PlanRoom; x0: number; z0: number; x1: number; z1: number }
export interface NavSpot { x: number; z: number; y?: number; yaw?: number }

/** Centre of the "ENTRY" word on each plan page (pdftotext -bbox of the source PDF), SVG pt. */
const ENTRY_PT: Record<number, [number, number]> = {
  2: [278.32, 242.26], 3: [296.18, 249.23], 4: [220.40, 302.04], 5: [451.26, 231.66],
  6: [431.44, 573.66], 7: [396.08, 573.60], 8: [254.65, 258.24],
};

export function buildNavGrid(walls: WallData, furniture: FurnitureItem[], plan: PlanRecord, m: number): NavGrid {
  const [bx0, by0, bx1, by1] = plan.wallBboxPt;
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
  const w = (bx1 - bx0) * m, d = (by1 - by0) * m;
  const x0 = -w / 2 - MARGIN, z0 = -d / 2 - MARGIN;
  const nx = Math.ceil((w + 2 * MARGIN) / RES), nz = Math.ceil((d + 2 * MARGIN) / RES);

  const raster = (grow: number, withFurniture: boolean): Uint8Array => {
    const c = document.createElement('canvas');
    c.width = nx; c.height = nz;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('2D canvas unavailable');
    g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    // pt → cell
    const s = m / RES;
    g.setTransform(s, 0, 0, s, (-cx * m - x0) / RES, (-cy * m - z0) / RES);
    g.beginPath();
    for (const shape of walls.shapes) {
      const loops = [shape.getPoints(4), ...shape.holes.map((h) => h.getPoints(4))];
      for (const pts of loops) {
        pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath();
      }
    }
    g.fill('evenodd');
    if (grow > 0) { g.lineWidth = (2 * grow) / m; g.lineJoin = 'round'; g.stroke(); }
    if (withFurniture) {
      g.setTransform(1 / RES, 0, 0, 1 / RES, -x0 / RES, -z0 / RES);
      for (const f of furniture) g.fillRect(f.x - f.w / 2 - grow, f.z - f.d / 2 - grow, f.w + 2 * grow, f.d + 2 * grow);
    }
    const px = g.getImageData(0, 0, nx, nz).data;
    const out = new Uint8Array(nx * nz);
    for (let i = 0; i < out.length; i++) out[i] = px[i * 4 + 3] > 64 ? 1 : 0;
    return out;
  };

  const blocked = raster(BODY_R, true);
  const wall = raster(0.03, false);
  return { x0, z0, nx, nz, blocked, wall, clear: distance(blocked, nx, nz) };
}

/** Two-pass chamfer distance (metres) from blocked cells. */
function distance(b: Uint8Array, nx: number, nz: number): Float32Array {
  const INF = 1e9, a = RES, dg = RES * Math.SQRT2;
  const d = new Float32Array(nx * nz);
  for (let i = 0; i < d.length; i++) d[i] = b[i] ? 0 : INF;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + a);
    if (j > 0) { v = Math.min(v, d[k - nx] + a); if (i > 0) v = Math.min(v, d[k - nx - 1] + dg); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + dg); }
    d[k] = v;
  }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; let v = d[k];
    if (i < nx - 1) v = Math.min(v, d[k + 1] + a);
    if (j < nz - 1) { v = Math.min(v, d[k + nx] + a); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + dg); if (i > 0) v = Math.min(v, d[k + nx - 1] + dg); }
    d[k] = v;
  }
  return d;
}

const cellOf = (g: NavGrid, x: number, z: number): number => {
  const i = Math.floor((x - g.x0) / RES), j = Math.floor((z - g.z0) / RES);
  return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : j * g.nx + i;
};
const cellCentre = (g: NavGrid, k: number): [number, number] => [g.x0 + ((k % g.nx) + 0.5) * RES, g.z0 + (Math.floor(k / g.nx) + 0.5) * RES];

export function isFree(g: NavGrid, x: number, z: number): boolean {
  const k = cellOf(g, x, z);
  return k >= 0 && g.blocked[k] === 0;
}

/**
 * Collision-resolved move: full step if free, else slide along x or z, else stay. Sub-steps so fast
 * moves cannot tunnel. If the start itself is blocked (e.g. furniture toggled on around you) movement is
 * unrestricted until you are out.
 */
export function slide(g: NavGrid, fx: number, fz: number, tx: number, tz: number): [number, number] {
  if (!isFree(g, fx, fz)) return [tx, tz];
  const n = Math.max(1, Math.ceil(Math.hypot(tx - fx, tz - fz) / (RES * 0.5)));
  let x = fx, z = fz;
  const sx = (tx - fx) / n, sz = (tz - fz) / n;
  for (let i = 0; i < n; i++) {
    if (isFree(g, x + sx, z + sz)) { x += sx; z += sz; }
    else if (isFree(g, x + sx, z)) x += sx;
    else if (isFree(g, x, z + sz)) z += sz;
    else break;
  }
  return [x, z];
}

/** Nearest free cell to (x, z) within maxR metres, or null. */
export function nearestFree(g: NavGrid, x: number, z: number, maxR = 3): [number, number] | null {
  if (isFree(g, x, z)) return [x, z];
  const r = Math.ceil(maxR / RES);
  const ci = Math.floor((x - g.x0) / RES), cj = Math.floor((z - g.z0) / RES);
  let best = -1, bestD = Infinity;
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
    const k = j * g.nx + i;
    if (g.blocked[k]) continue;
    const dd = di * di + dj * dj;
    if (dd < bestD) { bestD = dd; best = k; }
  }
  return best < 0 ? null : cellCentre(g, best);
}

const ptToM = (plan: PlanRecord, m: number, x: number, y: number): [number, number] => {
  const [bx0, by0, bx1, by1] = plan.wallBboxPt;
  return [(x - (bx0 + bx1) / 2) * m, (y - (by0 + by1) / 2) * m];
};

/**
 * Room rectangle: printed W × D centred on the dimension label. The PDF does not say which printed side
 * runs along the page x axis, so both orientations are tried and the one crossing fewer wall cells wins.
 */
export function roomRects(plan: PlanRecord, m: number, g: NavGrid | null): RoomRect[] {
  return plan.rooms.map((room) => {
    const [cx, cz] = ptToM(plan, m, room.labelPt[0], room.labelPt[1]);
    const a = room.mm[0] / 1000, b = room.mm[1] / 1000;
    const mk = (w: number, d: number): RoomRect => ({ room, x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
    const A = mk(a, b), B = mk(b, a);
    if (!g || a === b) return A;
    const wallCells = (r: RoomRect) => {
      let n = 0;
      for (let z = r.z0 + 0.15; z < r.z1 - 0.15; z += RES) for (let x = r.x0 + 0.15; x < r.x1 - 0.15; x += RES) {
        const k = cellOf(g, x, z);
        if (k < 0 || g.wall[k]) n++;
      }
      return n;
    };
    return wallCells(B) < wallCells(A) ? B : A;
  });
}

/** Smallest room rectangle containing a point (plan-local metres). */
export function roomAtPoint(rects: RoomRect[], x: number, z: number): RoomRect | null {
  let best: RoomRect | null = null;
  for (const r of rects) {
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    if (!best || (r.x1 - r.x0) * (r.z1 - r.z0) < (best.x1 - best.x0) * (best.z1 - best.z0)) best = r;
  }
  return best;
}

/** Yaw (three.js, about +y) that faces from (x, z) toward (tx, tz). */
export const yawToward = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

/**
 * Where to stand to look at a room: the most open free cell inside its rectangle (max clearance, mild
 * pull toward the centre), facing the centre — or, when standing on the centre, along the room's long
 * axis. Falls back to the nearest free cell to the label, then to the label itself.
 */
export function roomSpot(g: NavGrid | null, r: RoomRect): NavSpot {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const longX = r.x1 - r.x0 >= r.z1 - r.z0;
  if (!g) return { x: cx, z: cz, yaw: longX ? -Math.PI / 2 : 0 };
  let best: [number, number] | null = null, bestS = -Infinity;
  for (let z = r.z0 + 0.1; z <= r.z1 - 0.1; z += RES) for (let x = r.x0 + 0.1; x <= r.x1 - 0.1; x += RES) {
    const k = cellOf(g, x, z);
    if (k < 0 || g.blocked[k]) continue;
    const s = Math.min(g.clear[k], 1.2) - 0.25 * Math.hypot(x - cx, z - cz);
    if (s > bestS) { bestS = s; best = [x, z]; }
  }
  const p = best ?? nearestFree(g, cx, cz) ?? [cx, cz];
  const far = Math.hypot(p[0] - cx, p[1] - cz) > 0.6;
  const yaw = far ? yawToward(p[0], p[1], cx, cz)
    : longX ? yawToward(p[0], p[1], p[0] < cx ? r.x1 : r.x0, p[1]) : yawToward(p[0], p[1], p[0], p[1] < cz ? r.z1 : r.z0);
  return { x: p[0], z: p[1], yaw };
}

/**
 * Spawn just inside the front door: the free cell, inside some room rectangle, closest to the plan's
 * own ENTRY marker; facing the living room (or the centre of all rooms). Fallback: outside the
 * south edge facing in.
 */
export function entrySpot(g: NavGrid | null, plan: PlanRecord, m: number, rects: RoomRect[]): NavSpot {
  const [, by0, , by1] = plan.wallBboxPt;
  const d = (by1 - by0) * m;
  const fallback: NavSpot = { x: 0, z: d / 2 + 1, yaw: 0 };
  const e = ENTRY_PT[plan.page];
  if (!g || !e) return fallback;
  const [ex, ez] = ptToM(plan, m, e[0], e[1]);
  // the marker sits just outside the door: stand ~1.2 m in from it, clear of the door frame
  let best: [number, number] | null = null, bestS = Infinity;
  for (const r of rects) for (let z = r.z0; z <= r.z1; z += RES) for (let x = r.x0; x <= r.x1; x += RES) {
    const k = cellOf(g, x, z);
    if (k < 0 || g.blocked[k] || g.clear[k] < 0.3) continue;
    const dd = Math.hypot(x - ex, z - ez);
    const s = Math.abs(dd - 1.2) - 0.5 * Math.min(g.clear[k], 0.6);
    if (s < bestS) { bestS = s; best = [x, z]; }
  }
  if (!best) return fallback;
  const living = rects.find((r) => /living/i.test(r.room.name));
  const [tx, tz] = living ? [(living.x0 + living.x1) / 2, (living.z0 + living.z1) / 2]
    : [rects.reduce((s, r) => s + (r.x0 + r.x1) / 2, 0) / rects.length, rects.reduce((s, r) => s + (r.z0 + r.z1) / 2, 0) / rects.length];
  return { x: best[0], z: best[1], yaw: yawToward(best[0], best[1], tx, tz) };
}

/**
 * Rig origin pose that puts the HEAD (at headLocal x/z inside the rig, looking headYawInRig relative to it)
 * at spot.x/z facing spot.yaw. Pure, so it is unit-tested (scripts/check-nav.mjs).
 */
export function rigPoseForHead(spot: NavSpot, hx: number, hz: number, headYawInRig: number, currentRigYaw: number) {
  const yaw = spot.yaw === undefined ? currentRigYaw : spot.yaw - headYawInRig;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: spot.x - (hx * c + hz * s), y: spot.y ?? 0, z: spot.z - (-hx * s + hz * c), yaw };
}
