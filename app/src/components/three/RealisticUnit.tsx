'use client';

/**
 * Realistic interior for a traced unit, mounted inside PlanScene's frame (origin = unit centre).
 *
 * Geometry: walls with door/window openings, sills, lintels and balcony parapets from the traced vector
 * plan (positions and thicknesses are source; heights are assumed, see unitGeometry.ts). Finishes and
 * furniture are ILLUSTRATIVE: themed floors, skirting, the vendor's drawn furniture rebuilt as PBR
 * pieces plus CC0 Poly Haven models where they fit, warm image-based lighting (three RoomEnvironment,
 * no network) and a few point lights at pendants / lamps. Nothing here is part of the sale.
 *
 * With a flat `placement` the unit is built as that flat (mirrored when the flat is the mirror image of
 * the printed plan) and the real surroundings are drawn around it at the chosen building floor:
 * the SOBHA community (all 14 wings, same-floor neighbours, registered master plan), OpenStreetMap
 * buildings / roads / water, optional satellite or map ground, terrain, and the sun for an IST date
 * and time. Everything in the site frame is ESTIMATED (key-plan fit, community-mapped outlines).
 */
import { Billboard, Text } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import RealWorldContext, { type GroundMode, type WorldStatus } from '@/components/three/world/RealWorldContext';
import { amenities, landmarks, realmColor } from '@/data/sobha/amenities';
import { worldGroupTransform } from '@/lib/unit/worldTiles';
import { tracedFor } from '@/data/sobha/traced';
import { furnitureFor } from '@/data/sobha/traced/furniture';
import { mirrorFurniture, mirrorTraced } from '@/data/sobha/traced/mirror';
import type { UnitPlacement } from '@/data/sobha/traced/placement';
import type { PlanRecord } from '@/data/types';
import { buildingFloorLevelM } from '@/lib/unit/buildingFloor';
import { buildFurniture, pickLights, type BuiltFurniture } from '@/lib/unit/furniture/assemble';
import type { Detail } from '@/lib/unit/furniture/geom';
import { WALL_PAINT, applyEnvironment, applyEnvironmentTo } from '@/lib/unit/furniture/materials';
import { loadModelsFor, type ModelAsset } from '@/lib/unit/furniture/models';
import { buildUnitGeometry, isWalkable, type GlassPane, type UnitGeometry, type WallBox } from '@/lib/unit/unitGeometry';

export type { GroundMode, WorldStatus };

export interface RealisticUnitProps {
  plan: PlanRecord;
  furnished: boolean;
  /** walk / VR: show the ceiling with downlights, opaque floors above */
  interior: boolean;
  /** 'vr' = fewer lights, no shadows, low-poly props */
  quality: 'high' | 'vr';
  /** Which flat this is (null = the printed plan in its own frame, no surroundings). */
  placement?: UnitPlacement | null;
  /** Building floor (2 … top), only with a placement. */
  floor?: number;
  ground?: GroundMode;
  /** IST calendar day 'YYYY-MM-DD' and wall-clock hour. */
  date?: string;
  hour?: number;
  /** top views: name every amenity, the club, the stadium and the retail block (site frame, needs a placement) */
  amenityLabels?: boolean;
  /** looking straight down: the floors above the unit are dropped (stacked ghost floors read as a white slab) */
  topView?: boolean;
  onWorldStatus?: (s: WorldStatus) => void;
}

const ENV_INTENSITY = 0.8;

const wallMat = new THREE.MeshStandardMaterial({ color: WALL_PAINT, roughness: 0.92 });
const parapetMat = new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.9 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: '#cfe3f0', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide });

