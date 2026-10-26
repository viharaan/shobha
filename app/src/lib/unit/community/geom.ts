import * as THREE from 'three';

/**
 * Pure geometry helpers for the Community layer (no React).
 *
 * Coordinates are 2-D (X, Z) pairs in whichever horizontal frame the caller works in (site 3-D:
 * X = east, Z = −north; or the selected unit's frame). Heights are passed separately.
 *
 * Everything is emitted into a `Soup` — one non-indexed triangle list with position, normal, uv and
 * colour — so a whole class of objects becomes ONE BufferGeometry / ONE draw call with the shared
 * facade material (vertex colour × facade texture).
 */

export type XZ = [number, number];
export type HeightFn = (x: number, z: number) => number;

/* ------------------------------ facade uv ------------------------------ */

/** One facade module (texture repeat) is 3 m wide and one floor (3 m) tall. */
export const FACADE_MODULE_M = 3;
/** uv that samples the plain (spandrel) band of the facade texture — used for "solid" faces. */
export const SOLID_UV: [number, number] = [0.5, 0.18];

/* ------------------------------ polygons ------------------------------- */

export function ringAreaXZ(r: XZ[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

export function pointInRingXZ(x: number, z: number, r: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i];
    const b = r[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function bboxOf(r: XZ[]) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of r) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

const bboxOverlap = (a: ReturnType<typeof bboxOf>, b: ReturnType<typeof bboxOf>, pad = 0) =>
  a.minX <= b.maxX + pad && b.minX <= a.maxX + pad && a.minZ <= b.maxZ + pad && b.minZ <= a.maxZ + pad;

export function centroidXZ(r: XZ[]): XZ {
  let x = 0;
  let z = 0;
  for (const p of r) {
    x += p[0];
    z += p[1];
  }
  return [x / r.length, z / r.length];
}

/** Drop repeated vertices (and a closing duplicate). */
export function cleanRing(r: XZ[], eps = 1e-4): XZ[] {
  const out: XZ[] = [];
  for (const p of r) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > eps || Math.abs(q[1] - p[1]) > eps) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps) out.pop();
  }
  return out;
}

export function convexHull(pts: XZ[]): XZ[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: XZ, a: XZ, b: XZ) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: XZ[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: XZ[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Convex polygon grown by `d` m (hull of its vertices pushed out in 16 directions). */
export function growConvex(hull: XZ[], d: number): XZ[] {
  if (d <= 0) return hull;
  const pts: XZ[] = [];
  for (const [x, z] of hull)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      pts.push([x + Math.cos(a) * d, z + Math.sin(a) * d]);
    }
  return convexHull(pts);
}

/** Sutherland–Hodgman: keep the part of `poly` on the side of line a→b where side(p) * sgn > 0. */
function clipHalf(poly: XZ[], a: XZ, b: XZ, sgn: number): XZ[] {
  const side = (p: XZ) => sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
  const out: XZ[] = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i];
    const Q = poly[(i + 1) % poly.length];
    const sp = side(P);
    const sq = side(Q);
    if (sp >= 0) out.push(P);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
    }
  }
  return out;
}

/** Intersection of `poly` with the convex polygon `B`. */
export function intersectConvex(poly: XZ[], B: XZ[]): XZ[] {
  const s = Math.sign(ringAreaXZ(B)) || 1;
  let cur = poly;
  for (let i = 0; i < B.length && cur.length >= 3; i++) cur = clipHalf(cur, B[i], B[(i + 1) % B.length], s);
  return cur.length >= 3 ? cur : [];
}

export interface Piece {
  ring: XZ[];
  /** Per edge i (ring[i] → ring[i+1]): false = a "bridge" made by the clip — no wall there. */
  wall: boolean[];
}

const onLine = (p: XZ, a: XZ, b: XZ) => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / l < 1e-5;
};

/**
 * A \ B for any simple polygon A and a CONVEX polygon B, as disjoint convex-clipped pieces
 * P_i = A ∩ outside(e_i) ∩ inside(e_0 … e_{i−1}). Edges that the clip runs along OUTSIDE A (the
 * zero-width "bridges" Sutherland–Hodgman leaves in a concave subject) are flagged wall = false;
 * real cut faces (inside A) keep their wall.
 */
