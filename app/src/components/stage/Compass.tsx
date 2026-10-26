'use client';

import { useSyncExternalStore } from 'react';
import { getHeading, getServerHeading, subscribeHeading } from '@/lib/heading';
import { compass } from '@/lib/homes';

/** North arrow over the stage: rotates against the camera heading so N always points to true north. Click = north-up reset. */
export function Compass({ onReset }: { onReset?: () => void }) {
  const deg = useSyncExternalStore(subscribeHeading, getHeading, getServerHeading);
  if (deg === null) return null;
  return (
    <button type="button" onClick={onReset} className="pointer-events-auto relative h-10 w-10 shrink-0 rounded-full sm:h-12 sm:w-12 border border-line bg-black/60 backdrop-blur hover:border-accent" title={`Facing ${compass(deg)} (${Math.round(deg)}°) · click to reset the view`} aria-label={`Compass, facing ${compass(deg)}. Reset the view`}>
      <svg viewBox="-24 -24 48 48" className="absolute inset-0 h-full w-full" style={{ transform: `rotate(${-deg}deg)`, transition: 'transform 80ms linear' }} aria-hidden>
        <circle r={21} fill="none" stroke="#2a3038" />
        <path d="M0 -17 L5 0 L-5 0 Z" fill="#e07a6a" />
        <path d="M0 17 L5 0 L-5 0 Z" fill="#9aa0a8" opacity={0.6} />
        <text y={-18.5} textAnchor="middle" fontSize={7} fill="#e9e6df" fontWeight={600}>N</text>
        <text x={20} y={2.5} textAnchor="middle" fontSize={6} fill="#9aa0a8">E</text>
        <text y={22.5} textAnchor="middle" fontSize={6} fill="#9aa0a8">S</text>
        <text x={-20} y={2.5} textAnchor="middle" fontSize={6} fill="#9aa0a8">W</text>
      </svg>
    </button>
  );
}
