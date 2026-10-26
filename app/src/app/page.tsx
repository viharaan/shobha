import { Suspense } from 'react';
import CompareSection from '@/components/sections/CompareSection';
import Stage from '@/components/stage/Stage';
import { Spinner, StatusBadge } from '@/components/ui/primitives';
import { FLOOR_TO_FLOOR_M, INFRASTRUCTURE, PHASES, PROJECT } from '@/data/project';
import { amenities, realmColor } from '@/data/sobha/amenities';
import { realms } from '@/data/sobha/realms';

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
 * finder, tours and VR all live in it (see components/stage). Below it only the shortlist (Compare) and the Community
 * background. Selection state lives in the query string (see lib/urlState.ts). Media stays its own page.
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

        <section id="community" aria-label="Community" className="border-t border-line py-16 md:py-20">
          <header className="mb-8">
            <h2 className="eyebrow">Community</h2>
            <p className="display mt-1 text-3xl md:text-4xl">Six realms, thirty named places</p>
          </header>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ul className="divide-y divide-line">
                {realms.map((r) => {
                  const items = amenities.filter((a) => a.realm === r.name);
                  return (
                    <li key={r.name} className="grid grid-cols-[14px_1fr] gap-3 py-3">
                      <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: realmColor[r.name] }} />
                      <div>
                        <div className="flex items-baseline justify-between gap-3"><b className="text-sm">{r.name}</b><span className="tnum text-xs text-fg-muted">{items.length ? `${items.length} places` : ''}</span></div>
                        <p className="mt-0.5 text-sm text-fg-muted">{r.blurb}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="lg:col-span-2">
              <h3 className="eyebrow">Phases</h3>
              <p className="display mt-1 text-2xl">Handover 2032 to 2033</p>
              <ol className="mt-4 divide-y divide-line text-sm">
                {[...PHASES].sort((a, b) => a.handover.localeCompare(b.handover)).map((p) => (
                  <li key={p.phase} className="flex items-baseline justify-between gap-3 py-2">
                    <span>Phase {p.phase} <span className="text-fg-muted">· Wings {p.wings.join(', ')}</span></span>
                    <span className="tnum font-mono text-xs text-fg-muted">{p.handover}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-fg-muted">RERA approved {PROJECT.reraApproval}, one registration per phase. Wings 1, 2 and 9 to 14 have 46 typical floors; wings 3 to 8 have 45. Refuge units on floors {PROJECT.refugeFloors.join(', ')}.</p>

              <h3 className="eyebrow mt-10">Connectivity, as stated</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {INFRASTRUCTURE.map((i) => <li key={i.name}><b>{i.name}</b> <span className="text-fg-muted">· {i.detail} · {i.status}</span></li>)}
              </ul>
              <p className="mt-2 text-xs text-fg-muted">Brochure claims. No alignments or travel times are computed in this app.</p>
            </div>
          </div>

          <details className="group mt-14 rounded-xl border border-line p-5">
            <summary className="eyebrow cursor-pointer list-none">How to read the badges <span className="text-fg-muted group-open:hidden">· show</span></summary>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-fg-muted">
              <span><StatusBadge status="source-verified" /> cross-checked inside the document, e.g. plan scale from 12 room labels</span>
              <span><StatusBadge status="source" /> as printed in SOBHA documents</span>
              <span><StatusBadge status="external" /> OpenStreetMap and open datasets, with attribution</span>
              <span><StatusBadge status="approximate" /> traced from a raster or fitted by a documented method</span>
              <span><StatusBadge status="assumed" /> not in any source, e.g. {FLOOR_TO_FLOOR_M} m floor height</span>
              <span><StatusBadge status="unverified" /> conflicts with official documents</span>
            </div>
            <p className="mt-3 text-xs text-fg-muted">Tower shapes come from OpenStreetMap outlines and the traced master plan; heights are illustrative. Furniture and finishes in the home viewer are illustrative and not part of any sale.</p>
          </details>
        </section>
      </div>
    </>
  );
}
