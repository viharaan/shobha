/**
 * Procedural canvas textures for the illustrative model-flat dressing (client only).
 * Everything is generated lazily on first use and cached for the life of the page, so the
 * whole furnished flat shares ~14 small textures. No network fetches.
 *
 * Convention: furniture UVs are in METRES (see geom.ts projUV); each texture's `repeat` says how
 * many tiles per metre, so texel density is consistent across parts of any size.
 */
import * as THREE from 'three';

/* ------------------------------------------------------------------ noise utils */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = mulberry32;

/** Tileable value noise: lattice of `period` cells wraps. */
function makeNoise(seed: number, period: number) {
  const r = mulberry32(seed);
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const at = (i: number, j: number) => lat[(((j % period) + period) % period) * period + (((i % period) + period) % period)];
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** fBm over a tileable noise; x,y in [0, period). Returns ~[0,1]. */
function makeFbm(seed: number, period: number, octaves = 4) {
  const ns = Array.from({ length: octaves }, (_, o) => makeNoise(seed + o * 101, period << o));
  return (x: number, y: number) => {
    let s = 0;
    let amp = 0.5;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      s += ns[o](x * (1 << o), y * (1 << o)) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return s / norm;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d', { willReadFrequently: true })! };
}

function tex(c: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: number | [number, number]; wrap?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.wrap !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const r = opts.repeat ?? 1;
  if (Array.isArray(r)) t.repeat.set(r[0], r[1]);
  else t.repeat.set(r, r);
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Tangent-space normal map from a height field (Float32 0..1, w×h, wrapping). */
function normalFromHeight(hf: Float32Array, w: number, h: number, strength: number, repeat: number | [number, number]) {
  const { c, g } = canvas(w, h);
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = hf[y * w + ((x - 1 + w) % w)];
      const r = hf[y * w + ((x + 1) % w)];
      const u = hf[((y - 1 + h) % h) * w + x];
      const d = hf[((y + 1) % h) * w + x];
      let nx = (l - r) * strength;
      let ny = (d - u) * strength;
      let nz = 1;
      const k = 1 / Math.hypot(nx, ny, nz);
      nx *= k;
      ny *= k;
      nz *= k;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, { srgb: false, repeat });
}

const cache = new Map<string, unknown>();
function once<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ wood grain */

/** Greyscale-bright wood grain (tinted by vertex colour → oak / walnut). Grain runs along U. 1 tile = 0.8 m. */
function woodField(W: number, H: number, seed: number) {
  const f = makeFbm(seed, 8, 4);
  const fine = makeNoise(seed + 7, 64);
  const hf = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      // straight-ish rift grain: gentle warp, fine fibres along U
      const warp = f(u * 2, v * 6) * 0.7;
      const ring = (v * 11 + warp + 0.08 * Math.sin(u * Math.PI * 2 + v * 5)) % 1;
      const late = smooth(0.6, 0.92, ring) * (1 - smooth(0.92, 1, ring));
      const fib = fine(u * 8, v * 96) * 0.5 + fine(u * 3, v * 160) * 0.5;
      hf[y * W + x] = clamp01(0.88 - late * 0.16 - fib * 0.14 + (f(u * 4, v * 4) - 0.5) * 0.1);
    }
  }
  return hf;
}

export function woodTextures() {
  return once('wood', () => {
    const W = 512;
    const H = 512;
    const hf = woodField(W, H, 11);
    const { c, g } = canvas(W, H);
    const img = g.createImageData(W, H);
    const rough = canvas(W, H);
    const rimg = rough.g.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const v = hf[i];
      img.data[i * 4] = 255 * Math.min(1, v * 1.04);
      img.data[i * 4 + 1] = 255 * v;
      img.data[i * 4 + 2] = 255 * v * 0.93;
      img.data[i * 4 + 3] = 255;
      const r = 0.45 + (1 - v) * 0.5;
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = r * 255;
      rimg.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    rough.g.putImageData(rimg, 0, 0);
    const rep = 1 / 0.8;
    return {
      map: tex(c, { repeat: rep }),
      roughness: tex(rough.c, { srgb: false, repeat: rep }),
      normal: normalFromHeight(hf, W, H, 1.2, rep),
      field: hf,
      size: W,
    };
  });
}

