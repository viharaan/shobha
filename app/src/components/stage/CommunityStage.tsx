'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { DomLabel, LabelLayer } from '@/components/three/DomLabels';
import { SiteScene, type SiteTerrainStatus, type ViewMode } from '@/components/three/SiteScene';
import { Panel, StatusBadge } from '@/components/ui/primitives';
import { PresentationBar } from '@/components/ui/PresentationBar';
import { TourBar } from '@/components/ui/TourBar';
import { GOOGLE_MAPS_KEY } from '@/components/three/GoogleTiles';
import { placeStop, siteTour, siteTourHandoff } from '@/lib/tour';
import { useUrlState } from '@/lib/useUrlState';
import { UNLABELLED_WINGS } from '@/data/sobha/flats/directory';
import { PLANS, SITE_IMAGE } from '@/data/manifest';
import { FLOOR_TO_FLOOR_M, HOTSPOTS, PODIUM_HEIGHT_M, PROJECT, TOWERS, UNIT_TYPES } from '@/data/project';
import { imageRingToLocal, ringAreaM2 } from '@/lib/geo';
import { indicativePrice } from '@/lib/pricing';
import { fmtCr, fmtInr } from '@/lib/scale';
import { SITE_ORIGIN } from '@/data/sobha/siteFrame';
import { istDay, istHoursNow, istTodayYmd, sunPosition, istDate, sunTimes } from '@/lib/solar';
import { ContextColumn, Facts, InfoCard, PlaceGroup, PlaceItem, type Crumb } from './ContextUI';
import { NavDriver } from './NavDriver';
import { StageLoader } from './StageLoader';
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
export default function CommunityStage({ rail, resetToken: northToken, intro = false }: { rail: boolean; resetToken: number; intro?: boolean }) {
  const { params, set, num } = useUrlState();
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
  const [isolate, setIsolate] = useState(false);
  const [explode, setExplode] = useState(0);
  const [sectionOn, setSectionOn] = useState(false);
  const [sectionHeight, setSectionHeight] = useState(60);
  const [labels, setLabels] = useState(true);
  const [landscape, setLandscape] = useState(true);
  const [groundOpacity, setGroundOpacity] = useState(1);
  const [resetToken, setResetToken] = useState(0);
  const [plc, setPlc] = useState('Select');
  const [date, setDate] = useState(() => istTodayYmd());
  // first view in daylight: the live IST hour when the sun is up, else mid-morning ("Now (IST)" restores the clock)
  const [hour, setHour] = useState(() => { const h = Math.round(istHoursNow() * 2) / 2; return h >= 7 && h <= 17.5 ? h : 10.5; });
  const sunNow = sunPosition(istDate(istDay(date), hour), SITE_ORIGIN.lat, SITE_ORIGIN.lng);
  const times = sunTimes(istDay(date), SITE_ORIGIN.lat, SITE_ORIGIN.lng);
  const hhmm = (h: number | null) => (h === null ? '–' : `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`);

  const tourWing = wing ?? 1;
  const tour = useMemo(() => siteTour(tourWing), [tourWing]);
  const tourStop = tourIndex !== null ? tour[Math.min(tourIndex, tour.length - 1)] : null;
  // a place picked outside the tour glides the camera to the tour's pose for it
  const placeGoal = useMemo(() => (hotspot && tourIndex === null ? placeStop(hotspot, tourWing) : null), [hotspot, tourIndex, tourWing]);
  const exitTour = () => set({ tour: null });
  const goTourStop = (i: number) => {
    const s = tour[Math.max(0, Math.min(i, tour.length - 1))];
    setTourIndex(tour.indexOf(s));
    setHotspot(s.hotspot ?? null);
    if (s.wing) set({ wing: s.wing });
  };
  const hand = siteTourHandoff(tourWing);
  const handoff = hand ? { label: hand.label, onClick: () => set({ mode: 'home', plan: hand.plan, wing: tourWing, flat: null, floor: hand.floor, tour: 'rooms' }) } : null;
  const selectWing = (w: number | null) => { if (w === null) setIsolate(false); setHotspot(null); set({ wing: w, ...(w === null || w !== wing ? { floor: null } : {}) }); };
  const selectPlace = (id: string | null) => { setIsolate(false); setHotspot(id); if (id && wing !== null) set({ wing: null, floor: null }); };
  const setFloor = (f: number | null) => { if (f === null) setIsolate(false); set({ floor: f }); };

  const finder = useFinder({ selectWing });
  const tower = wing !== null ? TOWERS.find((t) => t.wing === wing) ?? null : null;
  const hs = hotspot ? HOTSPOTS.find((h) => h.id === hotspot) ?? null : null;
  const samplePlan = tower?.samplePlanId ? PLANS.find((p) => p.id === tower.samplePlanId) : null;
  const sampleType = samplePlan ? UNIT_TYPES.find((u) => u.code === samplePlan.typeCode) : null;
  const price = samplePlan && floor ? indicativePrice(samplePlan.sbaSqft, floor + 1, plc) : null; // floor 1 typical ≈ 2nd storey band
  const showRail = rail && !present && tourIndex === null;
  const chrome = !present && tourIndex === null && !intro;
  const stepInside = samplePlan && tower ? () => set({ mode: 'home', plan: samplePlan.id, wing: tower.wing, flat: null, floor }) : null;

  // where you are: site → a place, or site → tower → floor
  const crumbs: Crumb[] = [{ label: 'SOBHA OneWorld', onClick: () => { selectPlace(null); selectWing(null); } }];
  if (hs) crumbs.push({ label: PLACES.find((p) => p.id === hs.id)?.name ?? hs.label.split(' — ')[0] });
  if (tower) crumbs.push({ label: `Wing ${tower.wing}`, onClick: () => setFloor(null) });
  if (tower && floor !== null) crumbs.push({ label: `Floor ${floor}` });

  const placeIdx = hs ? PLACES.findIndex((p) => p.id === hs.id) : -1;
  const nextPlace = placeIdx >= 0 ? PLACES[(placeIdx + 1) % PLACES.length] : null;

  const nav = tower ? (
    <PlaceGroup title={`Floors · ${tower.typicalFloors} typical`} className="min-h-0">
      {Array.from({ length: tower.typicalFloors }, (_, i) => tower.typicalFloors - i).map((f) => (
        <PlaceItem key={f} active={floor === f} onClick={() => setFloor(floor === f ? null : f)} meta={PROJECT.refugeFloors.includes(f) ? 'refuge' : undefined}>Floor {f}</PlaceItem>
      ))}
    </PlaceGroup>
  ) : (
    <>
      <PlaceGroup title="Places">
        {PLACES.map((p) => (
          <PlaceItem key={p.id} active={hotspot === p.id} onClick={() => selectPlace(hotspot === p.id ? null : p.id)}>{p.name}</PlaceItem>
        ))}
        {TOWERS.map((t) => (
          <PlaceItem key={t.wing} className="lg:hidden" onClick={() => selectWing(t.wing)}>Wing {t.wing}</PlaceItem>
        ))}
      </PlaceGroup>
      <div className="max-lg:hidden">
        <div className="label px-1 pb-1 pt-1.5">Towers</div>
        <div className="grid grid-cols-7 gap-1">
          {TOWERS.map((t) => (
            <button key={t.wing} type="button" className="btn justify-center px-0" onClick={() => selectWing(t.wing)} title={`Wing ${t.wing} · Phase ${t.phase} · handover ${t.handover}`}>{t.wing}</button>
          ))}
        </div>
      </div>
    </>
  );

  const card = tower && floor !== null ? (
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
              <label className="mt-1 block text-[11px] text-fg-muted">PLC tier <select value={plc} onChange={(e) => setPlc(e.target.value)} className="ml-1 rounded border border-line bg-bg-2 px-1 text-xs">{['Select', 'Prime', 'Prime+', 'Elite', 'Elite+', 'Grande+'].map((t) => <option key={t}>{t}</option>)}</select></label>
              {price && <div className="mt-1">Indicative <b>{fmtCr(price.total)}</b> <span className="text-fg-muted">({fmtInr(price.perSqft)}/sq ft incl. floor rise + PLC; excl. taxes, parking, deposits)</span></div>}
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
      details={hs.provenance.source ? <p className="text-[11px] text-fg-muted"><span className="label !text-[10px]">Source</span> {hs.provenance.source}. Shapes in the model are standard-size stand-ins at the plan’s markers.</p> : undefined}
      actions={nextPlace ? <button type="button" className="btn btn-primary" onClick={() => selectPlace(nextPlace.id)}>Next: {nextPlace.name} ›</button> : undefined}
    />
  ) : (
    <InfoCard
      key="site"
      eyebrow="Greater Whitefield · Old Madras Road"
      title="SOBHA OneWorld"
      badge={<StatusBadge status="source" title="Master plan and sales sheet" />}
      lead={`${PROJECT.siteAreaAcres} acres, ${PROJECT.totalWings} wings and ${PROJECT.totalUnits.toLocaleString('en-IN')} homes around a sunken stadium. Pick a place or a tower to go there.`}
      actions={<>
        <button type="button" className="btn btn-primary" onClick={() => set({ find: 1 })}>Find a home</button>
        <button type="button" className="btn" onClick={() => set({ mode: 'map' })}>Location</button>
      </>}
    />
  );

  return (
    <div className="absolute inset-0">
      <Canvas shadows camera={{ position: [380, 300, 520], fov: 45, near: 0.5, far: 4000 }} dpr={[1, 1.5]} gl={{ antialias: true, logarithmicDepthBuffer: true, localClippingEnabled: true }} onPointerMissed={() => { selectWing(null); setHotspot(null); }}>
        <HeadingProbe toBearing={siteBearing} />
        <NavDriver />
        <Suspense fallback={null}>
          <SiteScene mode={mode} onTerrainStatus={setTerrain} photoreal={photoreal} photorealMounted={photorealMounted} photorealOffset={photorealOffset} tourGoal={tourStop ?? placeGoal} date={date} hour={hour} selectedWing={wing} onSelectWing={selectWing} selectedHotspot={hotspot} onSelectHotspot={selectPlace} selectedFloor={floor} isolateFloor={isolate} explode={explode} dimWings={finder.dimWings} sectionHeight={sectionOn ? sectionHeight : null} showLabels={labels} community={landscape} groundOpacity={groundOpacity} resetToken={resetToken} northToken={northToken} autoRotate={intro && tourIndex === null} />
          <Mounted onMount={onSceneMount} />
        </Suspense>
      </Canvas>
      {labels && !intro && (
        <LabelLayer>
          {TOWERS.filter((t) => !tourStop || tourStop.wing === t.wing).map((t) => (
            <DomLabel key={t.wing} id={`wing-${t.wing}`} active={wing === t.wing} onClick={() => selectWing(wing === t.wing ? null : t.wing)} className={finder.dimWings?.includes(t.wing) ? 'opacity-40' : ''}>Wing {t.wing}{finder.active && !UNLABELLED_WINGS.includes(t.wing) ? ` · ${finder.wingCount(t.wing)}` : ''}</DomLabel>
          ))}
          {HOTSPOTS.filter((h) => (!tourStop || tourStop.hotspot === h.id) && !finder.active).map((h) => (
            <DomLabel key={h.id} id={`hs-${h.id}`} active={hotspot === h.id} onClick={() => selectPlace(hotspot === h.id ? null : h.id)}>{h.label.split(' — ')[0]}</DomLabel>
          ))}
        </LabelLayer>
      )}
      <StageLoader ready={sceneReady && terrain.state !== 'loading'} poster="/media/video/clip-03.png" caption="Developer’s elevation render · illustrative" steps={[{ label: 'Building the towers and the site plan', done: sceneReady }, { label: 'Reading the terrain', done: terrain.state !== 'loading' }]} />
      {chrome && (
        <div className="pointer-events-none absolute bottom-[4.4rem] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-fg-muted max-lg:hidden">
          {mode === 'firstPerson' ? 'Click to look · WASD to walk · Shift to run · Esc to release' : 'Drag to orbit · right-drag to pan · scroll to zoom · click a tower or a place'}
        </div>
      )}

      {chrome && (finder.active
        ? <ContextColumn crumbs={finder.crumbs} nav={finder.nav} card={finder.card} hideCard={showRail} />
        : <ContextColumn crumbs={crumbs} nav={nav} card={card} hideCard={showRail} />)}

      {present && tourIndex === null && <PresentationBar label={tower ? `Wing ${tower.wing}${floor ? ` · Floor ${floor}` : ''}` : 'SOBHA OneWorld · site'} current={null} target="explore" onExit={() => set({ present: null })} />}
      {tourIndex !== null && <TourBar stops={tour} index={Math.min(tourIndex, tour.length - 1)} onIndex={goTourStop} onExit={exitTour} handoff={handoff} />}

      {showRail && <aside className="rail scroll-thin" aria-label="View options">
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

        <Panel title="Sun and time">
          <div className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-line bg-bg-2 px-2 py-1 text-xs" aria-label="Date (IST)" />
            <label className="block">
              <span className="label">Sun · {hhmm(hour)} IST</span>
              <input type="range" min={5} max={20} step={0.5} value={hour} onChange={(e) => setHour(parseFloat(e.target.value))} className="w-full" aria-label="Hour of day (IST)" />
            </label>
            <button type="button" className="btn col-span-2 justify-center" onClick={() => { setDate(istTodayYmd()); setHour(Math.min(20, Math.max(5, Math.round(istHoursNow() * 2) / 2))); }}>Now (IST)</button>
          </div>
          <p className="mt-1 text-[11px] text-fg-muted">
            Sun {sunNow.altitudeDeg < 0 ? 'below the horizon' : `${Math.round(sunNow.altitudeDeg)}° up, bearing ${Math.round(sunNow.azimuthDeg)}°`} · sunrise {hhmm(times.sunrise)} · sunset {hhmm(times.sunset)}.
            Direction is computed for the site (NOAA); towers are massing, so shadows are illustrative.
          </p>
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
      </aside>}
    </div>
  );
}
