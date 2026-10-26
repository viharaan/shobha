/**
 * Pure, SSR-safe geometry builder for a traced unit (src/data/traced/types.ts).
 *
 * Frames: the traced unit is in millimetres, x → right, y → down (as drawn on the page).
 * 3-D: X = x / 1000, Z = y / 1000, Y up, 1 world unit = 1 m. Because the plan's y axis points
 * down the page and +Z points towards a default viewer, (x, y) → (X, Z) is a pure scale — the
 * plan is NOT mirrored (a room drawn left of another stays left when viewed from above with
 * north/page-up away from the viewer, i.e. looking down −Y with −Z at the top of the screen).
 *
 * No THREE import here: shapes are returned as plain point arrays so this file can run in node
 * (tests) and on the server. TracedUnit3D builds THREE.Shape from `floor.shape`.
 */
import type { Mm2, TracedOpening, TracedRoom, TracedRoomKind, TracedUnit, TracedWall } from '@/data/sobha/traced/types';

/** Floor-to-ceiling clear height: NOT stated in any source asset — assumed. */
export const WALL_H = 2.85;
/** Door / window head height (assumed, typical). */
export const HEAD_H = 2.1;
/** Window sill height (assumed, typical). */
export const SILL_H = 0.9;
/** Balcony parapet height (assumed). */
export const PARAPET_H = 1.1;
/** Eye height for walk / spawn. */
export const EYE_H = 1.6;
const RAIL_CURB = 0.1;
/** Minimum thickness used for walking collision (50 mm duct frames etc.). */
const MIN_COLLIDE_T = 0.15;
const RAIL_TOP = 0.05;

export type V2 = [number, number]; // metres, (X, Z)

export type SolidKind = 'wall' | 'parapet' | 'lintel' | 'sill' | 'header';

/** An axis-aligned-in-its-own-frame box: centred at (cx, ·, cz), rotated about Y by `rotY`. */
export interface WallBox {
  kind: SolidKind;
  cx: number;
  cz: number;
  /** Length along the wall (local X), m. */
  len: number;
  /** Thickness (local Z), m. */
  thick: number;
  y0: number;
  y1: number;
  /** three.js rotation.y so that local +X runs along the wall a → b. */
  rotY: number;
  /** Blocks walking (2-D collision). */
  collide: boolean;
}

export interface GlassPane extends Omit<WallBox, 'kind' | 'collide'> {
  kind: 'window' | 'sliding' | 'railing';
}

export interface FloorPoly {
  room: TracedRoom;
  kind: TracedRoomKind;
  /** Polygon in metres, (X, Z). For THREE.Shape use (X, −Z) and rotate the mesh −π/2 about X. */
  pts: V2[];
  areaM2: number;
  /** A label point guaranteed (approximately) inside the polygon. */
  label: V2;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
  /** max(width, depth), m. */
  span: number;
}

export interface Spawn {
  /** Standing point (feet), m. */
  pos: V2;
  /** Unit view heading: into the unit, turned towards the longest clear sightline. */
  dir: V2;
  /** three.js rotation.y for an object whose forward is −Z to face `dir`. */
  yaw: number;
}

export interface UnitGeometry {
  solids: WallBox[];
  glass: GlassPane[];
  floors: FloorPoly[];
  bounds: Bounds;
  entry: V2;
  spawn: Spawn;
  /** the main entrance opening: centre, wall direction (rotation.y for local +X along the wall), clear width — for the door leaf model */
  entryDoor: { cx: number; cz: number; rotY: number; width: number } | null;
  stats: { walls: number; openings: number; unmatchedOpenings: number };
}

const m = (p: Mm2): V2 => [p[0] / 1000, p[1] / 1000];
const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: V2, k: number): V2 => [a[0] * k, a[1] * k];
const dot = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1];
const cross = (a: V2, b: V2) => a[0] * b[1] - a[1] * b[0];
const len = (a: V2) => Math.hypot(a[0], a[1]);
const norm = (a: V2): V2 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};

