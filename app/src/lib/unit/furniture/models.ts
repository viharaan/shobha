/**
 * Hybrid layer: real CC0 Poly Haven models (public/models/furniture, see src/data/furnitureModels.ts)
 * for the types where they look better than the procedural kit; everything else stays procedural.
 *
 * Loading: three's GLTFLoader + the bundled MeshoptDecoder (EXT_meshopt_compression,
 * KHR_mesh_quantization). No Draco, no CDN. A model that fails to load (404, decode error) is
 * simply skipped → the item is built procedurally. (We use the loader directly rather than drei's
 * suspending useGLTF so a single failing file can never blank the whole scene.)
 *
 * Every model is flattened at load into float, indexed geometries in the model's root frame
 * (front = +Z per the manifest), one per source material, so instances can be merged per material.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { FurnitureType } from '@/data/sobha/traced/furnitureTypes';
import { furnitureModels, type FurnitureModel } from '@/data/sobha/furnitureModels';

export interface ModelPiece {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}
export interface ModelAsset {
  model: FurnitureModel;
  pieces: ModelPiece[];
  /** bbox in the model root frame (m). */
  box: THREE.Box3;
  tris: number;
}

/**
 * Which models to use per type (first that fits wins), and how to fit them.
 * 'footprint': uniform scale = min(w, d) fit, must be within [0.78, 1.25]; the other axis may
 *              stretch ≤ 15 % towards the footprint. Else → procedural.
 * 'natural':   real-world size (scale ≈ 1, clamped 0.85–1.15) by width; reject if the footprint is
 *              much narrower (< 70 %).
 * 'height':    scale to the item's height (vases).
 * Curation (checked visually): dining chairs stay procedural light oak + linen seats (dining_chair_02
 * is a dark tufted Chesterfield, painted_wooden_chair_01 a white farmhouse chair — both clash);
 * vases stay procedural (with olive / pampas stems); sofas, wall art and mirrors stay procedural (warm-modern consistency; sofa_02 is a dark
 * Chesterfield, ornate_mirror_01 is baroque); dining tables stay procedural (wooden_table_02 is a
 * 4-seater); beds / kitchen / bath / curtains / rugs / wardrobes have no model.
 */
export const MODEL_POLICY: Partial<Record<FurnitureType, { ids: string[]; vrIds?: string[]; fit: 'footprint' | 'natural' | 'height' }>> = {
  armchair: { ids: ['modern_arm_chair_01', 'mid_century_lounge_chair'], fit: 'natural' },
  coffeeTable: { ids: ['modern_coffee_table_01', 'coffee_table_round_01'], fit: 'footprint' },
  sideTable: { ids: ['side_table_01'], fit: 'footprint' },
  tvUnit: { ids: ['modern_wooden_cabinet'], fit: 'footprint' },
  outdoorChair: { ids: ['outdoor_chair_01'], fit: 'natural' },
  outdoorTable: { ids: ['outdoor_table_01'], fit: 'natural' },
  plant: { ids: ['potted_plant_01', 'potted_plant_02'], vrIds: ['potted_plant_04'], fit: 'height' },
  pendantLight: { ids: ['modern_ceiling_lamp_01'], fit: 'natural' },
};

const cache = new Map<string, Promise<ModelAsset | null>>();
let loader: GLTFLoader | null = null;

function getLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

/** Copy an attribute to a plain Float32 attribute (dequantises normalized / interleaved data). */
function toFloat(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number) {
  const out = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++) {
    out[i * size] = a.getX(i);
    if (size > 1) out[i * size + 1] = a.getY(i);
    if (size > 2) out[i * size + 2] = a.getZ(i);
  }
  return new THREE.BufferAttribute(out, size);
}

function flatten(model: FurnitureModel, root: THREE.Object3D): ModelAsset {
  root.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const src = mesh.geometry;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', toFloat(src.attributes.position, 3));
    if (src.attributes.normal) g.setAttribute('normal', toFloat(src.attributes.normal, 3));
    g.setAttribute('uv', src.attributes.uv ? toFloat(src.attributes.uv, 2) : new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
    const idx = src.index ? Array.from({ length: src.index.count }, (_, i) => src.index!.getX(i)) : Array.from({ length: src.attributes.position.count }, (_, i) => i);
    g.setIndex(idx);
    g.applyMatrix4(mesh.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = mats[0];
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m)!.push(g);
  });
  const pieces: ModelPiece[] = [];
  const box = new THREE.Box3();
  let tris = 0;
  byMat.forEach((gs, mat) => {
    for (const g of gs) {
      g.computeBoundingBox();
      box.union(g.boundingBox!);
      tris += g.index!.count / 3;
      pieces.push({ geo: g, mat });
    }
    if (mat instanceof THREE.MeshStandardMaterial) {
      // no glass / transmission surprises on Quest: keep opaque unless the asset really is blended
      mat.side = THREE.FrontSide;
    }
  });
  return { model, pieces, box, tris };
}

