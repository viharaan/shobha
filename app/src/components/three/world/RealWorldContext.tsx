/* eslint-disable react-hooks/set-state-in-effect, react-hooks/refs, react-hooks/immutability -- ported R3F code: refs and mutable scratch state driven from useFrame */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { UnitPlacement } from '@/data/sobha/traced/placement';
import { NightSky } from '@/components/three/SiteScene';
import { SITE_ORIGIN } from '@/data/sobha/siteFrame';
import { istDate, istDay, sunDirSite3D, sunPosition } from '@/lib/solar';
import {
  TriSoup,
  bearingDeg,
  buildWorldMeshes,
  loadRasterTexture,
  loadWorld,
  prism,
  rasterTileGeometry,
  rasterTilesAround,
  loadTerrain,
  unitToSite3D,
  type HeightFn,
  type RasterSource,
  type Terrain,
  type WorldFeatures,
  worldGroupTransform,
  type WorldMeshes,
  type XZ,
} from '@/lib/unit/worldTiles';
import { WALL_H, type UnitGeometry, type V2 } from '@/lib/unit/unitGeometry';
import Community from '@/lib/unit/community/Community';

/**
 * REAL-WORLD SURROUNDINGS around the traced 1:1 unit (desktop + WebXR VR).
 *
 * The UNIT stays at its local origin; everything here that lives in the site frame sits in a group
 * carrying the inverse placement transform (worldGroupTransform): the ground ends up `floorY`
 * below the unit's floor and the compass is the real one (yaw from the placement).
 *
 *  - OpenFreeMap z14 vector tiles (external): buildings extruded to render_height (OSM height /
 *    levels where tagged, else the OpenMapTiles default), water, green landcover, roads — one merged
 *    mesh per class. Or a raster ground (OSM map / EOX Sentinel-2 2016 / Esri imagery) + the buildings.
 *  - Terrain: AWS terrarium tiles (z13, ~3 km) re-based to y = 0 at the tower; ground meshes are draped
 *    on it, buildings / wings stand on the height at their centroid. Flat if it fails to load.
 *  - COMMUNITY (./community): the SOBHA OneWorld master plan inside the site boundary — all 14 wings
 *    from the traced master-plan roofs, the same-floor neighbour flats from their own placements + core,
 *    the registered master-plan raster as ground, stadium field / track, water, roads, plazas, One Club
 *    mass, perimeter wall, labels and trees. A gold highlight marks the unit from afar (tower view).
 *  - Sun: NOAA solar position for Bengaluru at the chosen IST date/time → sky dome + directional light
 *    + (desktop only) a 4096² shadow map ±120 m around the unit (towers + neighbours cast); a
 *    shadow-only slab stands in for the floor above.
 *
 * Flat ground layers don't write depth and draw in painter's order (renderOrder), so the ~kilometre
 * view distance with a 3 cm near plane can't z-fight between ground / water / roads / raster tiles.
 */

export type GroundMode = 'vector' | RasterSource;

export interface WorldStatus {
  state: 'loading' | 'ready' | 'error';
  message?: string;
  tiles?: number;
  failedTiles?: number;
  kb?: number;
  buildings?: number;
  triangles?: number;
  rasterTiles?: number;
  terrain?: { tiles: number; baseElev: number; range: [number, number] } | 'failed';
  /** Last rendered frame (renderer.info): draw calls / triangles, incl. the shadow pass. */
  frame?: { calls: number; triangles: number };
}

const RO_SKY = -10;
const RO_DISC = -9;
const RO_RASTER = -8; // + 0.1 per zoom level above 14
const RO_GREEN = -5;
const RO_WATER = -4;
const RO_ROADS = -3;

const flat = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, depthWrite: false, side: THREE.DoubleSide, ...extra });
const MATS = {
  disc: flat('#d8cfbd'),
  green: flat('#ffffff', { vertexColors: true }),
  water: flat('#7fa9c9'),
  roads: flat('#6d6f73'),
  buildings: new THREE.MeshLambertMaterial({ vertexColors: true }),
  // highlight draws through other towers (depthTest off) so the flat is always findable in the tower view
  highlight: new THREE.MeshBasicMaterial({ color: '#f0b429', transparent: true, opacity: 0.55, depthWrite: false, depthTest: false, fog: false }),
  highlightEdge: new THREE.LineBasicMaterial({ color: '#ffcc33', depthTest: false, fog: false }),
  shadowOnly: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
};

