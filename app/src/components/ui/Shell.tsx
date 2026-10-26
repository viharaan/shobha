'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useShortlist } from '@/lib/shortlist';

/** Sections of the single page, in order; the header highlights the one in view. */
const SECTIONS = [
  { id: 'explore', label: 'Explore' },
  { id: 'find', label: 'Find a home' },
  { id: 'compare', label: 'Compare' },
  { id: 'location', label: 'Location' },
  { id: 'community', label: 'Community' },
];

/** Which section is in view: the last one whose top has passed 40 % of the viewport. Only meaningful on `/`. */
function useActiveSection(enabled: boolean) {
  const [active, setActive] = useState('explore');
  useEffect(() => {
    if (!enabled) return;
    const pick = () => {
      const y = window.innerHeight * 0.4;
      let cur = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= y) cur = s.id;
      }
      setActive(cur);
    };
    const raf = requestAnimationFrame(pick);
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('resize', pick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', pick); window.removeEventListener('resize', pick); };
  }, [enabled]);
  return active;
}

/** Floating arrow that returns to the top once the stage has scrolled away. */
function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show) return null;
  return (
    <button type="button" className="btn fixed bottom-5 right-5 z-40 h-11 w-11 justify-center rounded-full text-lg shadow-xl" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="Back to top" aria-label="Back to top">↑</button>
  );
}

function ShortlistChip({ active }: { active: boolean }) {
  const { items } = useShortlist();
  return (
    <Link href="/#compare" aria-current={active ? 'page' : undefined} className={`ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm no-underline transition-colors ${active ? 'border-accent bg-accent text-black' : 'border-line text-fg-muted hover:border-accent hover:text-fg'}`} title="Shortlist and compare">
      <span aria-hidden>☆</span>
      <span className="hidden sm:inline">Shortlist</span>
      <span className={`min-w-5 rounded-full px-1.5 text-center text-[11px] ${active ? 'bg-black/20' : 'bg-surface-2'}`}>{items.length}</span>
    </Link>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const onHome = path === '/';
  const section = useActiveSection(onHome);
  const linkClass = (active: boolean) => `whitespace-nowrap rounded-md px-2 py-1.5 text-sm no-underline transition-colors sm:px-3 ${active ? 'bg-surface-2 text-accent' : 'text-fg-muted hover:text-fg'}`;
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center justify-between gap-3 px-3 sm:gap-6 sm:px-4 md:px-6">
          <Link href="/" className="flex items-baseline gap-2 no-underline">
            <span className="text-[12px] tracking-[0.25em] text-fg sm:text-[13px] sm:tracking-[0.35em]">SOBHA</span>
            <span className="text-[12px] tracking-[0.15em] text-accent sm:text-[13px] sm:tracking-[0.2em]">ONEWORLD</span>
            <span className="label hidden whitespace-nowrap lg:inline">Spatial Explorer</span>
          </Link>
          <nav aria-label="Primary" className="scroll-thin flex min-w-0 items-center gap-0.5 overflow-x-auto max-lg:[scrollbar-width:none] sm:gap-1">
            {SECTIONS.map((s) => {
              const active = onHome && section === s.id;
              return <Link key={s.id} href={`/#${s.id}`} aria-current={active ? 'location' : undefined} className={linkClass(active)}>{s.label}</Link>;
            })}
            <Link href="/media" aria-current={path.startsWith('/media') ? 'page' : undefined} className={linkClass(path.startsWith('/media'))}>Media</Link>
            <ShortlistChip active={onHome && section === 'compare'} />
          </nav>
        </div>
      </header>
      {/* no flex-1 / min-h-0: a column-flex body would clamp main to one viewport and the sticky header would stop after it */}
      <main className="flex flex-col">{children}</main>
      <BackToTop />
    </>
  );
}
