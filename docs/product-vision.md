# OneWorld Spatial — Product Vision and Rebuild Prompt

## Your role

Act as a senior product designer, UX researcher, 3D interaction designer, performance engineer, and real-estate product strategist. Help design and build a **new version of OneWorld Spatial from a product brief**, rather than relying on existing source-code structure or implementation details.

Treat this document as the product and experience source of truth. Do not require repository paths, existing component names, internal code structure, or the old application's architecture to understand the product. You may choose an appropriate technical implementation later, but first deliver an excellent, understandable, fast, and trustworthy user experience.

Your objective is to make exploring SOBHA OneWorld feel as intuitive as using a modern map app, as immersive as a high-quality 3D property tour, and as useful as a knowledgeable sales consultant—without overwhelming users or misrepresenting uncertain information.

---

## 1. Product overview

**Product:** OneWorld Spatial — an interactive property-discovery and spatial-intelligence experience for SOBHA OneWorld, on the Greater Whitefield / Hoskote side of Bengaluru.

**Development context:** The development is described in source materials as approximately 48 acres, 14 wings, and around 3,484 residential units. These are project-level figures, not values to repeat as guaranteed facts without checking the relevant authoritative source.

**The experience should let people:**

- Understand the site layout and how the towers, homes, amenities, roads, open spaces, and nearby neighbourhood relate to one another.
- Find a home through an intuitive Tower → Home type → Floor → Flat journey, or by selecting a unit directly on the site map.
- Inspect a unit's floor plan, room arrangement, balcony direction, approximate placement within its wing, and furnished 3D representation.
- Move seamlessly between the development masterplan, a selected tower, a floor, a specific home, and the home's room-level view.
- Understand the context of a home: nearby wings, amenities, likely outlook, orientation, and distance to points of interest.
- Compare homes, save favourites, share a specific view, and take a confident next step toward an enquiry or visit.

### Primary audiences

1. **Homebuyers and families:** Need clarity, confidence, easy navigation, comparisons, and an intuitive explanation of what a home may feel like.
2. **Non-technical visitors:** May not understand floor-plan conventions, 3D controls, bearings, levels, or property-area terminology. The interface must teach by showing, not by requiring prior knowledge.
3. **Sales consultants and property advisors:** Need to answer questions quickly, switch between homes, show site context, and share consistent information with customers.
4. **Mobile and VR users:** Need touch-friendly controls, reliable orientation, clear feedback, and stable performance on constrained hardware.

### Product promise

**“Explore the community. Understand the home. Make an informed shortlist.”**

Do not turn the application into a complicated 3D demo. The property's information and the user's decision should remain the focus; 3D is a tool that makes the information easier to understand.

---

## 2. Product principles

### 2.1 Clarity before spectacle

The application should be visually impressive, but every animation, label, panel, and 3D effect must help users understand the site or a home. Avoid decorative complexity that makes selection, reading, or navigation slower.

### 2.2 One continuous spatial experience

The map, masterplan, tower, floor, flat, floor plan, room view, and minimap must feel connected. A selected home remains selected as users change views. The interface should preserve the user's place, selection, orientation, and useful context unless the user explicitly changes them.

### 2.3 Fast by default

Load the useful interface and core property information before optional high-detail 3D assets. Do not make visitors wait for the whole world, every tower, all furniture, or all map layers before they can begin exploring.

### 2.4 Trustworthy over falsely precise

Every important property claim must be supported by an identifiable source or clearly marked as estimated, illustrative, external, or unverified. Never invent a missing flat, price, dimension, view, tower detail, amenity, or travel time to make the experience look complete.

### 2.5 Progressive disclosure

Show a simple starting experience, then reveal advanced options when needed. New visitors should be able to find a home without understanding layers, coordinates, camera terminology, or 3D navigation modes.

### 2.6 Predictable controls

A control should do what its label or visual appearance suggests. Camera motion should not unexpectedly change the selected home. Zoom, pan, rotate, selection, and teleport must be independent and clearly communicated.

### 2.7 Respect the user's device

