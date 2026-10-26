'use client';

import { OrbitControls, Sky, Stars, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Container } from '@react-three/uikit';
import { XR } from '@react-three/xr';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Color, ExtrudeGeometry, InstancedMesh, MOUSE, Object3D, Plane, PlaneGeometry, Shape, SRGBColorSpace, TOUCH, Vector3 } from 'three';

type ControlsLike = { target: Vector3; update: () => void } | null;
import { FLOOR_TO_FLOOR_M, HOTSPOTS, PODIUM_HEIGHT_M, TOWERS } from '@/data/project';
import { SITE_IMAGE } from '@/data/manifest';
import type { Tower } from '@/data/types';
import { imagePxToLocal, imageRingToLocal, localToImagePx, localToLonLat, localToWorld } from '@/lib/geo';
import { lngLatToSite } from '@/data/sobha/siteFrame';
import { loadTerrain, type HeightFn } from '@/lib/unit/worldTiles';
import { yawToward } from '@/lib/planNav';
import { xrStore } from '@/lib/xr';
import { LabelProjector, type LabelEntry } from './DomLabels';
import { FirstPersonRig } from './FirstPersonRig';
import { PosePublisher, TeleportFloor, XRPanelAnchor, XRRig, type NavSpot, type RigMode, type XRRigHandle } from './XRRig';
import { XRButton, XRMapHud, XRMiniMap, XRPanel, XRText, useInXR } from './XRUI';
import { SITE_ORIGIN } from '@/data/sobha/siteFrame';
import { GoogleTiles } from './GoogleTiles';
import { SiteCommunity } from './SiteCommunity';
import { getSignTexture, getTowerFacadeTexture } from './towerFacade';

/** WGS84 ellipsoid height of the ground at the cricket ground: 865 m ASL (Terrarium DEM, measured) − 87 m geoid undulation (EGM96, Bengaluru). Approximate; the explorer has an offset slider. */
export const SITE_ELLIPSOID_HEIGHT_M = 778;
import { istDate, istDay, sunDirSite3D, sunPosition } from '@/lib/solar';

export type ViewMode = 'exterior' | 'top' | 'firstPerson';

export interface TourGoal {
  pos: [number, number, number];
  target: [number, number, number];
  spot: NavSpot;
  seconds: number;
}

export interface SiteSceneProps {
  mode: ViewMode;
  /** guided tour: fly the orbit camera (or the VR rig) to this pose whenever it changes */
  tourGoal?: TourGoal | null;
  /** IST calendar day 'YYYY-MM-DD' and hour (0–24) that position the sun */
  date: string;
  hour: number;
  selectedWing: number | null;
  onSelectWing: (w: number | null) => void;
  selectedHotspot: string | null;
  onSelectHotspot: (id: string | null) => void;
  selectedFloor: number | null;
  isolateFloor: boolean;
  explode: number; // 0..1
  sectionHeight: number | null; // metres, null = off
  showLabels: boolean;
  groundOpacity: number;
  resetToken: number;
  /** bump to fly the orbit camera to a north-up view of the current target (compass click) */
  northToken?: number;
  /** Google Photorealistic 3D Tiles around the site (needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) */
  photoreal?: boolean;
  /** keep the tiles renderer mounted (paused) after it was switched on once, so a later toggle reuses its session */
  photorealMounted?: boolean;
  /** metres added to the tiles' ellipsoid height at the origin, to seat the real ground on y = 0 */
  photorealOffset?: number;
  /** master-plan landscape: club, wall, roads, track, field, water, trees, amenity props (default on) */
  community?: boolean;
  /** extra DOM-label anchors at ground level (e.g. a realm's places); lifted onto the terrain here */
  extraLabels?: readonly LabelEntry[] | null;
  /** wings to frame with the orbit camera whenever the set changes (the home configurator zooms to its matches) */
  frameWings?: readonly number[] | null;
  /** wings to ghost (the home finder lights only the towers with matching flats) */
  dimWings?: readonly number[] | null;
  /** slow idle orbit for the first impression (stops as soon as the visitor takes the camera) */
  autoRotate?: boolean;
  /** terrain load progress for the page's status panel */
  onTerrainStatus?: (s: SiteTerrainStatus) => void;
}

export interface SiteTerrainStatus {
  state: 'loading' | 'ready' | 'failed';
  baseElev?: number;
  range?: [number, number];
  tiles?: number;
  message?: string;
}

