import type { MasterplanTrace } from './masterplanTypes';
import trace from './masterplanTraced';

/** Master-plan trace (generated in the sister extraction project, tools/trace/masterplan.py). Static import: the file is always present here. */
export const MASTERPLAN_TRACE: MasterplanTrace = trace;

export const SITE_REGISTRATION = {
  traced: true as const,
  rmsM: trace.fit.rmsM,
  controlPoints: trace.fit.controlPoints,
  method: trace.fit.method,
};
