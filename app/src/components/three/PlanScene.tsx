'use client';

import { Line, OrbitControls, Sky } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Container } from '@react-three/uikit';
import { XR } from '@react-three/xr';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasTexture, DoubleSide, ExtrudeGeometry, MOUSE, SRGBColorSpace, TOUCH, Texture, Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { PlanRecord, PlanRoom } from '@/data/types';
import { buildNavGrid, entrySpot, nearestFree, roomAtPoint, roomRects, roomSpot, slide, type NavGrid, type NavSpot, type RoomRect } from '@/lib/planNav';
import { FURNITURE_COLOR, loadFurniture, type FurnitureItem } from '@/lib/svgFurniture';
import { loadWalls, type WallData } from '@/lib/svgWalls';
import { xrStore } from '@/lib/xr';
import { ptToPlanMetres } from '@/lib/scale';
import { LabelProjector, type LabelEntry } from './DomLabels';
import { FirstPersonRig } from './FirstPersonRig';
import type { UnitPlacement } from '@/data/sobha/traced/placement';
import { RealisticUnit, type GroundMode, type WorldStatus } from './RealisticUnit';
import { PosePublisher, TeleportFloor, XRPanelAnchor, XRRig, type RigMode, type XRRigHandle } from './XRRig';
import { XRButton, XRLabel, XRMapHud, XRMiniMap, XRPanel, XRText, useInXR } from './XRUI';

export interface PlanSceneProps {
  plan: PlanRecord;
  mPerUnit: number;
  wallHeight: number;
  showLabels: boolean;
  showFloorImage: boolean;
  showFurniture: boolean;
  focusRoom: PlanRoom | null;
  onFocusRoom?: (r: PlanRoom | null) => void;
  firstPerson: boolean;
  /** desktop orbit camera: straight-down plan view (drag pans, wheel / pinch zooms toward the cursor) */
  topView?: boolean;
  /** bump to fly the desktop camera back to the whole-unit overview */
  overviewToken?: number;
  /** bump with a focus change to frame that room from straight above once, leaving orbit rotation on */
  lookDownToken?: number;
  /** eye-level 360°: stand in the focused room at 1.6 m and drag to look around (ceiling and floors above shown) */
  eyeLevel?: boolean;
  /** guided tour: pulse a red beacon over the focused room (the room being explained) */
  beacon?: boolean;
  /** guided site tour: fly the orbit camera to this unit-frame pose whenever it changes */
  tourGoal?: { pos: [number, number, number]; target: [number, number, number]; seconds: number } | null;
  /** traced walls with openings, themed floors, PBR furniture and image-based light (default); false = plan-extruded walls and boxes */
  realistic?: boolean;
  /** realistic: which flat this is; adds the real surroundings at `floor` (building floor) */
  placement?: UnitPlacement | null;
  floor?: number;
  ground?: GroundMode;
  date?: string;
  hour?: number;
  onWorldStatus?: (s: WorldStatus) => void;
  onStatus?: (s: { state: 'loading' | 'ready' | 'error'; message?: string; walls?: WallData }) => void;
}

