'use client';

import { createXRStore } from '@react-three/xr';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * One XR store for the whole app. `emulate: false` keeps the dev-time headset emulator off so that
 * "Enter VR" reflects the real device. Set to 'metaQuest3' locally to drive the scene without hardware.
 */
/** Ray and cursor drawn over the head-locked map HUD (see XRMapHud), cursor a little more opaque to read on the map. */
const RAY = { rayModel: { renderOrder: 299 }, cursorModel: { renderOrder: 300, opacity: 0.85 } };

export const xrStore = createXRStore({
  emulate: false,
  foveation: 0.5,
  // right controller: ray pointer for UI + teleport pointer for the floor; left: ray only (left stick walks, see XRRig).
  // The map HUD draws at renderOrder 200 without depth test so walls never hide it; the ray and its cursor must draw
  // after it (defaults are 1 and 2), or the cursor vanishes whenever it is on the map.
  controller: { left: { teleportPointer: false, rayPointer: RAY }, right: { teleportPointer: true, rayPointer: RAY } },
  hand: { rayPointer: RAY },
});

/** True while an immersive session is running. Works outside <XR> (the scenes own that wrapper), unlike useXR. */
export function useInXR(): boolean {
  return useSyncExternalStore(xrStore.subscribe, () => xrStore.getState().session !== undefined, () => false);
}

export type XRSupport = 'checking' | 'supported' | 'unsupported' | 'no-webxr' | 'insecure';

export function useXRSupport(): XRSupport {
  const [s, setS] = useState<XRSupport>('checking');
  useEffect(() => {
    let alive = true;
    if (typeof window === 'undefined') return;
    const check = async () => {
      if (!window.isSecureContext) { if (alive) setS('insecure'); return; }
      const xr = navigator.xr;
      if (!xr) { if (alive) setS('no-webxr'); return; }
      const ok = await xr.isSessionSupported('immersive-vr').catch(() => false);
      if (alive) setS(ok ? 'supported' : 'unsupported');
    };
    Promise.resolve().then(check);
    // the dev emulator installs navigator.xr asynchronously after mount: re-check when it lands
    const unsub = xrStore.subscribe((s, prev) => { if (s.emulator !== prev.emulator) void check(); });
    return () => { alive = false; unsub(); };
  }, []);
  return s;
}

export const XR_SUPPORT_TEXT: Record<XRSupport, string> = {
  checking: 'Checking headset support…',
  supported: 'VR headset detected. Enter VR for a 1:1 walkthrough.',
  unsupported: 'No immersive-VR device on this browser. The desktop 3D view is fully usable; open this page in a Quest / Pico / PC-VR browser to enter VR.',
  'no-webxr': 'This browser has no WebXR. Use Meta Quest Browser, Wolvic, Chrome/Edge on a PC-VR rig, or Safari on visionOS.',
  insecure: 'WebXR needs HTTPS (or localhost). Serve the app over HTTPS to enable VR.',
};
