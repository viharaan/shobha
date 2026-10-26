/* eslint-disable react-hooks/set-state-in-effect, react-hooks/refs, react-hooks/immutability -- ported R3F code: refs and mutable scratch state driven from useFrame */
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  MASTERPLAN_MEDIAN_TREES,
  MASTERPLAN_PARKS,
  MASTERPLAN_TREES,
  type MasterplanPark,
  type MasterplanTreeKind,
} from '@/data/sobha/masterplanTrees';

/**
 * Instanced trees (and optionally lawns / planting beds) of the vendor master plan.
 *
 * PROVENANCE: positions and canopy radii are ESTIMATED (detected in the master-plan illustration by
 * tools/trace/trees.py, registration ~2.6 m RMS). Heights, shapes and colours are ILLUSTRATIVE — the plan
 * says nothing about species or height; they are derived from the drawn canopy radius (+ a deterministic
 * per-tree jitter) so that bigger symbols become taller trees:
 *   large 9–14 m · medium 5–8 m · palm 7–10 m · shrub 1–2 m.
 *
 * FRAME: site 3-D — X = x (east), Y = up, Z = −y (north is −Z). Mount it inside the site-frame world group.
 *
 * DRAW CALLS: one trunk InstancedMesh shared by every trunked kind (+ per-instance colour) and one canopy
 * InstancedMesh per kind present (large / medium / shrub: merged low-poly icosphere blobs, palm: a fan of
 * alpha-tested leaf cards) → ≤ 5 calls for trees, + 1 for the parks mesh.
 *
 * QUALITY: 'high' = icosphere detail 1, 6-sided trunks, optional wind sway (onBeforeCompile).
 *          'vr'   = icosphere detail 0, 4-sided trunks, no sway, and only the `vrMaxInstances` trees nearest
 *                   to the camera are drawn (re-selected every `vrRefreshS` s).
 */

export type TreeKind = MasterplanTreeKind;
export type TreeDatum = { x: number; y: number; r: number; kind: TreeKind };
/** Site-frame terrain height sampler: (x east, y north) in site metres → ground height (m). */
export type SiteHeightFn = (x: number, y: number) => number;

export interface TreesProps {
  /** Trees to draw (site metres). Default: MASTERPLAN_TREES (+ MASTERPLAN_MEDIAN_TREES if includeMedianTrees). */
  trees?: readonly TreeDatum[];
  /**
   * Terrain height at a SITE point (x east, y NORTH). Default 0. NB: a sampler written for 3-D (X, Z) coordinates
   * be passed as `hAtXZ` instead (or wrapped in a MEMOISED `(x, y) => h3d(x, -y)` — a new function identity
   * rebuilds every instance).
   */
  hAt?: SiteHeightFn;
  /** Alternative to hAt: a 3-D sampler (X, Z = −y), e.g. the community layer's HeightFn. Used when hAt is absent. */
  hAtXZ?: (X: number, Z: number) => number;
  quality?: 'high' | 'vr';
  /** Coordinate frame of the output; only 'site3d' (X = x, Z = −y) is supported. */
  frame?: 'site3d';
  /** Also draw the master-plan lawns / planting beds as one flat mesh (off by default: skip it when the ground already drapes the plan raster). */
  showParks?: boolean;
  parks?: readonly MasterplanPark[];
  /** Height of the park mesh above the ground (m). Default 0.06. */
  parksLift?: number;
  /** renderOrder of the park mesh (flat ground layers draw in painter's order, depthWrite off). Default 2. */
  parksRenderOrder?: number;
  /** Add the trees drawn on the boulevard medians (inside the traced carriageway polygons). Default false. */
  includeMedianTrees?: boolean;
  /** Wind sway (desktop 'high' quality only). Default true. */
  wind?: boolean;
  /** 'vr': maximum number of trees drawn (nearest to the camera). Default 800. */
  vrMaxInstances?: number;
  /** 'vr': seconds between nearest-tree re-selections. Default 1. */
  vrRefreshS?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  visible?: boolean;
}

