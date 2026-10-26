'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { PIN_COLORS, type GeoLayers, type PoiFeature } from '@/components/geo/GeoMap';
import { Panel, Spinner, StatusBadge } from '@/components/ui/primitives';
import { SITE_IMAGE } from '@/data/manifest';
import { GOOGLE_MAPS_KEY } from '@/components/three/GoogleTiles';
import { INFRASTRUCTURE, POI_DISTANCES } from '@/data/project';
import { formatDistance, haversineM, type LonLat } from '@/lib/geo';
import { scrollToSection, useUrlState } from '@/lib/useUrlState';

const GeoMap = dynamic(() => import('@/components/geo/GeoMap').then((m) => m.GeoMap), { ssr: false, loading: () => <div className="grid h-full place-items-center"><Spinner label="Loading map…" /></div> });

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'school', label: 'Schools' }, { key: 'college', label: 'Colleges' }, { key: 'university', label: 'Universities' },
  { key: 'hospital', label: 'Hospitals' }, { key: 'clinic', label: 'Clinics' }, { key: 'mall', label: 'Malls' },
  { key: 'station', label: 'Metro / rail' }, { key: 'toll_booth', label: 'Toll' }, { key: 'construction', label: 'Other projects u/c' },
];

export default function LocationSection() {
  const { set } = useUrlState();
  const [layers, setLayers] = useState<GeoLayers>({ boundary: true, towers: true, pois: true, heatmap: false, rings: true, siteplan: false, terrain: true, buildings: true, google: false, satellite: true, markers3d: true, poiLabels: true });
  const [credits, setCredits] = useState<string[]>([]);
  const [opacity, setOpacity] = useState(0.7);
  const [cats, setCats] = useState<Set<string>>(new Set(CATEGORIES.map((c) => c.key)));
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

  const insights = useMemo(() => {
    const withD = pois.map((f) => ({ f, d: haversineM(SITE_IMAGE.anchorLonLat, f.geometry.coordinates as LonLat) }));
    const count = (cat: string[], km: number) => withD.filter((x) => cat.includes(x.f.properties.category) && x.d <= km * 1000).length;
    const nearest = (cat: string[]) => withD.filter((x) => cat.includes(x.f.properties.category)).sort((a, b) => a.d - b.d)[0];
    return {
      schools: [3, 5, 7].map((km) => ({ km, n: count(['school', 'college', 'university'], km) })),
      health: [3, 5, 7].map((km) => ({ km, n: count(['hospital', 'clinic'], km) })),
      nearestStation: nearest(['station']),
      nearestHospital: nearest(['hospital']),
      nearestMall: nearest(['mall']),
      toll: nearest(['toll_booth']),
      projects: withD.filter((x) => x.f.properties.category === 'construction').sort((a, b) => a.d - b.d).slice(0, 8),
    };
  }, [pois]);

  const measured = measurePts.length === 2 ? haversineM(measurePts[0], measurePts[1]) : null;

  return (
    <div>
      <header className="mb-6">
        <h2 className="eyebrow">Location</h2>
        <p className="display mt-1 text-3xl md:text-4xl">Old Madras Road, as mapped</p>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">Schools, hospitals, malls and metro around the site from OpenStreetMap, with straight-line distances. Click a tower on the map to select it on the stage.</p>
      </header>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
      <aside className="scroll-thin flex flex-col gap-3 max-lg:order-last lg:max-h-[72vh] lg:overflow-y-auto">
        <Panel title="Layers" right={<button type="button" className="btn" onClick={() => setFlyToken((t) => t + 1)}>Fly to site</button>}>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {([['boundary', 'Site boundary'], ['towers', 'Towers (3D)'], ['buildings', 'OSM buildings'], ['terrain', 'Hillshade'], ['pois', 'Points of interest'], ['heatmap', 'Amenity density'], ['rings', 'Distance rings'], ['siteplan', 'Site plan overlay'], ['satellite', 'Satellite (Esri, dev use)'], ['markers3d', 'POI pins'], ['poiLabels', 'POI labels'], ['google', 'Photoreal 3D (Google)']] as [keyof GeoLayers, string][]).map(([k, l]) => (
              <label key={k} className={`flex items-center gap-1.5 ${k === 'google' && !GOOGLE_MAPS_KEY ? 'opacity-50' : ''}`} title={k === 'google' && !GOOGLE_MAPS_KEY ? 'Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable' : undefined}><input type="checkbox" checked={layers[k]} disabled={k === 'google' && !GOOGLE_MAPS_KEY} onChange={() => toggle(k)} />{l}</label>
            ))}
          {layers.google && <p className="mt-2 text-[11px] text-fg-muted">Google Photorealistic 3D Tiles. Imagery © Google{credits.length ? `, ${credits.join(', ')}` : ''}. Shown without OSM buildings, terrain or tower massing.</p>}
          </div>
          {layers.siteplan && (
            <label className="mt-2 block text-xs">
              <span className="label">Overlay opacity · {Math.round(opacity * 100)}%</span>
              <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="w-full" />
              <p className="mt-1 text-[11px] text-fg-muted">Overlay uses {SITE_IMAGE.pxPerMetre} px/m, up-bearing {SITE_IMAGE.upBearingDeg}°, anchored at the OSM centroid. Compare with the boundary to judge the fit. <StatusBadge status="approximate" /></p>
            </label>
          )}
        </Panel>

        <Panel title="Points of interest" right={<StatusBadge status="external" title="OpenStreetMap via Overpass, fetched 2026-10-18" />}>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {CATEGORIES.map((c) => (
              <label key={c.key} className="flex items-center gap-1.5"><input type="checkbox" checked={cats.has(c.key)} onChange={() => toggleCat(c.key)} />{c.label}</label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-fg-muted">{pois.length} features from OpenStreetMap (ODbL). Completeness depends on OSM coverage; absence on the map is not proof of absence.</p>
        </Panel>

        <Panel title="Measure">
          <button type="button" className="btn" aria-pressed={measure} onClick={() => { setMeasure(!measure); setMeasurePts([]); }}>{measure ? 'Measuring: click two points' : 'Measure distance'}</button>
          {measured !== null && <div className="mt-2 text-sm">{formatDistance(measured)} <span className="text-xs text-fg-muted">straight line (great-circle)</span></div>}
          {measure && measurePts.length > 0 && <button type="button" className="btn mt-2" onClick={() => setMeasurePts([])}>Clear</button>}
        </Panel>

        <Panel title="Location insights">
          {pois.length === 0 ? <Spinner label="Computing…" /> : (
            <div className="space-y-2 text-xs">
              <div>
                <span className="label">Education within</span>
                <div className="flex gap-3">{insights.schools.map((s) => <span key={s.km}>{s.km} km: <b>{s.n}</b></span>)}</div>
              </div>
              <div>
                <span className="label">Healthcare within</span>
                <div className="flex gap-3">{insights.health.map((s) => <span key={s.km}>{s.km} km: <b>{s.n}</b></span>)}</div>
              </div>
              {insights.nearestStation && <div><span className="label">Nearest metro / rail</span><div>{insights.nearestStation.f.properties.name} · {formatDistance(insights.nearestStation.d)}</div></div>}
              {insights.nearestHospital && <div><span className="label">Nearest hospital</span><div>{insights.nearestHospital.f.properties.name} · {formatDistance(insights.nearestHospital.d)}</div></div>}
              {insights.nearestMall && <div><span className="label">Nearest mall</span><div>{insights.nearestMall.f.properties.name} · {formatDistance(insights.nearestMall.d)}</div></div>}
              {insights.toll && <div><span className="label">Hoskote toll plaza</span><div>{formatDistance(insights.toll.d)} from site centroid</div></div>}
              <div>
                <span className="label">Other projects under construction nearby</span>
                <ul className="mt-0.5 space-y-0.5">{insights.projects.map((x) => <li key={x.f.properties.osm} className="flex justify-between gap-2"><span>{x.f.properties.name}</span><span className="font-mono text-fg-muted">{formatDistance(x.d)}</span></li>)}</ul>
              </div>
              <p className="text-[11px] text-fg-muted">Straight-line distances from the site centroid. Travel times and road distances are not computed (no routing service configured).</p>
            </div>
          )}
        </Panel>

        <Panel title="Brochure distance ladder" right={<StatusBadge status="source" />}>
          <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs scroll-thin">
            {POI_DISTANCES.map((d) => <li key={d.name} className="flex justify-between gap-2"><span>{d.name}</span><span className="font-mono text-fg-muted">{d.km} km</span></li>)}
          </ul>
          <p className="mt-1 text-[11px] text-fg-muted">Shown as rings only: the brochure gives distances, not positions or bearings.</p>
        </Panel>

        <Panel title="Upcoming infrastructure" right={<StatusBadge status="source" />}>
          <ul className="space-y-1 text-xs">{INFRASTRUCTURE.map((i) => <li key={i.name}><b>{i.name}</b> <span className="text-fg-muted">— {i.detail} ({i.status})</span></li>)}</ul>
          <p className="mt-1 text-[11px] text-fg-muted">Alignments are not drawn: no official geometry was supplied.</p>
        </Panel>
      </aside>

      <div className="relative h-[60svh] min-h-[360px] overflow-hidden rounded-xl border border-line lg:h-[72vh]">
        <GeoMap layers={layers} siteplanOpacity={opacity} poiCategories={cats} measureMode={measure} measurePoints={measurePts} onMeasurePointsChange={setMeasurePts} onPoiData={setPois} onCredits={setCredits} onTowerClick={(w) => { set({ mode: null, wing: w }); scrollToSection('explore'); }} flyToken={flyToken} onStatus={setStatus} />
        {status && <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-[11px] text-warn">{status}</div>}
        <div className="pointer-events-none absolute bottom-8 left-3 rounded bg-black/70 p-2 text-[11px] max-sm:hidden">
          <div className="label mb-1">Legend</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {([['education', 'Education'], ['healthcare', 'Healthcare'], ['mall', 'Malls'], ['station', 'Metro / rail'], ['toll_booth', 'Toll'], ['construction', 'Projects u/c']] as [string, string][]).map(([k, l]) => (
              <span key={k}><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full border border-white/70" style={{ background: PIN_COLORS[k] }} />{l}</span>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
