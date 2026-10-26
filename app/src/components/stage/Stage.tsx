'use client';

import { useEffect, useRef, useState } from 'react';
import { VRButton } from '@/components/three/VRButton';
import { PROJECT } from '@/data/project';
import { scrollToSection, useUrlState } from '@/lib/useUrlState';
import { Compass } from './Compass';
import { NavPad } from './NavPad';
import CommunityStage from './CommunityStage';
import HomeStage from './HomeStage';

/**
 * The hero of the single page: one full-viewport 3D stage with two modes (Community = site model,
 * Home = 1:1 unit). One WebGL canvas and one <XR> tree are live at a time (keyed by mode), so the
 * single Enter VR button always enters what is on screen. Mode, tour and present live in the URL.
 */
export default function Stage() {
  const { params, set, num } = useUrlState();
  const mode = params.get('mode') === 'home' ? 'home' : 'community';
  const present = params.get('present') === '1';
  const touring = !!params.get('tour');
  const [rail, setRail] = useState(false);
  // the control rail starts open on wide screens only; on phones it is a bottom sheet the user pulls up
  useEffect(() => { if (window.matchMedia('(min-width: 1024px)').matches) Promise.resolve().then(() => setRail(true)); }, []);
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
  const heroVisible = chrome && !touched && mode === 'community' && num('wing') === null;

  return (
    <section ref={stageRef} id="explore" aria-label="Interactive stage" className="relative h-[calc(100svh-3.5rem)] min-h-[560px] w-full overflow-hidden border-b border-line bg-bg" onPointerDownCapture={() => setTouched(true)}>
      {mode === 'community' ? <CommunityStage key="community" rail={rail} resetToken={resetToken} /> : <HomeStage key="home" rail={rail} resetToken={resetToken} />}

      {/* top-left: mode switch */}
      <div className="absolute left-3 top-3 z-30 flex items-center gap-2">
        <div className="seg" role="tablist" aria-label="Stage mode">
          <button type="button" role="tab" aria-selected={mode === 'community'} onClick={() => set({ mode: null, tour: null })}>Community</button>
          <button type="button" role="tab" aria-selected={mode === 'home'} onClick={() => set({ mode: 'home', tour: null })}>Home</button>
        </div>
      </div>

      {/* hero copy, until the first interaction */}
      {heroVisible && <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[58%] bg-gradient-to-r from-bg/90 via-bg/45 to-transparent md:w-[46%]" aria-hidden />}
      {heroVisible && (
        <div className="pointer-events-none absolute left-3 top-28 z-20 max-w-md sm:top-16 md:left-6 md:top-20">
          <div className="eyebrow">Sobha Limited · Greater Whitefield, Bengaluru</div>
          <h1 className="display mt-2 text-5xl leading-[0.95] md:text-7xl">SOBHA<br />OneWorld</h1>
          <p className="mt-3 max-w-sm text-sm text-fg-muted md:text-base">{PROJECT.siteAreaAcres} acres, {PROJECT.totalWings} wings, {PROJECT.totalUnits.toLocaleString('en-IN')} homes. Tap a tower, take the tour, or step into a 1:1 home.</p>
          <div className="pointer-events-auto mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => scrollToSection('find')}>Find a home</button>
            <button type="button" className="btn" onClick={() => set({ tour: 1 })}>Guided tour</button>
          </div>
        </div>
      )}

      {/* top-right: compass + controls */}
      <div className="absolute right-3 top-3 z-30 flex flex-col-reverse items-end gap-2 sm:flex-row sm:items-center">
        <Compass onReset={() => setResetToken((t) => t + 1)} />
        <div className="flex items-center gap-2">
          <button type="button" className="btn" aria-pressed={full} onClick={toggleFull} title={full ? 'Exit full screen (Esc)' : 'Full screen'}>{full ? '⤡ Exit' : '⛶ Full screen'}</button>
          {chrome && <button type="button" className="btn" aria-pressed={rail} onClick={() => setRail(!rail)}>Controls</button>}
        </div>
      </div>

      {/* bottom-right: camera pad for people new to 3D maps (walk / VR ignore it; the VR panel has its own buttons) */}
      {chrome && <NavPad className={`absolute bottom-4 z-30 ${rail ? 'right-[21.5rem] max-lg:hidden' : 'right-3'} max-lg:right-3 max-lg:bottom-20`} />}

      {/* bottom-centre: the one place for the tour, VR and presentation */}
      {chrome && (
        <div className="absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-line bg-black/60 p-1 backdrop-blur [&_.btn]:whitespace-nowrap">
          <button type="button" className="btn" onClick={() => set({ tour: mode === 'home' ? 'rooms' : 1 })} title={mode === 'home' ? 'Room by room through this home' : 'Gate → club → stadium → courts → wing, then into a home'}>Guided tour</button>
          <VRButton compact />
          <button type="button" className="btn" onClick={() => set({ present: 1 })} title="Hide the panels; keep a bottom bar with the shortlist">Present</button>
        </div>
      )}
    </section>
  );
}
