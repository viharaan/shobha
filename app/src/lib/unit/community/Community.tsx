/* eslint-disable react-hooks/set-state-in-effect, react-hooks/refs, react-hooks/immutability -- ported R3F code: refs and mutable scratch state driven from useFrame */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { UnitPlacement } from '@/data/sobha/traced/placement';
import { FLOOR_TO_FLOOR_M, PODIUM_M } from '@/data/sobha/traced/placement';
import { wings } from '@/data/sobha/wings';
import type { UnitGeometry } from '@/lib/unit/unitGeometry';
import { triCount, type HeightFn, type XZ } from './geom';
import { buildOwnTower, unitToSite } from './sameFloor';
import { buildPlanGround, buildSiteGround, buildSiteMassing, labelAnchors, refineMask, wingOutlineSite } from './siteBuild';
import { getFieldMaterial, getGhostMaterial, getMassMaterial, getPavingMaterial, getWaterMaterial } from './materials';
import { readCommunityUrl, useCommunity } from './communityStore';
import Trees from './Trees';

/**
 * COMMUNITY LAYER for the 1:1 / VR unit viewer — the SOBHA OneWorld master plan around the flat.
 *
 *  unit frame (the unit stays at its origin):
 *    - own tower: same-floor neighbours from their per-flat placements + core, the plate repeated two
 *      floors down / one up, then the traced roof outline to the ground / roof (sameFloor.ts)
 *  site frame (inside the inverse-placement group `xf`, terrain via hAt):
 *    - the 13 other wings from the traced master-plan roofs, One Club mass, perimeter wall (one mesh)
 *    - ground inside the site boundary: the REGISTERED master-plan raster (0.3 m/px) + traced
 *      paving / roads / track / jog loop, the stadium field and water (painter-ordered, no depth writes)
 *    - sparse 3-D labels (drei Text, local font — VR-safe)
 *    - trees: the instanced Trees component (community/Trees.tsx, masterplanTrees.ts); VR (no shadows)
 *      uses its 'vr' quality (nearest 800)
 *
 * Draw calls (balcony view, everything in view): own tower 2, site massing 1, plan ground 1,
 * paving 1, field 1, water 1, labels 3 → ≈ 10 (+ trees, + the shadow pass on desktop).
 */

const RO_PLAN = -2.6;
const RO_PAVING = -2.4;
const RO_FIELD = -2.3;
const RO_WATER = -2.2;

export interface CommunityProps {
  placement: UnitPlacement;
  geo: UnitGeometry;
  floorY: number;
  /** walk / VR: floors above are opaque (dollhouse: ghosted) */
  firstPerson: boolean;
  /** top view: skip the floors above the unit entirely */
  hideAbove?: boolean;
  /** desktop sun shadows (off in VR) */
  shadows: boolean;
  hAt?: HeightFn;
  /** site 3-D → unit frame (worldGroupTransform) */
  xf: { rotY: number; pos: [number, number, number] };
}

export interface CommunityInfo {
  meshes: number;
  triangles: number;
  parts: Record<string, { meshes: number; triangles: number }>;
  neighbours: number;
  mode: 'flats' | 'outline' | 'none';
  coreM2: number;
  planCells: number;
}

function useDisposeGeo(g: THREE.BufferGeometry | null | undefined) {
  useEffect(() => () => g?.dispose(), [g]);
}

/* ----------------------------- master plan ------------------------------ */

const planTexCache = new Map<string, Promise<THREE.Texture>>();
function loadPlanTexture(url: string, aniso: number): Promise<THREE.Texture> {
  let p = planTexCache.get(url);
  if (!p) {
    p = new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = aniso; // grazing views from the balcony need it
          t.generateMipmaps = true;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
          resolve(t);
        },
        undefined,
        () => reject(new Error(`master plan ${url}`))
      );
    });
    planTexCache.set(url, p);
    p.catch(() => planTexCache.delete(url));
  }
  return p;
}