/** three.js rotation.y that maps local +X onto direction (dx, dz). */
export const rotYFor = (d: V2) => Math.atan2(-d[1], d[0]);
/** three.js rotation.y that makes a camera (forward −Z) look along (dx, dz). */
export const yawFor = (d: V2) => Math.atan2(-d[0], -d[1]);

export function polygonArea(pts: V2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2; // signed
}

export function pointInPolygon(p: V2, pts: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(p: V2, a: V2, b: V2): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  return len(sub(p, add(a, mul(ab, t))));
}

function polygonCentroid(pts: V2[]): V2 {
  const A = polygonArea(pts);
  if (Math.abs(A) < 1e-9) {
    const s = pts.reduce((acc, p) => add(acc, p), [0, 0] as V2);
    return mul(s, 1 / Math.max(1, pts.length));
  }
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const f = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * f;
    cz += (a[1] + b[1]) * f;
  }
  return [cx / (6 * A), cz / (6 * A)];
}

/** Interior point far from the edges (centroid if it is well inside; else a deterministic grid search). */
export function labelPoint(pts: V2[]): V2 {
  const edgeDist = (p: V2) => {
    let d = Infinity;
    for (let i = 0; i < pts.length; i++) d = Math.min(d, distToSegment(p, pts[i], pts[(i + 1) % pts.length]));
    return d;
  };
  const c = polygonCentroid(pts);
  let best: V2 = c;
  let bestD = pointInPolygon(c, pts) ? edgeDist(c) : -1;
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const N = 14;
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const p: V2 = [x0 + ((x1 - x0) * i) / N, z0 + ((z1 - z0) * j) / N];
      if (!pointInPolygon(p, pts)) continue;
      // prefer the centroid unless a much better-centred point exists
      const d = edgeDist(p) - 0.02 * len(sub(p, c));
      if (d > bestD + 0.05) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

interface Cut {
  t0: number;
  t1: number;
}

function wallHeight(w: TracedWall) {
  return w.kind === 'parapet' ? PARAPET_H : WALL_H;
}

function boxAlong(kind: SolidKind, a: V2, b: V2, thick: number, y0: number, y1: number, collide: boolean): WallBox | null {
  const d = sub(b, a);
  const l = len(d);
  if (l < 0.005 || y1 - y0 < 0.005) return null;
  const c = mul(add(a, b), 0.5);
  return { kind, cx: c[0], cz: c[1], len: l, thick, y0, y1, rotY: rotYFor(norm(d)), collide };
}

/**
 * Build the 3-D geometry of a traced unit.
 * Walls are split at every opening lying on them (collinear within the wall thickness);
 * each opening then gets its own infill: door/opening → lintel above HEAD_H; window → sill to
 * SILL_H + glass to HEAD_H + header; sliding → full-width glazed panel to HEAD_H + header.
 */
export function buildUnitGeometry(t: TracedUnit): UnitGeometry {
  const walls = t.walls.map((w) => ({ w, a: m(w.a), b: m(w.b), thick: Math.max(0.03, w.thicknessMm / 1000) }));
  const cuts: Cut[][] = walls.map(() => []);
  const solids: WallBox[] = [];
  const glass: GlassPane[] = [];
  let unmatched = 0;

  const pushBox = (bx: WallBox | null) => {
    if (bx) solids.push(bx);
  };

  for (const o of t.openings) {
    const oa = m(o.a);
    const ob = m(o.b);
    const od = sub(ob, oa);
    const ol = len(od);
    if (ol < 0.02) continue;
    const ou = norm(od);
    let thick = 0;
    let host: TracedWall['kind'] | null = null;
    let matched = false;
    walls.forEach((W, i) => {
      const wd = sub(W.b, W.a);
      const wl = len(wd);
      if (wl < 1e-6) return;
      const u = norm(wd);
      if (Math.abs(cross(u, ou)) > 0.12) return; // not parallel
      const n: V2 = [-u[1], u[0]];
      const tol = Math.max(W.thick / 2 + 0.03, 0.08);
      if (Math.abs(dot(sub(oa, W.a), n)) > tol || Math.abs(dot(sub(ob, W.a), n)) > tol) return;
      const ta = dot(sub(oa, W.a), u);
      const tb = dot(sub(ob, W.a), u);
      const t0 = Math.max(0, Math.min(ta, tb));
      const t1 = Math.min(wl, Math.max(ta, tb));
      if (t1 - t0 < 0.01) return;
      cuts[i].push({ t0, t1 });
      matched = true;
      if (W.thick > thick) {
        thick = W.thick;
        host = W.w.kind;
      }
    });
    if (!matched) {
      unmatched++;
      // opening drawn in a gap between wall pieces: take the nearest wall's thickness
      const mid = mul(add(oa, ob), 0.5);
      let best = Infinity;
      for (const W of walls) {
        const d = distToSegment(mid, W.a, W.b);
        if (d < best) {
          best = d;
          thick = W.thick;
          host = W.w.kind;
        }
      }
      if (!thick) thick = 0.15;
    }
    // an unmatched 'opening' is an open boundary with no wall (e.g. passage ↔ living): leave the gap
    if (!matched && o.kind === 'opening') continue;
    addInfill(o, oa, ob, thick, host === 'parapet', pushBox, glass);
  }

  walls.forEach((W, i) => {
    const wd = sub(W.b, W.a);
    const wl = len(wd);
    if (wl < 0.005) return;
    const u = norm(wd);
    const h = wallHeight(W.w);
    const kind: SolidKind = W.w.kind === 'parapet' ? 'parapet' : 'wall';
    // merge cut intervals
    const cs = cuts[i].slice().sort((p, q) => p.t0 - q.t0);
    const merged: Cut[] = [];
    for (const c of cs) {
      const last = merged[merged.length - 1];
      if (last && c.t0 <= last.t1 + 1e-4) last.t1 = Math.max(last.t1, c.t1);
      else merged.push({ ...c });
    }
    let s = 0;
    const pieces: [number, number][] = [];
    for (const c of merged) {
      if (c.t0 - s > 0.005) pieces.push([s, c.t0]);
      s = Math.max(s, c.t1);
    }
    if (wl - s > 0.005) pieces.push([s, wl]);
    // Traced walls are non-overlapping rectangles (centre line + thickness reproduce the drawn
    // poché exactly), so pieces are NOT extended at their ends — that would double up corners.
    for (const [p0, p1] of pieces) {
      const a = add(W.a, mul(u, p0));
      const b = add(W.a, mul(u, p1));
      if (kind === 'parapet') {
        // balcony parapets are (mostly) glazed railings: curb + glass + handrail, 1.1 m (assumed)
        pushBox(boxAlong('parapet', a, b, W.thick, 0, RAIL_CURB, true));
        const g = boxAlong('header', a, b, Math.min(0.025, W.thick * 0.4), RAIL_CURB, h - RAIL_TOP, false);
        if (g) glass.push({ ...g, kind: 'railing' });
        pushBox(boxAlong('parapet', a, b, Math.min(0.06, W.thick), h - RAIL_TOP, h, false));
      } else {
        pushBox(boxAlong(kind, a, b, W.thick, 0, h, true));
      }
    }
  });

  const floors: FloorPoly[] = t.rooms
    .filter((r) => r.polygon.length >= 3)
    .map((r) => {
      const pts = r.polygon.map(m);
      return { room: r, kind: r.kind, pts, areaM2: Math.abs(polygonArea(pts)), label: labelPoint(pts) };
    });

  // bounds over walls + rooms
  const all: V2[] = [...floors.flatMap((f) => f.pts), ...walls.flatMap((W) => [W.a, W.b])];
  const xs = all.map((p) => p[0]);
  const zs = all.map((p) => p[1]);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 1;
  const minZ = zs.length ? Math.min(...zs) : 0;
  const maxZ = zs.length ? Math.max(...zs) : 1;
  const bounds: Bounds = {
    minX,
    maxX,
    minZ,
    maxZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    span: Math.max(maxX - minX, maxZ - minZ, 1),
  };

  const entry = m(t.entry);
  const spawn = computeSpawn(t, entry, floors, bounds, solids);
  // the opening the ENTRY marker sits in (within 1 m) carries the front door
  let entryDoor: UnitGeometry['entryDoor'] = null;
  let bestEntryD = 1.0;
  for (const o of t.openings) {
    const a = m(o.a), b = m(o.b);
    const d = distToSegment(entry, a, b);
    if (d < bestEntryD) { bestEntryD = d; entryDoor = { cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2, rotY: rotYFor(norm(sub(b, a))), width: len(sub(b, a)) }; }
  }

  return {
    solids,
    glass,
    floors,
    bounds,
    entry,
    spawn,
    entryDoor,
    stats: { walls: t.walls.length, openings: t.openings.length, unmatchedOpenings: unmatched },
  };
}

function addInfill(
  o: TracedOpening,
  a: V2,
  b: V2,
  thick: number,
  inParapet: boolean,
  pushBox: (b: WallBox | null) => void,
  glass: GlassPane[]
) {
  const top = inParapet ? PARAPET_H : WALL_H;
  const pane = (kind: GlassPane['kind'], y0: number, y1: number) => {
    const bx = boxAlong('header', a, b, Math.min(0.03, thick * 0.4), y0, y1, false);
    if (bx) glass.push({ ...bx, kind });
  };
  switch (o.kind) {
    case 'door':
    case 'opening':
      if (!inParapet) pushBox(boxAlong('lintel', a, b, thick, HEAD_H, top, false));
      break;
    case 'window':
      pushBox(boxAlong('sill', a, b, thick, 0, Math.min(SILL_H, top), true));
      if (!inParapet) {
        pane('window', SILL_H, HEAD_H);
        pushBox(boxAlong('header', a, b, thick, HEAD_H, top, false));
      }
      break;
    case 'sliding':
      pane('sliding', 0, Math.min(HEAD_H, top));
      if (!inParapet) pushBox(boxAlong('header', a, b, thick, HEAD_H, top, false));
      break;
  }
}

/** Player collision radius used by the walk controls, m. */
const SPAWN_R = 0.22;
/** Sightlines are capped here so one long corridor doesn't dominate everything, m. */
const RAY_MAX = 12;

/** Distance along a ray (origin o, unit dir d) to the first colliding box, or RAY_MAX. */
function rayClear(o: V2, d: V2, boxes: WallBox[]): number {
  let best = RAY_MAX;
  for (const b of boxes) {
    if (!b.collide) continue;
    const c = Math.cos(b.rotY);
    const s = Math.sin(b.rotY);
    const u: V2 = [c, -s];
    const v: V2 = [s, c];
    const rel: V2 = [o[0] - b.cx, o[1] - b.cz];
    // slab test in the box's local frame
    const lo = [dot(rel, u), dot(rel, v)];
    const ld = [dot(d, u), dot(d, v)];
    const h = [b.len / 2, Math.max(b.thick, MIN_COLLIDE_T) / 2];
    let t0 = -Infinity;
    let t1 = Infinity;
    for (let k = 0; k < 2; k++) {
      if (Math.abs(ld[k]) < 1e-9) {
        if (Math.abs(lo[k]) > h[k]) {
          t0 = Infinity;
          break;
        }
      } else {
        const a = (-h[k] - lo[k]) / ld[k];
        const z = (h[k] - lo[k]) / ld[k];
        t0 = Math.max(t0, Math.min(a, z));
        t1 = Math.min(t1, Math.max(a, z));
      }
    }
    if (t0 <= t1 && t1 > 0) best = Math.min(best, Math.max(0, t0));
  }
  return best;
}

/** Distance from p to the nearest colliding box surface (0 if inside one). */
function clearance(p: V2, boxes: WallBox[]): number {
  let best = Infinity;
  for (const b of boxes) {
    if (!b.collide) continue;
    const c = Math.cos(b.rotY);
    const s = Math.sin(b.rotY);
    const rel: V2 = [p[0] - b.cx, p[1] - b.cz];
    const du = Math.max(0, Math.abs(rel[0] * c - rel[1] * s) - b.len / 2);
    const dv = Math.max(0, Math.abs(rel[0] * s + rel[1] * c) - Math.max(b.thick, MIN_COLLIDE_T) / 2);
    best = Math.min(best, Math.hypot(du, dv));
  }
  return best;
}

/** Rotate a unit vector by `a` radians in the XZ plane. */
const rot = (d: V2, a: number): V2 => [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a)];