The application should work well on desktop, mobile, tablet, and compatible VR headsets. Adapt rendering quality and interaction patterns to the device rather than forcing one visual configuration on every user.

---

## 3. Recommended information architecture

Use a small number of clear destinations, with consistent navigation and selection state throughout:

### A. Discover

A welcoming overview with an interactive site preview, a prominent **Find a Home** action, and clear entry points into the community explorer, home comparison, and neighbourhood map. Keep explanatory copy short and avoid an overly long landing page.

### B. Explore the Community

An interactive 3D masterplan where users can select wings, inspect amenities, switch to a simplified site overview, and understand distances and relationships between locations.

### C. Find a Home

A guided home-finder with filters, a tower/floor/flat selector, available unit information, floor plans, 3D inspection, price estimates where supported, and shortlist actions.

### D. Explore a Home

A focused home-viewing experience with 2D floor plan, furnished/unfurnished 3D modes, Dollhouse view, Walk mode, minimap, measurements, room selection, orientation, and tower/community context.

### E. Neighbourhood Map

A map for nearby points of interest, roads, geographic context, distances, and relevant external data with visible attribution. Distinguish map distance from route distance and do not invent journey times.

Keep these destinations connected through shared selection and deep links. A user should be able to share a selected home or room and reopen the same meaningful view.

---

## 4. Core journeys to make effortless

### Journey 1: “Help me find a home”

1. User chooses a home configuration or starts with a visual tower map.
2. The application guides them through available choices without presenting impossible combinations.
3. Available flats show useful comparison information at a glance.
4. Selecting a flat opens a clear summary and lets the user inspect its 2D and 3D views.
5. The user can save it, compare it, share it, or enquire.

**Usability rule:** Show selection progress and make previous steps easy to change. Do not reset a user's valid choices unnecessarily.

### Journey 2: “Where is this home in the community?”

1. User selects a flat.
2. The site view highlights its tower and the tower's location within the development.
3. The user can inspect floors, nearby wings, amenities, access roads, and open areas.
4. Returning to the unit view preserves the chosen flat and selected floor.

### Journey 3: “Let me understand the layout”

1. User opens a clear 2D plan with legible room names and dimensions where sourced.
2. Clicking a room highlights that room on the plan and focuses the corresponding area in 3D.
3. The user can enter Walk mode at a sensible position, inspect the room, and return to the overview without losing their place.
4. The user can switch furniture, labels, ceiling, measurements, and cutaway views without disrupting navigation.

### Journey 4: “Will I like this home and its surroundings?”

1. User checks balcony direction and the approximate position of the flat in its wing.
2. User views the home from a community/site context and understands which nearby buildings or amenities are represented.
3. Where the data supports it, user explores sun direction/time, nearby amenities, and view direction.
4. The interface explains which parts are measured, estimated, illustrative, or external.

### Journey 5: “Help me decide between two or more flats”

1. User adds homes to a shortlist from any relevant screen.
2. A comparison view presents key factors side-by-side.
3. Selecting a home in the comparison opens the exact flat, floor, and view.
4. The list can be shared or used to begin an enquiry.

---

## 5. High-value features

Prioritise features that reduce confusion and help a user make a decision. Avoid adding features solely because they are technically impressive.

### 5.1 A much better home-finder

- Use a clear, guided selection flow: **Tower → Configuration / BHK → Floor → Flat**.
- Also let users select a tower or flat visually from the masterplan; neither route should be mandatory.
- Filter only on attributes that are actually available and meaningful, such as configuration, floor, area, facing/orientation, price range, and availability status.
- Use clear empty states when a selected combination has no supported data. Suggest a nearby valid choice rather than silently changing the selection.
- Show a compact home summary with configuration, sourced area values, floor, facing label with an explanation of what it means, indicative price if supported, and data-confidence indicators.
- Use readable chips or simple visual summaries rather than a dense technical table.
- Maintain a persistent selected-home label so the user always knows which flat they are viewing.

### 5.2 Synchronized 2D plan and 3D home viewer

