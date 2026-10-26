import { MASTERPLAN_TRACE } from '@/data/sobha/masterplanTraceLoader';
import { ROADS, STADIUM } from '@/lib/unit/siteLayout';
import { Soup, cap, prismSoup, rgbOf, ribbon, type HeightFn, type XZ } from './geom';

/**
 * ILLUSTRATIVE amenity props for the site model (site 3-D: X = east, Z = −north, y up, terrain via hAt).
 *
 * The master plan prints these amenities as legend letters only — no outlines, no elevations — so
 * every shape here is a standard-dimension stand-in placed at the printed marker (status: assumed):
 *   1 / 3   entrance gateway: a wave canopy over the drive + the green roundabout
 *   AA      tennis courts (36.6 × 18.3 m run-off, 23.77 × 10.97 m lines)
 *   Y       pickle-ball courts (18 × 9 m, 13.41 × 6.1 m lines)
 *   AB      multi-sport court (32 × 19 m, 28 × 15 m basketball lines)
 *   L       amphitheatre: four stepped arc tiers around a stage, opening toward the stadium
 *   T       skating rink: 30 × 16 m oval
 *   AC Z AD fitness lawn, play lawn (hedge ring), pet park (low fence)
 * Courts carry a 3–4 m fence of posts and rail; tennis and multi-sport get four 12 m floodlight masts.
 * Courts align with the nearest traced road; nothing here is part of any sale.
 */

const C = {
  canopy: rgbOf('#ece5d8'),
  canopyEdge: rgbOf('#b9b2a6'),
  column: rgbOf('#8d8f93'),
  kerb: rgbOf('#d3cdc0'),
  lawn: rgbOf('#5f8f45'),
  feature: rgbOf('#c9a96e'),
  tennis: rgbOf('#3b6f9a'),
  pickle: rgbOf('#3f8a7a'),
  multi: rgbOf('#8a5a3f'),
  runoff: rgbOf('#5d7f62'),
  line: rgbOf('#f4f1ea'),
  tier: rgbOf('#cfc8bb'),
  stage: rgbOf('#b9b2a6'),
  rink: rgbOf('#c9cfd6'),
  post: rgbOf('#3a3d42'),
  mast: rgbOf('#9aa0a8'),
  lamp: rgbOf('#fff4d6'),
  hedge: rgbOf('#3f6b36'),
  basin: rgbOf('#2f3338'),
  terracotta: rgbOf('#b86a4b'),
  cream: rgbOf('#e6dfd0'),
  gravel: rgbOf('#e8e4dc'),
  timber: rgbOf('#9a6b45'),
  boulder: rgbOf('#8e8a82'),
  rubber: rgbOf('#e07a3a'),
  rubberBlue: rgbOf('#3b6f9a'),
  cabana: rgbOf('#f1ece2'),
  bronze: rgbOf('#5a3d2b'),
};

const Y = 0.08; // flat props sit just above the paving layer
const TAU = Math.PI * 2;

const xz = (p: { x: number; y: number }): XZ => [p.x, -p.y];
function marker(code: string): { at: XZ; all: XZ[] } | null {
  const a = MASTERPLAN_TRACE.amenities.find((m) => m.code === code);
  if (!a) return null;
  return { at: xz(a.pos), all: (a.allPos ?? [a.pos]).map(xz) };
}

/** Rectangle w (along u) × d (along v) about c, rotated by yaw (u axis = (cos, sin) in XZ). */
function rect(c: XZ, w: number, d: number, yaw: number, du = 0, dv = 0): XZ[] {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const P = (u: number, v: number): XZ => [c[0] + (u + du) * cs - (v + dv) * sn, c[1] + (u + du) * sn + (v + dv) * cs];
  return [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
}
function ellipse(c: XZ, rx: number, rz: number, yaw: number, n = 48): XZ[] {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU;
    const u = Math.cos(t) * rx, v = Math.sin(t) * rz;
    return [c[0] + u * cs - v * sn, c[1] + u * sn + v * cs] as XZ;
  });
}
/** Annular sector r0..r1 between angles a0..a1 (radians, XZ plane), as one ring. */
function sector(c: XZ, r0: number, r1: number, a0: number, a1: number, n = 28): XZ[] {
  const outer = Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [c[0] + Math.cos(a) * r1, c[1] + Math.sin(a) * r1] as XZ; });
  const inner = Array.from({ length: n + 1 }, (_, i) => { const a = a1 - ((a1 - a0) * i) / n; return [c[0] + Math.cos(a) * r0, c[1] + Math.sin(a) * r0] as XZ; });
  return [...outer, ...inner];
}

