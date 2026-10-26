import type { Amenity, Realm, SitePoint } from './types';
import { fromPlan } from './siteFrame';
import { MASTERPLAN_TRACE as TRACE } from './masterplanTraceLoader';

const MASTERPLAN = 'SOBHA_OneWorld_Masterplan.pdf';
const LEGEND_NOTE = 'Name + legend grouping printed in the master-plan legend (authoritative).';
/** Older placement: raster-read positions through the plan→site fit (siteFrame.ts, RMS 14.3 m). */
const POS_NOTE_FALLBACK =
  'Position estimated from the master-plan raster, then mapped to true scale with the plan→site fit against 14 OSM wing outlines (src/data/siteFrame.ts; RMS 14 m). Approximate.';
/** Traced placement: printed legend-letter position on the registered master plan. */
const POS_NOTE_TRACED = (rms: number) =>
  `Position = the printed legend letter on the master plan, traced and registered to the site frame by a similarity fit on the 14 OSM wing outlines (src/data/masterplanTraced.ts; RMS ${rms.toFixed(1)} m). Approximate.`;

/** Traced legend-letter positions (site metres), when the master-plan trace is present. */
const TRACED_POS = new Map<string, SitePoint>((TRACE?.amenities ?? []).map((a) => [a.code, a.pos]));
/** All printed positions of a code (the trace adds `allPos` when a code is printed more than once). */
const TRACED_ALL = new Map<string, SitePoint[]>(
  (TRACE?.amenities ?? []).map((a) => [a.code, (a as { allPos?: SitePoint[] }).allPos ?? []]),
);

interface Spec {
  code: string;
  name: string;
  realm: Realm;
  /** position read off the master-plan raster (plan frame; converted with fromPlan) */
  pos: [number, number] | null;
}

const SPECS: Spec[] = [
  // Temperate Enclave
  { code: 'A', name: 'OneWorld Plaza', realm: 'Temperate Enclave', pos: [-560, 14] },
  { code: 'B', name: 'Festival Lawn', realm: 'Temperate Enclave', pos: [-434, 140] },
  { code: 'C', name: 'Activity Deck', realm: 'Temperate Enclave', pos: [-378, 224] },
  { code: 'D', name: 'Wellness Gardens', realm: 'Temperate Enclave', pos: [-630, -112] },
  { code: 'E', name: 'Observation Deck', realm: 'Temperate Enclave', pos: [-742, 98] },
  { code: 'F', name: 'Leisure Pool', realm: 'Temperate Enclave', pos: [-98, 168] },
  { code: 'G', name: "Kids' Pool", realm: 'Temperate Enclave', pos: [-182, 98] },
  // Mediterranean Serenity
  { code: 'H', name: 'Oasis Trail', realm: 'Mediterranean Serenity', pos: [266, 224] },
  { code: 'I', name: 'Dry Stream', realm: 'Mediterranean Serenity', pos: [224, 98] },
  { code: 'J', name: 'Tuscan Gardens', realm: 'Mediterranean Serenity', pos: [154, 280] },
  { code: 'K', name: 'Exhibition Square', realm: 'Mediterranean Serenity', pos: [98, 392] },
  { code: 'L', name: 'Amphitheatre', realm: 'Mediterranean Serenity', pos: [70, 476] },
  // Tropical Zen
  { code: 'M', name: 'Tranquillity Falls', realm: 'Tropical Zen', pos: [-238, -224] },
  { code: 'N', name: 'Lagoon Cove', realm: 'Tropical Zen', pos: [-322, -336] },
  { code: 'O', name: 'Reflexology Walk', realm: 'Tropical Zen', pos: [-126, -448] },
  { code: 'P', name: 'Rainforest Field', realm: 'Tropical Zen', pos: [70, -616] },
  { code: 'Q', name: 'Yoga Lawn', realm: 'Tropical Zen', pos: [154, -700] },
  { code: 'R', name: 'Zen Courtyard', realm: 'Tropical Zen', pos: [238, -588] },
  { code: 'S', name: 'Play Park', realm: 'Tropical Zen', pos: [350, -672] },
  { code: 'T', name: 'Skating Rink', realm: 'Tropical Zen', pos: [210, -784] },
  { code: 'U', name: 'Tropicana Gardens', realm: 'Tropical Zen', pos: [406, -560] },
  // World Stadium
  { code: 'V', name: 'Jogging / Cycling Track', realm: 'World Stadium', pos: [0, 0] },
  { code: 'W', name: 'Celebration Field / Cricket Ground / Football Field', realm: 'World Stadium', pos: [0, -28] },
  { code: 'X', name: 'Running Track', realm: 'World Stadium', pos: [0, -20] },
  // Continental Grounds
  { code: 'Y', name: 'Pickle Ball Courts', realm: 'Continental Grounds', pos: [588, 182] },
  { code: 'Z', name: 'Play Lawn', realm: 'Continental Grounds', pos: [518, -56] },
  { code: 'AA', name: 'Tennis Courts', realm: 'Continental Grounds', pos: [420, -448] },
  { code: 'AB', name: 'Multi-sport Court', realm: 'Continental Grounds', pos: [476, -336] },
  { code: 'AC', name: 'Fitness Lawn', realm: 'Continental Grounds', pos: [546, -196] },
  { code: 'AD', name: 'Pet Park', realm: 'Continental Grounds', pos: [434, -280] },
  // Access & Utilities
  { code: '1', name: 'Entrance Gateway', realm: 'Access & Utilities', pos: [-1064, -56] },
  { code: '2', name: 'Common Exit', realm: 'Access & Utilities', pos: [-1120, -168] },
  { code: '3', name: 'Entry/Exit Roundabout', realm: 'Access & Utilities', pos: [-1176, -224] },
  { code: '4', name: 'Exit Gateway', realm: 'Access & Utilities', pos: [-1008, 28] },
  { code: '5', name: 'One Club Drop-off', realm: 'Access & Utilities', pos: [-596, 168] },
  { code: '6', name: 'Jogging / Pathway', realm: 'Access & Utilities', pos: null },
  { code: '7', name: 'Tower Drop-off / School Bus Bay', realm: 'Access & Utilities', pos: [-182, 28] },
  { code: '8', name: 'One Emporium Entrance', realm: 'Access & Utilities', pos: [658, -616] },
  { code: '9', name: 'One Emporium Parking', realm: 'Access & Utilities', pos: [728, -672] },
  { code: '10', name: 'OWC', realm: 'Access & Utilities', pos: [-518, -392] },
  { code: '11', name: 'DG Power House', realm: 'Access & Utilities', pos: [-596, -476] },
];