Treat 2D and 3D as coordinated views of the same home rather than separate features.

- Clicking a room in the 2D floor plan highlights it and moves the 3D camera to a useful view of that room.
- Clicking a room label, hotspot, or room object in 3D highlights the same room in the 2D plan.
- Selected-room state remains consistent across view-mode changes.
- Provide an obvious **Reset view** action and a **Show whole home** action.
- Let users switch between furnished, unfurnished, Dollhouse/cutaway, and Walk modes without losing their selected home or room.
- Show room dimensions only when supported by source data; distinguish printed measurements from any inferred geometry.
- Make the entry, balcony, kitchen, bathrooms, and bedrooms easy to locate through labelled shortcuts where appropriate.
- Avoid forcing users to learn keyboard controls before they can inspect the home. Offer visible on-screen controls and a short optional “How to navigate” guide.

### 5.3 A genuinely useful minimap

The minimap should provide orientation and navigation, not just decoration.

- Include a **floor-plan minimap** showing room outlines, room labels when legible, entry point, balcony, user position, and current heading.
- Show the user's current position as a clear **red dot** with a heading cone/arrow. Update it smoothly as the user walks, turns, or teleports.
- Clicking a walkable room focuses the main view on that room; in Walk mode, it may teleport only if the destination is reachable and the teleport is clearly indicated.
- Use a visible selected-room highlight and keep it synchronized with the main view.
- Provide independent minimap zoom and pan so users can zoom into a room without moving the main camera.
- Provide **Recenter**, **Reset minimap**, and **Show whole floor** controls.
- Make the map's scale, orientation, and mode obvious. A header or toggle should allow switching between the floor plan and a site/community map when useful.
- In community/site mode, indicate which wing contains the selected home and show the user's relevant context without suggesting room-level precision the map cannot support.
- Keep the minimap pinned in a predictable place and avoid covering important controls or room labels.
- In VR, attach the minimap to a comfortable controller-relative or head-follow position, with clear tap targets and a way to switch between floor and site context.
- Provide non-teleporting selection as a safe alternative; tapping a room should not unexpectedly move the user if the control's intent is unclear.

### 5.4 Intuitive camera and navigation controls

- Use familiar controls and provide short, context-specific hints on first use.
- Support orbit, pan, and zoom with clearly separated actions; clicking a room or tower must not accidentally rotate the world.
- In top-down mode, support smooth zooming all the way to room-level detail. Zoom should centre near the pointer/touch target when practical.
- Provide camera presets such as **Overview**, **Top View**, **Entry**, **Living Area**, **Bedroom**, **Kitchen**, **Balcony**, and **Whole Tower** where applicable.
- Smooth camera transitions, but allow users to interrupt them immediately.
- Add sensible camera bounds and collision/clearance checks so users cannot easily get lost inside walls, beneath the floor, or outside the useful area.
- A double-click or clearly labelled focus action may centre the selected room/object. Avoid assigning too many different behaviours to a single gesture.
- Keep north/orientation cues clear in site views. Do not rely on incorrect or unverified plan arrows for unit orientation.
- Always provide a one-action recovery path: **Reset camera** or **Return to selected home**.

### 5.5 Community and masterplan exploration

- Make wings selectable and visibly highlight the active wing.
- Support sensible layers: buildings/wings, roads and paths, open spaces, water features, amenities, and trees/landscaping where sourced or appropriately labelled.
- Add a clean simplified view for slower devices and first-time visitors.
- Provide a focused information card when an amenity or wing is selected; avoid intrusive pop-ups.
- Allow a transition from a selected flat to its position in the wing and from there to the full community.
- Show walking or straight-line distances only when calculated appropriately, with the distance type stated. Display routing/travel times only if backed by a real routing method and relevant data.
- Do not obscure the selected building with excessive labels. Show nearby labels based on zoom and selection priority.

### 5.6 Orientation, outlook, and environmental context

Where the underlying data is adequate, let people explore:

