'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { PIN_COLORS, type GeoLayers, type PoiFeature } from '@/components/geo/GeoMap';
import { GOOGLE_MAPS_KEY } from '@/components/three/GoogleTiles';
import { Panel, Spinner, StatusBadge } from '@/components/ui/primitives';
import { SITE_IMAGE } from '@/data/manifest';
import { INFRASTRUCTURE, POI_DISTANCES } from '@/data/project';
import { formatDistance, haversineM, type LonLat } from '@/lib/geo';
import { useUrlState } from '@/lib/useUrlState';
import { Facts, InfoCard, PeekNext, StageTrail, useStageKeys, type Crumb, type Stepper } from './ContextUI';
import { ChoiceList, Dock, type DockTab } from './Dock';

const GeoMap = dynamic(() => import('@/components/geo/GeoMap').then((m) => m.GeoMap), { ssr: false, loading: () => <div className="grid h-full place-items-center"><Spinner label="Loading map…" /></div> });

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'school', label: 'Schools' }, { key: 'college', label: 'Colleges' }, { key: 'university', label: 'Universities' },
  { key: 'hospital', label: 'Hospitals' }, { key: 'clinic', label: 'Clinics' }, { key: 'mall', label: 'Malls' },
  { key: 'station', label: 'Metro / rail' }, { key: 'toll_booth', label: 'Toll' }, { key: 'construction', label: 'Other projects u/c' },
];
const ALL = CATEGORIES.map((c) => c.key);

/** What a visitor asks about the location; each topic filters the pins and fills the card. */
const TOPICS: { id: string; name: string; cats: string[] }[] = [
  { id: 'overview', name: 'Overview', cats: ALL },
  { id: 'infra', name: 'Connectivity', cats: [] },
  { id: 'education', name: 'Schools & colleges', cats: ['school', 'college', 'university'] },
  { id: 'health', name: 'Healthcare', cats: ['hospital', 'clinic'] },
  { id: 'malls', name: 'Malls', cats: ['mall'] },
  { id: 'transit', name: 'Metro, rail & toll', cats: ['station', 'toll_booth'] },
  { id: 'projects', name: 'Projects nearby', cats: ['construction'] },
  { id: 'ladder', name: 'Brochure distances', cats: ALL },
];

/**
 * Location mode of the stage (`mode=map`): the satellite map fills the stage and the context chrome turns into
 * location analytics. Topics on the left filter the pins and the card answers that topic (counts within 3 / 5 / 7 km,
 * nearest places with straight-line distances, the brochure's own distance ladder, the stated road projects).
 * Layers, categories and the measure tool sit behind View options; a tower clicked on the map opens it in the model.
 */
