import type { NearbyPoi, PlannedCorridor, SiteLocation } from './types';
import { SITE_ORIGIN } from './siteFrame';

const BROCHURE = 'SOBHA OneWorld_Mobile Brochure.pdf';
const VENDOR_PAGE = 'https://www.sobha.com/bengaluru/sobha-oneworld-greater-whitefield/';
const NOMINATIM = (q: string) => `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json`;

/**
 * GEOGRAPHIC ANCHOR (updated 2026-10-20 — no coordinates exist in the source assets).
 *
 * Current anchor: area centroid of the OpenStreetMap site polygon "Sobha One World"
 * (way 1427347113; developer-tagged; source = MoEFCC Parivesh EC proposal 135717602).
 * Its area (49.13 ac) matches the printed 48.38 ac within 1.6 %, and OSM's "Wing 1–14"
 * outlines inside it reproduce the snapshot site map — see src/data/siteFrame.ts.
 *
 * Superseded anchor (2026-10-18): 13.065, 77.775, triangulated from the brochure's stated
 * landmark distances + Nominatim geocodes (±2 km). It lies ~0.6 km NNW of the OSM centroid,
 * i.e. within its stated uncertainty — the two methods agree.
 *
 * Corridors carry NO geometry: the brochure names them as proposals but provides no alignment,
 * so the map deliberately draws no lines for them (list only, "as proposed").
 */
