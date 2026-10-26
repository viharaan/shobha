/**
 * Procedural builders, one per FurnitureType. Each fits its geometry to the item's footprint
 * (w × d metres, local frame: front = −Z, back = +Z against the wall, base at y = 0) and an
 * optional overall height. Proportions follow common furniture standards (sofa seat 420 mm,
 * back 800 mm, dining seat 460 mm, table 750 mm, counter 900 mm, wardrobe 2200 mm …).
 */
import * as THREE from 'three';
import type { FurnitureType } from '@/data/sobha/traced/furnitureTypes';
import type { TracedRoomKind } from '@/data/sobha/traced/types';
import { WALL_H } from '../unitGeometry';
import { ART_COLS, ART_ROWS, LEAF_CELLS, RUG_CELLS } from './textures';
import { P, type MatKey } from './materials';
import { PartBuilder, arcSlab, atlasUV, cushion, curtainPanel, drape, lathe, tube } from './geom';

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface ItemCtx {
  type: FurnitureType;
  w: number;
  d: number;
  /** Overall height (m) if the layout gave one. */
  h?: number;
  variant?: string;
  r: () => number;
  roomKind: TracedRoomKind | null;
  roomName: string;
  /** kitchenCounter: sinks (holes) and hobs on this run, counter-local. */
  sinks?: Rect[];
  hobs?: Rect[];
  /** kitchenCounter: local-x intervals with a window / glazing behind (no wall cabinets). */
  noWallCab?: [number, number][];
  /** basinVanity: room already has a mirror item. */
  hasMirror?: boolean;
  /** nightstand: a table lamp item already stands on it. */
  hasLamp?: boolean;
  /** Base height of the item (m) — pendants use it to reach the ceiling. */
  elev: number;
  /** Types of other layout items whose centre lies on this item's footprint (avoid duplicate decor). */
  near: Set<FurnitureType>;
}

type Builder = (b: PartBuilder, c: ItemCtx) => void;

/** Mattress top (m) — dressing items (throws, cushions) on a bed are lifted to sit on it. */
export const BED_TOP = 0.5;

/** Sink cut-out in the worktop for a sink item of w × d (m), sink-local centre offset x. */
export function sinkHole(w: number, d: number, variant?: string): { x: number; w: number; d: number } {
  const hd = Math.min(d - 0.08, 0.42);
  if (variant === 'drainer' && w > 0.8) return { x: -(w / 2 - 0.05 - 0.25), w: 0.5, d: hd };
  return { x: 0, w: Math.max(0.3, w - 0.1), d: hd };
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];
const ACCENTS = [P.terracotta, P.sage, P.ochre, P.rust, P.dustyBlue, P.deepGreen] as const;
const BOOK_COLS = ['#2f3a4a', '#9c4a2c', '#c9a462', '#e9e1d3', '#55624f', '#7e8d9a', '#b5653f', '#3a3633', '#d8c7ad', '#8f9c83'];

/* ------------------------------------------------------------------ small reusable props */

function openBox(w: number, h: number, d: number): THREE.BufferGeometry {
  // box without its top face, faces pointing inward (sink / bath basin interior)
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const keepP: number[] = [];
  const keepN: number[] = [];
  for (let t = 0; t < pos.count; t += 3) {
    if (nor.getY(t) > 0.5) continue; // drop top
    for (const k of [0, 2, 1]) {
      const i = t + k;
      keepP.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      keepN.push(-nor.getX(i), -nor.getY(i), -nor.getZ(i));
    }
  }
  g.dispose();
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(keepP, 3));
  o.setAttribute('normal', new THREE.Float32BufferAttribute(keepN, 3));
  return o;
}

function bookRow(b: PartBuilder, r: () => number, x0: number, x1: number, y0: number, z: number, depth: number, maxH: number) {
  let x = x0;
  while (x < x1 - 0.02) {
    const t = 0.018 + r() * 0.03;
    if (x + t > x1) break;
    const h = Math.min(maxH, 0.17 + r() * 0.12);
    const lean = r() < 0.06 ? 0.12 : 0;
    b.box('paint', pick(r, BOOK_COLS), t, h, depth * (0.75 + r() * 0.2), x + t / 2, y0, z, 0.002, { rz: lean });
    x += t + 0.002 + (lean ? 0.03 : 0);
  }
}

function bookStack(b: PartBuilder, r: () => number, x: number, y0: number, z: number, n = 3, ry = 0) {
  let y = y0;
  for (let i = 0; i < n; i++) {
    const w = 0.2 + r() * 0.08;
    const t = 0.025 + r() * 0.02;
    b.box('paint', pick(r, BOOK_COLS), w, t, 0.15 + r() * 0.06, x + (r() - 0.5) * 0.02, y, z, 0.003, { ry: ry + (r() - 0.5) * 0.25 });
    y += t;
  }
  return y;
}

const VASE_PROFILES: [number, number][][] = [
  // bud
  [[0, 0], [0.045, 0], [0.07, 0.04], [0.075, 0.1], [0.05, 0.18], [0.025, 0.22], [0.028, 0.26], [0.022, 0.26]],
  // amphora / round
  [[0, 0], [0.06, 0], [0.1, 0.06], [0.11, 0.12], [0.08, 0.2], [0.05, 0.24], [0.055, 0.27], [0.048, 0.27]],
  // cylinder
  [[0, 0], [0.06, 0], [0.065, 0.02], [0.065, 0.28], [0.058, 0.28]],
];

/** Vase of height h (scaled profile) with optional stems. */
function vase(b: PartBuilder, r: () => number, x: number, y0: number, z: number, h: number, stems: 'olive' | 'pampas' | 'none' = 'none') {
  const prof = pick(r, VASE_PROFILES);
  const top = prof[prof.length - 1][1];
  const k = h / top;
  const col = pick(r, [P.ivory, P.terracottaPot, P.sage, P.stoneGrey, P.charcoal]);
  const mat: MatKey = r() < 0.5 ? 'matte' : 'gloss';
  b.add(lathe(prof.map(([pr, py]) => [pr * k, py * k]), b.detail === 'vr' ? 12 : 18), mat, col, { x, y: y0, z }, 'keep');
  if (stems !== 'none') {
    const n = stems === 'pampas' ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r();
      const len = h * (1.2 + r() * 0.8);
      leafCard(b, stems === 'pampas' ? 2 : 1, x + Math.cos(a) * 0.02, y0 + h * 0.6, z + Math.sin(a) * 0.02, len * 0.45, len, a, 0.25 + r() * 0.2, '#ffffff');
    }
  }
}

/** One alpha leaf card from the leaf atlas. Card stands at (x,y,z) base, rotated `yaw`, tilted `tilt` outward. */
function leafCard(b: PartBuilder, cell: number, x: number, y: number, z: number, w: number, h: number, yaw: number, tilt: number, col: string) {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(0, h / 2, 0);
  atlasUV(g, cell, 0, LEAF_CELLS, 1);
  b.add(g, 'leaf', col, { x, y, z, ry: yaw, rx: tilt }, 'keep');
}

function foliage(b: PartBuilder, r: () => number, kind: 'fiddle' | 'olive' | 'palm', x: number, y0: number, z: number, h: number, spread: number) {
  const vr = b.detail === 'vr';
  const greens = ['#ffffff', '#eef4e6', '#dfe8d4', '#f6f2e6'];
  if (kind === 'palm') {
    const n = vr ? 9 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.4;
      const len = h * (0.6 + r() * 0.4);
      leafCard(b, 3, x, y0, z, len * 0.32, len, a, 0.15 + r() * 0.45, pick(r, greens));
    }
    return;
  }
  // trunk
  const trunkTop = y0 + h * (kind === 'olive' ? 0.55 : 0.35);
  b.rod('wood', P.walnut, [x, y0, z], [x + (r() - 0.5) * 0.05, trunkTop, z + (r() - 0.5) * 0.05], kind === 'olive' ? 0.018 : 0.012, 6);
  const n = kind === 'olive' ? (vr ? 16 : 26) : vr ? 14 : 22;
  for (let i = 0; i < n; i++) {
    const t = r();
    const yy = trunkTop - h * 0.05 + t * (y0 + h - trunkTop);
    const a = r() * Math.PI * 2;
    const rad = spread * (0.25 + 0.75 * Math.sin(Math.min(1, t * 1.1 + 0.15) * Math.PI)) * (0.5 + r() * 0.5);
    const px = x + Math.cos(a) * rad;
    const pz = z + Math.sin(a) * rad;
    if (kind === 'fiddle') {
      const s = 0.16 + r() * 0.1;
      leafCard(b, 0, px, yy - s * 0.3, pz, s * 0.75, s, -a + Math.PI / 2, 0.5 + r() * 0.6, pick(r, greens));
    } else {
      const s = 0.22 + r() * 0.12;
      leafCard(b, 1, px, yy - s * 0.4, pz, s * 0.8, s, r() * Math.PI, 0.3 + r() * 0.8, pick(r, greens));
    }
  }
}

function pot(b: PartBuilder, r: () => number, x: number, y0: number, z: number, rad: number, h: number) {
  const style = r();
  const col = style < 0.4 ? P.terracottaPot : style < 0.7 ? P.ivory : P.charcoal;
  const prof: [number, number][] =
    style < 0.4
      ? [[0, 0], [rad * 0.7, 0], [rad * 0.95, h * 0.85], [rad, h * 0.86], [rad, h], [rad * 0.92, h], [rad * 0.9, h * 0.9]]
      : [[0, 0], [rad * 0.85, 0], [rad, h * 0.25], [rad, h], [rad * 0.92, h], [rad * 0.92, h * 0.9]];
  b.add(lathe(prof, b.detail === 'vr' ? 12 : 18), style < 0.4 ? 'matte' : 'gloss', col, { x, y: y0, z }, 'keep');
  // soil
  b.cyl('matte', '#3b2f26', rad * 0.9, rad * 0.9, 0.01, x, y0 + h * 0.88, z, 12);
}

