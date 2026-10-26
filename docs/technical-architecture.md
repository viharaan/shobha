# Technical architecture — SOBHA OneWorld Spatial Explorer

_Last updated 2026-10-18. Companion to `project-understanding.md`, `asset-inventory.csv`, `implementation-plan.md`._

## 1. Shape of the system

A single Next.js 16 application (`app/`) with four independent viewers that share one typed data layer. There is no backend: every fact the app shows is either compiled in from the collateral (`src/data/*.ts`) or fetched as a static file under `public/`. Nothing in this repo needs an API key.

```
app/
  src/data/        project.ts (facts, assumptions)   manifest.ts (asset registry, georeference)
                   plans.generated.ts (per-plan scale + rooms, generated)   types.ts
  src/lib/         geo.ts (coordinate transforms)   scale.ts (plan units, calibration persistence)
                   pricing.ts   svgWalls.ts (vector plan → wall shapes)   xr.ts (WebXR store + capability)
  src/components/  three/SiteScene  three/PlanScene  three/XRRig  three/FirstPersonRig  three/VRButton
                   plan/PlanViewer2D   geo/GeoMap   ui/Shell  ui/primitives
  src/app/         /  /explore  /plans  /geo  /media
  public/          plans/*.svg  media/{video,site,brochure}  data/*.geojson
```

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16.4 (App Router, TypeScript, Tailwind 4, React 19) | Requested stack; static-first, no server needed |
| Interactive 3D | three 0.186 + @react-three/fiber 9 + drei 10 | Declarative scene graph; instancing, clipping, Html labels out of the box |
| VR | @react-three/xr 6 (WebXR) | Same scene for desktop and headset; teleport + controller locomotion built in |
| Map | MapLibre GL 5 + deck.gl 9 (`MapboxOverlay`) | Open basemap (OpenFreeMap), native terrain + fill-extrusion, deck.gl for analytic layers |
| 3D geospatial engine | **Not CesiumJS.** See §6 | Site is < 1 km across; MapLibre terrain + extrusions cover it without a 3D-Tiles pipeline or ion token |
| Data | TypeScript modules + static GeoJSON | No live inventory exists yet; a Supabase/PostGIS backend is documented as the upgrade path, not built |

## 2. Units and coordinate systems

**One world unit = one metre, everywhere.** Three conversions exist and each lives in exactly one file.

| Frame | Axes | Where converted |
|---|---|---|
| PDF/SVG points (pt) | x right, y down; 1 pt = `mmPerPt` mm (per plan) | `lib/scale.ts` → plan-local metres |
| Plan-local metres | origin at wall-polygon centre; x right, z toward viewer (SVG +y) | `PlanScene` (mesh `scale=[s,-s,s]`, `rotation.x=-π/2`) |
| Master-plan raster px | u right, v down on `masterplan.jpg` | `lib/geo.ts: imagePxToLocal` |
| Site-local ENU metres | east, north about the anchor; three.js `x=east, y=up, z=-north` | `lib/geo.ts: localToWorld` |
| WGS84 lon/lat | map | `lib/geo.ts: localToLonLat / lonLatToLocal` (equirectangular about the anchor; < 2 cm error over the site) |

Floor plans are deliberately **not** georeferenced: the collateral never says where a unit sits inside a tower footprint. The plan viewer therefore works in its own frame and the UI says so.

## 3. Floor-plan pipeline (1:1)

1. `pdftocairo -svg` per page → `source-assets/plans/pageN.svg` (vector, 595.276 × 841.89 pt). Copied to `app/public/plans/`.
2. `pdftotext -bbox` per page → word boxes. A room is a `NNNN x NNNN` label; its name is the capitalised line above it.
3. Scale derivation (`source-assets/plans/scale-analysis.json`, baked into `src/data/plans.generated.ts`): the walls are the largest white **filled** compound path. For each room label we cast a horizontal and a vertical ray from the label centre to the nearest wall-polygon edges; interior distance in pt vs the printed mm gives `mmPerPt`. On every page the valid samples agree to < 0.01 % (e.g. Type A: 12 samples, 39.283 mm/pt), so the scale is tagged `source-verified`. Rays that hit furniture or cross a doorway are discarded automatically because they disagree with the cluster.
4. Runtime: `lib/svgWalls.ts` parses the SVG with three's `SVGLoader`, picks the same wall path (most curve segments among white fills), `SVGLoader.createShapes` yields outer loops with holes, and `PlanScene` extrudes them to `WALL_HEIGHT_M` (assumed 2.9 m, slider 2.4–3.6). Wall **positions and thicknesses are source geometry**; **height is an assumption** and is labelled as such. Doors/windows appear as the gaps drawn in plan; there are no heads, sills or frames because the plan has none.
5. Furniture: `lib/svgFurniture.ts` takes the same SVG's stroke paths (beds, wardrobes, dining, counters, sanitary ware are drawn as loose line segments), joins segments that share an endpoint, drops door swings / glyphs / nested outlines, and renders each cluster as a box at its drawn footprint with a typical height per kind (room name + size heuristic). Footprints are source geometry; heights are assumptions and the UI says so.
6. The floor is textured with the plan rasterised from the same SVG, cropped to the wall bbox, so the 2D and 3D views cannot drift apart.
7. Calibration tool: two clicks + a distance override `mmPerPt` per plan in `localStorage` (status `user-calibrated`, deviation from the source scale shown). Reset returns to the source value. For a future **raster** plan with no vector walls, the same tool is the only way to reach true scale, and the badge stays `unverified` until it is used.

