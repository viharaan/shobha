import type { SitePoint } from './types';

/**
 * Site-plan features traced from SOBHA_OneWorld_Masterplan.pdf and registered to the site frame
 * (metres, x east / y north, origin SITE_ORIGIN — see siteFrame.ts).
 *
 * Registration: a similarity transform (scale, rotation, translation) from master-plan PDF points
 * to site metres, fitted to the 14 OSM wing outlines (shape/centroid fit), with its RMS residual.
 * Every feature is `estimated` (traced from the vendor plan, placed by that fit); STATED sizes
 * (e.g. 350 m running track) are checked against the traced geometry and reported, not forced.
 */
export type Ring = SitePoint[];

export interface MasterplanFit {
  /** site = R(rotRad)·(pt · scale) + [tx, ty], with pt = (x_pt, −y_pt) i.e. page y flipped to north-up. */
  scaleMPerPt: number;
  rotRad: number;
  tx: number;
  ty: number;
  /** RMS residual of the control points after the fit (m). */
  rmsM: number;
  controlPoints: number;
  method: string;
}

export interface MasterplanFeature {
  id: string;
  /** Label as printed (amenity letter/name) or a descriptive id. */
  name: string;
  kind: 'stadium-field' | 'track' | 'club' | 'emporium' | 'plaza' | 'water' | 'road' | 'green' | 'podium' | 'wing' | 'amenity' | 'other';
  /** Polygon (closed implicitly) or, for roads/tracks, a centre-line polyline with widthM. */
  ring?: Ring;
  holes?: Ring[];
  line?: SitePoint[];
  widthM?: number;
  /** Measured from the trace: area m², perimeter/length m. */
  areaM2?: number;
  lengthM?: number;
  /** Stated value from the brochure/master plan, if any, for comparison (e.g. 'running track 350 m'). */
  stated?: string;
}

export interface MasterplanTrace {
  fit: MasterplanFit;
  /** Texture plane for the master-plan raster in site metres: centre, size, rotation (rad, CCW). */
  rasterPlane: { centre: SitePoint; sizeM: [number, number]; rotRad: number; image: string };
  wings: { n: number; ring: Ring; areaM2: number; osmIoU?: number }[];
  features: MasterplanFeature[];
  /** Amenity legend letters (A, B, …) at their printed positions. */
  amenities: {
    code: string;
    name: string;
    pos: SitePoint;
    /** Every printed marker of this code when it appears more than once (pos = their medoid). Added by the trace tool. */
    allPos?: SitePoint[];
  }[];
  notes: string[];
}
