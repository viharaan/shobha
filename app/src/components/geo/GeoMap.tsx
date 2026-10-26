'use client';

import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import type { PickingInfo } from '@deck.gl/core';
import { Tile3DLayer } from '@deck.gl/geo-layers';
import { GeoJsonLayer, IconLayer, LineLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { GOOGLE_MAPS_KEY } from '@/components/three/GoogleTiles';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { Map as MLMap, NavigationControl, ScaleControl, setWorkerUrl, type IControl, type ErrorEvent, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GEO_DATA, SITE_IMAGE } from '@/data/manifest';
import { FLOOR_TO_FLOOR_M, PODIUM_HEIGHT_M, TOWERS } from '@/data/project';
import { haversineM, imageRingToLonLat, siteImageCorners, type LonLat } from '@/lib/geo';

export type PoiFeature = GeoJSON.Feature<GeoJSON.Point, { name: string; category: string; osm: string; operator?: string | null; station?: string | null; network?: string | null }>;

export interface GeoLayers {
  boundary: boolean;
  towers: boolean;
  pois: boolean;
  heatmap: boolean;
  rings: boolean;
  siteplan: boolean;
  terrain: boolean;
  buildings: boolean;
  /** Google Photorealistic 3D Tiles (needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) */
  google: boolean;
  /** satellite imagery under the labels (Esri World Imagery, dev use) */
  satellite: boolean;
  /** points of interest as upright pin markers (billboards) on top of the ground dots */
  markers3d: boolean;
  /** name labels above the pins */
  poiLabels: boolean;
}

export interface GeoMapProps {
  layers: GeoLayers;
  siteplanOpacity: number;
  poiCategories: Set<string>;
  measureMode: boolean;
  measurePoints: LonLat[];
  onMeasurePointsChange: (p: LonLat[]) => void;
  onPoiData: (f: PoiFeature[]) => void;
  onTowerClick: (wing: number) => void;
  flyToken: number;
  onStatus: (s: string) => void;
  /** copyright strings collected from loaded Google tiles, for attribution */
  onCredits?: (credits: string[]) => void;
}

/** Pin / dot colours per OSM category: saturated, white-outlined, chosen to read on satellite imagery and the light basemap alike. */
export const PIN_COLORS: Record<string, string> = {
  education: '#3ddc84', healthcare: '#ff4d4d', mall: '#ffcc33', station: '#4da3ff', toll_booth: '#ff9f1a', construction: '#f2f2f2',
};
const PIN_GROUP: Record<string, keyof typeof PIN_COLORS> = {
  school: 'education', college: 'education', university: 'education', hospital: 'healthcare', clinic: 'healthcare',
  mall: 'mall', station: 'station', toll_booth: 'toll_booth', construction: 'construction',
};
const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const CATEGORY_COLORS: Record<string, [number, number, number]> = Object.fromEntries(Object.entries(PIN_GROUP).map(([k, g]) => [k, hexRgb(PIN_COLORS[g])]));
const pinColor = (cat: string) => PIN_COLORS[PIN_GROUP[cat] ?? 'construction'];

/** Lollipop pin — thin stem, round head in the category colour with a white ring — rasterised once per colour (PNG data URL). */
const pinCache = new Map<string, { url: string; width: number; height: number; anchorY: number; mask: boolean }>();
const pinIcon = (cat: string) => {
  const c = pinColor(cat);
  let icon = pinCache.get(c);
  if (icon) return icon;
  const W = 32, H = 80;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(16, 20); g.lineTo(16, 78); g.stroke();
  g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(16, 20); g.lineTo(16, 78); g.stroke();
  g.beginPath(); g.arc(16, 12, 10, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  g.beginPath(); g.arc(16, 12, 7.5, 0, Math.PI * 2); g.fillStyle = c; g.fill();
  icon = { url: cv.toDataURL('image/png'), width: W, height: H, anchorY: H, mask: false };
  pinCache.set(c, icon);
  return icon;
};

const SITE_CENTRE = SITE_IMAGE.anchorLonLat;

// Served copy of MapLibre's module worker (scripts/copy-maplibre-worker.mjs): Turbopack cannot resolve the inline worker URL.
if (typeof window !== 'undefined') setWorkerUrl('/vendor/maplibre-gl-worker.js');

export function GeoMap(p: GeoMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [boundary, setBoundary] = useState<GeoJSON.FeatureCollection | null>(null);
  const [pois, setPois] = useState<PoiFeature[]>([]);
  const [loaded, setLoaded] = useState(false);
  const googleEver = useRef(false);
  const propsRef = useRef(p);
  useEffect(() => { propsRef.current = p; });

  // ---- map init -------------------------------------------------------------------------------------
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = new MLMap({
      container: el.current,
      style: GEO_DATA.basemapStyle,
      center: SITE_CENTRE,
      zoom: 14.6,
      pitch: 55,
      bearing: -15,
      maxPitch: 75,
      attributionControl: { compact: true, customAttribution: GEO_DATA.attribution },
      cooperativeGestures: window.matchMedia('(pointer: coarse)').matches, // touch: one finger scrolls the page, two move the map
    });
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('error', (e: ErrorEvent) => propsRef.current.onStatus(`Map: ${e.error?.message ?? 'tile error'}`));
    map.on('load', () => {
      try {
        // Hillshade only: no 3-D terrain mesh. deck.gl's MapboxOverlay draws at sea level, so with terrain enabled the
        // towers, POIs and boundary sat visibly apart from the draped OSM buildings under pitch (a "duplicate" site).
        map.addSource('hillshade-dem', { type: 'raster-dem', tiles: [GEO_DATA.terrainTiles], encoding: 'terrarium', tileSize: 256, maxzoom: 15 });
        map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'hillshade-dem', paint: { 'hillshade-exaggeration': 0.35 } }, firstSymbolLayer(map));
      } catch (e) { propsRef.current.onStatus(`Terrain unavailable: ${(e as Error).message}`); }
      try {
        map.addSource('esri-sat', { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' });
        map.addLayer({ id: 'satellite', type: 'raster', source: 'esri-sat', paint: { 'raster-fade-duration': 0 }, layout: { visibility: 'none' } }, firstSymbolLayer(map));
      } catch (e) { propsRef.current.onStatus(`Satellite unavailable: ${(e as Error).message}`); }
      try {
        map.addSource('siteplan', { type: 'image', url: SITE_IMAGE.url, coordinates: siteImageCorners() });
        map.addLayer({ id: 'siteplan', type: 'raster', source: 'siteplan', paint: { 'raster-opacity': propsRef.current.siteplanOpacity, 'raster-fade-duration': 0 }, layout: { visibility: 'none' } }, firstSymbolLayer(map));
      } catch (e) { propsRef.current.onStatus(`Site plan overlay failed: ${(e as Error).message}`); }
      try {
        if (map.getSource('openmaptiles')) {
          map.addLayer({
            id: 'osm-buildings-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13,
            paint: { 'fill-extrusion-color': '#3b4250', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.75 },
            layout: { visibility: 'none' },
          }, firstSymbolLayer(map));
        }
      } catch (e) { propsRef.current.onStatus(`3D buildings unavailable: ${(e as Error).message}`); }
      const overlay = new MapboxOverlay({ interleaved: false, layers: [], getTooltip: tooltip });
      map.addControl(overlay as unknown as IControl);
      overlayRef.current = overlay;
      setLoaded(true);
      propsRef.current.onStatus('');
    });
    map.on('click', (e: MapMouseEvent) => {
      const cur = propsRef.current;
      if (!cur.measureMode) return;
      const pt: LonLat = [e.lngLat.lng, e.lngLat.lat];
      cur.onMeasurePointsChange(cur.measurePoints.length >= 2 ? [pt] : [...cur.measurePoints, pt]);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; overlayRef.current = null; };
  }, []);

  // ---- data ----------------------------------------------------------------------------------------
  useEffect(() => {
    fetch(GEO_DATA.siteBoundary).then((r) => r.json()).then(setBoundary).catch(() => p.onStatus('Site boundary file missing.'));
    fetch(GEO_DATA.pois).then((r) => r.json()).then((fc: GeoJSON.FeatureCollection) => { const f = fc.features as PoiFeature[]; setPois(f); p.onPoiData(f); }).catch(() => p.onStatus('POI file missing.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- maplibre-native layers (terrain, buildings, image) -------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    try {
      if (map.getLayer('hillshade')) map.setLayoutProperty('hillshade', 'visibility', p.layers.terrain ? 'visible' : 'none');
      if (map.getLayer('siteplan')) {
        map.setLayoutProperty('siteplan', 'visibility', p.layers.siteplan ? 'visible' : 'none');
        map.setPaintProperty('siteplan', 'raster-opacity', p.siteplanOpacity);
      }
      if (map.getLayer('osm-buildings-3d')) map.setLayoutProperty('osm-buildings-3d', 'visibility', p.layers.buildings ? 'visible' : 'none');
      if (map.getLayer('satellite')) map.setLayoutProperty('satellite', 'visibility', p.layers.satellite ? 'visible' : 'none');
    } catch (e) { p.onStatus((e as Error).message); }
  }, [loaded, p.layers.terrain, p.layers.siteplan, p.layers.buildings, p.layers.satellite, p.siteplanOpacity, p]);

  useEffect(() => {
    mapRef.current?.flyTo({ center: SITE_CENTRE, zoom: 15, pitch: 60, bearing: -15, duration: 1500 });
  }, [p.flyToken]);

  // ---- deck.gl layers ------------------------------------------------------------------------------
  const towerPolys = useMemo(() => TOWERS.map((t) => ({
    wing: t.wing,
    height: PODIUM_HEIGHT_M + t.typicalFloors * FLOOR_TO_FLOOR_M,
    polygon: imageRingToLonLat(t.footprintPx),
  })), []);

  const filteredPois = useMemo(() => pois.filter((f) => p.poiCategories.has(f.properties.category)), [pois, p.poiCategories]);
  // buffer radii that read at a glance (the brochure's own distance ladder stays in the side panel)
  const rings = useMemo(() => [1, 2, 3, 5, 7], []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const L = p.layers;
    const credits = new Set<string>();
    if (L.google) googleEver.current = true;
    const layers = [
      googleEver.current && GOOGLE_MAPS_KEY && new Tile3DLayer({
        visible: L.google, // hidden, not removed: a new layer would open a new (billed) root session
        id: 'google-3d-tiles',
        data: 'https://tile.googleapis.com/v1/3dtiles/root.json',
        loadOptions: { fetch: { headers: { 'X-GOOG-API-KEY': GOOGLE_MAPS_KEY } } },
        pickable: false,
        onTileLoad: (tile: { content?: { gltf?: { asset?: { copyright?: string } } } }) => {
          const c = tile.content?.gltf?.asset?.copyright;
          if (!c) return;
          const before = credits.size;
          c.split(';').map((s) => s.trim()).filter(Boolean).forEach((s) => credits.add(s));
          if (credits.size !== before) p.onCredits?.([...credits]);
        },
        onTileError: (_tile: unknown, _url: string, message: string) => p.onStatus(`Google 3D Tiles: ${message}`),
      }),
      L.boundary && boundary && new GeoJsonLayer({ id: 'site-boundary', data: boundary, filled: true, stroked: true, getFillColor: [201, 169, 110, 40], getLineColor: [201, 169, 110, 220], getLineWidth: 2, lineWidthMinPixels: 2, pointRadiusMinPixels: 5, getPointRadius: 8, pickable: true }),
      L.rings && new ScatterplotLayer({ id: 'distance-rings-halo', data: rings.map((km) => ({ km })), getPosition: () => SITE_CENTRE, getRadius: (d: { km: number }) => d.km * 1000, radiusUnits: 'meters', filled: false, stroked: true, getLineColor: [0, 0, 0, 170], lineWidthMinPixels: 5, lineWidthMaxPixels: 7, getLineWidth: 5, lineWidthUnits: 'pixels' }),
      L.rings && new ScatterplotLayer({ id: 'distance-rings', data: rings.map((km) => ({ km })), getPosition: () => SITE_CENTRE, getRadius: (d: { km: number }) => d.km * 1000, radiusUnits: 'meters', filled: false, stroked: true, getLineColor: [230, 207, 155, 240], lineWidthMinPixels: 2, lineWidthMaxPixels: 3, getLineWidth: 2, lineWidthUnits: 'pixels' }),
      L.rings && new TextLayer({ id: 'ring-labels', data: rings.flatMap((km) => [{ km, s: 1 }, { km, s: -1 }]), getPosition: (d: { km: number; s: number }) => [SITE_CENTRE[0], SITE_CENTRE[1] + (d.s * d.km * 1000) / 111320] as [number, number], getText: (d: { km: number }) => `${d.km} km`, getSize: 13, fontWeight: 700, getColor: [255, 244, 214, 255], background: true, getBackgroundColor: [11, 13, 16, 200], backgroundPadding: [6, 3], getBorderColor: [230, 207, 155, 200], getBorderWidth: 1, fontFamily: 'system-ui' }),
      L.towers && new PolygonLayer({ id: 'towers', data: towerPolys, extruded: true, wireframe: false, getPolygon: (d: { polygon: LonLat[] }) => d.polygon, getElevation: (d: { height: number }) => d.height, getFillColor: [191, 195, 201, 210], getLineColor: [60, 60, 60], pickable: true, onClick: (i: PickingInfo<{ wing: number }>) => { if (i.object) p.onTowerClick(i.object.wing); } }),
      L.heatmap && filteredPois.length > 0 && new HeatmapLayer<PoiFeature>({ id: 'poi-heat', data: filteredPois, getPosition: (f) => f.geometry.coordinates as [number, number], getWeight: 1, radiusPixels: 60, intensity: 1, threshold: 0.05, colorRange: [[201, 169, 110, 0], [201, 169, 110, 80], [230, 207, 155, 140], [255, 240, 200, 200]] }),
      L.pois && L.markers3d && new IconLayer<PoiFeature>({ id: 'poi-pins', data: filteredPois, getPosition: (f) => f.geometry.coordinates as [number, number], getIcon: (f) => pinIcon(f.properties.category), getSize: 40, sizeUnits: 'pixels', sizeMinPixels: 28, sizeMaxPixels: 48, billboard: true, pickable: true, updateTriggers: { getIcon: filteredPois } }),
      L.pois && L.poiLabels && new TextLayer<PoiFeature>({ id: 'poi-labels', data: filteredPois, getPosition: (f) => f.geometry.coordinates as [number, number], getText: (f) => f.properties.name ?? '', getSize: 10, getColor: [255, 255, 255, 235], background: true, getBackgroundColor: [11, 13, 16, 150], backgroundPadding: [3, 1], getPixelOffset: [0, L.markers3d ? -46 : -12], getTextAnchor: 'middle', getAlignmentBaseline: 'bottom', fontFamily: 'system-ui', fontWeight: 600, characterSet: 'auto', maxWidth: 24, wordBreak: 'break-word', pickable: false }),
      L.pois && new ScatterplotLayer<PoiFeature>({ id: 'pois', data: filteredPois, getPosition: (f) => f.geometry.coordinates as [number, number], getFillColor: (f) => [...(CATEGORY_COLORS[f.properties.category] ?? [200, 200, 200]), 230] as [number, number, number, number], getLineColor: [255, 255, 255, 220], radiusMinPixels: 3, radiusMaxPixels: 8, getRadius: 20, stroked: true, lineWidthMinPixels: 1.5, pickable: true }),
      p.measurePoints.length === 2 && new LineLayer({ id: 'measure', data: [{ a: p.measurePoints[0], b: p.measurePoints[1] }], getSourcePosition: (d: { a: LonLat }) => d.a, getTargetPosition: (d: { b: LonLat }) => d.b, getColor: [111, 191, 138], getWidth: 3, widthUnits: 'pixels' }),
      p.measurePoints.length > 0 && new ScatterplotLayer({ id: 'measure-pts', data: p.measurePoints, getPosition: (d: LonLat) => d, getFillColor: [111, 191, 138], radiusMinPixels: 5, getRadius: 5 }),
    ].filter(Boolean);
    overlay.setProps({ layers: layers as never[] });
  }, [boundary, filteredPois, p.layers, p.measurePoints, rings, towerPolys, p]);

  return <div ref={el} className="h-full w-full" aria-label="Map of SOBHA OneWorld and surroundings" role="application" />;
}

function firstSymbolLayer(map: MLMap): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
}

