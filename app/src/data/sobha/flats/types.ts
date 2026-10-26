import type { Kind, Provenance } from '../types';

/**
 * Every flat position on a typical floor of every wing (the "flat directory"), joined with
 * where it sits in the real world and which way it looks.
 *
 * Sources: the sales snapshot site map (08.08.26) prints, per wing, each flat number with its
 * configuration + SBA (e.g. "3B-Grande 1833 SFT") and a facing letter (e.g. "5W" = flat 5,
 * main door faces West). Floor-plan PDF key plans show each tower's floor plate.
 * Typical floors repeat the same flat stack, so one record per (wing, flat) covers all floors.
 */
export type Config = '4B-Grande' | '4B-Luxe' | '3B-Grande' | '3B-Luxe' | '2B-Grande' | '2B-Luxe' | '1BHK';

export interface FlatRecord {
  wing: number;
  /** Flat number on the floor as printed (1, 2, 3 …). */
  flat: number;
  config: Config;
  /** SBA as printed on the snapshot (sq ft). */
  sbaSft: number | null;
  /** Facing letter as printed (main-door direction per the snapshot legend), if any. */
  facing: 'N' | 'E' | 'S' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' | null;
  /**
   * Traced plan used for this flat (A, C3, F1, J8, K3, L5, M5) or null when no printed plan matches
   * (e.g. a 3B-Grande variant whose SBA differs from F1's 1,820 sq ft).
   */
  typeCode: string | null;
  /** True when typeCode's plan is a variant stand-in (same config, different printed SBA). */
  typeIsProxy?: boolean;
  kind: Kind;
  provenance: Provenance[];
  notes?: string[];
}

/** Real-world placement of one flat (same transform convention as traced/placement.ts). */
export interface FlatPlacement {
  wing: number;
  flat: number;
  typeCode: string;
  /**
   * Unit mm → site: if `mirrored`, first x_mm → −x_mm (mirror across the plan's vertical axis),
   * then P_site3D = R_y(yawRad)·P_unit + [offsetX, floorY, offsetZ] (three.js R_y), site 3-D Z = −north.
   */
  mirrored: boolean;
  yawRad: number;
  offsetX: number;
  offsetZ: number;
  /** Compass bearing (deg) the main balcony opening faces after placement. */
  balconyBearingDeg: number | null;
  /** Compass bearing (deg) the main door faces — compare with the printed facing letter. */
  doorBearingDeg: number | null;
  /** Fraction of the placed unit envelope inside the wing outline. */
  insideWing: number;
  method: string;
  confidence: 'high' | 'medium' | 'low';
  kind: Kind;
  notes: string[];
}
