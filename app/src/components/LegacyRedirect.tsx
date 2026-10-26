'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui/primitives';
import { buildQuery } from '@/lib/urlState';

export type LegacyRoute = 'explore' | 'plans' | 'homes' | 'compare' | 'geo';

/** Old route + its query → the single page's URL. plans' `flat=W:F` splits into wing / flat. */
export function legacyTarget(route: LegacyRoute, q: URLSearchParams): string {
  const g = (k: string) => q.get(k);
  switch (route) {
    case 'explore':
      return `/${buildQuery(null, { wing: g('wing'), floor: g('floor'), tour: g('tour'), present: g('present') })}#explore`;
    case 'plans': {
      const [wing, flat] = (g('flat') ?? '').split(':');
      return `/${buildQuery(null, { mode: 'home', plan: g('plan'), wing: wing || null, flat: flat || null, floor: g('floor'), view: g('view') ?? 'split', tour: g('tour'), present: g('present') })}#explore`;
    }
    case 'homes':
      return `/${buildQuery(null, { wing: g('wing'), config: g('config'), floor: g('floor'), flat: g('flat') })}#find`;
    case 'compare':
      return `/${buildQuery(null, { homes: g('homes') })}#compare`;
    case 'geo':
      return '/#location';
  }
}

/** Client-side redirect for the retired routes; reads the query only in the browser, so the route prerenders. */
export default function LegacyRedirect({ route }: { route: LegacyRoute }) {
  const params = useSearchParams();
  // a full navigation, so the browser lands on the section anchor itself
  useEffect(() => { window.location.replace(legacyTarget(route, params)); }, [route, params]);
  return <div className="p-6"><Spinner label="Redirecting…" /></div>;
}
