/**
 * TRUE-SCALE site layout for the 3-D explorer (pure numbers — SSR-safe, no three.js).
 *
 * World frame: 1 unit = 1 m, x = east, z = −north (site-frame y = north → world z = −y).
 * Site frame & OSM data: src/data/siteFrame.ts.
 *
 * Two sources, chosen at load time (src/data/masterplanTraceLoader.ts):
 *  1. MASTER-PLAN TRACE (src/data/masterplanTraced.ts, when present): the master-plan raster
 *     registered to the site frame by a similarity fit on the 14 OSM wing outlines (its RMS is
 *     reported), plus traced wing rings, stadium field & track, One Club, One Emporium, water,
 *     plazas, greens and roads in site metres. All `estimated` (traced + placed by that fit).
 *  2. FALLBACK (older layout): texture plane & stadium / landmark / lagoon centres from the
 *     plan→site fit `fromPlan` (RMS 14.3 m), hand-sized stadium oval (stated 90 m field /
 *     350 m track), stated-area landmark boxes, illustrative road alignments.
 *
 * Wing footprints are always REAL outlines (never squares): traced master-plan rings when the
 * trace reports a good IoU against OSM, otherwise the OSM outlines (src/data/osmWingOutlines.ts).
 * Heights (3.0 m/floor, 4.5 m podium) and landmark tiering stay ILLUSTRATIVE.
 */
import { fromPlan, siteBoundary, SITE_BOUNDS } from '@/data/sobha/siteFrame';
import { OSM_WING_OUTLINES } from '@/data/sobha/osmWingOutlines';
import { MASTERPLAN_TRACE as TRACE } from '@/data/sobha/masterplanTraceLoader';
import type { MasterplanFeature } from '@/data/sobha/masterplanTypes';
import wings, { wingHeightM } from '@/data/sobha/wings';
import amenities from '@/data/sobha/amenities';
import type { SitePoint } from '@/data/sobha/types';

export type XZ = [number, number];
/** Site-frame point [x east, y north] in metres. */
export type P2 = [number, number];

/** Site point (x east, y north) → world [x, z]. */
export const toXZ = (p: SitePoint): XZ => [p.x, -p.y];

/* ------------------------------------------------------------------ */
/* Ring helpers (site frame)                                           */
/* ------------------------------------------------------------------ */

const sp = (p: SitePoint): P2 => [p.x, p.y];

/** Drop a repeated closing vertex. */
function open(r: P2[]): P2[] {
  if (r.length > 1) {
    const a = r[0];
    const b = r[r.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) return r.slice(0, -1);
  }
  return r;
}

/** Signed shoelace area (CCW > 0). */
export function ringArea(r: P2[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

/** Area centroid. */
export function ringCentroid(r: P2[]): P2 {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const k = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += k;
    cx += (r[j][0] + r[i][0]) * k;
    cy += (r[j][1] + r[i][1]) * k;
  }
  if (Math.abs(a) < 1e-9) return r[0];
  return [cx / (3 * a), cy / (3 * a)];
}

/** Counter-clockwise copy (THREE.Shape outer rings). */
export const ccw = (r: P2[]): P2[] => (ringArea(r) < 0 ? [...r].reverse() : r);

export function pointInRing(x: number, y: number, r: P2[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, ay] = r[i];
    const [bx, by] = r[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) c = !c;
  }
  return c;
}

/** Distance from a point to a polyline (closed when `closed`). */
export function distToPolyline(x: number, y: number, pts: P2[], closed: boolean): number {
  let d = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}

export function polylineLength(pts: P2[], closed: boolean): number {
  let L = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}

