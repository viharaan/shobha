# Stage UX revamp (branch `stage-ux-revamp`)

_2026-10-26. Visitors found the single page overwhelming: one long control rail full of toggles on the stage, then five sections. This pass follows the three reference reels the client saved: options in context (byomid.com/office), a cinematic low-chrome first impression (ICG Gallery), and no more black stage while it loads._

## What changed and why

**1. Context instead of one rail.** The stage now knows where the visitor is and shows only what matters there (`components/stage/ContextUI.tsx`):

| Where | Left list ("where can I go") | Card ("what is this") |
|---|---|---|
| Site | Places (Entrance, One Club, World Stadium, Continental Grounds) + the 14 towers | Project in one line · Find a home · Location |
| A place | same list, place highlighted | Description, source badge, **Next place ›** |
| A tower | Its floors, top down, refuge floors marked | Phase, handover, height, footprint, RERA · Step inside · Homes in this wing |
| A floor | same list, floor highlighted | Typical floor, sample plan + indicative price (PLC tier) · Step inside · Isolate floor |
| A home | Its rooms in walking order with printed sizes | Type, which flat, floor slider, balcony / door facing · Shortlist · Walk inside |
| A room | same list, room highlighted | Size as printed + the plan sheet's note · ‹ / Next room › / Whole home |

A breadcrumb (`SOBHA OneWorld › Wing 8 › Floor 23 › Flat 5 › Living`) sits above the list; every level is clickable, including the jump from a room back to the tower in the site model. On wide screens it is one column on the left (list on top, card at the bottom). Below 1024 px the list becomes a chip strip under the top bar and the card sits above the action bar, with facts behind **Details**.

**2. Glide, don't jump.** Picking a place (list or label) flies the camera to the guided tour's own pose for it (`placeStop` in `lib/tour.ts`). Towers and rooms already glided. Rooms picked from the list frame top-down like the room tour.

**3. Low-chrome first impression.** On first load the stage shows only the title, one line and three choices: **Take the guided tour**, **Explore freely**, **Find a home**. The site slowly orbits behind them (`autoRotate` on `SiteScene`), with labels, panels and the camera pad hidden, and a quiet "Homes · location · community ↓" cue. Any touch on the stage dismisses it, as before.

