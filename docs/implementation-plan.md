# Implementation plan & status — SOBHA OneWorld Spatial Explorer

_2026-10-18. Status legend: ✅ done · 🟡 partial / needs hardware · ⛔ blocked on missing source data._

## Stages

| # | Stage | Status | Notes |
|---|---|---|---|
| 1 | Inspect workspace, inventory assets | ✅ | `docs/asset-inventory.csv` (65 rows), `docs/project-understanding.md` |
| 2 | Determine real capabilities | ✅ | Vector plans → true 1:1; raster site plan → approximate placement; no CAD → placeholder towers |
| 3 | Architecture & asset relationships | ✅ | `docs/technical-architecture.md`, `src/data/manifest.ts` |
| 4 | Working app + reusable viewers | ✅ | Next 16 + R3F + XR + MapLibre/deck.gl; `/explore`, `/plans`, `/geo`, `/media`, `/` |
| 5 | Integrate real assets | ✅ | 7 SVG plans, master plan raster, sales sheet, 30 brochure pages, 7 videos, OSM boundary + 119 POIs |
| 6 | Plan scale, calibration, 2D/3D sync | ✅ | Source-verified mm/pt per plan; measure + calibrate tools; room focus syncs 2D marker, 3D ring and orbit target |
| 7 | Geospatial layers & analytics | ✅ | Boundary, terrain, OSM buildings, tower extrusions, POIs, heatmap, rings, measure, insights |
| 8 | WebXR entry + VR interactions | 🟡 | Implemented (enter VR, teleport, stick locomotion, snap turn, 1:1 scale). **Not tested on a headset** in this environment |
| 9 | UI refinement & optimisation | ✅ | Instancing, lazy routes, dpr caps, status badges, empty/error states |
| 10 | Lint, type-check, build | ✅ | `npm run lint`, `tsc --noEmit`, `npm run build` all pass (see README) |
| 11 | Docs: setup, env, formats, deployment, headset testing | ✅ | `app/README.md` + this folder |

## Dependencies between pieces

- Everything hangs off `src/data/plans.generated.ts` (scale) and `src/data/manifest.ts` (georeference). Replace a PDF → regenerate the former; get a survey point → edit the latter.
- The 3D site and the map share `lib/geo.ts`; a georeference fix propagates to both automatically.

## Risks and how they are handled

| Risk | Handling |
|---|---|
| Site plan georeference is ±tens of metres and ±5° | Flagged `approximate` everywhere; overlay-on-map lets a planner check; three constants to edit |
| Floor height unknown | `FLOOR_TO_FLOOR_M` / `WALL_HEIGHT_M` constants, slider in plan viewer, `assumed` badge |
| Tower footprints are traced from a raster, not CAD | `TOWERS[].footprintPx` outlines segmented from `masterplan.jpg` (±1 px ≈ ±0.3 m plus georeference error), wings split along bisectors between wing centres; flagged `approximate`, "traced from raster" in the UI. Swap for CAD/GLB per wing when supplied |
| OSM POI coverage incomplete | Stated in the panel; counts are "in OSM", never "in the area" |
| WebXR untested on hardware | Capability detection is explicit; the desktop fallback is the same scene |
| Brochure distances have no bearings | Rendered as rings only |
| Marketing infographic contradicts PDFs | Marked `unverified` with the conflict spelled out |

## Acceptance criteria → evidence

| Criterion | Evidence |
|---|---|
| Runs locally with documented commands | `app/README.md`: `npm install && npm run dev` |
| Uses actual SOBHA assets | All plans, site plan, sales sheet, brochure, videos are the supplied files (converted, originals untouched) |
| Navigate available 3D models | `/explore`: orbit / top-down / walk / VR, tower + floor selection, section, exploded |
| Open and calibrate 2D plans | `/plans`: pan/zoom, measure, two-point calibration with persistence and reset |
| Consistent metric 1:1 | `mmPerPt` → metres drives both the 2D scale bar and the 3D extrusion; 1 m cube + 1.75 m figure in scene |
| Switch 2D ↔ 3D | Split / 2D / 3D layouts, shared room focus |
| VR entry path with clear compatibility | `VRButton` + `XR_SUPPORT_TEXT` |
| Geographic info in a functional viewer | `/geo` with real OSM boundary and POIs, terrain, buildings |
| Coordinate transforms documented & validated | `lib/geo.ts` header; OSM polygon area (49.5 ac) vs official (48.4 ac); plan scale cross-checked on 5–12 rooms per page |
| Unverified data never authoritative | `Provenance` badges on towers, hotspots, media, scale, georeference |
| Loading / error / empty / unsupported states | Plan wall extraction status, map status banner, POI empty state, XR unsupported text |
| Lint / type / build pass | See README "Verification" |
| Setup, architecture, provenance, limitations, testing documented | This folder + README |

