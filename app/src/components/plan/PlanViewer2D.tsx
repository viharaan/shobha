'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlanRecord, PlanRoom } from '@/data/types';
import { navPose, subscribeNavPose } from '@/lib/navPose';

export type PlanTool = 'pan' | 'measure' | 'calibrate';
export type Pt = [number, number];

export interface PlanViewer2DProps {
  plan: PlanRecord;
  mPerUnit: number;
  tool: PlanTool;
  points: Pt[];
  onPointsChange: (p: Pt[]) => void;
  focusRoom: PlanRoom | null;
  onFocusRoom: (r: PlanRoom | null) => void;
  showRooms: boolean;
  /** plan north, degrees clockwise from page-up; null/undefined = unknown (no arrow) */
  northDeg?: number | null;
  /** guided tour: the focused room gets a red pin instead of the gold dot */
  beacon?: boolean;
  /** pan tool: a plain click on the plan (PDF points) — the page maps it to a room and moves the 3D view there */
  onPick?: (p: Pt) => void;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Initial view: the wall bbox filling the viewBox with a margin. */
function fitView(plan: PlanRecord) {
  const [, , vbw, vbh] = plan.viewBox;
  const [x0, y0, x1, y1] = plan.wallBboxPt;
  const pad = 30;
  const k = Math.min(vbw / (x1 - x0 + pad * 2), vbh / (y1 - y0 + pad * 2));
  return { k, x: vbw / 2 - ((x0 + x1) / 2) * k, y: vbh / 2 - ((y0 + y1) / 2) * k };
}

/**
 * The vector plan is shown as-is (an <image> of the SVG inside an <svg> with the PDF's viewBox), so every
 * click maps back to PDF points through getScreenCTM(). All overlays live in the same coordinate space.
 */
export function PlanViewer2D({ plan, mPerUnit, tool, points, onPointsChange, focusRoom, onFocusRoom, showRooms, northDeg = null, beacon = false, onPick }: PlanViewer2DProps) {
  const gRef = useRef<SVGGElement>(null);
  const meRef = useRef<SVGGElement>(null);
  const [view, setView] = useState(() => fitView(plan));
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [vb0, vb1, vbw, vbh] = plan.viewBox;

  const toUser = useCallback((e: { clientX: number; clientY: number }): Pt | null => {
    const g = gRef.current;
    if (!g) return null;
    const m = g.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }, []);

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); // svg viewBox coords
    const f = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const k = Math.min(40, Math.max(0.3, v.k * f));
      const r = k / v.k;
      return { k, x: p.x - (p.x - v.x) * r, y: p.y - (p.y - v.y) * r };
    });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const svg = e.currentTarget;
    const m = svg.getScreenCTM();
    if (!m) return;
    const dx = (e.clientX - d.x) / m.a;
    const dy = (e.clientY - d.y) / m.d;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const p = toUser(e);
    if (!p) return;
    if (tool === 'pan') { onPick?.(p); return; }
    onPointsChange(points.length >= 2 ? [p] : [...points, p]);
  };

  // live red "you are here" (orbit camera / walker / VR head) from the shared navPose store, written to the DOM directly
  useEffect(() => {
    const [bx0, by0, bx1, by1] = plan.wallBboxPt;
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
    const update = () => {
      const el = meRef.current;
      if (!el) return;
      if (!navPose.valid) { el.setAttribute('visibility', 'hidden'); return; }
      const x = Math.min(bx1 + 30, Math.max(bx0 - 30, navPose.x / mPerUnit + cx));
      const y = Math.min(by1 + 30, Math.max(by0 - 30, navPose.z / mPerUnit + cy));
      const deg = (Math.atan2(navPose.fx, -navPose.fz) * 180) / Math.PI;
      el.setAttribute('transform', `translate(${x} ${y}) rotate(${deg}) scale(${1 / view.k})`);
      el.setAttribute('visibility', 'visible');
    };
    update();
    return subscribeNavPose(update);
  }, [plan, mPerUnit, view.k]);

  const [wx0, wy0, wx1, wy1] = plan.wallBboxPt;
  const barPt = 5000 / (mPerUnit * 1000); // 5 m scale bar in user units
  const fontPt = 7 / view.k;

  return (
    <svg
      viewBox={`${vb0} ${vb1} ${vbw} ${vbh}`}
      className={`h-full w-full touch-none select-none bg-black ${tool === 'pan' ? 'cursor-grab' : 'cursor-crosshair'}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="img"
      aria-label={`${plan.name} floor plan, 2D`}
    >
      <g ref={gRef} transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
        <image href={plan.svg} x={0} y={0} width={vbw} height={vbh} />
        <rect x={wx0} y={wy0} width={wx1 - wx0} height={wy1 - wy0} fill="none" stroke="#c9a96e" strokeOpacity={0.35} strokeWidth={0.8 / view.k} strokeDasharray={`${4 / view.k} ${3 / view.k}`} />

        {/* 5 m scale bar */}
        <g transform={`translate(${wx0} ${wy1 + 14})`}>
          <line x1={0} y1={0} x2={barPt} y2={0} stroke="#c9a96e" strokeWidth={1.5 / view.k} />
          <line x1={0} y1={-3} x2={0} y2={3} stroke="#c9a96e" strokeWidth={1 / view.k} />
          <line x1={barPt} y1={-3} x2={barPt} y2={3} stroke="#c9a96e" strokeWidth={1 / view.k} />
          <text x={barPt / 2} y={-4} fill="#c9a96e" fontSize={fontPt} textAnchor="middle">5 m</text>
        </g>

        {showRooms && plan.rooms.map((r, i) => {
          const active = focusRoom === r;
          return (
            <g key={i} onClick={(e) => { e.stopPropagation(); onFocusRoom(active ? null : r); }} style={{ cursor: 'pointer' }}>
              <circle cx={r.labelPt[0]} cy={r.labelPt[1]} r={active && beacon ? 8 / view.k : 5 / view.k} fill={active ? (beacon ? '#ff3b30' : '#c9a96e') : 'rgba(201,169,110,0.25)'} stroke={active && beacon ? '#ffffff' : '#c9a96e'} strokeWidth={(active && beacon ? 1.6 : 0.8) / view.k} />
            </g>
          );
        })}

        <g ref={meRef} visibility="hidden" pointerEvents="none" aria-label="Your position in the 3D view">
          <path d="M0 -11 L4 -3 L-4 -3 Z" fill="#ff3b30" stroke="#000" strokeWidth={0.8} />
          <circle r={4.5} fill="#ff3b30" stroke="#fff" strokeWidth={1.2} />
        </g>

        {points.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={3.5 / view.k} fill={tool === 'calibrate' ? '#7fb2e0' : '#6fbf8a'} stroke="#000" strokeWidth={0.6 / view.k} />
        ))}
        {points.length === 2 && (
          <g>
            <line x1={points[0][0]} y1={points[0][1]} x2={points[1][0]} y2={points[1][1]} stroke={tool === 'calibrate' ? '#7fb2e0' : '#6fbf8a'} strokeWidth={1.2 / view.k} />
            <text x={(points[0][0] + points[1][0]) / 2} y={(points[0][1] + points[1][1]) / 2 - 4 / view.k} fill="#fff" fontSize={fontPt} textAnchor="middle" stroke="#000" strokeWidth={0.5 / view.k} paintOrder="stroke">
              {(dist(points[0], points[1]) * mPerUnit).toFixed(2)} m
            </text>
          </g>
        )}
      </g>
      {northDeg !== null && (
        <g transform={`translate(${vb0 + vbw - 26} ${vb1 + 26})`} pointerEvents="none" aria-label={`North arrow, ${Math.round(northDeg)} degrees from page-up`}>
          <circle r={18} fill="rgba(0,0,0,0.55)" stroke="#2a3038" strokeWidth={0.8} />
          <g transform={`rotate(${northDeg})`}>
            <path d="M0 -13 L4 0 L-4 0 Z" fill="#e07a6a" />
            <path d="M0 13 L4 0 L-4 0 Z" fill="#9aa0a8" opacity={0.6} />
            <text y={-14} textAnchor="middle" fontSize={5.5} fill="#e9e6df" fontWeight={600}>N</text>
          </g>
        </g>
      )}
    </svg>
  );
}