function tableLampAt(b: PartBuilder, r: () => number, x: number, y0: number, z: number, h = 0.48) {
  const col = pick(r, [P.ivory, P.terracottaPot, P.sage, P.stoneGrey]);
  const bh = h * 0.55;
  b.add(lathe([[0, 0], [0.05, 0], [0.085, bh * 0.35], [0.075, bh * 0.75], [0.025, bh * 0.95], [0.012, bh]], b.detail === 'vr' ? 12 : 18), 'gloss', col, { x, y: y0, z }, 'keep');
  b.cyl('metal', P.brass, 0.006, 0.006, h * 0.12, x, y0 + bh, z, 6);
  const sh = h * 0.38;
  b.add(new THREE.CylinderGeometry(0.11, 0.15, sh, 20, 1, true), 'shade', P.ivory, { x, y: y0 + h - sh / 2, z });
  b.add(new THREE.SphereGeometry(0.03, 10, 8), 'bulb', '#ffffff', { x, y: y0 + h - sh * 0.6, z }, 'keep');
  b.light(x, y0 + h - sh * 0.5, z, 'table');
}

/* ------------------------------------------------------------------ seating */

function sofaCore(b: PartBuilder, c: ItemCtx, w: number, d: number, seats: number, x0 = 0, z0 = 0, arms: [boolean, boolean] = [true, true]) {
  const boucle = c.variant === 'boucle';
  const leather = c.variant === 'leather';
  const fab: MatKey = boucle ? 'boucle' : leather ? 'leather' : 'fabric';
  const col = boucle ? P.ivory : leather ? P.cognac : c.variant === 'velvet' ? P.sage : c.variant === 'grey' ? P.warmGrey : c.variant === 'oatmeal' ? P.oatmeal : P.linen;
  const legH = 0.07;
  const armW = Math.min(0.17, w * 0.1);
  const backT = Math.min(0.2, d * 0.22);
  const armH = 0.6;
  const seatTop = 0.42;
  const backTop = 0.8;
  // legs (walnut, tapered)
  const lx = w / 2 - 0.07;
  const lz = d / 2 - 0.07;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('wood', P.walnut, 0.018, 0.012, legH, x0 + sx * lx, 0, z0 + sz * lz, 8);
  // base
  b.box(fab, col, w, 0.21, d, x0, legH, z0, 0.03);
  // arms
  for (const s of [-1, 1]) {
    if (!arms[s < 0 ? 0 : 1]) continue;
    b.box(fab, col, armW, armH - legH, d, x0 + s * (w / 2 - armW / 2), legH, z0, 0.06);
  }
  // back frame
  const innerW = w - (arms[0] ? armW : 0) - (arms[1] ? armW : 0);
  const innerX = x0 + ((arms[0] ? armW : 0) - (arms[1] ? armW : 0)) / 2;
  b.box(fab, col, innerW + 0.001, backTop - 0.05 - legH, backT, innerX, legH, z0 + d / 2 - backT / 2, 0.05);
  // seat cushions
  const cw = innerW / seats;
  const cd = d - backT - 0.01;
  const seg: [number, number] = b.detail === 'vr' ? [12, 8] : [18, 10];
  for (let i = 0; i < seats; i++) {
    const cx = innerX - innerW / 2 + cw * (i + 0.5);
    b.add(cushion(cw - 0.01, 0.15, cd, 0.18, seg), fab, col, { x: cx, y: 0.28 + 0.075 - 0.005 + (seatTop - 0.43), z: z0 - d / 2 + cd / 2 });
    // back cushion, leaning back
    b.add(cushion(cw - 0.015, 0.44, 0.19, 0.25, seg), fab, col, {
      x: cx,
      y: seatTop + 0.2,
      z: z0 + d / 2 - backT - 0.07,
      rx: 0.16,
    });
  }
  return { innerW, innerX, seatTop, frontZ: z0 - d / 2, backZ: z0 + d / 2 - backT - 0.17 };
}

function throwCushions(b: PartBuilder, c: ItemCtx, innerX: number, innerW: number, seatTop: number, backZ: number, n = 2) {
  const seg: [number, number] = b.detail === 'vr' ? [10, 8] : [14, 10];
  const cols = [pick(c.r, ACCENTS), pick(c.r, [P.ivory, P.oatmeal, P.charcoal]), pick(c.r, ACCENTS)];
  const xs = n === 1 ? [innerX - innerW / 2 + 0.28] : n === 3 ? [-1, -0.62, 1] : [-1, 1];
  xs.forEach((s, i) => {
    const x = n === 1 ? s : innerX + s * (innerW / 2 - 0.27);
    b.add(cushion(0.44, 0.14, 0.44, 0.45, seg), i === 1 && n === 3 ? 'boucle' : 'fabric', cols[i % cols.length], {
      x,
      y: seatTop + 0.24,
      z: backZ - 0.05,
      rx: -Math.PI / 2 + 0.35,
      ry: s < 0 ? 0.18 : -0.18,
    });
  });
}

const sofa = (seats: number): Builder => (b, c) => {
  const s = sofaCore(b, c, c.w, Math.min(c.d, 1.05), seats, 0, c.d > 1.05 ? (c.d - 1.05) / 2 : 0);
  if (!c.near.has('cushions')) throwCushions(b, c, s.innerX, s.innerW, s.seatTop, s.backZ, seats >= 3 ? 3 : 2);
};

const sofaL: Builder = (b, c) => {
  const main = Math.min(0.98, c.d * 0.55);
  const left = c.variant?.includes('left');
  const chW = Math.min(0.95, c.w * 0.4);
  const s = sofaCore(b, c, c.w, main, Math.max(2, Math.round(c.w / 0.9)), 0, c.d / 2 - main / 2);
  // chaise extension towards the front
  const fab: MatKey = c.variant === 'boucle' ? 'boucle' : 'fabric';
  const col = c.variant === 'boucle' ? P.ivory : c.variant === 'grey' ? P.warmGrey : P.oatmeal;
  const ext = c.d - main;
  const cx = (left ? -1 : 1) * (c.w / 2 - chW / 2);
  const cz = -c.d / 2 + ext / 2 + 0.005;
  b.box(fab, col, chW, 0.21, ext + 0.01, cx, 0.07, cz, 0.03);
  b.box(fab, col, 0.17, 0.53, ext + 0.01, cx + (left ? -1 : 1) * (chW / 2 - 0.085), 0.07, cz, 0.06);
  b.add(cushion(chW - 0.18, 0.15, ext + 0.01, 0.15), fab, col, { x: cx - (left ? -1 : 1) * 0.085, y: 0.355, z: cz });
  for (const sx of [-1, 1]) b.cyl('wood', P.walnut, 0.018, 0.012, 0.07, cx + sx * (chW / 2 - 0.07), 0, -c.d / 2 + 0.07, 8);
  if (!c.near.has('cushions')) throwCushions(b, c, s.innerX, s.innerW, s.seatTop, s.backZ, 3);
};

const armchair: Builder = (b, c) => {
  const variant = c.variant ?? pick(c.r, ['boucle', 'leather', 'boucle']);
  const cc = { ...c, variant };
  const s = sofaCore(b, cc, c.w, c.d, 1);
  throwCushions(b, c, s.innerX, s.innerW, s.seatTop, s.backZ, 0);
  b.add(cushion(0.4, 0.13, 0.4, 0.45), 'fabric', pick(c.r, ACCENTS), { x: s.innerX, y: s.seatTop + 0.22, z: s.backZ - 0.04, rx: -Math.PI / 2 + 0.35 });
};

const diningChair: Builder = (b, c) => {
  // plans draw only the visible part of a chair (≈285 mm): keep the back where drawn, extend the
  // seat to a real 480 mm depth towards the front (under the table)
  const w = Math.min(c.w, 0.5);
  const d = c.d < 0.42 ? 0.48 : Math.min(c.d, 0.55);
  const z0 = c.d / 2 - d / 2;
  diningChairAt(b, c, w, d, z0);
};

function diningChairAt(b: PartBuilder, c: ItemCtx, w: number, d: number, z0: number) {
  const start = b.parts.length;
  const seatH = 0.46;
  const backH = c.h ?? 0.82;
  const lr = 0.014;
  const fx = w / 2 - 0.03;
  const fz = d / 2 - 0.03;
  const wood = c.variant === 'walnut' ? P.walnut : P.oak;
  // legs: front straight, rear continuing up as back posts (slight rake)
  for (const s of [-1, 1]) {
    b.rod('wood', wood, [s * fx, 0, -fz], [s * fx, seatH - 0.03, -fz], lr, 8);
    b.rod('wood', wood, [s * fx, 0, fz + 0.015], [s * (fx - 0.01), backH, fz - 0.02], lr, 8);
  }
  // seat frame + stretchers
  b.box('wood', wood, w - 0.02, 0.035, d - 0.02, 0, seatH - 0.065, 0, 0.005);
  b.rod('wood', wood, [-fx, 0.16, -fz], [fx, 0.16, -fz], 0.009, 6);
  b.rod('wood', wood, [-fx, 0.16, fz], [fx, 0.16, fz], 0.009, 6);
  // upholstered seat pad
  b.add(cushion(w - 0.04, 0.05, d - 0.06, 0.08, b.detail === 'vr' ? [10, 6] : [14, 8]), 'fabric', c.variant === 'boucle' ? P.ivory : P.linen, { x: 0, y: seatH - 0.012, z: -0.01 });
  // curved back rail
  b.add(arcSlab(0.43, 0.45, -0.5, 0.5, 0.11, b.detail === 'vr' ? 8 : 14), 'wood', wood, { x: 0, y: backH - 0.1, z: fz - 0.46 }, 'proj');
  if (z0) for (let i = start; i < b.parts.length; i++) b.parts[i].g.translate(0, 0, z0);
}