/* ------------------------------------------------------------------ illustrative shape model */

interface KindModel {
  /** Total height range (m) mapped from the drawn canopy radius range rRange. */
  h: [number, number];
  rRange: [number, number];
  /** Canopy radius = drawn radius × canopyScale (the symbol includes its drop shadow / outline). */
  canopyScale: number;
  /** Canopy bottom as a fraction of the height (0 = on the ground: shrubs). */
  canopyBase: number;
  trunk: boolean;
  /** Trunk radius at the base: a + b·H (m). */
  trunkR: [number, number];
  colour: string;
  trunkColour: string;
}

export const TREE_MODELS: Record<TreeKind, KindModel> = {
  large: { h: [9, 14], rRange: [1.85, 3.0], canopyScale: 1.3, canopyBase: 0.3, trunk: true, trunkR: [0.12, 0.016], colour: '#3e6a2c', trunkColour: '#6b5440' },
  medium: { h: [5, 8], rRange: [1.1, 1.85], canopyScale: 1.25, canopyBase: 0.33, trunk: true, trunkR: [0.08, 0.014], colour: '#4c7b33', trunkColour: '#6e5843' },
  palm: { h: [7, 10], rRange: [1.0, 3.0], canopyScale: 1.4, canopyBase: 1, trunk: true, trunkR: [0.14, 0.008], colour: '#5b8f3a', trunkColour: '#8a7a62' },
  shrub: { h: [1, 2], rRange: [0.6, 1.1], canopyScale: 1.0, canopyBase: 0, trunk: false, trunkR: [0, 0], colour: '#5a8a3c', trunkColour: '#000000' },
};

const KINDS: TreeKind[] = ['large', 'medium', 'palm', 'shrub'];

/** Deterministic per-tree hash in [0, 1) from its position (+ a salt). */
function hash(x: number, y: number, salt: number) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface TreeShape {
  /** Ground height. */
  g: number;
  /** Total height. */
  H: number;
  /** Canopy radius (3-D) and its vertical extent. */
  rc: number;
  canopyY0: number;
  canopyH: number;
  trunkR: number;
  trunkH: number;
  yaw: number;
  /** Colour multipliers (instance colour = model colour × these). */
  tint: [number, number, number];
}

export function treeShape(t: TreeDatum, hAt?: SiteHeightFn): TreeShape {
  const m = TREE_MODELS[t.kind];
  const u = clamp01((t.r - m.rRange[0]) / (m.rRange[1] - m.rRange[0]));
  const j1 = hash(t.x, t.y, 1);
  const j2 = hash(t.x, t.y, 2);
  const j3 = hash(t.x, t.y, 3);
  const H = (m.h[0] + (m.h[1] - m.h[0]) * (0.75 * u + 0.25 * j1));
  const rc = Math.max(0.5, t.r * m.canopyScale * (0.92 + 0.16 * j2));
  const canopyY0 = H * m.canopyBase;
  const g = hAt ? hAt(t.x, t.y) : 0;
  const l = 0.86 + 0.26 * j3; // lightness
  const hue = (j2 - 0.5) * 0.12; // ± warm/cool shift
  return {
    g,
    H,
    rc,
    canopyY0,
    canopyH: t.kind === 'palm' ? rc : H - canopyY0,
    trunkR: m.trunkR[0] + m.trunkR[1] * H,
    trunkH: t.kind === 'palm' ? H : canopyY0 + 0.35 * (H - canopyY0),
    yaw: j1 * Math.PI * 2,
    tint: [l * (1 + hue), l, l * (1 - hue * 0.6)],
  };
}

/* ------------------------------------------------------------------------------- geometry */

function nonIndexed(g: THREE.BufferGeometry) {
  return g.index ? g.toNonIndexed() : g;
}

