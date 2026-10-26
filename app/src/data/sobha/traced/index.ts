import type { TracedUnit } from './types';
import a from './a';
import c3 from './c3';
import f1 from './f1';
import j8 from './j8';
import k3 from './k3';
import l5 from './l5';
import m5 from './m5';

export type { TracedUnit, TracedRoom, TracedWall, TracedOpening, TracedRoomKind, Mm2 } from './types';

const ALL: Record<string, TracedUnit | null> = { A: a, C3: c3, F1: f1, J8: j8, K3: k3, L5: l5, M5: m5 };

/** Traced geometry for a unit code, or null if that type has not been traced yet. */
export function tracedFor(code: string): TracedUnit | null {
  return ALL[code.toUpperCase()] ?? null;
}