/** Nearest traced road segment to c: closest point on it and its direction (XZ yaw), so props sit square to the street. */
function nearestRoad(c: XZ): { at: XZ; yaw: number; d: number } {
  let best = { at: c, yaw: 0, d: Infinity };
  for (const r of ROADS) {
    const pts = r.line.map(([x, y]) => [x, -y] as XZ);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dz) / l2));
      const at: XZ = [a[0] + dx * t, a[1] + dz * t];
      const d = Math.hypot(c[0] - at[0], c[1] - at[1]);
      if (d < best.d) best = { at, yaw: Math.atan2(dz, dx), d };
    }
  }
  return best;
}
const roadYaw = (c: XZ) => nearestRoad(c).yaw;

/**
 * Where the entrance canopy stands: legend 1 is printed beside the approach drive, so the canopy is
 * snapped onto the nearest driveway centre-line and runs along it. Site 3-D (X east, Z = −north).
 */
export function gatePose(): { at: XZ; yaw: number } | null {
  const m = marker('1');
  if (!m) return null;
  const r = nearestRoad(m.at);
  return r.d < 40 ? { at: r.at, yaw: r.yaw } : { at: m.at, yaw: roadYaw(m.at) };
}

/** Court lines: rectangle outline + extra segments in court-local (u, v) metres. */
function courtLines(s: Soup, c: XZ, yaw: number, w: number, d: number, extra: [number, number, number, number][], hAt?: HeightFn) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const P = (u: number, v: number): XZ => [c[0] + u * cs - v * sn, c[1] + u * sn + v * cs];
  const y = Y + 0.015;
  ribbon(s, [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)], 0.1, y, C.line, hAt, true);
  for (const [u0, v0, u1, v1] of extra) ribbon(s, [P(u0, v0), P(u1, v1)], 0.1, y, C.line, hAt);
}

/** Chain-link fence as posts every 3 m with a top rail, plus four floodlight masts at the corners. */
function fence(props: Soup, c: XZ, w: number, d: number, yaw: number, h: number, masts: boolean, hAt?: HeightFn) {
  const ring = rect(c, w, d, yaw);
  const base = hAt ? hAt(c[0], c[1]) : 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.round(l / 3));
    for (let j = 0; j < k; j++) {
      const p: XZ = [a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k];
      prismSoup(props, rect(p, 0.08, 0.08, yaw), base - 0.3, base + h, C.post);
    }
    // top rail: a thin flat strip at fence height
    ribbon(props, [a, b], 0.06, base + h, C.post, undefined);
  }
  if (masts) for (const q of rect(c, w + 1.5, d + 1.5, yaw)) {
    prismSoup(props, rect(q, 0.25, 0.25, yaw), base - 0.3, base + 12, C.mast);
    prismSoup(props, rect(q, 1.2, 0.3, yaw), base + 11.4, base + 12, C.lamp);
  }
}

