import { Suspense } from 'react';
import LegacyRedirect from '@/components/LegacyRedirect';

/** Retired route: sends old links to the single page (see LegacyRedirect). */
export default function Page() {
  return <Suspense fallback={null}><LegacyRedirect route="plans" /></Suspense>;
}