function PlanGroundMesh({ hAt, onCells }: { hAt?: HeightFn; onCells: (n: number) => void }) {
  const gl = useThree((s) => s.gl);
  const plan = useMemo(() => buildPlanGround(hAt), [hAt]);
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!plan) return;
    let alive = true;
    loadPlanTexture(plan.image, Math.min(16, gl.capabilities.getMaxAnisotropy()))
      .then((t) => alive && setTex(t))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [plan, gl]);
  const mat = useMemo(() => {
    if (!plan || !tex) return null;
    try {
      refineMask(plan.mask, tex.image as CanvasImageSource, plan.pxM);
    } catch {
      // keep the outline-only mask
    }
    const alpha = new THREE.CanvasTexture(plan.mask);
    return new THREE.MeshLambertMaterial({ map: tex, alphaMap: alpha, alphaTest: 0.5, depthWrite: false, side: THREE.DoubleSide });
  }, [plan, tex]);
  useEffect(
    () => () => {
      mat?.alphaMap?.dispose();
      mat?.dispose();
    },
    [mat]
  );
  useDisposeGeo(plan?.geometry);
  useEffect(() => onCells(plan?.cells ?? 0), [plan, onCells]);
  if (!plan || !mat) return null;
  return <mesh name="community:plan" geometry={plan.geometry} material={mat} renderOrder={RO_PLAN} receiveShadow raycast={() => null} />;
}

function GroundFeatures({ hAt }: { hAt?: HeightFn }) {
  const g = useMemo(() => {
    const s = buildSiteGround(hAt);
    return { paving: s.paving.geometry(), field: s.field.geometry(), water: s.water.geometry() };
  }, [hAt]);
  useDisposeGeo(g.paving);
  useDisposeGeo(g.field);
  useDisposeGeo(g.water);
  return (
    <>
      <mesh name="community:paving" geometry={g.paving} material={getPavingMaterial()} renderOrder={RO_PAVING} receiveShadow raycast={() => null} />
      <mesh name="community:field" geometry={g.field} material={getFieldMaterial()} renderOrder={RO_FIELD} receiveShadow raycast={() => null} />
      <mesh name="community:water" geometry={g.water} material={getWaterMaterial()} renderOrder={RO_WATER} raycast={() => null} />
    </>
  );
}

/* ------------------------------- labels --------------------------------- */

function Labels({ hAt }: { hAt?: HeightFn }) {
  const anchors = useMemo(() => labelAnchors(), []);
  return (
    <>
      {anchors.map((a) => (
        <Billboard key={a.text} position={[a.at[0], (hAt ? hAt(a.at[0], a.at[1]) : 0) + a.h, a.at[1]]}>
          <Text
            name="community:label"
            font="/fonts/NotoSans-Regular.ttf"
            fontSize={4.2}
            color="#0b1f3a"
            outlineWidth={0.3}
            outlineColor="#ffffff"
            anchorX="center"
            anchorY="bottom"
            raycast={() => null}
          >
            {a.text}
          </Text>
        </Billboard>
      ))}
    </>
  );
}

/* -------------------------------- stats --------------------------------- */

function Stats({ root, extra }: { root: React.RefObject<THREE.Group>; extra: Omit<CommunityInfo, 'meshes' | 'triangles' | 'parts'> }) {
  const t = useRef(1.5);
  const ex = useRef(extra);
  ex.current = extra;
  useFrame((_, dt) => {
    t.current += dt;
    if (t.current < 2 || !root.current) return;
    t.current = 0;
    const parts: CommunityInfo['parts'] = {};
    let meshes = 0;
    let triangles = 0;
    root.current.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      const g = m.geometry as THREE.BufferGeometry & { isInstancedBufferGeometry?: boolean; instanceCount?: number };
      let tri = triCount(g);
      if (g.isInstancedBufferGeometry && g.instanceCount != null && Number.isFinite(g.instanceCount)) tri *= g.instanceCount;
      if ((m as THREE.InstancedMesh).isInstancedMesh) tri *= (m as THREE.InstancedMesh).count;
      let o2: THREE.Object3D | null = m;
      while (o2 && !o2.name.startsWith('community:')) o2 = o2.parent;
      const key = o2 ? o2.name.slice('community:'.length) : 'other';
      parts[key] = { meshes: (parts[key]?.meshes ?? 0) + 1, triangles: (parts[key]?.triangles ?? 0) + Math.round(tri) };
      meshes++;
      triangles += tri;
    });
    const info: CommunityInfo = { meshes, triangles: Math.round(triangles), parts, ...ex.current };
    const w = window as unknown as { __communityInfo?: CommunityInfo; __communityRoot?: THREE.Object3D };
    w.__communityInfo = info;
    if (process.env.NODE_ENV !== 'production') w.__communityRoot = root.current; // dev: scene inspection from CDP
  });
  return null;
}

