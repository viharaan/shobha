'use client';

import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { PlanViewer2D, type PlanTool, type Pt } from '@/components/plan/PlanViewer2D';
import { DomLabel, LabelLayer } from '@/components/three/DomLabels';
import { PlanScene } from '@/components/three/PlanScene';
import type { GroundMode, WorldStatus } from '@/components/three/RealisticUnit';
import { flatsForType, representativeFlat, unitPlacementFromFlat } from '@/data/sobha/flats/loader';
import { isRefugeFloor, maxBuildingFloor, midBuildingFloor } from '@/lib/unit/buildingFloor';
import { istTodayYmd } from '@/lib/solar';
import { bearingDeg, compassPoint } from '@/lib/unit/worldTiles';
import { Panel, Spinner, StatusBadge } from '@/components/ui/primitives';
import { Facts, InfoCard, StageCard, useStageKeys, type Crumb, type Stepper } from './ContextUI';
import { ChoiceList, Dock, type DockTab } from './Dock';
import { VRButton } from '@/components/three/VRButton';
import { StageLoader } from './StageLoader';
import { SunPanel } from './SunPanel';
import { PresentationBar } from '@/components/ui/PresentationBar';
import { TourBar } from '@/components/ui/TourBar';
import { planTour, siteStopInUnitFrame, siteTour } from '@/lib/tour';
import { buildingFloorLevelM } from '@/lib/unit/buildingFloor';
import { resolveHome } from '@/lib/homes';
import { useShortlist } from '@/lib/shortlist';
import { useUrlState } from '@/lib/useUrlState';
import { PLANS } from '@/data/manifest';
import { TOWERS, WALL_HEIGHT_M } from '@/data/project';
import type { PlanCalibration, PlanRoom } from '@/data/types';
import type { WallData } from '@/lib/svgWalls';
import { loadCalibration, metresPerUnit, saveCalibration, sqftToSqm } from '@/lib/scale';
import { NavDriver } from './NavDriver';
import { HeadingProbe } from './HeadingProbe';

type Layout = 'map' | 'split' | '2d' | '3d';

/**
 * Home mode of the stage: the 1:1 unit (2D plan + furnished 3D with the real surroundings). Shareable
 * state (plan, wing, flat, floor, view, tour, present) is read from the URL every render. The context chrome
 * follows the visitor: the whole home (type, flat, floor, shortlist) or one room (size as printed, next room);
 * layout, layers, imagery, sun and the scale tools sit behind View options.
 */
