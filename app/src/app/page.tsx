import { Suspense } from 'react';
import CompareSection from '@/components/sections/CompareSection';
import Stage from '@/components/stage/Stage';
import { Spinner } from '@/components/ui/primitives';

/** Server-rendered first paint of the stage: the poster frame the stage's own loader continues, so the hero is never black. */
const StagePoster = () => (
  <div className="relative h-[calc(100svh-3.5rem)] min-h-[560px] overflow-hidden border-b border-line bg-bg">
    {/* eslint-disable-next-line @next/next/no-img-element -- a static still, no optimisation needed */}
    <img src="/media/video/clip-03.png" alt="" className="stage-poster absolute inset-0 h-full w-full object-cover" />
    <div className="absolute inset-0 bg-gradient-to-tr from-bg/95 via-bg/40 to-bg/30" aria-hidden />
    <div className="absolute left-1/2 top-[34%] -translate-x-1/2 rounded-xl bg-black/40 p-3 lg:top-[26%]"><Spinner label="Loading the stage…" /></div>
  </div>
);

const Loading = ({ label }: { label: string }) => <div className="grid min-h-40 place-items-center"><Spinner label={label} /></div>;

/**
 * The whole experience on one page. The stage is the one place to navigate: community, home, location map, the home
 * finder, realms, phases and location insights all live in it (see components/stage). Below it only the shortlist
 * (Compare). Selection state lives in the query string (see lib/urlState.ts). Media stays its own page.
 */
export default function Home() {
  return (
    <>
      <Suspense fallback={<StagePoster />}>
        <Stage />
      </Suspense>

      <div className="mx-auto w-full max-w-[1800px] px-4 md:px-6">
        <section id="compare" aria-label="Compare homes" className="py-10 md:py-14">
          <Suspense fallback={<Loading label="Loading shortlist…" />}><CompareSection /></Suspense>
        </section>
      </div>
    </>
  );
}