Regenerate after replacing the PDF:

```bash
for i in 2 3 4 5 6 7 8; do pdftocairo -svg -f $i -l $i "SOBHA_ONEWORLD_Floor plans.pdf" source-assets/plans/page$i.svg; pdftotext -bbox -f $i -l $i "SOBHA_ONEWORLD_Floor plans.pdf" source-assets/plans/page$i.bbox.html; done
# then re-run the analysis snippet recorded in the session log / this file's history to refresh scale-analysis.json and plans.generated.ts
```

## 4. Site model

- Ground: `masterplan.jpg` (2682 × 2123) as a plane of 894 × 708 m, rotated by `SITE_IMAGE.upBearingDeg` so that image-up points to bearing 22°, subdivided to ≈10 m cells and displaced by the Terrarium DEM (`useSiteTerrain` in `SiteScene.tsx`; explorer world → `siteFrame` coordinates → `loadTerrain`). Towers, podiums, labels and tour targets add the ground height at their footprint.
- Georeference derivation: 90 m ground ≈ 270 px → 3.0 px/m; OSM boundary edge vs plan edge → 22° rotation; anchor = ground centre pixel ↔ OSM polygon centroid. All three are `approximate` and editable in `manifest.ts`; the Geo page overlays the raster on the map so the fit can be judged against the OSM boundary.
- Towers: 14 wings with **footprints traced from the raster** (`TOWERS[].footprintPx`, cream-roof segmentation + outline simplification, shared podium blocks split per wing along the bisector between wing centres), extruded 46/45 floors × 3.0 m over an 8 m podium of the same outline. One `InstancedMesh` per tower (one instance per floor) → 640 floor instances, per-instance colour for selection, refuge floors tinted. Still `approximate`: ±1 px ≈ ±0.3 m plus the georeference error, and not CAD. Floor isolation zeroes the scale of other floors in the selected tower and dims the rest; exploded view scales the floor pitch; section cut is a material clipping plane (`localClippingEnabled`).
- Labels (towers, hotspots, rooms) are page-rendered DOM elements positioned every frame by `three/DomLabels.tsx`; drei `Html` was dropped because its per-label React root breaks React 19 on route changes. Inside an XR session the same labels become uikit panels (`XRUI.tsx`).
- Navigation: OrbitControls (exterior / top-down presets animated by `CameraRig`), `FirstPersonRig` (PointerLock + WASD, eye 1.6 m), `XRRig` (XROrigin + teleport floor + stick locomotion).

## 5. Geospatial layer

- Basemap: OpenFreeMap "liberty" vector style (OSM data, no key, public CDN). Buildings: `fill-extrusion` from the style's `openmaptiles/building` layer (`render_height`). Terrain + hillshade: AWS Open Data Terrarium DEM (no key).
- deck.gl layers over MapLibre (`MapboxOverlay`, non-interleaved): site boundary (GeoJSON from OSM way 1427347113, 49.5 acres vs official 48.4), tower footprints (extruded polygons from the same local→lon/lat transform the 3D scene uses), POIs (119 OSM features: schools, hospitals, clinics, colleges, malls, metro/rail stations, toll booths, named projects u/c), amenity density heatmap, brochure distance rings (distance only, no bearing), two-point great-circle measure.
- Insights are computed client-side from the OSM points: counts within 3/5/7 km, nearest station/hospital/mall, toll distance, nearby projects. Travel time / road distance are **not** computed: no routing service is configured, and the UI says so.
- Map → 3D: clicking a tower polygon routes to `/explore?wing=N`; the explorer focuses that wing.

## 6. Why not CesiumJS

CesiumJS would add Cesium ion (token, terms), a 3D-Tiles pipeline for the site model, 2 MB+ of runtime, and a second scene graph to keep in sync with the R3F scenes. The project area is ~0.8 km across with no supplied terrain or city-scale datasets; MapLibre's DEM terrain plus OSM extrusions give the same contextual 3D at zero credential cost. Revisit if a photogrammetry mesh / 3D Tiles of the site or city appears.

