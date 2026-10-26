# SOBHA OneWorld / One Residences — project understanding

Compiled 2026-10-18 from the sales collateral in this folder. No code exists yet; this folder is source material for the planned VR / 3D web app.

## What the project is

- **Developer:** SOBHA Limited. **Project:** SOBHA OneWorld, Greater Whitefield, Old Madras Road (NH-75), Bengaluru 562114. Residential component branded **One Residences**.
- **Scale:** 48 acres 15.32 guntas net site, 3,484 units, 14 wings (towers), ~80% open space. Township also has One Club (1,20,000 sq ft, 2.4 acres, "CA site"), One Emporium retail (65,000 sq ft, low-rise on 30 m boulevard), World Stadium (90 m dia cricket/football ground, 350 m running loop), two "Future Development" parcels.
- **Towers:** Wings 1,2,9–14 = 3 basements + ground parking + first-floor parking + 46 typical floors. Wings 3–8 = same + 45 floors. Refuge units on floors 19, 29, 39.
- **Timeline:** RERA approved 8 May 2026, launch June 2026. Phase 1 (W1,2) Jul 2032; Ph 6 (W12–14) Aug 2032; Ph 2 (W3,4) Nov 2032; Ph 5 (W9–11) Feb 2033; Ph 3 (W5,6) and Ph 4 (W7,8) Sep 2033. Six RERA numbers, one per phase (PRM/KA/RERA/1250/304/PR/080526/008634–008639).

## Unit mix (SBA = super built-up, CA = carpet)

| Type code | Config | SBA sq ft | Carpet sq ft | Avg price | Sample wing |
|---|---|---|---|---|---|
| A | 4 Bed Grande | 2,415.77 | 1,488.02 | 3.86 Cr | W1 |
| C3 | 4 Bed Luxe | 2,096.27 | 1,275.75 | 3.33 Cr | W8 |
| F1 | 3 Bed Grande | 1,820.38 (range 1,735–1,838) | 1,102.02 | 2.81 Cr | W2 |
| J8 | 3 Bed Luxe | 1,510.70 | 960.04 | 2.34 Cr | W9 |
| K3 | 2 Bed Grande | 1,204.92 | 743.04 | 1.85 Cr | W13 |
| L5 | 2 Bed Luxe | 1,063.23 | 648.32 | 1.63 Cr | W10 |
| M5 | 1 Bed Residence | 734.05 | 432.28 | 1.12 Cr | W14 |

Carpet/SBA ratio ≈ 0.59–0.64. Floor plans give every room in mm (e.g. Living & Dining 7400 × 3700, Bedroom 1 3500 × 4100) so a true 1:1 scale model is derivable without guessing.

## Pricing rules (for a configurator)

- Basic rate: pre-launch ₹13,555/sq ft, launch ₹13,999/sq ft.
- **Floor Rise Charge (FRC), ₹/sq ft:** 2–4F 0; 5–9F 60; 10–14F 120; 15–19F 180; 20–24F 250; 25–29F 320; 30–34F 400; 35–39F 480; 40–47F 570.
- **Preferred Location Charge (PLC), ₹/sq ft:** Select 0; Prime 222; Prime+ 444 (4 BHK); Elite 444; Elite+ 666 (4 BHK); Grande+ 888 (4 BHK).
- Price ≈ SBA × (basic + FRC + PLC). The PLC tier per unit is not in the collateral; it is on the sales sheet's colour key only.

## Unit numbering and facing

Each tower has **6 units per typical floor**, numbered 1–6 clockwise around a central core, each tagged with its facing: `1E 2W 3W 4W 5N 6N` etc. Unit number format in sales = `<wing>-<floor><unit>`. A dashed line on the plan marks the split between two half-wings sharing a podium (e.g. W1/W2, W13/W14). Towers are cruciform / stepped footprints oriented toward the central yard and the 90 m ground. Each floor-plan page has a key plan showing the unit's position in the footprint and a north arrow, so orientation per unit type is recoverable.

## Landscape zones (amenities, keyed A–AD on master plan)

1. Temperate Enclave (A–G): OneWorld Plaza (globe sculpture), Festival Lawn, Activity Deck, Wellness Gardens, Observation Deck, Leisure Pool, Kids' Pool.
2. Mediterranean Serenity (H–L): Oasis Trail, Dry Stream, Tuscan Gardens, Exhibition Square, Amphitheatre.
3. Tropical Zen (M–U): Tranquillity Falls, Lagoon Cove, Reflexology Walk, Rainforest Field, Yoga Lawn, Zen Courtyard, Play Park, Skating Rink, Tropicana Gardens.
4. World Stadium (V–X): 750 m jog/cycle track, cricket/football ground, 350 m running track. Also 1,070 m trail.
5. Continental Grounds (Y–AD): 3 pickleball, 2 tennis, multi-sport court, fitness lawn, pet park, play lawn.
6. One Club.
Access (1–11): entrance gateway, common exit, roundabout, exit gateway, club drop-off, tower drop-off / school-bus bay, Emporium entrance and parking, OWC, DG power house, STP.