const deskChair: Builder = (b, c) => {
  const seatH = 0.47;
  const vr = b.detail === 'vr';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.rod('powder', P.black, [0, 0.07, 0], [Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3], 0.014, 6);
    b.add(new THREE.SphereGeometry(0.025, 8, 6), 'powder', P.black, { x: Math.cos(a) * 0.3, y: 0.025, z: Math.sin(a) * 0.3 }, 'keep');
  }
  b.cyl('metal', P.chrome, 0.022, 0.022, seatH - 0.12, 0, 0.07, 0, 10);
  b.add(cushion(0.48, 0.08, 0.46, 0.1, vr ? [10, 6] : [16, 8]), 'fabric', P.charcoal, { x: 0, y: seatH, z: 0 });
  b.add(cushion(0.44, 0.5, 0.07, 0.12, vr ? [10, 6] : [16, 8]), 'fabric', P.charcoal, { x: 0, y: seatH + 0.35, z: 0.22, rx: 0.12 });
  for (const s of [-1, 1]) b.box('powder', P.black, 0.04, 0.02, 0.26, s * 0.25, seatH + 0.17, 0.02, 0.008);
  for (const s of [-1, 1]) b.rod('powder', P.black, [s * 0.25, seatH, 0.08], [s * 0.25, seatH + 0.17, 0.08], 0.01, 6);
};

/* ------------------------------------------------------------------ tables & storage */

const coffeeTable: Builder = (b, c) => {
  const h = c.h ?? 0.4;
  const round = Math.abs(c.w - c.d) < 0.15 || c.variant === 'round';
  if (round) {
    const r = Math.min(c.w, c.d) / 2;
    b.add(lathe([[0, 0], [r * 0.92, 0], [r * 0.95, h - 0.04], [r, h - 0.03], [r, h], [0, h]], b.detail === 'vr' ? 24 : 40), 'stone', P.travertine, { x: 0, y: 0, z: 0 }, 'proj');
    bookStack(b, c.r, -r * 0.3, h, 0.05, 2, 0.4);
    vase(b, c.r, r * 0.35, h, -r * 0.1, 0.2);
    return;
  }
  const t = 0.035;
  b.box('wood', c.variant === 'walnut' ? P.walnut : P.oak, c.w, t, c.d, 0, h - t, 0, 0.012);
  b.box('wood', c.variant === 'walnut' ? P.walnut : P.oak, c.w - 0.12, 0.02, c.d - 0.1, 0, 0.1, 0, 0.004);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('powder', P.black, 0.025, h - t, 0.025, sx * (c.w / 2 - 0.05), 0, sz * (c.d / 2 - 0.05));
  const top = c.near.has('books') ? h : bookStack(b, c.r, -c.w * 0.22, h, 0, 3, 0.2);
  b.add(lathe([[0, 0], [0.04, 0], [0.11, 0.05], [0.12, 0.06], [0.11, 0.06]], 20), 'gloss', P.ivory, { x: c.w * 0.22, y: h, z: 0.02 }, 'keep');
  b.add(new THREE.SphereGeometry(0.03, 10, 8), 'matte', P.ochre, { x: -c.w * 0.22, y: top + 0.03, z: 0 }, 'keep');
  vase(b, c.r, c.w * 0.05, h, -c.d * 0.15, 0.16, 'olive');
  b.box('paint', '#ecdcc0', 0.3, 0.012, 0.22, -c.w * 0.05, 0.12, 0.02, 0.003);
};

const sideTable: Builder = (b, c) => {
  const h = c.h ?? 0.55;
  const r = Math.min(c.w, c.d) / 2;
  b.cyl('stone', P.quartz, r, r, 0.025, 0, h - 0.025, 0, 28);
  b.cyl('metal', P.brass, 0.018, 0.018, h - 0.035, 0, 0.012, 0, 10);
  b.cyl('metal', P.brass, r * 0.6, r * 0.62, 0.012, 0, 0, 0, 24);
  vase(b, c.r, r * 0.2, h, 0, 0.18, 'none');
};

function cabinetDoors(b: PartBuilder, mat: MatKey, col: string, w: number, y0: number, h: number, zFront: number, n: number, handle: 'bar' | 'knob' | 'tall' | 'none', handleCol = P.brass, x0 = 0) {
  const dw = w / n;
  for (let i = 0; i < n; i++) {
    const x = x0 - w / 2 + dw * (i + 0.5);
    b.box(mat, col, dw - 0.004, h - 0.004, 0.018, x, y0 + 0.002, zFront - 0.009, 0.003);
    const hx = n === 1 ? x + dw * 0.35 : i % 2 === 0 ? x + dw / 2 - 0.035 : x - dw / 2 + 0.035;
    if (handle === 'bar') b.box('metal', handleCol, Math.min(0.16, dw * 0.5), 0.012, 0.018, x, y0 + h - 0.05, zFront - 0.027, 0.004);
    else if (handle === 'knob') b.add(new THREE.SphereGeometry(0.014, 10, 8), 'metal', handleCol, { x, y: y0 + h / 2, z: zFront - 0.03 }, 'keep');
    else if (handle === 'tall') b.box('metal', handleCol, 0.014, Math.min(0.9, h * 0.45), 0.02, hx, y0 + h * 0.3, zFront - 0.028, 0.005);
  }
}

const tvScreen: Builder = (b, c) => {
  // wall-mounted / standing flat screen: size = [width, thickness], heightMm = panel height
  const th = c.h ?? c.w * 0.5625;
  const t = Math.min(0.05, Math.max(0.025, c.d * 0.5));
  b.box('powder', P.black, c.w, th, t, 0, 0, c.d / 2 - t / 2, 0.004);
  b.box('gloss', P.screen, c.w - 0.012, th - 0.012, 0.002, 0, 0.006, c.d / 2 - t - 0.001);
};

const tvUnit: Builder = (b, c) => {
  if (c.variant === 'screen') return tvScreen(b, c);
  const h = c.h ?? 0.48;
  const legH = 0.1;
  const col = c.variant === 'oak' ? P.oak : P.walnut;
  b.box('wood', col, c.w, h - legH, c.d, 0, legH, 0, 0.01);
  const n = Math.max(2, Math.round(c.w / 0.5));
  cabinetDoors(b, 'wood', col, c.w - 0.02, legH + 0.02, h - legH - 0.04, -c.d / 2, n, 'knob', P.brass);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('powder', P.black, 0.015, 0.012, legH, sx * (c.w / 2 - 0.08), 0, sz * (c.d / 2 - 0.06), 8);
  // decor (the TV itself is a separate 'screen' item in the layout)
  vase(b, c.r, -c.w / 2 + 0.18, h, 0, 0.32, 'pampas');
  bookStack(b, c.r, c.w / 2 - 0.25, h, 0, 3, -0.1);
  b.add(new THREE.SphereGeometry(0.05, 14, 10), 'gloss', P.terracotta, { x: c.w / 2 - 0.42, y: h + 0.05, z: 0.02 }, 'keep');
};

const consoleTable: Builder = (b, c) => {
  const h = c.h ?? 0.8;
  if (c.d > 0.38 && c.w > 1.2) {
    // sideboard / credenza
    const legH = 0.12;
    b.box('wood', P.walnut, c.w, h - legH, c.d, 0, legH, 0, 0.01);
    cabinetDoors(b, 'paint', P.greige, c.w - 0.03, legH + 0.02, h - legH - 0.04, -c.d / 2, Math.max(2, Math.round(c.w / 0.45)), 'knob');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('wood', P.walnut, 0.018, 0.012, legH, sx * (c.w / 2 - 0.08), 0, sz * (c.d / 2 - 0.07), 8);
  } else {
    b.box('wood', P.oak, c.w, 0.03, c.d, 0, h - 0.03, 0, 0.008);
    b.box('wood', P.oak, c.w - 0.06, 0.02, c.d - 0.04, 0, 0.18, 0, 0.004);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('powder', P.black, 0.022, h - 0.03, 0.022, sx * (c.w / 2 - 0.03), 0, sz * (c.d / 2 - 0.03));
    b.add(lathe([[0, 0], [0.09, 0], [0.13, 0.08], [0.13, 0.16], [0.12, 0.16]], 18), 'matte', '#c6b49b', { x: c.w * 0.25, y: 0.2, z: 0 }, 'keep');
  }
  vase(b, c.r, -c.w * 0.3, h, 0, 0.34, 'olive');
  bookStack(b, c.r, c.w * 0.1, h, 0, 2, 0.3);
  b.add(lathe([[0, 0], [0.03, 0], [0.12, 0.04], [0.13, 0.05], [0.12, 0.05]], 18), 'stone', P.quartz, { x: c.w * 0.3, y: h, z: 0 }, 'keep');
};

const diningTable: Builder = (b, c) => {
  const h = c.h ?? 0.75;
  const t = 0.04;
  const col = c.variant === 'walnut' ? P.walnut : P.oak;
  const round = Math.abs(c.w - c.d) < 0.1;
  if (round) {
    const r = Math.min(c.w, c.d) / 2;
    b.cyl('wood', col, r, r - 0.01, t, 0, h - t, 0, 40);
    b.add(lathe([[0, 0], [0.26, 0], [0.26, 0.03], [0.09, 0.08], [0.07, h - t - 0.1], [0.14, h - t]], 24), 'wood', col, { x: 0, y: 0, z: 0 }, 'proj');
  } else {
    b.box('wood', col, c.w, t, c.d, 0, h - t, 0, 0.012);
    b.box('wood', col, c.w - 0.16, 0.07, c.d - 0.16, 0, h - t - 0.07, 0, 0.004);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = sx * (c.w / 2 - 0.09);
        const z = sz * (c.d / 2 - 0.08);
        b.add(new THREE.CylinderGeometry(0.028, 0.02, h - t, 10), 'wood', col, { x, y: (h - t) / 2, z }, 'projY');
      }
  }
  // centrepiece: runner + vase with olive branches + bowl
  if (!round && c.w > 1.2) b.box('fabricDS', P.linen, c.w * 0.62, 0.003, 0.36, 0, h, 0);
  if (!c.near.has('vase')) vase(b, c.r, -0.12, h, 0, 0.3, 'olive');
  b.add(lathe([[0, 0], [0.05, 0], [0.13, 0.06], [0.14, 0.07], [0.13, 0.07]], 20), 'gloss', P.ivory, { x: 0.2, y: h, z: 0.02 }, 'keep');
  for (let i = 0; i < 3; i++)
    b.add(new THREE.SphereGeometry(0.035, 10, 8), 'matte', i === 1 ? P.ochre : '#d27a3a', { x: 0.2 + (i - 1) * 0.05, y: h + 0.05, z: 0.02 + (i % 2) * 0.03 }, 'keep');
};

