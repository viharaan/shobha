'use client';

import Link from 'next/link';
import { homeLabel, resolveHome } from '@/lib/homes';
import { pageHref } from '@/lib/urlState';
import { homeKey, useShortlist, type HomeRef } from '@/lib/shortlist';

/**
 * Minimal bottom bar for sales conversations: the selected-home label, one button per shortlisted
 * home (opens it in the same view), and Exit. Shown when a page is in presentation mode.
 */
export function PresentationBar({ label, current, target, onExit }: { label: string; current: HomeRef | null; target: 'plans' | 'explore'; onExit: () => void }) {
  const { items } = useShortlist();
  const href = (h: HomeRef) => {
    const planId = target === 'plans' ? resolveHome(h).planId : null;
    return planId ? pageHref({ mode: 'home', plan: planId, wing: h.wing, flat: h.flat, floor: h.floor, present: 1 }) : pageHref({ wing: h.wing, floor: h.floor, present: 1 });
  };
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-line bg-bg/90 px-3 py-2 backdrop-blur">
      <span className="truncate text-sm text-fg">{label}</span>
      <div className="scroll-thin flex flex-1 items-center gap-1 overflow-x-auto">
        {items.length === 0 && <span className="text-[11px] text-fg-muted">Shortlist is empty. Add homes with Find a home in the stage.</span>}
        {items.map((h) => {
          const active = current !== null && homeKey(h) === homeKey(current);
          return (
            <Link key={homeKey(h)} href={href(h)} className="btn whitespace-nowrap no-underline" aria-pressed={active} title={homeLabel(h)}>
              W{h.wing} · F{h.flat} · L{h.floor}
            </Link>
          );
        })}
      </div>
      <Link href="/#compare" className="btn no-underline">Compare</Link>
      <button type="button" className="btn" onClick={onExit}>Exit</button>
    </div>
  );
}
