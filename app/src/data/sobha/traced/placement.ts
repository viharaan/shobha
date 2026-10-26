import type { Kind } from '../types';
import type { Mm2 } from './types';

/**
 * Real-world placement of a traced unit: where the flat sits in its OSM wing outline and
 * which way it faces, so the VR view out of the windows / balcony matches the real surroundings.
 *
 * Frames
 *  - unit 3-D: metres, X = x_mm/1000 (page right), Z = y_mm/1000 (page down), Y up (see types.ts)
 *  - site:     metres, x east / y north, origin SITE_ORIGIN (siteFrame.ts); site 3-D uses X = x, Z = −y
 *
 * Transform (unit 3-D → site 3-D):  P_site = R_y(yawRad) · P_unit + [offsetX, floorY, offsetZ]
 *   yawRad   rotation about +Y (three.js convention, counter-clockwise seen from above)
 *   offset   site-3-D position of the unit-frame origin (x_mm = 0, y_mm = 0)
 *   mirrored the flat is built as the MIRROR IMAGE of the printed plan: printed x_mm → −x_mm first
 *            (see mirror.ts), then the transform above. Only unitMmToSite (printed coordinates)
 *            applies it; code that already works on mirrorTraced() data (the 3-D viewer, its
 *            surroundings / minimap) uses yawRad + offset directly.
 */
export interface UnitPlacement {
  code: string;
  wing: number;
  /** Plan north-arrow angle, degrees clockwise from page-up (TracedUnit.northDeg) or derived. */
  northDeg: number;
  yawRad: number;
  offsetX: number;
  offsetZ: number;
  /** How northDeg / offset were obtained (north arrow, key-plan inset matched to OSM wing outline, …). */
  method: string;
  /** Fraction of the traced unit outline that falls inside the OSM wing outline after placement (0–1). */
  insideWing?: number;
  kind: Kind;
  confidence: 'high' | 'medium' | 'low';
  notes: string[];
  /**
   * True when this flat is a mirrored copy of the printed plan (x_mm → −x_mm before rotation).
   * northDeg then refers to the MIRRORED drawing (page-up of mirrorTraced(), plan north = yawRad).
   */
  mirrored?: boolean;
}

/** Floor-to-floor and podium heights used to put the eye at a chosen floor (assumed — WingTower massing). */
export const FLOOR_TO_FLOOR_M = 3.0;
export const PODIUM_M = 4.5;

/** Finished-floor level (m above ground) of typical floor `floor` (1 = first typical floor above the podium). */
export function floorLevelM(floor: number): number {
  return PODIUM_M + (floor - 1) * FLOOR_TO_FLOOR_M;
}

/** Unit mm (as PRINTED) → site metres (x east, y north). Mirrored placements flip x first. */
export function unitMmToSite(p: UnitPlacement, [x, y]: Mm2): [number, number] {
  const X = (p.mirrored ? -x : x) / 1000;
  const Z = y / 1000;
  const c = Math.cos(p.yawRad);
  const s = Math.sin(p.yawRad);
  // three.js R_y: X' = c·X + s·Z, Z' = −s·X + c·Z
  const sx = c * X + s * Z + p.offsetX;
  const sz = -s * X + c * Z + p.offsetZ;
  return [sx, -sz];
}

/** Placement for a unit code, or null if unknown. Filled in by tools/trace/placement (see placements.ts). */
export { placementFor } from './placements';
