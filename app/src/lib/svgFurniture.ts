import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { PlanRecord } from '@/data/types';

/**
 * Furniture and fixtures for the 3D plan, derived from the plan's OWN drawing.
 * No model-flat 3D exists in the collateral, so every item here is a box sized to the footprint the
 * plan draws (grey strokes: beds, wardrobes, sofas, dining, counters, sanitary ware). Footprints are
 * source geometry; heights are typical values per item kind and are flagged as assumed in the UI.
 */
export type FurnitureKind = 'bed' | 'wardrobe' | 'sofa' | 'table' | 'seat' | 'counter' | 'fixture' | 'basin' | 'misc';

export interface FurnitureItem {
  kind: FurnitureKind;
  room: string | null;
  /** centre in plan-local metres (x right, z toward viewer) */
  x: number;
  z: number;
  /** footprint in metres */
  w: number;
  d: number;
  /** assumed height in metres */
  h: number;
}

export const FURNITURE_HEIGHT_M: Record<FurnitureKind, number> = {
  bed: 0.55, wardrobe: 2.1, sofa: 0.8, table: 0.75, seat: 0.45, counter: 0.9, fixture: 0.42, basin: 0.85, misc: 0.5,
};

export const FURNITURE_COLOR: Record<FurnitureKind, string> = {
  bed: '#b7a58a', wardrobe: '#8a6f4e', sofa: '#7d8794', table: '#9c7b58', seat: '#8e8b84', counter: '#5c6066', fixture: '#e6e8ea', basin: '#dfe3e6', misc: '#a09a90',
};

type Box = { minX: number; minY: number; maxX: number; maxY: number };

const cache = new Map<string, Promise<FurnitureItem[]>>();

