'use client';

import { useEffect, useState } from 'react';

export interface DockTab {
  id: string;
  label: string;
  /** a broader choice: opens as a popup above the dock */
  panel?: React.ReactNode;
  /** a direct action: runs on click, no popup */
  onClick?: () => void;
  /** shows the tab as on (e.g. Walk) */
  pressed?: boolean;
  disabled?: boolean;
  title?: string;
}

export interface DockCurrent {
  label: string;
  pos?: string;
  onPrev?: () => void;
  onNext?: () => void;
}

const Chevron = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

/**
 * The stage's one control surface, a dock at the bottom centre. Collapsed it is a stepper: ‹ where you are › (the
 * arrows step through the places at this level, as the arrow keys do); tapping the middle opens a strip of tabs for
 * this mode. A tab is either an action (tour, walk, VR) or a broader choice that opens as a popup above the dock
 * (configure your home, this home, view options). `openTab` / `onOpenTab` let a mode drive the popup from the URL.
 * Esc closes the popup before the stage's own Esc (step back) sees it.
 */
export function Dock({ current, tabs, openTab: ctlOpen, onOpenTab, extra }: { current: DockCurrent; tabs: DockTab[]; openTab?: string | null; onOpenTab?: (id: string | null) => void; extra?: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [ownOpen, setOwnOpen] = useState<string | null>(null);
  const open = ctlOpen !== undefined ? ctlOpen : ownOpen;
  const setOpen = (id: string | null) => { if (onOpenTab) onOpenTab(id); if (ctlOpen === undefined) setOwnOpen(id); };
  const tab = tabs.find((t) => t.id === open && t.panel);
  const showTabs = expanded || !!tab;

  useEffect(() => {
    if (!tab) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-4 z-40 flex flex-col items-center gap-2">
      {tab && (
        <section key={tab.id} className="ctx-enter pointer-events-auto flex max-h-[min(62svh,34rem)] w-full max-w-[26rem] flex-col lg:max-h-[calc(100svh-12.5rem)] lg:w-[24rem] overflow-hidden glass-strong rounded-[1.75rem]" aria-label={tab.label}>
          <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
            <h2 className="label !text-[10px] !tracking-[0.18em] text-fg">{tab.label}</h2>
            <button type="button" className="grid h-7 w-7 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg" onClick={() => setOpen(null)} aria-label="Close" title="Close (Esc)">
              <Chevron d="M6 6l12 12M18 6 6 18" />
            </button>
          </header>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">{tab.panel}</div>
        </section>
      )}

      <div className="pointer-events-auto flex max-w-full items-center gap-1 glass rounded-full p-1">
        <DockBtn label="Previous" onClick={current.onPrev}><Chevron d="m15 6-6 6 6 6" /></DockBtn>
        {showTabs ? (
          <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Stage controls">
            {tabs.map((t) => {
              const on = t.panel ? open === t.id : !!t.pressed;
              return (
                <button key={t.id} type="button" role="tab" aria-selected={on} disabled={t.disabled} title={t.title}
                  onClick={() => { if (t.panel) setOpen(open === t.id ? null : t.id); else t.onClick?.(); }}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[11px] uppercase tracking-[0.14em] transition-colors disabled:opacity-35 ${on ? 'bg-fg text-black' : 'text-fg/80 hover:bg-white/10 hover:text-fg'}`}>
                  {t.label}
                </button>
              );
            })}
            {extra}
            <DockBtn label="Collapse" onClick={() => { setExpanded(false); setOpen(null); }}><Chevron d="M6 6l12 12M18 6 6 18" /></DockBtn>
          </div>
        ) : (
          <button type="button" onClick={() => setExpanded(true)} aria-expanded={false} title="Show controls"
            className="flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 hover:bg-white/10">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-accent/70 text-accent" aria-hidden>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </span>
            <span key={current.label} className="ctx-enter max-w-[13rem] truncate text-sm text-fg">{current.label}</span>
            {current.pos && <span className="tnum text-[11px] text-fg-muted">{current.pos}</span>}
          </button>
        )}
        <DockBtn label="Next" onClick={current.onNext}><Chevron d="m9 6 6 6-6 6" /></DockBtn>
      </div>
    </div>
  );
}

function DockBtn({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" disabled={!onClick} onClick={onClick} aria-label={label} title={label}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg transition-colors hover:bg-white/10 disabled:opacity-30">
      {children}
    </button>
  );
}

/** A list of choices inside a dock popup. */
export function ChoiceList({ items }: { items: { key: string | number; label: React.ReactNode; meta?: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((it) => (
        <li key={it.key}>
          <button type="button" disabled={it.disabled} aria-current={it.active ? 'true' : undefined} onClick={it.onClick}
            className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-35 ${it.active ? 'bg-accent/15 text-accent' : 'text-fg hover:bg-surface-2'}`}>
            <span className="min-w-0 truncate">{it.label}</span>
            {it.meta !== undefined && <span className={`shrink-0 text-[11px] ${it.active ? 'text-accent/80' : 'text-fg-muted'}`}>{it.meta}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
