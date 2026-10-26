/**
 * Procedural geometry kit for the model-flat furniture.
 *
 * A builder adds PARTS (geometry + surface material + sRGB colour) into a PartBuilder in the
 * item's LOCAL frame: origin = footprint centre on the item's base, +X = item width (page x when
 * rotDeg = 0), +Z = item depth (page-down), +Y up; the item's FRONT faces −Z. Every part is
 * normalised to non-indexed {position, normal, uv (metres), color} so the whole flat can be merged
 * per material with BufferGeometryUtils.mergeGeometries.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { MatKey } from './materials';

export interface Part {
  g: THREE.BufferGeometry;
  m: MatKey;
}

export interface LightSpec {
  /** item-local position (m) */
  p: THREE.Vector3;
  kind: 'pendant' | 'floor' | 'table';
}

const tmpC = new THREE.Color();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export type Detail = 'high' | 'vr';

export interface XForm {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

export function matrixOf(t: XForm): THREE.Matrix4 {
  _e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'YXZ');
  _q.setFromEuler(_e);
  _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
  _p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/**
 * Box-projected UVs in metres (dominant normal axis). For `grainY` parts (taller than wide) the
 * side faces swap u/v so wood grain runs vertically.
 */
export function projUV(g: THREE.BufferGeometry, grainY = false) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z;
    } else if (ax >= az) {
      u = grainY ? y : z;
      v = grainY ? z : y;
    } else {
      u = grainY ? y : x;
      v = grainY ? x : y;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Normalise: non-indexed, only position/normal/uv/color. */
function normalise(g0: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  let g = g0.index ? g0.toNonIndexed() : g0;
  if (g === g0) g = g0.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r;
    col[i * 3 + 1] = color.g;
    col[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.groups = [];
  return g;
}

const MIRROR_X = new THREE.Matrix4().makeScale(-1, 1, 1);

/**
 * Mirror a normalised (non-indexed) part about item-local x — the handed twin of a piece in a
 * mirrored flat. Normals follow the reflection (normal matrix); the reflection also flips every
 * triangle's winding, so vertices 1 and 2 are swapped to keep faces pointing outwards.
 */
export function mirrorPartX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.applyMatrix4(MIRROR_X);
  if (g.index) {
    const ix = g.index;
    for (let i = 0; i + 2 < ix.count; i += 3) {
      const t = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, t);
    }
    ix.needsUpdate = true;
    return g;
  }
  for (const a of Object.values(g.attributes) as THREE.BufferAttribute[]) {
    const arr = a.array;
    const n = a.itemSize;
    for (let v = 0; v + 2 < a.count; v += 3)
      for (let k = 0; k < n; k++) {
        const i1 = (v + 1) * n + k;
        const i2 = (v + 2) * n + k;
        const t = arr[i1];
        arr[i1] = arr[i2];
        arr[i2] = t;
      }
    a.needsUpdate = true;
  }
  return g;
}

/* ------------------------------------------------------------------ primitives (unit-free, metres) */

export function rbox(w: number, h: number, d: number, r: number, seg = 1): THREE.BufferGeometry {
  const rr = Math.min(r, Math.min(w, h, d) / 2 - 1e-4);
  if (rr <= 0.0015) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}

/**
 * Soft cushion / pillow: a superellipsoid (continuous normals) that is fuller in the middle and
 * pinched at the edges. `pinch` 0 = slab, 0.5 = plump pillow.
 */
export function cushion(w: number, h: number, d: number, pinch = 0.35, seg: [number, number] = [16, 10]): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
  const pos = g.attributes.position;
  const e = 0.28;
  const sp = (c: number, k: number) => Math.sign(c) * Math.pow(Math.abs(c), k);
  for (let i = 0; i < pos.count; i++) {
    const x = sp(pos.getX(i), e);
    const z = sp(pos.getZ(i), e);
    let y = sp(pos.getY(i), 0.55);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    y *= 1 - pinch * Math.pow(edge, 3);
    pos.setXYZ(i, (x * w) / 2, (y * h) / 2, (z * d) / 2);
  }
  g.computeVertexNormals();
  return g;
}

/** Lathe from (radius, y) pairs, metres. */
export function lathe(pts: [number, number][], seg = 20): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)),
    seg
  );
}

export function tube(points: [number, number, number][], r: number, seg = 16, radial = 6, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, seg, r, radial, closed);
}

/**
 * Duvet / throw drape: a grid laid over a w×l top at height `top`, falling `hangSide` over ±X
 * sides and `hangFoot` over the −Z (foot) end, with a soft roll radius and a few wrinkles.
 * Origin = centre of the top rectangle (x,z), y = top.
 */