/**
 * Explorer world (x east, z = −north, origin at the cricket ground per SITE_IMAGE.anchorLonLat) → the
 * plans page's site 3-D frame (same axes, origin at siteFrame.SITE_ORIGIN) that loadTerrain samples in.
 */
export function explorerToSiteXZ(x: number, z: number): [number, number] {
  const [lng, lat] = localToLonLat({ east: x, north: -z });
  const sp = lngLatToSite(lng, lat);
  return [sp.x, -sp.y];
}

/** AWS Terrarium DEM around the site, re-based so the cricket ground (world origin) is y = 0. null until loaded or on failure (flat). */
function useSiteTerrain(onStatus?: (s: SiteTerrainStatus) => void): { hAt: HeightFn | null; done: boolean } {
  const [hAt, setHAt] = useState<HeightFn | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let alive = true;
    const origin = explorerToSiteXZ(0, 0);
    Promise.resolve().then(() => alive && onStatus?.({ state: 'loading' }));
    loadTerrain(origin, origin, 1800)
      .then((t) => {
        if (!alive) return;
        const fn: HeightFn = (x, z) => t.hAt(...explorerToSiteXZ(x, z));
        setHAt(() => fn);
        setDone(true);
        onStatus?.({ state: 'ready', baseElev: t.baseElev, range: t.range, tiles: t.tiles });
      })
      .catch((e: unknown) => { if (!alive) return; setDone(true); onStatus?.({ state: 'failed', message: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { hAt, done };
}

const THETA = (SITE_IMAGE.upBearingDeg * Math.PI) / 180;

export function towerWorld(t: Tower): [number, number, number] {
  return localToWorld(imagePxToLocal(t.imagePx[0], t.imagePx[1]));
}

/** The master-plan raster as the ground, draped on the terrain when it has loaded (≈10 m cells). */
function Ground({ opacity, hAt, visible = true }: { opacity: number; hAt: HeightFn | null; visible?: boolean }) {
  const tex = useTexture(SITE_IMAGE.url, (t) => { t.colorSpace = SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; });
  const s = SITE_IMAGE.pxPerMetre;
  const w = SITE_IMAGE.widthPx / s;
  const h = SITE_IMAGE.heightPx / s;
  const ex = (SITE_IMAGE.widthPx / 2 - SITE_IMAGE.anchorPx[0]) / s;
  const ny = -(SITE_IMAGE.heightPx / 2 - SITE_IMAGE.anchorPx[1]) / s;
  const geom = useMemo(() => {
    const g = new PlaneGeometry(w, h, Math.round(w / 10), Math.round(h / 10));
    if (hAt) {
      // plane local (vx, vy) → after rotation.x = −π/2 and the group's rotation.y = −θ: world x/z as below; local z becomes world y
      const pos = g.attributes.position;
      const c = Math.cos(THETA);
      const sn = Math.sin(THETA);
      for (let i = 0; i < pos.count; i++) {
        const X = pos.getX(i) + ex;
        const Z = -pos.getY(i) - ny;
        const wx = X * c - Z * sn;
        const wz = X * sn + Z * c;
        pos.setZ(i, hAt(wx, wz));
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    }
    return g;
  }, [w, h, ex, ny, hAt]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <group rotation-y={-THETA} visible={visible}>
      <mesh geometry={geom} position={[ex, 0, -ny]} rotation-x={-Math.PI / 2} receiveShadow>
        <meshStandardMaterial map={tex} transparent opacity={opacity} roughness={1} />
      </mesh>
    </group>
  );
}

const tmp = new Object3D();
const tmpColor = new Color();

/** Footprint traced from the raster, extruded `height` m upwards from y = 0 (world x = east, z = -north). */
function footprintGeometry(t: Tower, height: number): ExtrudeGeometry {
  const ring = imageRingToLocal(t.footprintPx);
  const shape = new Shape();
  ring.forEach((p, i) => (i === 0 ? shape.moveTo(p.east, p.north) : shape.lineTo(p.east, p.north)));
  shape.closePath();
  const g = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // shape (east, north) + extrusion z → world (east, up, -north)
  g.computeVertexNormals();
  return g;
}

function useFootprintGeometry(t: Tower, height: number) {
  const geom = useMemo(() => footprintGeometry(t, height), [t, height]);
  useEffect(() => () => geom.dispose(), [geom]);
  return geom;
}

/** One instanced mesh per tower: the floor slab is the tower's own footprint, one instance per floor. */
function TowerStack({ tower, selectedWing, selectedFloor, isolateFloor, explode, section, dim, onSelectWing }: {
  tower: Tower; selectedWing: number | null; selectedFloor: number | null; isolateFloor: boolean; explode: number; section: Plane[] | null; dim: boolean; onSelectWing: (w: number) => void;
}) {
  const ref = useRef<InstancedMesh>(null);
  const geom = useFootprintGeometry(tower, FLOOR_TO_FLOOR_M * 0.9);
  const n = tower.typicalFloors;

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const gap = FLOOR_TO_FLOOR_M * (1 + explode * 1.2);
    const sel = tower.wing === selectedWing;
    for (let i = 0; i < n; i++) {
      const floor = i + 1;
      const hidden = isolateFloor && selectedFloor !== null && sel && floor !== selectedFloor;
      // geometry is already in world xz (ring is absolute): only lift it per floor
      tmp.position.set(0, PODIUM_HEIGHT_M + (floor - 1) * gap + FLOOR_TO_FLOOR_M * 0.05, 0);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(hidden ? 0 : 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      const selFloor = sel && floor === selectedFloor;
      const refuge = floor === 19 || floor === 29 || floor === 39;
      tmpColor.set(selFloor ? '#c9a96e' : sel ? '#fff8ea' : refuge ? '#c9d3dd' : '#f3efe6'); // near-white: the facade texture carries the colour
      m.setColorAt(i, tmpColor);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [tower, n, selectedWing, selectedFloor, isolateFloor, explode]);

  return (
    <instancedMesh
      ref={ref}
      args={[geom, undefined, n]}
      frustumCulled={false}
      castShadow={!dim}
      receiveShadow
      onClick={(e) => { e.stopPropagation(); onSelectWing(tower.wing); }}
    >
      {/* ExtrudeGeometry groups: 0 = slab top / bottom, 1 = facade walls (bronze fins, cream bands, dark glass from the elevation render) */}
      {/* keyed on dim: three only picks up a change of `transparent` on a fresh material */}
      <meshStandardMaterial key={`s${+dim}`} attach="material-0" color="#d6cfc1" roughness={0.9} clippingPlanes={section ?? []} transparent={dim} opacity={dim ? 0.18 : 1} />
      <meshStandardMaterial key={`f${+dim}`} attach="material-1" map={getTowerFacadeTexture()} roughness={0.55} metalness={0.08} clippingPlanes={section ?? []} transparent={dim} opacity={dim ? 0.18 : 1} />
    </instancedMesh>
  );
}

/** Dark bronze crown band over the top floor with the SOBHA plate facing south, as on the elevation render (illustrative). */
function Crown({ tower, explode, section }: { tower: Tower; explode: number; section: Plane[] | null }) {
  const geom = useFootprintGeometry(tower, 2.4);
  const top = PODIUM_HEIGHT_M + tower.typicalFloors * FLOOR_TO_FLOOR_M * (1 + explode * 1.2);
  const [cx, , cz] = towerWorld(tower);
  return (
    <group position-y={top}>
      <mesh geometry={geom} castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial color="#3b2a1f" roughness={0.5} metalness={0.3} clippingPlanes={section ?? []} />
      </mesh>
      <mesh position={[cx, 3.8, cz]} raycast={() => null}>
        <planeGeometry args={[10, 2.5]} />
        <meshStandardMaterial map={getSignTexture()} side={2} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Podium({ tower, section }: { tower: Tower; section: Plane[] | null }) {
  const geom = useFootprintGeometry(tower, PODIUM_HEIGHT_M);
  return (
    <mesh geometry={geom} castShadow receiveShadow>
      <meshStandardMaterial color="#8d8f93" roughness={0.9} clippingPlanes={section ?? []} />
    </mesh>
  );
}

function CameraRig({ mode, selectedWing, resetToken, northToken = 0, tourGoal, frameWings = null }: { mode: ViewMode; selectedWing: number | null; resetToken: number; northToken?: number; tourGoal?: TourGoal | null; frameWings?: readonly number[] | null }) {
  const controls = useThree((s) => s.controls) as unknown as ControlsLike;
  const camera = useThree((s) => s.camera);
  const goal = useRef<{ pos: Vector3; target: Vector3; t: number; rate: number } | null>(null);
  useEffect(() => {
    if (!tourGoal) return;
    goal.current = { pos: new Vector3(...tourGoal.pos), target: new Vector3(...tourGoal.target), t: 0, rate: 1 / Math.max(0.01, tourGoal.seconds) };
  }, [tourGoal]);
  useEffect(() => {
    if (mode === 'firstPerson' || tourGoal) return;
    const t = selectedWing ? TOWERS.find((x) => x.wing === selectedWing) : null;
    const target = t ? new Vector3(...towerWorld(t)).setY(PODIUM_HEIGHT_M + 40) : new Vector3(0, 20, 0);
    // top-down: nudge the camera a hair south of the target so that screen-up is north (camera.up stays +Y)
    const pos = mode === 'top' ? target.clone().add(new Vector3(0, t ? 700 : 1000, 0.5)) : target.clone().add(t ? new Vector3(140, 110, 170) : new Vector3(380, 300, 520));
    goal.current = { pos, target, t: 0, rate: 1.6 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedWing, resetToken]);
  // a set of wings to frame (configurator): glide to fit them all, from the default south-east three-quarter view
  const frameKey = frameWings ? frameWings.join(',') : '';
  useEffect(() => {
    if (!frameKey || mode === 'firstPerson' || tourGoal || selectedWing) return;
    const pts = TOWERS.filter((t) => frameWings!.includes(t.wing)).map((t) => new Vector3(...towerWorld(t)));
    if (!pts.length) return;
    const c = pts.reduce((a, b) => a.add(b), new Vector3()).multiplyScalar(1 / pts.length);
    const r = Math.max(...pts.map((q) => Math.hypot(q.x - c.x, q.z - c.z))) + 45;
    const target = c.clone().setY(PODIUM_HEIGHT_M + 55);
    const d = Math.max(240, r * 2.9);
    const pos = mode === 'top' ? target.clone().add(new Vector3(0, d * 1.4, 0.5)) : target.clone().add(new Vector3(0.535, 0.48, 0.732).normalize().multiplyScalar(d));
    goal.current = { pos, target, t: 0, rate: 1.1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, selectedWing]); // declared after the wing flight, so leaving a tower returns to the matches, not the overview
  // compass click: keep the target and distance, swing the camera due south of it so screen-up is north
  useEffect(() => {
    if (!northToken || mode === 'firstPerson' || !controls) return;
    const target = controls.target.clone();
    const d = Math.max(60, camera.position.distanceTo(target));
    const pos = mode === 'top' ? target.clone().add(new Vector3(0, d, 0.5)) : target.clone().add(new Vector3(0, d * 0.55, d * 0.83));
    goal.current = { pos, target, t: 0, rate: 1.6 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [northToken]);
  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls) return;
    g.t = Math.min(1, g.t + dt * g.rate);
    const k = 1 - Math.pow(1 - g.t, 3);
    camera.position.lerp(g.pos, k);
    controls.target.lerp(g.target, k);
    controls.update();
    if (g.t >= 1) goal.current = null;
  });
  return null;
}

/** Label anchor ids used by the page's <DomLabel>s: `wing-N` above each tower, `hs-<id>` at each hotspot. */
export function siteLabelEntries(explode: number, hAt: HeightFn | null = null): LabelEntry[] {
  const g = (x: number, z: number) => (hAt ? hAt(x, z) : 0);
  const towers = TOWERS.map((t): LabelEntry => {
    const [x, , z] = towerWorld(t);
    return { id: `wing-${t.wing}`, position: [x, g(x, z) + PODIUM_HEIGHT_M + t.typicalFloors * FLOOR_TO_FLOOR_M * (1 + explode * 1.2) + 10, z] };
  });
  const hotspots = HOTSPOTS.map((h): LabelEntry => {
    const [x, , z] = localToWorld(imagePxToLocal(h.imagePx[0], h.imagePx[1]));
    return { id: `hs-${h.id}`, position: [x, g(x, z) + 6, z] };
  });
  return [...towers, ...hotspots];
}

// Tower footprints in world xz, for walking around (not through) the towers at ground level.
const TOWER_RINGS: [number, number][][] = TOWERS.map((t) => imageRingToLocal(t.footprintPx).map((p) => [p.east, -p.north] as [number, number]));
function insidePoly(x: number, z: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const blockedAt = (x: number, z: number) => TOWER_RINGS.some((r) => insidePoly(x, z, r));
function siteSlide(fx: number, fz: number, tx: number, tz: number): [number, number] {
  if (blockedAt(fx, fz)) return [tx, tz]; // already inside (e.g. spawned there): let them walk out
  if (!blockedAt(tx, tz)) return [tx, tz];
  if (!blockedAt(tx, fz)) return [tx, fz];
  if (!blockedAt(fx, tz)) return [fx, tz];
  return [fx, fz];
}

/** Ground-level spot in front (south) of a wing, facing it, nudged out of any tower footprint. */
function wingSpot(t: Tower): NavSpot {
  const [x, , z] = towerWorld(t);
  let sz = z + 40;
  while (blockedAt(x, sz) && sz < z + 200) sz += 5;
  return { x, z: sz, yaw: yawToward(x, sz, x, z) };
}

/** After dusk: a star field and a moon opposite the sun with a faint blue fill, so night views are not black. */
export function NightSky({ day, sunDir, radius, moonR }: { day: number; sunDir: [number, number, number]; radius: number; moonR: number }) {
  const k = 1 - Math.min(1, day / 0.35);
  const m = new Vector3(-sunDir[0], Math.max(0.28, -sunDir[1] * 0.6 + 0.3), -sunDir[2]).normalize().multiplyScalar(radius * 0.92);
  return (
    <group>
      <Stars radius={radius} depth={radius * 0.1} count={2600} factor={radius / 320} saturation={0} fade speed={0.4} />
      <mesh position={m} raycast={() => null}><sphereGeometry args={[moonR, 24, 16]} /><meshBasicMaterial color="#f3eee2" fog={false} /></mesh>
      <directionalLight position={m} intensity={0.3 * k} color="#8fa6cc" />
    </group>
  );
}

/** The wrist panel is hidden for now (client request): sticks, teleport and the map HUD cover navigation. */
const XR_PANEL = false;

export function SiteScene(p: SiteSceneProps) {
  const section = useMemo(() => (p.sectionHeight === null ? null : [new Plane(new Vector3(0, -1, 0), p.sectionHeight)]), [p.sectionHeight]);
  const groundCentre = localToWorld(imagePxToLocal(1635, 1040));
  const start = useMemo<NavSpot>(() => {
    const e = HOTSPOTS.find((h) => h.id === 'entrance');
    const [x, , z] = e ? localToWorld(imagePxToLocal(e.imagePx[0], e.imagePx[1])) : [0, 0, 0];
    return { x, z, yaw: yawToward(x, z, groundCentre[0], groundCentre[2]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rig = useRef<XRRigHandle>(null);
  const [rigMode, setRigMode] = useState<RigMode>('walk');
  const inXR = useInXR();
  const { hAt, done: terrainDone } = useSiteTerrain(p.onTerrainStatus);
  const groundY = useCallback((x: number, z: number) => (hAt ? hAt(x, z) : 0), [hAt]);
  const labelEntries = useMemo(() => {
    const base = siteLabelEntries(p.explode, hAt);
    const extra = (p.extraLabels ?? []).map((e): LabelEntry => ({ id: e.id, position: [e.position[0], (hAt ? hAt(e.position[0], e.position[2]) : 0) + 5, e.position[2]] }));
    return [...base, ...extra];
  }, [p.explode, hAt, p.extraLabels]);
  // Sun for the chosen IST date/time at the site (NOAA algorithm). `day` ramps light through civil twilight.
  const sun = useMemo(() => {
    const sp = sunPosition(istDate(istDay(p.date), p.hour), SITE_ORIGIN.lat, SITE_ORIGIN.lng);
    const dir = sunDirSite3D(sp);
    const day = Math.max(0, Math.min(1, (sp.altitudeDeg + 6) / 12));
    return { dir, day, altitude: sp.altitudeDeg };
  }, [p.date, p.hour]);
  const goWing = (t: Tower) => { p.onSelectWing(t.wing); setRigMode('walk'); rig.current?.flyTo(wingSpot(t), 0.6); };
  const goTop = () => { setRigMode('top'); rig.current?.flyTo({ x: groundCentre[0], z: groundCentre[2], y: 320, yaw: 0 }, 0.6); };
  const goStart = () => { setRigMode('walk'); rig.current?.flyTo(start, 0.6); };
  // tour poses are authored at ground = 0; lift them by the terrain under the target
  const tourGoal = useMemo<TourGoal | null>(() => {
    const t = p.tourGoal;
    if (!t) return null;
    const dy = groundY(t.target[0], t.target[2]);
    return { ...t, pos: [t.pos[0], t.pos[1] + dy, t.pos[2]], target: [t.target[0], t.target[1] + dy, t.target[2]] };
  }, [p.tourGoal, groundY]);
  // in a headset the tour moves the rig instead of the orbit camera
  useEffect(() => { if (tourGoal && xrStore.getState().session) { Promise.resolve().then(() => setRigMode('walk')); rig.current?.flyTo(tourGoal.spot, Math.min(1.5, tourGoal.seconds)); } }, [tourGoal]);
  const toUV = useCallback((x: number, z: number): [number, number] => { const [u, v] = localToImagePx({ east: x, north: -z }); return [u / SITE_IMAGE.widthPx, v / SITE_IMAGE.heightPx]; }, []);

  return (
    <XR store={xrStore}>
      <color attach="background" args={[sun.altitude > -8 ? '#0d1117' : '#05070d']} />
      <fog attach="fog" args={[sun.altitude > -8 ? '#0d1117' : '#05070d', 900, 2200]} />
      {/* the sky dome never darkens past twilight: below −8° it goes, leaving the night background, stars and moon */}
      {sun.altitude > -8 && <Sky sunPosition={[sun.dir[0] * 1000, Math.max(sun.dir[1], -0.04) * 1000, sun.dir[2] * 1000]} turbidity={sun.day > 0.5 ? 6 : 10} rayleigh={sun.day > 0.5 ? 1.5 : 3} mieCoefficient={0.005} mieDirectionalG={0.8} />}
      {sun.day < 0.35 && <NightSky day={sun.day} sunDir={sun.dir} radius={1700} moonR={28} />}
      <hemisphereLight intensity={0.15 + 0.4 * sun.day} color="#dde7ff" groundColor="#3a3a33" />
      {/* the sun: shadow-casting light placed along the computed direction; off below the horizon */}
      <directionalLight position={[sun.dir[0] * 600, Math.max(sun.dir[1], 0.02) * 600, sun.dir[2] * 600]} intensity={2.1 * sun.day} color={sun.altitude < 10 ? '#ffd2a8' : '#fff6e8'} castShadow={sun.day > 0.05} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005} shadow-camera-left={-500} shadow-camera-right={500} shadow-camera-top={500} shadow-camera-bottom={-500} shadow-camera-near={10} shadow-camera-far={1500} />
      <ambientLight intensity={0.08 + 0.15 * sun.day} />

      {/* draped site plan; hidden under Google's photoreal mesh so the two grounds never overlap */}
      <Ground opacity={p.groundOpacity} hAt={hAt} visible={!p.photoreal} />
      {(p.photoreal || p.photorealMounted) && <GoogleTiles enabled={!!p.photoreal} lat={SITE_ORIGIN.lat} lng={SITE_ORIGIN.lng} ellipsoidHeight={SITE_ELLIPSOID_HEIGHT_M + (p.photorealOffset ?? 0)} />}
      <TeleportFloor size={[900, 720]} position={[0, 0.05, 0]} onTeleport={([x, , z]) => { if (blockedAt(x, z)) return; setRigMode('walk'); rig.current?.flyTo({ x, z }, 0); }} />

      {/* 90 m ground: the scale reference used to georeference the raster */}
      <mesh position={[groundCentre[0], groundY(groundCentre[0], groundCentre[2]) + 0.1, groundCentre[2]]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[44, 45.5, 64]} />
        <meshBasicMaterial color="#c9a96e" transparent opacity={0.8} />
      </mesh>

      {/* each tower stands on the terrain height at its footprint centroid */}
      {TOWERS.map((t) => {
        const [cx, , cz] = towerWorld(t);
        const dim = (p.selectedWing !== null && p.isolateFloor && t.wing !== p.selectedWing) || !!p.dimWings?.includes(t.wing);
        return (
          <group key={t.wing} position-y={groundY(cx, cz)}>
            <Podium tower={t} section={section} />
            <TowerStack tower={t} selectedWing={p.selectedWing} selectedFloor={p.selectedFloor} isolateFloor={p.isolateFloor} explode={p.explode} section={section} dim={dim} onSelectWing={p.onSelectWing} />
            {!(p.isolateFloor && p.selectedWing !== null) && !dim && <Crown tower={t} explode={p.explode} section={section} />}
          </group>
        );
      })}

      {/* built once, after the terrain has loaded or failed (it would otherwise be built flat and again draped) */}
      {p.community !== false && !p.photoreal && terrainDone && <SiteCommunity hAt={hAt} shadows={!inXR} quality={inXR ? 'vr' : 'high'} />}

      {p.showLabels && <LabelProjector entries={labelEntries} />}

      {p.mode === 'firstPerson' ? (
        <FirstPersonRig spot={start} eyeHeight={1.6} floorY={groundY(start.x, start.z)} speed={4} collide={siteSlide} />
      ) : (
        <>
          <OrbitControls
            makeDefault
            zoomToCursor
            zoomSpeed={1.6}
            screenSpacePanning
            enableRotate={p.mode !== 'top'}
            mouseButtons={p.mode === 'top' ? { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN } : { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
            touches={p.mode === 'top' ? { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN } : { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
            maxPolarAngle={Math.PI / 2 - 0.03}
            minDistance={30}
            maxDistance={1800}
            autoRotate={!!p.autoRotate}
            autoRotateSpeed={0.35}
          />
          <CameraRig mode={p.mode} selectedWing={p.selectedWing} resetToken={p.resetToken} northToken={p.northToken} tourGoal={tourGoal} frameWings={p.frameWings} />
        </>
      )}
      <PosePublisher />
      <XRRig ref={rig} start={start} mode={rigMode} walkSpeed={4} topRange={[40, 600]} collide={siteSlide}>
        {inXR && XR_PANEL && (
          <XRPanelAnchor>
            <XRPanel title="Wings - tap a number to go there" width={330} overlay collapsible>
              {/* same layout as the on-screen pad: rotate pair · view toggle · zoom */}
              <Container flexDirection="row" gap={4}>
                <XRButton grow label="< Rotate" onClick={() => rig.current?.turn(Math.PI / 6)} />
                <XRButton grow label="Rotate >" onClick={() => rig.current?.turn(-Math.PI / 6)} />
              </Container>
              <Container flexDirection="row" gap={4}>
                <XRButton grow label={rigMode === 'top' ? 'Walk' : 'Top view'} active={rigMode === 'top'} onClick={() => (rigMode === 'top' ? goStart() : goTop())} />
                <XRButton grow label="Entrance" onClick={goStart} />
              </Container>
              <Container flexDirection="row" gap={4}>
                <XRButton grow label={rigMode === 'top' ? 'Zoom +' : 'Forward'} onClick={() => (rigMode === 'top' ? rig.current?.zoom(0.75) : rig.current?.nudge(0, 3))} />
                <XRButton grow label={rigMode === 'top' ? 'Zoom -' : 'Back'} onClick={() => (rigMode === 'top' ? rig.current?.zoom(1.33) : rig.current?.nudge(0, -3))} />
              </Container>
              <XRText muted>{rigMode === 'top' ? 'Left stick pan - right stick up/down zoom' : 'Left stick walk - right stick turn - trigger on ground: jump'}</XRText>
              <XRText muted>Grip on this panel: move it</XRText>
            </XRPanel>
          </XRPanelAnchor>
        )}
      </XRRig>
      {inXR && (
        <XRMapHud>
          <XRMiniMap
            src={SITE_IMAGE.url}
            aspect={SITE_IMAGE.widthPx / SITE_IMAGE.heightPx}
            width={300}
            toUV={toUV}
            markers={TOWERS.map((t) => ({ u: t.imagePx[0] / SITE_IMAGE.widthPx, v: t.imagePx[1] / SITE_IMAGE.heightPx, active: t.wing === p.selectedWing, onClick: () => goWing(t) }))}
            onPick={(u, v) => {
              // inverse of toUV: map → site plan pixels → local metres (x east, z south); not into a tower
              const l = imagePxToLocal(u * SITE_IMAGE.widthPx, v * SITE_IMAGE.heightPx);
              if (blockedAt(l.east, -l.north)) return;
              setRigMode('walk');
              rig.current?.flyTo({ x: l.east, z: -l.north }, 0.6);
            }}
          />
        </XRMapHud>
      )}
    </XR>
  );
}

