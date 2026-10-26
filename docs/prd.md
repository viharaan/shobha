# OneWorld Spatial — PRD and interaction model (rebuild)

_2026-10-21. Derived from `ONEWORLD_PRODUCT_VISION_REBUILD_PROMPT.md` (product source of truth) and a data audit of the collateral in this folder. Companion to `project-understanding.md` (facts), `technical-architecture.md` (current build)._

Promise: **Explore the community. Understand the home. Make an informed shortlist.**

---

## 1. Scope decision: what the rebuild keeps and what it replaces

The brief says: design from the product, not from the old code. The old code has two halves. The data half is reusable fact; the UI half is not.

| Keeps (fact, not structure) | Replaces |
|---|---|
| `plans.generated.ts` — 7 vector plans, mm/pt scale (source-verified), room list with printed mm | All 5 routes and their panels (`/`, `/explore`, `/plans`, `/geo`, `/media`) |
| `project.ts` — unit types, FRC/PLC bands, phases, RERA, amenities, zones, tower footprints (approximate) | Tool-first UI (sliders for section/explode/opacity, calibration tool on the main path) |
| `lib/svgWalls`, `svgFurniture`, `planNav` (wall extrusion, furniture boxes, nav grid, entry spawn) | Ad-hoc per-page state; no shared selection, no URL state, no shortlist |
| `lib/geo.ts` + `SITE_IMAGE` georeference; OSM boundary + 119 POIs | Desktop/VR split where VR has a minimap and desktop has none |
| `Provenance` type + badge vocabulary | Nav labels that describe tech ("Geo-Intelligence", "3D Explorer") rather than tasks |

---

## 2. Data audit — what each promised feature can honestly stand on

Status key: **V** source-verified · **S** source (as printed) · **E** estimated · **I** illustrative · **X** external · **U** unverified/absent.

| Capability in brief | Data it needs | Have | Status | Consequence for the product |
|---|---|---|---|---|
| Tower → BHK → Floor → Flat finder | per-wing unit numbers 1–6, facing, type per unit | Sales sheet labels **10 of 14 wings** (1, 2, 4, 8–14). Wings 3, 5, 6, 7 are unlabelled footprints. All 10 wings transcribed in `app/src/data/sobha/flats/directory.ts` (visual read of 400-dpi crops, imported 2026-10-21 from the sister extraction project) | S (10) / U (4) | Finder covers 10 wings fully. Wings 3, 5, 6, 7: tower selectable, floors selectable, flat step shows "unit mix not published for this wing" + nearest labelled wing. Per-flat placement inside the wing (yaw, offset, mirrored, balcony/door bearing) also exists in `flats/placements.ts` (estimated, key-plan fit). |
| Flat → floor plan | plan per unit type | 7 types drawn (A, C3, F1, J8, K3, L5, M5). 3B Grande variants 1735/1833/1838 not drawn; type labels on sheet like "3B-Grande 1833 SFT" map to F1 with a different area | S | Show F1 plan with "variant plan not published; area as per sales sheet" when SBA differs. |
| Room dimensions | printed mm | Every room on every plan | V | Show printed mm; never show inferred lengths as fact. |
| Furnished 3D | furniture models | None. Furniture boxes come from plan strokes, heights assumed | I | Label "Illustrative, from plan drawing; not part of sale". |
| Wall/ceiling heights, dollhouse | floor-to-floor, clear height | Absent. 3.0 m / 2.9 m assumed | E | Height slider stays, badge "assumed". Dollhouse = cutaway at assumed height. |
| Balcony direction / facing | per-unit facing letter | Sales sheet (E/W/N/S per unit) for 10 wings; plan north arrows exist but brief says don't trust blindly | S | Show facing as a word ("West-facing, as stated by SOBHA") + compass on site view. No line-of-sight claims. |
| Unit position inside wing | typical-floor key plan with dimensions | Only the small key-plan thumbnail per plan page; no dimensions | E | Show unit's *corner/side* in the wing footprint (from key plan + unit number order), labelled "approximate position". No room-level georeference. |
| Tower in community | footprints, positions | OSM wing outlines (way per wing) in a site frame anchored on the OSM site polygon; master plan registered to it at 2.6 m RMS (`sobha/siteFrame.ts`, `masterplanTraced.ts`) | X / E | Fine for "which tower, where". Badge "traced from master plan". |
| Amenity cards + straight-line distance | amenity positions | Legend keys A–AD exist; only 6 hotspots positioned. Rest need placing on the raster | S (names) / E (positions) | Place all 30 keyed amenities on the raster (one-time trace). Distances = straight-line, stated as such. |
| Walking routes / travel time | routing engine, path network | None | U | **Not built.** Brochure minutes shown as "SOBHA marketing claim". |
| Sun direction at date/time | site lat/lon, north | Lat/lon from OSM (X), north bearing estimated 22° (E) | E | Buildable with caveat "direction only, ±5°, no shadow or obstruction modelling". Medium priority. |
| Indicative price | basic rate, FRC band, PLC tier per unit | Rate + FRC: S. PLC tier per unit: absent (colour key on sheet only) | S / U | Price = basic + FRC, with PLC as a user-selectable "if tier is…" row. Label "indicative; excludes GST, parking, deposits; PLC tier unconfirmed". |
| Availability / booking / enquiry integration | live inventory, CRM | None | U | **Not built.** Enquiry = mailto/tel to the published contact with the selected unit in the subject. Shortlist share = URL. |
| Neighbourhood POIs | | 119 OSM features, brochure ladder (no bearings) | X / S | Keep. Rings for brochure distances, points for OSM. |
| Natural-language finder | attribute index | Only config, floor, facing, wing, area | — | Later. Cheap rule-based mapper over those 5 attributes if wanted. |

