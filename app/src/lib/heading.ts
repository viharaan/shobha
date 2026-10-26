/**
 * Compass heading of the active 3D camera (deg clockwise from true north), written once per frame by the
 * scene's <HeadingProbe> and read by the DOM <Compass>. null = unknown (no scene, or no north reference).
 * Same shape as navPose.ts: an external store, so the camera never re-renders the React tree.
 */
let heading: number | null = null;
const listeners = new Set<() => void>();

export function publishHeading(deg: number | null) {
  if (deg === heading) return;
  heading = deg;
  listeners.forEach((f) => f());
}

export const getHeading = () => heading;
export const getServerHeading = () => null;

export function subscribeHeading(f: () => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}