function courts(flat: Soup, props: Soup, hAt?: HeightFn) {
  for (const c of marker('AA')?.all ?? []) {
    const yaw = roadYaw(c);
    cap(flat, rect(c, 36.6, 18.3, yaw), [], Y, C.tennis, { hAt });
    courtLines(flat, c, yaw, 23.77, 10.97, [[0, -10.97 / 2, 0, 10.97 / 2], [-6.4, -4.115, -6.4, 4.115], [6.4, -4.115, 6.4, 4.115], [-6.4, 0, 6.4, 0]], hAt);
    fence(props, c, 36.6, 18.3, yaw, 3.6, true, hAt);
  }
  for (const c of marker('Y')?.all ?? []) {
    const yaw = roadYaw(c);
    cap(flat, rect(c, 18, 9, yaw), [], Y, C.pickle, { hAt });
    courtLines(flat, c, yaw, 13.41, 6.1, [[0, -3.05, 0, 3.05], [-2.13, -3.05, -2.13, 3.05], [2.13, -3.05, 2.13, 3.05], [-6.7, 0, -2.13, 0], [2.13, 0, 6.7, 0]], hAt);
    fence(props, c, 18, 9, yaw, 3, false, hAt);
  }
  const ab = marker('AB');
  if (ab) {
    const yaw = roadYaw(ab.at);
    cap(flat, rect(ab.at, 32, 19, yaw), [], Y, C.multi, { hAt });
    courtLines(flat, ab.at, yaw, 28, 15, [[0, -7.5, 0, 7.5]], hAt);
    ribbon(flat, ellipse(ab.at, 1.8, 1.8, 0, 24), 0.1, Y + 0.015, C.line, hAt, true);
    fence(props, ab.at, 32, 19, yaw, 4, true, hAt);
  }
  // lawns with a low hedge ring: fitness lawn (AC), play lawn (Z), pet park (AD, fenced)
  for (const [code, r, fenced] of [['AC', 14, false], ['Z', 16, false], ['AD', 12, true]] as [string, number, boolean][]) {
    for (const c of marker(code)?.all ?? []) {
      cap(flat, ellipse(c, r, r * 0.75, roadYaw(c)), [], Y, C.lawn, { hAt });
      const base = hAt ? hAt(c[0], c[1]) : 0;
      const ring = ellipse(c, r, r * 0.75, roadYaw(c), 36);
      if (fenced) { for (const q of ring) prismSoup(props, rect(q, 0.08, 0.08, 0), base - 0.3, base + 1.2, C.post); ribbon(props, ring, 0.05, base + 1.2, C.post, undefined, true); }
      else prismSoup(props, ring, base - 0.3, base + 0.5, C.hedge, { hAt: undefined });
    }
  }
}

function amphitheatre(props: Soup, flat: Soup, hAt?: HeightFn) {
  const m = marker('L');
  if (!m) return;
  const c = m.at;
  const face = Math.atan2(STADIUM.z - c[1], STADIUM.x - c[0]); // tiers open toward the stadium lawn
  const base = hAt ? hAt(c[0], c[1]) : 0;
  const flatAt: HeightFn = () => base; // one level for the whole bowl
  prismSoup(props, ellipse(c, 6, 6, 0, 32), base - 0.2, base + 0.35, C.stage, { hAt: undefined });
  for (let i = 0; i < 4; i++) {
    const r0 = 8 + i * 3, r1 = r0 + 3;
    const ring = sector(c, r0, r1, face - (75 * Math.PI) / 180, face + (75 * Math.PI) / 180);
    prismSoup(props, ring, base - 0.2, base + 0.45 * (i + 1), C.tier);
  }
  cap(flat, ellipse(c, 21, 21, 0, 40), [], Y, C.lawn, { hAt: flatAt });
}

