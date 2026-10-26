# SOBHA OneWorld Spatial Explorer — Handover

_As of 2026-10-24, commit `ceadcbe` on the working branch (`1e9009a` + the phone / tablet layout pass). Written for whoever takes this over; assumes no prior context._

## 1. What this is

A one-page web app (plus a media page) that lets buyers, sales staff and planners explore SOBHA OneWorld (Greater Whitefield, Old Madras Road, Bengaluru) in 3D, in VR and on a map. Everything is built from the developer's sales collateral; every fact in the UI carries a provenance badge.

The page opens on a full-viewport **stage** with two modes:

- **Community** — the site model: real terrain, time-of-day sun (stars and a moon after dusk), the 14 towers with facades read from the elevation render, and the master-plan landscape (roads, club, track, field, water, trees, amenity stand-ins).
- **Home** — a 1:1 unit: the printed floor plan as an expandable minimap beside a furnished 3-D interior with the real surroundings (satellite ground, OSM buildings, the neighbouring wings) at the chosen floor.

One bar carries Guided tour, Enter VR and Present for whichever mode is on screen; a compass, a map-style camera pad and a full-screen toggle sit over the stage. Below it: **Find a home** (filters → flat → shortlist), **Compare**, **Location** (satellite map with POIs) and **Community** (realms, phases, connectivity).

- **Live:** https://sobha-oneworld.vercel.app (public, no login)
- **Repo:** https://github.com/coherexlabs-hash/shobha (private), app in `app/`, docs in `docs/`
- **Hosting:** Vercel project `sobha-oneworld`, team "Coherex Labs' projects", auto-deploys every push to `main`

## 2. Folder map

| Path | What |
|---|---|
| `*.pdf`, `*.jpeg`, `*.mp4` (repo root) | Original SOBHA collateral. Never edited. |
| `source-assets/` | Derived files: vector plan SVGs, site raster, brochure page JPEGs, scale analysis |
| `app/` | Next.js 16 application (React 19, TypeScript, Tailwind 4, React Three Fiber, @react-three/xr, MapLibre 5 + deck.gl 9) |
| `app/src/app/` | `page.tsx` (the single page), `media/`, `layout.tsx`; `explore/ plans/ homes/ compare/ geo/` are redirect stubs |
| `app/src/components/stage/` | `Stage` (chrome, mode switch, action bar, full screen), `CommunityStage`, `HomeStage` (one canvas + control rail each), `Compass`, `HeadingProbe`, `NavPad`, `NavDriver` |
| `app/src/components/sections/` | `FindHome`, `CompareSection`, `LocationSection` |
| `app/src/components/three/` | `SiteScene` (site model, `NightSky`, crown + sign), `SiteCommunity` (landscape layer), `towerFacade.ts`, `PlanScene` (+ `RoomBeacon`), `RealisticUnit` (+ `GrandDoor`), `world/RealWorldContext` (surroundings), `GoogleTiles`, `XRRig`, `XRUI` (`XRMapHud`, `XRMiniMap`, `XRPanel`), `DomLabels`, `FirstPersonRig` |
| `app/src/components/geo/GeoMap.tsx` | MapLibre + deck.gl map (satellite, pins, rings, towers) |
| `app/src/components/ui/` | `Shell` (header scroll-spy, back-to-top), `TourBar`, `PresentationBar`, primitives |
| `app/src/components/plan/PlanViewer2D.tsx` | The vector plan with measure / calibrate tools, north arrow, live position dot |
| `app/src/components/LegacyRedirect.tsx` | Old route → single-page URL mapping |
| `app/src/data/` | All project facts: `project.ts` (towers, phases, pricing, hotspots), `manifest.ts` (asset registry, raster georeference), `plans.generated.ts` (plan scale + rooms), `sobha/` (flat directory, placements, traced plans, master-plan trace, trees, furniture) |
| `app/src/lib/` | `urlState.ts` + `useUrlState.ts` (query-string state), `tour.ts`, `homes.ts`, `shortlist.ts`, `pricing.ts`, `solar.ts`, `geo.ts`, `scale.ts`, `heading.ts`, `navCommands.ts`, `navPose.ts`, `xr.ts`, `unit/` (unit geometry, world tiles, terrain, `siteLayout`, `siteToExplorer`, `community/` builders incl. `amenityProps.ts`) |
| `app/public/` | Served assets: plans, media (96 MB, mostly video), narration (4 MB, 90 MP3s), OSM GeoJSON, vendor files copied at build |
| `docs/` | This file, `project-understanding.md`, `technical-architecture.md`, `implementation-plan.md`, `asset-inventory.csv`, `prd.md`, `product-vision.md` |