/** Engineered oak floor planks (coloured). 1 tile = 1.6 m × 1.6 m, planks 200 mm wide. */
export function woodFloorTextures() {
  return once('woodFloor', () => {
    const S = 1024;
    const { c, g } = canvas(S, S);
    const wood = woodTextures();
    const r = mulberry32(5);
    const rows = 8; // 200 mm
    const rh = S / rows;
    const hfC = new Float32Array(S * S).fill(0.5);
    const tones = ['#c2a07a', '#b8946c', '#caa984', '#b38d66', '#c7a37b', '#bc9a73'];
    for (let row = 0; row < rows; row++) {
      // 1–2 butt joints per row, wrapping (tileable)
      const off = r() * S;
      const segs = r() < 0.5 ? [off, off + S * (0.45 + r() * 0.15)] : [off];
      const cuts = segs.map((s) => s % S).sort((a, b) => a - b);
      for (let k = 0; k < cuts.length; k++) {
        const x0 = cuts[k];
        const x1 = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + S;
        const tone = tones[Math.floor(r() * tones.length)];
        const gx = Math.floor(r() * wood.size);
        const gy = Math.floor(r() * wood.size);
        for (const shift of [0, -S]) {
          const a = x0 + shift;
          const b = x1 + shift;
          if (b <= 0 || a >= S) continue;
          g.fillStyle = tone;
          g.fillRect(a, row * rh, b - a, rh);
          // grain via the wood field (multiply-ish)
          const img = g.getImageData(Math.max(0, Math.floor(a)), row * rh, Math.min(S, Math.ceil(b)) - Math.max(0, Math.floor(a)), rh);
          for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
              const wv = wood.field[((gy + y * 2) % wood.size) * wood.size + ((gx + x) % wood.size)];
              const i = (y * img.width + x) * 4;
              const m = 0.62 + wv * 0.42;
              img.data[i] *= m;
              img.data[i + 1] *= m;
              img.data[i + 2] *= m * 0.98;
              hfC[(row * rh + y) * S + Math.max(0, Math.floor(a)) + x] = 0.5 + (wv - 0.8) * 0.4;
            }
          }
          g.putImageData(img, Math.max(0, Math.floor(a)), row * rh);
          // butt-joint seam
          g.fillStyle = 'rgba(60,40,25,0.55)';
          g.fillRect(a, row * rh, 2, rh);
        }
      }
      g.fillStyle = 'rgba(60,40,25,0.5)';
      g.fillRect(0, row * rh, S, 2);
      for (let x = 0; x < S; x++) {
        hfC[row * rh * S + x] = 0.1;
        hfC[(row * rh + 1) * S + x] = 0.2;
      }
    }
    const rep = 1 / 1.6;
    return { map: tex(c, { repeat: rep }), normal: normalFromHeight(hfC, S, S, 2.5, rep) };
  });
}

/* ------------------------------------------------------------------ fabric */

export function fabricTextures() {
  return once('fabric', () => {
    const S = 256;
    const n = makeNoise(3, 32);
    const n2 = makeNoise(4, 128);
    const hf = new Float32Array(S * S);
    const { c, g } = canvas(S, S);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // plain weave: alternating warp/weft bumps, 4 px per thread
        const tx = Math.floor(x / 4);
        const ty = Math.floor(y / 4);
        const over = (tx + ty) % 2 === 0;
        const fx = (x % 4) / 4;
        const fy = (y % 4) / 4;
        const bump = over ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI);
        const slub = n(x / 8, y / 2) * 0.5 + n2(x, y / 4) * 0.5;
        const h = bump * 0.6 + slub * 0.4;
        hf[y * S + x] = h;
        const v = 0.86 + h * 0.12 - (n(x / 16, y / 16) - 0.5) * 0.08;
        const i = (y * S + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v * 255);
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const rep = 1 / 0.12; // 120 mm per tile
    return { map: tex(c, { repeat: rep }), normal: normalFromHeight(hf, S, S, 2.2, rep) };
  });
}