const bookshelf: Builder = (b, c) => {
  const h = c.h ?? 1.9;
  const col = c.variant === 'walnut' ? P.walnut : P.oak;
  const t = 0.022;
  b.box('wood', col, t, h, c.d, -c.w / 2 + t / 2, 0, 0);
  b.box('wood', col, t, h, c.d, c.w / 2 - t / 2, 0, 0);
  b.box('paint', P.cabinetWhite, c.w - 2 * t, h - 0.08, 0.008, 0, 0.06, c.d / 2 - 0.004);
  const n = Math.max(3, Math.round(h / 0.36));
  const sh = (h - 0.06) / n;
  for (let i = 0; i <= n; i++) b.box('wood', col, c.w - 2 * t, t, c.d, 0, i === 0 ? 0.04 : 0.04 + i * sh - t, 0);
  for (let i = 0; i < n; i++) {
    const y0 = 0.04 + t + i * sh;
    const r = c.r();
    const inner = c.w - 2 * t - 0.02;
    if (r < 0.55) bookRow(b, c.r, -inner / 2, -inner / 2 + inner * (0.45 + c.r() * 0.35), y0, 0, c.d * 0.9, sh - 0.04);
    else if (r < 0.8) {
      bookStack(b, c.r, -inner / 4, y0, 0, 4);
      vase(b, c.r, inner / 4, y0, 0, Math.min(0.22, sh - 0.06));
    } else {
      vase(b, c.r, -inner / 5, y0, 0, Math.min(0.24, sh - 0.06));
      bookRow(b, c.r, 0, inner / 2, y0, 0, c.d * 0.9, sh - 0.04);
    }
  }
};

const rug: Builder = (b, c) => {
  const cell =
    c.variant === 'vintage' ? 1 : c.variant === 'modern' ? 2 : c.variant === 'jute' ? 3 : c.variant === 'beni' ? 0 : c.roomKind === 'bedroom' ? pick(c.r, [1, 2]) : /dining/i.test(c.variant ?? '') ? 3 : 0;
  const g = new THREE.PlaneGeometry(c.w, c.d);
  atlasUV(g, cell % 2, Math.floor(cell / 2), 2, RUG_CELLS / 2);
  b.add(g, 'rug', '#ffffff', { y: 0.012, rx: -Math.PI / 2 }, 'keep');
  const edge = ['#e9dcc6', '#b9876a', '#c5bba9', '#5c564f'][cell];
  b.box('fabric', edge, c.w, 0.011, c.d, 0, 0, 0);
};

/* ------------------------------------------------------------------ bedroom */

const bed = (kind: 'king' | 'queen' | 'single'): Builder => (b, c) => {
  const vr = b.detail === 'vr';
  const w = c.w;
  const d = c.d;
  const headT = 0.1;
  const frameCol = c.variant === 'oak' ? P.oak : pick(c.r, [P.linen, P.oatmeal, P.warmGrey, P.sage]);
  const frameMat: MatKey = c.variant === 'oak' ? 'wood' : 'fabric';
  const L = d - headT;
  const zc = -d / 2 + L / 2; // bed body centre (z)
  // plinth + upholstered base
  b.box('powder', P.black, w - 0.12, 0.06, L - 0.12, 0, 0, zc);
  b.box(frameMat, frameCol, w, 0.24, L, 0, 0.05, zc, 0.03);
  // mattress
  const mw = w - 0.05;
  const mL = L - 0.05;
  b.box('fabric', P.sheet, mw, 0.22, mL, 0, 0.28, zc, 0.06);
  const top = BED_TOP;
  // headboard: upholstered vertical channels
  const hbH = c.h ?? (kind === 'single' ? 1.0 : 1.15);
  b.box(frameMat, frameCol, w + 0.08, hbH, 0.06, 0, 0, d / 2 - 0.03, 0.02);
  const nCh = Math.max(3, Math.round((w + 0.04) / 0.28));
  const chW = (w + 0.04) / nCh;
  for (let i = 0; i < nCh; i++)
    b.box(frameMat === 'wood' ? 'fabric' : frameMat, frameCol, chW - 0.012, hbH - 0.35, 0.07, -(w + 0.04) / 2 + chW * (i + 0.5), 0.33, d / 2 - 0.09, 0.03);
  // duvet (drapes over the sides & foot) with a turned-down band
  const duvetL = mL * 0.74;
  const duvetCol = pick(c.r, [P.sheet, P.ivory, '#e7e1d6']);
  b.add(drape(mw + 0.01, duvetL, 0.25, 0.25, 0.06, 0.008, vr ? 16 : 26, vr ? 14 : 22, c.r() * 10), 'fabricDS', duvetCol, { y: top + 0.035, z: zc - mL / 2 + duvetL / 2 }, 'proj');
  b.box('fabric', duvetCol, mw + 0.02, 0.05, 0.28, 0, top + 0.01, zc - mL / 2 + duvetL + 0.1, 0.025);
  // throw across the foot (unless the layout dresses the bed with its own throw)
  const throwCol = pick(c.r, [P.terracotta, P.sage, P.ochre, P.charcoal, P.rust]);
  if (!c.near.has('throwBlanket')) b.add(drape(mw + 0.03, 0.42, 0.28, 0.12, 0.05, 0.006, vr ? 12 : 18, vr ? 6 : 10, c.r() * 10), 'fabricDS', throwCol, { y: top + 0.05, z: zc - mL / 2 + 0.3 }, 'proj');
  // pillows: sleeping pillows flat-ish, euro shams upright, one lumbar accent
  const seg: [number, number] = vr ? [12, 8] : [16, 10];
  const pz = d / 2 - headT - 0.32;
  const nP = kind === 'single' ? 1 : 2;
  const pw = Math.min(0.7, (mw - 0.08) / nP);
  for (let i = 0; i < nP; i++) {
    const x = nP === 1 ? 0 : (i - 0.5) * (pw + 0.03);
    b.add(cushion(pw * 0.95, 0.5, 0.17, 0.4, seg), 'fabric', P.sheet, { x, y: top + 0.27, z: pz + 0.15, rx: 0.32 });
    b.add(cushion(pw, 0.16, 0.45, 0.45, seg), 'fabric', duvetCol, { x, y: top + 0.08, z: pz - 0.12, rx: -0.12 });
  }
  if (kind !== 'single' && !c.near.has('cushions')) b.add(cushion(0.55, 0.3, 0.13, 0.45, seg), 'fabric', throwCol === P.charcoal ? P.ochre : throwCol, { x: 0, y: top + 0.2, z: pz - 0.33, rx: 0.3 });
};

const nightstand: Builder = (b, c) => {
  const h = c.h ?? 0.52;
  const legH = 0.14;
  const col = c.variant === 'oak' ? P.oak : P.walnut;
  b.box('wood', col, c.w, h - legH, c.d, 0, legH, 0, 0.012);
  const dh = (h - legH - 0.03) / 2;
  for (let i = 0; i < 2; i++) {
    const y = legH + 0.015 + i * dh;
    b.box('wood', col, c.w - 0.03, dh - 0.006, 0.012, 0, y, -c.d / 2 - 0.006, 0.003);
    b.box('metal', P.brass, 0.1, 0.01, 0.014, 0, y + dh * 0.55, -c.d / 2 - 0.018, 0.004);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('metal', P.brass, 0.011, 0.009, legH, sx * (c.w / 2 - 0.04), 0, sz * (c.d / 2 - 0.04), 8);
  if (!c.hasLamp) tableLampAt(b, c.r, c.w * 0.12, h, c.d * 0.08, 0.46);
  bookStack(b, c.r, -c.w * 0.22, h, -c.d * 0.12, 2, 0.3);
};

const wardrobe: Builder = (b, c) => {
  const h = c.h ?? 2.25;
  const col = c.variant === 'oak' ? P.oak : c.variant === 'sage' ? P.sageCab : pick(c.r, [P.greige, P.cabinetWhite, P.greige]);
  const mat: MatKey = c.variant === 'oak' ? 'wood' : 'paint';
  b.box('powder', P.black, c.w - 0.04, 0.08, c.d - 0.06, 0, 0, 0.02);
  b.box('paint', col, c.w, h - 0.08, c.d - 0.02, 0, 0.08, 0.01);
  const n = Math.max(2, Math.round(c.w / 0.5));
  cabinetDoors(b, mat, col, c.w, 0.08, h - 0.08, -c.d / 2 + 0.01, n, c.variant === 'storage' ? 'none' : 'tall', P.brass);
};

const dresser: Builder = (b, c) => {
  const h = c.h ?? 0.8;
  const legH = 0.12;
  b.box('wood', P.walnut, c.w, h - legH, c.d, 0, legH, 0, 0.01);
  const cols = c.w > 1 ? 2 : 1;
  const rows = 3;
  const dw = (c.w - 0.03) / cols;
  const dh = (h - legH - 0.03) / rows;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = -c.w / 2 + 0.015 + dw * (i + 0.5);
      const y = legH + 0.015 + j * dh;
      b.box('wood', P.walnut, dw - 0.006, dh - 0.006, 0.012, x, y, -c.d / 2 - 0.006, 0.003);
      b.box('metal', P.brass, 0.12, 0.01, 0.014, x, y + dh * 0.55, -c.d / 2 - 0.018, 0.004);
    }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('wood', P.walnut, 0.02, 0.014, legH, sx * (c.w / 2 - 0.06), 0, sz * (c.d / 2 - 0.06), 8);
  vase(b, c.r, -c.w * 0.3, h, 0, 0.3, 'pampas');
  bookStack(b, c.r, c.w * 0.25, h, 0, 3, 0.2);
};

