import { PLANS } from '@/data/manifest';
import { FLOOR_RISE, PHASES, PROJECT, TOWERS, UNIT_TYPES } from '@/data/project';
import { UNLABELLED_WINGS, flatFor, flatsForWing } from '@/data/sobha/flats/directory';
import { flatPlacementOf } from '@/data/sobha/flats/loader';
import type { FlatRecord } from '@/data/sobha/flats/types';
import type { DataStatus } from '@/data/types';
import { indicativePrice } from '@/lib/pricing';
import type { HomeRef } from '@/lib/shortlist';
import { pageHref } from '@/lib/urlState';

/** Everything the UI shows about one home, resolved from the directory, placements and project data. */
export interface HomeView {
  ref: HomeRef;
  record: FlatRecord | null;
  label: string; // "Wing 1 · Flat 5 · Floor 12"
  planId: string | null;
  carpetSqft: number | null;
  tower: (typeof TOWERS)[number] | null;
  phase: (typeof PHASES)[number] | null;
  balconyBearingDeg: number | null;
  doorBearingDeg: number | null;
  placementConfidence: 'high' | 'medium' | 'low' | null;
  refuge: boolean;
  floorRiseRate: number;
  maxFloor: number;
  /** null when the wing carries no labels on the sales sheet */
  labelled: boolean;
}

export const CONFIGS = ['4B-Grande', '4B-Luxe', '3B-Grande', '3B-Luxe', '2B-Grande', '2B-Luxe', '1BHK'] as const;

export const compass = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export function homeLabel(h: HomeRef) {
  return `Wing ${h.wing} · Flat ${h.flat} · Floor ${h.floor}`;
}

export function statusForKind(kind: string | undefined): DataStatus {
  if (kind === 'source') return 'source';
  if (kind === 'external') return 'external';
  if (kind === 'unverified') return 'unverified';
  return 'approximate'; // estimated, illustrative
}

export function resolveHome(ref: HomeRef): HomeView {
  const record = flatFor(ref.wing, ref.flat) ?? null;
  const tower = TOWERS.find((t) => t.wing === ref.wing) ?? null;
  const phase = PHASES.find((p) => p.wings.includes(ref.wing)) ?? null;
  const plan = record?.typeCode ? PLANS.find((p) => p.typeCode === record.typeCode) ?? null : null;
  const ut = record?.typeCode ? UNIT_TYPES.find((u) => u.code === record.typeCode) : undefined;
  const pl = flatPlacementOf(ref.wing, ref.flat);
  const band = FLOOR_RISE.find((b) => ref.floor + 1 >= b.from && ref.floor + 1 <= b.to);
  return {
    ref,
    record,
    label: homeLabel(ref),
    planId: plan?.id ?? null,
    carpetSqft: ut?.carpetSqft ?? null,
    tower,
    phase,
    balconyBearingDeg: pl?.balconyBearingDeg ?? null,
    doorBearingDeg: pl?.doorBearingDeg ?? null,
    placementConfidence: pl?.confidence ?? null,
    refuge: PROJECT.refugeFloors.includes(ref.floor),
    floorRiseRate: band?.rate ?? (ref.floor + 1 > 47 ? FLOOR_RISE[FLOOR_RISE.length - 1].rate : 0),
    maxFloor: tower?.typicalFloors ?? 46,
    labelled: !UNLABELLED_WINGS.includes(ref.wing),
  };
}

/** Indicative price for a resolved home, or null when the SBA is not printed. Typical floor n ≈ storey n+1 for the FRC band. */
export function homePrice(v: HomeView, plcTier = 'Select') {
  if (!v.record?.sbaSft) return null;
  return indicativePrice(v.record.sbaSft, v.ref.floor + 1, plcTier);
}

export const wingHasRecords = (wing: number) => flatsForWing(wing).length > 0;

export function hrefForPlan(v: HomeView) {
  if (!v.planId) return null;
  return pageHref({ mode: 'home', plan: v.planId, wing: v.ref.wing, flat: v.ref.flat, floor: v.ref.floor });
}

export const hrefForSite = (h: HomeRef) => pageHref({ wing: h.wing, floor: h.floor });
export const hrefForHome = (h: HomeRef) => pageHref({ wing: h.wing, flat: h.flat, floor: h.floor }, 'find');
