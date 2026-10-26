import type { UnitPlacement } from '@/data/sobha/traced/placement';
import { FLOOR_TO_FLOOR_M } from '@/data/sobha/traced/placement';
import { tracedFor } from '@/data/sobha/traced';
import { mirrorTraced } from '@/data/sobha/traced/mirror';
import { flatPlacementOf } from '@/data/sobha/flats/loader';
import type { FlatPlacement } from '@/data/sobha/flats/types';
import { buildUnitGeometry, type UnitGeometry, type V2, type WallBox } from '@/lib/unit/unitGeometry';
import {
  Soup,
  bboxOf,
  cap,
  convexHull,
  growConvex,
  intersectConvex,
  pointInRingXZ,
  prismSoup,
  rgbOf,
  ringAreaXZ,
  subtractConvex,
  walls,
  type XZ,
} from './geom';

/**
 * OWN TOWER around the selected flat, in the UNIT frame (the unit sits at its own origin, floor y = 0).
 *
 *  - Same floor: every OTHER flat of the wing from its own per-flat placement (src/data/flats,
 *    estimated) as solid massing — rooms as full-height blocks (facade texture: the glazing band
 *    shows through the window gaps of the wall boxes), wall boxes, balcony slabs + parapet curb /
 *    glass / handrail — plus the CORE: the part of the master-plan roof outline no placed flat
 *    covers (0.5 m raster, ≥ 1.5 m inside the outline, ≥ 6 m²). Everything on this floor is
 *    CLIPPED against the selected unit's envelope (convex hull incl. external walls) + 0.3 m, so a
 *    placement error can't put a wall inside the unit.
 *  - Floors just below (2) and above (1): the same plate repeated, incl. this flat's own massing.
 *  - Further down / up: the wing's traced roof outline extruded (illustrative heights).
 *  - Wings without per-flat placements (3, 5, 6, 7 — no snapshot labels): the plain outline.
 */

export const NEIGHBOUR_GAP_M = 0.3;
const FLOORS_BELOW = 2;
const FLOORS_ABOVE = 1;
const SLAB_M = 0.2;
const H = FLOOR_TO_FLOOR_M;
/** block tops stop 2 cm under the next floor level: the copy below must not z-fight with the unit's own floor */
const HT = H - 0.02;

const C = {
  room: rgbOf('#ffffff'), // facade texture as is
  roof: rgbOf('#cfc8bb'),
  wall: rgbOf('#ece6da'),
  slab: rgbOf('#c9c2b5'),
  curb: rgbOf('#b5aea2'),
  glass: rgbOf('#a7bccb'),
  rail: rgbOf('#8d949b'),
  core: rgbOf('#ddd6c9'),
};

type Tf = (p: V2) => XZ;

/** Site 3-D (X, Z) → the selected unit's frame. */
export function siteToUnit(p: Pick<UnitPlacement, 'yawRad' | 'offsetX' | 'offsetZ'>): (q: XZ) => XZ {
  const c = Math.cos(p.yawRad);
  const s = Math.sin(p.yawRad);
  return ([x, z]) => {
    const dx = x - p.offsetX;
    const dz = z - p.offsetZ;
    return [c * dx - s * dz, s * dx + c * dz];
  };
}

/** Unit frame → site 3-D (X, Z). */
export function unitToSite(p: Pick<UnitPlacement, 'yawRad' | 'offsetX' | 'offsetZ'>): (q: XZ) => XZ {
  const c = Math.cos(p.yawRad);
  const s = Math.sin(p.yawRad);
  return ([x, z]) => [c * x + s * z + p.offsetX, -s * x + c * z + p.offsetZ];
}

/** Neighbour unit frame → selected unit frame. */
function neighbourToSel(n: FlatPlacement, sel: UnitPlacement): Tf {
  const toSite = unitToSite(n);
  const toSel = siteToUnit(sel);
  return (p) => toSel(toSite(p));
}

