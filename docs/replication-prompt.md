# Replication prompt — Spatial Explorer for a new real-estate project

_Paste everything below the line into Claude Code (or any coding agent) in an empty repo that holds the new project's sales collateral. Replace the `<<…>>` placeholders first. The prompt is written so that nothing from the SOBHA OneWorld build is left out; drop a section only if the new project genuinely has no such feature._

---

You are building a **Spatial Explorer** for the residential project **<<PROJECT NAME>>** by **<<DEVELOPER>>** at **<<LOCALITY, CITY>>**. It is a one-page web app (plus a media page) that lets buyers, sales staff and planners explore the project in 3D, in VR and on a map, built entirely from the developer's sales collateral. Every fact shown in the UI carries a provenance badge (`source`, `external`, `approximate`, `assumed`). Work in the order of the phases below; after each phase, run the checks in §12 and show me proof in the browser before moving on.

## 0. Inputs in this repo (read all of them first)

| File(s) | What it is |
|---|---|
| `<<brochure.pdf>>` | Brochure: realms / zones, amenities list, renders |
| `<<master-plan.pdf/jpeg>>` | Master plan: tower positions, roads, amenity legend markers, trees, north arrow, scale bar |
| `<<floor-plans.pdf>>` | Unit floor plans (vector PDF ideally), one page per unit type, with room dimension labels |
| `<<key-plans.pdf>>` | Typical-floor key plans: flat numbers, facing letters, position of each flat in the wing |
| `<<sales-sheet.pdf/xlsx>>` | Unit mix, areas, base price, floor-rise (FRC) and preferential-location (PLC) bands, phases, RERA numbers |
| `<<elevation-render.jpg>>` | Tower elevation: facade material and rhythm |
| `<<*.mp4>>` | Walk-through / render videos: shape of club, entrance gate, courts, amphitheatre, plaza, pool decks |

Rules for inputs: never edit originals; put every derived file (SVGs, rasters, page JPEGs, scale analysis) in `source-assets/`; record every asset in a manifest with its provenance.

## 1. Stack and repo layout

