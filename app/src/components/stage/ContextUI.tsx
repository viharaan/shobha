'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The stage's context chrome: where you are (breadcrumb + a "‹ place ›" stepper) and a small card about the current
 * place. Each stage mode fills these from its own state, so only what matters at the current level is on screen. The
 * full list of places at this level folds away behind the stepper's list button. The same moves are on the keyboard
 * (useStageKeys). Wide screens: one column on the left, card at the bottom. Below 1024 px: stepper under the top bar,
 * card above the action bar.
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

export function ContextColumn({ crumbs, stepper, nav, card, hideCard = false, tall = false }: { crumbs: Crumb[]; stepper?: Stepper; nav?: React.ReactNode; card: React.ReactNode; hideCard?: boolean; tall?: boolean }) {
  const [listOpen, setListOpen] = useState(false);
  const showList = !!nav && (!stepper || listOpen);
  return (
    <div className={`pointer-events-none absolute inset-x-3 bottom-[4.25rem] top-[3.75rem] z-30 flex flex-col justify-between gap-2 lg:inset-x-auto lg:bottom-4 lg:left-3 lg:top-16 ${tall ? 'lg:w-[21rem] lg:justify-start' : 'lg:w-[19rem]'}`}>
      <nav aria-label="Places" className={`pointer-events-auto flex min-h-0 flex-col gap-1.5 ${showList ? 'lg:rounded-xl lg:border lg:border-line lg:bg-black/55 lg:p-2 lg:backdrop-blur-md' : ''}`}>
        <Crumbs items={crumbs} />
        {stepper && (
          <div className="flex items-center gap-1 self-start rounded-full border border-line bg-black/60 p-1 backdrop-blur-md">
            <StepBtn label="Previous" onClick={stepper.onPrev} kbd="←"><path d="m15 6-6 6 6 6" /></StepBtn>
            <span key={stepper.label} className="ctx-enter min-w-0 max-w-[14rem] truncate px-1.5 text-sm text-fg">{stepper.label}</span>
            {stepper.pos && <span className="tnum pr-1 text-[11px] text-fg-muted">{stepper.pos}</span>}
            <StepBtn label="Next" onClick={stepper.onNext} kbd="→"><path d="m9 6 6 6-6 6" /></StepBtn>
            {nav && <StepBtn label={listOpen ? 'Hide the list' : 'Show the list'} onClick={() => setListOpen(!listOpen)} pressed={listOpen}><path d="M5 7h14M5 12h14M5 17h14" /></StepBtn>}
          </div>
        )}
        {showList && nav}
      </nav>
      {!hideCard && <div className={`pointer-events-auto shrink-0 overflow-y-auto scroll-thin rounded-xl max-lg:max-w-md ${tall ? 'max-h-[62%] lg:max-h-[calc(100%-2.75rem)]' : 'max-h-[45%] lg:max-h-[60%]'}`}>{card}</div>}
    </div>
  );
}

function StepBtn({ label, onClick, children, kbd, pressed }: { label: string; onClick?: () => void; children: React.ReactNode; kbd?: string; pressed?: boolean }) {
  return (
    <button type="button" disabled={!onClick} onClick={onClick} aria-label={label} aria-pressed={pressed} title={kbd ? `${label} (${kbd})` : label}
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-30 ${pressed ? 'bg-fg text-black' : 'text-fg hover:bg-surface-2'}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
    </button>
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