export function loadModel(id: string): Promise<ModelAsset | null> {
  if (cache.has(id)) return cache.get(id)!;
  const model = furnitureModels.find((m) => m.id === id);
  const p: Promise<ModelAsset | null> = !model
    ? Promise.resolve(null)
    : getLoader()
        .loadAsync(model.file)
        .then((gltf) => flatten(model, gltf.scene))
        .catch((e) => {
          console.warn(`[furniture] model ${id} failed to load, using procedural`, e);
          return null;
        });
  cache.set(id, p);
  return p;
}

/** Load every model the given types might use (resolves to whatever loaded). */
export async function loadModelsFor(types: FurnitureType[], vr: boolean): Promise<Map<string, ModelAsset>> {
  const ids: string[] = [];
  for (const t of types) {
    const pol = MODEL_POLICY[t];
    if (pol) for (const id of vr && pol.vrIds ? pol.vrIds : pol.ids) if (!ids.includes(id)) ids.push(id);
  }
  const out = new Map<string, ModelAsset>();
  const res = await Promise.all(ids.map((id) => loadModel(id).then((a) => [id, a] as const)));
  for (const [id, a] of res) if (a) out.set(id, a);
  return out;
}

export interface ModelFit {
  asset: ModelAsset;
  /** Matrix from model root frame → item-local frame (front −Z, base y = 0). */
  m: THREE.Matrix4;
}

/**
 * Pick a model for an item and compute its fit, or null → procedural.
 * w, d, h in metres (h = item height if given).
 */
export function fitModel(
  type: FurnitureType,
  w: number,
  d: number,
  h: number | undefined,
  lib: Map<string, ModelAsset>,
  vr: boolean,
  pickIndex: number,
  opts: { round?: boolean } = {}
): ModelFit | null {
  const pol = MODEL_POLICY[type];
  if (!pol) return null;
  const ids = (vr && pol.vrIds ? pol.vrIds : pol.ids).filter((id) => lib.has(id));
  if (!ids.length) return null;
  // prefer a model whose footprint shape matches (round vs rectangular coffee tables …)
  const order = ids.slice();
  if (type === 'coffeeTable') order.sort((a, b) => (/round/.test(a) === !!opts.round ? -1 : 1) - (/round/.test(b) === !!opts.round ? -1 : 1));
  else if (pol.fit === 'height' || type === 'diningChair') order.unshift(...order.splice(pickIndex % order.length, 1));
  for (const id of order) {
    const a = lib.get(id)!;
    const size = a.box.getSize(new THREE.Vector3());
    const ctr = a.box.getCenter(new THREE.Vector3());
    const sx = w / size.x;
    const sz = d / size.z;
    let kx: number;
    let ky: number;
    let kz: number;
    if (pol.fit === 'footprint') {
      const s = Math.min(sx, sz);
      if (s < 0.78 || s > 1.25) continue;
      kx = Math.min(sx, s * 1.15);
      kz = Math.min(sz, s * 1.15);
      ky = s;
    } else if (pol.fit === 'height') {
      const target = h ?? size.y;
      const s = target / size.y;
      // the pot must not be wildly wider than the footprint
      if (size.x * s > w * 1.6 && w > 0.1) continue;
      kx = ky = kz = s;
    } else {
      if (sx < 0.7) continue;
      const s = Math.min(1.15, Math.max(0.85, Math.min(sx, type === 'diningChair' || type === 'outdoorChair' ? sx : Math.max(sz, sx))));
      kx = ky = kz = s;
    }
    // root frame → centre on x/z, base at y = 0, scale, then 180° yaw (model front +Z → item front −Z)
    const m = new THREE.Matrix4()
      .makeRotationY(Math.PI)
      .multiply(new THREE.Matrix4().makeScale(kx, ky, kz))
      .multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -a.box.min.y, -ctr.z));
    return { asset: a, m };
  }
  return null;
}
