'use client';

import { GLTFExtensionsPlugin, GoogleCloudAuthPlugin, ReorientationPlugin, TileCompressionPlugin, TilesFadePlugin } from '3d-tiles-renderer/plugins';
import { TilesAttributionOverlay, TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f';
import { useEffect, useMemo } from 'react';
import { MathUtils } from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/** Build-time public key (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY). Empty string = feature hidden. */
export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

/**
 * Google Photorealistic 3D Tiles streamed into the site scene (desktop; heavy for standalone VR).
 *
 * ReorientationPlugin puts (lat, lng, ellipsoidHeight) at the scene origin with +Y up and the local
 * east-north frame on x / −z, which is this app's site frame. `ellipsoidHeight` is the WGS84
 * ellipsoid height of the ground at the origin (≈ metres above sea level minus the local geoid
 * undulation, about −87 m around Bengaluru); the explorer exposes an offset slider to fine-tune.
 *
 * Google's terms: show the Google logo/attribution (TilesAttributionOverlay does), do not cache or
 * mix with other providers' 3D data in one view, keep the key referrer-restricted.
 */
export function GoogleTiles({ lat, lng, ellipsoidHeight, azimuthDeg = 0, errorTarget = 16, enabled = true }: { lat: number; lng: number; ellipsoidHeight: number; azimuthDeg?: number; errorTarget?: number; enabled?: boolean }) {
  const draco = useMemo(() => new DRACOLoader().setDecoderPath('/vendor/draco/'), []);
  useEffect(() => () => { draco.dispose(); }, [draco]);
  if (!GOOGLE_MAPS_KEY) return null;
  return (
    // `enabled` pauses traversal and fetching while the layer is switched off; the renderer stays mounted so
    // toggling it back on reuses the same root session (Google bills per root tileset request, not per tile).
    <group visible={enabled}>
    <TilesRenderer errorTarget={errorTarget} enabled={enabled}>
      <TilesPlugin plugin={GoogleCloudAuthPlugin} args={[{ apiToken: GOOGLE_MAPS_KEY, autoRefreshToken: true }]} />
      <TilesPlugin plugin={GLTFExtensionsPlugin} args={[{ dracoLoader: draco }]} />
      <TilesPlugin plugin={TileCompressionPlugin} />
      <TilesPlugin plugin={TilesFadePlugin} />
      <TilesPlugin plugin={ReorientationPlugin} args={[{ lat: lat * MathUtils.DEG2RAD, lon: lng * MathUtils.DEG2RAD, height: ellipsoidHeight, azimuth: azimuthDeg * MathUtils.DEG2RAD, up: '+y', recenter: true }]} />
      <TilesAttributionOverlay style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 11, color: '#e9e6df', background: 'rgba(11,13,16,.7)', padding: '2px 6px', borderRadius: 6, pointerEvents: 'none' }} />
    </TilesRenderer>
    </group>
  );
}