- Approximate balcony/view direction, with a clear distinction between direction and a verified line of sight.
- Nearby towers and their approximate placement relative to the selected home.
- Sun direction at a selected date and time, with timezone clearly identified and a plain-language explanation.
- Nearby amenities, access points, roads, open spaces, and the distance to them.
- A view-direction cone as an orientation aid, never as proof that a particular view is unobstructed.

Do not simulate acoustic levels, privacy, shadows, sunlight penetration, or actual views as fact unless reliable data and a validated method support the claim. Offer “illustrative” scenarios where modelling is only indicative.

### 5.7 Furnishing and spatial understanding

- Provide simple Furnished / Unfurnished controls.
- Make it explicit that furniture, decor, finishes, and any unverified architectural detail may be illustrative and may not form part of the sale.
- Keep furniture visually secondary to room proportions, windows, doors, circulation, and room identity.
- Support a clean cutaway/Dollhouse mode so people can understand room-to-room relationships.
- Make the ceiling toggle obvious, with an understandable label rather than a technical icon alone.
- If a measurement tool is provided, explain what is being measured and the accuracy limits of traced or estimated geometry.

### 5.8 Compare, shortlist, and share

- Allow users to shortlist homes from a card, floor plan, tower view, or 3D viewer.
- Keep the shortlist accessible without leaving the current journey.
- Compare a small set of homes in a readable side-by-side layout. Recommended fields: configuration, sourced area, floor, stated facing/orientation, indicative price where supported, notable nearby context, and confidence/availability notes.
- Let users reopen a home in the exact selected view, subject to a safe and stable URL format.
- Provide shareable links for a home, room, tower, and community view.
- Add a clean presentation mode for sales conversations: minimal controls, useful labels, and a quick way to switch between shortlisted homes.
- Persist favourites locally or through an account only with clear user expectations and appropriate privacy handling.

### 5.9 Helpful guidance, not a cluttered chatbot

- Add contextual tips at the point where users need them: “Select a room to focus the 3D view,” “Use Top View to understand the layout,” or “This view direction is estimated.”
- Add an optional guided tour for first-time users. It should teach the key controls in under a minute and be skippable/replayable.
- Consider natural-language search for queries such as “show me a two-bedroom home on a high floor” or “where is the clubhouse?” only when those attributes and entities are backed by the available data.
- If a query cannot be answered confidently, say what information is unavailable and suggest the closest supported action. Do not fabricate results.
- Keep guidance quiet after users have demonstrated familiarity; never interrupt navigation with repeated tooltips.

### 5.10 Enquiry and next steps

- Make the next step easy to find without disrupting exploration: **Enquire about this home**, **Request a visit**, or **Share shortlist**, depending on the actual business process.
- Preserve the selected home in the enquiry context so a sales team can understand what the visitor is asking about.
- Clearly label prices as indicative and state assumptions or exclusions when known. Do not imply that an estimate is a final offer or guarantee availability.
- Do not invent booking, payment, availability, or sales integrations. Build only the flows that the business has confirmed.

---

## 6. Speed and responsiveness are core features

Optimise for the feeling of immediate response, not only for a good benchmark score.

### 6.1 Loading strategy

- Render the navigation, selected-home summary, basic floor plan, and essential text before loading expensive 3D details.
- Load the initial site/home view first; defer distant towers, high-detail furniture, optional map overlays, and secondary media until requested or visible.
- Use progressive visual quality: show a lightweight but clear preview first, then refine it as assets arrive.
- Prioritise the current selection and nearby context over the whole development.
- Show meaningful loading states only when needed. Avoid long blank canvases and spinner-only screens.
- Cache reusable static assets and data responsibly; handle stale data and failures gracefully.
- Avoid redundant reloads when switching between a plan, a 3D view, a tower, and the minimap.

### 6.2 Rendering and device adaptation

