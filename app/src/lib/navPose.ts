/**
 * Single source of truth for "where is the viewer" (head / walker / orbit camera), in the active scene's
 * world metres (x right/east, z toward viewer/south) plus horizontal heading. Written once per frame by
 * the scene's <PosePublisher>, read by every map (in-VR mini-map, 2D plan viewer). Listeners are notified
 * at most ~15 Hz and outside React, so moving never re-renders the tree.
 */
export const navPose = { x: 0, z: 0, fx: 0, fz: -1, valid: false };

type Listener = () => void;
const listeners = new Set<Listener>();
let last = 0;

export function publishNavPose(x: number, z: number, fx: number, fz: number) {
  navPose.x = x; navPose.z = z;
  const l = Math.hypot(fx, fz);
  if (l > 1e-4) { navPose.fx = fx / l; navPose.fz = fz / l; }
  navPose.valid = true;
  const now = performance.now();
  if (now - last < 66) return;
  last = now;
  listeners.forEach((f) => f());
}

export function invalidateNavPose() {
  navPose.valid = false;
  listeners.forEach((f) => f());
}

export function subscribeNavPose(f: Listener): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}