## Increments done 2026-10-18

1. ✅ **In-VR UI** (`@react-three/uikit` 1.0.77): room labels become billboarded 3D text panels in an immersive session, a panel anchored to the player shows scale + wall height + "Reset position" (`/plans`), and a Wings 1–14 picker + reset panel in `/explore` (`src/components/three/XRUI.tsx`). Desktop keeps drei `Html`. Verified with the iwer Quest 3 emulator (trigger-click selects a wing); not yet on hardware.
2. ✅ **Real footprints**: 14 per-wing outlines traced from `masterplan.jpg` into `TOWERS[].footprintPx`, extruded per floor (one `InstancedMesh` per tower) and as podiums, and drawn as the same rings on the Geo map. Still `approximate`; UI says "traced from raster".
4. ✅ **VR locomotion fix + mini-map** (2026-10-19): `useXRControllerLocomotion` returned early unless both controllers were tracked and read the stick via a CDN controller profile, so sticks did nothing on the headset. Replaced with raw-axes locomotion in `XRRig.tsx` (left stick walk, right stick snap turn about the head, right trigger teleport) and added `XRMiniMap` to the anchored panels. Panel moved to a lower-left wrist position so it never covers the view; map dots are tappable (rooms in `/plans`, wings in `/explore`) and teleport the player; "Top view" lifts the player above the unit/site; the panel can be grip-dragged to any position (`XRPanelAnchor`); Reset is applied imperatively (React's prop diff ignored same-valued positions after stick movement). Emulator-verified; headset check pending.
5. ✅ **Navigation overhaul** (2026-10-19, from a headset recording): spawn was outside the unit facing the exterior wall, top view could pan but not zoom, map taps dropped the player onto label points inside furniture, and walls/furniture had no collision. Now one nav grid (`lib/planNav.ts`: walls + furniture rasterised at 5 cm, grown 0.22 m) drives collision, room rectangles, safe room spots and an entry spawn from the PDF's own ENTRY marker; the VR rig eases movement, slides along walls, zooms in top view (right stick), and places the head (not the rig origin) when jumping; mini-map rooms are tap targets with a red position + heading marker (shared `lib/navPose.ts`, signal-driven, no re-renders); desktop room focus frames the room, Overview / Top view (drag pans, wheel zooms to cursor), WASD walk collides, 2D plan shows the live red dot. `node --experimental-strip-types scripts/check-nav.mjs` checks collision and head-relative placement.
3. ✅ **Furniture from the plan drawing** (`src/lib/svgFurniture.ts`, 2026-10-19): no 3D model flat exists, so the plan SVG's own furniture strokes are exploded into segments, clustered by shared endpoints, filtered (door swings, glyphs, nested outlines, L-shaped bounding boxes) and boxed; kind and height come from room name + footprint size (bed 0.55, wardrobe 2.1, table 0.75, counter 0.9, fixtures). Footprints are source geometry, heights assumed; "Furniture" toggle in `/plans`. Verified offline per plan (every bedroom gets a 1.6–1.96 × 1.94 m bed); not yet eyeballed in the headset.

## Increment 2026-10-21 — data import + interactive home

- ✅ **Sister-project data imported** (`app/src/data/sobha/`, from `../sohba`, local-LLM extraction): `siteFrame.ts` (OSM site polygon frame), `osmWingOutlines.ts` (14 OSM wing rings), `masterplanTraced.ts` (master plan registered at 2.6 m RMS; stadium, club, water, roads, 30 amenity letters), `flats/directory.ts` + `placements.ts` (per-flat config/SBA/facing for the 10 labelled wings, placement inside the wing), `traced/*` (room polygons, walls, openings per unit type, mirror helper), `amenities.ts`, `realms.ts`, `location.ts`, `osm.ts` + `public/data/osm.json`, `pricing.ts`, `lib/solar.ts`. Two webpack `require.context` loaders replaced with static imports (Turbopack).
- ✅ **Home page rebuilt** (`src/app/page.tsx`, `components/home/HomeHero.tsx`, `HeroCanvas.tsx`): live 3D site in the hero — OSM-outline towers with floor banding on the registered master plan, amenity dots by realm, stadium ring, site boundary; hover/click a tower → card with phase, floors, typical-floor flat list (config, SBA, facing) and links into `/explore?wing=` and `/plans`; realm filter labels amenities; auto-orbit until first interaction; reset view; focus eases to the selected wing. Quality tier: coarse pointer / ≤4 GB → no shadows, dpr 1; no WebGL 2 → registered master-plan image. Below: three task entry cards, seven home-type cards, six realms, phases, connectivity (as stated), badge legend. Display face Marcellus added.
- Verified in the in-app browser (desktop 800 px and 375 px mobile): towers, labels, selection card for Wings 12 and 8, no horizontal scroll, `tsc`, `eslint`, `next build` clean. Not yet: real phone, headset.

## Increment 2026-10-21 — realistic interior

- ✅ **Furnished-unit pipeline imported** from `../sohba` into `app/src/lib/unit/` (`unitGeometry.ts`: walls with door / window openings, sills, lintels, parapets, glass from the traced vector plan; `furniture/`: procedural PBR kit, canvas textures, per-material merging, CC0 Poly Haven GLB fitting with meshopt decoding) plus `src/data/sobha/traced/furniture/*` (per-type layouts traced from the vendor's drawn furniture + rule-based décor), `furnitureModels.ts` and `public/models/furniture/` (37 GLBs, 8.9 MB).
- ✅ **`RealisticUnit`** (`components/three/RealisticUnit.tsx`) mounts that inside `PlanScene` in the plan's own frame (traced origin = wall-bbox corner, verified for all 7 types): themed floors, skirting, furniture, art, curtains, pendants; image-based light from three's RoomEnvironment (PMREM, no network) on the scene and every material; up to 3 warm point lights (1 in VR); desktop shadows from a sun through the openings; ceiling with downlights in walk / VR. `quality='vr'` in a session drops shadows and uses low-poly props. "Realistic interior" toggle in `/plans` (default on; off = the old extruded walls + boxes, with the wall-height slider).
- Verified in the in-app browser: Types A and K3 render furnished in orbit and walk modes, no console errors, `tsc` / `eslint` clean. **VR not verified**: the iwer emulator could not be installed in the Claude browser pane this session (module loads, device never installs); needs a headset or a PC-VR runtime.

## Increment 2026-10-21 — headset review fixes + the world outside the window

Review of a 4-minute Quest recording (263 frames): wall art and wall TVs leaked through walls as black slabs, a TV sat on a desk, rugs ran under beds and past room edges, the scale cube / figure showed from balconies, the wrist panel was oversized and parked in the start view, nothing existed outside the balcony.

- ✅ `lib/unit/furniture/assemble.ts` `adjustItem`: wall-hung items snap to the nearest wall face on the room side (half wall thickness + half depth), wall TVs never below 0.95 m, rugs clipped to the room (120 mm inset) or dropped. Scale references hidden in realistic mode. XR panel 170 px / minimap 150 px, anchored lower-left and tilted down.
- ✅ **Surroundings** ported from `../sohba` into `lib/unit/{worldTiles,osmTiles,buildingFloor,siteLayout}.ts`, `lib/unit/community/*` and `components/three/world/RealWorldContext.tsx` (+ `@mapbox/vector-tile`, `pbf`, `public/fonts/NotoSans-Regular.ttf`): OpenFreeMap z14 vector tiles (buildings extruded to render_height, water, green, roads), optional raster ground (OSM map / EOX Sentinel-2 cloudless / Esri imagery), AWS terrarium terrain (z13, 3 km, draped ground, base elevation reported), the SOBHA community (14 wings from the traced master plan, same-floor neighbour flats, registered master-plan ground, stadium, water, roads, trees), NOAA sun for an IST date / hour with a sky dome and 4096² sun shadows on desktop.
- ✅ `RealisticUnit` takes a flat `placement` (mirrored flats build the mirror image of the plan and layout), a building floor (podium 4.5 m + 3.0 m per floor), ground mode, date and hour; `PlanScene` mirrors the nav grid, labels, teleport and minimap raster for mirrored flats and drops its own sun / sky when the world is on. `/plans` panel "Where this home is": flat (wing · flat · mirrored · faces), floor slider with eye height and metres above sea level, balcony and door bearing from the placement, ground imagery, date + hour, surroundings toggle and status (OSM buildings, terrain tiles, site elevation, relief within 3 km).
- Verified in the in-app browser (1440 px): Type A at Wing 1 flat 6 floor 24 / 44, mirrored flat 5, 597 OSM buildings, 4 terrain tiles, site ≈ 858 m ASL. Not verified on the headset since these changes.

## Increment 2026-10-21 (b) — second headset review

372 frames reviewed. Findings and fixes:
- Rugs still read as floor patches under beds and desks → rugs are now dropped when a bed / wardrobe / desk / dresser / TV unit / kitchen run covers > 15 % of them (`assemble.ts` `adjustItem`).
- Bathroom towel ring and sconce poked through side walls (they were placed 16 cm past the vanity edge) → clamped inside the vanity width; WC roll holder clamped to the pan width (`items.ts`).
- "Shallow holes" at the entrance → ducts / shafts get a dark floor and a 0.3 m slab now extends 1.6 m past the unit footprint (`RealisticUnit` `Solids`).
- Top view blocked → in XR top mode and desktop top view the floors above the unit are not drawn (`hideAbove` through RealWorldContext → Community) and the ceiling is hidden; VR top zoom range 3–600 m, desktop orbit zoom-out 900 m with surroundings on.
- Night-time look at 10:30 → sun defaults to a fixed 10:30 IST (headset clocks are not trusted); "Now (IST)" button; interior fill raised (hemisphere 0.7 + ambient 0.35, point lights ×1.6, wall IBL 0.75, exposure 0.92); tower massing lifted (colour ×1.35 + emissive).
- Amenity names: all 30 legend amenities + One Club + One Emporium labelled in top views (drei Text billboards, realm colours).
- Desktop walk → top view threw in `DesktopCamera.frame` while the pointer-lock controls were still the default controls → guarded.
- Verified in the in-app browser: overview, walk, top view at Wing 1 flat 6. Not re-verified on the headset.

## Next increments (not started)

3. **Unit-in-tower placement**: once SOBHA supplies typical-floor key plans with dimensions, position each unit plan inside its wing so `/plans` can be entered from a specific floor in `/explore`.
4. **Routing & isochrones**: add OSRM/Valhalla (self-hosted or a documented paid key) for travel-time rings.
5. **Inventory backend**: Supabase/PostGIS with units × floor × PLC tier × availability feeding the price helper.
6. **Headset QA pass** on Quest 3 / PC-VR: comfort, teleport arc, controller models, performance budget.

- 2026-10-23: site explorer sun now follows the chosen IST date/time (NOAA solar position from lib/solar.ts): sky dome, shadow-casting light, twilight dimming, sunrise/sunset readout. Shadows remain illustrative (massing towers).

## Product-brief increments (2026-10-23)

| Brief item | Status | Where |
|---|---|---|
| Find a Home (Tower → Configuration → Floor → Flat, any order; only sales-sheet flats offered; wings 3, 5, 6, 7 shown as unlabelled) | ✅ | `/homes` — `src/app/homes/HomesClient.tsx`, `src/lib/homes.ts` |
| Home summary with sourced SBA, carpet, printed facing (with the no-legend caveat), estimated balcony bearing, indicative price with PLC tier, provenance badge | ✅ | same |
| Shortlist (per-browser localStorage), header chip with count | ✅ | `src/lib/shortlist.ts`, `components/ui/Shell.tsx` |
| Compare side by side, share a list by URL (`/compare?homes=1-5-23,10-3-8`), merge into own shortlist | ✅ | `/compare` — `src/app/compare/CompareClient.tsx` |
| Shareable URLs: `/homes?wing&config&floor&flat`, `/plans?plan&flat=wing:flat&floor&view&present`, `/explore?wing&floor&present` | ✅ | the three clients, `router.replace` on change, no transient state in links |
| Presentation mode (panels hidden, bottom bar with selected-home label, shortlist switcher, Compare, Exit) | ✅ | `components/ui/PresentationBar.tsx`, `/plans`, `/explore` |
| Guided tour: gate → One Club → World Stadium → Continental Grounds → chosen wing (auto-play, keyboard, VR rig flights), hand-off into the unit viewer's room-by-room tour; the same site stops also run inside /plans (camera flights through the realistic surroundings, then rooms) | ✅ | `src/lib/tour.ts`, `components/ui/TourBar.tsx`, `/explore?tour=1`, `/plans?tour=1` |
| Guided tour narration (ElevenLabs clips, browser-voice fallback) and Google Photorealistic 3D Tiles on /explore and /geo behind `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | ✅ code; needs the keys to exercise | `components/ui/TourBar.tsx`, `scripts/generate-narration.ts`, `components/three/GoogleTiles.tsx`, `GeoMap.tsx` |
| Guided first-use tour, natural-language search, mobile bottom sheets, quality-aware fallback, enquiry flow | ⏳ not started | — |

Not done by design: availability, booking, live pricing (no business data source); routed travel times (no routing service).
- 2026-10-24: /explore site model sits on real terrain (AWS Terrarium DEM via the plans page's loadTerrain, re-based so the cricket ground is y = 0; site ≈ 865 m ASL, −7 to +25 m within 1.8 km). The site-plan raster is draped on it (10 m cells), each tower and podium stands on the ground height at its footprint, labels and tour targets follow, and the draped ground hides under Google's photoreal mesh. VR walking still assumes flat ground.