function gateway(props: Soup, flat: Soup, hAt?: HeightFn) {
  const pose = gatePose(), rb = marker('3');
  if (!pose) return;
  const g = pose.at;
  const yaw = pose.yaw; // along the drive
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const P = (u: number, v: number): XZ => [g[0] + u * cs - v * sn, g[1] + u * sn + v * cs]; // u along the drive, v across it
  const base = hAt ? hAt(g[0], g[1]) : 0;
  // wave canopy: 14 m along the drive × 30 m across, 7.5 m clear, ±1.4 m sine across the width, 0.45 m thick
  const D = 14, W = 30, nu = 4, nv = 30;
  const h = (v: number) => base + 7.5 + 1.4 * Math.sin((v / W) * TAU * 1.5);
  const V = (u: number, v: number, dy: number) => { const q = P(u, v); return [q[0], h(v) + dy, q[1]]; };
  const uv = [[0.5, 0.18], [0.5, 0.18], [0.5, 0.18]];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const u0 = -D / 2 + (D * i) / nu, u1 = -D / 2 + (D * (i + 1)) / nu;
      const v0 = -W / 2 + (W * j) / nv, v1 = -W / 2 + (W * (j + 1)) / nv;
      props.tri(V(u0, v0, 0.45), V(u1, v0, 0.45), V(u1, v1, 0.45), [0, 1, 0], C.canopy, uv);
      props.tri(V(u0, v0, 0.45), V(u1, v1, 0.45), V(u0, v1, 0.45), [0, 1, 0], C.canopy, uv);
      props.tri(V(u0, v0, 0), V(u1, v1, 0), V(u1, v0, 0), [0, -1, 0], C.canopyEdge, uv);
      props.tri(V(u0, v0, 0), V(u0, v1, 0), V(u1, v1, 0), [0, -1, 0], C.canopyEdge, uv);
      if (i === 0 || i === nu - 1) { // long edges
        const u = i === 0 ? u0 : u1;
        const n = [-sn * (i === 0 ? -1 : 1), 0, cs * (i === 0 ? -1 : 1)];
        props.tri(V(u, v0, 0), V(u, v1, 0), V(u, v1, 0.45), n, C.canopyEdge, uv);
        props.tri(V(u, v0, 0), V(u, v1, 0.45), V(u, v0, 0.45), n, C.canopyEdge, uv);
      }
    }
  }
  // six columns in two rows beside the carriageways (the drive itself stays clear)
  for (const u of [-5, 5]) for (const v of [-13, -8.5, 8.5, 13]) {
    const q = P(u, v);
    prismSoup(props, rect(q, 0.6, 0.6, yaw), base - 0.5, h(v), C.column);
  }
  // roundabout: lawn disc, kerb ring, a low central feature
  if (rb) {
    cap(flat, ellipse(rb.at, 10, 10, 0, 48), [], Y + 0.02, C.lawn, { hAt });
    cap(flat, ellipse(rb.at, 11.5, 11.5, 0, 48), [ellipse(rb.at, 10, 10, 0, 48)], Y + 0.01, C.kerb, { hAt });
    const rbBase = hAt ? hAt(rb.at[0], rb.at[1]) : 0;
    prismSoup(props, ellipse(rb.at, 3, 3, 0, 24), rbBase, rbBase + 1.2, C.feature);
  }
}

function rink(flat: Soup, hAt?: HeightFn) {
  const m = marker('T');
  if (!m) return;
  const yaw = roadYaw(m.at);
  cap(flat, ellipse(m.at, 16, 8.5, yaw), [], Y, C.kerb, { hAt });
  cap(flat, ellipse(m.at, 15, 7.5, yaw), [], Y + 0.01, C.rink, { hAt });
}

/** Little pergola / cabana: four posts and a flat roof slab. */
function cabana(props: Soup, c: XZ, w: number, d: number, yaw: number, h: number, base: number, roof: number[]) {
  for (const q of rect(c, w - 0.3, d - 0.3, yaw)) prismSoup(props, rect(q, 0.15, 0.15, yaw), base, base + h, C.column);
  prismSoup(props, rect(c, w, d, yaw), base + h, base + h + 0.18, roof);
}

/**
 * Amenities as the developer's render clips show them (clip-01 plaza, clip-02 lagoon, clip-04 reel, clip-06 zen):
 * OneWorld Plaza (A) radial paving around a dark basin (the lattice sphere is a wire mesh, see SiteCommunity);
 * Lagoon Cove (N) cream paving islands + boulders (cocoon pavilions in SiteCommunity); Zen Courtyard (R) white
 * gravel, mounds, timber decks, boulders; Play Park (S) coloured rubber surface + frames; Yoga Lawn (Q) timber
 * deck; Leisure / Kids' pool (F, G) deck with cabanas; Observation Deck (E) raised platform. All stand-ins.
 */
