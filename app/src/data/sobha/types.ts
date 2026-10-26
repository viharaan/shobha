/**
 * Data contracts for OneWorld Spatial.
 *
 * Provenance is first-class: every record that the UI can display must declare
 * how each of its facts was obtained. This enforces the master constraint that
 * the app never claims accuracy the source assets do not support.
 */

/**
 * - "source"        : value printed in a source asset (PDF/video). Trust it as printed.
 * - "estimated"     : value derived by a documented method (e.g. position read from the
 *                     master-plan raster; scale anchored to a stated dimension).
 * - "illustrative"  : procedurally generated shape/visual with no source geometry.
 * - "external"      : value from an open external dataset (e.g. OpenStreetMap, ODbL) with
 *                     provenance; completeness depends on external coverage.
 * - "unverified"    : claim that conflicts with, or could not be checked against, the
 *                     authoritative source documents.
 */
export type Kind = 'source' | 'estimated' | 'illustrative' | 'external' | 'unverified';

export interface Provenance {
  /** Source asset file (or research URL) the fact comes from. */
  asset: string;
  /** What was read from it / method of derivation. */
  note: string;
  /** Optional URL for researched facts (geo research). */
  url?: string;
}

/** Base envelope shared by all displayable records. */
export interface BaseRecord {
  id: string;
  /** Overall trust label shown as a badge in the UI. */
  kind: Kind;
  provenance: Provenance[];
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** A 2-D position in the local site frame, metres from site centre (x = east, y = north). */
export interface SitePoint {
  x: number;
  y: number;
}

export interface WingPhase {
  phase: number;
  completion: string; // e.g. "Jul 2032"
}

export interface Wing extends BaseRecord {
  name: string; // "Wing 1"
  floorsTypical: number; // 45 or 46 (source)
  basements: number; // 3 (source)
  parkingLevelsAbove: number; // GF + 1st (source)
  refugeFloors: number[]; // 19, 29, 39 (source)
  phase: WingPhase; // (source)
  unitTypeCode: string; // which plan type this wing carries (source)
  /** Local site position, metres — estimated from the master-plan raster. */
  sitePos: SitePoint;
  /** Approximate footprint width (m) estimated from the master-plan raster. */
  footprintM: number;
  /** Illustrative 3-D massing only. */
  massing: {
    kind: 'illustrative';
    floorHeightM: number; // assumed 3.0 m typical (NOT stated in any source)
    podiumM: number; // assumed 4.5 m
  };
}

/** A room as printed on the plan: name + dimensions. The plans print room
 *  dimensions (mm and ft), not room areas — we store exactly what is printed. */
export interface RoomSpec {
  name: string;
  /** mm, width × depth as printed. */
  mm: [number, number];
  /** ft, as printed (e.g. `11'-6" × 13'-5"`). */
  ft: string;
}

export interface UnitType extends BaseRecord {
  code: string; // "A", "C3", ...
  name: string; // "4 Bed Grande"
  wing: number; // 1..14 (source)
  bedrooms: 1 | 2 | 3 | 4;
  sbaSqm: number; // source
  sbaSqft: number; // source
  carpetSqm: number | null; // source where printed
  carpetSqft: number | null; // source where printed
  /** Average price (₹ crore) as printed in the snapshot "Configuration Breakup & Average Cost" (08.08.26). */
  avgPriceCr?: number | null;
  /** Plan raster file served from /media. */
  planImage: string;
  rooms: RoomSpec[]; // printed room dimensions (source)
  /** Calibration: two pixel anchors on the raster + printed distance (mm). estimated until user re-calibrates. */
  calibration: {
    a: [number, number];
    b: [number, number];
    printedMm: number;
    basis: string;
  };
}

export type Realm =
  | 'Temperate Enclave'
  | 'Mediterranean Serenity'
  | 'Tropical Zen'
  | 'World Stadium'
  | 'Continental Grounds'
  | 'One Club'
  | 'Access & Utilities';

export interface Amenity extends BaseRecord {
  code: string; // "A".."AD", "1".."11"
  name: string; // source
  realm: Realm; // source (legend grouping)
  /** Local site position, metres — estimated from master-plan raster (or null if not placed). */
  sitePos: SitePoint | null;
  /** Further printed positions when the legend code appears more than once (traced master plan). */
  extraPos?: SitePoint[];
}

export interface NearbyPoi extends BaseRecord {
  name: string;
  /** POI category (distinct from the record's provenance `kind`). */
  poiKind: 'mall' | 'school' | 'hospital' | 'metro' | 'park' | 'airport' | 'techpark' | 'junction' | 'leisure';
  /** Distance as stated by the brochure (km) — marketing statement, not measured. */
  distanceKmStated: number | null;
  pos: LatLng | null; // null when no sourced coordinate was found
  sourceNote: string;
}

export interface PlannedCorridor extends BaseRecord {
  name: string;
  status: 'planned' | 'under_construction' | 'proposed';
  detail: string; // brochure wording
  /** Rough geometry for display only — NOT survey data. */
  geometry: [number, number][]; // [lng, lat]
}

export interface SiteLocation extends BaseRecord {
  centroid: LatLng;
  confidence: 'high' | 'medium' | 'low';
  address: string; // source
  siteAreaAcres: number; // source
  notes: string[];
}

export type MediaClass =
  | 'artist-render'
  | 'real-world-aerial'
  | 'promotional'
  | 'brochure-page'
  | 'infographic'
  | 'snapshot';

export interface MediaItem extends BaseRecord {
  title: string;
  cls: MediaClass;
  /** Served file under /media. */
  src: string;
  poster?: string;
  durationS?: number;
  resolution?: string;
  notes?: string;
}