export function boucleTextures() {
  return once('boucle', () => {
    const S = 256;
    const r = mulberry32(9);
    const hf = new Float32Array(S * S);
    for (let k = 0; k < 900; k++) {
      const cx = r() * S;
      const cy = r() * S;
      const rad = 3 + r() * 4;
      for (let y = -8; y <= 8; y++) {
        for (let x = -8; x <= 8; x++) {
          const d = Math.hypot(x, y) / rad;
          if (d > 1) continue;
          const px = (Math.floor(cx + x) + S) % S;
          const py = (Math.floor(cy + y) + S) % S;
          hf[py * S + px] = Math.max(hf[py * S + px], Math.cos(d * Math.PI * 0.5) * (0.6 + r() * 0.05));
        }
      }
    }
    const { c, g } = canvas(S, S);
    const img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = 0.78 + hf[i] * 0.22;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v * 255;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const rep = 1 / 0.15;
    return { map: tex(c, { repeat: rep }), normal: normalFromHeight(hf, S, S, 3.5, rep) };
  });
}

/* ------------------------------------------------------------------ stone */

/** White quartz / marble with soft grey veining (greyscale-bright; tinted per part). 1 tile = 1.2 m. */
export function marbleTextures() {
  return once('marble', () => {
    const S = 512;
    const f = makeFbm(21, 4, 5);
    const { c, g } = canvas(S, S);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const v = y / S;
        const t = f(u * 4, v * 4);
        const s = Math.sin((u + v * 0.6) * Math.PI * 2 * 2 + t * 9);
        const vein = Math.pow(1 - Math.abs(s), 18) * 0.5 + Math.pow(1 - Math.abs(Math.sin((u * 0.4 - v) * Math.PI * 2 * 3 + t * 13)), 40) * 0.35;
        const cloud = (f(u * 4 + 2, v * 4 + 1) - 0.5) * 0.06;
        const val = clamp01(0.97 - vein * 0.42 + cloud);
        const i = (y * S + x) * 4;
        img.data[i] = val * 255;
        img.data[i + 1] = val * 252;
        img.data[i + 2] = val * 248;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return { map: tex(c, { repeat: 1 / 1.2 }) };
  });
}

/** Large-format floor tile with grout (coloured). `tileM` = tile edge(s) in metres; texture covers 2×2 tiles. */
function tileTexture(key: string, opts: { base: string; vary: number; tile: [number, number]; grout: string; stone: number; seed: number; stagger?: boolean }) {
  return once(key, () => {
    const S = 1024;
    const { c, g } = canvas(S, S);
    const f = makeFbm(opts.seed, 4, 5);
    const r = mulberry32(opts.seed);
    const nx = 2;
    const ny = Math.round((2 * opts.tile[0]) / opts.tile[1]) || 1;
    const tw = S / nx;
    const th = S / ny;
    const base = new THREE.Color().setStyle(opts.base, THREE.LinearSRGBColorSpace); // raw sRGB bytes for the canvas
    const img = g.createImageData(S, S);
    const hf = new Float32Array(S * S).fill(1);
    // per-tile tone jitter
    const jit: number[] = [];
    for (let k = 0; k < nx * ny * 2; k++) jit.push((r() - 0.5) * opts.vary);
    for (let y = 0; y < S; y++) {
      const ty = Math.floor(y / th);
      const off = opts.stagger && ty % 2 ? tw / 2 : 0;
      for (let x = 0; x < S; x++) {
        const xx = (x + off) % S;
        const tx = Math.floor(xx / tw);
        const j = jit[(ty * nx + tx) % jit.length];
        const u = x / S;
        const v = y / S;
        const t = f(u * 4, v * 4);
        const vein = Math.pow(1 - Math.abs(Math.sin((u + v * 0.7) * Math.PI * 4 + t * 7)), 24) * opts.stone;
        const k = 1 + j + (t - 0.5) * 0.08 - vein * 0.25;
        const i = (y * S + x) * 4;
        img.data[i] = Math.min(255, base.r * 255 * k);
        img.data[i + 1] = Math.min(255, base.g * 255 * k);
        img.data[i + 2] = Math.min(255, base.b * 255 * k);
        img.data[i + 3] = 255;
        const gx = xx % tw;
        const gy = y % th;
        if (gx < 3 || gy < 3) hf[y * S + x] = gx < 2 || gy < 2 ? 0 : 0.5;
      }
    }
    g.putImageData(img, 0, 0);
    // grout lines
    g.fillStyle = opts.grout;
    for (let ty = 0; ty < ny; ty++) {
      const off = opts.stagger && ty % 2 ? tw / 2 : 0;
      g.fillRect(0, ty * th, S, 3);
      for (let tx = 0; tx <= nx; tx++) {
        const x = (tx * tw - off + S) % S;
        g.fillRect(x, ty * th, 3, th);
      }
    }
    const rep: [number, number] = [1 / (nx * opts.tile[0]), 1 / (ny * opts.tile[1])];
    return { map: tex(c, { repeat: rep }), normal: normalFromHeight(hf, S, S, 3, rep) };
  });
}