export function ringBounds(r: P2[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of r) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/** Uniform scale about a centre (illustrative tiering / setbacks). */
export const scaleRing = (r: P2[], c: P2, s: number): P2[] =>
  r.map(([x, y]) => [c[0] + (x - c[0]) * s, c[1] + (y - c[1]) * s]);

/** Offset a closed CCW ring by `d` m (outward > 0) with clamped mitres — for smooth ovals. */
export function offsetRing(r: P2[], d: number): P2[] {
  const n = r.length;
  return r.map((p, i) => {
    const a = r[(i + n - 1) % n];
    const b = r[(i + 1) % n];
    const n1 = norm([p[1] - a[1], -(p[0] - a[0])]);
    const n2 = norm([b[1] - p[1], -(b[0] - p[0])]);
    const m = norm([n1[0] + n2[0], n1[1] + n2[1]]);
    const k = Math.max(0.5, m[0] * n2[0] + m[1] * n2[1]);
    return [p[0] + (m[0] * d) / k, p[1] + (m[1] * d) / k];
  });
}
function norm([x, y]: P2): P2 {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/** Farthest hit of the ray c + t·(cos θ, sin θ) with ring r (t, metres), for oval resampling. */
function rayHit(r: P2[], c: P2, th: number): number {
  const dx = Math.cos(th);
  const dy = Math.sin(th);
  let best = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const ex = r[i][0] - r[j][0];
    const ey = r[i][1] - r[j][1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = r[j][0] - c[0];
    const wy = r[j][1] - c[1];
    const t = (wx * ey - wy * ex) / den;
    const u = (wx * dy - wy * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
  }
  return best;
}

/** Ring "between" inner and outer (fraction f) by radial interpolation about c (star-shaped rings). */
function radialLerp(inner: P2[], outer: P2[], c: P2, f: number, steps = 128): P2[] {
  return Array.from({ length: steps }, (_, k) => {
    const th = (k / steps) * Math.PI * 2;
    const ri = rayHit(inner, c, th);
    const ro = rayHit(outer, c, th);
    const rr = ri + (ro - ri) * f;
    return [c[0] + Math.cos(th) * rr, c[1] + Math.sin(th) * rr] as P2;
  });
}

const ellipseRing = (c: P2, rx: number, ry: number, steps = 96): P2[] =>
  Array.from({ length: steps }, (_, k) => {
    const th = (k / steps) * Math.PI * 2;
    return [c[0] + rx * Math.cos(th), c[1] + ry * Math.sin(th)] as P2;
  });

const rectRing = (c: P2, w: number, d: number): P2[] => [
  [c[0] - w / 2, c[1] - d / 2],
  [c[0] + w / 2, c[1] - d / 2],
  [c[0] + w / 2, c[1] + d / 2],
  [c[0] - w / 2, c[1] + d / 2],
];

const fRing = (f: MasterplanFeature): P2[] | null => (f.ring && f.ring.length >= 3 ? ccw(open(f.ring.map(sp))) : null);
const featuresOf = (kind: MasterplanFeature['kind']) => (TRACE ? TRACE.features.filter((f) => f.kind === kind) : []);
/** Largest polygon of a kind (by |area|), or null. */
function largest(kind: MasterplanFeature['kind']): { f: MasterplanFeature; ring: P2[] } | null {
  let best: { f: MasterplanFeature; ring: P2[] } | null = null;
  for (const f of featuresOf(kind)) {
    const ring = fRing(f);
    if (ring && (!best || Math.abs(ringArea(ring)) > Math.abs(ringArea(best.ring)))) best = { f, ring };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Site outline                                                        */
/* ------------------------------------------------------------------ */

const SITE_RING: P2[] = open(siteBoundary.ring.map(sp));

/** Point-in-polygon against the OSM site outline (site frame). */
export const insideSite = (x: number, y: number): boolean => pointInRing(x, y, SITE_RING);

/** Distance (m) from a site point to the outline. */
export const distToOutline = (x: number, y: number): number => distToPolyline(x, y, SITE_RING, true);

/** Centre of the site bounding box (world xz) and its half-extent. */
export const SITE_CENTER: XZ = [
  (SITE_BOUNDS.minX + SITE_BOUNDS.maxX) / 2,
  -(SITE_BOUNDS.minY + SITE_BOUNDS.maxY) / 2,
];
export const SITE_HALF = Math.max(SITE_BOUNDS.maxX - SITE_BOUNDS.minX, SITE_BOUNDS.maxY - SITE_BOUNDS.minY) / 2;
/** Site outline in world xz (camera framing). */
export const SITE_RING_XZ: XZ[] = SITE_RING.map(([x, y]) => [x, -y]);

/* ------------------------------------------------------------------ */
/* Master-plan texture plane                                           */
/* ------------------------------------------------------------------ */

/** Fallback: old 2400×2100-unit plane centred at plan (−225, −12), mapped through fromPlan. */
const PLAN_CENTRE = fromPlan([-225, -12]);
const PLAN_X = fromPlan([-224, -12]);
const PLAN_SCALE = Math.hypot(PLAN_X.x - PLAN_CENTRE.x, PLAN_X.y - PLAN_CENTRE.y);

/**
 * three.js rotation.y = θ turns east toward north (CCW seen from above, since z = −north),
 * i.e. it equals the CCW site-frame rotation → rotY = rotRad of the registration.
 * `crop` = texture repeat/offset (the fallback raster carries the legend in its left ~47 %).
 */
export const MASTERPLAN_PLANE: {
  pos: [number, number, number];
  size: [number, number];
  rotY: number;
  image: string;
  crop: { repeat: [number, number]; offset: [number, number] } | null;
  registered: boolean;
} = TRACE
  ? {
      pos: [TRACE.rasterPlane.centre.x, 0.02, -TRACE.rasterPlane.centre.y],
      size: TRACE.rasterPlane.sizeM,
      rotY: TRACE.rasterPlane.rotRad,
      image: TRACE.rasterPlane.image,
      crop: null,
      registered: true,
    }
  : {
      pos: [PLAN_CENTRE.x, 0.02, -PLAN_CENTRE.y],
      size: [2400 * PLAN_SCALE, 2100 * PLAN_SCALE],
      rotY: Math.atan2(PLAN_X.y - PLAN_CENTRE.y, PLAN_X.x - PLAN_CENTRE.x),
      image: '/media/masterplan/site-2.jpg',
      crop: { repeat: [0.48, 1], offset: [0.47, 0] },
      registered: false,
    };

/* ------------------------------------------------------------------ */
/* Towers — real wing outlines                                         */
/* ------------------------------------------------------------------ */

/**
 * Wing footprints follow the PLAN the explorer draws on the ground: the traced master-plan roofs
 * are used whenever the trace has all 14 rings and its registration is good (fit RMS ≤ 5 m).
 * Their IoU against OSM is REPORTED, not used as a gate — the trace shows the low values are
 * OSM/plan disagreements (Wing 7's OSM outline runs ~15 m past the drawn roof over the plan's
 * landscape; Wings 3–4 are drawn differently), so OSM shapes would stand on texture that is
 * not theirs. Without a trace (or with a poor fit) the OSM outlines are used.
 */
const TRACE_MAX_RMS_M = 5;
const traceWings = TRACE?.wings.filter((w) => w.ring.length >= 3) ?? [];
const ious = traceWings.map((w) => w.osmIoU ?? 0);
export const WING_OUTLINE_SOURCE: 'masterplan' | 'osm' =
  TRACE && traceWings.length === 14 && TRACE.fit.rmsM <= TRACE_MAX_RMS_M ? 'masterplan' : 'osm';
/** Mean IoU of the traced rings vs OSM (null without a trace). */
export const WING_TRACE_MEAN_IOU = ious.length ? ious.reduce((a, b) => a + b, 0) / ious.length : null;
/** Per-wing IoU of the traced ring vs OSM (for the info card). */
export const wingTraceIoU = (n: number): number | null => traceWings.find((w) => w.n === n)?.osmIoU ?? null;

/** Douglas–Peucker on a closed ring (split at the two mutually farthest vertices). */
export function simplifyRing(r: P2[], tol: number): P2[] {
  if (r.length < 8) return r;
  const segDist = (p: P2, a: P2, b: P2) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const dp = (pts: P2[]): P2[] => {
    let idx = -1;
    let dmax = tol;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = segDist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (idx < 0) return [pts[0], pts[pts.length - 1]];
    return [...dp(pts.slice(0, idx + 1)).slice(0, -1), ...dp(pts.slice(idx))];
  };
  let far = 0;
  let fd = 0;
  for (let i = 1; i < r.length; i++) {
    const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = dp(r.slice(0, far + 1));
  const b = dp([...r.slice(far), r[0]]);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
/** Traced roofs are pixel-crack contours (0.4 m px): DP at 0.6 m removes the staircase, keeps setbacks. */
const WING_SIMPLIFY_M = 0.6;

export interface TowerGeom {
  /** wing number */
  n: number;
  name: string;
  /** area centroid, world xz */
  x: number;
  z: number;
  /** CCW outline RELATIVE to the centroid, site metres (x east, y north) */
  local: P2[];
  /** CCW outline, absolute site metres */
  ring: P2[];
  areaM2: number;
  /** √area — characteristic size for crown details */
  sizeM: number;
  heightM: number;
  /** half-extent of the outline's bounding box around the centroid (m) */
  radius: number;
}

export const TOWERS: TowerGeom[] = wings.map((w) => {
  const n = Number(w.name.replace('Wing ', ''));
  const traced = WING_OUTLINE_SOURCE === 'masterplan' ? traceWings.find((t) => t.n === n) : undefined;
  const osm = OSM_WING_OUTLINES.find((o) => o.n === n);
  const ring = ccw(
    open(
      traced
        ? simplifyRing(open(traced.ring.map(sp)), WING_SIMPLIFY_M)
        : osm
          ? osm.ring
          : rectRing([w.sitePos.x, w.sitePos.y], w.footprintM, w.footprintM), // never hit: 14/14 OSM outlines exist
    ),
  );
  const [cx, cy] = ringCentroid(ring);
  const local = ring.map(([x, y]) => [x - cx, y - cy] as P2);
  const areaM2 = Math.abs(ringArea(ring));
  return {
    n,
    name: w.name,
    x: cx,
    z: -cy,
    local,
    ring,
    areaM2,
    sizeM: Math.sqrt(areaM2),
    heightM: wingHeightM(w),
    radius: Math.max(...local.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))),
  };
});

export const towerOf = (n: number) => TOWERS.find((t) => t.n === n);

/** Is world (x, z) within `margin` m of a tower footprint? (optionally skipping wing `skip`) */
export function inTower(x: number, z: number, margin = 0, skip?: number): TowerGeom | null {
  const y = -z;
  for (const t of TOWERS) {
    if (t.n === skip) continue;
    if (Math.abs(x - t.x) > t.radius + margin || Math.abs(z - t.z) > t.radius + margin) continue;
    if (pointInRing(x, y, t.ring) || (margin > 0 && distToPolyline(x, y, t.ring, true) < margin)) return t;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* World Stadium (stated: ~90 m dia field, 350 m running track)        */
/* ------------------------------------------------------------------ */

export interface StadiumGeom {
  /** field centroid, world xz */
  x: number;
  z: number;
  field: P2[];
  trackOuter: P2[];
  trackInner: P2[];
  /** lane lines between inner and outer edge */
  lanes: P2[][];
  /** equivalent-circle field diameter (m) and track centre-line length (m), as drawn */
  fieldDiaM: number;
  trackLenM: number;
  traced: boolean;
}

/** Running track among the 'track' features (the jog/cycle loop is a 'track' too): by name, else shortest. */
function runningTrack(): MasterplanFeature | undefined {
  const tracks = featuresOf('track');
  const key = (f: MasterplanFeature) => `${f.id} ${f.name}`;
  return (
    tracks.find((f) => /running/i.test(key(f))) ??
    [...tracks.filter((f) => !/jog|cycl|loop/i.test(key(f)))].sort((a, b) => (a.lengthM ?? 1e9) - (b.lengthM ?? 1e9))[0]
  );
}

/** Other traced paths (e.g. the 750 m jog/cycle loop, kind 'track' or 'other' with a centre-line). */
export const PATHS: { line: P2[]; w: number; closed: boolean; name: string; lengthM?: number }[] = TRACE
  ? [...featuresOf('track'), ...featuresOf('other').filter((f) => f.line)]
      .filter((f) => f !== runningTrack())
      .flatMap((f) => {
        const line = f.line ?? f.ring;
        if (!line || line.length < 2) return [];
        const raw = line.map(sp);
        const ends = Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]);
        return [{ line: open(raw), w: f.widthM ?? 3, closed: !f.line || ends < 1, name: f.name.split(' — ')[0], lengthM: f.lengthM }];
      })
  : [];

function buildStadium(): StadiumGeom {
  const fieldT = largest('stadium-field');
  const trackF = runningTrack();
  if (fieldT && trackF) {
    const c = ringCentroid(fieldT.ring);
    let outer: P2[] | null = null;
    let inner: P2[] | null = null;
    let centre: P2[] | null = null;
    const tr = fRing(trackF);
    if (tr && trackF.holes?.length) {
      outer = tr;
      inner = ccw(open(trackF.holes[0].map(sp)));
      centre = radialLerp(inner, outer, c, 0.5);
    } else if (trackF.line && trackF.line.length >= 3) {
      const w = trackF.widthM ?? 7;
      centre = ccw(open(trackF.line.map(sp)));
      outer = offsetRing(centre, w / 2);
      inner = offsetRing(centre, -w / 2);
    } else if (tr) {
      // polygon without a hole: its outer edge; the inner edge hugs the field (or −width)
      outer = tr;
      inner = pointInRing(c[0], c[1], tr) && Math.abs(ringArea(tr)) > Math.abs(ringArea(fieldT.ring))
        ? fieldT.ring
        : offsetRing(tr, -(trackF.widthM ?? 7));
      centre = radialLerp(inner, outer, c, 0.5);
    }
    if (outer && inner && centre) {
      const fieldArea = Math.abs(ringArea(fieldT.ring));
      return {
        x: c[0],
        z: -c[1],
        field: fieldT.ring,
        trackOuter: outer,
        trackInner: inner,
        lanes: [0.25, 0.5, 0.75].map((f) => radialLerp(inner!, outer!, c, f)),
        fieldDiaM: 2 * Math.sqrt(fieldArea / Math.PI),
        trackLenM: trackF.lengthM ?? polylineLength(centre, true),
        traced: true,
      };
    }
  }
  // Fallback: hand-sized oval at fromPlan(0, −28). Wings 12 (west) and 6 (east) leave ~106 m
  // between tower faces → oval elongated N–S; centre-line semi-axes 47 × 63.5 m → ≈ 350 m.
  const c0 = fromPlan([0, -28]);
  const c: P2 = [c0.x, c0.y];
  const inner = ellipseRing(c, 45, 61.5);
  const outer = ellipseRing(c, 49, 65.5);
  return {
    x: c[0],
    z: -c[1],
    field: ellipseRing(c, 45, 45, 64),
    trackOuter: outer,
    trackInner: inner,
    lanes: [0.25, 0.5, 0.75].map((f) => ellipseRing(c, 45 + 4 * f, 61.5 + 4 * f)),
    fieldDiaM: 90,
    trackLenM: polylineLength(ellipseRing(c, 47, 63.5, 256), true),
    traced: false,
  };
}
export const STADIUM = buildStadium();

/* ------------------------------------------------------------------ */
/* Landmarks: One Club, One Emporium                                   */
/* ------------------------------------------------------------------ */

export interface LandmarkGeom {
  /** footprint / parcel centroid, world xz */
  x: number;
  z: number;
  /** traced flat area as drawn on the plan (club CA-site parcel, emporium frontage) — absolute site m */
  parcel: P2[] | null;
  /** stepped massing tiers, largest first — absolute site metres (CCW); may be empty */
  tiers: P2[][];
  tierH: number;
  traced: boolean;
  /** area of the parcel (traced) or of the bottom tier (fallback), m² */
  areaM2: number;
}

function landmark(
  kind: 'club' | 'emporium',
  fallbackC: P2,
  fallbackTiers: [number, number][],
  tierH: number,
  traceScales: number[],
): LandmarkGeom {
  const t = largest(kind);
  if (t) {
    const c = ringCentroid(t.ring);
    return {
      x: c[0],
      z: -c[1],
      parcel: t.ring,
      tiers: traceScales.map((s) => scaleRing(t.ring, c, s)),
      tierH,
      traced: true,
      areaM2: Math.abs(ringArea(t.ring)),
    };
  }
  const [w0, d0] = fallbackTiers[0];
  return {
    x: fallbackC[0],
    z: -fallbackC[1],
    parcel: null,
    // upper tiers pushed 15 % of the inset toward the north (back of house)
    tiers: fallbackTiers.map(([w, d]) => rectRing([fallbackC[0], fallbackC[1] + (d0 - d) * 0.15], w, d)),
    tierH,
    traced: false,
    areaM2: w0 * d0,
  };
}

/**
 * One Club — traced: the master plan draws only the CA-site PARCEL (2.28 ac traced vs 2.4 ac
 * stated), not the club building → the parcel is drawn flat (estimated) and an ILLUSTRATIVE
 * stepped mass sits inside it (parcel scaled 0.62 / 0.54 / 0.46 about its centroid ≈ 3,550 m²
 * ground tier, 3 × 4.5 m). Fallback: estimate fromPlan(−756, 252) nudged to (−192, 97);
 * 1,20,000 sq ft (stated) → tiers 65×55 / 57×47 / 49×39 m.
 */
export const CLUB = landmark('club', [-192, 97], [[65, 55], [57, 47], [49, 39]], 4.5, [0.62, 0.54, 0.46]);

/**
 * One Emporium — traced: the plan prints only the label, entrance (8) and parking (9) on a paved
 * FRONTAGE strip (no building footprint; the 6,039 m² stated retail is presumably under the
 * podium deck) → the strip is drawn flat, NO mass. Fallback: estimate nudged to (131, −182),
 * 65,000 sq ft (stated) → 60×45 / 54×41 m, 2 × 5 m (illustrative).
 */
export const EMPORIUM = landmark('emporium', [131, -182], [[60, 45], [54, 41]], 5, []);

/** Other printed parcels (e.g. "FUTURE DEVELOPMENT"), drawn flat with their printed name. */
export const OTHER_PARCELS: { ring: P2[]; holes: P2[][]; name: string }[] = featuresOf('other').flatMap((f) => {
  const ring = f.line ? null : fRing(f);
  return ring ? [{ ring, holes: (f.holes ?? []).map((h) => open(h.map(sp))), name: f.name.split(' (')[0] }] : [];
});

/* ------------------------------------------------------------------ */
/* Flat areas: water, plazas, greens, podium decks                     */
/* ------------------------------------------------------------------ */

export interface FlatArea {
  ring: P2[];
  holes: P2[][];
  name: string;
}
const flat = (kind: MasterplanFeature['kind']): FlatArea[] =>
  featuresOf(kind).flatMap((f) => {
    const ring = fRing(f);
    return ring ? [{ ring, holes: (f.holes ?? []).map((h) => open(h.map(sp))), name: f.name }] : [];
  });

const LAGOON_P = amenities.find((a) => a.code === 'N')?.sitePos ?? { x: -89.8, y: -32.9 };
/** Water bodies (traced) or the illustrative Lagoon Cove ellipse at amenity N. */
export const WATER: FlatArea[] = TRACE
  ? flat('water')
  : [{ ring: ellipseRing(sp(LAGOON_P), 24, 16, 64), holes: [], name: 'Lagoon Cove' }];
export const PLAZAS: FlatArea[] = flat('plaza');
export const GREENS: FlatArea[] = flat('green');
export const PODIUM_DECKS: FlatArea[] = flat('podium');
/** Lagoon label anchor: amenity N (traced/estimated position), world xz. */
export const LAGOON_LABEL: XZ = toXZ(LAGOON_P);

/* ------------------------------------------------------------------ */
/* Roads                                                               */
/* ------------------------------------------------------------------ */

export interface Road {
  /** centre-line polyline, site metres */
  line: P2[];
  w: number;
  centreLine: boolean;
  closed: boolean;
  /** asphalt carriageway (dark) or paved internal driveway (light) */
  surface: 'asphalt' | 'paving';
  name?: string;
}

/**
 * Fallback alignments (illustrative; boulevard width 30 m stated): the boulevard runs 20 m
 * inside the OSM south-west edge then east along the south lobe past One Emporium; internal
 * 14 m roads: a north spur between Wings 9 and 8 to the stadium and the One Club drop-off spur.
 */
const FALLBACK_ROADS: Road[] = [
  { line: [[1.5, -240], [-203.1, 19.1]], w: 30, centreLine: true, closed: false, surface: 'asphalt', name: 'boulevard' },
  { line: [[-12, -240], [200, -240]], w: 30, centreLine: true, closed: false, surface: 'asphalt', name: 'boulevard' },
  { line: [[28, -225], [28, -45]], w: 14, centreLine: true, closed: false, surface: 'asphalt' },
  { line: [[CLUB.x, 5], [CLUB.x, -CLUB.z - 27.5 - 12]], w: 14, centreLine: false, closed: false, surface: 'asphalt' },
];

/** Traced road centre-lines at traced widths (default 7 m when the trace gives none). */
export const ROADS: Road[] = TRACE
  ? featuresOf('road').flatMap((f) =>
      f.line && f.line.length >= 2
        ? [
            {
              line: f.line.map(sp),
              w: f.widthM ?? 7,
              centreLine: /boulevard/i.test(f.id) && (f.widthM ?? 0) >= 12,
              closed: false,
              surface: /internal|paving|driveway/i.test(`${f.id} ${f.name}`) ? ('paving' as const) : ('asphalt' as const),
              name: f.name,
            },
          ]
        : [],
    )
  : FALLBACK_ROADS;
/** Traced road AREAS (polygons) when the trace gives roads as rings. */
export const ROAD_AREAS: FlatArea[] = TRACE
  ? featuresOf('road').flatMap((f) => {
      const ring = f.line ? null : fRing(f);
      return ring ? [{ ring, holes: (f.holes ?? []).map((h) => open(h.map(sp))), name: f.name }] : [];
    })
  : [];

/** Point at half the length of a polyline (site metres). */
function midOf(pts: P2[]): P2 {
  let left = polylineLength(pts, false) / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const L = Math.hypot(bx - ax, by - ay);
    if (L >= left) return [ax + ((bx - ax) * left) / (L || 1), ay + ((by - ay) * left) / (L || 1)];
    left -= L;
  }
  return pts[pts.length - 1];
}

/** The boulevard: the longest road named "boulevard" (traced: the west carriageway). */
const BOULEVARD = [...ROADS]
  .filter((r) => /boulevard/i.test(r.name ?? ''))
  .sort((a, b) => polylineLength(b.line, false) - polylineLength(a.line, false))[0];
/** Boulevard label anchor (world xz): its mid-point. */
export const BOULEVARD_LABEL: XZ = BOULEVARD ? (([x, y]) => [x, -y] as XZ)(midOf(BOULEVARD.line)) : [95, 240];
/** Drawn boulevard width (m) — fallback: stated 30 m; traced: carriageways + median as drawn. */
export const BOULEVARD_W = BOULEVARD?.w ?? 0;

/* ------------------------------------------------------------------ */
/* Planting (seeded LCG — deterministic, no Math.random)              */
/* ------------------------------------------------------------------ */

export function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const inAreas = (x: number, y: number, areas: FlatArea[], margin: number) =>
  areas.some((a) => pointInRing(x, y, a.ring) || distToPolyline(x, y, a.ring, true) < margin);

/** True when world (x, z) is taken by a tower, road, stadium, landmark, water, or off-site. */
export function isBlocked(x: number, z: number, margin = 3): boolean {
  const y = -z;
  if (!insideSite(x, y) || distToOutline(x, y) < margin) return true;
  if (inTower(x, z, margin + 4)) return true; // + 4 m: podium / drop-off apron
  if (pointInRing(x, y, STADIUM.trackOuter) || distToPolyline(x, y, STADIUM.trackOuter, true) < margin) return true;
  for (const r of ROADS) if (distToPolyline(x, y, r.line, r.closed) < r.w / 2 + margin) return true;
  if (inAreas(x, y, WATER, margin + 3) || inAreas(x, y, ROAD_AREAS, margin) || inAreas(x, y, PLAZAS, margin)) return true;
  for (const L of [CLUB, EMPORIUM]) {
    const t = L.tiers[0] ?? L.parcel;
    if (!t) continue;
    // + 12 m on the south side: entrance canopy / forecourt
    if (pointInRing(x, y, t) || distToPolyline(x, y, t, true) < margin || pointInRing(x, y + 12, t)) return true;
  }
  return false;
}

export type TreeKind = 'palm' | 'broad' | 'conifer';
export interface TreeInst {
  x: number;
  z: number;
  s: number;
  rot: number;
}

export interface Grove {
  x: number;
  z: number;
  r: number;
  n: number;
  mix: [number, number, number]; // weights: palm, broad, conifer
  island?: number; // grass-island radius (omit for none)
}

/** Grove centres in SITE frame → world (illustrative planting). */
const grove = (x: number, y: number, r: number, n: number, mix: Grove['mix'], island?: number): Grove => ({
  x,
  z: -y,
  r,
  n,
  mix,
  island,
});

export const GROVES: Grove[] = [
  grove(LAGOON_P.x, LAGOON_P.y, 40, 12, [0.7, 0.3, 0]), // Lagoon Cove edge (palms)
  grove(CLUB.x, -CLUB.z, 58, 14, [0.2, 0.5, 0.3]), // One Club garden
  grove(205, -195, 45, 12, [0.5, 0.5, 0], 30), // south lobe east of One Emporium
  grove(-165, -25, 35, 10, [0, 0.4, 0.6], 22), // west greens (between boulevard and Wings 12–14)
  grove(-10, 165, 32, 10, [0.2, 0.6, 0.2], 18), // north courtyard (Wings 1–4)
  grove(0, 95, 22, 6, [0.3, 0.7, 0]), // courtyard north of the stadium
  grove(40, -320, 35, 12, [0.3, 0.5, 0.2], 24), // south tail
  grove(265, -175, 40, 12, [0.2, 0.6, 0.2], 26), // east lobe
  grove(-125, 275, 42, 12, [0, 0.5, 0.5], 28), // north-west lobe
  grove(-280, 95, 30, 8, [0.2, 0.6, 0.2]), // western tip
].map((g) =>
  // with traced features, drop grass islands that would sit on water / roads / plazas
  TRACE && g.island != null && isBlocked(g.x, g.z, g.island * 0.5) ? { ...g, island: undefined } : g,
);

/** Street trees every `step` m along both verges of each road. */
function streetTrees(rnd: () => number, out: TreeInst[]) {
  for (const r of ROADS) {
    const pts = r.closed ? [...r.line, r.line[0]] : r.line;
    const step = r.w >= 30 ? 16 : 20;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < step) continue;
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      for (let s = step / 2; s < len; s += step) {
        for (const side of [-1, 1]) {
          const off = r.w / 2 + 6;
          const x = x1 + ux * s + uy * off * side;
          const y = y1 + uy * s - ux * off * side;
          const sc = 0.85 + rnd() * 0.3;
          const rot = rnd() * Math.PI * 2;
          if (!isBlocked(x, -y, 2)) out.push({ x, z: -y, s: sc, rot });
        }
      }
    }
  }
}

export function buildTrees(): Record<TreeKind, TreeInst[]> {
  const rnd = lcg(20261020);
  const out: Record<TreeKind, TreeInst[]> = { palm: [], broad: [], conifer: [] };
  for (const g of GROVES) {
    let placed = 0;
    for (let attempt = 0; attempt < g.n * 40 && placed < g.n; attempt++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * g.r;
      const x = g.x + Math.cos(a) * rr;
      const z = g.z + Math.sin(a) * rr;
      const pick = rnd();
      const s = 0.8 + rnd() * 0.45;
      const rot = rnd() * Math.PI * 2;
      if (isBlocked(x, z)) continue;
      const kind: TreeKind = pick < g.mix[0] ? 'palm' : pick < g.mix[0] + g.mix[1] ? 'broad' : 'conifer';
      out[kind].push({ x, z, s, rot });
      placed++;
    }
  }
  streetTrees(rnd, out.broad);
  return out;
}

/* ------------------------------------------------------------------ */
/* Named points used by presets / walk mode                            */
/* ------------------------------------------------------------------ */

const PLAZA_P = amenities.find((a) => a.code === 'A')?.sitePos ?? { x: -135.8, y: 49.4 };
/** OneWorld Plaza (amenity A), world xz. */
export const PLAZA: XZ = toXZ(PLAZA_P);
/** Wing 1 footprint centroid, world xz. */
const W1 = towerOf(1)!;
export const WING1: XZ = [W1.x, W1.z];