export function subtractConvex(A: XZ[], B: XZ[]): Piece[] {
  const whole = (): Piece[] => [{ ring: A, wall: A.map(() => true) }];
  if (A.length < 3 || B.length < 3) return whole();
  if (!bboxOverlap(bboxOf(A), bboxOf(B))) return whole();
  const s = Math.sign(ringAreaXZ(B)) || 1;
  const pieces: Piece[] = [];
  let rest = A; // A ∩ inside(e_0 … e_{i−1})
  let kept = 0;
  for (let i = 0; i < B.length && rest.length >= 3; i++) {
    const a = B[i];
    const b = B[(i + 1) % B.length];
    const out = clipHalf(rest, a, b, -s);
    const area = Math.abs(ringAreaXZ(out));
    if (out.length >= 3 && area > 1e-4) {
      pieces.push({ ring: out, wall: [] });
      kept += area;
    }
    rest = clipHalf(rest, a, b, s);
  }
  if (!pieces.length) return []; // A lies inside B
  if (Math.abs(kept - Math.abs(ringAreaXZ(A))) < 1e-4 * Math.max(1, kept)) return whole(); // B misses A
  for (const pc of pieces) {
    const r = pc.ring;
    pc.wall = r.map((p, i) => {
      const q = r[(i + 1) % r.length];
      for (let k = 0; k < B.length; k++) {
        const a = B[k];
        const b = B[(k + 1) % B.length];
        if (onLine(p, a, b) && onLine(q, a, b)) {
          const m: XZ = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
          return pointInRingXZ(m[0], m[1], A); // a real cut face lies inside A
        }
      }
      return true;
    });
  }
  return pieces;
}

/** Distance from a point to a closed ring's outline. */
export function distToRing(x: number, z: number, r: XZ[]): number {
  let best = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[j];
    const b = r[i];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return best;
}

/* -------------------------------- soup --------------------------------- */

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** Non-indexed triangle list with position / normal / uv / colour → one BufferGeometry. */
export class Soup {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  get triangles() {
    return this.pos.length / 9;
  }
  /** Triangle (a, b, c are [x, y, z]); winding flipped so the front face looks along n. */
  tri(a: number[], b: number[], c: number[], n: number[], rgb: number[], uvs: number[][]) {
    tmpA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    tmpB.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    tmpA.cross(tmpB);
    const flip = tmpA.x * n[0] + tmpA.y * n[1] + tmpA.z * n[2] < 0;
    const vs = flip ? [a, c, b] : [a, b, c];
    const us = flip ? [uvs[0], uvs[2], uvs[1]] : uvs;
    for (let k = 0; k < 3; k++) {
      this.pos.push(vs[k][0], vs[k][1], vs[k][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(us[k][0], us[k][1]);
      this.col.push(rgb[0], rgb[1], rgb[2]);
    }
  }
  append(o: Soup, dy = 0) {
    for (let i = 0; i < o.pos.length; i += 3) this.pos.push(o.pos[i], o.pos[i + 1] + dy, o.pos[i + 2]);
    this.nor.push(...o.nor);
    this.uv.push(...o.uv);
    this.col.push(...o.col);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export const rgbOf = (hex: string): number[] => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

const UP = [0, 1, 0];
const DOWN = [0, -1, 0];

export interface WallOpts {
  /** facade uv (u along the wall / 3 m, v = (y + vBase) / 3 m) — else the solid uv */
  facade?: boolean;
  /** added to y for v (aligns the floor band): site frame −PODIUM_M, unit frame 0 */
  vBase?: number;
  /** per edge: build a wall? (Piece.wall) */
  wall?: boolean[];
  /** base height per vertex (terrain); y0 / y1 are then relative to it */
  hAt?: HeightFn;
  /** faces point INTO the ring (the inner face of a thin wall) */
  inward?: boolean;
}

/** Vertical walls around a ring between y0 and y1 (normals out of the solid, either winding). */
export function walls(s: Soup, ring: XZ[], y0: number, y1: number, rgb: number[], o: WallOpts = {}) {
  const r = ring;
  if (r.length < 3 || y1 - y0 < 1e-4) return;
  const sgn = (ringAreaXZ(r) > 0 ? 1 : -1) * (o.inward ? -1 : 1);
  const vb = o.vBase ?? 0;
  let u = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) continue;
    if (o.wall && o.wall[i] === false) {
      u += l;
      continue;
    }
    const n = [(sgn * dz) / l, 0, (-sgn * dx) / l];
    const ha = o.hAt ? o.hAt(a[0], a[1]) : 0;
    const hb = o.hAt ? o.hAt(b[0], b[1]) : 0;
    const A0 = [a[0], ha + y0, a[1]];
    const B0 = [b[0], hb + y0, b[1]];
    const A1 = [a[0], ha + y1, a[1]];
    const B1 = [b[0], hb + y1, b[1]];
    const uv = o.facade
      ? [
          [u / FACADE_MODULE_M, (y0 + vb) / FACADE_MODULE_M],
          [(u + l) / FACADE_MODULE_M, (y0 + vb) / FACADE_MODULE_M],
          [(u + l) / FACADE_MODULE_M, (y1 + vb) / FACADE_MODULE_M],
          [u / FACADE_MODULE_M, (y1 + vb) / FACADE_MODULE_M],
        ]
      : [SOLID_UV, SOLID_UV, SOLID_UV, SOLID_UV];
    s.tri(A0, B0, B1, n, rgb, [uv[0], uv[1], uv[2]]);
    s.tri(A0, B1, A1, n, rgb, [uv[0], uv[2], uv[3]]);
    u += l;
  }
}

/** Flat cap (polygon with holes) at height y (+ hAt per vertex), facing up or down; solid uv unless `uvAt`. */
export function cap(
  s: Soup,
  ring: XZ[],
  holes: XZ[][],
  y: number,
  rgb: number[],
  { down = false, hAt, uvAt }: { down?: boolean; hAt?: HeightFn; uvAt?: (x: number, z: number) => number[] } = {}
) {
  const outer = cleanRing(ring);
  if (outer.length < 3) return;
  const hs = holes.map((h) => cleanRing(h)).filter((h) => h.length >= 3);
  const all = [outer, ...hs].flat();
  let faces: number[][];
  try {
    faces = THREE.ShapeUtils.triangulateShape(
      outer.map(([x, z]) => new THREE.Vector2(x, z)),
      hs.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)))
    );
  } catch {
    return;
  }
  const n = down ? DOWN : UP;
  const V = (q: XZ) => [q[0], hAt ? y + hAt(q[0], q[1]) : y, q[1]];
  const U = (q: XZ) => (uvAt ? uvAt(q[0], q[1]) : SOLID_UV);
  for (const [i, j, k] of faces) s.tri(V(all[i]), V(all[j]), V(all[k]), n, rgb, [U(all[i]), U(all[j]), U(all[k])]);
}