- Use simplified geometry and fewer visual effects for low-power devices.
- Reuse repeated geometry and materials; avoid creating many separate render objects for repetitive buildings, furniture, trees, or labels.
- Load detail based on distance, visibility, selection, and device capability.
- Limit shadow quality, post-processing, texture sizes, and nonessential effects when they materially reduce frame rate.
- Keep VR rendering particularly conservative. Prefer stable motion and clear interactions over extra visual detail.
- Provide automatic quality adjustment plus a small, understandable quality setting when useful.
- Avoid sudden camera jumps, large layout shifts, flashing, and unnecessary animation.

### 6.3 Interaction targets

Treat these as initial product targets to measure and tune on representative real devices, not guarantees:

- Main interface and navigation should become usable before high-detail 3D assets finish loading.
- Common UI actions should give visible feedback immediately, ideally within about 100 ms under normal conditions.
- On a representative desktop, a typical home-view interaction should remain smooth around 50–60 FPS when feasible; degrade visual quality before allowing controls to feel sluggish.
- On supported standalone VR hardware, target the device's stable native refresh rate; prioritise frame stability and comfort over detail.
- On a representative mid-range mobile device, offer a usable simplified exploration mode instead of allowing the 3D scene to freeze or crash.
- Track the time to first meaningful interaction, home selection time, room-selection latency, 3D scene readiness, frame rate, memory use, and errors.

### 6.4 Resilience

- If 3D assets fail, show a useful 2D plan or simplified scene with a retry action.
- If an external basemap is unavailable, preserve the selected home and offer an available fallback.
- If VR is unsupported, hide or explain VR entry rather than showing a broken control.
- Keep selection state intact when a component fails or a user switches modes.
- Do not let optional analytics, telemetry, or third-party content block the core experience.

---

## 7. Design and usability requirements

### Visual style

- Modern, premium, calm, and property-focused—not a game interface.
- Use a consistent visual hierarchy, generous spacing, readable text, restrained gold accents, and a dark/navy foundation only where it improves the scene and contrast.
- Keep primary actions visually obvious and secondary tools compact.
- Make selection, hover, loading, unavailable, and error states distinct.
- Do not put essential controls over visually busy or high-contrast parts of the 3D scene without a legible backing surface.

### Responsive layout

- Desktop: provide enough room for the 3D scene while keeping selection details and key actions accessible.
- Tablet: reduce panel width and keep touch targets comfortable.
- Mobile: make the main task simple, allow full-screen exploration, use bottom sheets or compact panels, and avoid tiny toolbars over the scene.
- VR: minimise text density, use large, comfortable targets, and avoid forcing the user to read lengthy panels in the headset.

### Accessibility and control

- Support keyboard navigation for important non-VR flows.
- Give controls accessible names and visible focus states.
- Do not rely on colour alone to distinguish selected, unavailable, or uncertain data.
- Respect reduced-motion preferences and allow camera animations to be interrupted.
- Provide readable text, contrast, clear error messages, and non-3D alternatives for core information.
- Ensure that essential tasks remain possible without precise mouse gestures.

---

## 8. Truth, provenance, and data quality

The application must never claim more accuracy than its source assets support.

Use understandable labels to distinguish:

- **Source-verified:** Explicitly printed or confirmed by an authoritative project asset.
- **Estimated:** Calculated or spatially fitted through a documented method, with uncertainty where material.
- **Illustrative:** Created to improve visual understanding but not confirmed as the built or saleable condition.
- **External:** Supplied by external datasets, with appropriate attribution and licence handling.
- **Unverified:** Conflicting or insufficient source information prevents a confident claim.

Rules:

1. Never promote estimated or illustrative information to verified status without new evidence.
2. When source materials disagree, explain the conflict where it affects a purchase decision or spatial interpretation, and state which source is being followed.
3. Do not fabricate data for unlabelled wings, unavailable flats, missing room dimensions, unknown heights, pricing, availability, or amenity details.
4. Keep provenance close to the displayed fact. Users should not have to search a technical document to understand whether a statement is certain.
5. Label furniture and decor as illustrative where applicable and state that they may not be part of the sale.
6. Distinguish straight-line distance from routed distance. Provide travel time only when a real route/time method supports it.
7. Keep attribution accessible for external maps, imagery, terrain, and 3D assets. Follow each provider's terms and production-use restrictions.
8. Do not scrape or copy sources that prohibit automated reuse.
9. Validate orientation against reliable spatial relationships and source material; do not blindly trust an incorrect north arrow.
10. If information is missing, make the limitation visible and offer the next best supported way to continue.

