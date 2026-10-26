import type { Realm } from './types';

const MASTERPLAN = 'SOBHA_OneWorld_Masterplan.pdf';
const BROCHURE = 'SOBHA OneWorld_Mobile Brochure.pdf';

/** One-line narrative card for each of the six named amenity realms on the
 *  master plan. Names and legend groupings are as printed in the master-plan
 *  legend; stadium dimensions and the One Club size are the figures stated in
 *  the source assets. No flora or brand names are asserted beyond the theme. */
export interface RealmCard {
  name: Realm;
  blurb: string;
  note: string;
}

export const realms: RealmCard[] = [
  {
    name: 'Temperate Enclave',
    blurb:
      'The social heart of the plan — OneWorld Plaza, Festival Lawn, Activity Deck, Wellness Gardens, Observation Deck, and the Leisure and Kids’ pools.',
    note: `Master-plan legend, codes A–G (${MASTERPLAN}).`,
  },
  {
    name: 'Mediterranean Serenity',
    blurb:
      'A quieter promenade zone — Oasis Trail, Dry Stream, Tuscan Gardens, Exhibition Square, and the Amphitheatre.',
    note: `Master-plan legend, codes H–L (${MASTERPLAN}).`,
  },
  {
    name: 'Tropical Zen',
    blurb:
      'A wellness-and-play cluster — Tranquillity Falls, Lagoon Cove, Reflexology Walk, Rainforest Field, Yoga Lawn, Zen Courtyard, Play Park, Skating Rink, and Tropicana Gardens.',
    note: `Master-plan legend, codes M–U (${MASTERPLAN}).`,
  },
  {
    name: 'World Stadium',
    blurb:
      'The sport core of the site — a 90 m celebration/cricket/football field, a 350 m running track, the 750 m jogging & cycling loop, and 1,070 m of connected trails.',
    note: `Stadium sizes as stated in the master plan; legend codes V–X (${MASTERPLAN}).`,
  },
  {
    name: 'Continental Grounds',
    blurb:
      'Courts and lawns for everyday play — Pickle Ball Courts, Play Lawn, Tennis Courts, Multi-sport Court, Fitness Lawn, and Pet Park.',
    note: `Master-plan legend, codes Y–AD (${MASTERPLAN}).`,
  },
  {
    name: 'One Club',
    blurb:
      'The clubhouse — One Club, stated at 1,20,000 sq ft on 2.4 acres.',
    note: `One Club size as stated in the brochure (${BROCHURE}); CA site marked on the master plan.`,
  },
];

export default realms;
