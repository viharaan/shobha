# SOBHA OneWorld — Spatial Explorer

Interactive 3D, 1:1 floor-plan, VR and geospatial exploration of SOBHA OneWorld (Greater Whitefield, Bengaluru), built from the developer's collateral in the parent folder. Architecture, asset provenance and status live in `../docs/`.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build && npm start   # production
```

Verification (all pass on Node 22.11 / npm 11.18):

```bash
npx tsc --noEmit
npm run lint
npm run build
```

No environment variables are required. All external endpoints are public and keyless:

| Endpoint | Used for | Terms |
|---|---|---|
| `https://tiles.openfreemap.org/styles/liberty` | Vector basemap (OSM data) | OpenFreeMap: free, no key, fair use |
| `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | Terrain DEM | AWS Open Data (Mapzen Terrarium), free |
| none | 3D, plans, VR | all local |

To self-host tiles or swap providers edit `src/data/manifest.ts: GEO_DATA`.

Two build-time notes:

- `predev` / `prebuild` run `scripts/copy-maplibre-worker.mjs`, which copies MapLibre's CSP worker to `public/vendor/` (git-ignored). Turbopack cannot resolve MapLibre's inline worker URL, so `GeoMap.tsx` calls `setWorkerUrl('/vendor/maplibre-gl-worker.js')`.
- `maplibre-gl` is pinned to 5.x. deck.gl 9.4's `MapboxOverlay` reads `map.transform` for terrain camera sync, which MapLibre 6 removed (crash: "Cannot read properties of undefined (reading 'elevation')"). Upgrade only when deck.gl supports MapLibre 6.

## Pages

| Route | What |
|---|---|
| `/` | Overview: facts, unit types, phases, zones, data-badge legend |
| `/explore` | Site model: 14 towers, floor select/isolate, section cut, exploded view, orbit / top-down / first-person, VR, hotspots, indicative price helper |
| `/plans?plan=type-a` | 1:1 floor plans: 2D vector viewer (pan/zoom, measure, calibrate), synchronised 3D extrusion, first-person walk, VR |
| `/geo` | MapLibre + deck.gl: OSM site boundary, terrain, 3D buildings, tower extrusions, POIs, density heatmap, distance rings, measure, insights |
| `/media` | Videos, master plan, sales sheet, creatives, 30 brochure pages, each with a provenance badge |

## Supported asset formats

| Input | Handling |
|---|---|
| Vector PDF floor plan | `pdftocairo -svg` → `public/plans/*.svg`; scale derived from room labels (see `../docs/technical-architecture.md` §3) |
| Raster floor plan (PNG/JPG) | Not present yet. Add a `PlanRecord` with `calibration.status: 'unverified'`; the in-app two-point calibration makes it true scale |
| Site plan raster | `public/media/site/masterplan.jpg` + georeference in `manifest.ts: SITE_IMAGE` |
| GLB/GLTF tower or site model | Not present yet. Drop into `public/models/`, load with drei `useGLTF` inside `SiteScene` in place of `TowerFloors`; keep 1 unit = 1 m, +Y up |
| DWG/DXF/IFC/RVT | Convert offline (e.g. IfcConvert → OBJ → glTF, or Blender) to GLB; never commit the proprietary originals as delivery assets |
| GeoJSON/KML/SHP | GeoJSON goes in `public/data/` and a `GeoJsonLayer` in `GeoMap.tsx`; convert KML/SHP with `ogr2ogr -f GeoJSON` |
| GeoTIFF / DEM | Serve as Terrarium or Mapbox-RGB tiles (`rio rgbify` + `gdal2tiles`), point `GEO_DATA.terrainTiles` at it |
| Video | MP4 (H.264) in `public/media/video/` with a PNG poster |

## Coordinate conventions

- 1 world unit = 1 metre. Three.js: x = east, y = up, z = −north (site scene); plan scene: x right, z toward the viewer, origin at the wall-polygon centre.
- Floor plans: PDF points × `mmPerPt` / 1000. Site raster: `pxPerMetre`, `anchorPx` ↔ `anchorLonLat`, `upBearingDeg` (`manifest.ts`).
- Heights: `FLOOR_TO_FLOOR_M = 3.0`, `PODIUM_HEIGHT_M = 8.0`, `WALL_HEIGHT_M = 2.9` in `src/data/project.ts` — assumptions, badge-labelled in the UI.

## WebXR / headset testing

- Needs a secure context: `https://` or `http://localhost`. On a LAN use a tunnel (`npx localtunnel --port 3000`, ngrok) or a local HTTPS proxy (`npx local-ssl-proxy --source 3443 --target 3000`), then open the HTTPS URL in the headset browser.
- Browsers: Meta Quest Browser (Quest 2/3/Pro), Wolvic (Pico, Quest), Chrome/Edge on Windows with SteamVR/Oculus runtime, Safari on visionOS. Firefox desktop has no WebXR.
- The **Enter VR** button enables itself only when `navigator.xr.isSessionSupported('immersive-vr')` is true; otherwise it explains the blocker.
- Controls in VR: point at the floor and pull trigger to teleport; right stick walks (1.5 m/s), left stick snap-turns 30°; the headset's own recenter resets the view. Leave desktop "Walk" mode (Esc) before entering VR; pointer lock and XR sessions conflict.
- To drive the scenes without hardware set `emulate: 'metaQuest3'` in `src/lib/xr.ts` (IWER emulator ships with @react-three/xr).
- **Status:** VR is implemented but has not been exercised on physical hardware in this repository yet; see `../docs/implementation-plan.md`.

## Deployment

Static-first Next.js app. `npm run build` then `npm start`, or deploy to Vercel/any Node host. Everything under `public/` (≈100 MB, mostly video) ships as-is; move `public/media/video` to object storage and update `manifest.ts: MEDIA[].src` if the host has size limits. Serve over HTTPS for VR. No server-side secrets.

## Data badges

`source-verified` (cross-checked in the document) · `source` (as printed) · `external` (OSM / open data) · `approximate` (traced from a raster) · `assumed` (engineering assumption) · `user-calibrated` · `unverified` (conflicts with official documents). Every scale, position, height and media item in the UI carries one.

## Optional keys (never committed)

Copy `.env.local.example` to `.env.local`.

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | "Photoreal (Google)" on `/explore` (three.js, `3d-tiles-renderer`) and "Photoreal 3D (Google)" on `/geo` (deck.gl `Tile3DLayer`) | Google Maps Platform key with **Map Tiles API** enabled, restricted by HTTP referrer. Inlined at build time, so set it on Vercel too and redeploy. Billed per root-tileset session. Google attribution is shown automatically; the site itself appears as captured (under construction). The ground seat is approximate: `SITE_ELLIPSOID_HEIGHT_M` in `SiteScene.tsx` plus the in-app offset slider. |
| `ELEVENLABS_API_KEY` (+ optional `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`) | `npm run narration` on your machine | One-time build of the guided-tour voice: writes `public/narration/*.mp3` and `index.json` (≈ 90 short clips). Commit the MP3s; production never calls ElevenLabs. Without clips the tour falls back to the browser's speech synthesis. Re-run with `-- --force` after changing a narration line in `src/lib/tour.ts`. |
