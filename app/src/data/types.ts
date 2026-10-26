// Core data model. One 3D world unit = one metre everywhere in this app.

export type DataStatus =
  | 'source-verified' // taken from an authoritative project document and cross-checked
  | 'source' // taken from a project document, not independently checked
  | 'external' // from a third-party dataset with known provenance (e.g. OpenStreetMap)
  | 'approximate' // traced or measured from a raster; expect ±5–10 %
  | 'assumed' // not in any source; a documented engineering assumption
  | 'user-calibrated' // set by the user through the calibration tool
  | 'unverified';

export interface Provenance {
  status: DataStatus;
  source?: string;
  note?: string;
}

export interface PlanRoom {
  name: string;
  /** [width, depth] in millimetres as printed on the plan */
  mm: [number, number];
  /** centre of the dimension label in PDF points (SVG user units) */
  labelPt: [number, number];
}

export interface PlanCalibration {
  /** millimetres of real world per SVG user unit (PDF point) */
  mmPerPt: number;
  status: DataStatus;
  samples?: number;
  note?: string;
}

export interface PlanRecord {
  id: string;
  typeCode: string;
  name: string;
  wing: number;
  page: number;
  svg: string;
  sbaSqft: number;
  carpetSqft: number;
  viewBox: [number, number, number, number];
  /** bounding box of the wall polygon in SVG units [minX, minY, maxX, maxY] */
  wallBboxPt: [number, number, number, number];
  calibration: PlanCalibration;
  rooms: PlanRoom[];
}

export interface UnitType {
  code: string;
  name: string;
  bedrooms: number;
  tier: 'Grande' | 'Luxe' | 'Residence';
  sbaSqft: number | [number, number];
  carpetSqft?: number;
  avgPriceCr: number;
  planId?: string;
}

export interface Tower {
  wing: number;
  phase: number;
  typicalFloors: number;
  handover: string;
  rera: string;
  /** centroid of the tower footprint on the master-plan raster, pixels */
  imagePx: [number, number];
  /** footprint outline traced from the master-plan raster, pixels (unclosed ring) */
  footprintPx: [number, number][];
  /** unit numbers and facings on a typical floor, from the sales sheet, when legible */
  typicalFloor?: { unit: number; facing: 'N' | 'E' | 'W' | 'S'; typeCode?: string }[];
  samplePlanId?: string;
  provenance: Provenance;
}

export interface Hotspot {
  id: string;
  label: string;
  kind: 'tower' | 'amenity' | 'access' | 'club' | 'retail' | 'future';
  imagePx: [number, number];
  description?: string;
  provenance: Provenance;
}

export interface Amenity {
  key: string;
  name: string;
  zone: string;
}

export interface PoiDistance {
  name: string;
  category: 'education' | 'healthcare' | 'corporate' | 'leisure';
  km: number;
}

export interface MediaItem {
  id: string;
  kind: 'video' | 'image' | 'document';
  title: string;
  src: string;
  poster?: string;
  description?: string;
  linksTo?: string;
  provenance: Provenance;
}
