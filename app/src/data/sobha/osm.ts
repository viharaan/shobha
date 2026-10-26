/**
 * External OpenStreetMap dataset (kind: 'external').
 *
 * Built offline by `tools/fetch_osm.sh` (Overpass API → tools/normalize_osm.mjs) into
 * `public/data/osm.json`. The app only reads that static file — it never calls Overpass at
 * runtime. Data © OpenStreetMap contributors, ODbL 1.0. Completeness depends on OSM coverage;
 * absence of a feature is not proof of absence on the ground.
 *
 * Distances in this file are straight-line (haversine) from the site anchor (SITE_ORIGIN, the
 * OSM site-polygon centroid — see siteFrame.ts) — computed, not from any source asset, and never
 * travel times. After an anchor move, `node tools/recenter_osm.mjs` re-anchors the JSON offline.
 */
import type { LatLng } from './types';
import { SITE_ORIGIN } from './siteFrame';

export type OsmCategory =
  | 'school'
  | 'college'
  | 'university'
  | 'hospital'
  | 'clinic'
  | 'mall'
  | 'metro'
  | 'toll'
  | 'project_uc';

export interface OsmPoi {
  cat: OsmCategory;
  name: string;
  lat: number;
  lng: number;
  /** Straight-line km from the site anchor (computed at build time). */
  distanceKm: number;
}

export interface OsmBuilding {
  lat: number;
  lng: number;
  area?: number;
}

export interface OsmDataset {
  fetchedAt: string;
  source: string;
  /** [lng, lat] */
  centroid: [number, number];
  pois: OsmPoi[];
  buildings: OsmBuilding[];
}

export interface OsmCategoryMeta {
  label: string;
  /** Hex colour used on the map + legend. */
  color: string;
  /** Short glyph for compact legends / chips. */
  glyph: string;
}

export const OSM_CATEGORIES: OsmCategory[] = [
  'school',
  'college',
  'university',
  'hospital',
  'clinic',
  'mall',
  'metro',
  'toll',
  'project_uc',
];

export const OSM_CATEGORY_META: Record<OsmCategory, OsmCategoryMeta> = {
  school: { label: 'Schools', color: '#2563eb', glyph: 'S' },
  college: { label: 'Colleges', color: '#7c3aed', glyph: 'C' },
  university: { label: 'Universities', color: '#c026d3', glyph: 'U' },
  hospital: { label: 'Hospitals', color: '#dc2626', glyph: 'H' },
  clinic: { label: 'Clinics', color: '#fb7185', glyph: '+' },
  mall: { label: 'Malls', color: '#0d9488', glyph: 'M' },
  metro: { label: 'Metro / rail', color: '#16a34a', glyph: 'R' },
  toll: { label: 'Toll', color: '#57534e', glyph: 'T' },
  project_uc: { label: 'Projects u/c', color: '#ca8a04', glyph: 'UC' },
};

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

/**
 * The project's own OSM features (the "Sobha One World" site polygon and its "Wing N" outlines).
 * They are the site itself, so they are excluded from nearest-place lists and counts.
 * Keep in sync with tools/site_anchor.mjs.
 */
const SELF_NAME = /sobha\s*one\s*world/i;
const WING_NAME = /^wing[\s-]*\d{1,2}$/i;
export function isSelfFeature(name: string): boolean {
  return SELF_NAME.test(name) || WING_NAME.test(name.trim());
}

const EARTH_R_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle (straight-line) distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isCategory(c: unknown): c is OsmCategory {
  return typeof c === 'string' && (OSM_CATEGORIES as string[]).includes(c);
}

/** Validate the loose JSON shape; drops malformed rows instead of throwing. */
function coerce(raw: unknown): OsmDataset | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.pois)) return null;
  const pois: OsmPoi[] = [];
  for (const p of r.pois as Record<string, unknown>[]) {
    if (!p || !isCategory(p.cat) || typeof p.name !== 'string') continue;
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
    pois.push({
      cat: p.cat,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      distanceKm: typeof p.distanceKm === 'number' ? p.distanceKm : NaN,
    });
  }
  const buildings: OsmBuilding[] = Array.isArray(r.buildings)
    ? (r.buildings as Record<string, unknown>[])
        .filter((b) => b && typeof b.lat === 'number' && typeof b.lng === 'number')
        .map((b) => ({ lat: b.lat as number, lng: b.lng as number, area: typeof b.area === 'number' ? b.area : undefined }))
    : [];
  const centroid =
    Array.isArray(r.centroid) && r.centroid.length === 2
      ? (r.centroid as [number, number])
      : [SITE_ORIGIN.lng, SITE_ORIGIN.lat];
  // Recompute missing distances from the dataset centroid.
  const c = { lng: centroid[0], lat: centroid[1] };
  for (const p of pois) if (!Number.isFinite(p.distanceKm)) p.distanceKm = haversineKm(c, p);
  pois.sort((a, b) => a.distanceKm - b.distanceKm);
  return {
    fetchedAt: typeof r.fetchedAt === 'string' ? r.fetchedAt : 'unknown',
    source: typeof r.source === 'string' ? r.source : 'OpenStreetMap contributors (ODbL)',
    centroid: centroid as [number, number],
    pois,
    buildings,
  };
}

/** Load the static OSM dataset. Returns null when the file is missing or invalid. */
export async function loadOsm(url = '/data/osm.json'): Promise<OsmDataset | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    return coerce(await res.json());
  } catch {
    return null;
  }
}

/** Count POIs per category within each radius (km). The project's own features are excluded. */
export function countsWithin(
  pois: OsmPoi[],
  radiiKm: number[],
): Record<OsmCategory, number[]> {
  const out = Object.fromEntries(OSM_CATEGORIES.map((c) => [c, radiiKm.map(() => 0)])) as Record<
    OsmCategory,
    number[]
  >;
  for (const p of pois) {
    if (isSelfFeature(p.name)) continue;
    radiiKm.forEach((r, i) => {
      if (p.distanceKm <= r) out[p.cat][i] += 1;
    });
  }
  return out;
}
