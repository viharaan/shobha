import { create } from 'zustand';

/**
 * Community-layer preferences shared by the 3-D layer (inside the Canvas) and its DOM controls in
 * the viewer's surroundings bar — kept in a tiny store so the viewer needs no extra state plumbing.
 *
 *  ground  'plan' = the registered master-plan raster + traced features inside the site boundary
 *          (the DESIGNED community; default) · 'sat' = the outside ground mode continues inside
 *          (satellite: today's construction site)
 *  labels  sparse 3-D amenity labels (One Club, World Stadium, Lagoon Cove)
 *  on      the whole layer (dev: &community=0 to measure its cost)
 *
 * Deep links: &community=plan|sat|0 · &communityLabels=0
 */
export type CommunityGround = 'plan' | 'sat';

interface CommunityState {
  ground: CommunityGround;
  labels: boolean;
  on: boolean;
  setGround: (g: CommunityGround) => void;
  setLabels: (b: boolean) => void;
  setOn: (b: boolean) => void;
}

export const useCommunity = create<CommunityState>((set) => ({
  ground: 'plan',
  labels: true,
  on: true,
  setGround: (ground) => set({ ground }),
  setLabels: (labels) => set({ labels }),
  setOn: (on) => set({ on }),
}));

let urlRead = false;
/** Apply &community / &communityLabels once per page load (client only). */
export function readCommunityUrl() {
  if (urlRead || typeof window === 'undefined') return;
  urlRead = true;
  const q = new URLSearchParams(window.location.search);
  const c = q.get('community');
  const s = useCommunity.getState();
  if (c === 'sat' || c === 'plan') s.setGround(c);
  if (c === '0' || c === 'off') s.setOn(false);
  if (q.get('communityLabels') === '0') s.setLabels(false);
}
