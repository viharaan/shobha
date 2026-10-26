/**
 * One-shot camera commands from the on-screen nav pad (Stage) to whichever canvas is live. External store
 * like navPose.ts: the pad never re-renders the scene; <NavDriver> inside the canvas applies the command
 * to the active OrbitControls (ignored in walk / VR, where the sticks and the XR panel do the job).
 */
export type NavCommand = 'rotateLeft' | 'rotateRight' | 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight' | 'panUp' | 'panDown' | 'tiltUp' | 'tiltDown' | 'tiltToggle';

const listeners = new Set<(c: NavCommand) => void>();

export function sendNav(c: NavCommand) {
  listeners.forEach((f) => f(c));
}

export function subscribeNav(f: (c: NavCommand) => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}