function tooltip(info: PickingInfo) {
  const o = info.object as PoiFeature | { wing?: number; km?: number } | undefined;
  if (!o) return null;
  if ('properties' in o && o.properties) {
    const pr = o.properties as PoiFeature['properties'] & { kind?: string };
    const d = haversineM(SITE_CENTRE, (o as PoiFeature).geometry.coordinates as LonLat);
    const name = pr.name ?? pr.kind ?? 'Feature';
    return { html: `<div style="font:12px system-ui;color:#e9e6df"><b>${esc(name)}</b><br/>${esc(pr.category ?? pr.kind ?? '')}${pr.operator ? ' · ' + esc(pr.operator) : ''}<br/>${(d / 1000).toFixed(2)} km from site (straight line)<br/><span style="color:#9aa0a8">${esc(pr.osm ?? 'OpenStreetMap')}</span></div>`, style: { background: '#171b21', border: '1px solid #2a3038', borderRadius: '8px', padding: '6px 8px' } };
  }
  if ('wing' in o && o.wing) return { html: `<div style="font:12px system-ui;color:#e9e6df">Wing ${o.wing} · click to open in 3D<br/><span style="color:#9aa0a8">footprint traced from raster (approximate)</span></div>`, style: { background: '#171b21', border: '1px solid #2a3038', borderRadius: '8px', padding: '6px 8px' } };
  return null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
