import type { Wing } from './types';
import { OSM_WINGS } from './siteFrame';

const SNAPSHOT =
  'SOBHA One Residences at ONE WORLD - Project Snapshot, Unit Numbering, Flat Facing, PLC & FRC_Updated on 08.08.26.pdf';
const MASTERPLAN = 'SOBHA_OneWorld_Masterplan.pdf';
const PLANS = 'SOBHA_ONEWORLD_Floor plans.pdf';

const posNote = (osmWay: number) => ({
  asset: 'OpenStreetMap contributors (ODbL)',
  note: `Position & footprint from OSM way ${osmWay} (community-mapped wing outline; footprint = √area). ` +
    'Arrangement matches the snapshot/master-plan site map. NOT survey data.',
  url: `https://www.openstreetmap.org/way/${osmWay}`,
});
const MASTERPLAN_NOTE = {
  asset: MASTERPLAN,
  note: 'Wing numbering/arrangement cross-checked against the master plan; earlier raster-read positions superseded by OSM (2026-10-20).',
};

const MASSING: Wing['massing'] = {
  kind: 'illustrative',
  floorHeightM: 3.0, // assumed typical floor height — not stated in any source asset
  podiumM: 4.5, // assumed podium height
};

interface WingSpec {
  n: number;
  unitTypeCode: string | null;
  planWingNote?: string;
}

const SPECS: WingSpec[] = [
  {
    n: 1,
    unitTypeCode: 'A',
    planWingNote:
      'Source conflict: the snapshot site map labels the "4B-Grande 2415 SFT" tower on Wing 2, while the floor-plan PDF prints "Type A — Wing 1". App follows the floor-plan PDF (type-specific print); flagged for vendor confirmation.',
  },
  {
    n: 2,
    unitTypeCode: 'F1',
    planWingNote:
      'Source conflict: the snapshot site map labels the "3B-Grande" towers on Wing 1, while the floor-plan PDF prints "Type F1 — Wing 2". App follows the floor-plan PDF (type-specific print); flagged for vendor confirmation.',
  },
  { n: 3, unitTypeCode: null },
  { n: 4, unitTypeCode: null },
  { n: 5, unitTypeCode: null },
  { n: 6, unitTypeCode: null },
  { n: 7, unitTypeCode: null },
  { n: 8, unitTypeCode: 'C3' },
  { n: 9, unitTypeCode: 'J8' },
  { n: 10, unitTypeCode: 'L5' },
  { n: 11, unitTypeCode: null },
  { n: 12, unitTypeCode: null },
  { n: 13, unitTypeCode: 'K3' },
  { n: 14, unitTypeCode: 'M5' },
];

const PHASE_BY_WING: Record<number, { phase: number; completion: string }> = {
  1: { phase: 1, completion: 'Jul 2032' },
  2: { phase: 1, completion: 'Jul 2032' },
  3: { phase: 2, completion: 'Nov 2032' },
  4: { phase: 2, completion: 'Nov 2032' },
  5: { phase: 3, completion: 'Sep 2033' },
  6: { phase: 3, completion: 'Sep 2033' },
  7: { phase: 4, completion: 'Sep 2033' },
  8: { phase: 4, completion: 'Sep 2033' },
  9: { phase: 5, completion: 'Feb 2033' },
  10: { phase: 5, completion: 'Feb 2033' },
  11: { phase: 5, completion: 'Feb 2033' },
  12: { phase: 6, completion: 'Aug 2032' },
  13: { phase: 6, completion: 'Aug 2032' },
  14: { phase: 6, completion: 'Aug 2032' },
};

export const wings: Wing[] = SPECS.map((s) => {
  const tall = [1, 2, 9, 10, 11, 12, 13, 14].includes(s.n); // 46 typical floors (source)
  const phase = PHASE_BY_WING[s.n];
  const osm = OSM_WINGS.find((o) => o.n === s.n)!;
  return {
    id: `wing-${s.n}`,
    name: `Wing ${s.n}`,
    kind: 'external', // position/footprint from OSM; floor counts are source (see provenance)
    provenance: [
      { asset: SNAPSHOT, note: `Floor stack (3 basements + GF & 1st-floor parking + ${tall ? 46 : 45} typical floors), refuge floors 19/29/39, phase & completion.` },
      posNote(osm.osmWay),
      MASTERPLAN_NOTE,
      ...(s.unitTypeCode
        ? [
            { asset: PLANS, note: `Carries sample plan type ${s.unitTypeCode} (wing mapping printed on plan).` },
            ...(s.planWingNote ? [{ asset: SNAPSHOT, note: s.planWingNote }] : []),
          ]
        : [{ asset: SNAPSHOT, note: 'No sample plan printed for this wing; mixed configurations.' }]),
    ],
    floorsTypical: tall ? 46 : 45,
    basements: 3,
    parkingLevelsAbove: 2,
    refugeFloors: [19, 29, 39],
    phase,
    unitTypeCode: s.unitTypeCode ?? '',
    sitePos: { x: osm.pos[0], y: osm.pos[1] },
    footprintM: osm.footprint,
    massing: MASSING,
  };
});

/** Derived tower height (m) for massing only — illustrative. */
export const wingHeightM = (w: Wing): number =>
  w.floorsTypical * w.massing.floorHeightM + w.massing.podiumM;

export default wings;