/** Closed prism: walls + top (+ bottom). */
export function prismSoup(s: Soup, ring: XZ[], y0: number, y1: number, rgb: number[], o: WallOpts & { roof?: number[]; bottom?: boolean; top?: boolean } = {}) {
  walls(s, ring, y0, y1, rgb, o);
  if (o.top !== false) cap(s, ring, [], y1, o.roof ?? rgb);
  if (o.bottom) cap(s, ring, [], y0, o.roof ?? rgb, { down: true });
}

/** Flat ribbon along a polyline (overlapping per-segment quads), draped on hAt, at +y. */
export function ribbon(s: Soup, pts: XZ[], width: number, y: number, rgb: number[], hAt?: HeightFn, closed = false) {
  const h = width / 2;
  const P = closed ? [...pts, pts[0]] : pts;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i];
    const b = P[i + 1];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) continue;
    const ex = (dx / l) * h * 0.5;
    const ez = (dz / l) * h * 0.5;
    const nx = (-dz / l) * h;
    const nz = (dx / l) * h;
    const ya = y + (hAt ? hAt(a[0], a[1]) : 0);
    const yb = y + (hAt ? hAt(b[0], b[1]) : 0);
    const p0 = [a[0] - ex + nx, ya, a[1] - ez + nz];
    const p1 = [a[0] - ex - nx, ya, a[1] - ez - nz];
    const p2 = [b[0] + ex - nx, yb, b[1] + ez - nz];
    const p3 = [b[0] + ex + nx, yb, b[1] + ez + nz];
    s.tri(p0, p1, p2, UP, rgb, [SOLID_UV, SOLID_UV, SOLID_UV]);
    s.tri(p0, p2, p3, UP, rgb, [SOLID_UV, SOLID_UV, SOLID_UV]);
  }
}

/** Densify a closed ring so no edge is longer than `step` m (for terrain-following walls). */
export function densify(r: XZ[], step: number, closed = true): XZ[] {
  const out: XZ[] = [];
  const n = closed ? r.length : r.length - 1;
  for (let i = 0; i < n; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(l / step));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  if (!closed) out.push(r[r.length - 1]);
  return out;
}

/** Triangles of a geometry (indexed or not) — for the stats hook. */
export function triCount(g: THREE.BufferGeometry): number {
  if (g.index) return g.index.count / 3;
  const p = g.getAttribute('position');
  return p ? p.count / 3 : 0;
}
