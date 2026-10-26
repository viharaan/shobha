import type { Provenance } from './types';

const SNAPSHOT =
  'SOBHA One Residences at ONE WORLD - Project Snapshot, Unit Numbering, Flat Facing, PLC & FRC_Updated on 08.08.26.pdf';

const SNAPSHOT_RATE = {
  asset: SNAPSHOT,
  note: 'Configuration Breakup & Average Cost (08.08.26): 4 BHK Grande 2,415 sft — 3.86 Cr; 4 BHK Luxe 2,096 sft — 3.33 Cr; 3 BHK Grande 1,735–1,838 sft — 2.81 Cr; 3 BHK Luxe 1,510 sft — 2.34 Cr; 2 BHK Grande 1,204 sft — 1.85 Cr; 2 BHK Luxe 1,063 sft — 1.63 Cr; 1 BHK 734 sft — 1.12 Cr.',
};

const FLOOR_RISE = {
  asset: SNAPSHOT,
  note: 'Floor Rise Charges (08.08.26), per sq ft, by floor band.',
};

const LOC_CHARGES = {
  asset: SNAPSHOT,
  note: 'Preferred Location Charges (08.08.26), per sq ft: Select Rs.0, Prime Rs.222, Prime+ Rs.444 (4 BHK), Elite Rs.444, Elite+ Rs.666 (4 BHK), Grande+ Rs.888 (4 BHK).',
};

/**
 * Basic rates (source, snapshot 08.08.26):
 *  - Pre-launch: ₹13,555 / sq ft
 *  - Launch:     ₹13,999 / sq ft
 * Floor-rise and preferred-location charges apply on top (tables below).
 */
export const BASE_RATE = {
  preLaunch: 13555,
  launch: 13999,
  provenance: [
    {
      asset: SNAPSHOT,
      note: 'Pre-Launch Basic Rate: Rs.13,555/- per SFT; Launch Basic Rate: Rs.13,999/- per SFT.',
    },
  ] as Provenance[],
};

/** Floor-rise bands as printed (floor ranges inclusive, charge per sq ft). */
export interface FloorRiseBand {
  from: number; // floor number (1-based, GF excluded)
  to: number;
  perSqft: number;
}

export const floorRiseBands: FloorRiseBand[] = [
  { from: 2, to: 4, perSqft: 0 },
  { from: 5, to: 9, perSqft: 60 },
  { from: 10, to: 14, perSqft: 120 },
  { from: 15, to: 19, perSqft: 180 },
  { from: 20, to: 24, perSqft: 250 },
  { from: 25, to: 29, perSqft: 320 },
  { from: 30, to: 34, perSqft: 400 },
  { from: 35, to: 39, perSqft: 480 },
  { from: 40, to: 47, perSqft: 570 },
];

export const floorRiseProvenance = [FLOOR_RISE];

/** Preferred-location tiers as printed (charge per sq ft; 4 BHK restriction where noted). */
export interface LocationTier {
  name: 'Select' | 'Prime' | 'Prime+' | 'Elite' | 'Elite+' | 'Grande+';
  perSqft: number;
  only4Bhk: boolean;
  note?: string;
}

export const locationTiers: LocationTier[] = [
  { name: 'Select', perSqft: 0, only4Bhk: false },
  { name: 'Prime', perSqft: 222, only4Bhk: false },
  { name: 'Prime+', perSqft: 444, only4Bhk: true, note: '4 BHK' },
  { name: 'Elite', perSqft: 444, only4Bhk: false },
  { name: 'Elite+', perSqft: 666, only4Bhk: true, note: '4 BHK' },
  { name: 'Grande+', perSqft: 888, only4Bhk: true, note: '4 BHK' },
];

export const locationChargesProvenance = [LOC_CHARGES];

/** Average price per configuration (₹ crore) — the snapshot's "Average Cost" column. */
export const avgPriceProvenance = [SNAPSHOT_RATE];

export function floorRiseForFloor(floor: number): number {
  const band = floorRiseBands.find((b) => floor >= b.from && floor <= b.to);
  return band ? band.perSqft : 0;
}

export interface QuoteInput {
  sbaSqft: number;
  floor: number;
  tier: string; // LocationTier name, e.g. 'Prime'
  rate: 'preLaunch' | 'launch';
}

export interface Quote {
  base: number; // ₹
  floorRise: number; // ₹
  location: number; // ₹
  total: number; // ₹
  totalCr: number; // ₹ crore
}

/**
 * Indicative quote = SBA × base rate + floor-rise + preferred-location charges.
 * ALL INPUTS ARE SOURCE VALUES (snapshot 08.08.26); the arithmetic is ours and the
 * result is an estimate — it is not a vendor quote and excludes other applicable charges.
 */
export function quote(input: QuoteInput): Quote {
  const rate = input.rate === 'preLaunch' ? BASE_RATE.preLaunch : BASE_RATE.launch;
  const base = input.sbaSqft * rate;
  const fr = input.sbaSqft * floorRiseForFloor(input.floor);
  const tier = locationTiers.find((t) => t.name === input.tier);
  const loc = input.sbaSqft * (tier ? tier.perSqft : 0);
  const total = base + fr + loc;
  return { base, floorRise: fr, location: loc, total, totalCr: total / 1e7 };
}

export function formatINR(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