- Next.js 16 (App Router, Cache Components on), React 19, TypeScript, Tailwind 4.
- 3D: React Three Fiber, drei, `@react-three/xr` (one XR store for the whole app), three.
- Map: MapLibre GL **5.x** (pinned; deck.gl's overlay breaks on MapLibre 6 terrain) + deck.gl 9 `MapboxOverlay`.
- Layout: `app/` is the Next app; `app/src/{app,components,data,lib}`; `app/public/{plans,media,narration,geo,vendor}`; `docs/` for the handover, PRD, asset inventory.
- Lint with the React Compiler rules on (no `setState` synchronously in effects, no ref access during render). `npx tsc --noEmit && npm run lint && npm run build` must stay green.
- Copy the MapLibre worker and the DRACO decoder into `public/vendor/` on `predev`/`prebuild` (Turbopack cannot resolve their URLs). Git-ignore `public/vendor`.
- Never create `app/app/` (Next treats it as a second router root). Never use drei `<Html>` (breaks under React 19); project labels with a page-owned DOM layer updated per frame.

## 2. Data pipeline (do this before any UI)

1. **Floor plans.** Extract the vector geometry of each plan page (walls, doors, windows, fixtures, room labels, dimension text). Derive the page scale from ≥ 10 room dimension labels per page by least squares; report the residual (target < 0.1 %). Write `plans.generated.ts`: per plan, scale, rooms (name, polygon, area, printed dimensions), openings, entry door (nearest opening to the foyer), and wall segments. Everything here is `source`.
2. **Flat directory.** From the key plans and sales sheet build `flats.ts`: wing → floor range → flat numbers → unit type, carpet / SBA, facing letter, phase, price band. Mark wings the sheet does not label as having no records rather than inventing them.
3. **Unit placement.** Fit each unit type's plan into its wing's footprint from the key plan (rotation = `northDeg`, mirror flag, translation). Store a confidence per placement; show it as a badge in the UI.
4. **Site georeference.** Find the site polygon on OpenStreetMap (store the way id); georeference the master-plan raster to it (px/m, rotation, anchor) and store as `SITE_IMAGE`. Fetch nearby OSM buildings, roads and POIs once with Overpass and commit them as GeoJSON.
5. **Master-plan trace.** Trace roads, paving, running track, sports field, water bodies, perimeter wall, club mass and every tree position as vectors in a site frame registered to the OSM wing outlines. Tree positions are one-to-one with the plan — no procedural scatter.
6. **Two frames.** The raster georeference and the trace frame will disagree (ours: 60–90 m and ~18°). Fit a similarity transform (scale, rotation, translation) on the tower centroids present in both, report the RMS, and apply it as one group transform to everything taken from the trace. Any later feature taken from the trace (a tour stop, a prop) must go through the same function.
7. **Terrain.** Sample a public DEM (AWS Terrarium tiles) for the site and a 2–3 km surround; expose a `heightAt(x, z)` function used by the site model, the tours and the VR rig.
8. **Project facts.** `project.ts`: towers (name, wing number, floors, footprint), phases, pricing bands, realms / zones with their amenities, hotspots (club, stadium, entrance, retail) with positions and copy, site area, total units, RERA.
9. **Asset inventory.** `docs/asset-inventory.csv`: every input and derived file, what it was used for, provenance.

## 3. Single page and URL state

One page `/` with sections in this order, each with an id and `scroll-margin-top` for the sticky header: `#explore` (the stage), `#find`, `#compare`, `#location`, `#community`. A separate `/media` page lists videos, master plan, sales sheet and brochure pages with "open in stage / map" links.

Header: project name, section links with scroll-spy (use a scroll listener; IntersectionObserver proved unreliable), Media, a Shortlist chip with count. A back-to-top ↑ button appears once the stage has scrolled away. The header must stay sticky down the whole page: `body` has no fixed height and `main` is not `flex-1 min-h-0`.

Selection state lives **only in the query string** and is read every render through one hook (`useUrlState()` → `{ params, set(patch), num(key) }`) — never copied into component state — so links from lower sections update the stage without a remount. Keys:

| key | meaning |
|---|---|
| `mode=home` | stage shows the unit viewer (absent = community) |
| `wing`, `flat`, `floor` | a home |
| `plan=<type>` | unit type when no flat is chosen |
| `beds`, `finish`, `facing` | finder filters |
| `view=split\|2d\|3d` | home-mode layout (absent = 3D + plan minimap) |
| `tour=1` / `tour=rooms` | guided tour: site tour / room-by-room only |
| `present=1` | presentation mode |
| `homes=w-f-fl,…` | shared compare list |

Keep legacy routes (`/explore /plans /homes /compare /geo`) as client-side redirects that map old params to the new scheme and land on the right section (`window.location.replace`; `router.replace` does not honour the hash). `searchParams` in a server page blocks prerendering under Cache Components, so read the query only in client components wrapped in `<Suspense>`.

## 4. The stage (hero)

A full-viewport section (`100svh − header`, min 560 px) with two modes and **one** live `<Canvas>` + one `<XR>` tree at a time (key the canvas by mode so Enter VR always enters what is on screen).

Chrome:
- **Mode switch** top-left (segmented control: Community | Home).
- **Hero copy** top-left on first load (eyebrow, display title, one stat line, "Find a home" / "Guided tour" buttons) over a left-to-right gradient scrim; fades on first pointer interaction or when a home is selected.
- **Compass** top-right: an external store publishes the camera heading from inside the canvas (probe in `useFrame`, publish on ≥ 1° change; server snapshot must be `null`, not `NaN`); the DOM compass rotates with it; click flies the camera north-up (Home: back to the overview).
- **⛶ Full screen**: the stage section itself goes fullscreen (Fullscreen API, Esc exits); **Controls** toggles the floating rail.
- **Camera pad** bottom-right, map-app style: rotate left / right pair, Tilt toggle (8° near-top ↔ 55° perspective), + / −. Commands go through an external store to a driver inside the canvas that moves the OrbitControls; ignored in walk / VR.
- **Action bar** bottom-centre, the single place for **Guided tour**, **Enter VR** and **Present**.
- **Control rail**: right column ≥ 1024 px, bottom sheet below (closed by default on phones). Hidden in present and tour modes. Render it conditionally (a custom rail class outranks Tailwind `hidden`).
- **Touch**: one finger over the 3-D canvas must scroll the page, two fingers or a sideways drag move the camera (OrbitControls writes `touch-action: none` inline; override with `touch-action: pan-y !important` under `(pointer: coarse)`). Buttons ≥ 40 px on coarse pointers. Below 1024 px: hide the camera pad while the bottom sheet is open, keep the action bar on one line, hide the mouse hint lines, shrink the plan minimap so it clears the action bar and let it expand to the full width. Tighten the header brand and nav below 640 px (nav scrolls sideways without a scrollbar).

### 4.1 Community mode (site model)
- Terrain mesh from the DEM, satellite / plan raster draped on the site; towers seated on the terrain.
- Towers extruded from the traced footprints, floors × floor-to-floor (3.0 m **assumed** unless the developer gives heights), with a canvas-generated facade texture read from the elevation render (fins, balcony bands, glass), a roof material, a crown and a developer-name sign plane. Click a tower → selects the wing (URL), shows its stats card; hover highlights.
- **Landscape layer** (toggle in the rail): roads, paving, plazas, running track, jogging loop, sports field with markings, water, perimeter wall, club mass, and the one-to-one trees. **Amenity stand-ins** at the plan's legend markers, shaped after the render videos: entrance canopy snapped to the nearest driveway, fenced courts with floodlight masts, amphitheatre steps, skating rink, lawns, pet park, plaza with radial paving + basin + sculpture, lagoon with islands and pavilions, zen courtyard, play park, yoga deck, pool decks with cabanas, observation deck. Cull trees under the props. All badged `assumed`.
- **Sun and sky**: time-of-day slider (default = live local clock when the sun is up, else 10:30), real solar position for the site's lat/lon and date, shadows. **Night**: below −8° solar altitude drop the sky dome for a dark background, a star field, a moon opposite the sun and a faint blue fill light.
- Ground outside the site: options for OSM vector buildings, satellite raster (Esri World Imagery, dev-use terms), Sentinel-2, and Google Photorealistic 3D Tiles behind an env key with a height-offset slider.
- Hotspot labels (club, stadium, entrance, retail) as DOM labels projected per frame.
- Rail content: sun / time, layers (landscape, labels, ground), selected wing card with "Open 1:1 plan", floor picker, legend of badges.

### 4.2 Home mode (1:1 unit)
- Default layout: 3D interior full width with the **floor plan as an expandable minimap** bottom-left (`⤢ Expand`); `view=split` side by side, `view=2d` plan only, `view=3d` interior only.
- 2D plan viewer: vector plan at true scale, room labels and areas, **north arrow** from the flat's placement, live camera / walker position dot, measure tool, calibrate tool, red marker for the current tour room. Clicking a room centres the 3D camera over it looking straight down (one-shot framing; orbit stays free afterwards), or walks there in walk / VR mode.
- 3D interior built from the plan: walls at an assumed height, floor and ceiling finishes, doors and windows at the plan's openings, a double-leaf front door at the entry opening, furniture per room type from an SVG furniture library (all `illustrative`), lighting.
- **Real surroundings** at the chosen floor: the flat placed in its wing at `floor × floor-height`, neighbouring wings as masses, OSM 3D buildings, satellite ground by default (Esri; Sentinel-2 / OSM tiles / vector selectable), terrain, the same sun / sky / night as the site, a facing probe that labels the view out of each window.
- Rail: unit type / wing / floor / flat pickers, layout switch, ground options, walk mode toggle, time of day, balcony-facing and sun-into-rooms insight, badges.

### 4.3 Guided tours
- **Site tour**: entrance gate (from the approach road, above the boulevard trees) → club → stadium / central green (straight down if towers ring it) → sports grounds → the chosen wing → "Step inside" switches to Home mode with `tour=rooms` with no reload. Stops are `{ position, target, label, copy, narrationId }`; camera flies with easing; a bottom **TourBar** shows copy, progress, Back / Next / Exit and the hand-off button.
- **Room tour**: foyer → each room in plan order; each stop looks down from above framed with its neighbours (1.9× fit, 6 m minimum height), pins the room with a beacon that scales with camera distance, and marks it red on the 2D plan.
- **Narration**: generate MP3s once with a TTS service (`npm run narration` → `public/narration/*.mp3` + `index.json`, committed), play them per stop, fall back to browser speech when a clip is missing. Nothing calls the TTS API at runtime.

### 4.4 VR (WebXR)
- One XR store app-wide; each scene's content sits inside `<XR>`. Enter VR button in the action bar (compact), with a "not supported" state.
- **Rig**: left stick walks (pans in top view), right stick snap-turns, right trigger on the floor teleports; `flyTo / turn / nudge / zoom` imperative handle so tours and the HUD can drive it. Walk height follows the terrain function.
- **Hand tracking** (Quest without controllers): pinch = thumb–index gap < 2.2 cm with hysteresis (release at 3.5 cm); one pinched hand drags the world; two pinched hands rotate and, in top view, zoom.
- **Head-locked map HUD**: a "Show map" pill fixed at the bottom of the view (lerped follow, no depth test); tap expands into the minimap (site: wing markers; home: room regions), tap collapses. Pointing the controller ray at a room's floor highlights that room on the map. No camera controls inside the minimap.
- **Wrist panel** with rotate / top view / zoom rows, collapsible — build it, but ship it behind a `XR_PANEL` constant (off by default; the client preferred the HUD alone).
- XR buttons: high-contrast hover (blue fill, white 2 px border) so the white controller ray is visible on them.
- Headset testing: HTTPS on the LAN via a small Node proxy with a self-signed cert (git-ignored), `allowedDevOrigins` in `next.config.ts`; the live URL is simpler.

### 4.5 Presentation mode
`present=1` hides every panel and leaves a bottom bar with the shortlist, next / previous home, and a Compare link. Tours still run.

## 5. Find a home (`#find`)
Filters as chips with live match counts: Tower → Bedrooms (1–4 BHK) / Finish (e.g. Grande, Luxe) → Facing (printed letter) → Floor → Flat. Towers without matches dim. Flat cards appear only once a tower is chosen or the filters leave ≤ 9 matches (never list the whole inventory). Each card: type, area, facing, floor, indicative price from base × area + FRC + PLC bands (badged), **Open 1:1 plan**, **Show in site**, ☆ shortlist. A "Your home" card echoes the current URL selection. Unit-type cards link to the plan in Home mode.

## 6. Compare (`#compare`)
Side-by-side table of the browser shortlist (localStorage) or a shared `homes=` list: type, areas, floor, facing, price, sun hours into rooms, distance to club / gate, badges. Share button copies `/?homes=…#compare`.

## 7. Location (`#location`)
MapLibre map (60 vh) with an aside: basemap (OpenFreeMap) under which an **Esri satellite** raster layer is on by default; **hillshade only — no 3D terrain mesh** (deck.gl cannot follow MapLibre terrain and the site renders twice); OSM 3D buildings; tower extrusions (click → selects the wing in the stage and scrolls up); **POIs as upright lollipop pins** (PNG rasterised on a canvas — deck.gl rejects SVG data URLs) coloured by category with a text label layer; **distance rings** at 1 / 2 / 3 / 5 / 7 km in gold with a dark halo and N/S labels; site boundary; measure tool; map compass; insights (nearest metro / school / hospital / airport with straight-line distance, badged `external`). Optional Google photoreal tiles behind the same env key. On touch, MapLibre `cooperativeGestures` (one finger scrolls the page, two move the map); on phones the map comes before its controls and the legend is hidden. The compare table keeps its label column sticky while scrolling sideways.

## 8. Community (`#community`)
Realms / zones with their amenities, phases timeline with RERA numbers, connectivity list, and a "How to read the badges" block explaining `source / external / approximate / assumed`.

## 9. Secrets and services
- Only optional keys, in `.env.local` (git-ignored), never in chat, commits or docs: a Google Map Tiles key (`NEXT_PUBLIC_…`, referrer-restricted) and a TTS key used offline.
- Services: OpenFreeMap (basemap), Esri World Imagery (dev-use terms — license or switch before public launch), AWS Terrain Tiles, OpenStreetMap / Overpass (ODbL), EOX Sentinel-2 (CC BY), Google Map Tiles (paid, optional), the TTS vendor (offline), Vercel (hosting). Show attribution for each.

## 10. Deploy
Vercel, auto-deploy on `main`. The git author email must belong to a Vercel team member or the deploy is silently BLOCKED. `NEXT_PUBLIC_*` values are inlined at build time (redeploy after changing). The site is public unless Deployment Protection is on; the collateral is served to anyone with the URL.

## 11. Documentation to leave behind
`docs/HANDOVER.md` (what it is, folder map, URL state, stage anatomy, running it, keys, deploy rules, gotchas, data-accuracy table, verified / not verified, open items, external services), `docs/prd.md`, `docs/asset-inventory.csv`, `docs/technical-architecture.md`. Keep a list of what to ask the developer for to upgrade badges: floor heights and sections, CAD / BIM, dimensioned key plans, a surveyed coordinate, per-unit PLC tiers, inventory, official road / metro alignments, elevation drawings, amenity designs.

## 12. Verification before each hand-off
In a desktop browser: both stage modes load; the site tour runs gate → wing → hand-off into rooms without a reload; the room tour frames each room wide with the beacon; compass follows the camera and resets north-up; nav pad rotates / tilts / zooms; full-screen toggles; minimap click frames the room top-down with orbit still free; landscape aligned to the raster (stadium within a few metres, trees on their drawn positions); facades and crowns; night sky at 20:00; finder filters narrow to ≤ 9 before cards show; shortlist → compare, shared `homes=` link renders; Location map shows satellite, pins with labels, rings, towers, no duplicate site; legacy URLs redirect to the right section; header sticky down the whole page; phone (375 px) and tablet (768 px) layouts have no horizontal scroll, the header fits, nothing over the stage overlaps, buttons are ≥ 40 px, the canvas reports `touch-action: pan-y`, and the rail is a bottom sheet; on a real phone, one finger scrolls past the stage and two fingers move the camera; `tsc`, `lint`, `build` green. On a headset (if available): Enter VR from both modes, sticks and teleport, pinch gestures, HUD show / hide, floor-ray room highlight, narration.

## 13. Accuracy discipline
Every number and shape gets a badge. Floor-plan geometry is `source`; OSM, DEM, imagery are `external`; traced landscape, footprints, placements and the georeference are `approximate`; floor heights, facades, furniture, amenity shapes and the front door are `assumed / illustrative`. Never upgrade a badge without a document to cite. Where wings or flats have no records, say so in the UI rather than inferring.
