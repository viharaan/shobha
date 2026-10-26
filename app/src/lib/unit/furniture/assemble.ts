/**
 * Assemble a furnished unit: layout items → procedural parts / fitted CC0 models → geometry merged
 * per material (a handful of draw calls for the whole flat), plus themed floors, skirting, door
 * thresholds, fake contact shadows + wall-floor AO strips, light positions and walk colliders.
 *
 * Frames: item (unit mm, page) → world: X = x/1000, Z = y/1000, Y up. A clockwise page rotation
 * rotDeg is rotation.y = −rotDeg·π/180 (checked: front (0,0,−1) at rotDeg 90 → (+1,0,0) = page-right).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FurnitureItem, FurnitureLayout, FurnitureType } from '@/data/sobha/traced/furnitureTypes';
import type { TracedUnit } from '@/data/sobha/traced/types';
import { WALL_H, isWalkable, pointInPolygon, type UnitGeometry, type V2, type WallBox } from '../unitGeometry';
import { PartBuilder, mirrorPartX, type Detail, type Part } from './geom';
import { BED_TOP, COLLIDER_TYPES, NO_SHADOW, UPPER_TYPES, builderFor, sinkHole, type ItemCtx, type Rect } from './items';
import { P, floorKeyFor, getCeilingMaterial, getFloorMaterials, getMaterials, getShadowMaterial, type FloorKey, type MatKey } from './materials';
import { fitModel, type ModelAsset } from './models';
import { rng } from './textures';

export interface BuiltLight {
  pos: THREE.Vector3;
  kind: 'pendant' | 'floor' | 'table';
  room: string;
  roomKind: string | null;
}

export interface BuiltFurniture {
  /** Floor-standing furniture (always visible). */
  lower: THREE.Mesh[];
  /** Wall / ceiling items: art, mirrors, curtains, pendants, wall cabinets (hidden in cut-away). */
  upper: THREE.Mesh[];
  /** Themed floor finishes + skirting + thresholds + fake shadows. */
  base: THREE.Mesh[];
  /** White ceiling + recessed downlights (walk / VR only). */
  ceiling: THREE.Mesh[];
  lights: BuiltLight[];
  colliders: WallBox[];
  stats: { items: number; modelItems: number; proceduralItems: number; meshes: number; triangles: number; models: string[]; buildMs?: number };
  dispose: () => void;
}

const noRaycast = () => {};

/**
 * Item types NOT rebuilt as their mirror image in a mirrored flat: kitchen runs get their sink /
 * hob cut-outs from the (already mirrored) sink / hob positions; art and TV screens carry images
 * that a mirrored flat does not mirror. Fitted CC0 models (armchairs, tables, plants, pendants —
 * all near-symmetric) are placed at the mirrored pose but not reflected.
 */
const NO_MIRROR = new Set<FurnitureType>(['kitchenCounter', 'wallArt', 'tvUnit']);

/** Wall-hung items the generator parks on the wall centreline: re-seat them on the room-side face. */
const WALL_SNAP = new Set<FurnitureType>(['wallArt', 'mirror']);
/** Lowest wall-TV underside (m): clears desks / consoles (0.75 m) the plan draws beneath it. */
const SCREEN_MIN_ELEV_MM = 950;

/**
 * Headset review (2026-10-21): wall art / TV screens leaked through 100–150 mm walls into the next room,
 * TVs sat on desks, rugs ran past room edges. Fixes applied to the item before it is built:
 *  - wall-hung items snap to the nearest wall running across their front, offset by half the wall
 *    thickness + half the item depth onto the room's side (checked against the room polygon);
 *  - wall TV screens never hang below SCREEN_MIN_ELEV_MM;
 *  - rugs are clipped to their room's bounding box (120 mm inset) and dropped when < 0.8 m.
 */
const RUG_BLOCKERS = new Set<FurnitureType>(['bedKing', 'bedQueen', 'bedSingle', 'wardrobe', 'desk', 'dresser', 'tvUnit', 'kitchenCounter', 'bookshelf']);