**4. No black stage.** The server-rendered first paint is now a poster frame (developer's elevation render, slow drift), not a black spinner. Each mode then shows `StageLoader`: the poster, the steps still pending (towers / terrain, or walls / the view from this floor), texture and model counts from three's loading manager, and after 15 s a **Show it now** button. The poster fades out on the first rendered frame. Home mode uses the plaza render.

**5. Everything else behind "View".** Camera mode, labels, landscape, section cut, exploded floors, photoreal, site-plan opacity, sun and time, the model status notes (Community); layout, realistic / labels / plan on floor / furniture, surroundings and ground imagery, sun, scale / measure / calibrate (Home). The panel is closed by default at every width. The compass and full screen are icon buttons. The action bar keeps Guided tour (Home: Room tour), Enter VR and Present.

**6. One place to navigate.** Finding a home and the location analytics moved into the stage; the page below it keeps only the shortlist (Compare, one line when empty) and the Community background (realms, phases, connectivity, the badge legend folded into `<details>`).

- **Configure your home** (`find=1`, `components/stage/Finder.tsx`) replaces the five-step form and the Configurations grid. A side panel (bottom sheet on phones) asks one question at a time: bedrooms → finish → facing → tower → flat, as big tiles that say how many printed homes each answer leaves and from what average price; "No preference" skips a question. Every answer moves the model: towers without a match are ghosted and the camera glides to frame the ones that remain (`frameWings` on `SiteScene`); picking a tower flies to it. Answers stay above as chips you can tap to change (later answers reset). The last step gives the price (PLC tier selectable), floor slider (the floor lights up on the tower), facing, balcony, handover, then Step inside, Shortlist, Copy link. Same URL keys as before (`beds`, `finish`, `facing`, legacy `config`, `wing`, `flat`, `floor`), so a shared link opens at the right step.
- **Location** is a third stage mode (`mode=map`, `components/stage/LocationStage.tsx`): the satellite map fills the stage; the left list holds topics (Overview, Schools & colleges, Healthcare, Malls, Metro rail & toll, Projects nearby, Brochure distances, Upcoming roads) with counts within 7 km; each topic filters the pins and its card gives counts within 3 / 5 / 7 km and the nearest places. Layers, categories and the site-plan overlay sit in View options; Fly to site, Measure and back-to-3D are the action bar. A tower clicked on the map opens it in the model.
- The header reads Explore · Find a home · Location · Community · Media · Shortlist; the first three open the stage in that mode. Old `/homes` and `/geo` links redirect into the stage.

**7. Tour pause.** Pause used to stop only the auto-advance, so the narration kept talking. Now it also pauses the recorded clip (or cancels browser speech). Play resumes the clip where it stopped, or restarts the line. Space does the same.

## The dock (latest pass)

After two more reference reels (the ICG Gallery walk-through and an Unreal interactive-map demo with one bottom tab strip), every control moved into **one dock at the bottom centre** (its popups open above it; the Home plan minimap sits bottom left) (`components/stage/Dock.tsx`):

- **Collapsed** it is a stepper, `‹ One Club 2 / 4 ›`: the arrows step through the places at this level (places, towers, rooms, map topics). Tap the middle to open the tabs.
- **Tabs by mode.** Community: Places · Floors (at a tower) · Find a home · Guided tour · Time of day · View · Enter VR. Home: Rooms · This home · Room tour · Walk · View · Enter VR. Enter VR appears only when the browser reports an immersive-VR device (Quest, Pico, PC-VR, visionOS), so laptops and phones never see a dead button. Location: Topics · Layers · Measure · Fly to site · 3D site.
- **Broader choices open as a popup above the dock** (configure your home, this home's type / flat / floor, view options, map layers); direct actions (tour, walk, VR, measure) just run. Esc closes the popup first.
- **Keyboard:** ← → siblings, ↑ ↓ floors, Enter steps in, Esc steps back (off during tours, walk mode and VR). A one-line legend shows once and fades.
- **On screen otherwise:** the mode switch, compass and full screen; a small card with a trail over it once a place is picked (none on the site overview); the plan minimap in Home. The left column, the separate View button, the bottom action bar and the camera pad are gone (the pad is an opt-in in View; Present mode moved there too).

**Look: liquid glass.** The dock, popups, cards, trail, mode switch, compass and full-screen button share an iOS-style glass surface (`.glass` for chrome, `.glass-strong` where text must read; tokens `--glass-*` in `globals.css`): a tinted, heavily blurred and saturated backdrop, a light edge with a top highlight and a soft shadow. Secondary text on glass is lifted and carries a faint shadow so it stays legible over the light ground of the model.

**Card on demand.** The place card no longer sits on screen. A round gold ▶ at the bottom left goes to the next view (same as → and the dock's ›); hovering it (or keyboard focus) opens the card above it with "Next: …", and touch screens get a small ⓘ beside it. The small trail stays top left as the way back up. Picking a place, tower, floor, room or map topic in a dock popup closes the popup so the camera move is visible. Buttons are pills, tower numbers circles.

**No source badges on cards and popups** (by request): they show the details only. The provenance stays in the accessible text of each card, in View → About this model, and in the badge legend of the Community section.

**One page.** The Community section below the stage is gone; its content moved to where it is used: the six **realms** are a Community dock tab: picking one hides the towers above their podiums (see-through glass still blocked the gardens), labels each of its places on the ground, and fits the camera to those places from about 64° above; card and ‹ › stepping as for places; **phases and handover** (with the RERA and floor-count notes) open under the tower choice in Configure your home; **connectivity** is the second Location topic. The badge legend moved to View → How to read the data. The header reads Explore · Find a home · Location · Media · Shortlist; below the stage only the shortlist (Compare) remains.

**The stage is the page.** No header: the stage fills the screen, with a small SOBHA OneWorld wordmark top centre on wide screens. **Media** is a fourth mode (Community · Home · Location · Media): it opens on a gallery of all 41 items (7 videos, 4 plans and creatives, 30 brochure pages); picking one fills the stage with it, the dock steps through them, and All media (or Esc) returns to the gallery; `/media` forwards there. **Compare and the shortlist are removed** (the ☆ buttons, the overlay, the header chip); Present mode keeps a glass bar with what is on screen and Exit; old `/compare` links land on the stage.

**Prices without the PLC picker.** The sheet does not publish which preferred-location (PLC) tier a flat carries, and the base tier is literally named "Select", which read like an empty dropdown. Prices now show as a range, from the base tier to the highest tier the flat's size allows (Prime+, Elite+ and Grande+ are 4 BHK only), e.g. "₹2.15 Cr – 2.22 Cr", with one plain line saying why.

## Inside a home: eye level and sunlight

- **Eye-level 360° room view** (default). Picking a room (list, ← →, minimap, room tour) now stands you in it at 1.6 m, at the same free spot walk mode and VR use, facing along the room; drag turns the view in place like a 360° photo (no pan or zoom). Ceiling and the floors above are on, so light comes in only through the openings; room labels and the red tour pin are off. The room card has an Eye level / Top switch; Top is the previous look-down framing.
- **Sunlight** (Home dock tab for placed flats; Community's "Time of day" became the same panel): time presets (sunrise, morning, noon, afternoon, sunset), 21 Jun / 22 Sep / 21 Dec, a slider, "Play the day" (sunrise → sunset in about 25 s), and a readout: sun altitude and direction, and whether direct sun is on the balcony side (from the flat's balcony bearing). The sun is the existing NOAA-computed one at the site, with shadows from the neighbouring towers.
- **Fix:** the sky dome of the surroundings was a 4.4 km sphere outside the home camera's 500 m far plane, so from eye level (and in walk mode) the sky rendered black. It now rides with the camera at 400 m (direction-only shader, drawn first without depth).

## VR minimap

The controller's own ray and cursor were drawn before the map HUD (render order 1–2 against the HUD's 200, no depth test), so the map painted over the cursor; they now draw after it (299 / 300, cursor more opaque). Within the map, uikit draws plain boxes before images, so the map image covered everything laid on it (player marker, room outlines, tower markers, the aim ring); those now take zIndex 1 (checked on desktop: markers and player marker now show). Pointing the controller ray anywhere on the head-locked minimap also shows a white ring (tracked on the map container itself; an earlier separate aim layer tied with the room outlines for the ray and flickered) where it meets the map (rooms and tower markers keep their own highlight); the trigger there moves you to that spot (site: not into a tower; home: the nearest free floor cell, as a floor teleport does). Not yet tried on a headset.

## Kept as it was

URL keys and shareable links (plus `find=1` and `mode=map`), both tours and the hand-off, VR (one canvas / one XR tree per mode), provenance badges (every card carries one), finder logic, every map layer and the measure tool, present mode, the plan minimap (now bottom-right on desktop, next to the camera pad; top-left on phones), touch rules (`touch-action: pan-y`), legacy redirects.

## Verified

In the desktop app's browser at 1440, 768 and 375 px: intro → explore; place glide + card; tower → floor list → floor card with price; Step inside → home card, rooms list, room glide + card; View options on both modes; guided tour hides the context chrome; pause / play on recorded narration (clip paused at 1.5 s, resumed from 1.5 s); poster on first paint and during scene load; no horizontal scroll at 375 / 768; no console errors. Finder: filters ghost / restore towers at runtime both ways, tower → flat list → summary. Location: topics, counts and nearest lists, map controls clear of the chrome, phone layout. `npx tsc --noEmit && npm run lint && npm run build` green (lint: the 6 pre-existing warnings).

Not verified: real phones and headsets; the browser-speech fallback for pause (recorded clips exist for every stop, so it did not run); a true cold 20–45 s load on the live site (locally the scene came up in ~3–12 s, so the poster was seen but only briefly).

## Notes for whoever merges

- `HomeStage.tsx` was largely rewritten. The other session's uncommitted 2-line change in the main checkout (`SceneExport` import and the `<SceneExport />` line inside the home `<Canvas>`) will conflict textually. Re-add both lines inside the `<Canvas>` in the new file; nothing else depends on them.
- The burned-in captions on the render stills are kept off screen by zooming the poster toward its top-left (`.stage-poster` in `globals.css`). Swap in a clean still or a frame of our own scene when one exists.
