import * as THREE from 'three';
import { siteBoundary } from '@/data/sobha/siteFrame';
import { PODIUM_M } from '@/data/sobha/traced/placement';
import { MASTERPLAN_TRACE } from '@/data/sobha/masterplanTraceLoader';
import { CLUB, EMPORIUM, PATHS, PLAZAS, ROADS, ROAD_AREAS, STADIUM, TOWERS, WATER, type P2 } from '@/lib/unit/siteLayout';
import {
  Soup,
  cap,
  centroidXZ,
  densify,
  distToRing,
  pointInRingXZ,
  ribbon,
  rgbOf,
  ringAreaXZ,
  subtractConvex,
  walls,
  type HeightFn,
  type XZ,
} from './geom';

/**
 * SITE-FRAME pieces of the Community layer (site 3-D: X = east, Z = −north; ground y = 0 at the
 * selected tower's base, terrain via hAt). All outlines come from the master-plan trace through the
 * explorer's siteLayout.ts (the same source as the explorer and the per-flat placements).
 */

const xz = ([x, y]: P2): XZ => [x, -y];
const xzRing = (r: P2[]): XZ[] => r.map(xz);

const C = {
  facade: rgbOf('#ffffff'),
  roof: rgbOf('#cfc8bb'),
  club: rgbOf('#f6e7cf'),
  clubRoof: rgbOf('#b9b2a6'),
  wall: rgbOf('#b8ae9b'),
  asphalt: rgbOf('#55585d'),
  paving: rgbOf('#d3cdc0'),
  plaza: rgbOf('#e0d8c6'),
  track: rgbOf('#b5644c'),
  lane: rgbOf('#efe6dc'),
  jog: rgbOf('#cf7f73'),
  water: rgbOf('#ffffff'),
};

/** Wing outlines (site 3-D) by wing number — traced master-plan roofs (OSM only without a trace). */
export function wingOutlineSite(n: number): { ring: XZ[]; heightM: number; centre: XZ } | null {
  const t = TOWERS.find((w) => w.n === n);
  return t ? { ring: xzRing(t.ring), heightM: t.heightM, centre: [t.x, t.z] } : null;
}

/**
 * The 13 other wings (facade bands, roof caps), the illustrative One Club mass and the low perimeter
 * wall — one soup (one draw call). Where a neighbouring JOINED wing comes within the selected unit's
 * envelope + gap (`clip`, site 3-D) its storey at the unit's floor is clipped like the same-floor flats.
 */
export function buildSiteMassing(a: { ownWing: number; floorY: number; clip: XZ[] | null; hAt?: HeightFn; /** false = club and wall only (the site explorer draws its own towers) */ wings?: boolean }): Soup {
  const s = new Soup();
  for (const t of a.wings === false ? [] : TOWERS) {
    if (t.n === a.ownWing) continue;
    const ring = xzRing(t.ring);
    const base = a.hAt ? a.hAt(t.x, t.z) : 0;
    const top = base + t.heightM;
    const vBase = -(base + PODIUM_M);
    const pieces = a.clip ? subtractConvex(ring, a.clip) : null;
    const whole = !pieces || (pieces.length === 1 && pieces[0].ring === ring);
    const lo = a.floorY - 0.2;
    const hi = a.floorY + 3;
    if (whole || lo <= base || hi >= top) {
      walls(s, ring, base, top, C.facade, { facade: true, vBase });
    } else {
      walls(s, ring, base, lo, C.facade, { facade: true, vBase });
      cap(s, ring, [], lo, C.roof);
      for (const pc of pieces!) walls(s, pc.ring, lo, hi, C.facade, { facade: true, vBase, wall: pc.wall });
      walls(s, ring, hi, top, C.facade, { facade: true, vBase });
      cap(s, ring, [], hi, C.roof, { down: true });
    }
    cap(s, ring, [], top, C.roof);
  }

  // One Club — ILLUSTRATIVE stepped mass inside the traced CA-site parcel (the plan draws no building)
  if (CLUB.tiers.length) {
    const base = a.hAt ? a.hAt(CLUB.x, CLUB.z) : 0;
    CLUB.tiers.forEach((tier, i) => {
      const r = xzRing(tier);
      const y0 = base + i * CLUB.tierH;
      const y1 = y0 + CLUB.tierH;
      walls(s, r, i ? y0 : base - 1, y1, C.club, { facade: true, vBase: -base });
      cap(s, r, [], y1, C.clubRoof);
    });
  }

  // perimeter wall along the OSM site outline — ILLUSTRATIVE (1.2 m, both faces, follows the terrain)
  const ring = densify(siteBoundary.ring.slice(0, -1).map((p) => [p.x, -p.y] as XZ), 12);
  walls(s, ring, -0.3, 1.2, C.wall, { hAt: a.hAt });
  walls(s, ring, -0.3, 1.2, C.wall, { hAt: a.hAt, inward: true });
  return s;
}

