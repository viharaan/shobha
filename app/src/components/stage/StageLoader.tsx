'use client';

import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';

export interface LoadStep {
  label: string;
  done: boolean;
}

/**
 * Poster frame over the canvas while the scene builds (terrain, towers, landscape, textures can take 20–45 s on a
 * cold load). Shows one of the developer's render stills, the steps still pending and the texture / model count from
 * three's loading manager, then fades out once `ready`. After a while it offers to show what has loaded so far.
 */
export function StageLoader({ ready, steps, poster, caption }: { ready: boolean; steps: LoadStep[]; poster: string; caption: string }) {
  const { loaded, total, active } = useProgress();
  const [gone, setGone] = useState(false);
  const [fading, setFading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [skip, setSkip] = useState(false);
  const done = ready && !active;
  const lift = done || skip;

  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 15000);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!lift) return;
    // two frames so the first rendered frame is on screen before the poster lifts
    let raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => setFading(true)); });
    const t = window.setTimeout(() => setGone(true), 1100);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [lift]);

  if (gone) return null;
  const pending = steps.find((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;
  // steps count for most of the bar; textures fill the rest
  const pct = Math.round(((doneCount + (total ? loaded / total : 0)) / (steps.length + 1)) * 100);

  return (
    <div className={`absolute inset-0 z-20 overflow-hidden bg-bg transition-opacity duration-1000 ${fading ? 'pointer-events-none opacity-0' : 'opacity-100'}`} role="status" aria-live="polite" aria-busy={!done}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a static still, no optimisation needed */}
      <img src={poster} alt="" className="stage-poster absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-bg/50" aria-hidden />
      {/* status: centred in the upper half, clear of the intro copy (bottom-left), the context chrome and the plan minimap */}
      <div className="absolute left-1/2 top-[34%] flex w-[min(20rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2 rounded-xl bg-black/40 p-3 backdrop-blur-sm lg:top-[26%]">
        <div className="flex items-center gap-3 text-xs text-fg-muted">
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{pending ? `${pending.label}…` : total && loaded < total ? `Textures and models ${loaded} / ${total}…` : 'Almost there…'}</span>
          <span className="tnum">{Math.min(99, pct)}%</span>
        </div>
        <div className="h-0.5 overflow-hidden rounded bg-line" aria-hidden>
          <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${Math.min(99, pct)}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2 text-[10px] text-fg-muted">
          <span>{caption}</span>
          {slow && !done && <button type="button" className="btn min-h-0 px-2 py-1 text-[11px]" onClick={() => setSkip(true)}>Show it now</button>}
        </div>
      </div>
    </div>
  );
}