const desk: Builder = (b, c) => {
  const h = c.h ?? 0.75;
  b.box('wood', P.oak, c.w, 0.03, c.d, 0, h - 0.03, 0, 0.008);
  for (const sx of [-1, 1]) {
    const x = sx * (c.w / 2 - 0.05);
    b.rod('powder', P.black, [x, 0, -c.d / 2 + 0.06], [x, h - 0.03, -c.d / 2 + 0.1], 0.01, 6);
    b.rod('powder', P.black, [x, 0, c.d / 2 - 0.06], [x, h - 0.03, c.d / 2 - 0.1], 0.01, 6);
    b.rod('powder', P.black, [x, 0.01, -c.d / 2 + 0.06], [x, 0.01, c.d / 2 - 0.06], 0.008, 6);
  }
  // laptop + lamp + books + small plant
  b.box('metal', P.steel, 0.32, 0.012, 0.22, -c.w * 0.05, h, -0.02, 0.006);
  b.box('metal', P.steel, 0.32, 0.21, 0.008, -c.w * 0.05, h + 0.01, 0.09, 0.004, { rx: -0.25 });
  b.box('gloss', P.screen, 0.3, 0.18, 0.001, -c.w * 0.05, h + 0.025, 0.084, 0, { rx: -0.25 });
  bookStack(b, c.r, c.w * 0.3, h, 0.05, 3, 0.2);
  pot(b, c.r, -c.w * 0.36, h, 0.08, 0.06, 0.1);
  foliage(b, c.r, 'palm', -c.w * 0.36, h + 0.08, 0.08, 0.3, 0.1);
};

/* ------------------------------------------------------------------ kitchen */

const kitchenCounter: Builder = (b, c) => {
  const util = c.roomKind === 'utility';
  const top = 0.9;
  const ct = 0.04;
  const front = util ? P.cabinetWhite : c.variant === 'white' ? P.cabinetWhite : c.variant === 'oak' ? P.oak : P.sageCab;
  const frontMat: MatKey = c.variant === 'oak' ? 'wood' : 'paint';
  const d = c.d;
  // plinth (recessed), carcass, fronts
  b.box('powder', P.charcoal, c.w, 0.1, d - 0.08, 0, 0, 0.03);
  b.box('paint', P.cabinetWhite, c.w, top - ct - 0.1, d - 0.03, 0, 0.1, 0.015);
  const n = Math.max(1, Math.round(c.w / 0.6));
  const dw = c.w / n;
  for (let i = 0; i < n; i++) {
    const x = -c.w / 2 + dw * (i + 0.5);
    const hobHere = (c.hobs ?? []).some((h) => Math.abs(h.x - x) < dw / 2);
    if (hobHere) {
      // built-in oven under the hob
      b.box('gloss', P.screen, dw - 0.006, 0.58, 0.02, x, 0.12, -d / 2 + 0.02);
      b.box('metal', P.steel, dw - 0.05, 0.015, 0.02, x, 0.6, -d / 2 + 0.002);
      b.box('metal', P.steel, dw - 0.006, 0.12, 0.02, x, 0.72, -d / 2 + 0.02);
      continue;
    }
    const drawers = i % 3 === 1;
    if (drawers) {
      const hs = [0.2, 0.24, 0.3];
      let y = 0.102;
      for (const hh of hs) {
        b.box(frontMat, front, dw - 0.004, hh - 0.004, 0.018, x, y, -d / 2 + 0.03);
        b.box('metal', P.brass, Math.min(0.2, dw * 0.45), 0.01, 0.016, x, y + hh - 0.045, -d / 2 + 0.012, 0.004);
        y += hh;
      }
    } else {
      b.box(frontMat, front, dw - 0.004, top - ct - 0.102, 0.018, x, 0.102, -d / 2 + 0.03);
      b.box('metal', P.brass, Math.min(0.2, dw * 0.45), 0.01, 0.016, x, top - ct - 0.06, -d / 2 + 0.012, 0.004);
    }
  }
  // worktop with sink cut-outs (extruded)
  const shape = new THREE.Shape();
  const W = c.w / 2;
  const fz = -d / 2 - 0.015;
  const bz = d / 2;
  // shape coords (x, ys) with ys = −z (see rotation below)
  shape.moveTo(-W, -bz);
  shape.lineTo(W, -bz);
  shape.lineTo(W, -fz);
  shape.lineTo(-W, -fz);
  shape.closePath();
  for (const s of c.sinks ?? []) {
    const hw = s.w / 2;
    const hd = s.d / 2;
    const hole = new THREE.Path();
    hole.moveTo(s.x - hw, -(s.z - hd));
    hole.lineTo(s.x - hw, -(s.z + hd));
    hole.lineTo(s.x + hw, -(s.z + hd));
    hole.lineTo(s.x + hw, -(s.z - hd));
    hole.closePath();
    shape.holes.push(hole);
  }
  const wt = new THREE.ExtrudeGeometry(shape, { depth: ct, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, steps: 1 });
  b.add(wt, 'stone', P.quartz, { y: top - ct, rx: -Math.PI / 2 }, 'proj');
  // splashback (marble) along the back wall
  b.box('stone', '#f4f1ec', c.w, util ? 0.3 : 0.55, 0.012, 0, top, d / 2 - 0.006);
  if (util) return;
  // under-cabinet light strip + wall cabinets (skip over windows); chimney hood over hobs
  const wcY = 1.45;
  const wcH = 0.75;
  const wcD = 0.34;
  const blocked = (x0: number, x1: number) => (c.noWallCab ?? []).some(([a, z]) => x1 > a + 0.02 && x0 < z - 0.02);
  for (let i = 0; i < n; i++) {
    const x0 = -c.w / 2 + dw * i;
    const x1 = x0 + dw;
    const x = (x0 + x1) / 2;
    const hob = (c.hobs ?? []).find((h) => Math.abs(h.x - x) < dw / 2);
    if (hob) {
      b.box('metal', P.steel, 0.6, 0.12, 0.48, hob.x, 1.55, d / 2 - 0.24, 0.01);
      b.box('metal', P.steel, 0.26, WALL_H - 1.67, 0.24, hob.x, 1.67, d / 2 - 0.12);
      continue;
    }
    if (blocked(x0, x1)) continue;
    b.box('paint', P.cabinetWhite, dw, wcH, wcD, x, wcY, d / 2 - wcD / 2);
    b.box('paint', P.cabinetWhite, dw - 0.004, wcH - 0.004, 0.018, x, wcY + 0.002, d / 2 - wcD - 0.009);
    b.box('metal', P.brass, 0.012, 0.16, 0.016, i % 2 ? x - dw / 2 + 0.04 : x + dw / 2 - 0.04, wcY + 0.03, d / 2 - wcD - 0.026, 0.004);
    b.box('bulb', '#ffe2b8', dw - 0.04, 0.006, 0.02, x, wcY - 0.006, d / 2 - wcD + 0.05);
  }
};

const hob: Builder = (b, c) => {
  // Indian-style 4-burner gas hob on glass
  const w = Math.min(c.w, 0.75);
  const d = Math.min(c.d, 0.52);
  b.box('gloss', '#111214', w, 0.008, d, 0, 0.002, 0, 0.004);
  const pts = [[-0.17, -0.1], [0.17, -0.1], [-0.17, 0.12], [0.17, 0.12]];
  pts.forEach(([x, z], i) => {
    const rr = i === 1 ? 0.06 : 0.045;
    b.cyl('metal', P.brass, rr, rr * 1.1, 0.02, x * (w / 0.75), 0.01, z * (d / 0.52), 16);
    b.cyl('powder', P.black, rr * 0.5, rr * 0.5, 0.006, x * (w / 0.75), 0.03, z * (d / 0.52), 12);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = x * (w / 0.75);
      const cz = z * (d / 0.52);
      b.rod('powder', P.black, [cx + Math.cos(a) * rr * 0.9, 0.045, cz + Math.sin(a) * rr * 0.9], [cx + Math.cos(a) * 0.095, 0.045, cz + Math.sin(a) * 0.095], 0.005, 4);
    }
  });
  for (let i = 0; i < 4; i++) b.cyl('metal', P.steel, 0.014, 0.014, 0.02, (-0.21 + i * 0.14) * (w / 0.75), 0.01, -d / 2 + 0.035, 12);
};

const sink: Builder = (b, c) => {
  const hole = sinkHole(c.w, c.d, c.variant);
  const hw = hole.w;
  const hd = hole.d;
  const x = hole.x;
  // basin interior (top at counter level = y 0)
  b.add(openBox(hw, 0.2, hd), 'metal', P.steel, { x, y: -0.1 }, 'proj');
  b.cyl('powder', '#3a3a3a', 0.04, 0.04, 0.003, x, -0.199, 0, 16);
  if (c.variant === 'drainer' && c.w > 0.8) {
    // stainless drainer grooves beside the bowl
    const dx0 = x + hw / 2 + 0.04;
    const dw = c.w / 2 - 0.05 - dx0;
    b.box('metal', P.steel, dw, 0.003, hd, dx0 + dw / 2, 0, 0);
    for (let i = 0; i < 6; i++) b.box('metal', '#a9acae', dw - 0.04, 0.002, 0.006, dx0 + dw / 2, 0.003, -hd / 2 + 0.05 + i * ((hd - 0.1) / 5));
  }
  // tap (gooseneck) at the back
  const tz = hd / 2 + 0.05;
  b.cyl('metal', P.brass, 0.022, 0.026, 0.06, x, 0, tz, 14);
  b.add(tube([[x, 0.05, tz], [x, 0.32, tz], [x, 0.4, tz - 0.08], [x, 0.34, tz - 0.2]], 0.012, 20, 8), 'metal', P.brass, undefined, 'keep');
  b.box('metal', P.brass, 0.012, 0.012, 0.09, x + 0.04, 0.12, tz, 0.004);
  // dish soap
  b.cyl('gloss', P.sage, 0.03, 0.03, 0.17, x - hw / 2 - 0.08, 0, tz - 0.02, 12);
};