## Geo / location facts (for the geospatial layer)

- Site fronts Old Madras Road / NH-75 (60 m wide), near Hoskote toll gate; a proposed CDP road on the east; a water body on the east/southeast edge.
- Upcoming infra: Bengaluru Business Corridor / Peripheral Ring Road (8 min west, 116 km); Satellite Town Ring Road (10 min east, 12 towns); Bengaluru–Chennai Expressway (10 min, early 2027); Purple Line extension KR Puram → Hoskote (16 km) with a proposed station near Hoskote toll gate.
- Distance ladder from brochure: VIBGYOR 2 km, Orion Uptown Mall 2 km, EuroKids 3 km, Bearys 3 km, Decathlon OMR 4 km, Motherhood 4 km, Brigade Signature Towers 4 km, Chrysalis 5 km, MVJ Hospital 6 km, Oracle Public School 7 km, East Point Hospital 8 km, GR Tech Park 10 km, ITPL 11 km, Vydehi/Manipal/Aster 13 km, Phoenix Marketcity 14 km, RMZ/Bagmane/EPIP 15 km, KIADB Aerospace Park 20 km. Marketing claims: 10 min to Whitefield, 25 min to airport.

## Asset inventory in this folder

| File | What | Usable for |
|---|---|---|
| `SOBHA_ONEWORLD_Floor plans.pdf` (9 pp, A4) | **Vector** PDF, 7 unit types with every room dimension in mm, key plan, north arrow | Direct source for 1:1 floor geometry. Extract paths with pdf-to-SVG, scale from dimension labels |
| `SOBHA_OneWorld_Masterplan.pdf` (3 pp) | Master plan; site plan is a 2682×2123 JPEG raster, legend and tables are text | Site layout, tower footprints, amenity positions. Needs georeferencing |
| `SOBHA One Residences ... PLC & FRC_Updated on 08.08.26.pdf` (1 p) | Sales sheet: phases, pricing, FRC/PLC, site plan with per-tower unit numbers, facings and type labels | Unit database seed, pricing engine, facing per unit |
| `SOBHA OneWorld_Mobile Brochure.pdf` (30 pp) | Marketing: location map, distances, infra, zone renders, interior renders | Copy, renders, POI list |
| 2 JPEGs | "Why buy" infographic (claims 53–54 floors, 75k sq ft club; contradicts official 45/46 floors and 1.2 lakh sq ft); "Six Realms" zone 2 creative | Marketing only; trust the PDFs over the infographic |
| 8 MP4s (one duplicate: `11.55.20` and `11.55.20 (1)` are identical) | Short renders: OneWorld Plaza flythrough, EOI reel ("3,4 BHK from ₹2.04 Cr"), NH-75 drone footage near Hoskote toll, brand teasers | Reference footage, textures for mood; not geometry |

## Gaps that matter for the 3D / VR app

- No CAD, BIM, IFC, DWG, Revit, or GLB. All geometry must be reconstructed from the vector floor plans and the raster site plan.
- No floor-to-floor height, slab thickness, door/window heights, or ceiling height anywhere. Need from SOBHA (typical Sobha high-rise ≈ 3.0 m floor to floor; confirm).
- No site coordinates or survey. Site plan has a north arrow but no scale bar; scale must be derived from the 90 m ground diameter or the 60 m road width.
- No per-unit PLC tier list, no availability/inventory feed, no tower elevation drawings.
- Only 7 of the unit types are drawn (one per wing sample); mirrored and variant types (e.g. 3B Grande 1,735 / 1,833 / 1,838) are not drawn.

## Asset relationships (how the app uses each source)

| Entity in app | Fed by |
|---|---|
| Unit types, prices, FRC/PLC, phases, RERA | Sales sheet PDF + master plan tables → `src/data/project.ts` |
| 1:1 floor plans (7) | Floor-plan PDF pages 2–8 → SVG + `plans.generated.ts` (scale, rooms) |
| Site model ground + tower positions | Master plan embedded JPEG → `manifest.ts: SITE_IMAGE`, `project.ts: TOWERS[].imagePx` |
| Site boundary, toll, POIs | OpenStreetMap (Overpass, 2026-10-18) → `public/data/*.geojson` |
| Amenities, zones, infra, distance ladder | Brochure + master plan legend → `project.ts` |
| Media gallery | Videos, images, brochure pages → `manifest.ts: MEDIA` |

## Unresolved questions for SOBHA

1. Floor-to-floor height, podium level heights, clear ceiling height (model assumes 3.0 m / 8.0 m / 2.9 m).
2. CAD/BIM (DWG/IFC) of towers and site, or at minimum typical-floor key plans with dimensions and the unit position per wing.
3. A surveyed coordinate for any site feature (gate, ground centre) and the true north of the master plan drawing.
4. Per-unit PLC tier list and live inventory/availability.
5. Which of the 3B Grande variants (1,735 / 1,833 / 1,838 sq ft) sit in which wings; only 1,820 (Type F1) is drawn.
6. Official alignments for the proposed metro extension, PRR and STRR.