/** Merge non-indexed geometries with position + normal + color (no uv). */
function mergeSoup(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    const pa = p.getAttribute('position').array as ArrayLike<number>;
    const na = p.getAttribute('normal').array as ArrayLike<number>;
    const ca = p.getAttribute('color').array as ArrayLike<number>;
    pos.set(pa, o);
    nor.set(na, o);
    col.set(ca, o);
    o += pa.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/**
 * Unit canopy: an envelope of radius 1 (x, z) and height 1 (y ∈ [0, 1]) made of `blobs` ellipsoidal
 * icospheres; vertex colour darkens towards the bottom (cheap ambient occlusion) and varies per blob.
 */
export function canopyGeometry(blobs: number, detail: 0 | 1): THREE.BufferGeometry {
  const layouts: [number, number, number, number, number][][] = [
    [[0, 0.5, 0, 1.0, 0.5]],
    [
      [-0.12, 0.42, 0.05, 0.88, 0.42],
      [0.22, 0.66, -0.1, 0.7, 0.34],
    ],
    [
      [0, 0.42, 0, 0.9, 0.42],
      [0.3, 0.64, 0.18, 0.62, 0.34],
      [-0.26, 0.7, -0.2, 0.58, 0.3],
    ],
  ];
  const lay = layouts[Math.min(blobs, 3) - 1];
  const parts = lay.map(([cx, cy, cz, rxz, ry], k) => {
    const g = nonIndexed(new THREE.IcosahedronGeometry(1, detail));
    g.deleteAttribute('uv');
    g.scale(rxz, ry, rxz);
    g.translate(cx, cy, cz);
    g.computeVertexNormals();
    const p = g.getAttribute('position');
    const c = new Float32Array(p.count * 3);
    const tone = [1, 1.08, 0.94][k];
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const ao = 0.62 + 0.38 * clamp01(y); // bottom darker
      c[i * 3] = ao * tone * 0.96;
      c[i * 3 + 1] = ao * tone;
      c[i * 3 + 2] = ao * tone * 0.92;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  });
  const m = mergeSoup(parts);
  parts.forEach((p) => p.dispose());
  return m;
}

/** Unit trunk: tapered open cylinder, base at y = 0, height 1, base radius 1, top radius 0.55. */
export function trunkGeometry(sides: number): THREE.BufferGeometry {
  const g = nonIndexed(new THREE.CylinderGeometry(0.55, 1, 1, sides, 1, true));
  g.deleteAttribute('uv');
  g.translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = 0.75 + 0.25 * p.getY(i);
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return mergeSoup([g]);
}

/**
 * Unit palm crown: `n` drooping frond cards (2 segments each) radiating from the origin, reach 1, with uv for
 * the alpha frond texture. Spans y ∈ [−0.45, 0.2].
 */
export function palmCrownGeometry(n: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const W = 0.2; // half width at the widest point
  const prof: [number, number, number][] = [
    // [reach, height, half-width factor]
    [0, 0.05, 0.25],
    [0.5, 0.2, 1],
    [1, -0.45, 0.2],
  ];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (k % 2) * 0.2;
    const tilt = (k % 3) * 0.06;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz;
    const pz = dx;
    const P = prof.map(([r, h, w]) => {
      const cx = dx * r;
      const cz = dz * r;
      const y = h - tilt * r;
      return [
        [cx - px * W * w, y, cz - pz * W * w],
        [cx + px * W * w, y, cz + pz * W * w],
      ];
    });
    for (let s = 0; s < 2; s++) {
      const [a0, a1] = P[s];
      const [b0, b1] = P[s + 1];
      const v0 = s / 2;
      const v1 = (s + 1) / 2;
      const quad = [
        [a0, 0, v0],
        [b0, 0, v1],
        [b1, 1, v1],
        [a0, 0, v0],
        [b1, 1, v1],
        [a1, 1, v0],
      ] as const;
      for (const [p, u, v] of quad) {
        pos.push(p[0], p[1], p[2]);
        uv.push(u, v);
        nor.push(0, 1, 0); // up-facing normals: fronds lit like a canopy from either side
        const c = 0.8 + 0.2 * v;
        col.push(c, c, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

let frondTex: THREE.CanvasTexture | null = null;
/** Alpha frond: a feather-shaped leaf with leaflets along v (u across). Created once. */
function getFrondTexture(): THREE.Texture | null {
  if (frondTex) return frondTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 128);
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  // rachis
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(32, 0);
  g.lineTo(32, 128);
  g.stroke();
  // leaflets: v (canvas y) 0 = base, 128 = tip; widest at ~40 %
  g.lineWidth = 2.5;
  for (let y = 4; y < 124; y += 5) {
    const t = y / 128;
    const w = 30 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 2;
    g.beginPath();
    g.moveTo(32, y);
    g.lineTo(32 - w, y + 7);
    g.moveTo(32, y);
    g.lineTo(32 + w, y + 7);
    g.stroke();
  }
  frondTex = new THREE.CanvasTexture(c);
  frondTex.flipY = false; // canvas y = v
  frondTex.colorSpace = THREE.NoColorSpace; // white mask × instance colour
  frondTex.anisotropy = 4;
  return frondTex;
}

/* ------------------------------------------------------------------------------- materials */

interface WindUniforms {
  uTime: { value: number };
}

function canopyMaterial(wind: WindUniforms | null, extra: THREE.MeshLambertMaterialParameters = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !extra.map, ...extra });
  if (wind) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wind.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
#ifdef USE_INSTANCING
  float wph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
#else
  float wph = 0.0;
#endif
  float wsw = max(position.y + 0.1, 0.0);
  transformed.x += sin(uTime * 1.3 + wph) * 0.035 * wsw;
  transformed.z += cos(uTime * 1.05 + wph * 1.7) * 0.025 * wsw;`
        );
    };
    mat.customProgramCacheKey = () => 'trees-wind';
  }
  return mat;
}

/* ------------------------------------------------------------------------------- instances */

interface Built {
  group: THREE.Group;
  trunks: THREE.InstancedMesh | null;
  canopies: Partial<Record<TreeKind, THREE.InstancedMesh>>;
  /** Per tree: kind, position (for LOD), and its precomputed matrices / colours. */
  kind: TreeKind[];
  px: Float32Array;
  pz: Float32Array;
  trunkM: Float32Array; // 16 per tree (unused for shrubs)
  canopyM: Float32Array;
  trunkC: Float32Array; // 3 per tree
  canopyC: Float32Array;
  dispose: () => void;
  triangles: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _top = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** Per-tree instance matrices and colours, site 3-D frame. Exported for headless checks. */
export function treeInstances(trees: readonly TreeDatum[], hAt?: SiteHeightFn) {
  const n = trees.length;
  const trunkM = new Float32Array(n * 16);
  const canopyM = new Float32Array(n * 16);
  const trunkC = new Float32Array(n * 3);
  const canopyC = new Float32Array(n * 3);
  const px = new Float32Array(n);
  const pz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = trees[i];
    const m = TREE_MODELS[t.kind];
    const s = treeShape(t, hAt);
    const X = t.x;
    const Z = -t.y;
    px[i] = X;
    pz[i] = Z;
    // trunk: slight lean for character
    const lean = (hash(t.x, t.y, 4) - 0.5) * 0.06;
    _e.set(lean, s.yaw, -lean * 0.7);
    _q.setFromEuler(_e);
    _m.compose(_p.set(X, s.g - 0.1, Z), _q, _s.set(s.trunkR, s.trunkH + 0.1, s.trunkR));
    _m.toArray(trunkM, i * 16);
    _top.set(0, s.trunkH + 0.1, 0).applyQuaternion(_q).add(_p); // leaning trunk top (palm crown sits on it)
    // canopy
    _e.set(0, s.yaw, 0);
    _q.setFromEuler(_e);
    if (t.kind === 'palm') {
      _m.compose(_top, _q, _s.set(s.rc, s.rc, s.rc));
    } else {
      _m.compose(_p.set(X, s.g + s.canopyY0, Z), _q, _s.set(s.rc, s.canopyH, s.rc));
    }
    _m.toArray(canopyM, i * 16);
    _c.set(m.colour);
    canopyC[i * 3] = _c.r * s.tint[0];
    canopyC[i * 3 + 1] = _c.g * s.tint[1];
    canopyC[i * 3 + 2] = _c.b * s.tint[2];
    _c.set(m.trunkColour);
    const tl = 0.9 + 0.2 * hash(t.x, t.y, 5);
    trunkC[i * 3] = _c.r * tl;
    trunkC[i * 3 + 1] = _c.g * tl;
    trunkC[i * 3 + 2] = _c.b * tl;
  }
  return { trunkM, canopyM, trunkC, canopyC, px, pz };
}

/** The per-kind unit geometries for a quality level. Exported for headless checks. */
export function treeGeometries(quality: 'high' | 'vr') {
  const detail = quality === 'vr' ? 0 : 1;
  return {
    trunk: trunkGeometry(quality === 'vr' ? 4 : 6),
    large: canopyGeometry(3, detail),
    medium: canopyGeometry(2, detail),
    shrub: canopyGeometry(1, detail),
    palm: palmCrownGeometry(quality === 'vr' ? 6 : 9),
  };
}

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

/** Non-React builder: a THREE.Group with the instanced trees (all instances written). Caller disposes. */
export function buildTreesGroup(trees: readonly TreeDatum[], quality: 'high' | 'vr' = 'high', hAt?: SiteHeightFn) {
  const b = build(trees, quality, hAt, null, { cast: false, receive: false });
  return { group: b.group, triangles: b.triangles, dispose: b.dispose };
}

function build(trees: readonly TreeDatum[], quality: 'high' | 'vr', hAt: SiteHeightFn | undefined, wind: WindUniforms | null, shadows: { cast: boolean; receive: boolean }): Built {
  const n = trees.length;
  const inst = treeInstances(trees, hAt);
  const geos = treeGeometries(quality);
  const group = new THREE.Group();
  group.name = 'masterplan-trees';
  const counts: Record<TreeKind, number> = { large: 0, medium: 0, palm: 0, shrub: 0 };
  let trunked = 0;
  for (const t of trees) {
    counts[t.kind]++;
    if (TREE_MODELS[t.kind].trunk) trunked++;
  }
  const mats: THREE.Material[] = [];
  let triangles = 0;

  let trunks: THREE.InstancedMesh | null = null;
  if (trunked > 0) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mats.push(mat);
    trunks = new THREE.InstancedMesh(geos.trunk, mat, trunked);
    trunks.name = 'tree-trunks';
    group.add(trunks);
    triangles += tris(geos.trunk) * trunked;
  } else geos.trunk.dispose();

  const canopies: Partial<Record<TreeKind, THREE.InstancedMesh>> = {};
  for (const k of KINDS) {
    const g = geos[k];
    if (!counts[k]) {
      g.dispose();
      continue;
    }
    let mat: THREE.MeshLambertMaterial;
    if (k === 'palm') {
      // white frond mask on transparent: its alpha drives alphaTest, its colour leaves the instance colour as is
      mat = canopyMaterial(wind, { map: getFrondTexture() ?? undefined, alphaTest: 0.5, side: THREE.DoubleSide });
    } else mat = canopyMaterial(wind);
    mats.push(mat);
    const im = new THREE.InstancedMesh(g, mat, counts[k]);
    im.name = `tree-canopy-${k}`;
    canopies[k] = im;
    group.add(im);
    triangles += tris(g) * counts[k];
  }
  for (const m of group.children as THREE.InstancedMesh[]) {
    m.castShadow = shadows.cast;
    m.receiveShadow = shadows.receive;
    m.instanceMatrix.setUsage(quality === 'vr' ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage);
  }
  const b: Built = {
    group,
    trunks,
    canopies,
    kind: trees.map((t) => t.kind),
    ...inst,
    triangles,
    dispose: () => {
      for (const m of group.children as THREE.InstancedMesh[]) {
        m.geometry.dispose();
        m.dispose();
      }
      mats.forEach((m) => m.dispose());
    },
  };
  // initial fill: every tree (vr re-selects on the first frame)
  writeInstances(b, null, n);
  return b;
}

/** Write the selected trees (indices, or all when null) into the instanced meshes. */
function writeInstances(b: Built, sel: Int32Array | null, nSel: number) {
  const off: Record<TreeKind, number> = { large: 0, medium: 0, palm: 0, shrub: 0 };
  let tOff = 0;
  const tm = b.trunks ? (b.trunks.instanceMatrix.array as Float32Array) : null;
  const tc = b.trunks ? ensureColors(b.trunks) : null;
  for (let s = 0; s < nSel; s++) {
    const i = sel ? sel[s] : s;
    const k = b.kind[i];
    const cm = b.canopies[k]!;
    const o = off[k]++;
    (cm.instanceMatrix.array as Float32Array).set(b.canopyM.subarray(i * 16, i * 16 + 16), o * 16);
    ensureColors(cm).set(b.canopyC.subarray(i * 3, i * 3 + 3), o * 3);
    if (tm && tc && TREE_MODELS[k].trunk) {
      tm.set(b.trunkM.subarray(i * 16, i * 16 + 16), tOff * 16);
      tc.set(b.trunkC.subarray(i * 3, i * 3 + 3), tOff * 3);
      tOff++;
    }
  }
  for (const k of KINDS) {
    const cm = b.canopies[k];
    if (!cm) continue;
    cm.count = off[k];
    cm.instanceMatrix.needsUpdate = true;
    if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    cm.boundingSphere = null; // recomputed lazily from the instances by the frustum test
  }
  if (b.trunks) {
    b.trunks.count = tOff;
    b.trunks.instanceMatrix.needsUpdate = true;
    if (b.trunks.instanceColor) b.trunks.instanceColor.needsUpdate = true;
    b.trunks.boundingSphere = null;
  }
}

function ensureColors(m: THREE.InstancedMesh): Float32Array {
  if (!m.instanceColor) {
    const cap = (m.instanceMatrix.array as Float32Array).length / 16;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    if (m.instanceMatrix.usage === THREE.DynamicDrawUsage) m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }
  return m.instanceColor.array as Float32Array;
}

/* ------------------------------------------------------------------------------- parks */

const PARK_COLOUR: Record<MasterplanPark['kind'], string> = { lawn: '#7ea455', planting: '#56803a' };

/** One merged, flat (draped at the vertices) mesh of lawns / planting beds, site 3-D frame. */
export function parksGeometry(parks: readonly MasterplanPark[], hAt: SiteHeightFn | undefined, lift: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const p of parks) {
    const contour = p.ring.map((q) => new THREE.Vector2(q.x, q.y));
    const holes = (p.holes ?? []).map((h) => h.map((q) => new THREE.Vector2(q.x, q.y)));
    let faces: number[][];
    try {
      faces = THREE.ShapeUtils.triangulateShape(contour, holes); // may drop a duplicated closing point in place
    } catch {
      continue;
    }
    const all = contour.concat(...holes);
    c.set(PARK_COLOUR[p.kind]);
    // lawns sit a hair above planting (they never overlap by construction, but morphology leaves slivers)
    const y0 = lift + (p.kind === 'lawn' ? 0.02 : 0);
    for (const f of faces) {
      const [a, b, d] = f.map((k) => all[k]);
      // site (x, y) → 3-D (X, Z = −y): keep counter-clockwise when seen from +Y
      const cross = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x); // > 0: CCW in site (x, y)
      const tri = cross > 0 ? [a, b, d] : [a, d, b];
      for (const v of tri) {
        pos.push(v.x, (hAt ? hAt(v.x, v.y) : 0) + y0, -v.y);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------------------- component */

export default function Trees({
  trees,
  hAt: hAtSite,
  hAtXZ,
  quality = 'high',
  showParks = false,
  parks,
  parksLift = 0.06,
  parksRenderOrder = 2,
  includeMedianTrees = false,
  wind = true,
  vrMaxInstances = 800,
  vrRefreshS = 1,
  castShadow = false,
  receiveShadow = false,
  visible = true,
}: TreesProps) {
  const data = useMemo<readonly TreeDatum[]>(
    () => trees ?? (includeMedianTrees ? [...MASTERPLAN_TREES, ...MASTERPLAN_MEDIAN_TREES] : MASTERPLAN_TREES),
    [trees, includeMedianTrees]
  );
  const hAt = useMemo<SiteHeightFn | undefined>(
    () => hAtSite ?? (hAtXZ ? (x: number, y: number) => hAtXZ(x, -y) : undefined),
    [hAtSite, hAtXZ]
  );
  const windOn = wind && quality === 'high';
  const windU = useMemo<WindUniforms>(() => ({ uTime: { value: 0 } }), []);
  const built = useMemo(
    () => build(data, quality, hAt, windOn ? windU : null, { cast: castShadow, receive: receiveShadow }),
    [data, quality, hAt, windOn, windU, castShadow, receiveShadow]
  );
  useEffect(() => () => built.dispose(), [built]);

  const parkMesh = useMemo(() => {
    if (!showParks) return null;
    const g = parksGeometry(parks ?? MASTERPLAN_PARKS, hAt, parksLift);
    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const m = new THREE.Mesh(g, mat);
    m.name = 'masterplan-parks';
    m.renderOrder = parksRenderOrder;
    m.receiveShadow = receiveShadow;
    return m;
  }, [showParks, parks, hAt, parksLift, parksRenderOrder, receiveShadow]);
  useEffect(
    () => () => {
      if (parkMesh) {
        parkMesh.geometry.dispose();
        (parkMesh.material as THREE.Material).dispose();
      }
    },
    [parkMesh]
  );

  // VR: nearest-N selection, refreshed every vrRefreshS seconds (and on the first frame)
  const lod = useRef({ t: Infinity, sel: new Int32Array(0), d: new Float32Array(0), idx: new Int32Array(0) });
  useEffect(() => {
    lod.current.t = Infinity; // a new build holds every tree: re-select on the next frame
    lod.current.sel = new Int32Array(0);
  }, [built]);
  const camLocal = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, clock }, dt) => {
    if (windOn) windU.uTime.value = clock.elapsedTime;
    if (quality !== 'vr') return;
    const L = lod.current;
    L.t += dt;
    if (L.t < vrRefreshS) return;
    L.t = 0;
    const n = built.kind.length;
    const cap = Math.min(n, Math.max(0, vrMaxInstances));
    if (cap >= n) return; // build() already wrote every tree
    camera.getWorldPosition(camLocal);
    built.group.worldToLocal(camLocal);
    if (L.d.length !== n) {
      L.d = new Float32Array(n);
      L.idx = new Int32Array(n);
    }
    for (let i = 0; i < n; i++) {
      const dx = built.px[i] - camLocal.x;
      const dz = built.pz[i] - camLocal.z;
      L.d[i] = dx * dx + dz * dz;
      L.idx[i] = i;
    }
    const d = L.d;
    // n ≈ 1–2k: a full sort once a second is cheap; keep the nearest `cap`
    const sorted = Array.from(L.idx).sort((a, b) => d[a] - d[b]);
    if (L.sel.length !== cap) L.sel = new Int32Array(cap);
    for (let i = 0; i < cap; i++) L.sel[i] = sorted[i];
    writeInstances(built, L.sel, cap);
  });

  return (
    <group visible={visible}>
      <primitive object={built.group} />
      {parkMesh && <primitive object={parkMesh} />}
    </group>
  );
}

/** Triangle count of the tree meshes at full instance count (for budgets / debugging). */
export function treeTriangles(trees: readonly TreeDatum[], quality: 'high' | 'vr'): number {
  const geos = treeGeometries(quality);
  let t = 0;
  for (const tr of trees) {
    t += tris(geos[tr.kind]);
    if (TREE_MODELS[tr.kind].trunk) t += tris(geos.trunk);
  }
  Object.values(geos).forEach((g) => g.dispose());
  return t;
}
