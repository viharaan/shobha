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

/**
 * Media mode of the stage (`mode=media`): the selected video or image fills the stage, the dock steps through them
 * (‹ title ›, or ← →) and its tabs show each group as a grid of thumbnails. Hovering ▶ shows what the item is.
 * Renders are artist's impressions; only the drone clip is photographic.
 */
export default function MediaStage({ keys = true }: { keys?: boolean }) {
  const { set } = useUrlState();
  const [i, setI] = useState(0);
  const [tab, setTab] = useState<string | null>(null);
  const item = ITEMS[i];
  const go = (d: number) => setI((n) => (n + d + ITEMS.length) % ITEMS.length);
  useStageKeys({ prev: () => go(-1), next: () => go(1), back: () => set({ mode: null }) }, keys);

  const crumbs: Crumb[] = [{ label: 'SOBHA OneWorld', onClick: () => set({ mode: null }) }, { label: 'Media' }, { label: item.group }];
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
    { id: 'videos', label: 'Videos', panel: grid('Videos') },
    { id: 'plans', label: 'Plans', panel: grid('Plans & creatives') },
    { id: 'brochure', label: 'Brochure', panel: grid('Brochure') },
    { id: '3d', label: '3D site', onClick: () => set({ mode: null }), title: 'Back to the 3D site model' },
  ];
  const next = ITEMS[(i + 1) % ITEMS.length];

  return (
    <div className="absolute inset-0 bg-bg">
      <div className="absolute inset-x-3 bottom-[5.25rem] top-16 grid place-items-center">
        {item.kind === 'video'
          ? <video key={item.id} controls playsInline preload="metadata" poster={item.poster} src={item.src} className="max-h-full max-w-full rounded-2xl bg-black shadow-2xl" />
          // eslint-disable-next-line @next/next/no-img-element -- full-size static image, shown as supplied
          : <img key={item.id} src={item.src} alt={item.title} className="ctx-enter max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />}
      </div>
      {keys && <StageTrail crumbs={crumbs} />}
      {keys && (
        <PeekNext next={{ label: next.title, onClick: () => go(1) }}>
          <InfoCard key={item.id} eyebrow={item.group} title={item.title} lead={item.description ?? (item.group === 'Brochure' ? 'As supplied by the developer.' : 'Artist’s impression, as supplied by the developer.')} />
        </PeekNext>
      )}
      {keys && <Dock current={{ label: item.title, pos: `${i + 1} / ${ITEMS.length}`, onPrev: () => go(-1), onNext: () => go(1) }} tabs={tabs} openTab={tab} onOpenTab={setTab} />}
    </div>
  );
}
