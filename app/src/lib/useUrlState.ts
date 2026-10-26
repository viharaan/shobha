'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { buildQuery, type Patch } from './urlState';

/** Read the page's query string and patch it in place (replace, no scroll). See urlState.ts for the keys. */
export function useUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = useCallback((patch: Patch) => {
    router.replace(`${pathname}${buildQuery(params, patch)}`, { scroll: false });
  }, [params, router, pathname]);
  const num = useCallback((k: string) => { const v = Number(params.get(k)); return Number.isInteger(v) && v > 0 ? v : null; }, [params]);
  return { params, set, num };
}

/** Scroll a page section into view (the stage is `explore`). */
export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