---

## 9. Suggested differentiating features

Build the foundational experience first. Then consider the following enhancements in priority order.

### High priority: deliver clear immediate value

**A. Guided first-use tour** — A short, optional walkthrough that teaches selection, camera movement, room focus, and reset. Include a replay control.

**B. One-click room focus** — Selecting a room from either the floor plan or minimap moves the main view to a useful framing and highlights the same room everywhere.

**C. Smart camera presets** — A set of consistent views for key rooms, the entry, balcony, whole home, tower, and site overview.

**D. Home comparison and favourites** — Make it easy to revisit candidate flats instead of repeatedly searching for them.

**E. Clean presentation mode** — A simplified, low-clutter mode for shared screens or sales consultations.

**F. Quality-aware 3D mode** — Automatically adjust scene detail based on the device, with a simplified fallback.

### Medium priority: improve decision-making

**G. Home suitability overview** — Summarise only supported factors such as configuration, floor, sourced area, orientation, and nearby context. Avoid subjective rankings unless the user defines their preferences.

**H. Orientation and sunlight explorer** — Show sun direction at selected times where calculation inputs are reliable, with plain-language caveats.

**I. Contextual amenity explorer** — Select an amenity to show its location, straight-line distance, and walking route only if supported.

**J. Shareable guided tour** — Share a link that opens the selected home in a useful camera view with optional step-by-step tour stops.

**K. Home finder by natural language** — Map a user's plain-language request to confirmed attributes, tell them which filters were applied, and allow easy correction.

### Later / optional: only if data and business processes support it

**L. Personalised shortlist workspace** — Save and compare homes across sessions, with account or privacy choices clearly explained.

**M. Scenario comparisons** — Let users compare different floors or homes in consistent camera views, without suggesting that estimated differences are certain.

**N. Sales-consultant mode** — A fast, controlled presentation view that jumps between units, highlights sourced facts, and supports sharing.

**O. VR guided visits** — Predefined waypoints and room transitions with comfort controls, a reachable minimap, and a straightforward exit route.

**P. Change and availability integration** — Show live availability, booking state, or updated pricing only when a confirmed and maintained business data source exists.

Avoid ungrounded or expensive additions such as speculative AI-generated property claims, unsupported noise scores, guaranteed-view predictions, or real-time crowd data without a dependable data source.

---

## 10. Interaction details that must be consistent

Define and use a consistent behaviour model for the following:

- **Selecting a home** updates the home summary, floor plan, tower highlight, and relevant URL state together.
- **Selecting a room** synchronises its highlight in plan/minimap/3D and frames the room in the main view without changing the selected home.
- **Zooming the main scene** does not zoom the minimap, and vice versa.
- **Changing to top view** never disables zoom. Users can zoom from the entire site down to the selected tower, floor, or room where the data supports that scale.
- **Reset view** restores a useful camera for the current context; it must not unexpectedly clear the chosen home.
- **Return to home/site** changes the viewing context without erasing the selected unit or shortlist.
- **Walk-mode teleport** shows a destination preview when feasible, avoids blocked locations, updates the position marker, and provides a recoverable starting position.
- **Minimap mode switching** clearly indicates whether it represents the floor plan or the community map.
- **Unavailable data** is represented by a clear disabled or explanatory state, not by an empty panel or made-up geometry.
- **Long-running actions** have feedback and can be cancelled or safely retried.
- **URL sharing** reopens the correct selected home and supported view without depending on transient in-memory state.

---

## 11. Product analytics and quality signals

Measure whether the application is helping users, not just whether they click more.

Track privacy-respectfully and with appropriate consent:

- Time until a visitor can start exploring.
- Time and number of steps required to find and open a home.
- Success rate for tower, floor, flat, and room selection.
- Whether users can recover after zooming, panning, or entering Walk mode.
- Time to focus a room from the plan or minimap.
- 3D loading failures, external layer failures, frame rate, memory pressure, and crashes.
- Use of compare, shortlist, share, enquiry, and guided-tour features.
- Common abandoned steps, repeated misclicks, and help requests.

Use aggregate data where possible. Do not collect sensitive information unnecessarily, and do not let analytics slow down rendering or interactions.

---

## 12. Rebuild workflow for the product team or AI agent

Work in this order. Do not start by reproducing the old interface or carrying over its technical structure.

### Step 1 — Define the product

- Convert this prompt into a concise product requirements document and task flows.
- Identify which user needs are essential for launch and which are optional enhancements.
- Record data dependencies and clearly flag features that cannot be implemented honestly with current information.

### Step 2 — Design the interaction model

- Map the Discover → Community → Home Finder → Home Viewer → Compare/Share journey.
- Define selected-home state, selected-room state, camera presets, minimap modes, and reset/recovery behaviour.
- Produce wireframes for desktop, mobile, and VR where applicable before polishing 3D visuals.
- Test whether a first-time user can find a home and focus a room without help.

### Step 3 — Establish a fast baseline

- Build the minimum usable interface, home selection, plan view, simple community context, and basic 3D interaction first.
- Measure real devices early. Do not wait until the end to discover that the scene is too heavy.
- Make a usable fallback for devices or situations where full 3D cannot run smoothly.

### Step 4 — Add depth progressively

- Add synchronized room navigation, the minimap, quality-aware scene loading, unit surroundings, compare/shortlist, and richer contextual layers.
- Add environmental simulations and guided tours only after accuracy, data, and interaction behaviour are defined.

### Step 5 — Validate with real tasks

Test complete user tasks, not only isolated controls. Include desktop, touch/mobile, reduced-performance hardware, and a supported VR device when available. Record what was actually tested and what remains unverified.

---

## 13. Definition of done

A release is not done merely because the page renders or the 3D scene looks impressive.

### Core usability

- A first-time user can select a valid home, understand its key facts, switch between plan and 3D, and return to the whole-site view without losing the selected home.
- A user can select a room in the plan or minimap and have the corresponding room highlighted and focused in the main 3D view.
- The minimap's red position marker and heading indicator remain aligned with the user's actual navigation state.
- The user can zoom into rooms in top-down mode and zoom the minimap independently.
- Camera and navigation controls are discoverable, predictable, interruptible, and recoverable.
- Core tasks are usable without a VR headset and have a reasonable fallback when advanced 3D fails.

### Performance

- The useful interface appears before optional high-detail assets finish loading.
- Navigation remains responsive during model loading and mode switching.
- Scene detail adapts to device capability; low-power devices do not get forced into the highest quality mode.
- Representative devices are tested and measured; performance claims include the hardware, browser, and conditions tested.

### Trust and content

- Sourced, estimated, illustrative, external, and unverified information are distinguishable.
- Missing or conflicting property information is not silently invented or concealed.
- Price, area, orientation, distance, and view-related claims carry suitable explanation and caveats.
- External assets and datasets have appropriate attribution and permitted usage.

### Validation and accessibility

- Test results cover the full core journeys, not just screenshots or a successful build.
- Controls have clear labels, touch targets, keyboard support where applicable, and visible focus states.
- Important tasks have a non-3D or simplified alternative.
- Failures provide a clear next step and do not unnecessarily reset the user's selection.

---

## 14. Final instruction

Create a product that feels **simple at first glance, powerful when explored, honest about its data, and fast throughout**. Prefer a smaller number of excellent, cohesive features over a long list of disconnected tools.

Before implementing any proposed feature, answer four questions:

1. What user problem does it solve?
2. What reliable data does it require?
3. How will it behave on a slow device or when data/assets fail?
4. How will we verify that it genuinely improves the user's task?

Use these answers to prioritise work. Never trade user trust, navigational clarity, or stable performance for visual complexity.