const geoCache = new Map<string, UnitGeometry | null>();
function geoFor(code: string, mirrored: boolean): UnitGeometry | null {
  const k = `${code.toUpperCase()}${mirrored ? ':m' : ''}`;
  if (!geoCache.has(k)) {
    const t = tracedFor(code);
    geoCache.set(k, t ? buildUnitGeometry(mirrored ? mirrorTraced(t) : t) : null);
  }
  return geoCache.get(k)!;
}

const boxRing = (s: Pick<WallBox, 'cx' | 'cz' | 'len' | 'thick' | 'rotY'>, T: Tf): XZ[] => {
  const d: V2 = [Math.cos(s.rotY), -Math.sin(s.rotY)];
  const n: V2 = [-d[1], d[0]];
  const c = (a: number, b: number): V2 => [s.cx + d[0] * s.len * a + n[0] * s.thick * b, s.cz + d[1] * s.len * a + n[1] * s.thick * b];
  return [c(-0.5, -0.5), c(0.5, -0.5), c(0.5, 0.5), c(-0.5, 0.5)].map(T);
};

/** Outer envelope used for clipping: convex hull of rooms + external walls (same as RealWorldContext's unit outline). */
export function geoHull(geo: UnitGeometry, T: Tf = (p) => p): XZ[] {
  const pts: XZ[] = geo.floors.flatMap((f) => f.pts.map(T));
  for (const s of geo.solids) if (s.kind === 'wall' || s.kind === 'parapet') pts.push(...boxRing(s, T));
  return convexHull(pts);
}

interface Footprint {
  /** all horizontal footprints (rooms, balconies, walls) in the selected frame — for the core raster */
  covered: XZ[][];
}

/** One flat as solid massing on a floor (y = 0 at its floor level), optionally minus `clip`. */
function flatMass(s: Soup, geo: UnitGeometry, T: Tf, clip: XZ[] | null, fp?: Footprint) {
  const pieces = (ring: XZ[]) => (clip ? subtractConvex(ring, clip) : [{ ring, wall: ring.map(() => true) }]);
  for (const f of geo.floors) {
    const ring = f.pts.map(T);
    fp?.covered.push(ring);
    for (const pc of pieces(ring)) {
      if (f.kind === 'balcony') {
        walls(s, pc.ring, -SLAB_M, 0, C.slab, { wall: pc.wall });
        cap(s, pc.ring, [], 0, C.slab);
        cap(s, pc.ring, [], -SLAB_M, C.slab, { down: true });
      } else {
        walls(s, pc.ring, 0, HT, C.room, { facade: true, wall: pc.wall });
        cap(s, pc.ring, [], HT, C.roof);
        cap(s, pc.ring, [], 0, C.roof, { down: true });
      }
    }
  }
  const box = (b: Pick<WallBox, 'cx' | 'cz' | 'len' | 'thick' | 'rotY'>, y0: number, y1: number, rgb: number[], footprint: boolean) => {
    const ring = boxRing(b, T);
    if (footprint) fp?.covered.push(ring);
    for (const pc of pieces(ring)) prismSoup(s, pc.ring, y0, y1, rgb, { wall: pc.wall, bottom: y0 > 0.01 });
  };
  for (const b of geo.solids) {
    if (b.kind === 'wall') box(b, 0, HT, C.wall, true);
    else if (b.kind === 'parapet') box(b, b.y0, b.y1, b.y1 > 0.5 ? C.rail : C.curb, true);
  }
  for (const g of geo.glass) if (g.kind === 'railing') box(g, g.y0, g.y1, C.glass, false);
}

/* -------------------------------- core --------------------------------- */

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * Core / corridor: cells of the roof outline that no placed flat covers (rasterised at `cell` m;
 * footprints dilated one cell to close wall seams), at least 1.5 m inside the outline (so the
 * re-entrant light slots between flats stay open), components ≥ 6 m², greedy-merged into rectangles.
 */
