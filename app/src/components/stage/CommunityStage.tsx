'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { DomLabel, LabelLayer } from '@/components/three/DomLabels';
import { SiteScene, type SiteTerrainStatus, type ViewMode } from '@/components/three/SiteScene';
import { Panel, ProvenanceNote, Spinner, StatusBadge } from '@/components/ui/primitives';
import { PresentationBar } from '@/components/ui/PresentationBar';
import { TourBar } from '@/components/ui/TourBar';
import { GOOGLE_MAPS_KEY } from '@/components/three/GoogleTiles';
import { siteTour, siteTourHandoff } from '@/lib/tour';
import { useUrlState } from '@/lib/useUrlState';
import { PLANS, SITE_IMAGE } from '@/data/manifest';
import { FLOOR_TO_FLOOR_M, HOTSPOTS, PODIUM_HEIGHT_M, PROJECT, TOWERS, UNIT_TYPES } from '@/data/project';
import { imageRingToLocal, ringAreaM2 } from '@/lib/geo';
import { indicativePrice } from '@/lib/pricing';
import { fmtCr, fmtInr } from '@/lib/scale';
import { SITE_ORIGIN } from '@/data/sobha/siteFrame';
import { istDay, istHoursNow, istTodayYmd, sunPosition, istDate, sunTimes } from '@/lib/solar';
import { NavDriver } from './NavDriver';
import { HeadingProbe, siteBearing } from './HeadingProbe';

/**
 * Community mode of the stage: the site model. Shareable state (wing, floor, tour, present) is read
 * from the URL every render; only view toggles live in local state. The stage owns the mode switch,
 * compass, VR / tour / present actions; this component owns the scene, its control rail and labels.
 */
