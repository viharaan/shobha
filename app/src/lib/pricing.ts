import { FLOOR_RISE, PLC_TIERS, PROJECT } from '@/data/project';

export function floorRiseRate(floor: number): number {
  const band = FLOOR_RISE.find((b) => floor >= b.from && floor <= b.to);
  return band ? band.rate : floor > 47 ? FLOOR_RISE[FLOOR_RISE.length - 1].rate : 0;
}

export function plcRate(tier: string): number {
  return PLC_TIERS.find((t) => t.tier === tier)?.rate ?? 0;
}

/** Indicative all-in base price in ₹ (basic + FRC + PLC) × SBA. Excludes taxes, parking, deposits, GST. */
export function indicativePrice(sbaSqft: number, floor: number, plcTier = 'Select', basic = PROJECT.basicRatePerSqft.launch) {
  const perSqft = basic + floorRiseRate(floor) + plcRate(plcTier);
  return { perSqft, total: perSqft * sbaSqft };
}