export default function HomeStage({ resetToken, railExtras }: { resetToken: number; railExtras?: React.ReactNode }) {
  const { params, set, num, latest } = useUrlState();
  const wingP = num('wing');
  const flatP = num('flat');
  const floorP = num('floor');
  const present = params.get('present') === '1';
  const tourParam = params.get('tour');
  const resolved = useMemo(() => (wingP && flatP ? resolveHome({ wing: wingP, flat: flatP, floor: floorP ?? 1 }) : null), [wingP, flatP, floorP]);
  const planId = params.get('plan') ?? resolved?.planId ?? PLANS[0].id;
  const plan = useMemo(() => PLANS.find((p) => p.id === planId) ?? PLANS[0], [planId]);
  const { has: shortlisted, toggle: toggleShortlist } = useShortlist();

  const [overrides, setOverrides] = useState<Record<string, PlanCalibration | null | undefined>>({});
  const [tool, setTool] = useState<PlanTool>('pan');
  const [points, setPoints] = useState<Pt[]>([]);
  const [calibDistance, setCalibDistance] = useState('');
  const roomStops = useMemo(() => planTour(plan), [plan]);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [focusRoom, setFocusRoom] = useState<PlanRoom | null>(null);
  const viewParam = params.get('view');
  const layout: Layout = viewParam === '2d' || viewParam === '3d' || viewParam === 'split' ? viewParam : 'map';
  const setLayout = (l: Layout) => set({ view: l === 'map' ? null : l });
  const [mapBig, setMapBig] = useState(false);
  const [wallHeight, setWallHeight] = useState(WALL_HEIGHT_M);
  const [showLabels, setShowLabels] = useState(true);
  const [showFloorImage, setShowFloorImage] = useState(true);
  const [showFurniture, setShowFurniture] = useState(true);
  const [realistic, setRealistic] = useState(true);
  const [planOnly, setPlanOnly] = useState(false); // "printed plan only": no placement, no surroundings
  const [ground, setGround] = useState<GroundMode>('esri'); // satellite under the OSM 3-D buildings by default (VR and desktop)
  const [date, setDate] = useState(() => istTodayYmd());
  const [hour, setHour] = useState(10.5); // fixed daylight start; the headset's clock is not trusted for the first view
  // a picked room (list, keys, minimap, room tour) is seen from eye level by default: stand in it and look around
  const [roomView, setRoomView] = useState<'eye' | 'top'>('eye');
  const [world, setWorld] = useState<WorldStatus | null>(null);
  const [worldOn, setWorldOn] = useState(true);
  const choices = useMemo(() => flatsForType(plan.typeCode), [plan.typeCode]);
  // which flat of this type: the one in the URL, else one in the chosen wing, else the highlighted representative
  const choice = useMemo(() => {
    if (planOnly) return null;
    const exact = wingP && flatP ? choices.find((c) => c.wing === wingP && c.flat === flatP) : null;
    if (exact) return exact;
    const inWing = wingP ? choices.find((c) => c.wing === wingP) : null;
    if (inWing) return inWing;
    const rep = representativeFlat(plan.typeCode);
    return choices.find((c) => rep && c.wing === rep.wing && c.flat === rep.flat) ?? choices[0] ?? null;
  }, [planOnly, wingP, flatP, choices, plan.typeCode]);
  const placement = useMemo(() => (realistic && worldOn && choice?.placement ? unitPlacementFromFlat(choice.placement) : null), [realistic, worldOn, choice]);
  const wingN = choice?.wing ?? plan.wing;
  const floor = floorP ?? midBuildingFloor(wingN);
  const setFloor = (f: number) => set({ floor: f });
  const homeRef = choice ? { wing: choice.wing, flat: choice.flat, floor } : null;
  // Guided tour inside the stage. tour=rooms (Home mode's own button, and the hand-off from the community tour) is
  // room by room only; tour=1 (an old link) still flies gate → amenities → this wing through the surroundings first.
  const siteStops = useMemo(() => (placement && tourParam !== 'rooms' ? siteTour(wingN) : []), [placement, wingN, tourParam]);
  const tour = useMemo(() => [...siteStops, ...roomStops], [siteStops, roomStops]);
  const tourStop = tourIndex !== null && tour.length ? tour[Math.min(tourIndex, tour.length - 1)] : null;
  const tourGoal = useMemo(() => (tourStop && 'pos' in tourStop && placement ? siteStopInUnitFrame(tourStop, placement, buildingFloorLevelM(floor)) : null), [tourStop, placement, floor]);
  const focusRoomShown = tourStop ? ('room' in tourStop ? tourStop.room : null) : focusRoom;
  const roomStop = tourStop !== null && 'room' in tourStop; // room-by-room part of the tour: look down into the plan, pin the room
  const [firstPerson, setFirstPerson] = useState(false);
  const [topView, setTopView] = useState(false);
  const [overviewToken, setOverviewToken] = useState(0);
  useEffect(() => {
    Promise.resolve().then(() => {
      if (!tourParam) { setTourIndex(null); return; }
      setTourIndex(0);
      setTopView(false);
      setFirstPerson(false);
    });
  }, [tourParam]);
  const exitTour = () => { setFocusRoom(null); setOverviewToken((t) => t + 1); set({ tour: null }); };
  const goTourStop = (i: number) => setTourIndex(Math.max(0, Math.min(i, tour.length - 1)));
  const facing = choice?.placement?.balconyBearingDeg ?? null;
  const door = choice?.placement?.doorBearingDeg ?? null;
  const elevation = world?.terrain && world.terrain !== 'failed' ? world.terrain.baseElev : null;
  const overview = () => { setFocusRoom(null); setTopView(false); setFirstPerson(false); setOverviewToken((t) => t + 1); };
  // minimap click: the nearest labelled room (within ~90 pt) becomes the focus — the orbit camera flies over its centre
  // looking straight down (walls no longer hide it) and stays free to orbit; in walk / VR mode the player is moved into the room
  const pickRoom = ([x, y]: Pt) => {
    let best: PlanRoom | null = null;
    let bd = 90;
    for (const r of plan.rooms) { const d = Math.hypot(r.labelPt[0] - x, r.labelPt[1] - y); if (d < bd) { bd = d; best = r; } }
    if (!best) return;
    setFocusRoom(best);
    setLookDown((t) => t + 1); // one top-down framing; dragging afterwards orbits as usual
  };
  const [lookDown, setLookDown] = useState(0);
  const [status, setStatus] = useState<{ state: 'loading' | 'ready' | 'error'; message?: string; walls?: WallData }>({ state: 'loading' });

  // north: the printed plan's north arrow (for the 2D viewer and the plan-only 3D), and the placed flat's bearing (realistic 3D)
  const northSrc = (choice ?? choices[0])?.placement;
  const northPrinted = northSrc ? (() => { const p = unitPlacementFromFlat(northSrc); return p.mirrored ? (360 - p.northDeg) % 360 : p.northDeg; })() : null;
  const toBearing = useMemo(() => {
    if (placement) return (dx: number, dz: number) => bearingDeg(placement, dx, dz);
    if (northPrinted !== null) return (dx: number, dz: number) => (((Math.atan2(dx, -dz) * 180) / Math.PI - northPrinted) % 360 + 720) % 360;
    return null;
  }, [placement, northPrinted]);

  const override = plan.id in overrides ? overrides[plan.id] ?? null : null;
  useEffect(() => {
    // read persisted calibration once per plan; storage is an external system
    const stored = loadCalibration(plan.id);
    if (stored) Promise.resolve().then(() => setOverrides((o) => (plan.id in o ? o : { ...o, [plan.id]: stored })));
  }, [plan.id]);
  const setOverride = (c: PlanCalibration | null) => setOverrides((o) => ({ ...o, [plan.id]: c }));
  const selectPlan = (id: string) => { set({ plan: id, wing: null, flat: null, floor: null }); setPoints([]); setFocusRoom(null); setPlanOnly(false); setWorld(null); };
  const selectFlat = (v: string) => {
    if (v === 'plan') { setPlanOnly(true); return; }
    const [w, f] = v.split(':').map(Number);
    setPlanOnly(false);
    set({ wing: w, flat: f });
  };

  const mPerUnit = metresPerUnit(plan, override);
  const calib = override ?? plan.calibration;
  const towersWithType = TOWERS.filter((t) => t.samplePlanId === plan.id || t.typicalFloor?.some((u) => u.typeCode === plan.typeCode));

  const applyCalibration = () => {
    const d = parseFloat(calibDistance);
    if (points.length !== 2 || !(d > 0)) return;
    const pt = Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]);
    const c: PlanCalibration = { mmPerPt: (d * 1000) / pt, status: 'user-calibrated', samples: 1, note: `Two points ${pt.toFixed(1)} pt apart set to ${d} m in this browser.` };
    saveCalibration(plan.id, c);
    setOverride(c);
    setPoints([]);
    setTool('pan');
  };
  const resetCalibration = () => { saveCalibration(plan.id, null); setOverride(null); };

  const [x0, y0, x1, y1] = plan.wallBboxPt;
  const wM = (x1 - x0) * mPerUnit;
  const dM = (y1 - y0) * mPerUnit;
  const deviation = override ? ((override.mmPerPt / plan.calibration.mmPerPt - 1) * 100).toFixed(1) : null;
  const chrome = !present && tourIndex === null;

  // where you are: site → wing → floor → this home → a room
  const roomShown = focusRoomShown;
  const eyeLevel = roomView === 'eye' && !!focusRoomShown && !firstPerson && !topView;
  const roomIdx = roomShown ? roomStops.findIndex((r) => r.room === roomShown) : -1;
  const goRoom = (r: PlanRoom | null) => { setFocusRoom(r); if (r) setLookDown((t) => t + 1); else overview(); };
  const crumbs: Crumb[] = [{ label: 'SOBHA OneWorld', onClick: () => set({ mode: null, wing: null, floor: null, flat: null, tour: null }) }];
  if (choice) {
    crumbs.push({ label: `Wing ${wingN}`, onClick: () => set({ mode: null, wing: wingN, floor: null, tour: null }) });
    crumbs.push({ label: `Floor ${floor}`, onClick: () => set({ mode: null, wing: wingN, floor, tour: null }) });
    crumbs.push({ label: `Flat ${choice.flat}`, onClick: () => goRoom(null) });
  } else {
    crumbs.push({ label: `${plan.name} · printed plan`, onClick: () => goRoom(null) });
  }
  if (roomShown) crumbs.push({ label: roomShown.name });

  // ← → rooms, ↑ ↓ floor (placed flats), Enter the first room, Esc out: the room → the home → the wing in the community
  const cycleRoom = (d: number) => goRoom(roomStops[((roomIdx < 0 ? (d > 0 ? -1 : 0) : roomIdx) + d + roomStops.length) % roomStops.length].room);
  const stepper: Stepper = roomShown && roomIdx >= 0
    ? { label: roomShown.name, pos: `${roomIdx + 1} / ${roomStops.length}`, onPrev: () => cycleRoom(-1), onNext: () => cycleRoom(1) }
    : { label: 'Whole home', pos: `${roomStops.length} rooms`, onPrev: () => cycleRoom(-1), onNext: () => cycleRoom(1) };
  const canFloor = !!choice?.placement;
  useStageKeys({
    prev: () => cycleRoom(-1),
    next: () => cycleRoom(1),
    up: canFloor ? () => setFloor(Math.min(maxBuildingFloor(wingN), (Number(latest().get('floor')) || floor) + 1)) : undefined,
    down: canFloor ? () => setFloor(Math.max(2, (Number(latest().get('floor')) || floor) - 1)) : undefined,
    enter: roomShown ? undefined : () => cycleRoom(1),
    back: roomShown ? () => goRoom(null) : () => set({ mode: null, wing: wingN, floor, tour: null }),
  }, chrome && !firstPerson);

  const [tab, setTab] = useState<string | null>(null);
  const onOpenTab = (id: string | null) => setTab(id);

  const roomCard = roomShown && roomIdx >= 0 ? (
    <InfoCard
      key={`room-${roomIdx}`}
      eyebrow={`${plan.name}${choice ? ` · Flat ${choice.flat}` : ''}`}
      title={roomShown.name}
      badge={<StatusBadge status={calib.status} title="Room size as printed on the plan; the plan’s scale is cross-checked against its 12 room labels" />}
      lead={<>{roomStops[roomIdx].caption}{roomView === 'eye' && !firstPerson ? <span className="mt-1 block text-fg/70">Drag to look around.</span> : null}</>}
      actions={<>
        <button type="button" className="btn" onClick={() => goRoom(roomStops[(roomIdx - 1 + roomStops.length) % roomStops.length].room)} aria-label="Previous room">‹</button>
        <button type="button" className="btn btn-primary" onClick={() => goRoom(roomStops[(roomIdx + 1) % roomStops.length].room)}>Next: {roomStops[(roomIdx + 1) % roomStops.length].room.name} ›</button>
        <span className="seg !bg-transparent" role="tablist" aria-label="Room view">
          <button type="button" role="tab" aria-selected={roomView === 'eye'} onClick={() => setRoomView('eye')} title="Stand in the room at eye height and look around">Eye level</button>
          <button type="button" role="tab" aria-selected={roomView === 'top'} onClick={() => setRoomView('top')} title="Look down into the room from above">Top</button>
        </span>
        <button type="button" className="btn" onClick={() => goRoom(null)}>Whole home</button>
      </>}
    />
  ) : null;

  const homeCard = (
    <InfoCard
      key={`home-${plan.id}-${choice ? `${choice.wing}-${choice.flat}` : 'plan'}`}
      eyebrow={homeRef ? `Wing ${homeRef.wing} · Flat ${homeRef.flat} · Floor ${homeRef.floor}` : `Type ${plan.typeCode} · printed plan`}
      title={plan.name}
      badge={<StatusBadge status="source" title="Areas from the sales sheet and the floor-plan PDF" />}
      lead={<>{plan.sbaSqft.toLocaleString('en-IN')} sq ft SBA · {plan.carpetSqft.toLocaleString('en-IN')} carpet{facing != null ? ` · balcony faces ${compassPoint(facing)}` : ''}{isRefugeFloor(wingN, floor) && choice ? <span className="text-warn"> · refuge floor</span> : null}</>}
      actions={<>
        {homeRef && <button type="button" className="btn btn-primary" aria-pressed={shortlisted(homeRef)} onClick={() => toggleShortlist(homeRef)}>{shortlisted(homeRef) ? '★ Shortlisted' : '☆ Shortlist'}</button>}
        <button type="button" className="btn" onClick={() => onOpenTab('home')}>Change home</button>
      </>}
    />
  );

  const homePanel = (
      <div className="space-y-2">
        <label className="block">
          <span className="label !text-[10px]">Home type</span>
          <select className="mt-0.5 w-full rounded-md border border-line bg-bg-2 px-2 py-1 text-xs" value={plan.id} onChange={(e) => selectPlan(e.target.value)} aria-label="Choose unit type">
            {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name} · Type {p.typeCode}</option>)}
          </select>
        </label>
        {realistic && (
          <label className="block">
            <span className="label !text-[10px]">Which flat</span>
            <select className="mt-0.5 w-full rounded-md border border-line bg-bg-2 px-2 py-1 text-xs" value={choice ? `${choice.wing}:${choice.flat}` : 'plan'} onChange={(e) => selectFlat(e.target.value)} aria-label="Choose which flat to show">
              {choices.map((c) => (
                <option key={`${c.wing}:${c.flat}`} value={`${c.wing}:${c.flat}`}>Wing {c.wing} · Flat {c.flat}{c.placement?.mirrored ? ' · mirrored' : ''}{c.proxy ? ' · variant plan' : ''}{c.record?.facing ? ` · faces ${c.record.facing}` : ''}</option>
              ))}
              <option value="plan">Printed plan only (no surroundings)</option>
            </select>
          </label>
        )}
        {choice?.placement && (
          <>
            <label className="block">
              <span className="label !text-[10px]">Floor {floor} of {maxBuildingFloor(wingN)} · eye ≈ {(4.5 + (floor - 2) * 3 + 1.6).toFixed(0)} m up</span>
              <input type="range" min={2} max={maxBuildingFloor(wingN)} step={1} value={floor} onChange={(e) => setFloor(parseInt(e.target.value, 10))} className="w-full" aria-label="Building floor" />
            </label>
            <Facts rows={[
              ['Balcony', facing != null ? `${compassPoint(facing)} (${Math.round(facing)}°)` : '—'],
              ['Main door', `${door != null ? `${compassPoint(door)} (${Math.round(door)}°)` : '—'}${choice.record?.facing ? ` · sheet: ${choice.record.facing}` : ''}`],
              ['Placement', <span key="p">{choice.placement.confidence} confidence · <StatusBadge status="approximate" title="Flat placement fitted from the key plan to the OpenStreetMap wing outline" /></span>],
            ]} />
          </>
        )}
      </div>
  );
  const viewPanel = (
    <div className="flex flex-col gap-3">
      {railExtras}
    <Panel title="Layout">
      <div className="flex flex-wrap gap-1">
        {([['map', '3D + plan'], ['split', 'Split'], ['2d', '2D'], ['3d', '3D']] as [Layout, string][]).map(([l, label]) => (
          <button key={l} type="button" className="btn" aria-pressed={layout === l} onClick={() => setLayout(l)}>{label}</button>
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="label">SBA</dt><dd>{plan.sbaSqft.toLocaleString()} sq ft · {sqftToSqm(plan.sbaSqft).toFixed(1)} m²</dd>
        <dt className="label">Carpet</dt><dd>{plan.carpetSqft.toLocaleString()} sq ft · {sqftToSqm(plan.carpetSqft).toFixed(1)} m²</dd>
        <dt className="label">Plan extent</dt><dd>{wM.toFixed(2)} × {dM.toFixed(2)} m</dd>
        <dt className="label">Shown in</dt><dd>{towersWithType.length ? towersWithType.map((t) => `Wing ${t.wing}`).join(', ') : `Wing ${plan.wing}`}</dd>
      </dl>
    </Panel>

    <Panel title="3D view">
      <div className="flex flex-wrap gap-1">
        <button type="button" className="btn" onClick={overview}>Overview</button>
        <button type="button" className="btn" aria-pressed={topView && !firstPerson} onClick={() => { setFirstPerson(false); setTopView(!topView); }}>Top view</button>
        <button type="button" className="btn" aria-pressed={firstPerson} onClick={() => { setFirstPerson(!firstPerson); setTopView(false); }}>Walk (WASD)</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" className="btn" aria-pressed={realistic} onClick={() => setRealistic(!realistic)}>Realistic interior</button>
        <button type="button" className="btn" aria-pressed={showLabels} onClick={() => setShowLabels(!showLabels)}>Labels</button>
        <button type="button" className="btn" aria-pressed={showFloorImage} onClick={() => setShowFloorImage(!showFloorImage)}>Plan on floor</button>
        <button type="button" className="btn" aria-pressed={showFurniture} onClick={() => setShowFurniture(!showFurniture)}>Furniture</button>
      </div>
      {!realistic && (
        <label className="mt-3 block text-xs">
          <span className="label">Wall height (assumed) · {wallHeight.toFixed(2)} m</span>
          <input type="range" min={2.4} max={3.6} step={0.05} value={wallHeight} onChange={(e) => setWallHeight(parseFloat(e.target.value))} className="w-full" />
        </label>
      )}
      <p className="mt-2 text-[11px] text-fg-muted">
        {realistic
          ? 'Walls, doors and windows follow the traced vector plan (positions and thicknesses are source; 2.85 m ceiling, 2.1 m heads and 0.9 m sills are assumed). Floors, finishes, furniture and décor are illustrative: the pieces the plan draws, rebuilt as PBR models with CC0 Poly Haven props. Not part of the sale.'
          : 'Walls are extruded from the plan’s own wall polygon; thickness is source-derived, height is assumed. Furniture is boxed at the footprints the plan draws.'}
      </p>
      <div className="mt-2 text-[11px]">
        {status.state === 'loading' && <Spinner label="Extracting wall geometry…" />}
        {status.state === 'ready' && <span className="text-ok">Walls: {status.walls?.subPaths} loops, {status.walls?.points} segments.</span>}
        {status.state === 'error' && <span className="text-bad">Could not build walls: {status.message}</span>}
      </div>
    </Panel>

    {realistic && choice?.placement && (
      <Panel title="Surroundings" right={<StatusBadge status="approximate" title="Flat placement fitted from the key plan to the OpenStreetMap wing outline; wing outlines are community-mapped, not a survey" />}>
        <div className="flex flex-wrap gap-1">
          <button type="button" className="btn" aria-pressed={worldOn} onClick={() => setWorldOn(!worldOn)}>Surroundings</button>
        </div>
        <label className="mt-2 block text-xs">
          <span className="label">Ground outside the site</span>
          <select className="mt-1 w-full rounded-md border border-line bg-bg-2 px-2 py-1.5 text-sm" value={ground} onChange={(e) => setGround(e.target.value as GroundMode)} aria-label="Ground imagery">
            <option value="vector">OpenStreetMap buildings, roads, water (vector)</option>
            <option value="osm">OpenStreetMap map tiles</option>
            <option value="sat">Satellite · Sentinel-2 cloudless 2016 (EOX, CC BY 4.0) + OSM buildings</option>
            <option value="esri">Satellite · Esri World Imagery (dev use) + OSM buildings</option>
          </select>
        </label>
        <div className="mt-2 text-[11px] text-fg-muted">
          {world?.state === 'loading' && <Spinner label="Loading surroundings…" />}
          {world?.state === 'error' && <span className="text-bad">Surroundings unavailable ({world.message ?? 'network'}); the home still works.</span>}
          {world?.state === 'ready' && (
            <span>
              {world.buildings != null ? `${world.buildings} OSM buildings · ` : ''}
              {world.terrain === 'failed' ? 'terrain unavailable (flat ground)' : world.terrain ? `terrain ${world.terrain.tiles} tiles · site ≈ ${Math.round(world.terrain.baseElev)} m ASL · ${Math.round(world.terrain.range[0])}–${Math.round(world.terrain.range[1])} m within 3 km` : ''}
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-fg-muted">
          Placement fit: {Math.round(choice.placement.insideWing * 100)}% inside the wing{elevation != null ? `; this floor is ≈ ${Math.round(elevation + 4.5 + (floor - 2) * 3)} m above sea level` : ''}. Towers are massing from the master plan and OpenStreetMap outlines, floor heights assumed (4.5 m podium + 3.0 m per floor). Sun direction is computed; shadows do not prove a view.
        </p>
      </Panel>
    )}

    <Panel title="Scale and measuring" right={<StatusBadge status={calib.status} />}>
      <div className="text-xs">
        <div className="font-mono">{calib.mmPerPt.toFixed(3)} mm / pt → 1 pt = {(mPerUnit * 1000).toFixed(2)} mm</div>
        <p className="mt-1 text-fg-muted">{calib.note}</p>
        {deviation && <p className="mt-1 text-warn">Deviates {deviation}% from the source-derived scale.</p>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {(['pan', 'measure', 'calibrate'] as PlanTool[]).map((t) => (
          <button key={t} type="button" className="btn" aria-pressed={tool === t} onClick={() => { setTool(t); setPoints([]); }}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      {tool !== 'pan' && (
        <p className="mt-2 text-[11px] text-fg-muted">Click two points on the plan{tool === 'calibrate' ? ', then enter their real distance.' : ' to measure.'} {points.length}/2 placed.</p>
      )}
      {tool === 'calibrate' && (
        <div className="mt-2 flex gap-1">
          <input type="number" step="0.01" min="0" placeholder="metres" value={calibDistance} onChange={(e) => setCalibDistance(e.target.value)} className="w-24 rounded-md border border-line bg-bg-2 px-2 py-1 text-sm" aria-label="Real-world distance in metres" />
          <button type="button" className="btn btn-primary" onClick={applyCalibration} disabled={points.length !== 2 || !(parseFloat(calibDistance) > 0)}>Apply</button>
        </div>
      )}
      {override && <button type="button" className="btn mt-2" onClick={resetCalibration}>Reset to source scale</button>}
    </Panel>
    </div>
  );
  const roomsPanel = (
    <ChoiceList items={roomStops.map(({ room: r }) => ({ key: plan.rooms.indexOf(r), label: r.name, meta: `${(r.mm[0] / 1000).toFixed(2)} × ${(r.mm[1] / 1000).toFixed(2)} m`, active: roomShown === r, onClick: () => goRoom(r) }))} />
  );
  const tabs: DockTab[] = [
    { id: 'rooms', label: 'Rooms', panel: roomsPanel },
    { id: 'home', label: 'This home', panel: homePanel },
    { id: 'tour', label: 'Room tour', onClick: () => set({ tour: 'rooms' }), title: 'Room by room through this home' },
    { id: 'walk', label: 'Walk', pressed: firstPerson, onClick: () => { setFirstPerson(!firstPerson); setTopView(false); }, title: 'Walk through at eye height (WASD on a keyboard)' },
    ...(placement ? [{ id: 'sun', label: 'Sunlight', panel: <SunPanel date={date} hour={hour} onDate={setDate} onHour={setHour} facing={facing} /> }] : []),
    { id: 'view', label: 'View', panel: viewPanel },
  ];

  const worldLoading = !!placement && layout !== '2d' && (!world || world.state === 'loading');

  return (
    <div className="absolute inset-0">
      <div className={`absolute inset-0 grid ${layout === 'split' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        {(layout === 'split' || layout === '2d') && (
          <div className="relative min-h-0 border-b border-line md:border-b-0 md:border-r">
            <PlanViewer2D key={plan.id} plan={plan} mPerUnit={mPerUnit} tool={tool} points={points} onPointsChange={setPoints} focusRoom={focusRoomShown} onFocusRoom={setFocusRoom} showRooms={showLabels} northDeg={northPrinted} beacon={roomStop} onPick={pickRoom} />
          </div>
        )}
        {layout !== '2d' && (
          <div className="relative min-h-0">
            <Canvas shadows camera={{ position: [0, 14, 16], fov: 50, near: 0.05, far: 500 }} dpr={[1, 1.75]} gl={{ antialias: true, localClippingEnabled: true, toneMappingExposure: 0.92 }}>
              <HeadingProbe toBearing={toBearing} />
              <NavDriver />
              <PlanScene plan={plan} mPerUnit={mPerUnit} wallHeight={wallHeight} showLabels={showLabels} showFloorImage={showFloorImage} showFurniture={showFurniture} focusRoom={focusRoomShown} onFocusRoom={setFocusRoom} firstPerson={firstPerson} topView={topView || (roomStop && !eyeLevel)} eyeLevel={eyeLevel} beacon={roomStop && !eyeLevel} overviewToken={overviewToken + resetToken} lookDownToken={lookDown} realistic={realistic} placement={placement} floor={floor} ground={ground} date={date} hour={hour} tourGoal={tourGoal} onWorldStatus={(w) => setWorld((prev) => ({ ...(prev ?? {}), ...w }))} onStatus={setStatus} />
            </Canvas>
            {showLabels && !eyeLevel && (
              <LabelLayer>
                {plan.rooms.map((r, i) => (
                  <DomLabel key={i} id={`room-${i}`} active={focusRoomShown === r} onClick={() => goRoom(focusRoomShown === r ? null : r)}>
                    {r.name} · {(r.mm[0] / 1000).toFixed(2)} × {(r.mm[1] / 1000).toFixed(2)} m
                  </DomLabel>
                ))}
                {!realistic && <DomLabel id="ref-scale">1 m cube · 1.75 m figure</DomLabel>}
              </LabelLayer>
            )}
            {chrome && firstPerson && (
              <div className="pointer-events-none absolute bottom-[4.4rem] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-fg-muted max-lg:hidden">
                Click to look · WASD to walk · Esc to release · walls and furniture block
              </div>
            )}
          </div>
        )}
      </div>

      {/* the plan as a minimap: the red dot is the camera / walker; a click on a room moves the view there */}
      {layout === 'map' && !present && (
        <div className={`absolute z-30 overflow-hidden rounded-xl border border-line bg-black/85 shadow-2xl transition-[width,height] duration-200 ${mapBig
          ? 'left-3 right-3 top-16 bottom-[4.75rem] lg:left-auto lg:w-[min(56vw,780px)]'
          : 'left-3 top-16 h-28 w-40 sm:h-36 sm:w-52 lg:left-auto lg:right-3 lg:h-52 lg:w-72'}`} aria-label="Floor plan minimap">
          <PlanViewer2D key={plan.id} plan={plan} mPerUnit={mPerUnit} tool={tool} points={points} onPointsChange={setPoints} focusRoom={focusRoomShown} onFocusRoom={setFocusRoom} showRooms northDeg={northPrinted} beacon={roomStop} onPick={pickRoom} />
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-fg-muted max-sm:hidden">Plan · click a room</div>
          <button type="button" className="btn absolute right-1.5 top-1.5 min-h-0 px-2 py-1 text-[11px]" onClick={() => setMapBig(!mapBig)} aria-expanded={mapBig} aria-label={mapBig ? 'Shrink the plan' : 'Expand the plan'}>{mapBig ? '⤡' : '⤢'}</button>
        </div>
      )}

      {layout !== '2d' && <StageLoader key={plan.id} ready={status.state !== 'loading' && !worldLoading} poster="/media/video/clip-01.png" caption="Developer’s render · OneWorld Plaza · illustrative" steps={[{ label: `Tracing the ${plan.name} walls from the plan`, done: status.state !== 'loading' }, ...(placement ? [{ label: `Loading the view from floor ${floor}`, done: !worldLoading }] : [])]} />}

      {chrome && <StageCard crumbs={crumbs}>{roomCard ?? homeCard}</StageCard>}
      {chrome && <Dock current={stepper} tabs={tabs} openTab={tab} onOpenTab={onOpenTab} extra={<VRButton compact />} />}

      {tourIndex !== null && <TourBar stops={tour} index={Math.min(tourIndex, tour.length - 1)} onIndex={goTourStop} onExit={exitTour} handoff={{ label: 'Find this home', onClick: () => set({ tour: null, mode: null, find: 1 }) }} />}
      {present && tourIndex === null && <PresentationBar label={homeRef ? `${plan.name} · Wing ${homeRef.wing} · Flat ${homeRef.flat} · Floor ${homeRef.floor}` : plan.name} current={homeRef} target="plans" onExit={() => set({ present: null })} />}


    </div>
  );
}