export default function CommunityStage({ rail, resetToken: northToken }: { rail: boolean; resetToken: number }) {
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
  const exitTour = () => set({ tour: null });
  const goTourStop = (i: number) => {
    const s = tour[Math.max(0, Math.min(i, tour.length - 1))];
    setTourIndex(tour.indexOf(s));
    setHotspot(s.hotspot ?? null);
    if (s.wing) set({ wing: s.wing });
  };
  const hand = siteTourHandoff(tourWing);
  const handoff = hand ? { label: hand.label, onClick: () => set({ mode: 'home', plan: hand.plan, wing: tourWing, flat: null, floor: hand.floor, tour: 'rooms' }) } : null;
  const selectWing = (w: number | null) => { if (w === null) setIsolate(false); set({ wing: w, ...(w === null ? { floor: null } : {}) }); };
  const setFloor = (f: number | null) => set({ floor: f });

  const tower = wing !== null ? TOWERS.find((t) => t.wing === wing) ?? null : null;
  const hs = hotspot ? HOTSPOTS.find((h) => h.id === hotspot) ?? null : null;
  const samplePlan = tower?.samplePlanId ? PLANS.find((p) => p.id === tower.samplePlanId) : null;
  const sampleType = samplePlan ? UNIT_TYPES.find((u) => u.code === samplePlan.typeCode) : null;
  const price = samplePlan && floor ? indicativePrice(samplePlan.sbaSqft, floor + 1, plc) : null; // floor 1 typical ≈ 2nd storey band
  const showRail = rail && !present && tourIndex === null;

  return (
    <div className="absolute inset-0">
      <Canvas shadows camera={{ position: [380, 300, 520], fov: 45, near: 0.5, far: 4000 }} dpr={[1, 1.5]} gl={{ antialias: true, logarithmicDepthBuffer: true, localClippingEnabled: true }} onPointerMissed={() => { selectWing(null); setHotspot(null); }}>
        <HeadingProbe toBearing={siteBearing} />
        <NavDriver />
        <Suspense fallback={null}>
          <SiteScene mode={mode} onTerrainStatus={setTerrain} photoreal={photoreal} photorealMounted={photorealMounted} photorealOffset={photorealOffset} tourGoal={tourStop} date={date} hour={hour} selectedWing={wing} onSelectWing={selectWing} selectedHotspot={hotspot} onSelectHotspot={setHotspot} selectedFloor={floor} isolateFloor={isolate} explode={explode} sectionHeight={sectionOn ? sectionHeight : null} showLabels={labels} community={landscape} groundOpacity={groundOpacity} resetToken={resetToken} northToken={northToken} />
        </Suspense>
      </Canvas>
      {labels && (
        <LabelLayer>
          {TOWERS.filter((t) => !tourStop || tourStop.wing === t.wing).map((t) => (
            <DomLabel key={t.wing} id={`wing-${t.wing}`} active={wing === t.wing} onClick={() => selectWing(wing === t.wing ? null : t.wing)}>Wing {t.wing}</DomLabel>
          ))}
          {HOTSPOTS.filter((h) => !tourStop || tourStop.hotspot === h.id).map((h) => (
            <DomLabel key={h.id} id={`hs-${h.id}`} active={hotspot === h.id} onClick={() => setHotspot(hotspot === h.id ? null : h.id)}>{h.label.split(' — ')[0]}</DomLabel>
          ))}
        </LabelLayer>
      )}
      <div className="pointer-events-none absolute bottom-4 left-3 z-20 rounded bg-black/60 px-2 py-1 text-[11px] text-fg-muted max-lg:hidden">
        {mode === 'firstPerson' ? 'Click to look · WASD to walk · Shift to run · Esc to release' : 'Drag to orbit · right-drag to pan · scroll to zoom · click a tower'}
      </div>
      <Suspense fallback={<div className="absolute inset-0 grid place-items-center"><Spinner label="Loading site…" /></div>} />

      {present && tourIndex === null && <PresentationBar label={tower ? `Wing ${tower.wing}${floor ? ` · Floor ${floor}` : ''}` : 'SOBHA OneWorld · site'} current={null} target="explore" onExit={() => set({ present: null })} />}
      {tourIndex !== null && <TourBar stops={tour} index={Math.min(tourIndex, tour.length - 1)} onIndex={goTourStop} onExit={exitTour} handoff={handoff} />}

      {showRail && <aside className="rail scroll-thin" aria-label="Site controls">
        <Panel title="View">
          <div className="flex flex-wrap gap-1">
            {([['exterior', 'Exterior'], ['top', 'Top-down'], ['firstPerson', 'Walk']] as [ViewMode, string][]).map(([m, l]) => (
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
          <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-2 text-xs">
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

        <Panel title="Towers">
          <div className="grid grid-cols-7 gap-1">
            {TOWERS.map((t) => (
              <button key={t.wing} type="button" className="btn justify-center px-0" aria-pressed={wing === t.wing} onClick={() => selectWing(wing === t.wing ? null : t.wing)} title={`Wing ${t.wing} · Phase ${t.phase}`}>{t.wing}</button>
            ))}
          </div>
          {tower && (
            <div className="mt-3 space-y-2 text-xs">
              <div className="text-sm text-fg">Wing {tower.wing} · Phase {tower.phase}</div>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                <dt className="label">Floors</dt><dd>3B + G + 1 parking + {tower.typicalFloors} typical</dd>
                <dt className="label">Height (model)</dt><dd>{(PODIUM_HEIGHT_M + tower.typicalFloors * FLOOR_TO_FLOOR_M).toFixed(0)} m (assumed {FLOOR_TO_FLOOR_M} m / floor)</dd>
                <dt className="label">Handover</dt><dd>{tower.handover}</dd>
                <dt className="label">RERA</dt><dd className="break-all font-mono text-[10px]">{tower.rera}</dd>
                <dt className="label">Footprint</dt><dd>≈ {Math.round(ringAreaM2(imageRingToLocal(tower.footprintPx)))} m² · traced from raster</dd>
              </dl>
              <label className="block">
                <span className="label">Floor</span>
                <div className="flex gap-1">
                  <input type="range" min={1} max={tower.typicalFloors} value={floor ?? 1} onChange={(e) => setFloor(+e.target.value)} className="w-full" aria-label="Floor" />
                  <span className="w-8 text-right font-mono">{floor ?? '–'}</span>
                </div>
              </label>
              <div className="flex flex-wrap gap-1">
                <button type="button" className="btn" aria-pressed={isolate} disabled={floor === null} onClick={() => setIsolate(!isolate)}>Isolate floor</button>
                <button type="button" className="btn" onClick={() => setFloor(null)}>Clear floor</button>
              </div>
              {floor !== null && PROJECT.refugeFloors.includes(floor) && <p className="text-warn">Floor {floor} carries refuge units.</p>}
              {tower.typicalFloor && (
                <div>
                  <span className="label">Typical floor (sales sheet)</span>
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {tower.typicalFloor.map((u) => (
                      <li key={u.unit} className="rounded border border-line px-1.5 py-0.5 font-mono">{u.unit}{u.facing}{u.typeCode ? ` · ${u.typeCode}` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
              {samplePlan && sampleType && (
                <div className="rounded-md border border-line p-2">
                  <div className="label">Sample unit · Type {samplePlan.typeCode}</div>
                  <div>{samplePlan.name} · {samplePlan.sbaSqft.toLocaleString()} sq ft SBA · avg {sampleType.avgPriceCr} Cr</div>
                  {floor !== null && (
                    <div className="mt-1">
                      <label className="label">PLC tier <select value={plc} onChange={(e) => setPlc(e.target.value)} className="ml-1 rounded border border-line bg-bg-2 px-1 text-xs">{['Select', 'Prime', 'Prime+', 'Elite', 'Elite+', 'Grande+'].map((t) => <option key={t}>{t}</option>)}</select></label>
                      {price && <div className="mt-1">Indicative at floor {floor}: <b>{fmtCr(price.total)}</b> <span className="text-fg-muted">({fmtInr(price.perSqft)}/sq ft incl. FRC + PLC; excl. taxes, parking, deposits)</span></div>}
                    </div>
                  )}
                  <button type="button" className="btn mt-2" onClick={() => set({ mode: 'home', plan: samplePlan.id, wing: tower.wing, flat: null, floor })}>Step inside · 1:1 home</button>
                </div>
              )}
              <ProvenanceNote p={tower.provenance} />
            </div>
          )}
          {!tower && <p className="mt-2 text-[11px] text-fg-muted">Click a tower in the scene or a number above.</p>}
        </Panel>

        {hs && (
          <Panel title="Hotspot" right={<button type="button" className="btn" onClick={() => setHotspot(null)}>×</button>}>
            <div className="text-sm">{hs.label}</div>
            {hs.description && <p className="mt-1 text-xs text-fg-muted">{hs.description}</p>}
            <div className="mt-2"><ProvenanceNote p={hs.provenance} /></div>
          </Panel>
        )}

        <Panel title="Model status">
          <ul className="space-y-1 text-[11px] text-fg-muted">
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
        </Panel>
      </aside>}
    </div>
  );
}