export function drape(w: number, l: number, hangSide: number, hangFoot: number, roll = 0.05, wrinkle = 0.006, nx = 24, nz = 20, seed = 1): THREE.BufferGeometry {
  const W = w / 2 + hangSide;
  const g = new THREE.PlaneGeometry(1, 1, nx, nz);
  const pos = g.attributes.position;
  const fold = (e: number) => {
    // e = distance past the edge along the cloth → [outward, drop]
    if (e <= 0) return [e, 0];
    const arc = (Math.PI / 2) * roll;
    if (e < arc) return [roll * Math.sin(e / roll), roll * (1 - Math.cos(e / roll))];
    return [roll, roll + (e - arc)];
  };
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5; // 0..1 across width
    const v = pos.getY(i) + 0.5; // 0..1 along length (0 = foot)
    const cu = (u - 0.5) * 2 * W;
    const cv = -l / 2 - hangFoot + v * (l + hangFoot); // z from foot (−) to head (+)
    const ex = Math.abs(cu) - w / 2;
    const ez = -l / 2 - cv;
    const [ox, dx] = fold(ex);
    const [oz, dz] = fold(ez);
    const x = ex > 0 ? Math.sign(cu) * (w / 2 + ox) : cu;
    const z = ez > 0 ? -l / 2 - oz : cv;
    const wr = Math.sin(cu * 9 + seed) * Math.sin(cv * 6 + seed * 2) * wrinkle + Math.sin(cv * 17 + cu * 3) * wrinkle * 0.4;
    pos.setXYZ(i, x, -Math.max(dx, dz) * (ex > 0 && ez > 0 ? 1.05 : 1) + wr, z);
  }
  // plane faces +Z originally; we mapped (u,v)→(x,z) so recompute normals and make them face up
  g.computeVertexNormals();
  const n = g.attributes.normal;
  if (n.getY(Math.floor(pos.count / 2)) < 0) {
    const idx = g.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, a);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** Gathered curtain panel: width w (along X), height h, pleat depth amp, pleat wavelength lambda. Front −Z. */
export function curtainPanel(w: number, h: number, amp = 0.035, lambda = 0.11, nyS = 6): THREE.BufferGeometry {
  const nxS = Math.max(8, Math.round((w / lambda) * 6));
  const g = new THREE.PlaneGeometry(w, h, nxS, nyS);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = (y + h / 2) / h; // 0 bottom … 1 top
    const a = amp * (0.85 + 0.3 * (1 - t));
    pos.setXYZ(i, x, y + h / 2, Math.sin((x / lambda) * Math.PI * 2) * a);
  }
  g.computeVertexNormals();
  // plane normal is +Z; the curtain front is −Z — rotate 180° so its face looks into the room
  g.rotateY(Math.PI);
  return g;
}

/* ------------------------------------------------------------------ builder */

export class PartBuilder {
  parts: Part[] = [];
  lights: LightSpec[] = [];
  constructor(public detail: Detail) {}

  /** Add a geometry (already in item-local coords unless xf given). */
  add(g: THREE.BufferGeometry, m: MatKey, color: string, xf?: XForm | THREE.Matrix4, uv: 'proj' | 'projY' | 'keep' = 'proj') {
    if (uv !== 'keep') projUV(g, uv === 'projY');
    tmpC.set(color);
    const n = normalise(g, tmpC);
    if (g !== n) g.dispose();
    if (xf) n.applyMatrix4(xf instanceof THREE.Matrix4 ? xf : matrixOf(xf));
    this.parts.push({ g: n, m });
    return n;
  }

  /** Box by its BOTTOM-centre (x, y0, z). r = edge round radius (0 = sharp). */
  box(m: MatKey, color: string, w: number, h: number, d: number, x: number, y0: number, z: number, r = 0, rot?: { rx?: number; ry?: number; rz?: number }) {
    const g = r > 0 ? rbox(w, h, d, r, 1) : new THREE.BoxGeometry(w, h, d);
    this.add(g, m, color, { x, y: y0 + h / 2, z, ...rot }, h > Math.max(w, d) * 1.2 ? 'projY' : 'proj');
  }

  /** Vertical cylinder by bottom centre. */
  cyl(m: MatKey, color: string, rTop: number, rBot: number, h: number, x: number, y0: number, z: number, seg = 12, rot?: { rx?: number; rz?: number }) {
    this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1), m, color, { x, y: y0 + h / 2, z, ...rot }, 'projY');
  }

  /** A straight rod from a to b (radius r). */
  rod(m: MatKey, color: string, a: [number, number, number], b: [number, number, number], r: number, seg = 8) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    const mm = new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this.add(g, m, color, mm, 'projY');
  }

  light(x: number, y: number, z: number, kind: LightSpec['kind']) {
    this.lights.push({ p: new THREE.Vector3(x, y, z), kind });
  }
}

/** Set uv of a (plane) geometry to a sub-rectangle of an atlas. */
export function atlasUV(g: THREE.BufferGeometry, col: number, row: number, cols: number, rows: number, flipX = false) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i);
    if (flipX) u = 1 - u;
    const v = uv.getY(i);
    uv.setXY(i, (col + u) / cols, 1 - (row + 1 - v) / rows);
  }
  return g;
}


/** Curved slab (annulus sector) of height h, arc around +Z: x = r·sin θ, z = r·cos θ, base at y = 0. */
export function arcSlab(rIn: number, rOut: number, a0: number, a1: number, h: number, seg = 12): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  // shape coords (x, ys) with ys = −z (rotated −π/2 about X below)
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    const p = [rOut * Math.sin(a), -rOut * Math.cos(a)] as const;
    if (i === 0) sh.moveTo(p[0], p[1]);
    else sh.lineTo(p[0], p[1]);
  }
  for (let i = seg; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / seg;
    sh.lineTo(rIn * Math.sin(a), -rIn * Math.cos(a));
  }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}