const fridge: Builder = (b, c) => {
  const h = c.h ?? 1.85;
  const col = P.steel;
  b.box('metal', col, c.w, h, c.d - 0.05, 0, 0, 0.025, 0.02);
  const dw = c.w / 2;
  const fh = h * 0.66;
  b.box('metal', col, dw - 0.006, fh - 0.006, 0.05, -dw / 2, h - fh, -c.d / 2 + 0.025, 0.01);
  b.box('metal', col, dw - 0.006, fh - 0.006, 0.05, dw / 2, h - fh, -c.d / 2 + 0.025, 0.01);
  b.box('metal', col, c.w - 0.006, h - fh - 0.02, 0.05, 0, 0.01, -c.d / 2 + 0.025, 0.01);
  for (const s of [-1, 1]) b.box('metal', P.chrome, 0.02, fh * 0.45, 0.03, s * 0.03, h - fh * 0.7, -c.d / 2 - 0.02, 0.008);
  b.box('metal', P.chrome, c.w * 0.5, 0.02, 0.03, 0, h - fh - 0.06, -c.d / 2 - 0.02, 0.008);
  b.box('gloss', '#15171a', 0.12, 0.16, 0.004, -dw / 2, h - 0.45, -c.d / 2 - 0.002);
};

const washingMachine: Builder = (b, c) => {
  const h = c.h ?? 0.85;
  b.box('gloss', P.white, c.w, h, c.d, 0, 0, 0, 0.02);
  b.box('gloss', '#e6e6e6', c.w - 0.04, 0.1, 0.01, 0, h - 0.13, -c.d / 2 - 0.004, 0.004);
  b.add(new THREE.TorusGeometry(0.17, 0.025, 10, 32), 'metal', P.chrome, { x: 0, y: h * 0.45, z: -c.d / 2 - 0.01 }, 'keep');
  b.add(new THREE.CircleGeometry(0.16, 32), 'gloss', '#28323a', { x: 0, y: h * 0.45, z: -c.d / 2 - 0.004, ry: Math.PI }, 'keep');
  b.cyl('metal', P.chrome, 0.03, 0.03, 0.02, c.w * 0.3, h - 0.08, -c.d / 2 - 0.005, 16, { rx: Math.PI / 2 });
};

const dishwasher: Builder = (b, c) => {
  b.box('paint', P.sageCab, c.w, 0.76, c.d, 0, 0.1, 0, 0.004);
  b.box('metal', P.brass, c.w * 0.45, 0.01, 0.016, 0, 0.8, -c.d / 2 - 0.008, 0.004);
};

/* ------------------------------------------------------------------ bath */

const wc: Builder = (b, c) => {
  const vr = b.detail === 'vr';
  const d = Math.max(0.55, c.d);
  const cisD = 0.17;
  const bowlL = Math.min(0.56, d - cisD + 0.02);
  const bz = d / 2 - cisD - bowlL / 2 + 0.03;
  // pan: lathe, stretched front-back into an oval
  const g = lathe([[0.0, 0], [0.13, 0], [0.12, 0.08], [0.15, 0.25], [0.19, 0.37], [0.19, 0.4], [0.0, 0.4]], vr ? 16 : 28);
  g.scale(1, 1, bowlL / 0.38);
  b.add(g, 'gloss', P.white, { x: 0, y: 0, z: bz }, 'proj');
  // closed lid
  const lid = cushion(0.37, 0.035, bowlL - 0.02, 0.1, [16, 6]);
  b.add(lid, 'gloss', P.white, { x: 0, y: 0.42, z: bz });
  // cistern + flush buttons
  b.box('gloss', P.white, 0.38, 0.4, cisD, 0, 0.4, d / 2 - cisD / 2, 0.03);
  b.cyl('metal', P.chrome, 0.025, 0.025, 0.008, -0.04, 0.8, d / 2 - cisD / 2, 16);
  b.cyl('metal', P.chrome, 0.025, 0.025, 0.008, 0.04, 0.8, d / 2 - cisD / 2, 16);
  // health faucet (wall)
  b.box('metal', P.chrome, 0.05, 0.08, 0.03, 0.32, 0.55, d / 2 - 0.015, 0.008);
  b.rod('metal', P.chrome, [0.32, 0.6, d / 2 - 0.04], [0.33, 0.72, d / 2 - 0.05], 0.014, 8);
  // toilet roll on brass holder
  b.rod('metal', P.brass, [-Math.min(0.34, c.w / 2 + 0.03), 0.68, d / 2], [-Math.min(0.34, c.w / 2 + 0.03), 0.68, d / 2 - 0.14], 0.006, 6);
  b.cyl('fabric', P.white, 0.055, 0.055, 0.1, -0.34, 0.68, d / 2 - 0.08, 14, { rz: Math.PI / 2 });
};

function roundMirror(b: PartBuilder, x: number, yc: number, z: number, r: number) {
  b.add(new THREE.CircleGeometry(r, 40), 'mirror', '#ffffff', { x, y: yc, z, ry: Math.PI }, 'keep');
  b.add(new THREE.TorusGeometry(r + 0.008, 0.012, 8, 48), 'metal', P.brass, { x, y: yc, z: z + 0.005 }, 'keep');
}

const wallBasin: Builder = (b, c) => {
  const top = 0.84;
  const w = Math.min(c.w, 0.55);
  b.box('gloss', P.white, w, 0.14, Math.min(c.d, 0.42), 0, top - 0.14, 0, 0.03);
  b.box('gloss', '#e9e7e3', w - 0.08, 0.004, Math.min(c.d, 0.42) - 0.1, 0, top - 0.002, -0.02, 0);
  const tz = c.d / 2 - 0.05;
  b.cyl('powder', P.black, 0.018, 0.022, 0.18, 0, top, tz, 12);
  b.rod('powder', P.black, [0, top + 0.17, tz], [0, top + 0.17, tz - 0.12], 0.011, 8);
  if (!c.hasMirror) roundMirror(b, 0, top + 0.7, c.d / 2 - 0.01, 0.3);
};

const basinVanity: Builder = (b, c) => {
  if (c.variant === 'wall-hung') return wallBasin(b, c);
  const top = 0.84;
  const body = 0.38;
  const col = c.variant === 'walnut' ? P.walnut : P.oak;
  // wall-hung oak vanity with two drawers
  b.box('wood', col, c.w, body, c.d - 0.02, 0, top - 0.02 - body, 0.01, 0.006);
  b.box('wood', col, c.w - 0.01, body / 2 - 0.006, 0.012, 0, top - 0.02 - body / 2, -c.d / 2 + 0.004, 0.003);
  b.box('wood', col, c.w - 0.01, body / 2 - 0.006, 0.012, 0, top - 0.02 - body, -c.d / 2 + 0.004, 0.003);
  b.box('stone', P.quartz, c.w, 0.02, c.d, 0, top - 0.02, 0, 0.004);
  // vessel basin(s) + tall black mixers
  const basins = c.w >= 1.3 ? [-c.w / 4, c.w / 4] : [c.w > 0.9 ? -0.1 : 0];
  const bx = basins[0];
  const tz = c.d / 2 - 0.06;
  for (const x of basins) {
    b.add(lathe([[0, 0], [0.12, 0], [0.18, 0.05], [0.2, 0.12], [0.19, 0.125], [0.17, 0.06], [0.1, 0.03], [0, 0.03]], 28), 'gloss', P.white, { x, y: top, z: -0.02 }, 'keep');
    b.cyl('powder', P.black, 0.018, 0.022, 0.3, x, top, tz, 12);
    b.rod('powder', P.black, [x, top + 0.29, tz], [x, top + 0.29, tz - 0.17], 0.011, 8);
    b.box('powder', P.black, 0.01, 0.01, 0.07, x + 0.04, top + 0.24, tz, 0.003);
  }
  // towel + soap
  // hand towel on a brass ring beside the vanity + a small plant on the counter
  // headset review: the ring sat 16 cm past the vanity edge and came out of the side wall in corner vanities
  const tx = c.w / 2 - 0.11;
  b.add(new THREE.TorusGeometry(0.075, 0.006, 6, 24), 'metal', P.brass, { x: tx, y: top + 0.42, z: c.d / 2 - 0.03 }, 'keep');
  b.add(drape(0.24, 0.03, 0.0, 0.0, 0.02, 0.004, 6, 4, 3), 'fabricDS', P.ivory, { x: tx, y: top + 0.36, z: c.d / 2 - 0.04, rx: Math.PI / 2 });
  b.box('fabric', P.ivory, 0.26, 0.42, 0.025, tx, top - 0.06, c.d / 2 - 0.045, 0.01);
  pot(b, c.r, -c.w / 2 + 0.1, top, c.d / 2 - 0.12, 0.055, 0.1);
  foliage(b, c.r, 'palm', -c.w / 2 + 0.1, top + 0.09, c.d / 2 - 0.12, 0.32, 0.12);
  const ex = basins.length > 1 ? 0 : c.w / 2 - 0.15;
  b.box('fabric', P.oatmeal, 0.22, 0.05, 0.16, ex, top, 0.02, 0.02);
  b.cyl('matte', P.charcoal, 0.03, 0.03, 0.15, ex + 0.05, top, -0.12, 12);
  if (!c.hasMirror) {
    roundMirror(b, bx, top + 0.7, c.d / 2 - 0.01, Math.min(0.32, c.w / 2 - 0.04));
    // brass wall sconce
    const sx = Math.min(bx + Math.min(0.32, c.w / 2 - 0.04) + 0.12, c.w / 2 - 0.06);
    b.cyl('metal', P.brass, 0.03, 0.03, 0.02, sx, top + 0.75, c.d / 2 - 0.01, 12, { rx: Math.PI / 2 });
    b.add(new THREE.SphereGeometry(0.05, 12, 10), 'bulb', '#ffffff', { x: sx, y: top + 0.75, z: c.d / 2 - 0.07 }, 'keep');
  }
};

