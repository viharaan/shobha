import { PLANS } from '@/data/manifest';
import { AMENITIES, FLOOR_TO_FLOOR_M, HOTSPOTS, PODIUM_HEIGHT_M, PROJECT, TOWERS, ZONES } from '@/data/project';
import type { PlanRecord, PlanRoom } from '@/data/types';
import { imagePxToLocal, localToWorld } from '@/lib/geo';
import { MASTERPLAN_TRACE } from '@/data/sobha/masterplanTraceLoader';
import { gatePose } from '@/lib/unit/community/amenityProps';
import { siteToExplorer } from '@/lib/unit/siteToExplorer';
import type { NavSpot } from '@/lib/planNav';
import { amenities } from '@/data/sobha/amenities';

/**
 * Guided tours. A site tour is a list of camera flights across the master plan (gate → club →
 * stadium → courts → a wing) that hands off into the unit viewer; a plan tour steps room by room.
 * Captions quote the collateral; nothing here claims a view or a finish.
 */
export interface TourStop {
  id: string;
  title: string;
  caption: string;
  /** what the narrator says: plain, no numbers to read out, no dimensions */
  narration: string;
  /** file name (without extension) of the pre-generated narration under public/narration */
  audioId: string;
  /** seconds to dwell when auto-playing (without narration audio) */
  dwell: number;
}

export interface SiteTourStop extends TourStop {
  /** orbit camera pose (metres, site frame: x east, y up, z south) */
  pos: [number, number, number];
  target: [number, number, number];
  /** VR / walk spot at ground level, facing the target */
  spot: NavSpot;
  /** seconds of flight into this stop */
  seconds: number;
  wing?: number;
  hotspot?: string;
}

export interface PlanTourStop extends TourStop {
  room: PlanRoom;
}

/** Camera flight in the unit viewer's own frame (metres, unit floor at y = 0). */
export interface UnitFrameGoal {
  pos: [number, number, number];
  target: [number, number, number];
  seconds: number;
}

/**
 * Convert a site-frame tour stop into the unit viewer's frame: P_unit = R_y(−yaw)·(P_site − offset),
 * y relative to the unit floor (floorY above site ground). Same convention as worldGroupTransform.
 */
export function siteStopInUnitFrame(stop: SiteTourStop, p: { yawRad: number; offsetX: number; offsetZ: number }, floorY: number): UnitFrameGoal {
  const c = Math.cos(-p.yawRad);
  const s = Math.sin(-p.yawRad);
  const conv = ([x, y, z]: [number, number, number]): [number, number, number] => {
    const dx = x - p.offsetX;
    const dz = z - p.offsetZ;
    return [c * dx + s * dz, y - floorY, -s * dx + c * dz];
  };
  return { pos: conv(stop.pos), target: conv(stop.target), seconds: stop.seconds };
}

const yawToward = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

function hs(id: string): [number, number, number] {
  const h = HOTSPOTS.find((x) => x.id === id);
  if (!h) return [0, 0, 0];
  return localToWorld(imagePxToLocal(h.imagePx[0], h.imagePx[1]));
}

/** A master-plan legend marker (site frame) in explorer world coordinates via the fitted frame map, or null when not traced. */
function legend(code: string): [number, number, number] | null {
  const m = MASTERPLAN_TRACE.amenities.find((a) => a.code === code);
  if (!m) return null;
  const [x, z] = siteToExplorer(m.pos.x, -m.pos.y);
  return [x, 0, z];
}

function stop(id: string, title: string, caption: string, narration: string, target: [number, number, number], offset: [number, number, number], extra: Partial<SiteTourStop> = {}): SiteTourStop {
  const pos: [number, number, number] = [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]];
  const gx = target[0] + offset[0] * 0.6;
  const gz = target[2] + offset[2] * 0.6;
  return { id, title, caption, narration, audioId: `site-${id}`, dwell: 7, pos, target, spot: { x: gx, z: gz, yaw: yawToward(gx, gz, target[0], target[2]) }, seconds: 2.6, ...extra };
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
const word = (n: number) => WORDS[n] ?? String(n);

const zoneNames = (zone: string) => AMENITIES.filter((a) => a.zone === zone).map((a) => a.name).join(', ');

