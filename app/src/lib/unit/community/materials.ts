import * as THREE from 'three';

/**
 * Shared Community materials (created once, never disposed — they live as long as the page).
 *
 * MASSING: ONE MeshLambertMaterial for every tower, neighbour flat, core, club mass and the perimeter
 * wall — vertex colour × a tiny facade texture (one 3 m floor per v, one 3 m module per u): slab edge,
 * spandrel, glazing band with mullions. "Solid" faces sample the plain spandrel band at a constant uv
 * (SOLID_UV in geom.ts), so their colour is the vertex colour.
 *
 * GROUND: flat layers draw in painter's order with depthWrite off (like the rest of the surroundings),
 * above the outside raster / vector ground and below everything that stands up.
 */

let facadeTex: THREE.CanvasTexture | null = null;
export function getFacadeTexture(): THREE.CanvasTexture {
  if (facadeTex) return facadeTex;
  const W = 64;
  const H = 64; // 3 m per 64 px → 4.7 cm / px
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const row = (y0m: number, y1m: number) => [H - (y1m / 3) * H, ((y1m - y0m) / 3) * H] as const; // canvas y is top-down, v is bottom-up
  const band = (y0m: number, y1m: number, fill: string) => {
    const [y, h] = row(y0m, y1m);
    g.fillStyle = fill;
    g.fillRect(0, y, W, h);
  };
  band(0, 3, '#f4f1ea'); // spandrel / wall (≈ white so vertex colours read true)
  band(0, 0.2, '#bdb6a9'); // slab edge
  band(2.82, 3, '#bdb6a9');
  band(0.95, 2.6, '#7f909e'); // glazing
  band(0.95, 1.02, '#9aa8b3'); // sill line
  // mullions every 0.75 m within the glazing band
  const [gy, gh] = row(0.95, 2.6);
  g.fillStyle = '#d5d8d6';
  for (let k = 0; k < 4; k++) g.fillRect(Math.round((k * W) / 4), gy, 2, gh);
  facadeTex = new THREE.CanvasTexture(c);
  facadeTex.wrapS = facadeTex.wrapT = THREE.RepeatWrapping;
  facadeTex.colorSpace = THREE.SRGBColorSpace;
  facadeTex.anisotropy = 4;
  return facadeTex;
}

let massMat: THREE.MeshLambertMaterial | null = null;
export function getMassMaterial(): THREE.MeshLambertMaterial {
  if (!massMat) massMat = new THREE.MeshLambertMaterial({ map: getFacadeTexture(), vertexColors: true, color: new THREE.Color(1.35, 1.35, 1.35), emissive: '#1b1e24' });
  return massMat;
}

let ghostMat: THREE.MeshLambertMaterial | null = null;
/** Dollhouse: floors above the unit, faint so the unit stays visible. */
export function getGhostMaterial(): THREE.MeshLambertMaterial {
  if (!ghostMat) ghostMat = new THREE.MeshLambertMaterial({ color: '#efe6d6', transparent: true, opacity: 0.2, depthWrite: false });
  return ghostMat;
}

/** Painter-ordered flat ground layer material (no depth writes). */
export const groundMat = (p: THREE.MeshLambertMaterialParameters) =>
  new THREE.MeshLambertMaterial({ depthWrite: false, side: THREE.DoubleSide, ...p });

let stripeTex: THREE.CanvasTexture | null = null;
/** Mowing stripes for the cricket / celebration field: two greens, u = one stripe pair. */
export function getMowTexture(): THREE.CanvasTexture {
  if (stripeTex) return stripeTex;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 4;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5f8f45';
  g.fillRect(0, 0, 16, 4);
  g.fillStyle = '#6f9f51';
  g.fillRect(16, 0, 16, 4);
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.anisotropy = 8;
  return stripeTex;
}

let fieldMat: THREE.MeshLambertMaterial | null = null;
export function getFieldMaterial(): THREE.MeshLambertMaterial {
  if (!fieldMat) fieldMat = groundMat({ map: getMowTexture() });
  return fieldMat;
}

let pavingMat: THREE.MeshLambertMaterial | null = null;
export function getPavingMaterial(): THREE.MeshLambertMaterial {
  if (!pavingMat) pavingMat = groundMat({ vertexColors: true });
  return pavingMat;
}

let waterMat: THREE.MeshPhongMaterial | null = null;
/** "Reflective-ish" water: Phong with a strong specular so the real sun leaves a glint (no env map — Quest-cheap). */
export function getWaterMaterial(): THREE.MeshPhongMaterial {
  if (!waterMat)
    waterMat = new THREE.MeshPhongMaterial({
      color: '#3f7896',
      specular: '#e8f2ff',
      shininess: 120,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  return waterMat;
}