export const stoneTileTextures = () =>
  tileTexture('stoneTile', { base: '#e2dcd2', vary: 0.04, tile: [0.8, 0.8], grout: '#cfc8bc', stone: 0.6, seed: 31 });
export const bathTileTextures = () =>
  tileTexture('bathTile', { base: '#b9b3aa', vary: 0.05, tile: [0.6, 1.2], grout: '#a7a198', stone: 0.05, seed: 41, stagger: true });

/** Terrazzo (balcony / utility). 1 tile = 0.6 m, seamless chips. */
export function terrazzoTextures() {
  return once('terrazzo', () => {
    const S = 512;
    const { c, g } = canvas(S, S);
    g.fillStyle = '#e4ddd1';
    g.fillRect(0, 0, S, S);
    const r = mulberry32(77);
    const chips = ['#b5653f', '#8f8a84', '#3d3a37', '#cbb89c', '#f4efe6', '#9aa58f', '#c98f6a'];
    for (let k = 0; k < 1400; k++) {
      const x = r() * S;
      const y = r() * S;
      const s = 1.5 + Math.pow(r(), 3) * 9;
      g.fillStyle = chips[Math.floor(r() * chips.length)];
      for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
        g.beginPath();
        const n = 5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + r();
          const rr = s * (0.6 + r() * 0.5);
          const px = x + ox + Math.cos(a) * rr;
          const py = y + oy + Math.sin(a) * rr;
          if (i) g.lineTo(px, py);
          else g.moveTo(px, py);
        }
        g.fill();
      }
    }
    return { map: tex(c, { repeat: 1 / 0.6 }) };
  });
}

/* ------------------------------------------------------------------ rugs (atlas 2×2) */