## 3. Pages and URL state

| Route | Purpose |
|---|---|
| `/` | **Everything.** Sections, in order: `#explore` (the stage), `#find`, `#compare`, `#location`, `#community`. The header highlights the section in view (scroll-spy); a ↑ button appears once the stage has scrolled away. |
| `/media` | Videos, master plan, sales sheet, brochure pages |
| `/explore`, `/plans`, `/homes`, `/compare`, `/geo` | Retired. Client-side redirects to `/` with the old query mapped (`LegacyRedirect.tsx`), so shared links keep working. |

Selection state lives in the query string of `/` (`lib/urlState.ts`) and is read every render — never copied into component state — so links are shareable and a link from a lower section updates the stage without a remount.

| key | meaning |
|---|---|
| `mode=home` | stage shows the unit viewer (absent = community) |
| `wing`, `flat`, `floor` | a home |
| `plan=type-a` | unit type when no flat is chosen |
| `beds`, `finish`, `facing` | finder filters (1–4 BHK, Grande / Luxe, printed facing letter); legacy `config` (e.g. 4B-Grande) still narrows |
| `view=split\|2d\|3d` | home-mode layout (absent = 3D + plan minimap) |
| `tour=1` / `tour=rooms` | guided tour; `1` is the site tour (and, on an old plan link, site fly-overs then rooms), `rooms` is room by room only — Home mode's own button and the community tour's hand-off use it |
| `present=1` | presentation mode |
| `homes=1-5-23,…` | shared compare list |

Example: `/?mode=home&plan=type-a&wing=1&flat=5&floor=20#explore`.

### 3.1 Stage

`Stage.tsx` owns the mode switch, hero copy (fades on first interaction), compass, Controls toggle, `⛶ Full screen` (the section itself goes fullscreen; Esc exits), the camera pad and the single action bar. `CommunityStage` / `HomeStage` each own one `<Canvas>`, keyed by mode so one WebGL context and one `<XR>` tree are live at a time — Enter VR always enters what is on screen — plus the floating control rail (right column ≥ 1024 px, bottom sheet below, closed by default on phones).