/**
 * Spawn just inside the main door. The inward normal of the door gives the base heading; the
 * actual heading is the ray (every 5° within ±100° of it) with the longest clear sightline
 * against colliding walls, lightly biased towards the inward normal so a long view back along
 * the façade doesn't win over looking into the flat. In a cramped foyer the standing point may
 * slide up to 0.6 m inward (staying walkable and clear of walls) if that opens up the view.
 */
function computeSpawn(t: TracedUnit, entry: V2, floors: FloorPoly[], bounds: Bounds, solids: WallBox[]): Spawn {
  const indoor = floors.filter((f) => isWalkable(f.kind) && f.kind !== 'balcony');
  const insideAny = (p: V2) => indoor.some((f) => pointInPolygon(p, f.pts));
  let dir: V2 | null = null;
  // nearest opening to the entry point → its wall normal, signed to point into the unit
  let bestD = Infinity;
  let bestO: TracedOpening | null = null;
  for (const o of t.openings) {
    const d = distToSegment(entry, m(o.a), m(o.b));
    if (d < bestD) {
      bestD = d;
      bestO = o;
    }
  }
  if (bestO && bestD < 1.0) {
    const u = norm(sub(m(bestO.b), m(bestO.a)));
    const n: V2 = [-u[1], u[0]];
    const pIn = add(entry, mul(n, 0.6));
    const pOut = add(entry, mul(n, -0.6));
    if (insideAny(pIn) && !insideAny(pOut)) dir = n;
    else if (insideAny(pOut) && !insideAny(pIn)) dir = mul(n, -1);
    else {
      // both/neither inside: point towards the unit centre
      const toC: V2 = [bounds.cx - entry[0], bounds.cz - entry[1]];
      dir = dot(n, toC) >= 0 ? n : mul(n, -1);
    }
  }
  if (!dir) dir = norm([bounds.cx - entry[0], bounds.cz - entry[1]]);
  // stand just inside the door: step in until inside a room (max 1.2 m)
  let base = add(entry, mul(dir, 0.45));
  let k0 = 0.45;
  for (let k = 0.45; k <= 1.2 && !insideAny(base); k += 0.15) {
    base = add(entry, mul(dir, k));
    k0 = k;
  }

  // best heading from a standing point: score = clear distance (±2.5° min) × (0.75 + 0.25·cos(offset))
  const look = (p: V2) => {
    let best = { score: -1, d: dir as V2, clear: 0 };
    for (let deg = -100; deg <= 100; deg += 5) {
      const a = (deg * Math.PI) / 180;
      const d = rot(dir as V2, a);
      const clear = rayClear(p, d, solids);
      // a sightline must be a few degrees wide, not a ray threading a door gap
      const wide = Math.min(clear, rayClear(p, rot(d, -0.044), solids), rayClear(p, rot(d, 0.044), solids));
      const score = wide * (0.75 + 0.25 * Math.cos(a));
      if (score > best.score + 1e-9) best = { score, d, clear };
    }
    return best;
  };

  // keep the collision circle clear of the door jambs / foyer walls
  if (clearance(base, solids) < SPAWN_R) {
    const fixed = resolveCollisions(base, SPAWN_R + 0.01, solids);
    if (insideAny(fixed)) base = fixed;
  }
  let pos = base;
  let view = look(base);
  // cramped foyer: try sliding inward (≤ 0.6 m) for a better view; keep walkable + clear of walls
  if (view.clear < 3) {
    for (let s = 0.15; s <= 0.6 + 1e-9; s += 0.15) {
      const p = add(entry, mul(dir, k0 + s));
      if (!insideAny(p) || clearance(p, solids) < SPAWN_R) continue;
      const v = look(p);
      // demand a real gain so the spawn doesn't drift for nothing
      if (v.score > view.score * 1.15 + 0.1) {
        pos = p;
        view = v;
      }
    }
  }
  return { pos, dir: view.d, yaw: yawFor(view.d) };
}