/** Gate → One Club → World Stadium → Continental Grounds → the chosen wing → hand-off. */
export function siteTour(wing: number): SiteTourStop[] {
  const tower = TOWERS.find((t) => t.wing === wing) ?? TOWERS[0];
  const tw = localToWorld(imagePxToLocal(tower.imagePx[0], tower.imagePx[1]));
  // the gate stop stands on the approach drive outside the entrance canopy (snapped to the driveway, see amenityProps),
  // looking in toward the roundabout (legend 3); the camera rides above the boulevard trees
  const pose = gatePose();
  const gate = pose ? ((): [number, number, number] => { const [x, z] = siteToExplorer(pose.at[0], pose.at[1]); return [x, 0, z]; })() : hs('entrance');
  const rb = legend('3');
  const away = rb ? [gate[0] - rb[0], gate[2] - rb[2]] : [-0.7, 0.7];
  const al = Math.hypot(away[0], away[1]) || 1;
  const gateOffset: [number, number, number] = [(away[0] / al) * 80, 18, (away[1] / al) * 80];
  const club = hs('club');
  const ground = hs('ground');
  const courts = hs('courts');
  const temperate = ZONES.find((z) => z.id === 'temperate');
  return [
    stop('gate', 'Entrance gateway', `Arrival from the 60 m wide Old Madras Road service road: a wave-like canopy and a green roundabout. ${temperate?.theme ?? ''}`,
      'Welcome to SOBHA OneWorld. We arrive from Old Madras Road through the entrance gateway: a sweeping canopy over the drive, and a green roundabout that sets the tone for the community inside.',
      [gate[0], 6, gate[2]], gateOffset, { hotspot: 'entrance', seconds: 0.01 }),
    stop('club', PROJECT.clubhouse.name, `${PROJECT.clubhouse.sqft.toLocaleString('en-IN')} sq ft, three tiers on ${PROJECT.clubhouse.acres} acres: work, recreation, wellness, celebration, dining and learning around a central green plaza.`,
      'To our left is One Club, the clubhouse. Three tiers of spaces for work, recreation, wellness, celebration, dining and learning, gathered around a central green plaza.',
      [club[0], 12, club[2]], [-95, 34, 90], { hotspot: 'club' }),
    stop('stadium', PROJECT.stadium.name, `${PROJECT.stadium.groundDiameterM} m cricket and football ground, ${PROJECT.stadium.runningTrackM} m running track, ${PROJECT.stadium.joggingLoopM} m jogging loop. ${zoneNames('stadium')}.`,
      'At the heart of the towers lies the World Stadium: a sunken cricket and football ground with a running track around it, and longer jogging and cycling trails flowing out through the landscape.',
      [ground[0], 2, ground[2]], [0, 330, 70], { hotspot: 'ground' }), // from above: the towers ring the ground and would hide it from any side
    stop('courts', 'Continental Grounds', `${zoneNames('continental')}.`,
      'The Continental Grounds bring the courts together at ground level: tennis, pickleball and a multi-sport court, with a fitness lawn, a play lawn and a pet park alongside.',
      [courts[0], 3, courts[2]], [-70, 28, 85], { hotspot: 'courts' }),
    stop('wing', `Wing ${tower.wing}`, `Phase ${tower.phase}, ${tower.typicalFloors} typical floors over three basements and two parking levels, handover ${tower.handover}. Footprint traced from the master plan; floor heights assumed.`,
      `This is Wing ${word(tower.wing)}, part of phase ${word(tower.phase)}. The tower rises over three basements and two parking levels. Let us step inside one of the homes.`,
      [tw[0], PODIUM_HEIGHT_M + tower.typicalFloors * FLOOR_TO_FLOOR_M * 0.45, tw[2]], [190, 120, 230], { wing: tower.wing, dwell: 9, audioId: `site-wing-${tower.wing}` }),
  ];
}

/**
 * Camera pose for a place picked outside the tour (place list, label click): the tour's own stop when it has one,
 * else a generic three-quarter view of the hotspot. Lets a click glide the camera there as the tour does.
 */
export function placeStop(hotspotId: string, wing = 1): SiteTourStop | null {
  const own = siteTour(wing).find((s) => s.hotspot === hotspotId);
  if (own) return { ...own, seconds: Math.max(own.seconds, 2.2) };
  const h = HOTSPOTS.find((x) => x.id === hotspotId);
  if (!h) return null;
  const t = hs(hotspotId);
  return stop(hotspotId, h.label.split(' — ')[0], h.description ?? '', '', [t[0], 4, t[2]], [-140, 150, 180], { hotspot: hotspotId, seconds: 2.4 });
}

/** Explorer-frame ground point of an amenity's printed legend marker (null when not traced): for labels on the model. */
export const amenityPoint = (code: string) => legend(code);

/**
 * Camera pose for one of the six named realms: frames the realm's printed legend markers (traced master plan, fitted
 * into the explorer frame) from high in the south, far enough out to hold them all. Null when none of its codes is traced.
 */
