'use client';

import { useEffect, useRef, useState } from 'react';
import { FLOOR_TO_FLOOR_M, PROJECT } from '@/data/project';
import { StatusBadge } from '@/components/ui/primitives';
import { useUrlState } from '@/lib/useUrlState';
import { Compass } from './Compass';
import { NavPad } from './NavPad';
import CommunityStage from './CommunityStage';
import HomeStage from './HomeStage';
import LocationStage from './LocationStage';
import MediaStage from './MediaStage';

/**
 * The hero of the single page: one full-viewport 3D stage with two modes (Community = site model,
 * Home = 1:1 unit). One WebGL canvas and one <XR> tree are live at a time (keyed by mode), so the
 * single Enter VR button always enters what is on screen. Mode, tour and present live in the URL.
 *
 * Chrome is deliberately thin: the first view is a cinematic intro (title, slow orbit, three choices) over a poster
 * frame while the scene loads; after that each mode shows only the options for where you are (see ContextUI). The
 * fine controls (sun, layers, imagery, scale) sit behind View options, closed by default.
 */
export default function Stage() {
  const { params, set, num } = useUrlState();
  const m = params.get('mode');
  const mode = m === 'home' || m === 'map' || m === 'media' ? m : 'community';
  const is3d = mode === 'community' || mode === 'home';
  const present = params.get('present') === '1';
  const touring = !!params.get('tour');
  const [touched, setTouched] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  // full screen: the stage section itself goes fullscreen (header and sections drop away)
  const stageRef = useRef<HTMLElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFull = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void stageRef.current?.requestFullscreen?.(); };
  const chrome = !present && !touring;
  const intro = chrome && !touched && mode === 'community' && num('wing') === null && params.get('find') !== '1';
  // once the visitor has been anywhere in the stage (a tower or the finder in the URL, a stage key), the intro is done:
  // picking a place clears the tower from the URL and must not bring the title card back
  const visited = num('wing') !== null || params.get('find') === '1' || mode !== 'community';
  useEffect(() => { if (visited) Promise.resolve().then(() => setTouched(true)); }, [visited]);
  useEffect(() => {
    const done = () => setTouched(true);
    window.addEventListener('stage-key', done);
    return () => window.removeEventListener('stage-key', done);
  }, []);
  // the camera pad is opt-in (mouse, touch and the arrow keys cover it); Present lives in View options too
  const [pad, setPad] = useState(false);
  // the key legend shows once after the intro and fades after a while or the first stage key
  const [legend, setLegend] = useState(true);
  useEffect(() => {
    if (intro || !legend) return;
    const off = () => setLegend(false);
    const t = window.setTimeout(off, 14000);
    window.addEventListener('stage-key', off);
    return () => { window.clearTimeout(t); window.removeEventListener('stage-key', off); };
  }, [intro, legend]);
  // during the intro, Enter or → starts exploring
  useEffect(() => {
    if (!intro) return;
    const onKey = (e: KeyboardEvent) => {
      const stage = stageRef.current?.getBoundingClientRect();
      if ((e.key === 'Enter' || e.key === 'ArrowRight') && stage && stage.bottom > window.innerHeight * 0.5 && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); setTouched(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [intro]);
  const railExtras = (
    <div className="panel flex flex-wrap gap-1 p-3">
      <button type="button" className="btn" onClick={() => set({ present: 1 })} title="Hide the panels; keep a bottom bar with the shortlist">Present mode</button>
      <button type="button" className="btn" aria-pressed={pad} onClick={() => setPad(!pad)} title="Rotate, tilt and zoom buttons for people new to 3D">Camera buttons</button>
      <details className="w-full pt-1 text-[11px] text-fg-muted">
        <summary className="label cursor-pointer !text-[10px]">How to read the data</summary>
        <ul className="mt-2 space-y-1.5">
          <li><StatusBadge status="source-verified" /> cross-checked inside the document, e.g. plan scale from 12 room labels</li>
          <li><StatusBadge status="source" /> as printed in SOBHA documents</li>
          <li><StatusBadge status="external" /> OpenStreetMap and open datasets, with attribution</li>
          <li><StatusBadge status="approximate" /> traced from a raster or fitted by a documented method</li>
          <li><StatusBadge status="assumed" /> not in any source, e.g. {FLOOR_TO_FLOOR_M} m floor height</li>
          <li><StatusBadge status="unverified" /> conflicts with official documents</li>
        </ul>
        <p className="mt-2">Tower shapes come from OpenStreetMap outlines and the traced master plan; heights are illustrative. Furniture and finishes in the home viewer are illustrative and not part of any sale.</p>
      </details>
    </div>
  );
  const legendText = mode === 'home' ? '← → rooms · ↑ ↓ floor · esc back' : mode === 'map' ? '← → topics · esc back' : mode === 'media' ? '← → videos, plans and pages · esc back' : '← → places and towers · ↑ ↓ floors · ↵ step in · esc back';

  return (
    <section ref={stageRef} id="explore" aria-label="Interactive stage" className="relative h-svh min-h-[560px] w-full overflow-hidden bg-bg" onPointerDownCapture={() => setTouched(true)}>
      {mode === 'community' ? <CommunityStage key="community" resetToken={resetToken} intro={intro} railExtras={railExtras} /> : mode === 'home' ? <HomeStage key="home" resetToken={resetToken} railExtras={railExtras} /> : mode === 'map' ? <LocationStage key="map" keys={chrome} /> : <MediaStage key="media" keys={chrome} />}

      {/* top bar: mode switch left; compass and full screen right. Everything else is in the dock (see Dock.tsx) */}
      <div className="absolute left-3 top-3 z-30 flex items-center gap-2">
        <div className="seg" role="tablist" aria-label="Stage mode">
          <button type="button" role="tab" aria-selected={mode === 'community'} onClick={() => set({ mode: null, tour: null })}><span className="max-sm:hidden">Community</span><span className="sm:hidden">Site</span></button>
          <button type="button" role="tab" aria-selected={mode === 'home'} onClick={() => set({ mode: 'home', tour: null, find: null })}>Home</button>
          <button type="button" role="tab" aria-selected={mode === 'map'} onClick={() => set({ mode: 'map', tour: null, find: null })}><span className="max-sm:hidden">Location</span><span className="sm:hidden">Map</span></button>
          <button type="button" role="tab" aria-selected={mode === 'media'} onClick={() => set({ mode: 'media', tour: null, find: null })}>Media</button>
        </div>
      </div>
      {/* the wordmark, now that there is no header: top centre on wide screens */}
      <div className="pointer-events-none absolute left-1/2 top-5 z-20 -translate-x-1/2 items-baseline gap-2 whitespace-nowrap max-lg:hidden lg:flex" aria-hidden>
        <span className="text-[12px] tracking-[0.35em] text-fg">SOBHA</span>
        <span className="text-[12px] tracking-[0.2em] text-accent">ONEWORLD</span>
      </div>
      <div className="absolute right-3 top-3 z-30 flex items-start gap-2">
        {!intro && is3d && <Compass onReset={() => setResetToken((t) => t + 1)} />}
        <button type="button" className="glass grid h-10 w-10 place-items-center rounded-full text-fg hover:brightness-125" aria-pressed={full} onClick={toggleFull} title={full ? 'Exit full screen (Esc)' : 'Full screen'} aria-label={full ? 'Exit full screen' : 'Full screen'}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}</svg>
        </button>
      </div>

      {/* first impression: title and three choices over the slowly orbiting site (or its poster while it loads) */}
      {intro && <div className="pointer-events-none absolute inset-0 z-[25] bg-gradient-to-tr from-bg/95 via-bg/40 to-transparent" aria-hidden />}
      {intro && (
        <div className="pointer-events-none absolute inset-x-4 bottom-20 z-[26] max-w-xl md:bottom-24 md:left-8 lg:bottom-28 lg:left-12">
          <div className="eyebrow">Sobha Limited · Greater Whitefield, Bengaluru</div>
          <h1 className="display mt-3 text-5xl leading-[0.92] sm:text-6xl md:text-8xl">SOBHA<br />OneWorld</h1>
          <p className="mt-4 max-w-md text-sm text-fg/80 md:text-base">{PROJECT.siteAreaAcres} acres, {PROJECT.totalWings} wings, {PROJECT.totalUnits.toLocaleString('en-IN')} homes. Glide through the community, then step into a home at 1:1.</p>
          <div className="pointer-events-auto mt-6 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary h-11 rounded-full px-5 text-sm" onClick={() => set({ tour: 1 })}>▶ Take the guided tour</button>
            <button type="button" className="glass h-11 rounded-full px-5 text-sm text-fg hover:brightness-125" onClick={() => setTouched(true)}>Explore freely</button>
            <button type="button" className="glass h-11 rounded-full px-5 text-sm text-fg hover:brightness-125" onClick={() => { setTouched(true); set({ find: 1 }); }}>Find a home</button>
          </div>
        </div>
      )}

      {/* camera pad, opt-in from View options (walk / VR ignore it); phones use two-finger gestures instead */}
      {chrome && !intro && is3d && pad && <NavPad className="absolute right-3 top-[7.5rem] z-30 max-md:hidden" />}

      {/* keyboard legend, wide screens only; fades after a while or the first key */}
      {chrome && !intro && (
        <div className={`pointer-events-none absolute bottom-[4.6rem] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/50 px-3 py-1 text-[11px] tracking-wide text-fg-muted transition-opacity duration-700 max-lg:hidden ${legend ? 'opacity-100' : 'opacity-0'}`} aria-hidden>{legendText}</div>
      )}

    </section>
  );
}
