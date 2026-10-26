'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { DomLabel, LabelLayer } from '@/components/three/DomLabels';
import { SiteScene, type SiteTerrainStatus, type ViewMode } from '@/components/three/SiteScene';
import { Panel, StatusBadge } from '@/components/ui/primitives';
import { PresentationBar } from '@/components/ui/PresentationBar';
import { TourBar } from '@/components/ui/TourBar';
import { GOOGLE_MAPS_KEY } from '@/components/three/GoogleTiles';
import { amenityPoint, placeStop, realmStop, siteTour, siteTourHandoff } from '@/lib/tour';
import { realms } from '@/data/sobha/realms';
import { amenities, realmColor } from '@/data/sobha/amenities';
import { useUrlState } from '@/lib/useUrlState';
import { UNLABELLED_WINGS } from '@/data/sobha/flats/directory';
import { PLANS, SITE_IMAGE } from '@/data/manifest';
import { FLOOR_TO_FLOOR_M, HOTSPOTS, PODIUM_HEIGHT_M, PROJECT, TOWERS, UNIT_TYPES } from '@/data/project';
import { imageRingToLocal, ringAreaM2 } from '@/lib/geo';
import { indicativePrice, topPlcTier } from '@/lib/pricing';
import { fmtCr, fmtInr } from '@/lib/scale';
import { istHoursNow, istTodayYmd } from '@/lib/solar';
import { Facts, InfoCard, PeekNext, StageTrail, useStageKeys, type Crumb, type Stepper } from './ContextUI';
import { ChoiceList, Dock, type DockTab } from './Dock';
import { VRButton } from '@/components/three/VRButton';
import { NavDriver } from './NavDriver';
import { StageLoader } from './StageLoader';
import { SunPanel } from './SunPanel';
import { useFinder } from './Finder';
import { HeadingProbe, siteBearing } from './HeadingProbe';

/**
 * Community mode of the stage: the site model. Shareable state (wing, floor, tour, present) is read
 * from the URL every render; only view toggles live in local state. The stage owns the mode switch,
 * compass, VR / tour / present actions; this component owns the scene, its labels, the context chrome
 * (where you are: site → place or tower → floor, and a card for it) and the View options rail.
 */

/** The places a visitor can glide to from the site level, in tour order. */
const PLACES: { id: string; name: string }[] = [
  { id: 'entrance', name: 'Entrance gateway' },
  { id: 'club', name: 'One Club' },
  { id: 'ground', name: 'World Stadium' },
  { id: 'courts', name: 'Continental Grounds' },
];