function useWalls(url: string, onStatus?: PlanSceneProps['onStatus']) {
  const [walls, setWalls] = useState<WallData | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => { if (alive) { setWalls(null); onStatus?.({ state: 'loading' }); } });
    loadWalls(url)
      .then((w) => { if (alive) { setWalls(w); onStatus?.({ state: 'ready', walls: w }); } })
      .catch((e: unknown) => alive && onStatus?.({ state: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return walls;
}

function useFurniture(plan: PlanRecord, mPerUnit: number) {
  const [items, setItems] = useState<{ key: string; items: FurnitureItem[] } | null>(null);
  const key = `${plan.id}@${mPerUnit}`;
  useEffect(() => {
    let alive = true;
    loadFurniture(plan, mPerUnit).then((f) => alive && setItems({ key, items: f })).catch(() => alive && setItems({ key, items: [] }));
    return () => { alive = false; };
  }, [plan, mPerUnit, key]);
  return items?.key === key ? items.items : null;
}

/** Rasterise the vector plan (cropped to the wall bbox) into a floor texture. */
function useFloorTexture(plan: PlanRecord, enabled: boolean, mirrored = false) {
  const [tex, setTex] = useState<Texture | null>(null);
  useEffect(() => {
    let alive = true;
    if (!enabled) { Promise.resolve().then(() => alive && setTex(null)); return () => { alive = false; }; }
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const [x0, y0, x1, y1] = plan.wallBboxPt;
      const k = img.naturalWidth / plan.viewBox[2]; // intrinsic px per SVG unit (pt → CSS px = 1.333)
      const scale = 4;
      const c = document.createElement('canvas');
      c.width = Math.round((x1 - x0) * k * scale);
      c.height = Math.round((y1 - y0) * k * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#0b0d10';
      ctx.fillRect(0, 0, c.width, c.height);
      if (mirrored) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, c.width, c.height);
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
      setTex(t);
    };
    img.src = plan.svg;
    return () => { alive = false; };
  }, [plan, enabled, mirrored]);
  return tex;
}

/** Boxes at the furniture footprints the plan draws; heights are typical values (see svgFurniture.ts). */
function Furniture({ items }: { items: FurnitureItem[] }) {
  return (
    <>
      {items.map((f, i) => (
        <mesh key={i} position={[f.x, f.h / 2, f.z]} castShadow receiveShadow>
          <boxGeometry args={[f.w, f.h, f.d]} />
          <meshStandardMaterial color={FURNITURE_COLOR[f.kind]} roughness={0.85} />
        </mesh>
      ))}
    </>
  );
}

function Walls({ walls, plan, mPerUnit, wallHeight }: { walls: WallData; plan: PlanRecord; mPerUnit: number; wallHeight: number }) {
  const geom = useMemo(() => {
    const g = new ExtrudeGeometry(walls.shapes, { depth: wallHeight / mPerUnit, bevelEnabled: false, curveSegments: 4 });
    const [x0, y0, x1, y1] = plan.wallBboxPt;
    g.translate(-(x0 + x1) / 2, -(y0 + y1) / 2, 0);
    g.computeVertexNormals();
    return g;
  }, [walls, plan, mPerUnit, wallHeight]);
  useEffect(() => () => geom.dispose(), [geom]);
  // scale.y = -1 maps SVG +y (down the page) to world +z (toward the viewer), extrusion goes up +y.
  return (
    <mesh geometry={geom} rotation-x={-Math.PI / 2} scale={[mPerUnit, -mPerUnit, mPerUnit]} castShadow receiveShadow>
      <meshStandardMaterial color="#d9d4c7" roughness={0.9} side={DoubleSide} />
    </mesh>
  );
}

/** Gold outline of the selected room on the floor (same rectangle the mini-map and fly-to use). */
function RoomOutline({ r }: { r: RoomRect }) {
  const y = 0.03;
  return <Line points={[[r.x0, y, r.z0], [r.x1, y, r.z0], [r.x1, y, r.z1], [r.x0, y, r.z1], [r.x0, y, r.z0]]} color="#c9a96e" lineWidth={3} />;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Desktop orbit camera. Room focus FRAMES the room (distance from its rectangle and the camera FOV,
 * 55° elevation from the south) instead of only retargeting; Overview frames the unit; Top view looks
 * straight down with drag = pan, wheel / pinch = zoom toward the cursor. Transitions are short, eased and
 * cancelled the moment the user grabs the controls.
 */
/** Red pin over a room: a small sphere on a thin pole, scaled with camera distance so it reads the same size from the top view and at eye level. */
function RoomBeacon({ r }: { r: RoomRect }) {
  const ref = useRef<import('three').Group>(null);
  const pos = useMemo(() => new Vector3((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2), [r]);
  useFrame(({ clock, camera }) => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1.4, Math.max(0.22, camera.position.distanceTo(pos) / 30)) * (1 + 0.1 * Math.sin(clock.elapsedTime * 4)); // ~7 cm dot at eye level, ~1 m from the overview
    g.scale.set(k, k, k);
  });
  return (
    <group ref={ref} position={pos} renderOrder={50}>
      <mesh position={[0, 1.6, 0]} raycast={() => null}><cylinderGeometry args={[0.03, 0.03, 3.2, 8]} /><meshBasicMaterial color="#ff3b30" depthTest={false} /></mesh>
      <mesh position={[0, 3.3, 0]} raycast={() => null}><sphereGeometry args={[0.32, 18, 12]} /><meshBasicMaterial color="#ff3b30" depthTest={false} /></mesh>
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2} raycast={() => null}><ringGeometry args={[0.5, 0.7, 36]} /><meshBasicMaterial color="#ff3b30" depthTest={false} transparent opacity={0.85} /></mesh>
    </group>
  );
}

