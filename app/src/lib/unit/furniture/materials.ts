/**
 * Shared material set for the illustrative model-flat dressing.
 *
 * Materials are SURFACE TYPES (fabric, wood, paint, stone, metal …); the actual colour of each part
 * comes from a per-vertex colour (geom.ts), so oak vs walnut, oatmeal vs terracotta linen, etc. all
 * share one material → after per-material merging the whole flat's furniture is ~20 draw calls.
 *
 * Art direction ("warm modern"): oak + walnut, oatmeal / warm-grey linen and ivory bouclé,
 * brushed brass and matte-black accents, white quartz / marble, matte ceramics, sage + terracotta
 * accents; warm-white paint; oak plank floors in living/bedrooms, large-format stone-look tile in
 * kitchen/foyer, concrete-look porcelain in baths, terrazzo on balconies/utility.
 */
import * as THREE from 'three';
import type { TracedRoomKind } from '@/data/sobha/traced/types';
import {
  artTexture,
  bathTileTextures,
  boucleTextures,
  fabricTextures,
  leafTexture,
  marbleTextures,
  rugTexture,
  shadowTexture,
  stoneTileTextures,
  terrazzoTextures,
  woodFloorTextures,
  woodTextures,
} from './textures';

export type MatKey =
  | 'fabric'
  | 'fabricDS' // double-sided fabric: curtains, duvet drape, throws
  | 'boucle'
  | 'leather'
  | 'wood'
  | 'paint' // matte lacquer / painted MDF / books / skirting
  | 'stone'
  | 'gloss' // glossy ceramic / porcelain / TV glass / appliance enamel
  | 'matte' // matte ceramic, terracotta, plaster, rubber
  | 'metal' // brushed brass / chrome / stainless (tint by vertex colour)
  | 'powder' // powder-coated black / dark metal
  | 'glass'
  | 'mirror'
  | 'shade' // lamp shade (warm self-glow)
  | 'bulb' // unlit warm emitter
  | 'rug'
  | 'art'
  | 'leaf';

export type FloorKey = 'woodFloor' | 'stoneTile' | 'bathTile' | 'terrazzo';

/** Warm-white wall paint used when the flat is furnished. */
export const WALL_PAINT = '#efe9df';

/** sRGB hex palette (vertex colours). */
export const P = {
  oak: '#c69c6d',
  oakLight: '#d9b991',
  walnut: '#6e4a31',
  teak: '#9a6a43',
  linen: '#a99d8e',
  oatmeal: '#d3c8b6',
  warmGrey: '#8f8780',
  charcoal: '#4b4744',
  ivory: '#ece6dc',
  sheet: '#f3f0ea',
  terracotta: '#b5653f',
  rust: '#9c4a2c',
  sage: '#8f9c83',
  deepGreen: '#55624f',
  ochre: '#c99a45',
  dustyBlue: '#7e8d9a',
  cognac: '#8e5434',
  brass: '#c9a462',
  black: '#262422',
  chrome: '#e3e3e3',
  steel: '#c2c4c5',
  white: '#f4f2ee',
  cabinetWhite: '#ece8e1',
  greige: '#cdc3b4',
  sageCab: '#97a28c',
  quartz: '#f1eee8',
  travertine: '#d8c7ad',
  terracottaPot: '#b8714c',
  stoneGrey: '#9d9890',
  screen: '#0d0f12',
} as const;

let mats: Record<MatKey, THREE.Material> | null = null;
let floors: Record<FloorKey, THREE.MeshStandardMaterial> | null = null;
let shadowMat: THREE.MeshBasicMaterial | null = null;
let ceilingMat: THREE.MeshStandardMaterial | null = null;

/** Matte white ceiling (walk / VR only; single-sided, faces down → invisible from the dollhouse). */
export function getCeilingMaterial(): THREE.MeshStandardMaterial {
  if (!ceilingMat) {
    ceilingMat = new THREE.MeshStandardMaterial({ color: '#f7f5f0', roughness: 0.95 });
    ceilingMat.name = 'furn:ceiling';
  }
  return ceilingMat;
}

function std(p: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, ...p });
}