/** Flat ground features (painter-ordered, no depth writes): paving + track + jog loop, field, water. */
export function buildSiteGround(hAt?: HeightFn): { paving: Soup; field: Soup; water: Soup } {
  const Y = 0.06;
  const paving = new Soup();
  for (const r of ROADS) ribbon(paving, r.line.map(xz), r.w, Y, r.surface === 'asphalt' ? C.asphalt : C.paving, hAt, r.closed);
  for (const a of ROAD_AREAS) cap(paving, xzRing(a.ring), a.holes.map(xzRing), Y, C.asphalt, { hAt });
  if (EMPORIUM.parcel) cap(paving, xzRing(EMPORIUM.parcel), [], Y, C.paving, { hAt });
  for (const p of PLAZAS) cap(paving, xzRing(p.ring), p.holes.map(xzRing), Y, C.plaza, { hAt });
  cap(paving, xzRing(STADIUM.trackOuter), [xzRing(STADIUM.trackInner)], Y, C.track, { hAt });
  for (const l of STADIUM.lanes) ribbon(paving, l.map(xz), 0.12, Y, C.lane, hAt, true);
  for (const p of PATHS) ribbon(paving, p.line.map(xz), p.w, Y, C.jog, hAt, p.closed);

  // cricket / celebration field: mowing stripes 6 m wide at ~35° (as illustrated); no pitch strip is drawn on the plan
  const field = new Soup();
  const th = (35 * Math.PI) / 180;
  const ct = Math.cos(th);
  const st = Math.sin(th);
  cap(field, xzRing(STADIUM.field), [], Y, [1, 1, 1], { hAt, uvAt: (x, z) => [(x * ct + z * st) / 12, 0.5] });

  const water = new Soup();
  for (const w of WATER) cap(water, xzRing(w.ring), w.holes.map(xzRing), Y + 0.02, C.water, { hAt });
  return { paving, field, water };
}

/* --------------------------- master-plan ground --------------------------- */

export interface PlanGround {
  geometry: THREE.BufferGeometry;
  /** alpha mask = the OSM site outline drawn into the raster frame */
  mask: HTMLCanvasElement;
  image: string;
  cells: number;
  /** metres per mask pixel */
  pxM: number;
}

/**
 * The registered master-plan raster draped on the terrain over the site: an indexed grid of 10 m
 * cells over the raster rectangle, keeping only cells on / near the site outline (the exact edge is
 * the alpha mask). uv = the registration's raster plane (north-up, rotRad).
 */