/** Merge oriented boxes into one geometry (one draw call per material). */
function mergeBoxes(boxes: (WallBox | GlassPane)[]): THREE.BufferGeometry | null {
  const parts = boxes.filter((b) => b.y1 - b.y0 > 1e-4).map((b) => {
    const g = new THREE.BoxGeometry(b.len, b.y1 - b.y0, b.thick);
    g.rotateY(b.rotY);
    g.translate(b.cx, (b.y0 + b.y1) / 2, b.cz);
    return g;
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged;
}

const slabMat = new THREE.MeshStandardMaterial({ color: '#56534e', roughness: 1 });
const shaftMat = new THREE.MeshStandardMaterial({ color: '#3a3835', roughness: 1 });

/**
 * The front door: a double-leaf walnut door with raised panels, bronze frame and brass pulls, standing in
 * the entrance opening (illustrative — the plan draws only the opening). Local +X runs along the wall.
 */
function GrandDoor({ d, shadows }: { d: NonNullable<UnitGeometry['entryDoor']>; shadows: boolean }) {
  const H = 2.1; // door head, m (assumed, see unitGeometry)
  const w = Math.max(0.9, Math.min(d.width, 1.8));
  const leaf = w / 2 - 0.012;
  const panels = (x0: number) => [0.42, 1.25].map((y, i) => (
    <mesh key={i} position={[x0, y, 0.04]} castShadow={shadows}><boxGeometry args={[leaf - 0.16, i ? 0.95 : 0.55, 0.025]} /><meshStandardMaterial color="#3a2417" roughness={0.45} metalness={0.05} /></mesh>
  ));
  return (
    <group position={[d.cx, 0, d.cz]} rotation-y={d.rotY} name="grand-door">
      {/* frame: jambs + head */}
      {[-w / 2 - 0.035, w / 2 + 0.035].map((x) => <mesh key={x} position={[x, H / 2, 0]} castShadow={shadows}><boxGeometry args={[0.07, H, 0.14]} /><meshStandardMaterial color="#2b2520" roughness={0.6} metalness={0.3} /></mesh>)}
      <mesh position={[0, H + 0.035, 0]} castShadow={shadows}><boxGeometry args={[w + 0.14, 0.07, 0.14]} /><meshStandardMaterial color="#2b2520" roughness={0.6} metalness={0.3} /></mesh>
      {/* two leaves */}
      {[-leaf / 2 - 0.006, leaf / 2 + 0.006].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, H / 2 - 0.01, 0]} castShadow={shadows} receiveShadow={shadows}><boxGeometry args={[leaf, H - 0.02, 0.05]} /><meshStandardMaterial color="#4a2e1c" roughness={0.5} metalness={0.05} /></mesh>
          {panels(0)}
          {/* brass pull on the meeting stile, both faces */}
          {[0.06, -0.06].map((z) => <mesh key={z} position={[x < 0 ? leaf / 2 - 0.09 : -leaf / 2 + 0.09, 1.05, z]} castShadow={shadows}><cylinderGeometry args={[0.014, 0.014, 0.34, 10]} /><meshStandardMaterial color="#c9a96e" roughness={0.3} metalness={0.9} /></mesh>)}
        </group>
      ))}
      {/* threshold */}
      <mesh position={[0, 0.01, 0]} receiveShadow={shadows}><boxGeometry args={[w + 0.14, 0.02, 0.3]} /><meshStandardMaterial color="#8a8378" roughness={0.7} /></mesh>
    </group>
  );
}

