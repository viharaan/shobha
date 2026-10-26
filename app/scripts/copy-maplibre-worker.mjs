// Copies the MapLibre CSP worker next to the app so the map can load it by URL.
// Turbopack cannot resolve maplibre-gl's inline worker URL, so GeoMap calls setWorkerUrl('/vendor/maplibre-gl-worker.js').
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
mkdirSync('public/vendor', { recursive: true });
copyFileSync('node_modules/maplibre-gl/dist/maplibre-gl-csp-worker.js', 'public/vendor/maplibre-gl-worker.js');
// DRACO decoder for Google Photorealistic 3D Tiles (GoogleTiles.tsx sets decoderPath '/vendor/draco/').
mkdirSync('public/vendor/draco', { recursive: true });
for (const f of readdirSync('node_modules/three/examples/jsm/libs/draco/gltf')) copyFileSync(`node_modules/three/examples/jsm/libs/draco/gltf/${f}`, `public/vendor/draco/${f}`);