export function buildPlanGround(hAt?: HeightFn, cell = 10): PlanGround | null {
  const T = MASTERPLAN_TRACE;
  if (!T) return null;
  const { centre, sizeM, rotRad, image } = T.rasterPlane;
  const [w, h] = sizeM;
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  // raster-local (east / north along the image axes) → site (x, y north)
  const toSite = (u: number, v: number): P2 => [centre.x + c * u - s * v, centre.y + s * u + c * v];
  const site = siteBoundary.ring.slice(0, -1).map((p) => [p.x, p.y] as XZ);
  const nx = Math.ceil(w / cell);
  const ny = Math.ceil(h / cell);
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const lu = -w / 2 + (i * w) / nx;
      const lv = -h / 2 + (j * h) / ny;
      const [x, y] = toSite(lu, lv);
      pos.push(x, hAt ? hAt(x, -y) : 0, -y);
      uv.push(i / nx, j / ny);
      nor.push(0, 1, 0);
    }
  const idx: number[] = [];
  let cells = 0;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const [x, y] = toSite(-w / 2 + ((i + 0.5) * w) / nx, -h / 2 + ((j + 0.5) * h) / ny);
      if (!pointInRingXZ(x, y, site) && distToRing(x, y, site) > cell * 0.75) continue;
      const a = j * (nx + 1) + i;
      const b = a + nx + 1;
      idx.push(a, a + 1, b + 1, a, b + 1, b);
      cells++;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();

  // alpha mask: the site outline in raster pixels (canvas y = north at the top)
  const MW = 1024;
  const MH = Math.round((MW * h) / w);
  const mask = document.createElement('canvas');
  mask.width = MW;
  mask.height = MH;
  const ctx = mask.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, MW, MH);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  site.forEach(([x, y], k) => {
    const dx = x - centre.x;
    const dy = y - centre.y;
    const lu = c * dx + s * dy;
    const lv = -s * dx + c * dy;
    const px = (lu / w + 0.5) * MW;
    const py = (0.5 - lv / h) * MH;
    if (k) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
  return { geometry: g, mask, image, cells, pxM: w / MW };
}

/**
 * Refine the alpha mask with the plan image: the plan's flat page background (rgb 227 224 217, the
 * smask ground) is cut out where it forms a region touching the image border or larger than
 * ~1,000 m² — land inside the OSM outline that the plan does not draw (e.g. the south-east lobe
 * beyond the lake) then shows the outside ground instead of a beige void. Paving is a different
 * colour (e.g. the emporium frontage 214 208 196), so it stays.
 */
export function refineMask(
  mask: HTMLCanvasElement,
  image: CanvasImageSource,
  pxM: number,
  { bg = [227, 224, 217], tol = 9, minAreaM2 = 1000 }: { bg?: [number, number, number]; tol?: number; minAreaM2?: number } = {}
): void {
  const W = mask.width;
  const Hh = mask.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Hh;
  const g = c.getContext('2d', { willReadFrequently: true });
  const m = mask.getContext('2d', { willReadFrequently: true });
  if (!g || !m) return;
  g.drawImage(image, 0, 0, W, Hh);
  const px = g.getImageData(0, 0, W, Hh).data;
  const md = m.getImageData(0, 0, W, Hh);
  const isBg = new Uint8Array(W * Hh);
  for (let k = 0; k < W * Hh; k++)
    isBg[k] = Math.abs(px[k * 4] - bg[0]) <= tol && Math.abs(px[k * 4 + 1] - bg[1]) <= tol && Math.abs(px[k * 4 + 2] - bg[2]) <= tol ? 1 : 0;
  // connected background regions: cut out the ones touching the image border or larger than ~1,000 m²
  const minPx = Math.round(minAreaM2 / (pxM * pxM));
  const seen = new Uint8Array(W * Hh);
  const cut = new Uint8Array(W * Hh);
  const stack: number[] = [];
  for (let k0 = 0; k0 < W * Hh; k0++) {
    if (!isBg[k0] || seen[k0]) continue;
    const members: number[] = [];
    let border = false;
    seen[k0] = 1;
    stack.push(k0);
    while (stack.length) {
      const k = stack.pop()!;
      members.push(k);
      const i = k % W;
      if (i === 0 || i === W - 1 || k < W || k >= W * (Hh - 1)) border = true;
      for (const q of [i > 0 ? k - 1 : -1, i < W - 1 ? k + 1 : -1, k >= W ? k - W : -1, k < W * (Hh - 1) ? k + W : -1])
        if (q >= 0 && isBg[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
    }
    if (border || members.length >= minPx) for (const k of members) cut[k] = 1;
  }
  for (let k = 0; k < W * Hh; k++) if (cut[k]) md.data[k * 4] = md.data[k * 4 + 1] = md.data[k * 4 + 2] = 0;
  m.putImageData(md, 0, 0);
}

/** Label anchors (site 3-D) for the sparse amenity labels. */
export function labelAnchors(): { text: string; at: XZ; h: number }[] {
  const out: { text: string; at: XZ; h: number }[] = [];
  if (CLUB.tiers.length || CLUB.parcel) out.push({ text: 'One Club', at: [CLUB.x, CLUB.z], h: CLUB.tiers.length * CLUB.tierH + 7 });
  out.push({ text: 'World Stadium', at: [STADIUM.x, STADIUM.z], h: 9 });
  // Lagoon Cove: the largest traced water body named Lagoon, else amenity N
  const area = (r: P2[]) => Math.abs(ringAreaXZ(xzRing(r)));
  const lagoon = WATER.filter((w) => /lagoon/i.test(w.name)).sort((p, q) => area(q.ring) - area(p.ring))[0];
  if (lagoon) out.push({ text: 'Lagoon Cove', at: centroidXZ(xzRing(lagoon.ring)), h: 7 });
  return out;
}
