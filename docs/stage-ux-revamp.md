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

- **Find a home** (`find=1`, `components/stage/Finder.tsx`) replaces the five-step form and the Configurations grid. Bedroom / finish / facing chips show how many printed flat positions each leaves; towers with no match are ghosted in the 3-D model and every wing label carries its count, so filtering lights up where the homes are. Pick a tower (the camera glides there) to list its flats; pick a flat for the summary: floor slider, price with PLC tier, phase, Shortlist, Step inside, Copy link. With no tower chosen the card lists the seven plans (size, average price) and steps into any of them. Same URL keys as before (`beds`, `finish`, `facing`, legacy `config`, `wing`, `flat`, `floor`).
- **Location** is a third stage mode (`mode=map`, `components/stage/LocationStage.tsx`): the satellite map fills the stage; the left list holds topics (Overview, Schools & colleges, Healthcare, Malls, Metro rail & toll, Projects nearby, Brochure distances, Upcoming roads) with counts within 7 km; each topic filters the pins and its card gives counts within 3 / 5 / 7 km and the nearest places. Layers, categories and the site-plan overlay sit in View options; Fly to site, Measure and back-to-3D are the action bar. A tower clicked on the map opens it in the model.
- The header reads Explore · Find a home · Location · Community · Media · Shortlist; the first three open the stage in that mode. Old `/homes` and `/geo` links redirect into the stage.

**7. Tour pause.** Pause used to stop only the auto-advance, so the narration kept talking. Now it also pauses the recorded clip (or cancels browser speech). Play resumes the clip where it stopped, or restarts the line. Space does the same.

## Kept as it was

URL keys and shareable links (plus `find=1` and `mode=map`), both tours and the hand-off, VR (one canvas / one XR tree per mode), provenance badges (every card carries one), finder logic, shortlist and compare, every map layer and the measure tool, present mode, the plan minimap (now bottom-right on desktop, next to the camera pad; top-left on phones), touch rules (`touch-action: pan-y`), legacy redirects.

## Verified

In the desktop app's browser at 1440, 768 and 375 px: intro → explore; place glide + card; tower → floor list → floor card with price; Step inside → home card, rooms list, room glide + card; View options on both modes; guided tour hides the context chrome; pause / play on recorded narration (clip paused at 1.5 s, resumed from 1.5 s); poster on first paint and during scene load; no horizontal scroll at 375 / 768; no console errors. Finder: filters ghost / restore towers at runtime both ways, tower → flat list → summary. Location: topics, counts and nearest lists, map controls clear of the chrome, phone layout. `npx tsc --noEmit && npm run lint && npm run build` green (lint: the 6 pre-existing warnings).

Not verified: real phones and headsets; the browser-speech fallback for pause (recorded clips exist for every stop, so it did not run); a true cold 20–45 s load on the live site (locally the scene came up in ~3–12 s, so the poster was seen but only briefly).

## Notes for whoever merges

- `HomeStage.tsx` was largely rewritten. The other session's uncommitted 2-line change in the main checkout (`SceneExport` import and the `<SceneExport />` line inside the home `<Canvas>`) will conflict textually. Re-add both lines inside the `<Canvas>` in the new file; nothing else depends on them.
- The burned-in captions on the render stills are kept off screen by zooming the poster toward its top-left (`.stage-poster` in `globals.css`). Swap in a clean still or a frame of our own scene when one exists.