Conflicts to surface in-product: infographic (53–54 floors, 75k sq ft club) vs PDFs (45–46, 1.2 lakh) → PDFs win, badge `unverified` on the infographic. EOI reel "from ₹2.04 Cr" vs sheet averages → campaign copy.

Questions still open with SOBHA (unchanged from `project-understanding.md`): floor heights, CAD, survey point, per-unit PLC, 3B Grande variant placement, live inventory.

---

## 3. Audiences and launch-essential needs

| Audience | Must do without help |
|---|---|
| Homebuyer / family | Pick a config, see where it is, see the plan and a 3D room, save and compare 2–3 flats, send an enquiry |
| Non-technical visitor | Never need to know "orbit", "bearing", "SBA"; every term has a one-line explanation inline |
| Sales consultant | Jump between shortlisted flats in <2 clicks, present without clutter, share a link that reopens the same view |
| Mobile / VR | One-thumb finder, full-screen scene, bottom sheet; VR = walk one home with minimap, exit always visible |

---

## 4. Information architecture (5 destinations, one selection)

```
/                         Discover    — hero, "Find a home", 3 entry cards
/community                Explore     — masterplan 3D, wings + amenities selectable, layers, simplified mode
/find                     Find a home — Tower → BHK → Floor → Flat (or pick on map), summary card, shortlist
/home/:unit               Explore a home — 2D plan ⇄ 3D (furnished/unfurnished/dollhouse/walk), minimap, presets
/map                      Neighbourhood — basemap, POIs, rings, straight-line measure, attribution
/compare                  Shortlist side-by-side
```

Global: persistent **selected-home chip** in the header (e.g. "Wing 12 · 24-03 · 2 Bed Grande") with Change / Compare / Share. Shortlist drawer available from every route. Header nav uses task words, not tech words.

### URL = state (shareable, no in-memory dependence)

```
/home/12-2403?room=bedroom-1&view=3d&mode=furnished&cam=living
/find?wing=12&bhk=2&floor=24
/community?wing=12&layer=amenities
/compare?units=12-2403,14-1806,1-3106
```

Unit id = `<wing>-<floor><unit>` (sales format, 2-digit floor + unit 1–6). Invalid or unsupported ids open the nearest valid state with a banner, never a blank page.

---

## 5. Core journeys (task flows)

**J1 Find a home.** `/find`: step chips Tower · BHK · Floor · Flat, each editable, each only offering valid next choices (floors 2–45/46 minus refuge 19/29/39; flats filtered by BHK). Picking a flat shows the summary card: config, SBA/carpet (S), floor, facing (S) + "what facing means", indicative price (S, PLC row), confidence row, plan thumbnail, buttons Explore home · Save · Compare · Share · Enquire. Empty state for wings 3/5/6/7 flat step: "Unit mix for this wing is not in the published collateral. Nearest labelled wing: X." Choice persists across routes.

**J2 Where is it.** From the summary card "Show in community" → `/community?wing=12` with the wing lit, floor band highlighted at the chosen floor, unit side marked "approx." Back returns to `/home/:unit` with the same room and camera.

**J3 Understand the layout.** `/home/:unit`: 2D plan left, 3D right (stacks on mobile). Click room in 2D → highlight + camera framing in 3D; click room label in 3D → highlight in 2D. Walk mode spawns at the plan's ENTRY marker; minimap red dot + heading. Toggles: Furniture · Labels · Ceiling · Dimensions · Dollhouse. Reset view / Show whole home always visible.

**J4 Will I like it.** Summary card shows facing word + compass; "Position in wing" diagram (E); sun-direction slider (E, medium priority); nearby amenities with straight-line distance. Each row carries its badge.