export const RUG_CELLS = 4;
export function rugTexture() {
  return once('rug', () => {
    const S = 1024;
    const H = S / 2;
    const { c, g } = canvas(S, S);
    const r = mulberry32(13);
    const fiber = (x0: number, y0: number, amt: number) => {
      const img = g.getImageData(x0, y0, H, H);
      for (let i = 0; i < img.data.length; i += 4) {
        const k = 1 + (r() - 0.5) * amt;
        img.data[i] *= k;
        img.data[i + 1] *= k;
        img.data[i + 2] *= k;
      }
      g.putImageData(img, x0, y0);
    };
    // 0: Beni-Ourain style — cream wool, wobbly charcoal diamond lattice
    g.fillStyle = '#f1e6d2';
    g.fillRect(0, 0, H, H);
    g.strokeStyle = 'rgba(122,88,62,0.75)';
    g.lineWidth = 4;
    g.lineCap = 'round';
    for (let k = -4; k <= 8; k++) {
      for (const dir of [1, -1]) {
        g.beginPath();
        for (let t = 0; t <= 1.0001; t += 0.05) {
          const y = t * H;
          const x = k * 85 + dir * (t * H * 0.55) + Math.sin(t * 31 + k) * 3 + (dir < 0 ? H * 0.55 : 0);
          if (t === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    fiber(0, 0, 0.18);
    // 1: vintage faded — rust field, ivory border, medallion
    g.save();
    g.translate(H, 0);
    g.fillStyle = '#a35a3d';
    g.fillRect(0, 0, H, H);
    g.fillStyle = '#e9dcc6';
    g.fillRect(14, 14, H - 28, H - 28);
    g.fillStyle = '#9b4f35';
    g.fillRect(34, 34, H - 68, H - 68);
    g.strokeStyle = '#2f3a4a';
    g.lineWidth = 6;
    g.strokeRect(46, 46, H - 92, H - 92);
    g.fillStyle = '#d9b48a';
    g.beginPath();
    g.moveTo(H / 2, 110);
    g.lineTo(H - 140, H / 2);
    g.lineTo(H / 2, H - 110);
    g.lineTo(140, H / 2);
    g.closePath();
    g.fill();
    g.fillStyle = '#2f3a4a';
    g.beginPath();
    g.arc(H / 2, H / 2, 46, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c98a5c';
    for (const [x, y] of [[100, 100], [H - 100, 100], [100, H - 100], [H - 100, H - 100]]) {
      g.beginPath();
      g.arc(x, y, 26, 0, Math.PI * 2);
      g.fill();
    }
    // faded / worn
    const f = makeFbm(5, 8, 4);
    const img = g.getImageData(H, 0, H, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < H; x++) {
        const w = Math.max(0, f(x / 64, y / 64) - 0.45) * 1.1;
        const i = (y * H + x) * 4;
        img.data[i] += (226 - img.data[i]) * w;
        img.data[i + 1] += (205 - img.data[i + 1]) * w;
        img.data[i + 2] += (180 - img.data[i + 2]) * w;
      }
    }
    g.restore();
    g.putImageData(img, H, 0);
    fiber(H, 0, 0.14);
    // 2: modern — sage & oatmeal arcs
    g.save();
    g.translate(0, H);
    g.fillStyle = '#ddd3c2';
    g.fillRect(0, 0, H, H);
    const cols = ['#8f9c83', '#c4a27c', '#6f7a66', '#e9e1d3'];
    for (let k = 0; k < 6; k++) {
      g.fillStyle = cols[k % cols.length];
      g.beginPath();
      g.arc(k % 2 ? H : 0, (k * H) / 5, 70 + k * 30, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    fiber(0, H, 0.12);
    // 3: jute / natural — woven tan with charcoal border
    g.save();
    g.translate(H, H);
    g.fillStyle = '#b89a73';
    g.fillRect(0, 0, H, H);
    for (let y = 0; y < H; y += 6) {
      g.fillStyle = y % 12 ? 'rgba(120,92,60,0.35)' : 'rgba(230,210,180,0.25)';
      g.fillRect(0, y, H, 3);
    }
    for (let x = 0; x < H; x += 6) {
      g.fillStyle = 'rgba(90,70,45,0.18)';
      g.fillRect(x, 0, 2, H);
    }
    g.strokeStyle = '#3a3633';
    g.lineWidth = 22;
    g.strokeRect(11, 11, H - 22, H - 22);
    g.restore();
    fiber(H, H, 0.2);
    return tex(c, { wrap: false });
  });
}

/* ------------------------------------------------------------------ art (atlas 3×2) */

export const ART_COLS = 3;
export const ART_ROWS = 2;
export function artTexture() {
  return once('art', () => {
    const CW = 384;
    const CH = 512;
    const { c, g } = canvas(CW * ART_COLS, CH * ART_ROWS);
    const r = mulberry32(17);
    const cell = (i: number, draw: () => void) => {
      g.save();
      g.translate((i % ART_COLS) * CW, Math.floor(i / ART_COLS) * CH);
      g.beginPath();
      g.rect(0, 0, CW, CH);
      g.clip();
      draw();
      g.restore();
    };
    // 0 arches + sun
    cell(0, () => {
      g.fillStyle = '#e8dccb';
      g.fillRect(0, 0, CW, CH);
      g.fillStyle = '#b5653f';
      g.beginPath();
      g.moveTo(60, CH);
      g.lineTo(60, 260);
      g.arc(170, 260, 110, Math.PI, 0);
      g.lineTo(280, CH);
      g.fill();
      g.fillStyle = '#8f9c83';
      g.beginPath();
      g.arc(270, CH - 40, 120, Math.PI, 0);
      g.fill();
      g.fillStyle = '#d8a548';
      g.beginPath();
      g.arc(285, 120, 46, 0, Math.PI * 2);
      g.fill();
    });
    // 1 brush strokes
    cell(1, () => {
      g.fillStyle = '#f1ede6';
      g.fillRect(0, 0, CW, CH);
      g.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        g.strokeStyle = k === 4 ? 'rgba(196,154,90,0.9)' : `rgba(30,30,30,${0.55 + r() * 0.35})`;
        g.lineWidth = 12 + r() * 30;
        g.beginPath();
        g.moveTo(30 + r() * 60, 80 + r() * 350);
        g.bezierCurveTo(r() * CW, r() * CH, r() * CW, r() * CH, CW - 30 - r() * 60, 80 + r() * 350);
        g.stroke();
      }
    });
    // 2 colour fields (soft edges)
    cell(2, () => {
      g.fillStyle = '#c7b49a';
      g.fillRect(0, 0, CW, CH);
      const fields: [string, number, number][] = [
        ['#9c4a2c', 40, 210],
        ['#2f3a4a', 270, 160],
        ['#d9b48a', 445, 40],
      ];
      for (const [col, y, h] of fields) {
        g.shadowColor = col;
        g.shadowBlur = 24;
        g.fillStyle = col;
        g.fillRect(36, y, CW - 72, h);
      }
      g.shadowBlur = 0;
    });
    // 3 line botanical
    cell(3, () => {
      g.fillStyle = '#efe8dc';
      g.fillRect(0, 0, CW, CH);
      g.fillStyle = '#c98a5c';
      g.beginPath();
      g.arc(CW / 2 + 40, 190, 95, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#2b2b2b';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(CW / 2, CH - 40);
      g.bezierCurveTo(CW / 2 - 20, 320, CW / 2 + 30, 200, CW / 2 - 10, 70);
      g.stroke();
      for (let k = 0; k < 9; k++) {
        const t = 0.15 + k * 0.09;
        const y = CH - 40 - t * (CH - 110);
        const s = k % 2 ? 1 : -1;
        g.beginPath();
        g.ellipse(CW / 2 + s * 42, y, 44, 15, s * -0.5, 0, Math.PI * 2);
        g.stroke();
      }
    });
    // 4 geometric circles
    cell(4, () => {
      g.fillStyle = '#2f3a4a';
      g.fillRect(0, 0, CW, CH);
      const cs = ['#d9b48a', '#b5653f', '#e8dccb', '#8f9c83'];
      for (let k = 0; k < 4; k++) {
        g.fillStyle = cs[k];
        g.beginPath();
        g.arc(CW / 2, 110 + k * 100, 70 - k * 6, k % 2 ? 0 : Math.PI, k % 2 ? Math.PI : Math.PI * 2);
        g.fill();
      }
    });
    // 5 landscape abstraction (hills)
    cell(5, () => {
      const grd = g.createLinearGradient(0, 0, 0, CH);
      grd.addColorStop(0, '#e9d8c0');
      grd.addColorStop(1, '#d7b896');
      g.fillStyle = grd;
      g.fillRect(0, 0, CW, CH);
      const hills = ['#a9b09a', '#7f8a72', '#5c6653', '#3f473a'];
      hills.forEach((col, k) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, CH);
        for (let x = 0; x <= CW; x += 8) g.lineTo(x, 230 + k * 70 + Math.sin(x / 60 + k * 2) * 26 + Math.sin(x / 23 + k) * 8);
        g.lineTo(CW, CH);
        g.fill();
      });
      g.fillStyle = '#f3efe7';
      g.beginPath();
      g.arc(110, 130, 34, 0, Math.PI * 2);
      g.fill();
    });
    // canvas grain over everything
    const img = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const k = 1 + (r() - 0.5) * 0.07;
      img.data[i] *= k;
      img.data[i + 1] *= k;
      img.data[i + 2] *= k;
    }
    g.putImageData(img, 0, 0);
    return tex(c, { wrap: false });
  });
}

/* ------------------------------------------------------------------ foliage (atlas 4×1, alpha) */

export const LEAF_CELLS = 4;
export function leafTexture() {
  return once('leaf', () => {
    const S = 256;
    const { c, g } = canvas(S * LEAF_CELLS, S);
    const r = mulberry32(23);
    // 0 broad (fiddle-leaf fig) — leaf points up, stem at bottom centre
    g.save();
    const grd = g.createLinearGradient(0, 0, S, S);
    grd.addColorStop(0, '#4d6b3a');
    grd.addColorStop(1, '#2f4a26');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(S / 2, S - 4);
    g.bezierCurveTo(8, S * 0.7, 18, 30, S / 2, 6);
    g.bezierCurveTo(S - 18, 30, S - 8, S * 0.7, S / 2, S - 4);
    g.fill();
    g.strokeStyle = 'rgba(190,210,150,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(S / 2, S - 6);
    g.lineTo(S / 2, 16);
    g.stroke();
    g.lineWidth = 1.5;
    for (let k = 1; k < 7; k++) {
      const y = S - 20 - k * 30;
      g.beginPath();
      g.moveTo(S / 2, y + 12);
      g.quadraticCurveTo(S / 2 - 40, y, S / 2 - 70, y - 14);
      g.moveTo(S / 2, y + 12);
      g.quadraticCurveTo(S / 2 + 40, y, S / 2 + 70, y - 14);
      g.stroke();
    }
    g.restore();
    // 1 olive sprig: many slender leaves on a twig
    g.save();
    g.translate(S, 0);
    g.strokeStyle = '#5b4a3a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(S / 2, S);
    g.quadraticCurveTo(S / 2 + 10, S / 2, S / 2 - 6, 4);
    g.stroke();
    for (let k = 0; k < 26; k++) {
      const t = r();
      const y = S - t * (S - 10);
      const s = r() < 0.5 ? -1 : 1;
      g.fillStyle = ['#7d8f6c', '#93a483', '#6b7c5c', '#a3b294'][k % 4];
      g.save();
      g.translate(S / 2 + Math.sin(t * 3) * 6, y);
      g.rotate(s * (0.5 + r() * 0.6) - 0.15);
      g.beginPath();
      g.ellipse(0, -26, 6, 28, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.restore();
    // 2 pampas plume
    g.save();
    g.translate(S * 2, 0);
    for (let k = 0; k < 2200; k++) {
      const t = Math.pow(r(), 0.8);
      const y = S - 30 - t * (S - 40);
      const wdt = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 50 + 6;
      const x = S / 2 + (r() - 0.5) * 2 * wdt + Math.sin(t * 4) * 10;
      g.fillStyle = `rgba(${226 + r() * 20},${206 + r() * 20},${170 + r() * 20},0.8)`;
      g.fillRect(x, y, 2, 6);
    }
    g.strokeStyle = '#b8a07e';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(S / 2, S);
    g.lineTo(S / 2, S - 40);
    g.stroke();
    g.restore();
    // 3 palm/strelitzia-like long leaf
    g.save();
    g.translate(S * 3, 0);
    const grd2 = g.createLinearGradient(0, 0, S, 0);
    grd2.addColorStop(0, '#3c5a33');
    grd2.addColorStop(0.5, '#4f7343');
    grd2.addColorStop(1, '#35512d');
    g.fillStyle = grd2;
    g.beginPath();
    g.moveTo(S / 2, S);
    g.bezierCurveTo(S / 2 - 70, S * 0.55, S / 2 - 50, 40, S / 2, 4);
    g.bezierCurveTo(S / 2 + 50, 40, S / 2 + 70, S * 0.55, S / 2, S);
    g.fill();
    g.strokeStyle = 'rgba(180,200,140,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(S / 2, S);
    g.lineTo(S / 2, 10);
    g.stroke();
    g.restore();
    const t = tex(c, { wrap: false });
    t.premultiplyAlpha = false;
    return t;
  });
}

/* ------------------------------------------------------------------ fake contact shadow (atlas 2×1) */

/** Left cell: soft rounded-rect blob (furniture). Right cell: linear falloff, opaque at v=1 (wall–floor AO strip). */
export function shadowTexture() {
  return once('shadow', () => {
    const S = 128;
    const { c, g } = canvas(S * 2, S);
    g.shadowColor = 'rgba(0,0,0,1)';
    g.shadowBlur = 16;
    g.shadowOffsetX = 1000;
    g.fillStyle = '#000';
    const m = 24;
    g.beginPath();
    g.roundRect(m - 1000, m, S - 2 * m, S - 2 * m, 14);
    g.fill();
    g.shadowBlur = 0;
    g.shadowOffsetX = 0;
    const grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = grd;
    g.fillRect(S + 2, 0, S - 4, S);
    const t = tex(c, { wrap: false });
    t.colorSpace = THREE.NoColorSpace;
    return t;
  });
}