/* ------------------------------ helpers ------------------------------ */

function convexHull(pts: V2[]): V2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: V2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: V2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Outline of the unit incl. external walls (convex hull of room polygons + wall boxes), unit frame. */
export function unitOutline(geo: UnitGeometry): V2[] {
  const pts: V2[] = geo.floors.flatMap((f) => f.pts);
  for (const s of geo.solids) {
    if (s.kind !== 'wall' && s.kind !== 'parapet') continue;
    const d: V2 = [Math.cos(s.rotY), -Math.sin(s.rotY)];
    const n: V2 = [-d[1], d[0]];
    for (const a of [-0.5, 0.5]) for (const b of [-0.5, 0.5]) pts.push([s.cx + d[0] * s.len * a + n[0] * s.thick * b, s.cz + d[1] * s.len * a + n[1] * s.thick * b]);
  }
  return convexHull(pts);
}

/* ------------------------------ pieces ------------------------------- */

/** Gold box around the unit, shown only from afar (tower view) so you can find your flat. Unit frame. */
function UnitHighlight({ outline, center }: { outline: V2[]; center: V2 }) {
  const ref = useRef<THREE.Group>(null!);
  const { box, edges } = useMemo(() => {
    const t = new TriSoup();
    prism(t, { outer: outline, holes: [] }, 0, WALL_H, undefined, { bottom: true });
    const g = t.geometry();
    return { box: g, edges: new THREE.EdgesGeometry(g, 30) };
  }, [outline]);
  useEffect(
    () => () => {
      box.dispose();
      edges.dispose();
    },
    [box, edges]
  );
  useFrame(({ camera }) => {
    if (ref.current) ref.current.visible = Math.hypot(camera.position.x - center[0], camera.position.z - center[1], camera.position.y) > 40;
  });
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={box} material={MATS.highlight} renderOrder={4} raycast={() => null} />
      <lineSegments geometry={edges} material={MATS.highlightEdge} renderOrder={5} raycast={() => null} />
    </group>
  );
}

/**
 * Shadow-only slab over the unit (the floor above): never drawn (colorWrite off) but casts in the sun's
 * shadow map, so sunlight enters through the windows / balcony edge only — walk mode.
 */
function CeilingCaster({ outline }: { outline: V2[] }) {
  const g = useMemo(() => {
    const t = new TriSoup();
    prism(t, { outer: outline, holes: [] }, WALL_H + 0.02, WALL_H + 0.25, undefined, { bottom: true });
    return t.geometry();
  }, [outline]);
  useEffect(() => () => g.dispose(), [g]);
  return <mesh geometry={g} material={MATS.shadowOnly} castShadow raycast={() => null} />;
}

function VectorWorld({ meshes, ground }: { meshes: WorldMeshes; ground: GroundMode }) {
  return (
    <group>
      {ground === 'vector' && (
        <>
          <mesh geometry={meshes.green} material={MATS.green} renderOrder={RO_GREEN} />
          <mesh geometry={meshes.water} material={MATS.water} renderOrder={RO_WATER} />
          <mesh geometry={meshes.roads} material={MATS.roads} renderOrder={RO_ROADS} />
        </>
      )}
      <mesh geometry={meshes.buildings} material={MATS.buildings} castShadow />
    </group>
  );
}

/** Raster tiles (OSM / satellite) draped on the terrain (site frame), coarse → fine in painter's order. */
function RasterGround({ center, src, hAt, onCount }: { center: XZ; src: RasterSource; hAt?: HeightFn; onCount: (n: number) => void }) {
  const gl = useThree((s) => s.gl);
  const tiles = useMemo(() => rasterTilesAround(center, src), [center, src]);
  const [loaded, setLoaded] = useState<{ key: string; geo: THREE.BufferGeometry; mat: THREE.Material; z: number }[]>([]);

  useEffect(() => {
    let alive = true;
    const made: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    const aniso = gl.capabilities.getMaxAnisotropy();
    setLoaded([]);
    for (const t of tiles) {
      loadRasterTexture(t.url, aniso)
        .then((tex) => {
          if (!alive) return;
          const geo = rasterTileGeometry(t, hAt);
          const mat = new THREE.MeshLambertMaterial({ map: tex, depthWrite: false, side: THREE.DoubleSide });
          made.push({ geo, mat });
          setLoaded((cur) => [...cur, { key: `${t.z}/${t.x}/${t.y}`, geo, mat, z: t.z }]);
        })
        .catch(() => undefined); // missing tiles leave the beige disc showing
    }
    return () => {
      alive = false;
      for (const m of made) {
        m.geo.dispose();
        m.mat.dispose(); // textures stay cached for re-use
      }
    };
  }, [tiles, gl, hAt]);

  useEffect(() => onCount(loaded.length), [loaded.length, onCount]);

  return (
    <group>
      {loaded.map((t) => (
        <mesh key={t.key} geometry={t.geo} material={t.mat} renderOrder={RO_RASTER + (t.z - 12) * 0.1} />
      ))}
    </group>
  );
}

