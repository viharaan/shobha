'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { buildQuery, type Patch } from './urlState';

/**
 * The last query sent: patches that follow within a moment (two quick arrow keys) build on it rather than on the
 * rendered params, which may still be the query from before the first patch landed. After that the live params win
 * again, so links and back / forward navigation are never overridden by a stale patch.
 */
let pending: { q: string; t: number } | null = null;
const CHAIN_MS = 600;

/** Read the page's query string and patch it in place (replace, no scroll). See urlState.ts for the keys. */
export function useUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  /** the query as it will be once the patches just sent land (for steps that build on the current value, e.g. floor + 1) */
  const latest = useCallback(() => (pending && performance.now() - pending.t < CHAIN_MS ? new URLSearchParams(pending.q) : params), [params]);
  const set = useCallback((patch: Patch) => {
    const base = latest();
    const q = buildQuery(base, patch);
    pending = { q: q.slice(1), t: performance.now() };
    router.replace(`${pathname}${q}`, { scroll: false });
  }, [latest, router, pathname]);
  const num = useCallback((k: string) => { const v = Number(params.get(k)); return Number.isInteger(v) && v > 0 ? v : null; }, [params]);
  return { params, set, num, latest };
}

/** Scroll a page section into view (the stage is `explore`). */
export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