/* --------------------------------- main --------------------------------- */

export default function Community({ placement, geo, floorY, firstPerson, hideAbove = false, shadows, hAt, xf }: CommunityProps) {
  useEffect(readCommunityUrl, []);
  const { ground, labels, on } = useCommunity();
  const root = useRef<THREE.Group>(null!);
  const [planCells, setPlanCells] = useState(0);

  const wing = wings.find((w) => w.name === `Wing ${placement.wing}`);
  const outline = useMemo(() => wingOutlineSite(placement.wing), [placement.wing]);
  const floorsTypical = wing?.floorsTypical ?? 46;
  const floor = Math.max(1, Math.round((floorY - PODIUM_M) / FLOOR_TO_FLOOR_M) + 1);

  const own = useMemo(() => {
    if (!outline) return null;
    const t = buildOwnTower({ placement, geo, floor, floorY, floorsTypical, heightM: outline.heightM, outlineSite: outline.ring });
    return { lower: t.lower.geometry(), upper: t.upper.geometry(), clip: t.clip, neighbours: t.neighbours, mode: t.mode, coreM2: t.coreM2 };
  }, [placement, geo, floor, floorY, floorsTypical, outline]);
  useDisposeGeo(own?.lower);
  useDisposeGeo(own?.upper);

  const clipSite = useMemo<XZ[] | null>(() => (own ? own.clip.map(unitToSite(placement)) : null), [own, placement]);
  const massing = useMemo(() => buildSiteMassing({ ownWing: placement.wing, floorY, clip: clipSite, hAt }).geometry(), [placement.wing, floorY, clipSite, hAt]);
  useDisposeGeo(massing);

  if (!on) return null;
  const mass = getMassMaterial();
  const plan = ground === 'plan';
  return (
    <group ref={root} name="community">
      {own && (
        <>
          <mesh name="community:own-tower" geometry={own.lower} material={mass} castShadow={shadows} receiveShadow={shadows} />
          <mesh
            name="community:own-above"
            visible={!hideAbove}
            geometry={own.upper}
            material={firstPerson ? mass : getGhostMaterial()}
            castShadow={shadows && firstPerson}
            receiveShadow={shadows && firstPerson}
            renderOrder={firstPerson ? 0 : 3}
            raycast={() => null}
          />
        </>
      )}
      {/* site frame → unit frame */}
      <group rotation-y={xf.rotY}>
        <group position={xf.pos}>
          <mesh name="community:wings" geometry={massing} material={mass} castShadow={shadows} receiveShadow={shadows} raycast={() => null} />
          {plan && <PlanGroundMesh hAt={hAt} onCells={setPlanCells} />}
          {plan && <GroundFeatures hAt={hAt} />}
          {plan && labels && <Labels hAt={hAt} />}
          {/* trees + boulevard-median trees as illustrated on the plan (community/Trees.tsx, instanced; heights illustrative) */}
          {plan && (
            <group name="community:trees">
              <Trees hAtXZ={hAt} quality={shadows ? 'high' : 'vr'} includeMedianTrees castShadow={shadows} receiveShadow={shadows} />
            </group>
          )}
        </group>
      </group>
      <Stats
        root={root}
        extra={{ neighbours: own?.neighbours ?? 0, mode: own?.mode ?? 'none', coreM2: Math.round(own?.coreM2 ?? 0), planCells: plan ? planCells : 0 }}
      />
    </group>
  );
}