/* ------------------------------------------------------------------------------------------ */
/* Collision (2-D, XZ): player circle vs. oriented wall boxes                                 */
/* ------------------------------------------------------------------------------------------ */

/** Push point p (m) out of every colliding box by radius r. Returns the corrected position. */
export function resolveCollisions(p: V2, r: number, boxes: WallBox[]): V2 {
  let [x, z] = p;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const b of boxes) {
      if (!b.collide) continue;
      // local frame: u along wall (local +X), v across (local +Z)
      const c = Math.cos(b.rotY);
      const s = Math.sin(b.rotY);
      const u: V2 = [c, -s]; // rotY maps +X to (cos, −sin)
      const v: V2 = [s, c]; //   and +Z to (sin, cos)
      const d: V2 = [x - b.cx, z - b.cz];
      const lu = dot(d, u);
      const lv = dot(d, v);
      const hu = b.len / 2;
      const hv = Math.max(b.thick, MIN_COLLIDE_T) / 2; // thin duct frames still block
      if (Math.abs(lu) > hu + r || Math.abs(lv) > hv + r) continue;
      const qu = Math.max(-hu, Math.min(hu, lu));
      const qv = Math.max(-hv, Math.min(hv, lv));
      let du = lu - qu;
      let dv = lv - qv;
      let dist = Math.hypot(du, dv);
      if (dist >= r) continue;
      if (dist < 1e-6) {
        // centre inside the box: push out along the shallowest axis
        const pu = hu - Math.abs(lu);
        const pv = hv - Math.abs(lv);
        if (pu < pv) {
          du = Math.sign(lu) || 1;
          dv = 0;
        } else {
          du = 0;
          dv = Math.sign(lv) || 1;
        }
        dist = 0;
        const push = (pu < pv ? pu : pv) + r;
        x += (u[0] * du + v[0] * dv) * push;
        z += (u[1] * du + v[1] * dv) * push;
      } else {
        const push = r - dist;
        x += ((u[0] * du + v[0] * dv) / dist) * push;
        z += ((u[1] * du + v[1] * dv) / dist) * push;
      }
      moved = true;
    }
    if (!moved) break;
  }
  return [x, z];
}