/** Big N / E / S / W letters on the horizon ring (unit frame) — the compass inside VR. */
function HorizonCompass({ placement, center }: { placement: UnitPlacement; center: V2 }) {
  const R = 70;
  return (
    <group>
      {(['N', 'E', 'S', 'W'] as const).map((l, i) => {
        const b = (i * Math.PI) / 2 + placement.yawRad; // R_y(−yaw)·(sin b, −cos b) = (sin(b+yaw), −cos(b+yaw))
        const dx = Math.sin(b);
        const dz = -Math.cos(b);
        return (
          <Text
            key={l}
            font="/fonts/NotoSans-Regular.ttf"
            fontSize={l === 'N' ? 7 : 5}
            color={l === 'N' ? '#c0392b' : '#0b1f3a'}
            outlineWidth={0.35}
            outlineColor="#ffffff"
            anchorX="center"
            anchorY="middle"
            position={[center[0] + dx * R, 6, center[1] + dz * R]}
            rotation-y={Math.atan2(-dx, -dz)}
            raycast={() => null}
          >
            {l}
          </Text>
        );
      })}
    </group>
  );
}

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FS = /* glsl */ `
uniform vec3 uSun; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float t = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, pow(t, 0.45));
  float s = max(dot(d, normalize(uSun)), 0.0);
  c += uGlow * (pow(s, 12.0) * 0.35 + pow(s, 900.0) * 3.0);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * Cheap gradient sky dome (one sphere, no scattering maths — Quest-friendly): zenith / horizon colours
 * and a sun glow driven by the real sun direction. Drawn first, without depth, under the painter-ordered ground.
 */
function SkyDome({ sunDir, day, center }: { sunDir: THREE.Vector3; day: number; center: V2 }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VS,
        fragmentShader: SKY_FS,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uSun: { value: new THREE.Vector3() },
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uGlow: { value: new THREE.Color() },
        },
      }),
    []
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    const k = Math.max(day, 0.08);
    const low = 1 - THREE.MathUtils.clamp(day * 1.6, 0, 1); // 1 near sunrise / sunset
    mat.uniforms.uSun.value.copy(sunDir);
    mat.uniforms.uZenith.value.set('#3f74b8').lerp(new THREE.Color('#0d1626'), 1 - k);
    mat.uniforms.uHorizon.value.set('#c6d0d9').lerp(new THREE.Color('#e8b48a'), low * 0.6).lerp(new THREE.Color('#2a3140'), 1 - Math.max(k, 0.15));
    mat.uniforms.uGlow.value.set('#fff1d6').lerp(new THREE.Color('#ff9a4d'), low);
  }, [mat, sunDir, day]);
  // the dome rides with the camera at 400 m, inside the home camera's 500 m far plane: a fixed 4.4 km dome was clipped
  // away from eye level (the walk and 360° views saw a black sky). It is drawn first without writing depth, so
  // everything else still draws over it; the shader only uses the view direction.
  const ref = useRef<THREE.Mesh>(null);
  const camPos = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m?.parent) return;
    camera.getWorldPosition(camPos);
    m.position.copy(m.parent.worldToLocal(camPos));
  });
  return (
    <mesh ref={ref} material={mat} position={[center[0], 0, center[1]]} renderOrder={RO_SKY} raycast={() => null} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  );
}

/** Reports the camera's compass heading (deg) whenever it changes by ≥ 2°. */
export function FacingProbe({ placement, onBearing }: { placement: UnitPlacement; onBearing: (deg: number) => void }) {
  const last = useRef(-999);
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    camera.getWorldDirection(dir);
    if (Math.hypot(dir.x, dir.z) < 1e-3) return; // looking straight down/up
    const b = bearingDeg(placement, dir.x, dir.z);
    const d = Math.abs(((b - last.current + 540) % 360) - 180);
    if (d >= 2) {
      last.current = b;
      onBearing(b);
    }
  });
  return null;
}

/** Publishes renderer.info (previous frame) every ~2 s — perf readout for the stats line / testing. */
function FrameStats({ onStatus }: { onStatus: React.MutableRefObject<(s: WorldStatus) => void> }) {
  const gl = useThree((s) => s.gl);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (t.current < 2) return;
    t.current = 0;
    const frame = { calls: gl.info.render.calls, triangles: gl.info.render.triangles };
    (window as unknown as { __unitFrameInfo?: typeof frame }).__unitFrameInfo = frame;
    onStatus.current({ state: 'ready', frame });
  });
  return null;
}

/* ------------------------------- main -------------------------------- */

export default function RealWorldContext({
  placement,
  floorY,
  date,
  hour,
  ground,
  geo,
  firstPerson,
  hideAbove = false,
  shadows,
  onStatus,
}: {
  placement: UnitPlacement;
  floorY: number;
  /** IST calendar day 'YYYY-MM-DD'. */
  date: string;
  /** IST wall-clock hours. */
  hour: number;
  ground: GroundMode;
  geo: UnitGeometry;
  /** walk / VR: horizon compass letters, opaque floors above, ceiling shadow caster */
  firstPerson: boolean;
  /** top view: do not draw the floors above the unit at all */
  hideAbove?: boolean;
  /** sun shadow map (desktop only — off in VR for frame rate) */
  shadows: boolean;
  onStatus: (s: WorldStatus) => void;
}) {
  const scene = useThree((s) => s.scene);
  const { cx, cz, span } = geo.bounds;
  // world centre = unit centre in site 3-D (rounded so tiny changes don't refetch)
  const center = useMemo<XZ>(() => {
    const [x, , z] = unitToSite3D(placement, 0, [cx, 0, cz]);
    return [Math.round(x), Math.round(z)];
  }, [placement, cx, cz]);
  const outline = useMemo(() => unitOutline(geo), [geo]);
  const xf = worldGroupTransform(placement, floorY);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  /* vector tiles */
  const [features, setFeatures] = useState<WorldFeatures | null>(null);
  const [rasterCount, setRasterCount] = useState(0);
  useEffect(() => {
    let alive = true;
    statusRef.current({ state: 'loading' });
    loadWorld(center)
      .then((w) => {
        if (!alive) return;
        setFeatures(w.features);
        statusRef.current({ state: 'ready', tiles: w.tiles, failedTiles: w.failed, kb: Math.round(w.bytes / 1024) });
      })
      .catch((e: unknown) => {
        if (alive) statusRef.current({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      alive = false;
      setFeatures(null);
    };
  }, [center]);

  /* terrain (optional: flat ground if it fails) */
  const [terrain, setTerrain] = useState<Terrain | null>(null);
  useEffect(() => {
    let alive = true;
    loadTerrain(center, center)
      .then((t) => {
        if (!alive) return;
        setTerrain(t);
        statusRef.current({ state: 'ready', terrain: { tiles: t.tiles, baseElev: t.baseElev, range: t.range } });
      })
      .catch(() => alive && statusRef.current({ state: 'ready', terrain: 'failed' }));
    return () => {
      alive = false;
    };
  }, [center]);
  const hAt = terrain?.hAt;

  const meshes = useMemo(() => (features ? buildWorldMeshes(features, hAt) : null), [features, hAt]);
  useEffect(() => {
    if (meshes) statusRef.current({ state: 'ready', buildings: meshes.stats.buildings, triangles: meshes.stats.triangles });
    return () => {
      if (meshes) for (const g of [meshes.buildings, meshes.water, meshes.green, meshes.roads]) g.dispose();
    };
  }, [meshes]);

  /* sun (IST date + hour) → unit frame */
  const sun = useMemo(() => {
    const pos = sunPosition(istDate(istDay(date), hour), SITE_ORIGIN.lat, SITE_ORIGIN.lng);
    const v = new THREE.Vector3(...sunDirSite3D(pos)).applyAxisAngle(new THREE.Vector3(0, 1, 0), -placement.yawRad);
    return { pos, v };
  }, [date, hour, placement.yawRad]);
  const day = THREE.MathUtils.clamp(Math.sin((sun.pos.altitudeDeg * Math.PI) / 180) * 2.5, 0, 1); // 0 night … 1 (alt ≥ ~24°)
  const up = sun.pos.altitudeDeg > -0.5;

  /* fog on the scene (a <fog attach> would attach to the parent group, not the scene) */
  useEffect(() => {
    const c = new THREE.Color('#c6d0d9').lerp(new THREE.Color('#2a3140'), 1 - Math.max(day, 0.15));
    scene.fog = new THREE.Fog(c, 450, 2600);
    return () => {
      scene.fog = null;
    };
  }, [scene, day]);

  const SUN_DIST = 400;
  const sunPos = useMemo(() => sun.v.clone().multiplyScalar(SUN_DIST).add(new THREE.Vector3(cx, 0, cz)), [sun, cx, cz]);
  const sunTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(cx, 0, cz);
    return o;
  }, [cx, cz]);
  // shadow frustum half-size: ±120 m around the unit, so the neighbouring flats and the nearby towers
  // shade the balcony / rooms (4096² → ~6 cm texels); desktop only
  const sh = Math.max(120, span * 0.8);
  const shFar = SUN_DIST * 2 + 100;
  // r3f sets shadow-camera-* but never re-projects the shadow camera (it stays at three's ±5 m default)
  const sunRef = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const cam = sunRef.current?.shadow.camera;
    if (!cam) return;
    cam.left = -sh;
    cam.right = sh;
    cam.top = sh;
    cam.bottom = -sh;
    cam.near = 1;
    cam.far = shFar;
    cam.updateProjectionMatrix();
  }, [sh, shFar, shadows]);

  return (
    <group>
      <SkyDome sunDir={sun.v} day={day} center={[cx, cz]} />
      {day < 0.35 && <group position={[cx, 0, cz]}><NightSky day={day} sunDir={[sun.v.x, sun.v.y, sun.v.z]} radius={4300} moonR={70} /></group>}
      <primitive object={sunTarget} />
      <directionalLight
        ref={sunRef}
        position={sunPos}
        target={sunTarget}
        intensity={up ? 0.25 + 1.6 * day : 0.15}
        color={day < 0.5 ? '#ffc58f' : '#fff6e8'}
        castShadow={shadows && up}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.06}
        shadow-camera-left={-sh}
        shadow-camera-right={sh}
        shadow-camera-top={sh}
        shadow-camera-bottom={-sh}
        shadow-camera-near={1}
        shadow-camera-far={shFar}
      />

      <Community placement={placement} geo={geo} floorY={floorY} firstPerson={firstPerson} hideAbove={hideAbove} shadows={shadows} hAt={hAt} xf={xf} />
      {firstPerson && shadows && <CeilingCaster outline={outline} />}
      {!firstPerson && <UnitHighlight outline={outline} center={[cx, cz]} />}
      {firstPerson && <HorizonCompass placement={placement} center={[cx, cz]} />}

      {/* site frame → unit frame */}
      <group rotation-y={xf.rotY}>
        <group position={xf.pos}>
          <mesh rotation-x={-Math.PI / 2} position={[center[0], 0, center[1]]} material={MATS.disc} renderOrder={RO_DISC}>
            <circleGeometry args={[4200, 48]} />
          </mesh>
          {ground !== 'vector' && <RasterGround center={center} src={ground} hAt={hAt} onCount={setRasterCount} />}
          {meshes && <VectorWorld meshes={meshes} ground={ground} />}
        </group>
      </group>
      {ground !== 'vector' && <RasterCount n={rasterCount} onStatus={statusRef} />}
      <FrameStats onStatus={statusRef} />
    </group>
  );
}

/** Pushes the raster tile count into the status line (kept out of the main status effect). */
function RasterCount({ n, onStatus }: { n: number; onStatus: React.MutableRefObject<(s: WorldStatus) => void> }) {
  useEffect(() => {
    if (n) onStatus.current({ state: 'ready', rasterTiles: n });
  }, [n, onStatus]);
  return null;
}