function DesktopCamera({ top, w, d, focus, overviewToken, lookDownToken = 0, far = 70, tourGoal, eye = null }: { top: boolean; w: number; d: number; focus: RoomRect | null; overviewToken: number; lookDownToken?: number; far?: number; tourGoal?: PlanSceneProps['tourGoal']; eye?: NavSpot | null }) {
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const goal = useRef<{ p0: Vector3; p1: Vector3; t0: Vector3; t1: Vector3; t: number; dur: number } | null>(null);

  // site tour flights (unit frame); they win over room framing while set
  useEffect(() => {
    if (!tourGoal || !controls || typeof controls.target?.clone !== 'function') return;
    goal.current = { p0: camera.position.clone(), p1: new Vector3(...tourGoal.pos), t0: controls.target.clone(), t1: new Vector3(...tourGoal.target), t: 0, dur: Math.max(0.05, tourGoal.seconds) };
  }, [tourGoal, camera, controls]);

  const frame = useCallback((cx: number, cz: number, sw: number, sd: number, down: boolean) => {
    if (!controls || typeof controls.target?.clone !== 'function') return; // orbit controls not mounted yet, or pointer-lock still registered
    const halfV = Math.tan(((camera.fov ?? 50) * Math.PI) / 360);
    const halfH = halfV * (camera.aspect || 1);
    const target = new Vector3(cx, 0, cz);
    let pos: Vector3;
    // generous margins: a room reads with its neighbours around it, and the tour bar covers the bottom of the view
    if (down) {
      const dist = Math.min(60, Math.max(6, Math.max(sd / 2 / halfV, sw / 2 / halfH) * 1.9));
      pos = new Vector3(cx, dist, cz + 0.001);
    } else {
      const dist = Math.min(60, Math.max(5, (Math.max(sw, sd) / 2 / Math.min(halfV, halfH)) * 1.6));
      const el = (55 * Math.PI) / 180;
      pos = new Vector3(cx, dist * Math.sin(el), cz + dist * Math.cos(el));
    }
    goal.current = { p0: camera.position.clone(), p1: pos, t0: controls.target.clone(), t1: target, t: 0, dur: 0.7 };
  }, [camera, controls]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => { goal.current = null; };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);


  // eye level: glide to a free spot in the room at 1.6 m, facing along the room; the orbit target sits a few
  // centimetres ahead, so dragging turns the view in place like a 360° photo
  const eyeKey = eye ? `${eye.x.toFixed(2)},${eye.z.toFixed(2)}` : '';
  useEffect(() => {
    if (!eye || tourGoal || !controls || typeof controls.target?.clone !== 'function') return;
    const yaw = eye.yaw ?? 0;
    const p1 = new Vector3(eye.x, 1.6, eye.z);
    const t1 = p1.clone().add(new Vector3(-Math.sin(yaw), -0.02, -Math.cos(yaw)).multiplyScalar(0.08));
    goal.current = { p0: camera.position.clone(), p1, t0: controls.target.clone(), t1, t: 0, dur: 1.1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eyeKey, tourGoal, controls]);

  // a minimap pick asks for one top-down framing of the next focus (orbit stays unlocked afterwards)
  const lookDown = useRef(false);
  useEffect(() => { if (lookDownToken) lookDown.current = true; }, [lookDownToken]);
  // focus a room (or keep the current focus) when it or the mode changes
  useEffect(() => {
    if (tourGoal || eye) return;
    if (focus) frame((focus.x0 + focus.x1) / 2, (focus.z0 + focus.z1) / 2, focus.x1 - focus.x0, focus.z1 - focus.z0, top || lookDown.current);
    lookDown.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, top, frame, tourGoal, lookDownToken, eyeKey]);
  // whole unit on mount, on Overview, and when toggling top view with nothing focused
  useEffect(() => {
    if (!focus && !tourGoal) frame(0, 0, w, d, top);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewToken, top, w, d, frame]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls) return;
    g.t = Math.min(1, g.t + dt / g.dur);
    const k = easeOut(g.t);
    camera.position.lerpVectors(g.p0, g.p1, k);
    controls.target.lerpVectors(g.t0, g.t1, k);
    controls.update();
    if (g.t >= 1) goal.current = null;
  });

  // eye level: turn in place only (no pan, no zoom), drag direction reversed so the view follows the hand
  if (eye && !tourGoal) {
    return (
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        enablePan={false}
        enableZoom={false}
        rotateSpeed={-0.35}
        minDistance={0.02}
        maxDistance={0.2}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI - 0.3}
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.ROTATE }}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.ROTATE }}
      />
    );
  }
  // top view: rotation off, left drag pans, wheel / pinch zoom toward the cursor
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.12}
      zoomToCursor
      zoomSpeed={1.6}
      screenSpacePanning
      enableRotate={!top}
      mouseButtons={top ? { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN } : { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      touches={top ? { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN } : { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      minDistance={1.2}
      maxDistance={tourGoal ? 2000 : far}
      maxPolarAngle={Math.PI / 2 - 0.05}
    />
  );
}

/** Label anchor ids for the page's <DomLabel>s: `room-<index>` at 1.3 m over each room label, `ref-scale` over the 1 m cube. */
export function planLabelEntries(plan: PlanRecord, mPerUnit: number): LabelEntry[] {
  const [x0, y0, x1, y1] = plan.wallBboxPt;
  const w = (x1 - x0) * mPerUnit;
  const d = (y1 - y0) * mPerUnit;
  const rooms = plan.rooms.map((r, i): LabelEntry => {
    const [mx, mz] = ptToPlanMetres(plan, mPerUnit, r.labelPt[0], r.labelPt[1]);
    return { id: `room-${i}`, position: [mx, 1.3, mz] };
  });
  return [...rooms, { id: 'ref-scale', position: [-w / 2 - 1.5 + 0.8, 2.1, d / 2 - 1] }];
}

/** The wrist panel is hidden for now (client request): sticks, teleport and the map HUD cover navigation. */
const XR_PANEL = false;

export function PlanScene({ plan, mPerUnit, wallHeight, showLabels, showFloorImage, showFurniture, focusRoom, onFocusRoom, firstPerson, topView = false, eyeLevel = false, overviewToken = 0, lookDownToken = 0, realistic = true, placement = null, floor = 24, ground = 'vector', date, hour, tourGoal = null, beacon = false, onWorldStatus, onStatus }: PlanSceneProps) {
  const walls = useWalls(plan.svg, onStatus);
  const furniture = useFurniture(plan, mPerUnit);
  const inXR = useInXR();
  const mirrored = realistic && !!placement?.mirrored;
  const mx = mirrored ? -1 : 1; // printed-plan frame ↔ shown frame (mirrored flats)
  const floorTex = useFloorTexture(plan, showFloorImage || inXR, mirrored); // in XR the raster also feeds the mini-map
  const [x0, y0, x1, y1] = plan.wallBboxPt;
  const w = (x1 - x0) * mPerUnit;
  const d = (y1 - y0) * mPerUnit;
  const labelEntries = useMemo(() => planLabelEntries(plan, mPerUnit).map((e) => ({ ...e, position: [e.position[0] * mx, e.position[1], e.position[2]] as [number, number, number] })), [plan, mPerUnit, mx]);
  const mirrorRect = useCallback((r: RoomRect): RoomRect => (mirrored ? { ...r, x0: -r.x1, x1: -r.x0 } : r), [mirrored]);
  const mirrorSpot = useCallback((sp: NavSpot): NavSpot => (mirrored ? { ...sp, x: -sp.x, yaw: sp.yaw == null ? undefined : -sp.yaw } : sp), [mirrored]);

  // one navigation grid: collision, room rectangles, safe spots, spawn
  const visibleFurniture = useMemo(() => (showFurniture ? furniture ?? [] : []), [showFurniture, furniture]);
  const nav = useMemo<NavGrid | null>(() => {
    if (!walls || (showFurniture && !furniture)) return null;
    try { return buildNavGrid(walls, visibleFurniture, plan, mPerUnit); } catch { return null; }
  }, [walls, furniture, showFurniture, visibleFurniture, plan, mPerUnit]);
  const rectsU = useMemo(() => roomRects(plan, mPerUnit, nav), [plan, mPerUnit, nav]); // printed frame (nav grid)
  const rects = useMemo(() => rectsU.map(mirrorRect), [rectsU, mirrorRect]); // shown frame
  const entry = useMemo(() => mirrorSpot(entrySpot(nav, plan, mPerUnit, rectsU)), [nav, plan, mPerUnit, rectsU, mirrorSpot]);
  const focusRect = useMemo(() => rects.find((r) => r.room === focusRoom) ?? null, [rects, focusRoom]);
  // where the eye-level view stands: the same free spot in the room that walk mode and VR use
  const eyeSpot = useMemo(() => (eyeLevel && focusRect && !firstPerson ? mirrorSpot(roomSpot(nav, mirrorRect(focusRect))) : null), [eyeLevel, focusRect, firstPerson, nav, mirrorRect, mirrorSpot]);
  const collide = useCallback((fx: number, fz: number, tx: number, tz: number): [number, number] => {
    if (!nav) return [tx, tz];
    const [rx, rz] = slide(nav, fx * mx, fz, tx * mx, tz);
    return [rx * mx, rz];
  }, [nav, mx]);

  // XR rig + desktop walker placement
  const rig = useRef<XRRigHandle>(null);
  const [mode, setMode] = useState<RigMode>('walk');
  const [walkSpot, setWalkSpot] = useState<NavSpot | undefined>(undefined);
  const topSpot = useCallback((): NavSpot => ({ x: 0, z: 0, y: Math.min(30, Math.max(6, Math.max(w, d) * 0.85)), yaw: 0 }), [w, d]);
  const goEntrance = () => { setMode('walk'); rig.current?.flyTo(entry); };
  const goTop = () => { setMode('top'); rig.current?.flyTo(topSpot()); };

  useEffect(() => { if (firstPerson) Promise.resolve().then(() => setWalkSpot(entry)); }, [firstPerson, entry]);
  useEffect(() => {
    if (!focusRect) return;
    const spot = mirrorSpot(roomSpot(nav, mirrorRect(focusRect)));
    if (xrStore.getState().session) { Promise.resolve().then(() => setMode('walk')); rig.current?.flyTo(spot); }
    else if (firstPerson) Promise.resolve().then(() => setWalkSpot(spot));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRect]);

  const toUV = useCallback((x: number, z: number): [number, number] => [(x + w / 2) / w, (z + d / 2) / d], [w, d]);

  return (
    <XR store={xrStore}>
      <color attach="background" args={['#0f1216']} />
      {!(realistic && placement) && <Sky sunPosition={[40, 30, -20]} turbidity={6} rayleigh={1.2} />}
      {realistic ? (
        <>
          {/* daylight through the openings; interior fill comes from the unit's image-based light. With a placement the surroundings bring the real sun. */}
          <hemisphereLight intensity={placement ? 0.7 : 0.22} color="#e8eefc" groundColor="#4a4238" />
          {placement && <ambientLight intensity={0.35} color="#f4efe6" />}
          {!placement && <directionalLight position={[14, 20, 6]} intensity={1.3} castShadow={!inXR} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} />}
        </>
      ) : (
        <>
          <hemisphereLight intensity={0.55} color="#dfe8ff" groundColor="#3b352c" />
          <directionalLight position={[12, 18, 8]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} />
          <ambientLight intensity={0.25} />
        </>
      )}

      {/* floor (textured with the plan itself); click a room to focus it (desktop orbit) */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.001, 0]}
        receiveShadow
        visible={!(realistic && placement)}
        onClick={(e) => {
          if (inXR || firstPerson || e.delta > 4) return; // a drag (pan / orbit) is not a click
          const r = roomAtPoint(rects, e.point.x, e.point.z);
          if (r) onFocusRoom?.(r.room === focusRoom ? null : r.room);
        }}
      >
        <planeGeometry args={[w, d]} />
        {showFloorImage && floorTex && !realistic ? <meshStandardMaterial map={floorTex} roughness={1} /> : <meshStandardMaterial color={realistic ? '#1c1e22' : '#2a2d33'} roughness={1} />}
      </mesh>
      <TeleportFloor
        size={[w + 6, d + 6]}
        position={[0, 0.002, 0]}
        onTeleport={([x, , z]) => {
          const p = nav ? nearestFree(nav, x * mx, z) : [x * mx, z];
          if (!p) return;
          setMode('walk');
          rig.current?.flyTo({ x: p[0] * mx, z: p[1] }, 0);
        }}
      />

      {realistic ? (
        <RealisticUnit plan={plan} furnished={showFurniture} interior={(firstPerson || inXR || !!eyeSpot) && !(inXR && mode === 'top')} quality={inXR ? 'vr' : 'high'} placement={placement} floor={floor} ground={ground} date={date} hour={hour} amenityLabels={!!placement && (topView || (inXR && mode === 'top'))} topView={topView || (inXR && mode === 'top')} onWorldStatus={onWorldStatus} />
      ) : (
        <>
          {walls && <Walls walls={walls} plan={plan} mPerUnit={mPerUnit} wallHeight={wallHeight} />}
          {showFurniture && furniture && <Furniture items={furniture} />}
        </>
      )}
      {focusRect && <RoomOutline r={focusRect} />}
      {focusRect && beacon && !eyeSpot && <RoomBeacon r={focusRect} />}

      {/* scale references: 1 m cube and a 1.75 m figure outside the entry side (plan-extrusion mode only) */}
      <group position={[-w / 2 - 1.5, 0, d / 2 - 1]} visible={!realistic}>
        <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#c9a96e" /></mesh>
        <mesh position={[1.6, 0.875, 0]} castShadow><capsuleGeometry args={[0.2, 1.35, 4, 8]} /><meshStandardMaterial color="#7fb2e0" /></mesh>
      </group>

      {/* desktop: DOM labels (page renders <DomLabel id="room-i">); in XR: 3D text panels, since DOM is invisible there */}
      {showLabels && !inXR && !eyeSpot && <LabelProjector entries={labelEntries} maxDistance={60} />}
      {showLabels && inXR && plan.rooms.map((r, i) => {
        const [px, mz] = ptToPlanMetres(plan, mPerUnit, r.labelPt[0], r.labelPt[1]);
        const mxp = px * mx;
        const dims = `${(r.mm[0] / 1000).toFixed(2)} x ${(r.mm[1] / 1000).toFixed(2)} m`;
        return <XRLabel key={i} position={[mxp, 1.3, mz]} text={r.name} sub={dims} active={focusRoom === r} />;
      })}

      <PosePublisher />
      {!inXR && (firstPerson
        ? <FirstPersonRig spot={walkSpot} collide={collide} />
        : <DesktopCamera top={topView} w={w} d={d} focus={focusRect} overviewToken={overviewToken} lookDownToken={lookDownToken} far={realistic && placement ? 900 : 70} tourGoal={tourGoal} eye={eyeSpot} />)}
      <XRRig ref={rig} start={entry} mode={mode} walkSpeed={1.5} topRange={[3, realistic && placement ? 600 : 40]} collide={collide}>
        {inXR && XR_PANEL && (
          <XRPanelAnchor>
            <XRPanel title={plan.name} width={190} collapsible>
              {/* same layout as the on-screen pad: rotate pair · view toggle · zoom */}
              <Container flexDirection="row" gap={4}>
                <XRButton grow label="< Rotate" onClick={() => rig.current?.turn(Math.PI / 6)} />
                <XRButton grow label="Rotate >" onClick={() => rig.current?.turn(-Math.PI / 6)} />
              </Container>
              <Container flexDirection="row" gap={4}>
                <XRButton grow label={mode === 'top' ? 'Walk' : 'Top view'} active={mode === 'top'} onClick={() => (mode === 'top' ? goEntrance() : goTop())} />
                <XRButton grow label="Entrance" onClick={goEntrance} />
              </Container>
              <Container flexDirection="row" gap={4}>
                <XRButton grow label={mode === 'top' ? 'Zoom +' : 'Forward'} onClick={() => (mode === 'top' ? rig.current?.zoom(0.75) : rig.current?.nudge(0, 0.8))} />
                <XRButton grow label={mode === 'top' ? 'Zoom -' : 'Back'} onClick={() => (mode === 'top' ? rig.current?.zoom(1.33) : rig.current?.nudge(0, -0.8))} />
              </Container>
              <XRText muted>{mode === 'top' ? 'Left stick pan - right stick up/down zoom' : 'Left stick walk - right stick turn - trigger on floor: jump'}</XRText>
              <XRText muted>{`Grip on panel: move it - scale ${(mPerUnit * 1000).toFixed(1)} mm/pt`}</XRText>
            </XRPanel>
          </XRPanelAnchor>
        )}
      </XRRig>
      {inXR && floorTex && (
        <XRMapHud>
          <XRMiniMap src={floorTex} aspect={w / d} width={220} toUV={toUV} onPick={(u, v) => {
            // inverse of toUV, then the nearest free cell (as a floor teleport does)
            const p = nav ? nearestFree(nav, (u * w - w / 2) * mx, v * d - d / 2) : [(u * w - w / 2) * mx, v * d - d / 2];
            if (!p) return;
            setMode('walk');
            rig.current?.flyTo({ x: p[0] * mx, z: p[1] }, 0.4);
          }} />
        </XRMapHud>
      )}
    </XR>
  );
}