const shower: Builder = (b, c) => {
  const w = c.w;
  const d = c.d;
  b.box('gloss', P.white, w, 0.035, d, 0, 0, 0, 0.01);
  b.box('metal', P.steel, Math.min(0.7, w * 0.6), 0.004, 0.05, 0, 0.035, d / 2 - 0.12);
  // marble back-wall cladding
  b.box('stone', P.quartz, w, 2.1, 0.012, 0, 0.035, d / 2 - 0.006);
  // glass screen across the front, walk-in gap on the −X side
  const gw = Math.max(0.6, w * 0.7);
  const gx = w / 2 - gw / 2;
  b.box('glass', '#ffffff', gw, 1.95, 0.008, gx, 0.035, -d / 2 + 0.02);
  b.box('powder', P.black, gw, 0.025, 0.02, gx, 1.96, -d / 2 + 0.02);
  b.box('powder', P.black, 0.025, 1.95, 0.02, w / 2 - 0.012, 0.035, -d / 2 + 0.02);
  b.rod('powder', P.black, [gx - gw / 2 + 0.02, 1.97, -d / 2 + 0.02], [gx - gw / 2 + 0.02, 1.97, d / 2], 0.008, 6);
  // tiled niche with toiletries on the back wall
  const nx = -w / 2 + Math.min(0.45, w * 0.3);
  b.box('stone', '#ece8e1', 0.42, 0.32, 0.03, nx, 1.05, d / 2 - 0.02, 0.004);
  b.box('stone', P.quartz, 0.38, 0.02, 0.09, nx, 1.06, d / 2 - 0.06, 0.003);
  [[P.ivory, 0.2], [P.sage, 0.17], [P.charcoal, 0.15], [P.terracotta, 0.12]].forEach(([col, h], i) =>
    b.cyl('gloss', col as string, 0.028, 0.03, h as number, nx - 0.13 + i * 0.085, 1.08, d / 2 - 0.06, 12)
  );
  // bath mat outside the tray
  b.box('fabric', P.oatmeal, Math.min(0.7, w * 0.6), 0.012, 0.42, w * 0.15, 0, -d / 2 - 0.26, 0.006);
  // rain head + mixer + hand shower
  const hz = d / 2;
  b.rod('powder', P.black, [0, 2.2, hz], [0, 2.2, hz - 0.35], 0.01, 6);
  b.box('powder', P.black, 0.25, 0.01, 0.25, 0, 2.18, hz - 0.35, 0.004);
  b.cyl('powder', P.black, 0.07, 0.07, 0.01, 0, 1.05, hz - 0.01, 20, { rx: Math.PI / 2 });
  b.box('powder', P.black, 0.012, 0.012, 0.08, 0, 1.05, hz - 0.05, 0.004);
  b.box('powder', P.black, 0.02, 0.8, 0.02, w / 2 - 0.2, 1.0, hz - 0.02);
  b.rod('powder', P.black, [w / 2 - 0.2, 1.45, hz - 0.04], [w / 2 - 0.2, 1.66, hz - 0.06], 0.015, 8);
};

const bathtub: Builder = (b, c) => {
  const h = c.h ?? 0.56;
  const t = 0.06;
  const w = c.w;
  const d = c.d;
  for (const s of [-1, 1]) {
    b.box('gloss', P.white, t, h, d, s * (w / 2 - t / 2), 0, 0, 0.02);
    b.box('gloss', P.white, w - 2 * t, h, t, 0, 0, s * (d / 2 - t / 2), 0.02);
  }
  b.add(openBox(w - 2 * t, h - 0.1, d - 2 * t), 'gloss', P.white, { y: 0.1 + (h - 0.1) / 2 }, 'proj');
  b.cyl('metal', P.chrome, 0.02, 0.02, 0.2, w / 2 - 0.12, h, 0, 10);
  b.rod('metal', P.chrome, [w / 2 - 0.12, h + 0.2, 0], [w / 2 - 0.25, h + 0.2, 0], 0.012, 8);
};

const mirror: Builder = (b, c) => {
  const h = c.h ?? 0.9;
  const z = c.d / 2 - 0.012;
  if (c.variant === 'round' || Math.abs(c.w - h) < 0.12) {
    roundMirror(b, 0, h / 2, z, Math.min(c.w, h) / 2 - 0.02);
    return;
  }
  // arched (portrait) or rounded rectangle (landscape) with a slim brass frame
  const sh = new THREE.Shape();
  const W = c.w / 2;
  if (h > c.w) {
    sh.moveTo(-W, 0);
    sh.lineTo(W, 0);
    sh.lineTo(W, h - W);
    sh.absarc(0, h - W, W, 0, Math.PI, false);
    sh.closePath();
  } else {
    const rr = 0.06;
    sh.moveTo(-W + rr, 0);
    sh.lineTo(W - rr, 0);
    sh.quadraticCurveTo(W, 0, W, rr);
    sh.lineTo(W, h - rr);
    sh.quadraticCurveTo(W, h, W - rr, h);
    sh.lineTo(-W + rr, h);
    sh.quadraticCurveTo(-W, h, -W, h - rr);
    sh.lineTo(-W, rr);
    sh.quadraticCurveTo(-W, 0, -W + rr, 0);
  }
  const frame = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false, curveSegments: 16 });
  b.add(frame, 'metal', P.brass, { z: z - 0.01 }, 'proj');
  const glass = new THREE.ShapeGeometry(sh, 16);
  glass.scale((c.w - 0.03) / c.w, (h - 0.03) / h, 1);
  glass.translate(0, 0.015, 0);
  b.add(glass, 'mirror', '#ffffff', { z: z - 0.011, ry: Math.PI }, 'keep');
};

/* ------------------------------------------------------------------ outdoor */

const outdoorChair: Builder = (b, c) => {
  const w = Math.min(c.w, 0.7);
  const d = Math.min(c.d, 0.75);
  const seat = 0.38;
  for (const s of [-1, 1]) {
    b.box('wood', P.teak, 0.05, 0.6, d, s * (w / 2 - 0.025), 0, 0, 0.01);
  }
  for (let i = 0; i < 5; i++) b.box('wood', P.teak, w - 0.1, 0.02, 0.07, 0, seat - 0.06, -d / 2 + 0.08 + i * ((d - 0.2) / 4), 0.004);
  b.add(cushion(w - 0.12, 0.09, d - 0.12, 0.12), 'fabric', P.ivory, { x: 0, y: seat - 0.0, z: -0.02 });
  b.add(cushion(w - 0.14, 0.45, 0.1, 0.2), 'fabric', P.ivory, { x: 0, y: seat + 0.25, z: d / 2 - 0.1, rx: 0.3 });
  b.add(cushion(0.36, 0.3, 0.1, 0.45), 'fabric', pick(c.r, [P.terracotta, P.sage, P.ochre]), { x: 0, y: seat + 0.22, z: d / 2 - 0.2, rx: 0.3 });
};

const outdoorTable: Builder = (b, c) => {
  const h = c.h ?? (Math.min(c.w, c.d) < 0.6 ? 0.5 : 0.72);
  const r = Math.min(c.w, c.d) / 2;
  b.cyl('wood', P.teak, r, r, 0.03, 0, h - 0.03, 0, 28);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.rod('powder', P.black, [Math.cos(a) * r * 0.75, 0, Math.sin(a) * r * 0.75], [0, h - 0.03, 0], 0.012, 6);
  }
  pot(b, c.r, 0, h, 0, 0.06, 0.1);
  foliage(b, c.r, 'palm', 0, h + 0.08, 0, 0.25, 0.1);
};

const planter: Builder = (b, c) => {
  const ph = Math.min(0.6, (c.h ?? 1.4) * 0.4);
  b.box('matte', pick(c.r, [P.stoneGrey, P.terracottaPot, P.charcoal]), c.w, ph, c.d, 0, 0, 0, 0.02);
  b.box('matte', '#3b2f26', c.w - 0.04, 0.01, c.d - 0.04, 0, ph - 0.03, 0);
  foliage(b, c.r, 'palm', 0, ph - 0.03, 0, (c.h ?? 1.4) - ph, Math.min(c.w, c.d) / 2);
};

/* ------------------------------------------------------------------ lighting & decor */

const floorLamp: Builder = (b, c) => {
  const h = c.h ?? 1.6;
  b.cyl('powder', P.black, 0.15, 0.16, 0.025, 0, 0, 0, 24);
  b.cyl('metal', P.brass, 0.01, 0.01, h - 0.3, 0, 0.025, 0, 8);
  b.add(new THREE.CylinderGeometry(0.2, 0.22, 0.3, 28, 1, true), 'shade', P.ivory, { x: 0, y: h - 0.15 });
  b.add(new THREE.SphereGeometry(0.035, 10, 8), 'bulb', '#ffffff', { y: h - 0.2 }, 'keep');
  b.light(0, h - 0.18, 0, 'floor');
};

const tableLamp: Builder = (b, c) => tableLampAt(b, c.r, 0, 0, 0, c.h ?? 0.5);