function renderedAmenities(props: Soup, flat: Soup, under: Soup, hAt?: HeightFn) {
  const at = (code: string) => marker(code)?.at ?? null;
  const base = (c: XZ) => (hAt ? hAt(c[0], c[1]) : 0);
  // OneWorld Plaza: concentric rings — cream paving, terracotta band, lawn ring, cream, dark basin, plinth
  const a = at('A');
  if (a) {
    const yaw = roadYaw(a);
    cap(under, ellipse(a, 26, 26, 0, 64), [], Y - 0.02, C.cream, { hAt });
    cap(flat, ellipse(a, 21, 21, 0, 64), [ellipse(a, 19, 19, 0, 64)], Y, C.terracotta, { hAt });
    cap(flat, ellipse(a, 16, 16, 0, 64), [ellipse(a, 13.5, 13.5, 0, 64)], Y, C.lawn, { hAt });
    cap(flat, ellipse(a, 8, 8, 0, 48), [], Y + 0.01, C.basin, { hAt });
    const b = base(a);
    prismSoup(props, ellipse(a, 8.2, 8.2, 0, 48), b - 0.2, b + 0.45, C.kerb);
    prismSoup(props, ellipse(a, 3, 3, 0, 32), b, b + 0.9, C.basin);
    // benches on the lawn ring, radial paving spokes
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * TAU;
      const q: XZ = [a[0] + Math.cos(ang) * 17.5, a[1] + Math.sin(ang) * 17.5];
      prismSoup(props, rect(q, 1.8, 0.5, ang + Math.PI / 2), b, b + 0.45, C.timber);
      ribbon(flat, [[a[0] + Math.cos(ang + 0.2) * 8.5, a[1] + Math.sin(ang + 0.2) * 8.5], [a[0] + Math.cos(ang + 0.2) * 25, a[1] + Math.sin(ang + 0.2) * 25]], 0.5, Y + 0.012, C.kerb, hAt);
    }
    void yaw;
  }
  // Lagoon Cove: cream paving islands beside the traced water, a few boulders
  const n = at('N');
  if (n) {
    const yaw = roadYaw(n);
    for (const [du, dv, r] of [[-9, 4, 5], [7, -5, 4], [0, 9, 3.2]] as [number, number, number][]) {
      const q = rect(n, 0, 0, yaw, du, dv)[0];
      cap(flat, ellipse(q, r, r * 0.8, yaw, 32), [], Y + 0.02, C.cream, { hAt });
    }
    for (const [du, dv] of [[-4, -7], [11, 3], [-12, 10]] as [number, number][]) {
      const q = rect(n, 0, 0, yaw, du, dv)[0];
      const b = base(q);
      prismSoup(props, ellipse(q, 0.9, 0.7, yaw, 10), b - 0.2, b + 0.7, C.boulder);
    }
  }
  // Zen Courtyard: white gravel bed, grass mounds, two timber decks, boulders
  const r = at('R');
  if (r) {
    const yaw = roadYaw(r);
    cap(flat, ellipse(r, 13, 9, yaw, 48), [], Y, C.gravel, { hAt });
    const b = base(r);
    for (const [du, dv, rr] of [[-3, 1, 3.2], [5, -2, 2.4], [2, 4, 1.8]] as [number, number, number][]) {
      const q = rect(r, 0, 0, yaw, du, dv)[0];
      prismSoup(props, ellipse(q, rr, rr * 0.8, yaw, 24), b, b + 0.35, C.lawn);
    }
    for (const [du, dv] of [[-8, -4], [7, 4]] as [number, number][]) prismSoup(props, rect(rect(r, 0, 0, yaw, du, dv)[0], 5, 3.6, yaw), b, b + 0.3, C.timber);
    for (const [du, dv] of [[-6, 3], [0, -4], [8, 0]] as [number, number][]) { const q = rect(r, 0, 0, yaw, du, dv)[0]; prismSoup(props, ellipse(q, 0.8, 0.6, yaw, 10), b - 0.2, b + 0.8, C.boulder); }
  }
  // Play Park: coloured rubber surface with a blue patch, a climbing frame and a slide tower
  const sP = at('S');
  if (sP) {
    const yaw = roadYaw(sP);
    cap(flat, ellipse(sP, 11, 8, yaw, 40), [], Y, C.rubber, { hAt });
    cap(flat, ellipse(rect(sP, 0, 0, yaw, 3, 1)[0], 4, 4, 0, 24), [], Y + 0.01, C.rubberBlue, { hAt });
    const b = base(sP);
    const f = rect(sP, 0, 0, yaw, -3, -1)[0];
    for (const q of rect(f, 3, 2.4, yaw)) prismSoup(props, rect(q, 0.12, 0.12, yaw), b, b + 2.6, C.rubberBlue);
    prismSoup(props, rect(f, 3.2, 2.6, yaw), b + 2.6, b + 2.75, C.rubber);
    prismSoup(props, rect(rect(sP, 0, 0, yaw, 4, -2)[0], 1.6, 1.6, yaw), b, b + 2.2, C.lamp);
  }
  // Yoga Lawn: timber deck on the lawn
  const q = at('Q');
  if (q) { const yaw = roadYaw(q); const b = base(q); prismSoup(props, rect(q, 12, 8, yaw), b, b + 0.3, C.timber); cap(flat, ellipse(q, 11, 9, yaw, 40), [], Y - 0.01, C.lawn, { hAt }); }
  // Leisure pool and kids' pool: cream deck under the traced water, a row of cabanas and loungers
  const f = at('F');
  if (f) {
    const yaw = roadYaw(f);
    cap(under, ellipse(f, 24, 16, yaw, 48), [], Y - 0.02, C.cream, { hAt });
    const b = base(f);
    for (const du of [-9, -3, 3, 9]) cabana(props, rect(f, 0, 0, yaw, du, -12)[0], 4, 3.2, yaw, 2.6, b, C.cabana);
    for (const du of [-10, -7, -4, -1, 2, 5, 8]) prismSoup(props, rect(rect(f, 0, 0, yaw, du, 11)[0], 0.7, 1.9, yaw), b, b + 0.4, C.cabana);
  }
  const gK = at('G');
  if (gK) cap(under, ellipse(gK, 11, 8, roadYaw(gK), 32), [], Y - 0.02, C.cream, { hAt });
  // Observation Deck: raised platform with posts
  const e = at('E');
  if (e) {
    const yaw = roadYaw(e);
    const b = base(e);
    prismSoup(props, rect(e, 10, 6, yaw), b, b + 1.2, C.kerb);
    for (const p2 of rect(e, 9.6, 5.6, yaw)) prismSoup(props, rect(p2, 0.08, 0.08, yaw), b + 1.2, b + 2.3, C.post);
    ribbon(props, rect(e, 9.6, 5.6, yaw), 0.06, b + 2.3, C.post, undefined, true);
  }
}