export default function LocationStage({ keys = true }: { keys?: boolean }) {
  const { set } = useUrlState();
  const [layers, setLayers] = useState<GeoLayers>({ boundary: true, towers: true, pois: true, heatmap: false, rings: true, siteplan: false, terrain: true, buildings: true, google: false, satellite: true, markers3d: true, poiLabels: true });
  const [credits, setCredits] = useState<string[]>([]);
  const [opacity, setOpacity] = useState(0.7);
  const [topic, setTopic] = useState('overview');
  const [cats, setCats] = useState<Set<string>>(new Set(ALL));
  const [measure, setMeasure] = useState(false);
  const [measurePts, setMeasurePts] = useState<LonLat[]>([]);
  const [pois, setPois] = useState<PoiFeature[]>([]);
  const [flyToken, setFlyToken] = useState(0);
  const [status, setStatus] = useState('Loading map…');

  const toggle = (k: keyof GeoLayers) => setLayers((l) => {
    const n = { ...l, [k]: !l[k] };
    // Google's photoreal mesh replaces OSM extrusions and the DEM; the two must not be mixed in one view
    if (k === 'google' && n.google) { n.buildings = false; n.terrain = false; n.towers = false; }
    return n;
  });
  const toggleCat = (k: string) => setCats((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const pickTopic = (id: string) => {
    const t = TOPICS.find((x) => x.id === id) ?? TOPICS[0];
    setTopic(t.id);
    setCats(new Set(t.cats));
    if (t.id === 'ladder') setLayers((l) => ({ ...l, rings: true }));
  };

  const withD = useMemo(() => pois.map((f) => ({ f, d: haversineM(SITE_IMAGE.anchorLonLat, f.geometry.coordinates as LonLat) })).sort((a, b) => a.d - b.d), [pois]);
  const within = (c: string[], km: number) => withD.filter((x) => c.includes(x.f.properties.category) && x.d <= km * 1000).length;
  const nearest = (c: string[], n = 1) => withD.filter((x) => c.includes(x.f.properties.category)).slice(0, n);
  const measured = measurePts.length === 2 ? haversineM(measurePts[0], measurePts[1]) : null;
  const t = TOPICS.find((x) => x.id === topic) ?? TOPICS[0];

  const crumbs: Crumb[] = [{ label: 'SOBHA OneWorld', onClick: () => set({ mode: null }) }, { label: 'Location', onClick: () => pickTopic('overview') }];
  if (t.id !== 'overview') crumbs.push({ label: t.name });
  const ti = TOPICS.indexOf(t);
  const cycleTopic = (d: number) => pickTopic(TOPICS[(ti + d + TOPICS.length) % TOPICS.length].id);
  const stepper: Stepper = { label: t.name, pos: `${ti + 1} / ${TOPICS.length}`, onPrev: () => cycleTopic(-1), onNext: () => cycleTopic(1) };
  useStageKeys({ prev: () => cycleTopic(-1), next: () => cycleTopic(1), back: () => (t.id === 'overview' ? set({ mode: null }) : pickTopic('overview')) }, keys);


  const ladder = (rows: { name: string; d: string }[]) => (
    <ul className="space-y-0.5">{rows.map((r, i) => <li key={`${r.name}-${i}`} className="flex justify-between gap-3"><span className="min-w-0 truncate">{r.name}</span><span className="tnum shrink-0 font-mono text-fg-muted">{r.d}</span></li>)}</ul>
  );
  const counts = (c: string[]) => <div className="flex gap-4">{[3, 5, 7].map((km) => <span key={km}><b className="tnum text-sm text-fg">{within(c, km)}</b> <span className="text-fg-muted">within {km} km</span></span>)}</div>;
  const osmBadge = <StatusBadge status="external" title="OpenStreetMap via Overpass, fetched 2026-10-18" />;
  const osmNote = <p className="mt-2 text-[11px] text-fg-muted">Straight-line distances from the site centroid, from OpenStreetMap (ODbL); absence on the map is not proof of absence. No travel times: no routing service is configured.</p>;

  let card: React.ReactNode;
  if (!pois.length && t.id !== 'ladder' && t.id !== 'infra') {
    card = <InfoCard key="loading" eyebrow="Location" title={t.name} lead={<Spinner label="Reading points of interest…" />} />;
  } else if (t.id === 'overview') {
    const st = nearest(['station'])[0]; const ho = nearest(['hospital'])[0]; const ma = nearest(['mall'])[0]; const to = nearest(['toll_booth'])[0];
    card = (
      <InfoCard key="overview" eyebrow="Old Madras Road · Greater Whitefield" title="Around the site" badge={osmBadge}
        lead={`${within(['school', 'college', 'university'], 5)} schools and colleges and ${within(['hospital', 'clinic'], 5)} hospitals and clinics within 5 km. Pick a topic for the detail.`}
        details={<>
          <Facts rows={[
            ...(st ? [['Metro / rail', `${st.f.properties.name} · ${formatDistance(st.d)}`] as [string, string]] : []),
            ...(ho ? [['Hospital', `${ho.f.properties.name} · ${formatDistance(ho.d)}`] as [string, string]] : []),
            ...(ma ? [['Mall', `${ma.f.properties.name} · ${formatDistance(ma.d)}`] as [string, string]] : []),
            ...(to ? [['Hoskote toll', formatDistance(to.d)] as [string, string]] : []),
          ]} />
          {osmNote}
        </>}
      />
    );
  } else if (t.id === 'ladder') {
    card = (
      <InfoCard key="ladder" eyebrow="As the brochure states" title="Brochure distances" badge={<StatusBadge status="source" />}
        lead="The brochure gives distances, not positions or bearings, so they show as the rings on the map only."
        details={ladder(POI_DISTANCES.map((d) => ({ name: d.name, d: `${d.km} km` })))} detailsOpen
      />
    );
  } else if (t.id === 'infra') {
    card = (
      <InfoCard key="infra" eyebrow="Connectivity, as stated" title="Roads and metro" badge={<StatusBadge status="source" />}
        lead="Brochure claims. Alignments are not drawn and no travel times are computed: no official geometry or routing service was supplied."
        details={<ul className="space-y-1.5">{INFRASTRUCTURE.map((i) => <li key={i.name}><b className="text-fg">{i.name}</b><div className="text-fg-muted">{i.detail} · {i.status}</div></li>)}</ul>} detailsOpen
      />
    );
  } else {
    const list = nearest(t.cats, 8);
    card = (
      <InfoCard key={t.id} eyebrow="Location" title={t.name} badge={osmBadge}
        lead={t.id === 'projects' ? 'Other residential and commercial projects tagged as under construction in OpenStreetMap.' : counts(t.cats)}
        details={<>{ladder(list.map((x) => ({ name: x.f.properties.name, d: formatDistance(x.d) })))}{osmNote}</>} detailsOpen
      />
    );
  }

  const layersPanel = (
    <div className="flex flex-col gap-3">
    <Panel title="Layers">
      <div className="grid grid-cols-2 gap-1 text-xs">
        {([['boundary', 'Site boundary'], ['towers', 'Towers (3D)'], ['buildings', 'OSM buildings'], ['terrain', 'Hillshade'], ['pois', 'Points of interest'], ['heatmap', 'Amenity density'], ['rings', 'Distance rings'], ['siteplan', 'Site plan overlay'], ['satellite', 'Satellite (Esri, dev use)'], ['markers3d', 'POI pins'], ['poiLabels', 'POI labels'], ['google', 'Photoreal 3D (Google)']] as [keyof GeoLayers, string][]).map(([k, l]) => (
          <label key={k} className={`flex items-center gap-1.5 ${k === 'google' && !GOOGLE_MAPS_KEY ? 'opacity-50' : ''}`} title={k === 'google' && !GOOGLE_MAPS_KEY ? 'Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable' : undefined}><input type="checkbox" checked={layers[k]} disabled={k === 'google' && !GOOGLE_MAPS_KEY} onChange={() => toggle(k)} />{l}</label>
        ))}
      </div>
      {layers.google && <p className="mt-2 text-[11px] text-fg-muted">Google Photorealistic 3D Tiles. Imagery © Google{credits.length ? `, ${credits.join(', ')}` : ''}. Shown without OSM buildings, terrain or tower massing.</p>}
      {layers.siteplan && (
        <label className="mt-2 block text-xs">
          <span className="label">Overlay opacity · {Math.round(opacity * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="w-full" />
          <p className="mt-1 text-[11px] text-fg-muted">Overlay uses {SITE_IMAGE.pxPerMetre} px/m, up-bearing {SITE_IMAGE.upBearingDeg}°, anchored at the OSM centroid. Compare with the boundary to judge the fit. <StatusBadge status="approximate" /></p>
        </label>
      )}
    </Panel>
    <Panel title="Points of interest" right={osmBadge}>
      <div className="grid grid-cols-2 gap-1 text-xs">
        {CATEGORIES.map((c) => (
          <label key={c.key} className="flex items-center gap-1.5"><input type="checkbox" checked={cats.has(c.key)} onChange={() => toggleCat(c.key)} />{c.label}</label>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-fg-muted">{pois.length} features from OpenStreetMap (ODbL). Completeness depends on OSM coverage.</p>
    </Panel>
    </div>
  );
  const [tab, setTab] = useState<string | null>(null);
  const tabs: DockTab[] = [
    { id: 'topics', label: 'Topics', panel: <ChoiceList items={TOPICS.map((x) => ({ key: x.id, label: x.name, meta: x.cats.length && x.cats !== ALL && pois.length ? within(x.cats, 7) || undefined : undefined, active: topic === x.id, onClick: () => { pickTopic(x.id); setTab(null); } }))} /> },
    { id: 'layers', label: 'Layers', panel: layersPanel },
    { id: 'measure', label: measure ? (measured !== null ? formatDistance(measured) : 'Click two points') : 'Measure', pressed: measure, onClick: () => { setMeasure(!measure); setMeasurePts([]); } },
    { id: 'fly', label: 'Fly to site', onClick: () => setFlyToken((k) => k + 1) },
    { id: '3d', label: '3D site', onClick: () => set({ mode: null }), title: 'Back to the 3D site model' },
  ];

  return (
    <div className="absolute inset-0">
      <GeoMap layers={layers} siteplanOpacity={opacity} poiCategories={cats} measureMode={measure} measurePoints={measurePts} onMeasurePointsChange={setMeasurePts} onPoiData={setPois} onCredits={setCredits} onTowerClick={(w) => set({ mode: null, wing: w })} flyToken={flyToken} onStatus={setStatus} />
      {status && <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded bg-black/70 px-2 py-1 text-[11px] text-warn max-lg:top-14">{status}</div>}

      {/* legend under the top bar on wide screens (the map's attribution owns the bottom corners) */}
      <div className="pointer-events-none absolute right-3 top-16 z-20 rounded-lg bg-black/70 p-2 text-[11px] max-lg:hidden">
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {([['education', 'Education'], ['healthcare', 'Healthcare'], ['mall', 'Malls'], ['station', 'Metro / rail'], ['toll_booth', 'Toll'], ['construction', 'Projects u/c']] as [string, string][]).map(([k, l]) => (
            <span key={k}><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full border border-white/70" style={{ background: PIN_COLORS[k] }} />{l}</span>
          ))}
        </div>
      </div>

      {keys && <StageTrail crumbs={crumbs} />}
      {keys && <PeekNext next={{ label: TOPICS[(ti + 1) % TOPICS.length].name, onClick: () => cycleTopic(1) }}>{card}</PeekNext>}
      {keys && <Dock current={stepper} tabs={tabs} openTab={tab} onOpenTab={setTab} />}



    </div>
  );
}
