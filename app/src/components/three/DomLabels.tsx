'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3 } from 'three';

/**
 * DOM labels for 3D points without drei <Html>.
 *
 * drei Html mounts its own React root per label and unmounts it inside a layout-effect cleanup, which React 19
 * rejects on route changes ("removeChild … not a child", "synchronously unmount a root while rendering").
 * Here the label elements are ordinary React children of the page (rendered in a layer over the canvas) and
 * register themselves by id; <LabelProjector> inside the Canvas projects each id's 3D position every frame and
 * writes the screen transform straight to the element, so no extra roots and no per-frame React renders.
 *
 * Ids are page-scoped: one registry per module is enough because a page shows one Canvas at a time.
 */
const registry = new Map<string, HTMLElement>();

export interface LabelEntry {
  id: string;
  position: [number, number, number];
}

export function DomLabel({ id, children, onClick, active, className = '' }: { id: string; children: React.ReactNode; onClick?: () => void; active?: boolean; className?: string }) {
  const base = `absolute left-0 top-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] leading-tight will-change-transform ${active ? 'border-accent bg-accent text-black' : 'border-line bg-black/70 text-fg'} ${className}`;
  const ref = (el: HTMLElement | null) => {
    if (el) registry.set(id, el);
    else registry.delete(id);
  };
  if (onClick) {
    return (
      <button type="button" ref={ref} onClick={onClick} style={{ visibility: 'hidden' }} className={`pointer-events-auto cursor-pointer ${base}`}>
        {children}
      </button>
    );
  }
  return (
    <div ref={ref} style={{ visibility: 'hidden' }} className={base}>
      {children}
    </div>
  );
}

/** Layer that sits over the canvas; pointer events pass through except on clickable labels. */
export function LabelLayer({ children }: { children: React.ReactNode }) {
  return <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={false}>{children}</div>;
}

const v = new Vector3();

export function LabelProjector({ entries, maxDistance = Infinity }: { entries: LabelEntry[]; maxDistance?: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  // keyed by element, not id: a label that unmounts and mounts again (same id) is a new, hidden element and must be placed
  const last = useRef<WeakMap<HTMLElement, string>>(new WeakMap());
  useFrame(() => {
    for (const e of entries) {
      const el = registry.get(e.id);
      if (!el) continue;
      v.set(e.position[0], e.position[1], e.position[2]);
      const dist = v.distanceTo(camera.position);
      v.project(camera);
      const visible = v.z < 1 && dist <= maxDistance && Math.abs(v.x) <= 1.2 && Math.abs(v.y) <= 1.2;
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      const next = visible ? `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)` : 'hidden';
      if (last.current.get(el) === next) continue;
      last.current.set(el, next);
      if (visible) {
        el.style.transform = next;
        el.style.visibility = 'visible';
      } else {
        el.style.visibility = 'hidden';
      }
    }
  });
  return null;
}
