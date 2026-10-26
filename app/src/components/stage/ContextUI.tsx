'use client';

import { useState } from 'react';

/**
 * The stage's context chrome: where you are (breadcrumb + the places you can go from here) and a small card about the
 * current place. Each stage mode fills these from its own state, so only the options that matter at the current level
 * are on screen. Wide screens: one column on the left, list on top, card at the bottom. Below 1024 px: a chip strip
 * under the top bar and the card above the action bar.
 */
export interface Crumb {
  label: string;
  onClick?: () => void;
}

export function ContextColumn({ crumbs, nav, card, hideCard = false }: { crumbs: Crumb[]; nav?: React.ReactNode; card: React.ReactNode; hideCard?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-[4.25rem] top-[3.75rem] z-30 flex flex-col justify-between gap-2 lg:inset-x-auto lg:bottom-4 lg:left-3 lg:top-16 lg:w-[19rem]">
      <nav aria-label="Places" className="pointer-events-auto flex min-h-0 flex-col gap-1.5 lg:rounded-xl lg:border lg:border-line lg:bg-black/55 lg:p-2 lg:backdrop-blur-md">
        <Crumbs items={crumbs} />
        {nav}
      </nav>
      {!hideCard && <div className="pointer-events-auto max-h-[45%] shrink-0 overflow-y-auto scroll-thin rounded-xl max-lg:max-w-md lg:max-h-[60%]">{card}</div>}
    </div>
  );
}

export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <ol className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap text-[11px] [scrollbar-width:none] max-lg:self-start max-lg:rounded-full max-lg:bg-black/60 max-lg:px-2.5 max-lg:py-1 max-lg:backdrop-blur" aria-label="You are here">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-fg-muted/60" aria-hidden>›</span>}
            {c.onClick && !last ? (
              <button type="button" className="rounded px-0.5 text-fg-muted hover:text-accent" onClick={c.onClick}>{c.label}</button>
            ) : (
              <span className={last ? 'text-fg' : 'text-fg-muted'} aria-current={last ? 'location' : undefined}>{c.label}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A group of places. Vertical rows on wide screens, a sideways-scrolling chip row below 1024 px. */
export function PlaceGroup({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-0 flex-col gap-1 ${className}`}>
      {title && <div className="label px-1 max-lg:hidden">{title}</div>}
      <ul className="flex min-h-0 gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] lg:flex-col lg:gap-0 lg:overflow-y-auto lg:overflow-x-visible lg:pb-0 lg:[scrollbar-width:thin]">{children}</ul>
    </div>
  );
}

export function PlaceItem({ active, onClick, children, meta, title, dim = false, className = '' }: { active?: boolean; onClick: () => void; children: React.ReactNode; meta?: React.ReactNode; title?: string; dim?: boolean; className?: string }) {
  return (
    <li className={`shrink-0 ${className}`}>
      <button
        type="button"
        title={title}
        aria-current={active ? 'true' : undefined}
        onClick={onClick}
        className={`flex w-full items-center justify-between gap-3 whitespace-nowrap text-left text-xs transition-colors max-lg:rounded-full max-lg:border max-lg:px-3 max-lg:py-1.5 max-lg:backdrop-blur lg:rounded-md lg:px-2 lg:py-1.5 ${active ? 'max-lg:border-accent bg-accent/90 text-black lg:bg-accent/15 lg:text-accent' : `max-lg:border-line max-lg:bg-black/60 text-fg hover:bg-surface-2 ${dim ? 'opacity-50' : ''}`}`}
      >
        <span>{children}</span>
        {meta && <span className={`text-[10px] max-lg:hidden ${active ? 'text-accent/80' : 'text-fg-muted'}`}>{meta}</span>}
      </button>
    </li>
  );
}

/** The card for the current place: what it is, a few facts, the source badge and the one or two things to do next. */
export function InfoCard({ eyebrow, title, badge, lead, details, actions, detailsOpen = false }: { eyebrow: string; title: React.ReactNode; badge?: React.ReactNode; lead?: React.ReactNode; details?: React.ReactNode; actions?: React.ReactNode; detailsOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="ctx-enter rounded-xl border border-line bg-bg/80 p-3 shadow-2xl backdrop-blur-md" aria-label={typeof title === 'string' ? title : eyebrow}>
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
