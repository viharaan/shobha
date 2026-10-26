'use client';

import { useState } from 'react';
import { BROCHURE_PAGES, MEDIA } from '@/data/manifest';
import { useUrlState } from '@/lib/useUrlState';
import { InfoCard, PeekNext, StageTrail, useStageKeys, type Crumb } from './ContextUI';
import { Dock, type DockTab } from './Dock';

interface Item {
  id: string;
  group: 'Videos' | 'Plans & creatives' | 'Brochure';
  kind: 'video' | 'image';
  title: string;
  src: string;
  poster?: string;
  description?: string;
}

/** Everything the developer supplied, in one list: the videos, the plans and creatives, then the brochure page by page. */
const ITEMS: Item[] = [
  ...MEDIA.filter((m) => m.kind === 'video').map((m): Item => ({ id: m.id, group: 'Videos', kind: 'video', title: m.title, src: m.src, poster: m.poster, description: m.description })),
  ...MEDIA.filter((m) => m.kind === 'image').map((m): Item => ({ id: m.id, group: 'Plans & creatives', kind: 'image', title: m.title, src: m.src, description: m.description })),
  ...BROCHURE_PAGES.map((src, i): Item => ({ id: `brochure-${i + 1}`, group: 'Brochure', kind: 'image', title: `Brochure · page ${i + 1} of ${BROCHURE_PAGES.length}`, src })),
];

const GROUPS: Item['group'][] = ['Videos', 'Plans & creatives', 'Brochure'];

/**
 * Media mode of the stage (`mode=media`). It opens on a gallery of everything (videos, plans and creatives, the
 * brochure page by page); picking one fills the stage with it, and the dock steps through them (‹ title ›, or ← →).
 * "All media" (or Esc) goes back to the gallery. Renders are artist's impressions; only the drone clip is photographic.
 */
export default function MediaStage({ keys = true }: { keys?: boolean }) {
  const { set } = useUrlState();
  const [i, setI] = useState<number | null>(null); // null = the gallery
  const [tab, setTab] = useState<string | null>(null);
  const item = i === null ? null : ITEMS[i];
  const go = (d: number) => setI((n) => (n === null ? (d > 0 ? 0 : ITEMS.length - 1) : (n + d + ITEMS.length) % ITEMS.length));
  useStageKeys({ prev: () => go(-1), next: () => go(1), enter: i === null ? () => setI(0) : undefined, back: () => (i === null ? set({ mode: null }) : setI(null)) }, keys);

  const crumbs: Crumb[] = [{ label: 'SOBHA OneWorld', onClick: () => set({ mode: null }) }, { label: 'Media', onClick: () => setI(null) }];
  if (item) crumbs.push({ label: item.group });
  const grid = (group: Item['group']) => (
    <div className={`grid gap-2 ${group === 'Brochure' ? 'grid-cols-4' : 'grid-cols-2'}`}>
      {ITEMS.map((it, k) => it.group !== group ? null : (
        <button key={it.id} type="button" onClick={() => { setI(k); setTab(null); }} aria-current={k === i ? 'true' : undefined} title={it.title}
          className={`group overflow-hidden rounded-xl border text-left transition-colors ${k === i ? 'border-accent' : 'border-white/10 hover:border-white/30'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static stills, no optimisation needed */}
          <img src={it.poster ?? it.src} alt="" loading="lazy" className={`w-full object-cover ${group === 'Brochure' ? 'aspect-[9/16]' : 'aspect-video'}`} />
          {group !== 'Brochure' && <span className="block truncate px-2 py-1.5 text-[11px] text-fg">{it.title}</span>}
        </button>
      ))}
    </div>
  );
  const tabs: DockTab[] = [
    { id: 'all', label: 'All media', pressed: i === null, onClick: () => { setI(null); setTab(null); } },
    { id: 'videos', label: 'Videos', panel: grid('Videos') },
    { id: 'plans', label: 'Plans', panel: grid('Plans & creatives') },
    { id: 'brochure', label: 'Brochure', panel: grid('Brochure') },
    { id: '3d', label: '3D site', onClick: () => set({ mode: null }), title: 'Back to the 3D site model' },
  ];
  const next = ITEMS[i === null ? 0 : (i + 1) % ITEMS.length];

  return (
    <div className="absolute inset-0 bg-bg">
      {item ? (
        <div className="absolute inset-x-3 bottom-[5.25rem] top-16 grid place-items-center">
          {item.kind === 'video'
            ? <video key={item.id} controls autoPlay playsInline preload="metadata" poster={item.poster} src={item.src} className="max-h-full max-w-full rounded-2xl bg-black shadow-2xl" />
            // eslint-disable-next-line @next/next/no-img-element -- full-size static image, shown as supplied
            : <img key={item.id} src={item.src} alt={item.title} className="ctx-enter max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />}
        </div>
      ) : (
        // the gallery: every group at once, so all the videos are in view, not one at a time
        <div className="scroll-thin absolute inset-x-0 bottom-[5.25rem] top-24 overflow-y-auto px-3 md:px-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 pb-6">
            {GROUPS.map((g) => (
              <section key={g} aria-label={g}>
                <h2 className="eyebrow mb-3">{g} · {ITEMS.filter((it) => it.group === g).length}</h2>
                <div className={`grid gap-3 ${g === 'Brochure' ? 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-8' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                  {ITEMS.map((it, k) => it.group !== g ? null : (
                    <button key={it.id} type="button" onClick={() => setI(k)} title={it.title}
                      className="group overflow-hidden rounded-2xl border border-white/10 bg-surface/60 text-left transition-all hover:-translate-y-0.5 hover:border-accent/70">
                      <span className="relative block">
                        {/* eslint-disable-next-line @next/next/no-img-element -- static stills, no optimisation needed */}
                        <img src={it.poster ?? it.src} alt="" loading="lazy" className={`w-full object-cover ${g === 'Brochure' ? 'aspect-[9/16]' : 'aspect-video'}`} />
                        {it.kind === 'video' && (
                          <span className="absolute inset-0 grid place-items-center">
                            <span className="grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition-transform group-hover:scale-110"><svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden><path d="M8 5.5v13l10.5-6.5z" /></svg></span>
                          </span>
                        )}
                      </span>
                      {g !== 'Brochure' && (
                        <span className="block px-3 py-2">
                          <span className="block truncate text-sm text-fg">{it.title}</span>
                          {it.description && <span className="mt-0.5 line-clamp-2 block text-[11px] text-fg-muted">{it.description}</span>}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
      {keys && <StageTrail crumbs={crumbs} />}
      {keys && (
        <PeekNext next={{ label: next.title, onClick: () => go(1) }}>
          {item && <InfoCard key={item.id} eyebrow={item.group} title={item.title} lead={item.description ?? (item.group === 'Brochure' ? 'As supplied by the developer.' : 'Artist’s impression, as supplied by the developer.')} />}
        </PeekNext>
      )}
      {keys && <Dock current={item && i !== null ? { label: item.title, pos: `${i + 1} / ${ITEMS.length}`, onPrev: () => go(-1), onNext: () => go(1) } : { label: 'All media', pos: `${ITEMS.length}`, onPrev: () => go(-1), onNext: () => go(1) }} tabs={tabs} openTab={tab} onOpenTab={setTab} />}
    </div>
  );
}