/** Overlap area (mm²) of two axis-aligned footprints (items at 0/90/180/270 only; rugs and beds always are). */
function overlapMm2(a: FurnitureItem, b: FurnitureItem): number {
  const ext = (it: FurnitureItem): [number, number] => (Math.abs(Math.sin((it.rotDeg * Math.PI) / 180)) > 0.7 ? [it.size[1], it.size[0]] : [it.size[0], it.size[1]]);
  const [aw, ad] = ext(a);
  const [bw, bd] = ext(b);
  const ox = Math.min(a.pos[0] + aw / 2, b.pos[0] + bw / 2) - Math.max(a.pos[0] - aw / 2, b.pos[0] - bw / 2);
  const oz = Math.min(a.pos[1] + ad / 2, b.pos[1] + bd / 2) - Math.max(a.pos[1] - ad / 2, b.pos[1] - bd / 2);
  return ox > 0 && oz > 0 ? ox * oz : 0;
}

function adjustItem(it: FurnitureItem, traced: TracedUnit, all: FurnitureItem[]): FurnitureItem {
  const isScreen = it.type === 'tvUnit' && it.variant === 'screen';
  if (WALL_SNAP.has(it.type) || isScreen) {
    const th = (it.rotDeg * Math.PI) / 180;
    const f: [number, number] = [Math.sin(th), -Math.cos(th)]; // item front on the page
    let best: { d: number; foot: [number, number]; thick: number } | null = null;
    for (const w of traced.walls) {
      const dx = w.b[0] - w.a[0];
      const dy = w.b[1] - w.a[1];
      const L = Math.hypot(dx, dy) || 1;
      const ux = dx / L;
      const uy = dy / L;
      if (Math.abs(ux * f[0] + uy * f[1]) > 0.5) continue; // wall must run across the item's front
      const t = Math.max(0, Math.min(L, (it.pos[0] - w.a[0]) * ux + (it.pos[1] - w.a[1]) * uy));
      const fx = w.a[0] + ux * t;
      const fy = w.a[1] + uy * t;
      const d = Math.hypot(it.pos[0] - fx, it.pos[1] - fy);
      if (!best || d < best.d) best = { d, foot: [fx, fy], thick: w.thicknessMm };
    }
    let out = it;
    if (best && best.d < best.thick / 2 + it.size[1] + 200) {
      const off = best.thick / 2 + it.size[1] / 2 + 5;
      let pos: [number, number] = [best.foot[0] + f[0] * off, best.foot[1] + f[1] * off];
      const room = traced.rooms.find((r) => r.name === it.room);
      if (room && !pointInPolygon(pos, room.polygon)) {
        const alt: [number, number] = [best.foot[0] - f[0] * off, best.foot[1] - f[1] * off];
        if (pointInPolygon(alt, room.polygon)) pos = alt;
      }
      out = { ...out, pos };
    }
    if (isScreen && (out.elevMm ?? 0) < SCREEN_MIN_ELEV_MM) out = { ...out, elevMm: SCREEN_MIN_ELEV_MM };
    return out;
  }
  if (it.type === 'rug') {
    const room = traced.rooms.find((r) => r.name === it.room);
    if (!room) return it;
    const xs = room.polygon.map((p) => p[0]);
    const ys = room.polygon.map((p) => p[1]);
    const inset = 120;
    const minX = Math.min(...xs) + inset;
    const maxX = Math.max(...xs) - inset;
    const minY = Math.min(...ys) + inset;
    const maxY = Math.max(...ys) - inset;
    const swap = Math.abs(Math.sin((it.rotDeg * Math.PI) / 180)) > 0.7;
    const w = swap ? it.size[1] : it.size[0];
    const d = swap ? it.size[0] : it.size[1];
    const w2 = Math.max(0, Math.min(it.pos[0] - minX, maxX - it.pos[0], w / 2)) * 2;
    const d2 = Math.max(0, Math.min(it.pos[1] - minY, maxY - it.pos[1], d / 2)) * 2;
    if (w2 < 800 || d2 < 800) return { ...it, size: [0, 0] };
    const clipped: FurnitureItem = { ...it, size: swap ? [d2, w2] : [w2, d2] };
    // a rug that mostly disappears under a bed / wardrobe / desk only shows as odd floor patches: drop it
    const area = w2 * d2;
    const covered = all.filter((o) => o !== it && o.room === it.room && RUG_BLOCKERS.has(o.type)).reduce((s, o) => s + overlapMm2(clipped, o), 0);
    if (covered > area * 0.15) return { ...it, size: [0, 0] };
    return clipped;
  }
  return it;
}