export function getMaterials(): Record<MatKey, THREE.Material> {
  if (mats) return mats;
  const wood = woodTextures();
  const fab = fabricTextures();
  const bou = boucleTextures();
  const marble = marbleTextures();
  mats = {
    fabric: std({ map: fab.map, normalMap: fab.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95 }),
    fabricDS: std({ map: fab.map, normalMap: fab.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95, side: THREE.DoubleSide }),
    boucle: std({ map: bou.map, normalMap: bou.normal, normalScale: new THREE.Vector2(1, 1), roughness: 1 }),
    leather: std({ roughness: 0.48, normalMap: fab.normal, normalScale: new THREE.Vector2(0.12, 0.12) }),
    wood: std({ map: wood.map, roughnessMap: wood.roughness, normalMap: wood.normal, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.75 }),
    paint: std({ roughness: 0.55 }),
    stone: std({ map: marble.map, roughness: 0.18 }),
    gloss: std({ roughness: 0.12 }),
    matte: std({ roughness: 0.82 }),
    metal: std({ metalness: 1, roughness: 0.32 }),
    powder: std({ metalness: 0.35, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({
      color: '#e4f1f2',
      roughness: 0.02,
      metalness: 0.35, // picks up the room env map → visible reflections on shower screens
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    mirror: new THREE.MeshStandardMaterial({ color: '#e9ecee', metalness: 1, roughness: 0.03 }),
    shade: std({ map: fab.map, roughness: 0.9, emissive: new THREE.Color('#ffcf94'), emissiveIntensity: 0.55, side: THREE.DoubleSide }),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1d6').multiplyScalar(1.6), toneMapped: false }),
    rug: std({ map: rugTexture(), roughness: 1 }),
    art: std({ map: artTexture(), roughness: 0.85 }),
    leaf: std({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 }),
  };
  for (const [k, m] of Object.entries(mats)) m.name = `furn:${k}`;
  return mats;
}

export function getFloorMaterials(): Record<FloorKey, THREE.MeshStandardMaterial> {
  if (floors) return floors;
  const wf = woodFloorTextures();
  const st = stoneTileTextures();
  const bt = bathTileTextures();
  const tz = terrazzoTextures();
  const base = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  floors = {
    woodFloor: new THREE.MeshStandardMaterial({ map: wf.map, normalMap: wf.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.42, ...base }),
    stoneTile: new THREE.MeshStandardMaterial({ map: st.map, normalMap: st.normal, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.22, ...base }),
    bathTile: new THREE.MeshStandardMaterial({ map: bt.map, normalMap: bt.normal, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.55, ...base }),
    terrazzo: new THREE.MeshStandardMaterial({ map: tz.map, roughness: 0.4, ...base }),
  };
  for (const [k, m] of Object.entries(floors)) m.name = `floor:${k}`;
  return floors;
}

export function getShadowMaterial(): THREE.MeshBasicMaterial {
  if (shadowMat) return shadowMat;
  shadowMat = new THREE.MeshBasicMaterial({
    color: '#000000',
    alphaMap: shadowTexture(),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
  });
  shadowMat.name = 'furn:shadow';
  return shadowMat;
}

/** Floor finish per room kind (themed material TracedUnit3D can reuse). */
export function floorKeyFor(kind: TracedRoomKind): FloorKey | null {
  switch (kind) {
    case 'living':
    case 'bedroom':
    case 'closet':
    case 'circulation':
      return 'woodFloor';
    case 'kitchen':
    case 'foyer':
      return 'stoneTile';
    case 'wet':
      return 'bathTile';
    case 'balcony':
    case 'utility':
      return 'terrazzo';
    default:
      return null;
  }
}

/** Apply the image-based-lighting env map to every furniture / floor material. */
export function applyEnvironment(env: THREE.Texture | null, intensity: number) {
  const all: THREE.Material[] = [...Object.values(getMaterials()), ...Object.values(getFloorMaterials()), getCeilingMaterial()];
  for (const m of all) {
    if (m instanceof THREE.MeshStandardMaterial) {
      m.envMap = env;
      m.envMapIntensity = m.name === 'furn:mirror' ? 1 : m.name === 'furn:metal' ? intensity * 1.2 : intensity;
      m.needsUpdate = true;
    }
  }
}

/** Extra env for GLTF model materials (Poly Haven), same intensity. */
export function applyEnvironmentTo(m: THREE.Material, env: THREE.Texture | null, intensity: number) {
  if (m instanceof THREE.MeshStandardMaterial) {
    m.envMap = env;
    m.envMapIntensity = intensity;
    m.needsUpdate = true;
  }
}
