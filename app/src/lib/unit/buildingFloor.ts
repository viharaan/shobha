import { wings } from '@/data/sobha/wings';
import { floorLevelM } from '@/data/sobha/traced/placement';

/**
 * ONE floor-numbering convention for the home selector, the URL (&floor=) and the 1:1 viewer:
 * BUILDING floor numbers, as used by the snapshot's rate tables (pricing.ts floorRiseBands,
 * PriceHelper). GF and the 1st floor are parking, so typical (residential) floors run
 * 2 … floorsTypical + 1 — 2nd–47th on 46-floor wings, 2nd–46th on 45-floor wings.
 *
 * The viewer's height model (traced/placement.ts floorLevelM) counts TYPICAL floors from 1 = the first
 * typical floor above the podium, so building floor N ↔ typical floor N − 1:
 *   eye/floor height = floorLevelM(N − 1) = podium 4.5 m + (N − 2) × 3.0 m  (both heights assumed).
 *
 * Refuge floors 19 / 29 / 39 (snapshot) are read as building floor numbers — the same numbering the
 * snapshot's floor-rise table uses. Which flat positions exist on them is not printed.
 */
export const MIN_BUILDING_FLOOR = 2;
const FALLBACK_TYPICAL = 46;

const wingOf = (n: number | null | undefined) => (n == null ? undefined : wings.find((w) => w.name === `Wing ${n}`));

/** Top building floor of wing `n` (floorsTypical + 1). */
export function maxBuildingFloor(n: number | null | undefined): number {
  return (wingOf(n)?.floorsTypical ?? FALLBACK_TYPICAL) + 1;
}

/** A mid-height default (24 on both 45- and 46-floor wings — not a refuge floor). */
export function midBuildingFloor(n: number | null | undefined): number {
  return Math.floor((MIN_BUILDING_FLOOR + maxBuildingFloor(n)) / 2);
}

export function refugeFloors(n: number | null | undefined): number[] {
  return wingOf(n)?.refugeFloors ?? [19, 29, 39];
}

export function isRefugeFloor(n: number | null | undefined, floor: number): boolean {
  return refugeFloors(n).includes(floor);
}

export const REFUGE_NOTE = 'refuge floor — flat availability on this floor not printed';

/** Clamp to the wing's typical building floors. */
export function clampBuildingFloor(n: number | null | undefined, floor: number): number {
  return Math.min(Math.max(MIN_BUILDING_FLOOR, Math.round(floor)), maxBuildingFloor(n));
}

/** Building floor → the viewer's typical-floor index (1 = first typical floor above the podium). */
export const typicalIndexOf = (buildingFloor: number) => buildingFloor - 1;

/** Finished-floor level (m above ground, assumed heights) of a building floor. */
export function buildingFloorLevelM(buildingFloor: number): number {
  return floorLevelM(typicalIndexOf(buildingFloor));
}

/** Parse &floor= (building floor). null when absent / not a whole number. */
export function parseFloorParam(v: string | null | undefined): number | null {
  return v != null && /^\d+$/.test(v) ? Number(v) : null;
}

export const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
};