export const amenities: Amenity[] = SPECS.map((s) => {
  const traced = TRACED_POS.get(s.code);
  return {
    id: `amenity-${s.code}`,
    code: s.code,
    name: s.name,
    realm: s.realm,
    kind: 'estimated', // positions are estimated; names are source (see provenance)
    provenance: [
      { asset: MASTERPLAN, note: LEGEND_NOTE },
      ...(traced
        ? [{ asset: MASTERPLAN, note: POS_NOTE_TRACED(TRACE!.fit.rmsM) }]
        : s.pos
          ? [{ asset: MASTERPLAN, note: POS_NOTE_FALLBACK }]
          : []),
    ],
    sitePos: traced ? { x: traced.x, y: traced.y } : s.pos ? fromPlan(s.pos) : null,
    // other printed copies of the same code (pos itself = the medoid, excluded here)
    extraPos: (TRACED_ALL.get(s.code) ?? []).filter((p) => !traced || Math.hypot(p.x - traced.x, p.y - traced.y) > 1),
  };
});

/** Mean of a traced feature's ring (site metres), for landmark anchors. */
function tracedCentre(kind: 'club' | 'emporium'): SitePoint | null {
  const r = TRACE?.features.find((f) => f.kind === kind && f.ring && f.ring.length >= 3)?.ring;
  if (!r) return null;
  return { x: r.reduce((a, p) => a + p.x, 0) / r.length, y: r.reduce((a, p) => a + p.y, 0) / r.length };
}

/** One Club & One Emporium landmark masses (illustrative placement). */
export const landmarks = {
  oneClub: {
    id: 'one-club',
    name: 'One Club (Clubhouse, CA site)',
    size: '1,20,000 sq ft on 2.4 acres (brochure)',
    sitePos: tracedCentre('club') ?? fromPlan([-756, 252]),
    kind: 'estimated' as const,
    provenance: [
      { asset: 'SOBHA OneWorld_Mobile Brochure.pdf', note: 'One Club ~1,20,000 sq ft; master plan marks the CA site location.' },
    ],
  },
  oneEmporium: {
    id: 'one-emporium',
    name: 'One Emporium (Retail)',
    size: '65,000 sq ft F&B/lifestyle retail on 30 m boulevard (brochure)',
    sitePos: tracedCentre('emporium') ?? fromPlan([690, -640]),
    kind: 'estimated' as const,
    provenance: [
      { asset: 'SOBHA OneWorld_Mobile Brochure.pdf', note: 'One Emporium 65,000 sq ft; location from master plan retail block.' },
    ],
  },
};

export const REALMS: Realm[] = [
  'Temperate Enclave',
  'Mediterranean Serenity',
  'Tropical Zen',
  'World Stadium',
  'Continental Grounds',
  'One Club',
  'Access & Utilities',
];

export const realmColor: Record<Realm, string> = {
  'Temperate Enclave': '#e0862e',
  'Mediterranean Serenity': '#e05c5c',
  'Tropical Zen': '#e8c33a',
  'World Stadium': '#8b7fd4',
  'Continental Grounds': '#c26ba8',
  'One Club': '#3aa88f',
  'Access & Utilities': '#8fa3bf',
};

export default amenities;
