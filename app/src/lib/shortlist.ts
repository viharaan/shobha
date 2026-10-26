'use client';

import { useSyncExternalStore } from 'react';

/**
 * Shortlist of homes, persisted per browser in localStorage (no account, no server).
 * A home is (wing, flat on the typical floor, floor). External store + useSyncExternalStore so
 * every component sees the same list and no effects are needed.
 */
export interface HomeRef {
  wing: number;
  flat: number;
  floor: number;
}

const KEY = 'shobha.shortlist.v1';
const EMPTY: readonly HomeRef[] = Object.freeze([]);
const listeners = new Set<() => void>();
let cache: readonly HomeRef[] | null = null;

export const homeKey = (h: HomeRef) => `${h.wing}-${h.flat}-${h.floor}`;

export function parseHomeKey(k: string): HomeRef | null {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(k.trim());
  return m ? { wing: +m[1], flat: +m[2], floor: +m[3] } : null;
}

function read(): readonly HomeRef[] {
  if (cache) return cache;
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    cache = Array.isArray(arr) ? arr.filter((h): h is HomeRef => !!h && Number.isInteger(h.wing) && Number.isInteger(h.flat) && Number.isInteger(h.floor)) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: readonly HomeRef[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: list lives for this page only */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; l(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(l); window.removeEventListener('storage', onStorage); };
}

export function useShortlist() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  const has = (h: HomeRef) => items.some((x) => homeKey(x) === homeKey(h));
  return {
    items,
    has,
    add: (h: HomeRef) => { if (!has(h)) write([...items, h]); },
    remove: (h: HomeRef) => write(items.filter((x) => homeKey(x) !== homeKey(h))),
    toggle: (h: HomeRef) => (has(h) ? write(items.filter((x) => homeKey(x) !== homeKey(h))) : write([...items, h])),
    clear: () => write([]),
    addMany: (hs: HomeRef[]) => { const seen = new Set(items.map(homeKey)); write([...items, ...hs.filter((h) => !seen.has(homeKey(h)))]); },
  };
}