/** `props`: solids; `flat`: ground-level surfaces and markings over the paving; `under`: decks drawn beneath the traced water. */
export function buildAmenityProps(hAt?: HeightFn): { props: Soup; flat: Soup; under: Soup } {
  const props = new Soup();
  const flat = new Soup();
  const under = new Soup();
  gateway(props, flat, hAt);
  courts(flat, props, hAt);
  amphitheatre(props, flat, hAt);
  rink(flat, hAt);
  renderedAmenities(props, flat, under, hAt);
  return { props, flat, under };
}

/** Lattice pavilions seen in the renders, for SiteCommunity to draw as wire meshes (site 3-D XZ, metres). */
export function latticePavilions(): { at: XZ; r: number; ry: number; color: string }[] {
  const out: { at: XZ; r: number; ry: number; color: string }[] = [];
  const a = marker('A')?.at;
  if (a) out.push({ at: a, r: 4.2, ry: 4.2, color: '#9aa0a8' }); // plaza sphere pavilion on its plinth
  const n = marker('N')?.at;
  if (n) { const yaw = roadYaw(n); for (const [du, dv] of [[-9, 4], [7, -5]] as [number, number][]) out.push({ at: rect(n, 0, 0, yaw, du, dv)[0], r: 2.6, ry: 4.2, color: '#5a3d2b' }); } // lagoon cocoons
  return out;
}

/** Site-frame (x east, y north) discs that the props occupy, so traced trees are not planted through them. */
export function treeClearings(): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = [];
  const add = (code: string, r: number) => { const m = MASTERPLAN_TRACE.amenities.find((a) => a.code === code); for (const p of m?.allPos ?? (m ? [m.pos] : [])) out.push({ x: p.x, y: p.y, r }); };
  add('1', 19); add('3', 12); add('AA', 22); add('Y', 11); add('AB', 20); add('L', 20); add('T', 17); add('AC', 14); add('Z', 16); add('AD', 12);
  add('A', 9); add('R', 13); add('S', 11); add('Q', 9); add('F', 14); add('G', 8); add('E', 7);
  return out;
}
