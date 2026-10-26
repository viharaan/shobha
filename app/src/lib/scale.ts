import type { PlanCalibration, PlanRecord } from '@/data/types';

/** metres per SVG user unit for a plan, honouring a user calibration stored in this browser. */
export function metresPerUnit(plan: PlanRecord, override?: PlanCalibration | null): number {
  return (override?.mmPerPt ?? plan.calibration.mmPerPt) / 1000;
}

const KEY = (id: string) => `shobha.plan-calibration.${id}`;

export function loadCalibration(id: string): PlanCalibration | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY(id));
    return raw ? (JSON.parse(raw) as PlanCalibration) : null;
  } catch {
    return null;
  }
}

export function saveCalibration(id: string, c: PlanCalibration | null) {
  try {
    if (c) window.localStorage.setItem(KEY(id), JSON.stringify(c));
    else window.localStorage.removeItem(KEY(id));
  } catch {
    /* storage unavailable: calibration lives for this page only */
  }
}

/** Plan-local metres: origin at the centre of the wall polygon, x right, y down (SVG convention). */
export function ptToPlanMetres(plan: PlanRecord, mPerUnit: number, x: number, y: number): [number, number] {
  const [x0, y0, x1, y1] = plan.wallBboxPt;
  return [(x - (x0 + x1) / 2) * mPerUnit, (y - (y0 + y1) / 2) * mPerUnit];
}

export const sqftToSqm = (sqft: number) => sqft * 0.09290304;
export const fmtM = (m: number, digits = 2) => `${m.toFixed(digits)} m`;
export const fmtInr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
export const fmtCr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`;
