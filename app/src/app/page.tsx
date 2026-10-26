import Link from 'next/link';
import { Suspense } from 'react';
import CompareSection from '@/components/sections/CompareSection';
import FindHome from '@/components/sections/FindHome';
import LocationSection from '@/components/sections/LocationSection';
import Stage from '@/components/stage/Stage';
import { Spinner, StatusBadge } from '@/components/ui/primitives';
import { PLANS } from '@/data/manifest';
import { FLOOR_TO_FLOOR_M, INFRASTRUCTURE, PHASES, PROJECT, UNIT_TYPES } from '@/data/project';
import { amenities, realmColor } from '@/data/sobha/amenities';
import { realms } from '@/data/sobha/realms';
import { pageHref } from '@/lib/urlState';

const Loading = ({ label }: { label: string }) => <div className="grid min-h-40 place-items-center"><Spinner label={label} /></div>;

/**
 * The whole experience on one page: the stage (community / home, VR, tour) as the hero, then
 * Find a home, Compare, Location and Community sections. Selection state lives in the query
 * string (see lib/urlState.ts); sections are anchors. Media stays its own page.
 */
export default function Home() {
  return (
    <>
      <Suspense fallback={<div className="grid h-[calc(100svh-3.5rem)] place-items-center"><Spinner label="Loading the stage…" /></div>}>
        <Stage />
      </Suspense>

      <div className="mx-auto w-full max-w-[1800px] px-4 md:px-6">
        <section id="find" aria-label="Find a home" className="py-16 md:py-20">
          <Suspense fallback={<Loading label="Loading homes…" />}><FindHome /></Suspense>

          <div className="mt-14 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="eyebrow">Configurations</h3>
              <p className="display mt-1 text-2xl md:text-3xl">Seven plans, 734 to 2,416 sq ft</p>
            </div>
            <p className="max-w-md text-xs text-fg-muted">Average prices as printed on the sales sheet of 8 Aug 2026. Floor-rise and location charges apply on top of the basic rate of ₹{PROJECT.basicRatePerSqft.launch.toLocaleString('en-IN')} per sq ft.</p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {UNIT_TYPES.map((u) => {
              const plan = PLANS.find((p) => p.id === u.planId);
              const sba = Array.isArray(u.sbaSqft) ? `${u.sbaSqft[0].toLocaleString('en-IN')}–${u.sbaSqft[1].toLocaleString('en-IN')}` : Math.round(u.sbaSqft).toLocaleString('en-IN');
              return (
                <article key={u.code} className="flex flex-col gap-3 rounded-xl border border-line p-4">
                  <div className="flex items-baseline justify-between">
                    <h4 className="display text-xl">{u.name}</h4>
                    <span className="kbd">{u.code}</span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div><dt className="label">SBA</dt><dd className="tnum text-sm">{sba}</dd></div>
                    <div><dt className="label">Carpet</dt><dd className="tnum text-sm">{u.carpetSqft ? Math.round(u.carpetSqft).toLocaleString('en-IN') : '—'}</dd></div>
                    <div><dt className="label">Average</dt><dd className="tnum text-sm">₹{u.avgPriceCr} Cr</dd></div>
                  </dl>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    {plan ? <Link href={pageHref({ mode: 'home', plan: plan.id })} className="btn no-underline">Step inside</Link> : <span className="text-xs text-fg-muted">Plan not published</span>}
                    <StatusBadge status="source" title="Sales sheet 08.08.26 and floor-plan PDF" />
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section id="compare" aria-label="Compare homes" className="border-t border-line py-16 md:py-20">
          <Suspense fallback={<Loading label="Loading shortlist…" />}><CompareSection /></Suspense>
        </section>

        <section id="location" aria-label="Location" className="border-t border-line py-16 md:py-20">
          <Suspense fallback={<Loading label="Loading map…" />}><LocationSection /></Suspense>
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

          <div className="mt-14 rounded-xl border border-line p-5" aria-labelledby="badges">
            <h3 id="badges" className="eyebrow">How to read the badges</h3>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-fg-muted">
              <span><StatusBadge status="source-verified" /> cross-checked inside the document, e.g. plan scale from 12 room labels</span>
              <span><StatusBadge status="source" /> as printed in SOBHA documents</span>
              <span><StatusBadge status="external" /> OpenStreetMap and open datasets, with attribution</span>
              <span><StatusBadge status="approximate" /> traced from a raster or fitted by a documented method</span>
              <span><StatusBadge status="assumed" /> not in any source, e.g. {FLOOR_TO_FLOOR_M} m floor height</span>
              <span><StatusBadge status="unverified" /> conflicts with official documents</span>
            </div>
            <p className="mt-3 text-xs text-fg-muted">Tower shapes come from OpenStreetMap outlines and the traced master plan; heights are illustrative. Furniture and finishes in the home viewer are illustrative and not part of any sale.</p>
          </div>
        </section>
      </div>
    </>
  );
}
