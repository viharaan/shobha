'use client';

import { useEffect, useRef, useState } from 'react';
import { PROJECT } from '@/data/project';
import { scrollToSection, useUrlState } from '@/lib/useUrlState';
import { Compass } from './Compass';
import { NavPad } from './NavPad';
import CommunityStage from './CommunityStage';
import HomeStage from './HomeStage';
import LocationStage from './LocationStage';

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
  const mode = params.get('mode') === 'home' ? 'home' : params.get('mode') === 'map' ? 'map' : 'community';
  const is3d = mode !== 'map';
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
    </div>
  );
  const legendText = mode === 'home' ? '← → rooms · ↑ ↓ floor · esc back' : mode === 'map' ? '← → topics · esc back' : '← → places and towers · ↑ ↓ floors · ↵ step in · esc back';

  return (
    <section ref={stageRef} id="explore" aria-label="Interactive stage" className="relative h-[calc(100svh-3.5rem)] min-h-[560px] w-full overflow-hidden border-b border-line bg-bg" onPointerDownCapture={() => setTouched(true)}>
      {mode === 'community' ? <CommunityStage key="community" resetToken={resetToken} intro={intro} railExtras={railExtras} /> : mode === 'home' ? <HomeStage key="home" resetToken={resetToken} railExtras={railExtras} /> : <LocationStage key="map" keys={chrome} />}

      {/* top bar: mode switch left; compass and full screen right. Everything else is in the dock (see Dock.tsx) */}
      <div className="absolute left-3 top-3 z-30 flex items-center gap-2">
        <div className="seg" role="tablist" aria-label="Stage mode">
          <button type="button" role="tab" aria-selected={mode === 'community'} onClick={() => set({ mode: null, tour: null })}><span className="max-sm:hidden">Community</span><span className="sm:hidden">Site</span></button>
          <button type="button" role="tab" aria-selected={mode === 'home'} onClick={() => set({ mode: 'home', tour: null, find: null })}>Home</button>
          <button type="button" role="tab" aria-selected={mode === 'map'} onClick={() => set({ mode: 'map', tour: null, find: null })}><span className="max-sm:hidden">Location</span><span className="sm:hidden">Map</span></button>
        </div>
      </div>
      <div className="absolute right-3 top-3 z-30 flex items-start gap-2">
        {!intro && is3d && <Compass onReset={() => setResetToken((t) => t + 1)} />}
        <button type="button" className="btn h-10 w-10 justify-center px-0" aria-pressed={full} onClick={toggleFull} title={full ? 'Exit full screen (Esc)' : 'Full screen'} aria-label={full ? 'Exit full screen' : 'Full screen'}>
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
            <button type="button" className="btn btn-primary h-11 px-5 text-sm" onClick={() => set({ tour: 1 })}>▶ Take the guided tour</button>
            <button type="button" className="btn h-11 bg-black/50 px-5 text-sm backdrop-blur" onClick={() => setTouched(true)}>Explore freely</button>
            <button type="button" className="btn h-11 bg-black/50 px-5 text-sm backdrop-blur" onClick={() => { setTouched(true); set({ find: 1 }); }}>Find a home</button>
          </div>
        </div>
      )}
      {intro && (
        <button type="button" className="absolute bottom-4 left-1/2 z-[26] -translate-x-1/2 whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-fg-muted hover:text-fg" onClick={() => scrollToSection('community')}>
          Realms · phases · connectivity ↓
        </button>
      )}

      {/* camera pad, opt-in from View options (walk / VR ignore it); phones use two-finger gestures instead */}
      {chrome && !intro && is3d && pad && <NavPad className="absolute bottom-4 left-3 z-30 max-md:hidden max-lg:bottom-auto max-lg:left-auto max-lg:right-3 max-lg:top-[10.5rem]" />}

      {/* keyboard legend, wide screens only; fades after a while or the first key */}
      {chrome && !intro && (
        <div className={`pointer-events-none absolute bottom-[4.6rem] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/50 px-3 py-1 text-[11px] tracking-wide text-fg-muted transition-opacity duration-700 max-lg:hidden ${legend ? 'opacity-100' : 'opacity-0'}`} aria-hidden>{legendText}</div>
      )}

    </section>
  );
}
