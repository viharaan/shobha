import { FLOOR_RISE, PLC_TIERS, PROJECT } from '@/data/project';

export function floorRiseRate(floor: number): number {
  const band = FLOOR_RISE.find((b) => floor >= b.from && floor <= b.to);
  return band ? band.rate : floor > 47 ? FLOOR_RISE[FLOOR_RISE.length - 1].rate : 0;
}

export function plcRate(tier: string): number {
  return PLC_TIERS.find((t) => t.tier === tier)?.rate ?? 0;
}

/**
 * The highest preferred-location (PLC) tier that can apply to a home with this many bedrooms: some tiers are 4 BHK
 * only. The sheet does not say which tier a given flat carries, so prices are shown from the base tier up to this one.
 */
export function topPlcTier(bedrooms: number): { tier: string; rate: number } {
  const ok = PLC_TIERS.filter((t) => !('only' in t) || (t.only === '4 BHK' && bedrooms === 4));
  return ok.reduce((a, b) => (b.rate > a.rate ? b : a), ok[0]);
}

/** Indicative all-in base price in ₹ (basic + FRC + PLC) × SBA. Excludes taxes, parking, deposits, GST. */
export function indicativePrice(sbaSqft: number, floor: number, plcTier = 'Select', basic = PROJECT.basicRatePerSqft.launch) {
  const perSqft = basic + floorRiseRate(floor) + plcRate(plcTier);
  return { perSqft, total: perSqft * sbaSqft };
}
