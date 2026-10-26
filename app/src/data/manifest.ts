import type { MediaItem } from './types';
import { PLANS } from './plans.generated';

export { PLANS };

/**
 * Georeference of the raster master plan (app/public/media/site/masterplan.jpg).
 *
 * How it was derived (2026-10-18):
 * - pxPerMetre: the "~90 Meter Dia" cricket ground measures ≈270 px across → 3.0 px/m (±5 %).
 * - anchorPx / anchorLonLat: the ground centre pixel is pinned to the vertex-average centroid of the
 *   OpenStreetMap site polygon (way/1427347113). Expect tens of metres of error until a survey point is supplied.
 * - upBearingDeg: image "up" is NOT true north. Comparing the plan's Old Madras Road edge (≈37° in image) with
 *   the OSM road/boundary bearing (≈57–60°) gives ≈22°. The page's printed north arrow is approximate.
 * Every value is editable; the Geo page overlays the image on the map so a planner can check it.
 */
export const SITE_IMAGE = {
  url: '/media/site/masterplan.jpg',
  widthPx: 2682,
  heightPx: 2123,
  pxPerMetre: 3.0,
  anchorPx: [1635, 1040] as [number, number],
  anchorLonLat: [77.776103, 13.0599] as [number, number],
  upBearingDeg: 22,
  status: 'approximate' as const,
};

export const GEO_DATA = {
  siteBoundary: '/data/site-boundary.geojson',
  pois: '/data/osm-pois.geojson',
  basemapStyle: 'https://tiles.openfreemap.org/styles/liberty', // OpenFreeMap, no key, OSM data
  terrainTiles: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', // AWS Open Data (Mapzen/Terrarium)
  attribution: '© OpenStreetMap contributors · OpenFreeMap · Terrain: Mapzen/AWS Open Data',
};

export const MEDIA: MediaItem[] = [
  { id: 'clip-01', kind: 'video', title: 'OneWorld Plaza — aerial flythrough', src: '/media/video/clip-01.mp4', poster: '/media/video/clip-01.png',
    description: 'A grand pavilion for community experiences. Render of amenity A (Temperate Enclave).', linksTo: 'amenity:A',
    provenance: { status: 'source', source: 'Developer render video (WhatsApp, 2026-10-17)' } },
  { id: 'clip-02', kind: 'video', title: 'Landscape render clip 2', src: '/media/video/clip-02.mp4', poster: '/media/video/clip-02.png',
    provenance: { status: 'source', source: 'Developer render video (WhatsApp, 2026-10-17)' } },
  { id: 'clip-03', kind: 'video', title: 'Landscape render clip 3', src: '/media/video/clip-03.mp4', poster: '/media/video/clip-03.png',
    provenance: { status: 'source', source: 'Developer render video (WhatsApp, 2026-10-17)' } },
  { id: 'clip-04', kind: 'video', title: 'EOI reel — 3 & 4 BHK from ₹2.04 Cr', src: '/media/video/clip-04.mp4', poster: '/media/video/clip-04.png',
    description: 'Vertical social reel. Price claim differs from the sales sheet averages; treat as campaign copy.',
    provenance: { status: 'source', source: 'Developer social reel (WhatsApp, 2026-10-17)' } },
  { id: 'clip-05', kind: 'video', title: 'NH-75 / Old Madras Road near Hoskote toll — drone footage', src: '/media/video/clip-05.mp4', poster: '/media/video/clip-05.png',
    description: 'Real footage of the highway frontage and toll plaza the site fronts.', linksTo: 'geo:toll',
    provenance: { status: 'source', source: 'Drone footage (WhatsApp, 2026-10-17)' } },
  { id: 'clip-06', kind: 'video', title: 'Brand teaser — "Every detail, meticulously sculpted"', src: '/media/video/clip-06.mp4', poster: '/media/video/clip-06.png',
    provenance: { status: 'source', source: 'Developer teaser (WhatsApp, 2026-10-17)' } },
  { id: 'clip-07', kind: 'video', title: 'Mood clip — foliage', src: '/media/video/clip-07.mp4', poster: '/media/video/clip-07.png',
    provenance: { status: 'source', source: 'Developer mood clip (WhatsApp, 2026-10-17)' } },
  { id: 'masterplan', kind: 'image', title: 'Master plan', src: '/media/site/masterplan-page.jpg', linksTo: 'explore',
    provenance: { status: 'source', source: 'SOBHA_OneWorld_Masterplan.pdf p.2' } },
  { id: 'sales-sheet', kind: 'image', title: 'Project snapshot, unit numbering, PLC & FRC (08.08.26)', src: '/media/site/sales-sheet.jpg',
    provenance: { status: 'source', source: 'Sales sheet PDF' } },
  { id: 'six-realms', kind: 'image', title: 'Six Realms — Temperate Enclave creative', src: '/media/site/six-realms-creative.jpg',
    provenance: { status: 'source', source: 'Developer creative (WhatsApp)' } },
  { id: 'why-buy', kind: 'image', title: '"Why you must buy" infographic', src: '/media/site/why-buy-infographic.jpg',
    description: 'Claims 53–54 floors and a 75,000 sq ft clubhouse. The official PDFs say 45–46 floors and 1,20,000 sq ft; the PDFs win.',
    provenance: { status: 'unverified', source: 'Third-party / channel-partner creative', note: 'Contradicts official documents' } },
  { id: 'brochure', kind: 'document', title: 'Mobile brochure (30 pages)', src: '/media/brochure/page-01.jpg',
    provenance: { status: 'source', source: 'SOBHA OneWorld_Mobile Brochure.pdf' } },
];

export const BROCHURE_PAGES = Array.from({ length: 30 }, (_, i) => `/media/brochure/page-${String(i + 1).padStart(2, '0')}.jpg`);