export const location: SiteLocation & {
  pois: NearbyPoi[];
  corridors: PlannedCorridor[];
} = {
  id: 'site-location',
  kind: 'external',
  centroid: SITE_ORIGIN,
  confidence: 'high',
  address: 'Greater Whitefield, Old Madras Road, Bengaluru, Karnataka 562114, India',
  siteAreaAcres: 48,
  notes: [
    'Anchor = centroid of the OSM "Sobha One World" site polygon (area matches the printed 48.38 ac within 1.6 %).',
    'Community-mapped, not a survey pin; earlier brochure-distance triangulation (13.065, 77.775) agrees within ~0.6 km.',
    'No POI coordinates were recomputed into travel times — none are shown.',
  ],
  provenance: [
    {
      asset: 'OpenStreetMap contributors (ODbL)',
      note: 'Way 1427347113 "Sobha One World" (landuse=construction, developer=Sobha Group, source=Parivesh EC proposal 135717602); area-centroid 13.06012, 77.77588.',
      url: 'https://www.openstreetmap.org/way/1427347113',
    },
    {
      asset: 'vendor project page (address source)',
      note: '"SOBHA OneWorld is located in Greater Whitefield, along Old Madras Road, Bengaluru, Karnataka 562114."',
      url: VENDOR_PAGE,
    },
    {
      asset: BROCHURE,
      note: 'Nearby distances as stated: Orion Uptown Mall ~2 km; Bearys Global Research ~3 km; Brigade Signature Towers ~4 km; Decathlon OMR ~4 km; ITPL/GR Tech Park ~10 km; Phoenix Marketcity ~14 km.',
    },
    {
      asset: 'OSM Nominatim geocodes (landmark anchors)',
      note: 'Orion Uptown Mall 13.0555194, 77.7637071; Bearys Global Research 13.0392234, 77.7586543; Brigade Signature Towers 13.0541619, 77.7616936; Decathlon OMR 13.0419394, 77.7435020.',
      url: NOMINATIM('Orion Uptown Mall, Bengaluru'),
    },
  ],
  pois: [
    {
      id: 'poi-orion',
      name: 'Orion Uptown Mall',
      kind: 'source',
      poiKind: 'mall',
      distanceKmStated: 2,
      pos: { lat: 13.0555194, lng: 77.7637071 },
      sourceNote: 'Distance as stated in brochure; position OSM-geocoded.',
      provenance: [
        { asset: BROCHURE, note: '"Orion Uptown Mall ~2 km" (marketing statement).' },
        {
          asset: 'OSM Nominatim',
          note: 'Orion Uptown Mall, Old Madras Road, Huskur Kodi (Huskuru).',
          url: NOMINATIM('Orion Uptown Mall, Bengaluru'),
        },
      ],
    },
    {
      id: 'poi-bearys',
      name: 'Bearys Global Research',
      kind: 'source',
      poiKind: 'techpark',
      distanceKmStated: 3,
      pos: { lat: 13.0392234, lng: 77.7586543 },
      sourceNote: 'Distance as stated in brochure; position OSM-geocoded.',
      provenance: [
        { asset: BROCHURE, note: '"Bearys Global Research ~3 km" (marketing statement).' },
        {
          asset: 'OSM Nominatim',
          note: 'Bearys Global Research Triangle, Goravigere/Konadasapura.',
          url: NOMINATIM('Bearys Global Research, Bengaluru'),
        },
      ],
    },
    {
      id: 'poi-brigade',
      name: 'Brigade Signature Towers',
      kind: 'source',
      poiKind: 'techpark',
      distanceKmStated: 4,
      pos: { lat: 13.0541619, lng: 77.7616936 },
      sourceNote: 'Distance as stated in brochure; position OSM-geocoded.',
      provenance: [
        { asset: BROCHURE, note: '"Brigade Signature Towers ~4 km" (marketing statement).' },
        {
          asset: 'OSM Nominatim',
          note: 'Brigade Signature Towers, Old Madras Road, Huskur Kodi (Huskuru).',
          url: NOMINATIM('Brigade Signature Towers, Bengaluru'),
        },
      ],
    },
    {
      id: 'poi-decathlon',
      name: 'Decathlon (Old Madras Road)',
      kind: 'source',
      poiKind: 'leisure',
      distanceKmStated: 4,
      pos: { lat: 13.0419394, lng: 77.7435020 },
      sourceNote: 'Distance as stated in brochure; position OSM-geocoded.',
      provenance: [
        { asset: BROCHURE, note: '"Decathlon (Old Madras Road) ~4 km" (marketing statement).' },
        {
          asset: 'OSM Nominatim',
          note: 'Decathlon, Old Madras Road, Bhandarpura/Bandapura.',
          url: NOMINATIM('Decathlon Old Madras Road, Bengaluru'),
        },
      ],
    },
    {
      id: 'poi-motherhood',
      name: 'Motherhood Clinic',
      kind: 'source',
      poiKind: 'hospital',
      distanceKmStated: 4,
      pos: null,
      sourceNote: 'Distance as stated in brochure; no reliable geocode found — not plotted.',
      provenance: [{ asset: BROCHURE, note: '"Motherhood Clinic ~4 km" (marketing statement).' }],
    },
    {
      id: 'poi-itpl',
      name: 'ITPL / GR Tech Park',
      kind: 'source',
      poiKind: 'techpark',
      distanceKmStated: 10,
      pos: null,
      sourceNote: 'Distance as stated in brochure; no reliable geocode found — not plotted.',
      provenance: [{ asset: BROCHURE, note: '"ITPL / GR Tech Park ~10 km" (marketing statement).' }],
    },
    {
      id: 'poi-phoenix',
      name: 'Phoenix Marketcity',
      kind: 'source',
      poiKind: 'mall',
      distanceKmStated: 14,
      pos: null,
      sourceNote: 'Distance as stated in brochure; no reliable geocode found — not plotted.',
      provenance: [{ asset: BROCHURE, note: '"Phoenix Marketcity ~14 km" (marketing statement).' }],
    },
  ],
  corridors: [
    {
      id: 'corridor-bbc',
      name: 'Bengaluru Business Corridor (PRR–NICE)',
      status: 'proposed',
      kind: 'source',
      detail: 'Brochure: proposed; "~8 min west". No alignment provided — not drawn.',
      geometry: [],
      provenance: [{ asset: BROCHURE, note: 'Upcoming infrastructure list (proposed).' }],
    },
    {
      id: 'corridor-strr',
      name: 'Satellite Town Ring Road',
      status: 'proposed',
      kind: 'source',
      detail: 'Brochure: proposed; "~10 min east". No alignment provided — not drawn.',
      geometry: [],
      provenance: [{ asset: BROCHURE, note: 'Upcoming infrastructure list (proposed).' }],
    },
    {
      id: 'corridor-expressway',
      name: 'Bengaluru–Chennai Expressway',
      status: 'proposed',
      kind: 'source',
      detail: 'Brochure: proposed; "early 2027". No alignment provided — not drawn.',
      geometry: [],
      provenance: [{ asset: BROCHURE, note: 'Upcoming infrastructure list (proposed).' }],
    },
    {
      id: 'corridor-purple',
      name: 'Metro Purple Line extension (43 km)',
      status: 'proposed',
      kind: 'source',
      detail: 'Brochure: proposed; station near Hoskote Toll. No alignment provided — not drawn.',
      geometry: [],
      provenance: [{ asset: BROCHURE, note: 'Upcoming infrastructure list (proposed).' }],
    },
  ],
};

export default location;