**J5 Compare.** Save from card, plan, tower, 3D. `/compare` shows ≤4 units: config, SBA, carpet, floor, facing, indicative price, wing/phase/handover, confidence notes. Click a column → `/home/:unit`. Share = URL; Enquire = mailto with unit list.

---

## 6. Interaction and state model

### Selection state (one store, URL-synced)
```
selectedUnit: { wing, floor, unit, typeCode } | null   // never cleared by camera, reset, or route change
selectedRoom: roomId | null                             // cleared only by Show whole home or unit change
viewContext: 'site' | 'tower' | 'home'
homeView: { layout: '2d'|'3d'|'split', mode: 'furnished'|'unfurnished'|'dollhouse'|'walk', preset?: PresetId }
shortlist: unitId[]                                     // localStorage, explained on first save
```
Rules from the brief, made executable:
- Camera motion never writes `selectedUnit`/`selectedRoom`.
- Click = select; drag = orbit/pan; wheel/pinch = zoom; double-click = focus selected. Nothing else on those gestures.
- Reset view → preset for current `viewContext`, selection untouched.
- Main-scene zoom and minimap zoom are independent stores.
- Top view keeps zoom enabled, zooms toward pointer.
- Walk teleport: only onto free nav cells; preview ring before commit; always a "Back to entry" button.

### Camera presets
Site: Overview · Top view · Selected tower. Home: Whole home · Top view · Entry · Living · Kitchen · Bedroom 1..n · Balcony (generated from room list; missing rooms = no button). All transitions eased, interruptible on first input, `prefers-reduced-motion` → instant.

### Minimap (desktop + VR, same component)
Modes: **Floor plan** (room outlines, labels when ≥ 60 px, entry, balcony, red dot + heading cone, selected-room fill) · **Community** (wing outlines, selected wing lit, no dot — room precision not supported). Controls: Recenter · Reset · Whole floor; independent wheel-zoom and drag-pan. Tap room: focuses main view; in Walk mode teleports with a preview; a "Focus only (no teleport)" toggle in the header. Pinned bottom-right desktop, wrist-anchored VR (already built).

### Resilience
3D fails → 2D plan + "Retry 3D". Basemap fails → unit stays selected, POI list still renders from local GeoJSON. No WebXR → VR button hidden, one line why. Quality tiers: `low` (no shadows, dpr 1, no furniture, no OSM extrusions) auto-picked from `deviceMemory`/`hardwareConcurrency`/first-frames FPS, with a 3-step user override.

---

## 7. Feature priority

**Launch (must):** finder with empty states · summary card with badges · 2D⇄3D room sync · presets · Reset/Whole home · minimap floor mode with red dot · shortlist + compare + share URL · community view with wing highlight and amenity cards · neighbourhood map with POIs/rings · quality tiers + 2D fallback · mobile bottom-sheet layout · enquiry mailto with unit context · first-use tour (4 steps, skippable, replayable).

**Next:** sun-direction (E) · position-in-wing diagram · presentation mode · amenity straight-line distances for all 30 · minimap community mode · rule-based NL finder.

**Later / blocked:** routing & travel time (needs engine) · live availability & PLC (needs feed) · CAD-accurate towers (needs DWG) · VR guided waypoints (needs headset QA) · accounts.

---

## 8. Performance and verification targets (to measure, not promise)

| Signal | Target | How measured |
|---|---|---|
| Time to usable finder | < 1.5 s on mid mobile, before any 3D | Lighthouse + manual on a real device |
| UI feedback | < 100 ms | Interaction to next paint |
| Home view FPS desktop | 50–60 | r3f `Stats` in dev, `requestAnimationFrame` sampler in prod telemetry |
| Mid-range mobile | never freezes; `low` tier auto-selected | Same sampler, tier logged |
| Room focus latency | < 300 ms to start of camera move | timestamp diff |

Definition of done = brief §13, with evidence recorded per journey (desktop, touch, low-end, headset when available). "Not tested on hardware" is written, not implied.

---

## 9. Build order (Step 3 onward)

1. **Data first (done 2026-10-21):** flat directory, flat placements, traced room/wall/opening geometry, OSM wing outlines, registered master plan, 30 amenity positions, solar — imported from the sister extraction project into `app/src/data/sobha/`. Interactive home page built on it.
2. Selection store + URL sync + selected-home chip + shortlist drawer.
3. `/find` with the four-step chips and summary card (no 3D yet). Measure on mobile.
4. `/home/:unit` on the existing plan pipeline: 2D⇄3D sync, presets, minimap floor mode, toggles, walk.
5. `/community` on existing footprints: wing highlight, floor band, amenity cards, simplified mode.
6. `/compare`, `/map` (trim existing geo page), tour, quality tiers, fallbacks.
7. Journey tests on real devices; record results in `implementation-plan.md`.