/** Shafts / ducts / AC ledges (kind 'other') are not walkable or teleportable. */
export const isWalkable = (k: TracedRoomKind) => k !== 'other';

/** Group room kinds into the legend categories used by the illustrative model. */
export type LegendCat = 'living' | 'bedroom' | 'wet' | 'service' | 'balcony' | 'shaft';
export function legendCat(k: TracedRoomKind): LegendCat {
  switch (k) {
    case 'living':
      return 'living';
    case 'bedroom':
    case 'closet':
      return 'bedroom';
    case 'wet':
      return 'wet';
    case 'balcony':
      return 'balcony';
    case 'other':
      return 'shaft';
    default:
      return 'service';
  }
}

export const LEGEND_COLORS: Record<LegendCat, string> = {
  living: '#b98a5e',
  bedroom: '#dcc39a',
  wet: '#c9d6df',
  balcony: '#b9b6ae',
  service: '#e6dbc4',
  shaft: '#5b6573',
};

export const LEGEND_LABELS: [LegendCat, string][] = [
  ['living', 'Living / dining'],
  ['bedroom', 'Bedrooms / closets'],
  ['wet', 'Baths / powder'],
  ['service', 'Kitchen / utility / foyer / passage'],
  ['balcony', 'Balconies'],
  ['shaft', 'Shafts / ducts (not walkable)'],
];

/** PDF raster pixel (pdftoppm at `dpi`) for a unit-frame mm point. */
export function mmToRasterPx(t: TracedUnit, p: Mm2, dpi = 200): [number, number] {
  const k = dpi / 72;
  return [(p[0] / t.frame.mmPerPt + t.frame.originPt[0]) * k, (p[1] / t.frame.mmPerPt + t.frame.originPt[1]) * k];
}