- **Compass** (`HeadingProbe` → `lib/heading.ts` → `Compass`): follows the camera in both modes; click flies the site camera north-up (Home: back to the overview). The 2D plan draws its own north arrow from the flat's placement.
- **Camera pad** (`NavPad` → `lib/navCommands.ts` → `NavDriver` inside the canvas): rotate pair, Tilt toggle (near-top ↔ 55° perspective), + / −; panning is drag. Ignored in walk / VR.
- **Home layout** defaults to full-width 3D with the plan as a minimap (bottom-left, `⤢ Expand`). The red dot is the camera / walker; clicking a room centres the camera over it looking straight down (orbit stays free), or walks there in walk / VR mode.
- **Front door**: the entrance opening carries a double-leaf walnut door (`GrandDoor` in `RealisticUnit.tsx`, illustrative).
- **Touch (phones and tablets, < 1024 px)**: one finger over the 3-D canvas scrolls the page (the stage's canvases get `touch-action: pan-y`); two fingers or a sideways drag drive the camera. Buttons are 40 px tall on coarse pointers. The rail is a bottom sheet (45 svh) and the camera pad hides while it is open; the action bar never wraps; the mouse hint lines are desktop only; the plan minimap is smaller and clears the action bar, and expands to the full width. The header brand and nav tighten below 640 px (nav scrolls sideways, no scrollbar).
- **Ground outside the site** (Home): Esri satellite imagery with the OSM 3-D buildings on top by default; OSM vector, OSM tiles and Sentinel-2 selectable.

### 3.2 Guided tours

Community: gate (from the approach drive, above the boulevard trees) → One Club → World Stadium (straight down, since the towers ring it) → Continental Grounds → the chosen wing → "Step inside" switches to Home mode with `tour=rooms`, no reload. Home: room by room from the foyer; each room stop looks down from above, framed with its neighbours (1.9× fit, 6 m minimum height), and pins the room with a red beacon that scales with camera distance (`RoomBeacon`); the 2D plan marks the same room in red. Narration: pre-generated MP3s with browser speech as fallback (`TourBar`).

### 3.3 Landscape in the site model

`SiteCommunity.tsx` mounts the unit viewer's community builders (`lib/unit/community/`) in the explorer: One Club mass, perimeter wall, roads / paving / plazas / running track / jog loop, stadium field, water and the traced trees. `amenityProps.ts` adds stand-ins at the master plan's legend markers, shaped after the developer's render clips (`public/media/video`, frames read 2026-10-24): entrance wave canopy snapped onto the driveway + roundabout, fenced tennis / pickle-ball / multi-sport courts with floodlight masts, amphitheatre, skating rink, lawns and pet park, OneWorld Plaza (radial paving, basin, lattice sphere), Lagoon Cove (paving islands, boulders, cocoon pavilions), Zen Courtyard (gravel, mounds, decks, boulders), Play Park, Yoga Lawn deck, pool decks with cabanas, Observation Deck. Trees under the props are culled. Towers wear `towerFacade.ts` (bronze fins, cream balcony bands, dark glass) with a bronze crown and SOBHA plate. All **assumed**: the plan prints markers, not outlines. "Landscape" in the rail toggles the layer.

**Two frames.** The explorer's raster georeference (`SITE_IMAGE`) and the master-plan trace's site frame (registered to OSM wing outlines) disagree by 60–90 m and ~18°. `lib/unit/siteToExplorer.ts` fits a similarity (scale, rotation, translation) on the 14 tower centroids (RMS 3 m) and the whole landscape group carries it, so traced features land on the drawn ones. Anything else taken from the trace into the explorer (e.g. the gate tour stop) must go through `siteToExplorer`.

**Night.** Below −8° solar altitude the sky dome is dropped for a dark background, a star field and a moon opposite the sun with a faint blue fill (`NightSky` in `SiteScene.tsx`, also inside the unit viewer's dome). The stage's default hour is the live IST clock when the sun is up, else 10:30.

### 3.4 VR

One XR store for the whole app (`lib/xr.ts`); the scenes wrap their content in `<XR>`. In a headset: left stick walks (or pans in top mode), right stick snap-turns, right trigger on the floor teleports. **Hand tracking** (Quest, no controllers): one pinched hand drags the world past you; two pinched hands rotate the view and, in top mode, zoom (`XRRig`; pinch = thumb–index gap < 2.2 cm). The minimap is a head-locked HUD (`XRMapHud`): a "Show map" pill fixed at the bottom of the view that expands into the map and collapses on tap; pointing the ray at a room's floor highlights that room on the map. The wrist control panel (`XRPanel`: rotate / top view / zoom, collapsible) exists but is **switched off for now** by the `XR_PANEL` flag at the top of `SiteScene.tsx` and `PlanScene.tsx`. XR buttons turn blue with a white edge under the ray.

### 3.5 Find a home, Compare, Location

Finder: Tower → Bedrooms (1–4 BHK) / Finish (Grande, Luxe) → Facing (printed letter) → Floor → Flat; every chip shows its match count, towers without matches dim, and flat cards appear only once a tower is chosen or the filters leave nine or fewer. "Open 1:1 plan" / "Show in site" set the stage. Compare reads the browser shortlist or a shared `homes=` list. Location: satellite (Esri) under OSM labels by default, hillshade, OSM 3-D buildings, tower extrusions (click → stage), POIs as upright pins with labels, distance rings at 1 / 2 / 3 / 5 / 7 km, measure tool, insights. On touch the map uses MapLibre's cooperative gestures (one finger scrolls the page, two move the map); on phones the map comes before its controls and the legend is hidden (it collided with the attribution). Compare keeps its label column fixed while the table scrolls sideways. The map draws **hillshade only, no 3-D terrain mesh**: deck.gl's overlay cannot follow MapLibre terrain, so with it on the towers, POIs and boundary sat apart from the draped OSM buildings and read as a second site.

## 4. Running it

```bash
cd app
npm install
cp .env.local.example .env.local   # fill in keys if you have them (optional)
npm run dev                         # http://localhost:3000
```

Checks that must stay green before pushing:

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Lint reports a few warnings in generated/ported files; no errors. In dev the stage's first load takes 15–40 s (terrain, trees, textures); production is quicker. Edits to `globals.css` sometimes need a dev-server restart to show (Turbopack did not hot-apply a `body` height change).

**Headset testing on the LAN.** WebXR needs HTTPS. `node scripts/https-proxy.mjs 3443 http://127.0.0.1:3000` fronts the dev server with the self-signed cert in `app/certificates/` (git-ignored; regenerate with `openssl req -x509 -newkey rsa:2048 -nodes -keyout certificates/key.pem -out certificates/cert.pem -days 365 -subj "/CN=<lan-ip>" -addext "subjectAltName=IP:<lan-ip>"`). `next.config.ts` lists the LAN origins allowed to load dev assets (`allowedDevOrigins`); add your subnet if it differs. The live Vercel URL is simpler for the Quest.

## 5. Keys and secrets

Only two, both optional, both in `app/.env.local` (git-ignored). Never paste them into chat, commits or docs.

| Variable | Purpose | Where set |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Photorealistic 3D Tiles in the Community stage ("Photoreal (Google)") and on the Location map. Browser-exposed by design. Needs **Map Tiles API** enabled and HTTP-referrer restriction (`https://sobha-oneworld.vercel.app/*` is registered; add `http://localhost:<port>/*` for local). Billed per root-tileset session; the app keeps the session alive across toggles. | `.env.local` locally; Vercel → Settings → Environment Variables as a **plain** variable (not "Sensitive", which Vercel refuses to expose). Rebuild after changing. |
| `ELEVENLABS_API_KEY` (+ `ELEVENLABS_VOICE_ID`) | One-time generation of tour narration: `npm run narration` writes `public/narration/*.mp3` + `index.json`. Clips are committed; production never calls ElevenLabs. Current voice: ElevenLabs "Sia" (Indian-accent English). | `.env.local` only |

No key is needed for the satellite imagery (Esri World Imagery public tiles — dev/testing terms, see §11).

## 6. Deploy rules (read before pushing)

1. **Commit author must be a Vercel team member.** This repo's local git identity is set to `coherexlabs <coherexlabs@gmail.com>`. Commits authored with any other email are silently **BLOCKED** by Vercel (state shows BLOCKED in the dashboard, site stays on the old build). If a push does not go live, check this first.
2. Pushing to `main` deploys. There is no staging; use Vercel preview deployments (branches) for risky work. The work so far was done on a branch and fast-forwarded into `main` with `git push origin HEAD:main`.
3. `NEXT_PUBLIC_*` values are inlined at build time; changing them on Vercel needs a redeploy.
4. The site is public. The brochure, plans, pricing sheet and videos are served to anyone with the URL. Turn on Vercel Deployment Protection if that is not acceptable.

## 7. Engineering gotchas

- **MapLibre is pinned to 5.x.** deck.gl 9.4's `MapboxOverlay` crashes on MapLibre 6 terrain (`map.transform` removed). Do not upgrade until deck.gl supports it.
- **MapLibre worker and DRACO decoder** are copied into `public/vendor/` by `scripts/copy-maplibre-worker.mjs` on `predev`/`prebuild`. Turbopack cannot resolve their URLs otherwise. `public/vendor` is git-ignored.
- **Never create `app/app/`.** Next treats it as the App Router directory and every route 404s.
- **No drei `<Html>`.** It breaks route changes under React 19. Labels use `components/three/DomLabels.tsx` (page-owned DOM, projected per frame).
- **Cache Components (Next 16) and the query string.** `searchParams` in a server page blocks prerendering (`instant = false` did not help); read the query in client components under `<Suspense>` (`useUrlState`, `LegacyRedirect`). Client components that need the URL are wrapped in `<Suspense>` in `app/page.tsx`.
- **useSyncExternalStore server snapshots** must be stable values: `NaN` fails React's identity check (use `null`).
- **Sticky header.** `body` must not have a fixed height and `main` must not be `flex-1 min-h-0`: both clamp the body to one viewport, and a sticky header only sticks within its containing block.
- **Stage CSS.** `.rail` and `.seg` live in `globals.css`; `.rail` outranks Tailwind's `hidden`, so the rail is conditionally rendered, not hidden.
- **Two frames** (§3.3): trace-frame content in the explorer goes through `siteToExplorer`; the explorer's own lon/lat helpers are geo-accurate but will not line up with the raster.
- **Touch-action on the stage.** three-stdlib's OrbitControls writes `touch-action: none` inline on the canvas, which traps page scrolling on phones; `globals.css` overrides it with `!important` under `(pointer: coarse)`. Keep that rule if the canvas or controls change.
- **deck.gl icons** reject SVG data URLs without natural size; the POI pins are rasterised to PNG on a canvas.
- **React Compiler lint rules** are on: no `setState` synchronously in effects (use a microtask or external store), no ref reads/writes during render, no mutation of hook results.
- **Two dev servers at once** need different dist dirs: `NEXT_DIST_DIR=.next-preview npm run dev -- --port 3100`.
- `.claude/launch.json` holds preview configs for the Claude desktop app; harmless elsewhere.

## 8. Data and accuracy (what is real, what is not)

| Thing | Status | Notes |
|---|---|---|
| Floor-plan geometry and room dimensions | **source-verified** | Vector PDF; scale derived from 12 room labels per page to < 0.01 % |
| Unit mix, prices, FRC/PLC bands, phases, RERA | source | Sales sheet 08.08.26 and master plan |
| Flat numbers and facing letters per wing | source (visual read) | Wings 3, 5, 6, 7 are unlabelled on the sheet and have no records; "facing" is read as the main-door direction (inference) |
| Site location and boundary | external | OpenStreetMap way 1427347113 (49.5 ac vs official 48.4) |
| Terrain | external | AWS Terrarium DEM; site ≈ 865 m ASL |
| Satellite imagery | external | Esri World Imagery (map and Home-mode ground); Sentinel-2 selectable |
| Roads, track, field, water, tree positions | approximate | Traced from the master-plan raster, registered to OSM wing outlines, then fitted onto the explorer raster (RMS 3 m) |
| Site-plan georeference (3 px/m, 22° rotation, anchor) | approximate | Derived from the 90 m ground and OSM edges |
| Tower footprints | approximate | Traced from the raster master plan |
| Flat position inside a wing, balcony direction | approximate | Fitted from key plans; confidence shown per flat |
| Floor-to-floor 3.0 m, podium, wall height, furniture, finishes | **assumed / illustrative** | Not in any document |
| Tower facades, crown, One Club mass, entrance canopy, courts, amphitheatre, rink, plaza, lagoon, zen garden, play park, decks, cabanas, front door | **assumed / illustrative** | Shapes after the developer's render clips; standard sizes at the plan's legend markers |
| Photoreal ground height for Google tiles | approximate | Constant + in-app offset slider |

Ask SOBHA for: floor heights and sections, CAD/BIM or typical-floor key plans with dimensions, a surveyed coordinate, per-unit PLC tiers, inventory/availability, official road and metro alignments, elevation drawings and amenity designs. Each one upgrades a badge from assumed/approximate to source.

## 9. What is verified and what is not

- **Verified in a desktop browser (this build):** both stage modes; the community tour from the gate through the hand-off into the rooms without a reload; Home tour rooms-only from the foyer with wide framing and the beacon; compass heading and north-up reset; 2D north arrow; nav pad (rotate, tilt, zoom); full-screen button present; minimap click → top-down framing with orbit still free; landscape aligned to the raster (stadium within 2 m, courts and trees on their drawn positions); tower facades and crowns; night sky at 20:00; finder filters (56 → 9 matches), shortlist / compare (own and shared lists); Location map with satellite, pins, labels and rings, no duplicate site; legacy-route redirects landing on the right section; sticky header down the whole page with scroll-spy and back-to-top; phone (375 px) and tablet (768 px) layouts in browser emulation: no horizontal scroll, header fits, action bar / camera pad / minimap / rail do not overlap, 40 px buttons, canvas `touch-action: pan-y`, compare label column sticky, map before controls; `tsc`, `lint`, `next build`.
- **Verified before the redesign:** sun at several hours, terrain seating, recorded narration playback, Vercel deployment; on a Meta Quest by the client: entering VR, the tour with narration on the live site, the room-stop top view in the headset's 2D browser.
- **Not verified:** on a headset — the head-locked map HUD, floor-ray room highlight, hand-tracking gestures, hover colours, satellite ground in VR, night sky in VR; the actual fullscreen transition (the embedded test browser blocks the Fullscreen API); the amenity props at eye level; photoreal tiles locally (key is referrer-restricted to the live domain); long-session performance on Quest; real phones and tablets (emulated only — one-finger scroll over the stage and the two-finger camera gestures need a real touch screen); VR walking on sloped terrain (the rig assumes flat ground); frame rate of the landscape layer on low-power devices.

## 10. Open items, in suggested order

1. Headset pass on the current build (§9, not verified list); re-enable the wrist panel (`XR_PANEL`) if the client wants it back.
2. Esri World Imagery is on dev/testing terms: license it or switch the default to Sentinel-2 / a licensed provider before a public launch.
3. Add the local referrers to the Google key and check the photoreal seat; tune `SITE_ELLIPSOID_HEIGHT_M` / offset.
4. VR rig on terrain (sample the height function in `XRRig` walk mode).
5. Mobile: a real-device pass (iOS Safari and Android Chrome), then a simplified-3D fallback for low-power devices if frame rates disappoint. Layout and touch gestures are done.
6. Satellite ground outside the site in Community mode (the unit viewer's `RasterGround` could be reused through the fitted frame).
7. First-use guided hints, natural-language home search, enquiry form (needs the business process).
8. Real tower geometry if SOBHA supplies CAD; unit placement inside wings from dimensioned key plans; real outlines / renders for the amenity stand-ins.
9. Routed travel times (needs a routing service and a documented key).

## 11. External services in use

| Service | Use | Terms |
|---|---|---|
| OpenFreeMap tiles | Map basemap and labels | Free, attribution shown |
| Esri World Imagery | Satellite under the map labels and under the Home-mode surroundings | Public tiles, **development / testing use**; license before a public launch |
| AWS Terrain Tiles (Terrarium) | DEM for both scenes and the map hillshade | Open data, attribution shown |
| OpenStreetMap / Overpass | Site polygon, POIs, wing outlines, buildings (fetched once, stored in repo; vector tiles for the surroundings) | ODbL, attribution shown |
| EOX Sentinel-2 cloudless | Optional satellite ground in Home mode | CC BY 4.0 |
| Google Map Tiles API | Photoreal 3D, optional | Paid, attribution shown, key referrer-restricted |
| ElevenLabs | Narration, offline one-time | Paid per character; nothing at runtime |
| Vercel | Hosting | Hobby/team plan as configured |