const deg = (d: number) => (d * Math.PI) / 180;

function itemMatrix(it: FurnitureItem, elev: number) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(it.pos[0] / 1000, elev, it.pos[1] / 1000),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -deg(it.rotDeg)),
    new THREE.Vector3(1, 1, 1)
  );
}

/** World (X,Z) → item-local (x,z). */
function toLocal(it: FurnitureItem, X: number, Z: number): V2 {
  const dx = X - it.pos[0] / 1000;
  const dz = Z - it.pos[1] / 1000;
  const a = deg(it.rotDeg); // inverse of rotation.y = −a is +a
  const c = Math.cos(a);
  const s = Math.sin(a);
  // R_y(φ): x' = x cos φ + z sin φ, z' = −x sin φ + z cos φ ; φ = +a
  return [dx * c + dz * s, -dx * s + dz * c];
}

const inFoot = (it: FurnitureItem, X: number, Z: number, m = 0.05) => {
  const [x, z] = toLocal(it, X, Z);
  return Math.abs(x) <= it.size[0] / 2000 + m && Math.abs(z) <= Math.max(it.size[1], 1) / 2000 + m;
};

/** Default base height (m) per type when the layout gives none. */
function defaultElev(t: FurnitureType): number {
  switch (t) {
    case 'wallArt':
      return 1.3;
    case 'mirror':
      return 1.1;
    case 'pendantLight':
      return 1.9;
    case 'hob':
    case 'sink':
      return 0.9;
    default:
      return 0;
  }
}