## 7. VR

- `createXRStore({ emulate: false })` shared by both scenes; `VRButton` enables only when `navigator.xr.isSessionSupported('immersive-vr')` resolves true on a secure context, and explains the exact blocker otherwise (no WebXR, no device, HTTP).
- Navigation state: `lib/planNav.ts` builds one occupancy grid per unit (wall polygon + visible furniture rasterised at 5 cm, grown by a 0.22 m body radius, plus a chamfer clearance field). It answers collision (`slide`), room rectangles (printed W × D on the label, orientation picked by fewest wall cells), the most open spot in a room (`roomSpot`) and the spawn just inside the plan's ENTRY marker (`entrySpot`). `lib/navPose.ts` holds the live viewer pose (one writer per scene, ~15 Hz listeners outside React) for every map.
- Inside a session: `XROrigin` placed imperatively by `XRRig.flyTo` (head-relative, eased, interruptible), `TeleportTarget` floors snapped to the nearest free cell. Locomotion is our own (`XRRig.tsx`), eased with a 0.12 s time constant, collision-slid in walk mode, right-stick zoom in top view; raw xr-standard gamepad axes, so it works with one or two controllers and without a controller-profile download — left stick walks relative to head yaw (1.5 m/s plan, 4 m/s site, floor-locked), right stick snap-turns 30° about the head, right trigger on the floor teleports (teleport pointer enabled on the right controller only). The panel starts low-left in the player frame (wrist position) and can be dragged anywhere by holding the grip button on it (`XRPanelAnchor`, raw gamepad button 1 + grip object, pose kept for the session); it carries a mini-map (`XRMiniMap`: plan raster or master plan, blue player marker with heading, tappable room / wing dots that teleport), plus Top view and Reset. Rig moves are applied imperatively (`resetToken`) because the stick mutates the rig outside React. Labels are drei `Html` on desktop; inside a session (`useInXR`, a subscription to the XR store) they are replaced by `@react-three/uikit` panels (`components/three/XRUI.tsx`): billboarded room labels, a player-anchored panel (scale badge, reset position) and the Wings 1–14 picker. The site panel draws as an overlay because uikit's instanced shaders do not write logarithmic depth and would lose the depth test against the ground.
- Requirements: HTTPS (or localhost), Meta Quest Browser / Wolvic / Chrome-Edge with SteamVR or Oculus runtime / visionOS Safari. Pointer lock and WebXR cannot coexist; leave desktop walk mode before entering VR.

## 8. Asset & data pipeline

- Originals stay untouched in the project root. Derived files live in `source-assets/` (conversion products) and are copied to `app/public/` for delivery. `docs/asset-inventory.csv` records every file, its dimensions and role.
- `src/data/manifest.ts` is the registry: plan records (id → SVG, calibration, rooms), the site-image georeference, GeoJSON URLs and basemap/terrain endpoints, media items with provenance and the entity they link to.
- Every record carries a `Provenance` (`source-verified | source | external | approximate | assumed | user-calibrated | unverified`) and the UI renders it as a badge next to the value. Missing data renders an explicit empty/unavailable state.
- Videos (87 MB) are copied, not transcoded; `preload="none"` with posters keeps the media page light. Large assets are lazy-loaded per route via `next/dynamic` (map) and Suspense (textures).

## 9. Performance, accessibility, security

- 3D: one instanced mesh for all floors, 2048² shadow map, `dpr` capped at 1.5–1.75, fog + far plane, pointer-miss deselects. Plan walls are a single extruded geometry. No post-processing.
- Map: non-interleaved overlay, terrain and buildings toggleable, heatmap off by default.
- Keyboard: every control is a native button/select/range with visible focus; canvases have aria labels; first-person requires an explicit click to lock the pointer.
- No secrets, no env vars required. All third-party endpoints are public and listed in `manifest.ts` with attribution in the map.
- Inputs: calibration distance is validated (`> 0`), stored only in localStorage; GeoJSON is static and shipped with the app.

## 10. Home finder, shortlist, URL state

- `src/lib/homes.ts` resolves a (wing, flat, floor) against the flat directory, placements, unit types, phases and pricing into one `HomeView`; every UI that shows a home goes through it.
- `src/lib/shortlist.ts` is a `useSyncExternalStore` wrapper over localStorage (`shobha.shortlist.v1`), so the header chip, finder, compare page and presentation bar share one list without effects or context.
- Selection state that should survive a shared link lives only in the URL (`router.replace`, no history spam): `/homes`, `/plans`, `/explore`. `/compare?homes=` carries a whole list.
- Presentation mode is a `present=1` flag: the page hides its side panel and mounts `PresentationBar`.