function coreRects(outline: XZ[], covered: XZ[][], exclude: XZ[] | null, cell = 0.5): Rect[] {
  const bb = bboxOf(outline);
  const nx = Math.ceil((bb.maxX - bb.minX) / cell) + 1;
  const nz = Math.ceil((bb.maxZ - bb.minZ) / cell) + 1;
  if (nx * nz > 400 * 400) return [];
  const X = (i: number) => bb.minX + (i + 0.5) * cell;
  const Z = (j: number) => bb.minZ + (j + 0.5) * cell;
  const inside = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) inside[j * nx + i] = pointInRingXZ(X(i), Z(j), outline) ? 1 : 0;
  const cov = new Uint8Array(nx * nz);
  for (const r of covered) {
    const b = bboxOf(r);
    const i0 = Math.max(0, Math.floor((b.minX - bb.minX) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((b.maxX - bb.minX) / cell));
    const j0 = Math.max(0, Math.floor((b.minZ - bb.minZ) / cell));
    const j1 = Math.min(nz - 1, Math.ceil((b.maxZ - bb.minZ) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (!cov[j * nx + i] && pointInRingXZ(X(i), Z(j), r)) cov[j * nx + i] = 1;
  }
  const morph = (src: Uint8Array, grow: boolean) => {
    const out = new Uint8Array(src);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (grow ? src[k] : !src[k]) continue;
        const nb = [i > 0 ? src[k - 1] : 0, i < nx - 1 ? src[k + 1] : 0, j > 0 ? src[k - nx] : 0, j < nz - 1 ? src[k + nx] : 0];
        if (grow ? nb.some((v) => v) : nb.some((v) => !v)) out[k] = grow ? 1 : 0;
      }
    return out;
  };
  const covD = morph(cov, true);
  let inn = inside;
  for (let k = 0; k < Math.round(1.5 / cell); k++) inn = morph(inn, false);
  const free = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      free[k] = inn[k] && !covD[k] && !(exclude && pointInRingXZ(X(i), Z(j), exclude)) ? 1 : 0;
    }
  // components ≥ 6 m²
  const comp = new Int32Array(nx * nz).fill(-1);
  const minCells = Math.ceil(6 / (cell * cell));
  const keep = new Uint8Array(nx * nz);
  for (let k0 = 0; k0 < free.length; k0++) {
    if (!free[k0] || comp[k0] >= 0) continue;
    const stack = [k0];
    const members: number[] = [];
    comp[k0] = k0;
    while (stack.length) {
      const k = stack.pop()!;
      members.push(k);
      const i = k % nx;
      for (const q of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, k - nx, k + nx]) {
        if (q < 0 || q >= free.length || !free[q] || comp[q] >= 0) continue;
        comp[q] = k0;
        stack.push(q);
      }
    }
    if (members.length >= minCells) for (const k of members) keep[k] = 1;
  }
  // greedy rectangles: identical row runs stacked into one rectangle
  const rects: Rect[] = [];
  let open = new Map<string, Rect>();
  for (let j = 0; j < nz; j++) {
    const next = new Map<string, Rect>();
    let i = 0;
    while (i < nx) {
      if (!keep[j * nx + i]) {
        i++;
        continue;
      }
      let e = i;
      while (e + 1 < nx && keep[j * nx + e + 1]) e++;
      const key = `${i}:${e}`;
      const prev = open.get(key);
      const r = prev ?? { x0: bb.minX + i * cell, x1: bb.minX + (e + 1) * cell, z0: bb.minZ + j * cell, z1: 0 };
      r.z1 = bb.minZ + (j + 1) * cell;
      next.set(key, r);
      if (prev) open.delete(key);
      i = e + 1;
    }
    rects.push(...Array.from(open.values()));
    open = next;
  }
  rects.push(...Array.from(open.values()));
  return rects;
}

/* -------------------------------- plate -------------------------------- */

export interface OwnTowerArgs {
  placement: UnitPlacement;
  geo: UnitGeometry;
  /** typical floor of the unit (1 = first above the podium) */
  floor: number;
  floorY: number;
  floorsTypical: number;
  /** wing height above its base (m) */
  heightM: number;
  /** the wing's traced roof outline, site 3-D (X, Z) */
  outlineSite: XZ[];
}