/** Mounts once the scene's Suspense boundary has resolved (siblings in one boundary appear together). */
function Mounted({ onMount }: { onMount: () => void }) {
  useEffect(() => { Promise.resolve().then(onMount); }, [onMount]);
  return null;
}
export default function CommunityStage({ resetToken: northToken, intro = false, railExtras }: { resetToken: number; intro?: boolean; railExtras?: React.ReactNode }) {
  const { params, set, num, latest } = useUrlState();
  const wing = num('wing');
  const floor = num('floor');
  const present = params.get('present') === '1';
  const tourParam = params.get('tour');
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  useEffect(() => { Promise.resolve().then(() => setTourIndex(tourParam ? 0 : null)); }, [tourParam]);
  const [photoreal, setPhotorealState] = useState(false);
  const [photorealMounted, setPhotorealMounted] = useState(false);
  const [terrain, setTerrain] = useState<SiteTerrainStatus>({ state: 'loading' });
  const [sceneReady, setSceneReady] = useState(false);
  const onSceneMount = useMemo(() => () => setSceneReady(true), []);
  const setPhotoreal = (v: boolean) => { setPhotorealState(v); if (v) setPhotorealMounted(true); };
  const [photorealOffset, setPhotorealOffset] = useState(0);
  const [mode, setMode] = useState<ViewMode>('exterior');
  const [hotspot, setHotspot] = useState<string | null>(null);
  const [realm, setRealm] = useState<string | null>(null); // one of the six named realms, shown like a place
  const [isolate, setIsolate] = useState(false);
  const [explode, setExplode] = useState(0);
  const [sectionOn, setSectionOn] = useState(false);
  const [sectionHeight, setSectionHeight] = useState(60);
  const [labels, setLabels] = useState(true);
  const [landscape, setLandscape] = useState(true);
  const [groundOpacity, setGroundOpacity] = useState(1);
  const [resetToken, setResetToken] = useState(0);
  const [date, setDate] = useState(() => istTodayYmd());
  // first view in daylight: the live IST hour when the sun is up, else mid-morning ("Now (IST)" restores the clock)
  const [hour, setHour] = useState(() => { const h = Math.round(istHoursNow() * 2) / 2; return h >= 7 && h <= 17.5 ? h : 10.5; });

  const tourWing = wing ?? 1;
  const tour = useMemo(() => siteTour(tourWing), [tourWing]);
  const tourStop = tourIndex !== null ? tour[Math.min(tourIndex, tour.length - 1)] : null;
  // a place picked outside the tour glides the camera to the tour's pose for it
  const placeGoal = useMemo(() => (hotspot && tourIndex === null ? placeStop(hotspot, tourWing) : null), [hotspot, tourIndex, tourWing]);
  const realmGoal = useMemo(() => (realm && tourIndex === null ? realmStop(realm) : null), [realm, tourIndex]);
  // a realm sits between 140 m towers: while one is picked the towers are hidden above their podiums and its places get markers
  const realmPlaces = useMemo(() => (realm ? amenities.filter((a) => a.realm === realm).map((a) => ({ a, p: amenityPoint(a.code) })).filter((x): x is { a: (typeof amenities)[number]; p: [number, number, number] } => !!x.p) : []), [realm]);
  const realmLabels = useMemo(() => realmPlaces.map(({ a, p }) => ({ id: `am-${a.code}`, position: p })), [realmPlaces]);
  const allWings = useMemo(() => TOWERS.map((t) => t.wing), []);
  const exitTour = () => set({ tour: null });
  const goTourStop = (i: number) => {
    const s = tour[Math.max(0, Math.min(i, tour.length - 1))];
    setTourIndex(tour.indexOf(s));
    setHotspot(s.hotspot ?? null);
    if (s.wing) set({ wing: s.wing });
  };
  const hand = siteTourHandoff(tourWing);
  const handoff = hand ? { label: hand.label, onClick: () => set({ mode: 'home', plan: hand.plan, wing: tourWing, flat: null, floor: hand.floor, tour: 'rooms' }) } : null;
  const selectWing = (w: number | null) => { if (w === null) setIsolate(false); setHotspot(null); setRealm(null); set({ wing: w, ...(w === null || w !== wing ? { floor: null } : {}) }); };
  const selectPlace = (id: string | null) => { setIsolate(false); setRealm(null); setHotspot(id); if (id && wing !== null) set({ wing: null, floor: null }); };
  const setFloor = (f: number | null) => { if (f === null) setIsolate(false); set({ floor: f }); };

  const finder = useFinder({ selectWing });
  const tower = wing !== null ? TOWERS.find((t) => t.wing === wing) ?? null : null;
  const hs = hotspot ? HOTSPOTS.find((h) => h.id === hotspot) ?? null : null;
  const samplePlan = tower?.samplePlanId ? PLANS.find((p) => p.id === tower.samplePlanId) : null;
  const sampleType = samplePlan ? UNIT_TYPES.find((u) => u.code === samplePlan.typeCode) : null;
  // floor 1 typical ≈ 2nd storey band; the flat's PLC tier is not published, so from the base tier up to the highest its size allows
  const topTier = sampleType ? topPlcTier(sampleType.bedrooms) : null;
  const price = samplePlan && floor ? indicativePrice(samplePlan.sbaSqft, floor + 1) : null;
  const priceTop = samplePlan && floor && topTier ? indicativePrice(samplePlan.sbaSqft, floor + 1, topTier.tier) : null;
  const chrome = !present && tourIndex === null && !intro;
  const stepInside = samplePlan && tower ? () => set({ mode: 'home', plan: samplePlan.id, wing: tower.wing, flat: null, floor }) : null;

  // where you are, as a small trail over the card: site → a place, or site → tower → floor
  const crumbs: Crumb[] = [{ label: 'SOBHA OneWorld', onClick: () => { selectPlace(null); selectWing(null); } }];
  if (realm) crumbs.push({ label: realm });
  if (hs) crumbs.push({ label: PLACES.find((p) => p.id === hs.id)?.name ?? hs.label.split(' — ')[0] });
  if (tower) crumbs.push({ label: `Wing ${tower.wing}`, onClick: () => setFloor(null) });
  if (tower && floor !== null) crumbs.push({ label: `Floor ${floor}` });

  const placeIdx = hs ? PLACES.findIndex((p) => p.id === hs.id) : -1;
  const nextPlace = placeIdx >= 0 ? PLACES[(placeIdx + 1) % PLACES.length] : null;

  // one step at a time, on screen (the stepper) and on the keyboard: ← → siblings, ↑ ↓ floors, Enter in, Esc out
  const towerIdx = tower ? TOWERS.indexOf(tower) : -1;
  const cyclePlace = (d: number) => selectPlace(PLACES[((placeIdx < 0 ? (d > 0 ? -1 : 0) : placeIdx) + d + PLACES.length) % PLACES.length].id);
  // read the latest query, not the rendered one, so quick repeated keys each count
  const latestNum = (k: string) => { const v = Number(latest().get(k)); return Number.isInteger(v) && v > 0 ? v : null; };
  const cycleTower = (d: number) => {
    const i = TOWERS.findIndex((t) => t.wing === latestNum('wing'));
    const t = TOWERS[(i + d + TOWERS.length) % TOWERS.length];
    setHotspot(null);
    set({ wing: t.wing, ...(latestNum('floor') !== null ? { floor: Math.min(t.typicalFloors, latestNum('floor')!) } : {}) });
  };
  const stepFloor = (d: number) => {
    const t = TOWERS.find((x) => x.wing === latestNum('wing'));
    if (!t) return;
    const f0 = latestNum('floor');
    setFloor(f0 === null ? Math.round(t.typicalFloors / 2) : Math.min(t.typicalFloors, Math.max(1, f0 + d)));
  };
  const realmIdx = realm ? realms.findIndex((r) => r.name === realm) : -1;
  const selectRealm = (name: string | null) => { setIsolate(false); setHotspot(null); setRealm(name); if (name && wing !== null) set({ wing: null, floor: null }); };
  const cycleRealm = (d: number) => selectRealm(realms[(realmIdx + d + realms.length) % realms.length].name);
  const nextView = realm
    ? { label: realms[(realmIdx + 1) % realms.length].name, onClick: () => cycleRealm(1) }
    : tower
    ? { label: `Wing ${TOWERS[(towerIdx + 1) % TOWERS.length].wing}`, onClick: () => cycleTower(1) }
    : { label: PLACES[(placeIdx + 1) % PLACES.length].name, onClick: () => cyclePlace(1) };
  const stepper: Stepper = realm
    ? { label: realm, pos: `${realmIdx + 1} / ${realms.length}`, onPrev: () => cycleRealm(-1), onNext: () => cycleRealm(1) }
    : tower
    ? { label: floor !== null ? `Wing ${tower.wing} · Floor ${floor}` : `Wing ${tower.wing}`, pos: `${towerIdx + 1} / ${TOWERS.length}`, onPrev: () => cycleTower(-1), onNext: () => cycleTower(1) }
    : hs && placeIdx >= 0
      ? { label: PLACES[placeIdx].name, pos: `${placeIdx + 1} / ${PLACES.length}`, onPrev: () => cyclePlace(-1), onNext: () => cyclePlace(1) }
      : { label: 'Places to visit', pos: `${PLACES.length}`, onPrev: () => cyclePlace(-1), onNext: () => cyclePlace(1) };
  useStageKeys(realm
    ? { prev: () => cycleRealm(-1), next: () => cycleRealm(1), back: () => selectRealm(null) }
    : tower
    ? { prev: () => cycleTower(-1), next: () => cycleTower(1), up: () => stepFloor(1), down: () => stepFloor(-1), enter: stepInside ?? undefined, back: () => (floor !== null ? setFloor(null) : selectWing(null)) }
    : { prev: () => cyclePlace(-1), next: () => cyclePlace(1), enter: hs ? undefined : () => cyclePlace(1), back: hs ? () => selectPlace(null) : undefined },
  chrome && !finder.active && mode !== 'firstPerson');

  const realmCard = realm && realmIdx >= 0 ? (() => {
    const r = realms[realmIdx];
    const items = amenities.filter((a) => a.realm === r.name);
    return (
      <InfoCard
        key={`realm-${r.name}`}
        eyebrow={`Realm · ${items.length ? `${items.length} places` : 'clubhouse'}`}
        title={<span className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: realmColor[r.name] }} aria-hidden />{r.name}</span>}
        badge={<StatusBadge status="source" title={r.note} />}
        lead={r.blurb}
      />
    );
  })() : null;
  const card = realmCard ?? (tower && floor !== null ? (
    <InfoCard
      key={`floor-${tower.wing}-${floor}`}
      eyebrow={`Wing ${tower.wing} · Phase ${tower.phase}`}
      title={`Floor ${floor}`}
      badge={<StatusBadge status="source" title="Floor counts and the typical floor as printed on the sales sheet" />}
      lead={PROJECT.refugeFloors.includes(floor) ? <span className="text-warn">Floor {floor} carries refuge units; the sheet does not say which positions are dropped.</span> : `One of ${tower.typicalFloors} typical floors. ${samplePlan ? `Step inside the drawn ${samplePlan.name} at this height, with the real view.` : 'No plan is drawn for this wing yet.'}`}
      details={
        <div className="space-y-2">
          {tower.typicalFloor && <Facts rows={[['Typical floor', tower.typicalFloor.map((u) => `${u.unit}${u.facing}${u.typeCode ? ` ${u.typeCode}` : ''}`).join(' · ')]]} />}
          {samplePlan && sampleType && (
            <div className="rounded-md border border-line p-2">
              <div className="label !text-[10px]">Sample · Type {samplePlan.typeCode} · {samplePlan.sbaSqft.toLocaleString('en-IN')} sq ft</div>
              {price && <div className="mt-1">Indicative <b>{priceTop && priceTop.total > price.total ? `${fmtCr(price.total)} – ${fmtCr(priceTop.total).replace('₹', '')}` : fmtCr(price.total)}</b> <span className="text-fg-muted">(from {fmtInr(price.perSqft)}/sq ft with floor rise{topTier && topTier.rate > 0 ? `; up to ${fmtInr(topTier.rate)}/sq ft more for a preferred location` : ''}; excl. taxes, parking, deposits)</span></div>}
            </div>
          )}
        </div>
      }
      actions={<>
        {stepInside && <button type="button" className="btn btn-primary" onClick={stepInside}>Step inside</button>}
        <button type="button" className="btn" aria-pressed={isolate} onClick={() => setIsolate(!isolate)} title="Hide the floors above and the other towers">Isolate floor</button>
      </>}
    />
  ) : tower ? (
    <InfoCard
      key={`tower-${tower.wing}`}
      eyebrow={`Phase ${tower.phase} · handover ${tower.handover}`}
      title={`Wing ${tower.wing}`}
      badge={<StatusBadge status={tower.provenance.status} title={tower.provenance.source} />}
      lead={`${tower.typicalFloors} typical floors over three basements, ground and a parking level. Pick a floor to see it, or step into a home.`}
      details={<Facts rows={[
        ['Height', `≈ ${(PODIUM_HEIGHT_M + tower.typicalFloors * FLOOR_TO_FLOOR_M).toFixed(0)} m (assumed ${FLOOR_TO_FLOOR_M} m / floor)`],
        ['Footprint', `≈ ${Math.round(ringAreaM2(imageRingToLocal(tower.footprintPx)))} m², traced`],
        ...(sampleType && samplePlan ? [['Drawn plan', `${samplePlan.name} · avg ₹${sampleType.avgPriceCr} Cr`] as [string, string]] : []),
        ['RERA', <span key="r" className="break-all font-mono text-[10px]">{tower.rera}</span>],
      ]} />}
      actions={<>
        {stepInside && <button type="button" className="btn btn-primary" onClick={stepInside}>Step inside</button>}
        <button type="button" className="btn" onClick={() => set({ find: 1 })}>Homes in Wing {tower.wing}</button>
      </>}
    />
  ) : hs ? (
    <InfoCard
      key={`place-${hs.id}`}
      eyebrow={hs.kind === 'club' ? 'Clubhouse' : hs.kind === 'access' ? 'Arrival' : hs.kind === 'future' ? 'Future parcel' : 'Amenity'}
      title={PLACES.find((p) => p.id === hs.id)?.name ?? hs.label.split(' — ')[0]}
      badge={<StatusBadge status={hs.provenance.status} title={hs.provenance.source} />}
      lead={hs.description ?? hs.label.split(' — ')[1] ?? hs.label}
      actions={nextPlace ? <button type="button" className="btn btn-primary" onClick={() => selectPlace(nextPlace.id)}>Next: {nextPlace.name} ›</button> : undefined}
    />
  ) : null);


  // the dock's popups: broader choices live here, out of the way until asked for
  const viewPanel = (
    <div className="flex flex-col gap-3">
      {railExtras}
    <Panel title="View">
      <div className="flex flex-wrap gap-1">
        {([['exterior', 'Orbit'], ['top', 'Top-down'], ['firstPerson', 'Walk']] as [ViewMode, string][]).map(([m, l]) => (
          <button key={m} type="button" className="btn" aria-pressed={mode === m} onClick={() => setMode(m)}>{l}</button>
        ))}
        <button type="button" className="btn" onClick={() => { setResetToken((t) => t + 1); setMode('exterior'); }}>Reset camera</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" className="btn" aria-pressed={labels} onClick={() => setLabels(!labels)}>Labels</button>
        <button type="button" className="btn" aria-pressed={landscape} onClick={() => setLandscape(!landscape)} title="Club, roads, track, field, water, trees and the amenity props from the master plan">Landscape</button>
        <button type="button" className="btn" aria-pressed={sectionOn} onClick={() => setSectionOn(!sectionOn)}>Section cut</button>
        <button type="button" className="btn" aria-pressed={photoreal} disabled={!GOOGLE_MAPS_KEY} title={GOOGLE_MAPS_KEY ? 'Google Photorealistic 3D Tiles around the site (desktop)' : 'Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable'} onClick={() => setPhotoreal(!photoreal)}>Photoreal (Google)</button>
      </div>
      {sectionOn && (
        <label className="mt-2 block text-xs">
          <span className="label">Cut height · {sectionHeight} m (≈ floor {Math.max(0, Math.floor((sectionHeight - PODIUM_HEIGHT_M) / FLOOR_TO_FLOOR_M) + 1)})</span>
          <input type="range" min={2} max={160} step={1} value={sectionHeight} onChange={(e) => setSectionHeight(+e.target.value)} className="w-full" />
        </label>
      )}
      <label className="mt-2 block text-xs">
        <span className="label">Exploded floors · {Math.round(explode * 100)}%</span>
        <input type="range" min={0} max={1} step={0.05} value={explode} onChange={(e) => setExplode(+e.target.value)} className="w-full" />
      </label>
      {photoreal && (
        <label className="mt-2 block text-xs">
          <span className="label">Photoreal ground offset · {photorealOffset > 0 ? '+' : ''}{photorealOffset} m</span>
          <input type="range" min={-60} max={60} step={1} value={photorealOffset} onChange={(e) => setPhotorealOffset(+e.target.value)} className="w-full" />
          <span className="text-[11px] text-fg-muted">Google imagery is © Google and its data providers; the site shows as it was captured (under construction). Lower the site plan opacity to compare.</span>
        </label>
      )}
      <label className="mt-2 block text-xs">
        <span className="label">Site plan opacity · {Math.round(groundOpacity * 100)}%</span>
        <input type="range" min={0} max={1} step={0.05} value={groundOpacity} onChange={(e) => setGroundOpacity(+e.target.value)} className="w-full" />
      </label>
    </Panel>

    <details className="panel p-3">
      <summary className="label cursor-pointer">About this model</summary>
      <ul className="mt-2 space-y-1 text-[11px] text-fg-muted">
        <li><StatusBadge status="approximate" /> Site plan raster scaled from the 90 m ground ({SITE_IMAGE.pxPerMetre} px/m), rotated {SITE_IMAGE.upBearingDeg}° to match OSM.</li>
        <li><StatusBadge status="assumed" /> Floor height {FLOOR_TO_FLOOR_M} m, podium {PODIUM_HEIGHT_M} m, box footprints. No CAD/BIM was supplied.</li>
        <li><StatusBadge status="assumed" /> Landscape: roads, track, field and water are traced from the master plan; One Club mass, the entrance canopy, courts, amphitheatre and rink are standard-size stand-ins at the plan’s legend markers.</li>
        <li><StatusBadge status="source" /> Floor counts, phases, RERA, unit mix from the master plan and sales sheet.</li>
        <li>
          <StatusBadge status={terrain.state === 'ready' ? 'external' : 'unverified'} />{' '}
          {terrain.state === 'loading' && 'Terrain loading (AWS Terrarium DEM)…'}
          {terrain.state === 'failed' && `Terrain unavailable (${terrain.message ?? 'network'}); ground shown flat.`}
          {terrain.state === 'ready' && `Terrain: ${terrain.tiles} DEM tiles, site ≈ ${Math.round(terrain.baseElev ?? 0)} m ASL, ${Math.round(terrain.range?.[0] ?? 0)} to +${Math.round(terrain.range?.[1] ?? 0)} m within 1.8 km. Towers stand on the ground height at their footprint.`}
        </li>
      </ul>
    </details>
    </div>
  );
  const timePanel = <SunPanel date={date} hour={hour} onDate={setDate} onHour={setHour} note="Sun direction computed for the site (NOAA). Towers are massing, so shadows are illustrative." />;
  const placesPanel = (
    <div className="flex flex-col gap-3">
      <ChoiceList items={PLACES.map((p) => ({ key: p.id, label: p.name, active: hotspot === p.id, onClick: () => { selectPlace(p.id); setTab(null); } }))} />
      <div>
        <div className="label px-1 pb-1.5">Towers</div>
        <div className="grid grid-cols-7 gap-1">
          {TOWERS.map((t) => (
            <button key={t.wing} type="button" className="btn h-9 w-9 justify-center justify-self-center p-0" aria-pressed={wing === t.wing} onClick={() => { selectWing(t.wing); setTab(null); }} title={`Wing ${t.wing} · Phase ${t.phase} · handover ${t.handover}`}>{t.wing}</button>
          ))}
        </div>
      </div>
    </div>
  );
  const floorsPanel = tower && (
    <ChoiceList items={Array.from({ length: tower.typicalFloors }, (_, i) => tower.typicalFloors - i).map((f) => ({ key: f, label: `Floor ${f}`, meta: PROJECT.refugeFloors.includes(f) ? 'refuge' : undefined, active: floor === f, onClick: () => { setFloor(f); setTab(null); } }))} />
  );
  const [tab, setTab] = useState<string | null>(null);
  const openTab = finder.active ? 'find' : tab;
  const onOpenTab = (id: string | null) => {
    if (id === 'find') set({ find: 1 });
    else if (finder.active) set({ find: null, flat: null });
    setTab(id === 'find' ? null : id);
  };
  const realmsPanel = (
    <ul className="flex flex-col">
      {realms.map((r) => {
        const n = amenities.filter((a) => a.realm === r.name).length;
        return (
          <li key={r.name}>
            <button type="button" aria-current={realm === r.name ? 'true' : undefined} onClick={() => { selectRealm(r.name); setTab(null); }}
              className={`grid w-full grid-cols-[12px_1fr] gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${realm === r.name ? 'bg-accent/15' : 'hover:bg-white/5'}`}>
              <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: realmColor[r.name] }} aria-hidden />
              <span>
                <span className="flex items-baseline justify-between gap-3"><span className={`text-sm ${realm === r.name ? 'text-accent' : 'text-fg'}`}>{r.name}</span>{n > 0 && <span className="tnum text-[11px] text-fg-muted">{n} places</span>}</span>
                <span className="mt-0.5 block text-xs text-fg-muted">{r.blurb}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
  const tabs: DockTab[] = [
    { id: 'places', label: 'Places', panel: placesPanel },
    { id: 'realms', label: 'Realms', panel: realmsPanel },
    ...(floorsPanel ? [{ id: 'floors', label: 'Floors', panel: floorsPanel }] : []),
    { id: 'find', label: 'Find a home', panel: finder.card },
    { id: 'tour', label: 'Guided tour', onClick: () => set({ tour: 1 }), title: 'Gate → club → stadium → courts → wing, then into a home' },
    { id: 'time', label: 'Sunlight', panel: timePanel },
    { id: 'view', label: 'View', panel: viewPanel },
  ];

  return (
    <div className="absolute inset-0">
      <Canvas shadows camera={{ position: [380, 300, 520], fov: 45, near: 0.5, far: 4000 }} dpr={[1, 1.5]} gl={{ antialias: true, logarithmicDepthBuffer: true, localClippingEnabled: true }} onPointerMissed={() => { selectWing(null); setHotspot(null); setRealm(null); }}>
        <HeadingProbe toBearing={siteBearing} />
        <NavDriver />
        <Suspense fallback={null}>
          <SiteScene mode={mode} onTerrainStatus={setTerrain} photoreal={photoreal} photorealMounted={photorealMounted} photorealOffset={photorealOffset} tourGoal={tourStop ?? placeGoal ?? realmGoal} date={date} hour={hour} selectedWing={wing} onSelectWing={selectWing} selectedHotspot={hotspot} onSelectHotspot={selectPlace} selectedFloor={floor} isolateFloor={isolate} explode={explode} dimWings={finder.dimWings} hideWings={realm && !finder.active ? allWings : null} extraLabels={realmLabels} frameWings={finder.frameWings} sectionHeight={sectionOn ? sectionHeight : null} showLabels={labels} community={landscape} groundOpacity={groundOpacity} resetToken={resetToken} northToken={northToken} autoRotate={intro && tourIndex === null} />
          <Mounted onMount={onSceneMount} />
        </Suspense>
      </Canvas>
      {labels && !intro && (
        <LabelLayer>
          {TOWERS.filter((t) => (!tourStop || tourStop.wing === t.wing) && !realm).map((t) => (
            <DomLabel key={t.wing} id={`wing-${t.wing}`} active={wing === t.wing} onClick={() => selectWing(wing === t.wing ? null : t.wing)} className={realm || finder.dimWings?.includes(t.wing) ? 'opacity-40' : ''}>Wing {t.wing}{finder.active && !UNLABELLED_WINGS.includes(t.wing) ? ` · ${finder.wingCount(t.wing)}` : ''}</DomLabel>
          ))}
          {realmPlaces.map(({ a }) => (
            <DomLabel key={`am-${a.code}`} id={`am-${a.code}`}>
              <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: realmColor[a.realm] }} aria-hidden />{a.name}
            </DomLabel>
          ))}
          {HOTSPOTS.filter((h) => (!tourStop || tourStop.hotspot === h.id) && !finder.active && !realm).map((h) => (
            <DomLabel key={h.id} id={`hs-${h.id}`} active={hotspot === h.id} onClick={() => selectPlace(hotspot === h.id ? null : h.id)}>{h.label.split(' — ')[0]}</DomLabel>
          ))}
        </LabelLayer>
      )}
      <StageLoader ready={sceneReady && terrain.state !== 'loading'} poster="/media/video/clip-03.png" caption="Developer’s elevation render · illustrative" steps={[{ label: 'Building the towers and the site plan', done: sceneReady }, { label: 'Reading the terrain', done: terrain.state !== 'loading' }]} />
      {chrome && mode === 'firstPerson' && (
        <div className="pointer-events-none absolute bottom-[4.4rem] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-fg-muted max-lg:hidden">
          Click to look · WASD to walk · Shift to run · Esc to release
        </div>
      )}

      {chrome && !finder.active && crumbs.length > 1 && <StageTrail crumbs={crumbs} />}
      {chrome && !finder.active && <PeekNext next={nextView}>{card}</PeekNext>}
      {chrome && <Dock current={stepper} tabs={tabs} openTab={openTab} onOpenTab={onOpenTab} extra={<VRButton compact />} />}

      {present && tourIndex === null && <PresentationBar label={tower ? `Wing ${tower.wing}${floor ? ` · Floor ${floor}` : ''}` : 'SOBHA OneWorld · site'} onExit={() => set({ present: null })} />}
      {tourIndex !== null && <TourBar stops={tour} index={Math.min(tourIndex, tour.length - 1)} onIndex={goTourStop} onExit={exitTour} handoff={handoff} />}


    </div>
  );
}