function Solids({ geo, shadows }: { geo: UnitGeometry; shadows: boolean }) {
  const geos = useMemo(() => ({
    walls: mergeBoxes(geo.solids.filter((s) => s.kind !== 'parapet')),
    parapets: mergeBoxes(geo.solids.filter((s) => s.kind === 'parapet')),
    glass: mergeBoxes(geo.glass),
    // headset review: ducts / shafts and the strip outside the entrance door showed as holes — give them a floor
    shafts: (() => {
      const parts = geo.floors.filter((f) => !isWalkable(f.kind)).map((f) => {
        const shape = new THREE.Shape(f.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
        return new THREE.ShapeGeometry(shape);
      });
      return parts.length ? mergeGeometries(parts, false) : null;
    })(),
  }), [geo]);
  useEffect(() => () => { geos.walls?.dispose(); geos.parapets?.dispose(); geos.glass?.dispose(); geos.shafts?.dispose(); }, [geos]);
  const { minX, maxX, minZ, maxZ, cx, cz } = geo.bounds;
  const pad = 1.6; // slab reaches past the entrance door so the lobby side has ground too
  return (
    <group>
      {geos.walls && <mesh geometry={geos.walls} material={wallMat} castShadow={shadows} receiveShadow={shadows} />}
      {geos.parapets && <mesh geometry={geos.parapets} material={parapetMat} castShadow={shadows} receiveShadow={shadows} />}
      {geos.glass && <mesh geometry={geos.glass} material={glassMat} renderOrder={2} />}
      {geos.shafts && <mesh geometry={geos.shafts} material={shaftMat} rotation-x={-Math.PI / 2} position-y={0.003} />}
      <mesh position={[cx, -0.15, cz]} material={slabMat} receiveShadow={shadows}>
        <boxGeometry args={[maxX - minX + pad * 2, 0.3, maxZ - minZ + pad * 2]} />
      </mesh>
    </group>
  );
}

const FONT = '/fonts/NotoSans-Regular.ttf';

/** Amenity / landmark names at their master-plan positions, in the unit frame (site → unit via the inverse placement). */
function AmenityLabels({ placement, floorY }: { placement: UnitPlacement; floorY: number }) {
  const xf = worldGroupTransform(placement, floorY);
  const items = useMemo(() => [
    ...amenities.filter((a) => a.sitePos).map((a) => ({ id: a.id, text: a.name, x: a.sitePos!.x, z: -a.sitePos!.y, color: realmColor[a.realm], size: 4 })),
    { id: 'club', text: landmarks.oneClub.name.split(' (')[0], x: landmarks.oneClub.sitePos.x, z: -landmarks.oneClub.sitePos.y, color: '#ffffff', size: 7 },
    { id: 'emporium', text: 'One Emporium', x: landmarks.oneEmporium.sitePos.x, z: -landmarks.oneEmporium.sitePos.y, color: '#ffffff', size: 7 },
  ], []);
  // counter-rotate each label so it stays upright in the world; billboard faces the viewer
  return (
    <group rotation-y={xf.rotY}>
      <group position={xf.pos}>
        {items.map((l) => (
          <Billboard key={l.id} position={[l.x, 6, l.z]}>
            <Text font={FONT} fontSize={l.size} color={l.color} anchorX="center" anchorY="bottom" outlineWidth={0.12} outlineColor="#0b0d10" maxWidth={60} textAlign="center">
              {l.text}
            </Text>
          </Billboard>
        ))}
      </group>
    </group>
  );
}

/** Pure geometry for a plan's traced unit, or null when the type was not traced. */
export function unitGeometryFor(plan: PlanRecord): UnitGeometry | null {
  const t = tracedFor(plan.typeCode);
  return t ? buildUnitGeometry(t) : null;
}

function questLike() {
  return typeof navigator !== 'undefined' && /OculusBrowser|Quest|Pico/i.test(navigator.userAgent);
}

export function RealisticUnit({ plan, furnished, interior, quality, placement = null, floor = 24, ground = 'vector', date, hour, amenityLabels = false, topView = false, onWorldStatus }: RealisticUnitProps) {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const mirrored = !!placement?.mirrored;
  const traced = useMemo(() => {
    const t = tracedFor(plan.typeCode);
    return t && mirrored ? mirrorTraced(t) : t;
  }, [plan.typeCode, mirrored]);
  const geo = useMemo(() => (traced ? buildUnitGeometry(traced) : null), [traced]);
  const layout = useMemo(() => {
    const l = furnitureFor(plan.typeCode);
    return l && mirrored ? mirrorFurniture(l) : l;
  }, [plan.typeCode, mirrored]);
  const detail: Detail = useMemo(() => (questLike() ? 'vr' : 'high'), []);
  const vr = quality === 'vr';
  const shadows = !vr;

  // traced frame → PlanScene frame: the unit's own centre goes to the origin (also right for mirrored units)
  const offset: [number, number, number] = geo ? [-geo.bounds.cx, 0, -geo.bounds.cz] : [0, 0, 0];

  const [models, setModels] = useState<Map<string, ModelAsset> | null>(null);
  useEffect(() => {
    if (!layout) return;
    let alive = true;
    const timeout = new Promise<Map<string, ModelAsset>>((res) => setTimeout(() => res(new Map()), 12000));
    Promise.race([loadModelsFor(layout.items.map((i) => i.type), detail === 'vr'), timeout]).then((m) => { if (alive) setModels(m); });
    return () => { alive = false; };
  }, [layout, detail]);

  const built: BuiltFurniture | null = useMemo(() => {
    if (!layout || !traced || !geo || !models) return null;
    return buildFurniture({ layout, geo, traced, detail, models });
  }, [layout, traced, geo, detail, models]);
  useEffect(() => () => built?.dispose(), [built]);

  useEffect(() => {
    if (!built) return;
    for (const m of [...built.lower, ...built.upper, ...built.base, ...built.ceiling]) {
      m.castShadow = shadows && !!m.userData.cast;
      m.receiveShadow = shadows && !!m.userData.receive;
    }
  }, [built, shadows]);

  // image-based lighting: three's RoomEnvironment through PMREM (local, no CDN); also the scene environment
  const env = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const rt = pm.fromScene(room, 0.04);
    room.dispose();
    pm.dispose();
    return rt;
  }, [gl]);
  useEffect(() => () => { applyEnvironment(null, 0); env.dispose(); }, [env]);
  useEffect(() => {
    // scene-level environment so the walls and any plain materials share the same light; restored on unmount
    const scene = get().scene;
    const prev = scene.environment;
    scene.environment = env.texture;
    return () => { scene.environment = prev; };
  }, [env, get]);
  useEffect(() => {
    applyEnvironment(env.texture, ENV_INTENSITY);
    for (const m of [wallMat, parapetMat]) { m.envMap = env.texture; m.envMapIntensity = ENV_INTENSITY * (placement ? 0.75 : 0.5); m.needsUpdate = true; }
    if (built) for (const m of [...built.lower, ...built.upper]) if (m.name.startsWith('model:')) applyEnvironmentTo(m.material as THREE.Material, env.texture, ENV_INTENSITY);
  }, [env, built, placement]);

  const lights = useMemo(() => (built ? pickLights(built.lights, vr ? 1 : 3) : []), [built, vr]);
  const floorY = buildingFloorLevelM(floor);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  if (!geo) return null;
  return (
    <group position={offset} name="realistic-unit">
      <Solids geo={geo} shadows={shadows} />
      {geo.entryDoor && <GrandDoor d={geo.entryDoor} shadows={shadows} />}
      {built && (
        <>
          {built.base.map((m) => <primitive key={m.uuid} object={m} />)}
          <group visible={furnished}>
            {built.lower.map((m) => <primitive key={m.uuid} object={m} />)}
            {built.upper.map((m) => <primitive key={m.uuid} object={m} />)}
          </group>
          <group visible={interior}>
            {built.ceiling.map((m) => <primitive key={m.uuid} object={m} />)}
          </group>
          {furnished && lights.map((l, i) => (
            <pointLight key={i} position={l.pos} color="#ffd7a8" intensity={(l.kind === 'pendant' ? 2.2 : 1.4) * (placement ? 1.6 : 1)} distance={l.kind === 'pendant' ? 6 : 4} decay={2} />
          ))}
        </>
      )}
      {placement && (
        <RealWorldContext
          placement={placement}
          floorY={floorY}
          date={date ?? today}
          hour={hour ?? 10}
          ground={ground}
          geo={geo}
          firstPerson={interior}
          hideAbove={topView}
          shadows={shadows}
          onStatus={onWorldStatus ?? (() => {})}
        />
      )}
      {placement && amenityLabels && <AmenityLabels placement={placement} floorY={floorY} />}
    </group>
  );
}
