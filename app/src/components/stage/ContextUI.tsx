'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Context pieces shared by the stage modes: the card for the current place (with a small trail over it), the keyboard
 * moves for the current level, and the card's building blocks. The controls themselves live in the dock (Dock.tsx).
 */
export interface Crumb {
  label: string;
  onClick?: () => void;
}

export interface Stepper {
  label: string;
  /** position at this level, e.g. "2 / 4" */
  pos?: string;
  onPrev?: () => void;
  onNext?: () => void;
}

/**
 * The card for the current place, on its own: top-left under the mode switch on wide screens, above the dock below
 * 1024 px. Shown only once a place is picked, so the first view stays clear.
 */
export function StageCard({ crumbs, children }: { crumbs?: Crumb[]; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-[4.6rem] z-30 flex max-h-[44%] flex-col gap-1.5 max-lg:mx-auto max-lg:max-w-md lg:inset-x-auto lg:bottom-auto lg:left-3 lg:top-16 lg:max-h-[calc(100%-10rem)] lg:w-[19rem]">
      {crumbs && <div className="pointer-events-auto"><Crumbs items={crumbs} /></div>}
      <div className="pointer-events-auto min-h-0 overflow-y-auto scroll-thin rounded-xl">{children}</div>
    </div>
  );
}

/** Keyboard moves for the current level: ← → siblings, ↑ ↓ floors, Enter steps in, Esc steps back. */
export interface StageKeys {
  prev?: () => void;
  next?: () => void;
  up?: () => void;
  down?: () => void;
  enter?: () => void;
  back?: () => void;
}

/**
 * Listens on the window while `enabled` (off during tours, walk mode and VR, whose own keys use the arrows) and only
 * while the stage fills most of the view, so arrows still scroll the page lower down. Typing in a field, a focused
 * button's Enter, and modified keys are left alone.
 */
export function useStageKeys(keys: StageKeys, enabled: boolean) {
  const ref = useRef(keys);
  useEffect(() => { ref.current = keys; });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))) return;
      if (e.key === 'Enter' && t && ['BUTTON', 'A'].includes(t.tagName)) return;
      const stage = document.getElementById('explore')?.getBoundingClientRect();
      if (!stage || stage.bottom < window.innerHeight * 0.5) return;
      const k = ref.current;
      const fn = { ArrowLeft: k.prev, ArrowRight: k.next, ArrowUp: k.up, ArrowDown: k.down, Enter: k.enter, Escape: k.back }[e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
      window.dispatchEvent(new Event('stage-key'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/**
 * The trail over the card. It must fit on one line in the card's width: the first step reads "Site", steps between
 * the second and the last two fold into "…" (its tooltip names them, a click goes to the nearest one) once the trail
 * is deeper than four, and every label can shrink with an ellipsis, the current place last of all.
 */
export function Crumbs({ items }: { items: Crumb[] }) {
  const shown: (Crumb & { folded?: Crumb[] })[] = items.length > 4
    ? [items[0], { label: '…', folded: items.slice(1, -2), onClick: items[items.length - 3].onClick }, ...items.slice(-2)]
    : items;
  return (
    <ol className="flex w-fit max-w-full min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap glass rounded-full px-2.5 py-1 text-[11px]" aria-label="You are here">
      {shown.map((c, i) => {
        const last = i === shown.length - 1;
        const label = i === 0 ? 'Site' : c.label;
        const title = c.folded ? c.folded.map((f) => f.label).join(' › ') : i === 0 ? c.label : undefined;
        return (
          <li key={i} className={`flex min-w-0 items-center gap-1 ${last ? 'shrink' : 'shrink-[3]'}`}>
            {i > 0 && <span className="shrink-0 text-fg-muted/60" aria-hidden>›</span>}
            {c.onClick && !last ? (
              <button type="button" className="min-w-0 truncate rounded px-0.5 text-fg-muted hover:text-accent" onClick={c.onClick} title={title}>{label}</button>
            ) : (
              <span className={`min-w-0 truncate ${last ? 'text-fg' : 'text-fg-muted'}`} aria-current={last ? 'location' : undefined} title={title ?? c.label}>{label}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The card for the current place: what it is, a few facts, the source badge and the one or two things to do next. */
export function InfoCard({ eyebrow, title, badge, lead, details, actions, detailsOpen = false }: { eyebrow: string; title: React.ReactNode; badge?: React.ReactNode; lead?: React.ReactNode; details?: React.ReactNode; actions?: React.ReactNode; detailsOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="ctx-enter glass-strong rounded-[1.4rem] p-3.5" aria-label={typeof title === 'string' ? title : eyebrow}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="eyebrow !text-[10px]">{eyebrow}</div>
          <h2 className="display mt-0.5 truncate text-xl leading-tight">{title}</h2>
        </div>
        {badge && <div className="shrink-0 pt-0.5">{badge}</div>}
      </div>
      {lead && <div className="mt-1.5 text-xs text-fg-muted max-lg:line-clamp-2">{lead}</div>}
      {details && (
        <>
          <div className={`mt-2 text-xs ${open || detailsOpen ? '' : 'max-lg:hidden'}`}>{details}</div>
          {!detailsOpen && <button type="button" className="mt-1 text-[11px] text-fg-muted underline-offset-2 hover:text-accent hover:underline lg:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Less' : 'Details'}</button>}
        </>
      )}
      {actions && <div className="mt-2.5 flex flex-wrap gap-1">{actions}</div>}
    </section>
  );
}

/** Two-column fact list used inside cards. */
export function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {rows.map(([k, v]) => (
        <div key={k} className="contents"><dt className="label !text-[10px] leading-5">{k}</dt><dd className="leading-5">{v}</dd></div>
      ))}
    </dl>
  );
}