/** Pendant: hangs from the ceiling; `bottom` = height of the shade rim above the item base. */
const pendantLight: Builder = (b, c) => {
  // item base (elev) = bottom of the shade; the cord runs up to the ceiling
  const bottom = 0;
  const linear = c.w > 0.8 && c.w > c.d * 2;
  const ceil = WALL_H - c.elev;
  const domes: number[] = linear ? [-c.w / 3, 0, c.w / 3] : [0];
  const r = linear ? 0.13 : Math.min(0.26, Math.max(c.w, 0.3) / 2);
  for (const x of domes) {
    b.rod('powder', P.black, [x, ceil, 0], [x, bottom + r * 0.8, 0], 0.003, 4);
    b.cyl('metal', P.brass, 0.05, 0.05, 0.02, x, ceil - 0.02, 0, 16);
    const prof: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      prof.push([Math.max(0.012, r * Math.sin(a)), r * Math.cos(a) * 0.8]);
    }
    const outer = lathe(prof.slice().reverse(), b.detail === 'vr' ? 16 : 28);
    b.add(outer, 'metal', c.variant === 'black' ? P.black : P.brass, { x, y: bottom }, 'keep');
    // inner surface: profile in the opposite order → faces inward
    const inner = lathe(prof.slice().reverse().map(([pr, py]) => [pr * 0.96, py - 0.004] as [number, number]), b.detail === 'vr' ? 16 : 28);
    b.add(inner, 'matte', P.white, { x, y: bottom }, 'keep');
    b.add(new THREE.SphereGeometry(0.04, 10, 8), 'bulb', '#ffffff', { x, y: bottom + 0.04 }, 'keep');
  }
  b.light(0, bottom - 0.05, 0, 'pendant');
};

const plant: Builder = (b, c) => {
  const small = (c.h ?? 0) < 0.6 && Math.min(c.w, c.d) < 0.3;
  const h = c.h ?? (small ? 0.35 : 1.35);
  const rad = Math.min(c.w, c.d) / 2 * (small ? 0.7 : 0.55);
  const ph = small ? h * 0.35 : Math.min(0.4, h * 0.3);
  pot(b, c.r, 0, 0, 0, rad, ph);
  const kind = c.variant === 'olive' ? 'olive' : c.variant === 'fiddle' ? 'fiddle' : c.variant === 'palm' ? 'palm' : small ? 'palm' : pick(c.r, ['fiddle', 'olive', 'palm'] as const);
  foliage(b, c.r, kind, 0, ph * 0.88, 0, h - ph * 0.88, Math.max(c.w, c.d) / 2 * (kind === 'palm' ? 0.9 : 1.1));
};

const wallArt: Builder = (b, c) => {
  const h = c.h ?? (c.w < 0.65 ? c.w * 1.33 : c.w * 0.7);
  const z = c.d / 2;
  const frameCol = pick(c.r, [P.oak, P.black, P.walnut]);
  const frameMat: MatKey = frameCol === P.black ? 'powder' : 'wood';
  b.box(frameMat, frameCol, c.w, h, 0.03, 0, 0, z - 0.015, 0.004);
  b.box('paint', P.white, c.w - 0.04, h - 0.04, 0.004, 0, 0.02, z - 0.032);
  const cell = c.variant && /^\d+$/.test(c.variant) ? Number(c.variant) : Math.floor(c.r() * ART_COLS * ART_ROWS);
  const g = new THREE.PlaneGeometry(c.w - 0.14, h - 0.14);
  atlasUV(g, cell % ART_COLS, Math.floor(cell / ART_COLS) % ART_ROWS, ART_COLS, ART_ROWS, true);
  b.add(g, 'art', '#ffffff', { y: h / 2, z: z - 0.035, ry: Math.PI }, 'keep');
};

const curtain: Builder = (b, c) => {
  const w = c.w;
  const top = c.h ?? WALL_H - 0.04 - c.elev; // floor-to-ceiling
  const zc = -0.03; // layout pos is already just inside the window line
  const col = c.variant === 'sheer' ? P.sheet : c.variant === 'linen' ? P.oatmeal : pick(c.r, [P.ivory, P.oatmeal, P.linen]);
  b.rod('powder', P.black, [-w / 2 - 0.12, top, zc], [w / 2 + 0.12, top, zc], 0.012, 8);
  for (const s of [-1, 1]) {
    b.add(new THREE.SphereGeometry(0.022, 8, 6), 'powder', P.black, { x: s * (w / 2 + 0.13), y: top, z: zc }, 'keep');
    b.rod('powder', P.black, [s * (w / 2 + 0.05), top, zc], [s * (w / 2 + 0.05), top, 0.02], 0.006, 4);
  }
  const pw = Math.max(0.35, Math.min(0.7, w * 0.2));
  const ph = top - 0.04;
  for (const s of [-1, 1]) {
    const g = curtainPanel(pw, ph, 0.04, 0.1, b.detail === 'vr' ? 4 : 8);
    b.add(g, 'fabricDS', col, { x: s * (w / 2 + 0.06 - pw / 2), y: 0.015, z: zc }, 'proj');
  }
};

const shoeRack: Builder = (b, c) => {
  const h = c.h ?? 0.48;
  b.box('wood', P.oak, c.w, h - 0.1, c.d, 0, 0.1, 0, 0.01);
  cabinetDoors(b, 'paint', P.greige, c.w - 0.02, 0.12, h - 0.14, -c.d / 2, Math.max(2, Math.round(c.w / 0.45)), 'knob');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('powder', P.black, 0.012, 0.012, 0.1, sx * (c.w / 2 - 0.05), 0, sz * (c.d / 2 - 0.05), 6);
  // woven basket + small plant
  b.cyl('matte', '#bfa37a', 0.13, 0.11, 0.16, c.w / 2 - 0.18, h, 0, 16);
};

const vaseItem: Builder = (b, c) => {
  const floor = (c.h ?? 0) > 0.45 || Math.min(c.w, c.d) >= 0.25;
  vase(b, c.r, 0, 0, 0, c.h ?? (floor ? 0.6 : 0.28), floor ? 'pampas' : c.r() < 0.5 ? 'olive' : 'none');
};

const books: Builder = (b, c) => {
  if (c.w > c.d * 1.8) bookRow(b, c.r, -c.w / 2, c.w / 2, 0, 0, Math.min(c.d, 0.22), c.h ?? 0.3);
  else bookStack(b, c.r, 0, 0, 0, Math.max(2, Math.round((c.h ?? 0.1) / 0.035)), c.r());
};

const cushionsItem: Builder = (b, c) => {
  const n = Math.max(1, Math.min(3, Math.round(c.w / 0.45)));
  const seg: [number, number] = b.detail === 'vr' ? [10, 8] : [14, 10];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -c.w / 2 + 0.22 + (i * (c.w - 0.44)) / (n - 1);
    b.add(cushion(0.44, 0.14, 0.44, 0.45, seg), i % 2 ? 'boucle' : 'fabric', i % 2 ? P.ivory : pick(c.r, ACCENTS), { x, y: 0.22, z: 0, rx: -Math.PI / 2 + 0.35, ry: (i - (n - 1) / 2) * -0.2 });
  }
};

const throwBlanket: Builder = (b, c) => {
  const onBed = c.roomKind === 'bedroom';
  b.add(drape(c.w, c.d, onBed ? 0.26 : 0.05, onBed ? 0.1 : 0.3, 0.05, 0.007, 16, 10, c.r() * 5), 'fabricDS', pick(c.r, [P.terracotta, P.sage, P.ochre, P.rust, P.charcoal]), { y: 0.02 }, 'proj');
};

const fallback: Builder = (b, c) => {
  b.box('paint', P.greige, c.w, c.h ?? 0.5, c.d, 0, 0, 0, 0.01);
};

export const BUILDERS: Record<FurnitureType, Builder> = {
  sofa3: sofa(3),
  sofa2: sofa(2),
  sofaL,
  armchair,
  coffeeTable,
  sideTable,
  tvUnit,
  diningTable,
  diningChair,
  consoleTable,
  bookshelf,
  rug,
  bedKing: bed('king'),
  bedQueen: bed('queen'),
  bedSingle: bed('single'),
  nightstand,
  wardrobe,
  dresser,
  desk,
  deskChair,
  kitchenCounter,
  hob,
  sink,
  fridge,
  washingMachine,
  dishwasher,
  wc,
  basinVanity,
  shower,
  bathtub,
  mirror,
  outdoorChair,
  outdoorTable,
  planter,
  floorLamp,
  tableLamp,
  pendantLight,
  plant,
  wallArt,
  curtain,
  shoeRack,
  vase: vaseItem,
  books,
  cushions: cushionsItem,
  throwBlanket,
};

export function builderFor(t: FurnitureType): Builder {
  return BUILDERS[t] ?? fallback;
}

/** Items that sit ABOVE the dollhouse cut / are wall- or ceiling-mounted (hidden in cut-away). */
export const UPPER_TYPES = new Set<FurnitureType>(['pendantLight', 'wallArt', 'mirror', 'curtain']);
/** Big items that block walking (low colliders). */
export const COLLIDER_TYPES = new Set<FurnitureType>([
  'sofa3', 'sofa2', 'sofaL', 'armchair', 'bedKing', 'bedQueen', 'bedSingle', 'diningTable', 'coffeeTable', 'tvUnit',
  'kitchenCounter', 'fridge', 'washingMachine', 'wardrobe', 'dresser', 'desk', 'bookshelf', 'consoleTable', 'bathtub',
]);
/** Items that get no fake contact shadow. */
export const NO_SHADOW = new Set<FurnitureType>(['rug', 'curtain', 'wallArt', 'mirror', 'pendantLight', 'hob', 'sink', 'cushions', 'throwBlanket', 'books', 'vase', 'tableLamp']);
