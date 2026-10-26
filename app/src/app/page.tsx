import { Suspense } from 'react';
import Stage from '@/components/stage/Stage';
import { Spinner } from '@/components/ui/primitives';

/** Server-rendered first paint of the stage: the poster frame the stage's own loader continues, so the hero is never black. */
const StagePoster = () => (
  <div className="relative h-svh min-h-[560px] overflow-hidden bg-bg">
    {/* eslint-disable-next-line @next/next/no-img-element -- a static still, no optimisation needed */}
    <img src="/media/video/clip-03.png" alt="" className="stage-poster absolute inset-0 h-full w-full object-cover" />
    <div className="absolute inset-0 bg-gradient-to-tr from-bg/95 via-bg/40 to-bg/30" aria-hidden />
    <div className="absolute left-1/2 top-[34%] -translate-x-1/2 rounded-xl bg-black/40 p-3 lg:top-[26%]"><Spinner label="Loading the stage…" /></div>
  </div>
);


/**
 * The whole experience on one page. The stage is the one place to navigate: community, home, location map, the home
 * finder, realms, phases, location insights and the shortlist (Compare, an overlay) all live in it (see
 * components/stage). Selection state lives in the query string (see lib/urlState.ts). Media stays its own page.
 */
export default function Home() {
  return (
    <>
      <Suspense fallback={<StagePoster />}>
        <Stage />
      </Suspense>

    </>
  );
}