export interface OwnTower {
  /** below the unit + its own floor (opaque, casts shadows) — unit frame */
  lower: Soup;
  /** above the unit (ghosted in the dollhouse) — unit frame */
  upper: Soup;
  /** the selected unit's envelope + gap, unit frame (for clipping the neighbouring wings too) */
  clip: XZ[];
  neighbours: number;
  mode: 'flats' | 'outline';
  coreM2: number;
}

export function buildOwnTower(a: OwnTowerArgs): OwnTower {
  const { placement: sel, geo, floor, floorY, floorsTypical, heightM } = a;
  const toSel = siteToUnit(sel);
  const outline = a.outlineSite.map(toSel);
  const hull = geoHull(geo);
  const clip = growConvex(hull, NEIGHBOUR_GAP_M);
  const hullArea = Math.abs(ringAreaXZ(hull));

  // neighbours from their own placements (same wing, flats 1…12)
  const flats: { geo: UnitGeometry; T: Tf }[] = [];
  for (let k = 1; k <= 12; k++) {
    const fp = flatPlacementOf(sel.wing, k);
    if (!fp) continue;
    const g = geoFor(fp.typeCode, !!fp.mirrored);
    if (!g) continue;
    const T = neighbourToSel(fp, sel);
    // skip the selected flat itself (same slot: hulls overlap by more than half)
    const h = geoHull(g, T);
    const ov = Math.abs(ringAreaXZ(intersectConvex(h, hull)));
    if (ov > 0.5 * Math.min(hullArea, Math.abs(ringAreaXZ(h)))) continue;
    flats.push({ geo: g, T });
  }

  const full = new Soup(); // one floor incl. this flat (for the floors above / below)
  const same = new Soup(); // this floor: neighbours clipped, no own flat
  let coreM2 = 0;
  if (flats.length) {
    const fp: Footprint = { covered: [] };
    for (const f of flats) {
      flatMass(full, f.geo, f.T, null, fp);
      flatMass(same, f.geo, f.T, clip);
    }
    flatMass(full, geo, (p) => p, null, fp);
    const box = (s: Soup, r: Rect) =>
      prismSoup(s, [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]], 0, HT, C.core, { bottom: true });
    for (const r of coreRects(outline, fp.covered, null)) box(full, r);
    // cells are kept by their centre: grow the exclusion by ~ half a cell diagonal so no rectangle reaches into the gap
    for (const r of coreRects(outline, fp.covered, growConvex(clip, 0.4))) {
      box(same, r);
      coreM2 += (r.x1 - r.x0) * (r.z1 - r.z0);
    }
  } else {
    prismSoup(full, outline, 0, HT, C.room, { facade: true, roof: C.roof, bottom: true });
    for (const pc of subtractConvex(outline, clip)) {
      walls(same, pc.ring, 0, HT, C.room, { facade: true, wall: pc.wall });
      cap(same, pc.ring, [], HT, C.roof);
    }
  }

  const nb = Math.max(0, Math.min(FLOORS_BELOW, floor - 1));
  const na = Math.max(0, Math.min(FLOORS_ABOVE, floorsTypical - floor));
  const lower = new Soup();
  // wing outline from the ground (y = −floorY in the unit frame) to the plate copies
  const lowTop = nb ? -nb * H : -SLAB_M;
  if (lowTop > -floorY + 0.01) prismSoup(lower, outline, -floorY, lowTop, C.room, { facade: true, roof: C.roof });
  for (let k = 1; k <= nb; k++) lower.append(full, -k * H);
  lower.append(same);

  const upper = new Soup();
  for (let k = 1; k <= na; k++) upper.append(full, k * H);
  const top = heightM - floorY; // roof, unit frame
  const upBase = (na + 1) * H;
  if (top - upBase > 0.05) {
    walls(upper, outline, upBase, top, C.room, { facade: true });
    cap(upper, outline, [], top, C.roof);
    cap(upper, outline, [], upBase, C.slab, { down: true });
  } else if (na === 0) {
    // top floor: a roof slab over it
    cap(upper, outline, [], H, C.roof);
    cap(upper, outline, [], H - SLAB_M, C.slab, { down: true });
  }
  return { lower, upper, clip, neighbours: flats.length, mode: flats.length ? 'flats' : 'outline', coreM2 };
}