export function realmStop(realm: string): SiteTourStop | null {
  const pts = amenities.filter((a) => a.realm === realm).map((a) => legend(a.code)).filter((p): p is [number, number, number] => !!p);
  if (!pts.length) return null;
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cz = pts.reduce((a, p) => a + p[2], 0) / pts.length;
  const r = Math.max(30, ...pts.map((p) => Math.hypot(p[0] - cx, p[2] - cz)));
  // steep (≈ 64°) and fitted to the markers: the towers are hidden while a realm is shown, so the camera can
  // come in as close as the realm's own extent (about 2.3 × its radius fills the 45° view with a small margin)
  const d = Math.min(480, Math.max(130, r * 2.3 + 25));
  return stop(`realm-${realm}`, realm, '', '', [cx, 2, cz], [d * 0.2, d * 0.95, d * 0.42], { seconds: 2.4 });
}

/** Where the site tour hands off: the wing's drawn plan at a mid floor; the stage switches to home mode with tour=rooms. */
export function siteTourHandoff(wing: number): { plan: string; floor: number; label: string } | null {
  const tower = TOWERS.find((t) => t.wing === wing);
  const plan = tower?.samplePlanId ? PLANS.find((p) => p.id === tower.samplePlanId) : null;
  if (!tower || !plan) return null;
  const floor = Math.round(tower.typicalFloors / 2);
  return { plan: plan.id, floor, label: `Step inside: ${plan.name} on floor ${floor}` };
}

const ROOM_ORDER = ['Foyer', 'Living & Dining', 'Kitchen', 'Utility', 'Powder Room', 'Bedroom 1', 'Walk-in Closet', 'Bathroom 1', 'Balcony', 'Bedroom 2', 'Bathroom 2', 'Bedroom 3', 'Bathroom 3', 'Bedroom 4', 'Bathroom 4'];

const ROOM_NOTES: Record<string, string> = {
  Foyer: 'Grand foyer with generous storage space; guest rooms sit near the entrance for privacy.',
  'Living & Dining': 'Column-free living and dining extending to a balcony with panoramic views.',
  Kitchen: 'Open kitchen with floor-to-ceiling tiling and a functional work triad.',
  Utility: 'Well-ventilated utility area with space for a washing machine and dishwasher.',
  'Bedroom 1': 'Master bedroom with provision for a walk-in closet and a private balcony with a wide sliding door.',
  Balcony: 'Balconies open from the living area and the master bedroom.',
};

/** Spoken lines per room: conversational, no measurements. */
function roomNarration(name: string): string {
  const lines: Record<string, string> = {
    Foyer: 'We enter through the foyer. A grand arrival space with generous storage, and the guest rooms placed close to the entrance for privacy.',
    'Living & Dining': 'The living and dining area. Column free, open from end to end, and extending onto the balcony with its panoramic view.',
    Kitchen: 'The kitchen. Open to the dining space, tiled floor to ceiling, and planned around a practical work triangle.',
    Utility: 'The utility area, well ventilated, with room for a washing machine and a dishwasher.',
    'Powder Room': 'A powder room near the entrance, conveniently placed for visitors.',
    'Bedroom 1': 'The master bedroom. It has provision for a walk-in closet, and a private balcony behind a wide sliding door.',
    'Walk-in Closet': 'The walk-in closet off the master bedroom.',
    Balcony: 'The balcony. Open air, with the view across the community.',
  };
  if (lines[name]) return lines[name];
  if (name.startsWith('Bedroom')) return `${name.replace(/(\d+)$/, (d) => word(Number(d)))}. Like every bedroom here, it comes with provision for wardrobes, a study desk and a television point, and large windows for light and ventilation.`;
  if (name.startsWith('Bathroom')) return `${name.replace(/(\d+)$/, (d) => word(Number(d)))}.`;
  return `${name}.`;
}

/** Rooms in a sensible walking order; captions quote the plan sheet where it says something. */
export function planTour(plan: PlanRecord): PlanTourStop[] {
  const rank = (n: string) => { const i = ROOM_ORDER.indexOf(n); return i === -1 ? ROOM_ORDER.length + (n.startsWith('Bedroom') ? 0 : 1) : i; };
  const rooms = [...plan.rooms].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  return rooms.map((room, i) => ({
    id: `room-${plan.rooms.indexOf(room)}`,
    audioId: `plan-${plan.id}-room-${plan.rooms.indexOf(room)}`,
    narration: roomNarration(room.name),
    title: room.name,
    caption: `${(room.mm[0] / 1000).toFixed(2)} × ${(room.mm[1] / 1000).toFixed(2)} m as printed. ${ROOM_NOTES[room.name] ?? (room.name.startsWith('Bedroom') ? 'All bedrooms include provisions for wardrobes, study desks and TV points.' : room.name.startsWith('Bathroom') ? 'Bathrooms as drawn; fittings illustrative.' : '')}`,
    dwell: i === 0 ? 6 : 5,
    room,
  }));
}
