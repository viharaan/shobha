import { FLATS, flatFor } from './directory';
import { FLAT_PLACEMENTS, flatPlacement } from './placements';
import type { FlatPlacement, FlatRecord } from './types';
import type { UnitPlacement } from '../traced/placement';
import { placementFor } from '../traced/placements';

const RECORDS: FlatRecord[] = FLATS;
const PLACEMENTS: FlatPlacement[] = FLAT_PLACEMENTS;

export const FLAT_DATA = { directory: FLATS.length > 0, placements: FLAT_PLACEMENTS.length > 0 };

export function flatRecord(wing: number, flat: number): FlatRecord | null {
  return flatFor(wing, flat) ?? null;
}

export function flatPlacementOf(wing: number, flat: number): FlatPlacement | null {
  return flatPlacement(wing, flat) ?? null;
}

/** One pickable flat: its directory row and / or its placement (either may be missing). */
export interface FlatChoice {
  wing: number;
  flat: number;
  record: FlatRecord | null;
  placement: FlatPlacement | null;
  /** The traced plan is only a variant stand-in for this flat (FlatRecord.typeIsProxy). */
  proxy: boolean;
}

/** Flats drawn from type `code`'s traced plan (incl. variant-plan proxies), in wing / flat order. */
export function flatsForType(code: string): FlatChoice[] {
  const c = code.toUpperCase();
  const out = new Map<string, FlatChoice>();
  for (const r of RECORDS) {
    if ((r.typeCode ?? '').toUpperCase() !== c) continue;
    out.set(`${r.wing}:${r.flat}`, { wing: r.wing, flat: r.flat, record: r, placement: flatPlacementOf(r.wing, r.flat), proxy: !!r.typeIsProxy });
  }
  // placements without a directory row still count (typeCode is on the placement)
  for (const p of PLACEMENTS) {
    const k = `${p.wing}:${p.flat}`;
    if (p.typeCode.toUpperCase() !== c || out.has(k)) continue;
    const r = flatRecord(p.wing, p.flat);
    out.set(k, { wing: p.wing, flat: p.flat, record: r, placement: p, proxy: !!r?.typeIsProxy });
  }
  return Array.from(out.values()).sort((a, b) => a.wing - b.wing || a.flat - b.flat);
}

/**
 * The flat the printed type plan itself shows (the one highlighted on its KEY PLAN, whose
 * placement is traced/placements.ts) — read from that placement's notes ("… highlighted flat 5 …").
 */
export function representativeFlat(code: string): { wing: number; flat: number } | null {
  const p = placementFor(code);
  if (!p) return null;
  for (const n of p.notes) {
    const m = /highlighted flat (\d+)/i.exec(n);
    if (m) return { wing: p.wing, flat: Number(m[1]) };
  }
  return null;
}

/** FlatPlacement → the viewer's UnitPlacement (yaw, offset, mirrored). Plan north = yaw. */
export function unitPlacementFromFlat(fp: FlatPlacement): UnitPlacement {
  const north = (((fp.yawRad * 180) / Math.PI) % 360 + 360) % 360;
  return {
    code: fp.typeCode,
    wing: fp.wing,
    northDeg: Math.round(north * 10) / 10,
    yawRad: fp.yawRad,
    offsetX: fp.offsetX,
    offsetZ: fp.offsetZ,
    method: fp.method,
    insideWing: fp.insideWing,
    kind: fp.kind,
    confidence: fp.confidence,
    notes: fp.notes,
    mirrored: fp.mirrored,
  };
}
