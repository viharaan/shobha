import type { Provenance } from '../types';

/**
 * Traced unit plans — wall-level geometry extracted from the VECTOR floor-plan PDF
 * (SOBHA_ONEWORLD_Floor plans.pdf, Adobe Illustrator; see tools/plan_vector.py).
 *
 * Unit frame: millimetres, x → right, y → down, exactly as the plan is drawn on the page
 * (mm = (pdfPoint − frame.originPt) × frame.mmPerPt). 3-D/VR maps x→X, y→Z (metres = mm/1000).
 * Scale is derived from the plan's own printed room dimensions (several labels, least squares),
 * so every traced length is checkable against the print.
 */
export type Mm2 = [number, number];

export type TracedRoomKind =
  | 'living'
  | 'bedroom'
  | 'wet'
  | 'kitchen'
  | 'utility'
  | 'balcony'
  | 'foyer'
  | 'closet'
  | 'circulation'
  | 'other';

export interface TracedRoom {
  /** Name as used in src/data/units.ts rooms (e.g. 'Bedroom 1 (master)'); spaces not listed there get a plain name (e.g. 'Passage'). */
  name: string;
  /** Label text as printed on the plan (e.g. 'BEDROOM 1'), or '' if unlabelled. */
  printedName: string;
  kind: TracedRoomKind;
  /** Clear (inside-wall) room outline, mm, unit frame, closed implicitly. */
  polygon: Mm2[];
  /** Printed width × depth (mm) from the plan label, if the room has one. */
  printedMm?: Mm2;
  /** Traced width × depth (mm) measured on the polygon along the same axes as the printed label. */
  tracedMm: Mm2;
  /** max(|traced − printed| / printed) × 100 over both axes; undefined when not printed. */
  errPct?: number;
}

export interface TracedWall {
  /** Wall centre-line endpoints, mm. */
  a: Mm2;
  b: Mm2;
  thicknessMm: number;
  kind: 'external' | 'internal' | 'parapet';
}

export interface TracedOpening {
  /** Opening extent along its wall, mm (centre-line points at each jamb). */
  a: Mm2;
  b: Mm2;
  kind: 'door' | 'sliding' | 'window' | 'opening';
  /** Rooms on either side (names as in rooms[]), when known. */
  between?: [string, string];
}

export interface TracedUnit {
  code: string;
  /** PDF page (1-based) in SOBHA_ONEWORLD_Floor plans.pdf. */
  page: number;
  frame: { originPt: Mm2; mmPerPt: number; method: string };
  /** Main entrance door midpoint, mm. */
  entry: Mm2;
  /** Direction of the drawing's north arrow, degrees clockwise from page-up (if read). */
  northDeg?: number;
  /**
   * True for a MIRRORED copy of the printed plan (mirror.ts: x_mm → −x_mm, winding reversed,
   * northDeg flipped). Geometry is then no longer "as printed" — captions must say so.
   */
  mirrored?: boolean;
  rooms: TracedRoom[];
  walls: TracedWall[];
  openings: TracedOpening[];
  validation: {
    roomsChecked: number;
    maxErrPct: number;
    meanErrPct: number;
    /** Sum of non-balcony room polygon areas, m². */
    roomAreaSumM2: number;
    /** Printed carpet area, m² (for comparison; carpet definitions include some wall/duct allowances). */
    carpetM2: number | null;
    notes: string[];
  };
  provenance: Provenance[];
}
