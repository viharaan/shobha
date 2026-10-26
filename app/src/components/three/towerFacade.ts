import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { FLOOR_TO_FLOOR_M } from '@/data/project';

/**
 * Tower facade as read from the developer's elevation render (clip-03): dark bronze vertical fins framing
 * cream balcony bands, dark-glass window stacks, a two-bay rhythm. ILLUSTRATIVE: no elevation drawing
 * was supplied. One texture tile = two 3 m bays wide × one floor slab high; ExtrudeGeometry's side UVs
 * are in metres, so `repeat` maps metres → tiles. Drawn near-white where the instance colour must read.
 */
let facade: CanvasTexture | null = null;
export function getTowerFacadeTexture(): CanvasTexture {
  if (facade) return facade;
  const W = 192, H = 96; // 6 m × one slab (FLOOR_TO_FLOOR_M · 0.9)
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const mx = W / 6; // px per metre (u)
  const my = H / (FLOOR_TO_FLOOR_M * 0.9); // px per metre (v); canvas y is top-down
  const rect = (x0: number, y0: number, x1: number, y1: number, fill: string) => { g.fillStyle = fill; g.fillRect(x0 * mx, H - y1 * my, (x1 - x0) * mx, (y1 - y0) * my); };
  rect(0, 0, 6, 2.7, '#efe9dd'); // cream spandrel
  // bay 1 (0–3 m): balcony stack — glass railing band over a cream parapet, open above
  rect(0.35, 0.15, 2.65, 1.1, '#e3dccd');
  rect(0.35, 1.1, 2.65, 1.25, '#9fb0bd');
  rect(0.35, 1.25, 2.65, 2.45, '#3a4652'); // recessed balcony shade
  // bay 2 (3–6 m): bronze-framed window stack
  rect(3, 0, 6, 2.7, '#5a3f2e');
  rect(3.3, 0.35, 5.7, 2.35, '#2a333d'); // dark glass
  rect(4.45, 0.35, 4.55, 2.35, '#7a5a44'); // mullion
  // vertical fins at bay edges and slab edge line
  for (const x of [0, 2.85, 5.85]) rect(x, 0, x + 0.15, 2.7, '#3b2a1f');
  rect(0, 2.55, 6, 2.7, '#d9d2c4');
  facade = new CanvasTexture(c);
  facade.wrapS = facade.wrapT = RepeatWrapping;
  facade.repeat.set(1 / 6, -1 / (FLOOR_TO_FLOOR_M * 0.9)); // v runs 1 − depth on extrusion side walls
  facade.colorSpace = SRGBColorSpace;
  facade.anisotropy = 8;
  return facade;
}

/** "SOBHA" roof signage plate (white on bronze), as on the render's crowns. */
let sign: CanvasTexture | null = null;
export function getSignTexture(): CanvasTexture {
  if (sign) return sign;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3b2a1f'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#f4f1ea'; g.font = '600 86px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.letterSpacing = '14px';
  g.fillText('SOBHA', 262, 70);
  sign = new CanvasTexture(c);
  sign.colorSpace = SRGBColorSpace;
  sign.anisotropy = 8;
  return sign;
}