export function buildFurniture(opts: {
  layout: FurnitureLayout;
  geo: UnitGeometry;
  traced: TracedUnit;
  detail: Detail;
  models: Map<string, ModelAsset> | null;
}): BuiltFurniture {
  const { layout, geo, traced, detail, models } = opts;
  const vr = detail === 'vr';
  const rooms = new Map(traced.rooms.map((r) => [r.name, r]));
  const items = layout.items;
  const lowerParts: Part[] = [];
  const upperParts: Part[] = [];
  const shadowGeos: THREE.BufferGeometry[] = [];
  const lights: BuiltLight[] = [];
  const colliders: WallBox[] = [];
  // model instances: asset id → { asset, matrices, upper }
  const modelInst = new Map<string, { asset: ModelAsset; mats: THREE.Matrix4[]; upper: boolean }>();
  let modelItems = 0;
  let plantModels = 0;

  const beds = items.filter((i) => /^bed/.test(i.type));

  items.forEach((it0, idx) => {
    const it = adjustItem(it0, traced, items);
    if (it.size[0] <= 0) return; // dropped (rug that cannot fit its room)
    const room = rooms.get(it.room);
    const w = it.size[0] / 1000;
    const d = Math.max(it.size[1], 1) / 1000;
    let elev = (it.elevMm ?? defaultElev(it.type) * 1000) / 1000;
    // dressing laid on a bed sits on the mattress (layout elev ≈ generic 520–560 mm)
    if ((it.type === 'throwBlanket' || it.type === 'cushions') && beds.some((b) => inFoot(b, it.pos[0] / 1000, it.pos[1] / 1000, 0))) {
      elev = Math.max(elev, it.type === 'throwBlanket' ? BED_TOP + 0.03 : BED_TOP + 0.02);
    }
    const r = rng(1000 + idx * 7919 + Math.round(it.pos[0] + it.pos[1]));
    const near = new Set<FurnitureType>();
    for (const o of items) if (o !== it && inFoot(it, o.pos[0] / 1000, o.pos[1] / 1000)) near.add(o.type);
    const M = itemMatrix(it, elev);
    const upper = UPPER_TYPES.has(it.type);
    const target = upper ? upperParts : lowerParts;

    // ---------- model?
    const modelOK =
      models &&
      !(it.type === 'tvUnit' && it.variant === 'screen') &&
      !(it.type === 'pendantLight' && w > 0.8 && w > d * 2) &&
      !(it.type === 'plant' && vr && plantModels >= 2);
    const fit = modelOK ? fitModel(it.type, w, d, it.heightMm ? it.heightMm / 1000 : undefined, models!, vr, idx, { round: Math.abs(w - d) < 0.15 }) : null;
    if (fit) {
      modelItems++;
      if (it.type === 'plant') plantModels++;
      let m = M.clone().multiply(fit.m);
      if (it.type === 'pendantLight') {
        // hang with the top of the model at the ceiling
        const top = new THREE.Box3().copy(fit.asset.box).applyMatrix4(fit.m).max.y;
        m = itemMatrix(it, WALL_H - top).multiply(fit.m);
        lights.push({ pos: new THREE.Vector3(it.pos[0] / 1000, WALL_H - top * 0.85, it.pos[1] / 1000), kind: 'pendant', room: it.room, roomKind: room?.kind ?? null });
      }
      const key = fit.asset.model.id + (upper ? ':U' : '');
      if (!modelInst.has(key)) modelInst.set(key, { asset: fit.asset, mats: [], upper });
      modelInst.get(key)!.mats.push(m);
    } else {
      // ---------- procedural
      const ctx: ItemCtx = {
        type: it.type,
        w,
        d,
        h: it.heightMm ? it.heightMm / 1000 : undefined,
        variant: it.variant,
        r,
        roomKind: room?.kind ?? null,
        roomName: it.room,
        elev,
        near,
        hasMirror: items.some((o) => o.type === 'mirror' && o.room === it.room),
        hasLamp: near.has('tableLamp'),
      };
      if (it.type === 'kitchenCounter') {
        const sinks: Rect[] = [];
        const hobs: Rect[] = [];
        for (const o of items) {
          if ((o.type !== 'sink' && o.type !== 'hob') || !inFoot(it, o.pos[0] / 1000, o.pos[1] / 1000, 0.02)) continue;
          const [lx, lz] = toLocal(it, o.pos[0] / 1000, o.pos[1] / 1000);
          if (o.type === 'sink') {
            const hole = sinkHole(o.size[0] / 1000, o.size[1] / 1000, o.variant);
            // a mirrored sink is built mirrored (bowl on the other side of its drainer)
            const hx = o.mirrored ? -hole.x : hole.x;
            // sink-local x offset → counter-local, via the relative rotation
            const rel = deg(o.rotDeg - it.rotDeg);
            const ox = hx * Math.cos(rel);
            const oz = hx * Math.sin(rel);
            const swap = Math.abs(Math.sin(rel)) > 0.7;
            sinks.push({ x: lx + ox, z: lz + oz, w: swap ? hole.d : hole.w, d: swap ? hole.w : hole.d });
          } else hobs.push({ x: lx, z: lz, w: o.size[0] / 1000, d: o.size[1] / 1000 });
        }
        ctx.sinks = sinks;
        ctx.hobs = hobs;
        // windows behind the run → no wall cabinets there
        const nwc: [number, number][] = [];
        for (const g of geo.glass) {
          if (g.kind === 'railing' || g.y1 < 1.5) continue;
          const ux = Math.cos(g.rotY);
          const uz = -Math.sin(g.rotY);
          const a = toLocal(it, g.cx - (ux * g.len) / 2, g.cz - (uz * g.len) / 2);
          const b = toLocal(it, g.cx + (ux * g.len) / 2, g.cz + (uz * g.len) / 2);
          if (Math.abs((a[1] + b[1]) / 2 - d / 2) > 0.4) continue;
          nwc.push([Math.min(a[0], b[0]) - 0.05, Math.max(a[0], b[0]) + 0.05]);
        }
        ctx.noWallCab = nwc;
      }
      const b = new PartBuilder(detail);
      builderFor(it.type)(b, ctx);
      // mirrored flat: handed pieces become their mirror image (item-local x → −x)
      const flip = !!it.mirrored && !NO_MIRROR.has(it.type);
      if (flip) for (const l of b.lights) l.p.x = -l.p.x;
      // kitchen wall cabinets / hood are 'upper' (above the cut) — split by height
      for (const p of b.parts) {
        if (flip) mirrorPartX(p.g);
        p.g.applyMatrix4(M);
        if (!upper && it.type === 'kitchenCounter') {
          p.g.computeBoundingBox();
          (p.g.boundingBox!.min.y > 1.3 ? upperParts : lowerParts).push(p);
        } else target.push(p);
      }
      for (const l of b.lights) lights.push({ pos: l.p.clone().applyMatrix4(M), kind: l.kind, room: it.room, roomKind: room?.kind ?? null });
    }

    // ---------- fake contact shadow
    if (!NO_SHADOW.has(it.type) && !upper && elev < 0.05 && !(it.type === 'tvUnit' && it.variant === 'screen')) {
      const pad = it.type === 'diningChair' ? 0.12 : 0.18;
      const dd = it.type === 'diningChair' && d < 0.42 ? 0.48 : d;
      const zc = it.type === 'diningChair' && d < 0.42 ? d / 2 - dd / 2 : 0;
      const g = new THREE.PlaneGeometry(w + pad, dd + pad);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.014, zc);
      g.applyMatrix4(itemMatrix(it, 0));
      shadowGeos.push(g);
    }

    // ---------- collider (big floor items only; never rugs / curtains)
    if (COLLIDER_TYPES.has(it.type) && elev < 0.05 && !(it.type === 'tvUnit' && it.variant === 'screen')) {
      const shrink = 0.06;
      colliders.push({
        kind: 'wall',
        cx: it.pos[0] / 1000,
        cz: it.pos[1] / 1000,
        len: Math.max(0.1, w - 2 * shrink),
        thick: Math.max(0.1, d - 2 * shrink),
        y0: 0,
        y1: 0.6,
        rotY: -deg(it.rotDeg),
        collide: true,
      });
    }
  });

  /* ---------------- floors, skirting, thresholds, wall AO ---------------- */
  const floorGeos = new Map<FloorKey, THREE.BufferGeometry[]>();
  const ceilPos: number[] = [];
  const ceilB = new PartBuilder(detail);
  const opens = traced.openings.map((o) => ({ a: [o.a[0] / 1000, o.a[1] / 1000] as V2, b: [o.b[0] / 1000, o.b[1] / 1000] as V2, kind: o.kind }));
  const baseParts: Part[] = [];
  const pb = new PartBuilder(detail);
  for (const f of geo.floors) {
    if (!isWalkable(f.kind)) continue;
    const key = floorKeyFor(f.kind);
    if (!key) continue;
    const pts = f.pts;
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const swap = key === 'woodFloor' && Math.max(...zs) - Math.min(...zs) > Math.max(...xs) - Math.min(...xs);
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
    const pos: number[] = [];
    const uv: number[] = [];
    for (const t of tris) {
      const [a, b, c] = t.map((i) => pts[i]);
      // ensure the face normal points up (+Y): cross((b−a),(c−a)).y = (dz1·dx2 − dx1·dz2) must be > 0
      const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
      const seq = up ? [a, b, c] : [a, c, b];
      for (const p of seq) {
        pos.push(p[0], 0.007, p[1]);
        uv.push(swap ? p[1] : p[0], swap ? p[0] : -p[1]);
      }
    }
    if (f.kind !== 'balcony') {
      // ceiling: same triangles, reversed winding (faces down)
      for (let i = 0; i < pos.length; i += 9) ceilPos.push(pos[i], WALL_H - 0.003, pos[i + 2], pos[i + 6], WALL_H - 0.003, pos[i + 8], pos[i + 3], WALL_H - 0.003, pos[i + 5]);
      // recessed downlights on a ~1.3 m grid, ≥ 0.45 m from walls
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const z0 = Math.min(...zs);
      const z1 = Math.max(...zs);
      const nx = Math.max(1, Math.round((x1 - x0 - 0.9) / 1.3) + 1);
      const nz = Math.max(1, Math.round((z1 - z0 - 0.9) / 1.3) + 1);
      for (let ix = 0; ix < nx; ix++)
        for (let iz = 0; iz < nz; iz++) {
          const px = nx === 1 ? (x0 + x1) / 2 : x0 + 0.45 + (ix * (x1 - x0 - 0.9)) / (nx - 1);
          const pz = nz === 1 ? (z0 + z1) / 2 : z0 + 0.45 + (iz * (z1 - z0 - 0.9)) / (nz - 1);
          if (!pointInPolygon([px, pz], pts)) continue;
          ceilB.add(new THREE.CircleGeometry(0.04, 16), 'bulb', '#ffffff', { x: px, y: WALL_H - 0.006, z: pz, rx: Math.PI / 2 }, 'keep');
          ceilB.add(new THREE.RingGeometry(0.04, 0.055, 16), 'paint', '#e9e7e2', { x: px, y: WALL_H - 0.005, z: pz, rx: Math.PI / 2 }, 'keep');
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    if (!floorGeos.has(key)) floorGeos.set(key, []);
    floorGeos.get(key)!.push(g);

    // skirting + wall-floor AO along each edge, minus openings
    const area = pts.reduce((s, p, i) => {
      const q = pts[(i + 1) % pts.length];
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.12) continue;
      const u: V2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      let n: V2 = area > 0 ? [-u[1], u[0]] : [u[1], -u[0]];
      const mid: V2 = [(a[0] + b[0]) / 2 + n[0] * 0.05, (a[1] + b[1]) / 2 + n[1] * 0.05];
      if (!pointInPolygon(mid, pts)) n = [-n[0], -n[1]];
      // excluded intervals (openings near & parallel to this edge)
      const cuts: [number, number][] = [];
      for (const o of opens) {
        const ta = (o.a[0] - a[0]) * u[0] + (o.a[1] - a[1]) * u[1];
        const tb = (o.b[0] - a[0]) * u[0] + (o.b[1] - a[1]) * u[1];
        const da = Math.abs((o.a[0] - a[0]) * n[0] + (o.a[1] - a[1]) * n[1]);
        const db = Math.abs((o.b[0] - a[0]) * n[0] + (o.b[1] - a[1]) * n[1]);
        if (da > 0.32 || db > 0.32) continue;
        cuts.push([Math.min(ta, tb), Math.max(ta, tb)]);
      }
      // glazing down to the floor (sliding doors / full-height windows) also cut
      for (const gp of geo.glass) {
        if (gp.y0 > 0.2) continue;
        const ux = Math.cos(gp.rotY);
        const uz = -Math.sin(gp.rotY);
        const pa: V2 = [gp.cx - (ux * gp.len) / 2, gp.cz - (uz * gp.len) / 2];
        const pbb: V2 = [gp.cx + (ux * gp.len) / 2, gp.cz + (uz * gp.len) / 2];
        const da = Math.abs((pa[0] - a[0]) * n[0] + (pa[1] - a[1]) * n[1]);
        if (da > 0.32) continue;
        const ta = (pa[0] - a[0]) * u[0] + (pa[1] - a[1]) * u[1];
        const tb = (pbb[0] - a[0]) * u[0] + (pbb[1] - a[1]) * u[1];
        cuts.push([Math.min(ta, tb), Math.max(ta, tb)]);
      }
      cuts.sort((x, y) => x[0] - y[0]);
      const segs: [number, number][] = [];
      let t = 0;
      for (const [c0, c1] of cuts) {
        if (c0 > t) segs.push([t, Math.min(c0, L)]);
        t = Math.max(t, c1);
      }
      if (t < L) segs.push([t, L]);
      const rotY = Math.atan2(-u[1], u[0]);
      for (const [s0, s1] of segs) {
        const len = s1 - s0;
        if (len < 0.05) continue;
        const cx = a[0] + u[0] * (s0 + len / 2);
        const cz = a[1] + u[1] * (s0 + len / 2);
        if (f.kind === 'wet') {
          // full-height-ish porcelain wall tiling in baths (2.4 m), same tile as the floor
          const H = 2.4;
          const p0: V2 = [a[0] + u[0] * s0 + n[0] * 0.004, a[1] + u[1] * s0 + n[1] * 0.004];
          const p1: V2 = [a[0] + u[0] * s1 + n[0] * 0.004, a[1] + u[1] * s1 + n[1] * 0.004];
          const faces = -u[1] * n[0] + u[0] * n[1] > 0; // (u × up) · n
          const q = faces ? [p0, p1] : [p1, p0];
          const su = faces ? [s0, s1] : [s1, s0];
          const tp = [q[0][0], 0, q[0][1], q[1][0], 0, q[1][1], q[1][0], H, q[1][1], q[0][0], 0, q[0][1], q[1][0], H, q[1][1], q[0][0], H, q[0][1]];
          const tu = [su[0], 0, su[1], 0, su[1], H, su[0], 0, su[1], H, su[0], H];
          const tg = new THREE.BufferGeometry();
          tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
          tg.setAttribute('uv', new THREE.Float32BufferAttribute(tu, 2));
          tg.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 2, 3, 4, 5].flatMap(() => [n[0], 0, n[1]]), 3));
          floorGeos.get('bathTile')!.push(tg);
        }
        if (f.kind !== 'balcony' && f.kind !== 'wet') {
          pb.add(new THREE.BoxGeometry(len, 0.08, 0.012), 'paint', P.white, { x: cx + n[0] * 0.006, y: 0.04, z: cz + n[1] * 0.006, ry: rotY });
        }
        // AO strip: v = 1 at the wall
        const g2 = new THREE.PlaneGeometry(len, 0.2);
        const uv2 = g2.attributes.uv;
        for (let k = 0; k < uv2.count; k++) uv2.setX(k, 0.5 + uv2.getX(k) * 0.49);
        g2.rotateX(-Math.PI / 2); // local +y (v=1 edge) → −Z
        // orient so the v=1 edge lies on the wall: local −Z must map to −n
        const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(u[0], 0, u[1]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(n[0], 0, n[1]));
        g2.applyMatrix4(m);
        g2.translate(cx + n[0] * 0.1, 0.012, cz + n[1] * 0.1);
        shadowGeos.push(g2);
      }
    }
  }
  // stone thresholds in door / archway / sliding openings
  for (const o of opens) {
    if (o.kind === 'window') continue;
    const L = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]);
    if (L < 0.4) continue;
    const rotY = Math.atan2(-(o.b[1] - o.a[1]), o.b[0] - o.a[0]);
    pb.box('stone', P.quartz, L, 0.008, 0.26, (o.a[0] + o.b[0]) / 2, 0, (o.a[1] + o.b[1]) / 2, 0, { ry: rotY });
  }
  baseParts.push(...pb.parts);

  /* ---------------- merge ---------------- */
  const mats = getMaterials();
  const meshes: { lower: THREE.Mesh[]; upper: THREE.Mesh[]; base: THREE.Mesh[]; ceiling: THREE.Mesh[] } = { lower: [], upper: [], base: [], ceiling: [] };
  const allGeos: THREE.BufferGeometry[] = [];
  let triangles = 0;
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, bucket: THREE.Mesh[], shadow: { cast: boolean; receive: boolean }, name: string) => {
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.raycast = noRaycast;
    // the component switches shadows off in VR; these are the desktop defaults
    mesh.userData.cast = shadow.cast;
    mesh.userData.receive = shadow.receive;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    bucket.push(mesh);
    allGeos.push(g);
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
  };
  const mergeParts = (parts: Part[], bucket: THREE.Mesh[], tag: string, receiveOnly = false) => {
    const by = new Map<MatKey, THREE.BufferGeometry[]>();
    for (const p of parts) {
      if (!by.has(p.m)) by.set(p.m, []);
      by.get(p.m)!.push(p.g);
    }
    by.forEach((gs, k) => {
      const g = mergeGeometries(gs, false);
      gs.forEach((x) => x.dispose());
      if (!g) return;
      const cast = !receiveOnly && !['glass', 'bulb', 'rug', 'leaf', 'shade', 'mirror', 'art'].includes(k);
      mk(g, mats[k], bucket, { cast, receive: k !== 'glass' && k !== 'bulb' }, `${tag}:${k}`);
    });
  };
  mergeParts(lowerParts, meshes.lower, 'furn');
  mergeParts(upperParts, meshes.upper, 'furnU');
  mergeParts(baseParts, meshes.base, 'trim', true);
  mergeParts(ceilB.parts, meshes.ceiling, 'ceil', true);
  if (ceilPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ceilPos, 3));
    g.computeVertexNormals();
    mk(g, getCeilingMaterial(), meshes.ceiling, { cast: true, receive: true }, 'ceiling');
  }
  const fm = getFloorMaterials();
  floorGeos.forEach((gs, k) => {
    const g = mergeGeometries(gs, false);
    gs.forEach((x) => x.dispose());
    if (g) mk(g, fm[k], meshes.base, { cast: false, receive: true }, `floor:${k}`);
  });
  if (shadowGeos.length) {
    const g = mergeGeometries(shadowGeos.map((x) => x.deleteAttribute('normal') && x), false);
    shadowGeos.forEach((x) => x.dispose());
    if (g) {
      mk(g, getShadowMaterial(), meshes.base, { cast: false, receive: false }, 'furn:shadow');
      meshes.base[meshes.base.length - 1].renderOrder = 1;
    }
  }
  // model instances: merge per (asset, source material)
  modelInst.forEach(({ asset, mats: ms, upper }) => {
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const m of ms)
      for (const pc of asset.pieces) {
        const g = pc.geo.clone().applyMatrix4(m);
        if (!byMat.has(pc.mat)) byMat.set(pc.mat, []);
        byMat.get(pc.mat)!.push(g);
      }
    byMat.forEach((gs, mat) => {
      const g = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
      if (gs.length > 1) gs.forEach((x) => x.dispose());
      if (g) mk(g, mat, upper ? meshes.upper : meshes.lower, { cast: true, receive: true }, `model:${asset.model.id}`);
    });
  });

  return {
    ...meshes,
    lights,
    colliders,
    stats: {
      items: items.length,
      modelItems,
      proceduralItems: items.length - modelItems,
      meshes: meshes.lower.length + meshes.upper.length + meshes.base.length + meshes.ceiling.length,
      triangles: Math.round(triangles),
      models: Array.from(modelInst.keys()),
    },
    dispose: () => allGeos.forEach((g) => g.dispose()),
  };
}

/** Choose ≤ n real-time lights: living pendants/lamps first, then the master bedroom, then others. */
export function pickLights(lights: BuiltLight[], n: number): BuiltLight[] {
  const score = (l: BuiltLight) =>
    (l.kind === 'pendant' ? 3 : l.kind === 'floor' ? 2 : 1) + (l.roomKind === 'living' ? 10 : /master/i.test(l.room) ? 5 : l.roomKind === 'bedroom' ? 2 : 0);
  const out: BuiltLight[] = [];
  const usedRooms = new Map<string, number>();
  for (const l of [...lights].sort((a, b) => score(b) - score(a))) {
    if (out.length >= n) break;
    // spread: at most 2 per room, and not two within 1.5 m
    if ((usedRooms.get(l.room) ?? 0) >= 2) continue;
    if (out.some((o) => o.pos.distanceTo(l.pos) < 1.5)) continue;
    out.push(l);
    usedRooms.set(l.room, (usedRooms.get(l.room) ?? 0) + 1);
  }
  return out;
}