export function loadFurniture(plan: PlanRecord, mPerUnit: number): Promise<FurnitureItem[]> {
  const key = `${plan.svg}@${mPerUnit}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(plan.svg)
      .then((r) => { if (!r.ok) throw new Error(`Plan SVG ${plan.svg}: HTTP ${r.status}`); return r.text(); })
      .then((text) => extract(new SVGLoader().parse(text).paths, plan, mPerUnit));
    cache.set(key, p);
  }
  return p;
}

function extract(paths: ReturnType<SVGLoader['parse']>['paths'], plan: PlanRecord, m: number): FurnitureItem[] {
  const [bx0, by0, bx1, by1] = plan.wallBboxPt;
  const cx = (bx0 + bx1) / 2;
  const cy = (by0 + by1) / 2;
  const inside = (x: number, y: number) => x >= bx0 - 2 && y >= by0 - 2 && x <= bx1 + 2 && y <= by1 + 2;

  // 1. Explode every stroke into line segments. Furniture in these PDFs is a soup of 2-point paths
  //    (a bed = head line + foot line + two side lines + pillow strokes), so segments, not paths, are the unit.
  type Seg = { ax: number; ay: number; bx: number; by: number };
  const segs: Seg[] = [];
  const small: Box[] = []; // small white fills: pillows, basins, headboard blocks
  const maxSeg = 3.2 / m; // longer than any furniture edge → wall/dimension line
  for (const path of paths) {
    const style = (path.userData as { style?: { fill?: string } } | undefined)?.style;
    const fill = String(style?.fill ?? 'none').replace(/\s/g, '').toLowerCase();
    for (const sp of path.subPaths) {
      const pts = sp.getPoints(6);
      if (pts.length < 2) continue;
      if (fill !== 'none' && fill !== '') {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const v of pts) { if (v.x < minX) minX = v.x; if (v.y < minY) minY = v.y; if (v.x > maxX) maxX = v.x; if (v.y > maxY) maxY = v.y; }
        const w = (maxX - minX) * m, d = (maxY - minY) * m;
        if (inside(minX, minY) && inside(maxX, maxY) && Math.max(w, d) <= 1.2 && Math.min(w, d) >= 0.25) small.push({ minX, minY, maxX, maxY });
        continue;
      }
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 0.01 / m || len > maxSeg) continue;
        if (!inside(a.x, a.y) || !inside(b.x, b.y)) continue;
        segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      }
    }
  }

  // 2. Union segments that share an endpoint (2 cm tolerance) via a grid hash.
  const tol = 0.02 / m;
  const parent = segs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number) => `${Math.round(x / tol)},${Math.round(y / tol)}`;
  const visit = (x: number, y: number, i: number) => {
    const gx = Math.round(x / tol), gy = Math.round(y / tol);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const list = grid.get(`${gx + dx},${gy + dy}`);
      if (list) for (const j of list) parent[find(i)] = find(j);
    }
    const k = key(x, y);
    const l = grid.get(k);
    if (l) l.push(i); else grid.set(k, [i]);
  };
  segs.forEach((s, i) => { visit(s.ax, s.ay, i); visit(s.bx, s.by, i); });

  const clusters = new Map<number, { box: Box; pts: { x: number; y: number }[] }>();
  segs.forEach((s, i) => {
    const r = find(i);
    let c = clusters.get(r);
    if (!c) { c = { box: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }, pts: [] }; clusters.set(r, c); }
    for (const [x, y] of [[s.ax, s.ay], [s.bx, s.by]]) {
      c.pts.push({ x, y });
      if (x < c.box.minX) c.box.minX = x; if (y < c.box.minY) c.box.minY = y; if (x > c.box.maxX) c.box.maxX = x; if (y > c.box.maxY) c.box.maxY = y;
    }
  });

  // 3. Keep furniture-sized clusters; drop door swings and stray lines. Small fills ride along as their own items
  //    unless a stroke cluster already covers them.
  const boxes: Box[] = [];
  for (const c of clusters.values()) {
    const w = (c.box.maxX - c.box.minX) * m, d = (c.box.maxY - c.box.minY) * m;
    if (Math.min(w, d) < 0.28 || Math.max(w, d) > 3.5) continue;
    if (isDoorSwing(c.pts, c.box)) continue;
    boxes.push(c.box);
  }
  for (const b of small) {
    const covered = boxes.some((o) => b.minX >= o.minX - tol && b.minY >= o.minY - tol && b.maxX <= o.maxX + tol && b.maxY <= o.maxY + tol);
    if (!covered) boxes.push(b);
  }

  // 4. Nested outlines (bed frame + mattress, pillows inside a bed) → keep the outer box only.
  const contains = (o: Box, b: Box) => b.minX >= o.minX - tol && b.minY >= o.minY - tol && b.maxX <= o.maxX + tol && b.maxY <= o.maxY + tol;
  const area = (b: Box) => (b.maxX - b.minX) * (b.maxY - b.minY);
  const kept = boxes.filter((b) => !boxes.some((o) => o !== b && area(o) > area(b) * 1.02 && contains(o, b)));

  const items: FurnitureItem[] = [];
  for (const g of kept) {
    const w = (g.maxX - g.minX) * m, d = (g.maxY - g.minY) * m;
    const x = ((g.minX + g.maxX) / 2 - cx) * m;
    const z = ((g.minY + g.maxY) / 2 - cy) * m;
    const room = roomAt(plan, m, (g.minX + g.maxX) / 2, (g.minY + g.maxY) / 2);
    if (!room) continue; // outside every labelled space: sheet annotations, not furniture
    const kind = classify(room, w, d);
    // ponytail: an L-shaped counter/sofa collapses to its bounding box and would block the walkway; skip those
    // until outlines are split into rectangles. Beds are the only legitimately deep-and-wide items.
    if (kind !== 'bed' && Math.min(w, d) > 1.0 && w * d > 3.2) continue;
    items.push({ kind, room, x, z, w, d, h: FURNITURE_HEIGHT_M[kind] });
  }
  return items;
}

/** A door swing is a quarter-arc (plus its leaf line): nearly every point is the same distance from one bbox corner. */
function isDoorSwing(pts: { x: number; y: number }[], b: Box): boolean {
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  if (w < 1e-3 || h < 1e-3 || w / h > 1.3 || h / w > 1.3) return false;
  const corners = [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]];
  return corners.some(([qx, qy]) => {
    const ds = pts.map((p) => Math.hypot(p.x - qx, p.y - qy));
    const mean = ds.reduce((a, v) => a + v, 0) / ds.length;
    const close = ds.filter((v) => Math.abs(v - mean) / mean < 0.08).length;
    return mean > 0 && close / ds.length > 0.8;
  });
}

/** Smallest labelled room whose printed extent (centred on its label) contains the point. */
function roomAt(plan: PlanRecord, m: number, x: number, y: number): string | null {
  let best: { name: string; area: number } | null = null;
  for (const r of plan.rooms) {
    const hw = (r.mm[0] / 1000 / m) / 2 + 0.3 / m, hd = (r.mm[1] / 1000 / m) / 2 + 0.3 / m;
    // the label sits roughly mid-room; try both orientations since mm are printed W × D of the room, not of the page
    const inA = Math.abs(x - r.labelPt[0]) <= hw && Math.abs(y - r.labelPt[1]) <= hd;
    const inB = Math.abs(x - r.labelPt[0]) <= hd && Math.abs(y - r.labelPt[1]) <= hw;
    if (!inA && !inB) continue;
    const area = r.mm[0] * r.mm[1];
    if (!best || area < best.area) best = { name: r.name, area };
  }
  return best?.name ?? null;
}

// ponytail: size + room heuristics; swap for a symbol library when SOBHA supplies a furniture layer or 3D model flat.
function classify(room: string | null, w: number, d: number): FurnitureKind {
  const r = (room ?? '').toLowerCase();
  const long = Math.max(w, d), short = Math.min(w, d), area = w * d;
  if (r.includes('bath') || r.includes('powder') || r.includes('toilet')) return short < 0.55 && long < 0.8 ? 'basin' : 'fixture';
  if (r.includes('kitchen') || r.includes('utility')) return 'counter';
  if (r.includes('closet') || r.includes('wardrobe')) return 'wardrobe';
  if (r.includes('bed')) {
    if (short >= 1.2 && long >= 1.8) return 'bed';
    if (short <= 0.75 && long >= 1.0) return 'wardrobe';
    return short < 0.7 ? 'seat' : 'table';
  }
  if (r.includes('living') || r.includes('dining') || r.includes('foyer')) {
    if (long >= 2.0 && short >= 0.75) return 'sofa';
    if (area >= 1.2) return 'table';
    return 'seat';
  }
  if (r.includes('balcony')) return 'seat';
  return 'misc';
}
