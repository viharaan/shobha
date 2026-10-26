'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Panel, StatusBadge } from '@/components/ui/primitives';
import { compass, homePrice, hrefForHome, hrefForPlan, hrefForSite, resolveHome, statusForKind } from '@/lib/homes';
import { fmtCr, fmtInr } from '@/lib/scale';
import { homeKey, parseHomeKey, useShortlist, type HomeRef } from '@/lib/shortlist';

/**
 * Side-by-side comparison. Reads the browser shortlist, or a shared list from ?homes=1-5-12,2-1-20
 * (wing-flat-floor), which can be merged into the local shortlist with one click.
 */
export default function CompareSection() {
  const params = useSearchParams();
  const { items, remove, clear, addMany } = useShortlist();
  const [copied, setCopied] = useState(false);
  const shared = (params.get('homes') ?? '').split(',').map(parseHomeKey).filter((h): h is HomeRef => !!h);
  const list = shared.length > 0 ? shared : items;
  const homes = list.map(resolveHome);

  const share = async () => {
    const url = `${window.location.origin}/?homes=${list.map(homeKey).join(',')}#compare`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const rows: { label: string; cell: (v: ReturnType<typeof resolveHome>) => React.ReactNode }[] = [
    { label: 'Configuration', cell: (v) => v.record?.config ?? '–' },
    { label: 'SBA (printed)', cell: (v) => (v.record?.sbaSft ? `${v.record.sbaSft.toLocaleString()} sq ft` : '–') },
    { label: 'Carpet', cell: (v) => (v.carpetSqft ? `${v.carpetSqft.toLocaleString()} sq ft` : '–') },
    { label: 'Floor', cell: (v) => `${v.ref.floor} of ${v.maxFloor}${v.refuge ? ' · refuge floor' : ''}` },
    { label: 'Facing (printed)', cell: (v) => v.record?.facing ?? '–' },
    { label: 'Balcony (estimated)', cell: (v) => (v.balconyBearingDeg !== null ? `${compass(v.balconyBearingDeg)} · ${v.placementConfidence}` : '–') },
    { label: 'Floor rise', cell: (v) => `${fmtInr(v.floorRiseRate)}/sq ft` },
    { label: 'Indicative price (Select PLC)', cell: (v) => { const p = homePrice(v); return p ? fmtCr(p.total) : '–'; } },
    { label: 'Phase · handover', cell: (v) => (v.phase ? `${v.phase.phase} · ${v.phase.handover}` : '–') },
    { label: 'Plan', cell: (v) => (v.record?.typeCode ? `Type ${v.record.typeCode}${v.record.typeIsProxy ? ' (stand-in)' : ''}` : '–') },
    { label: 'Data', cell: (v) => (v.record ? <StatusBadge status={statusForKind(v.record.kind)} /> : <StatusBadge status="unverified" />) },
  ];

  // nothing shortlisted: one quiet line instead of a whole empty section
  if (homes.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="eyebrow">Compare</h2>
          <p className="mt-1 text-sm text-fg-muted">Shortlist homes with ☆ in the stage or in Find a home, and they line up here side by side.</p>
        </div>
        <Link href="/#find" className="btn no-underline">Find a home</Link>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="eyebrow">Compare</h2>
          <p className="display mt-1 text-3xl md:text-4xl">Your shortlist, side by side</p>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">{shared.length > 0 ? 'A shared list. ' : ''}Prices are indicative; areas are as printed; balcony direction is estimated from the key-plan placement.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {shared.length > 0 && <button type="button" className="btn btn-primary" onClick={() => addMany(shared)}>Add all to my shortlist</button>}
          {list.length > 0 && <button type="button" className="btn" onClick={share}>{copied ? 'Link copied' : 'Copy share link'}</button>}
          {shared.length === 0 && items.length > 0 && <button type="button" className="btn" onClick={clear}>Clear shortlist</button>}
          <Link href="/#find" className="btn no-underline">Find more</Link>
        </div>
      </header>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr>
                <th className="label sticky left-0 z-10 bg-surface py-2 pr-3 text-left">Home</th>
                {homes.map((v) => (
                  <th key={homeKey(v.ref)} className="py-2 text-left align-top">
                    <Link href={hrefForHome(v.ref)} className="text-sm text-fg">{v.label}</Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {hrefForPlan(v) && <Link href={hrefForPlan(v)!} className="btn no-underline">1:1 plan</Link>}
                      <Link href={hrefForSite(v.ref)} className="btn no-underline">Site</Link>
                      {shared.length === 0 && <button type="button" className="btn" onClick={() => remove(v.ref)} aria-label={`Remove ${v.label}`}>×</button>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <td className="label sticky left-0 z-10 bg-surface py-2 pr-3">{r.label}</td>
                  {homes.map((v) => <td key={homeKey(v.ref)} className="py-2 pr-3 align-top">{r.cell(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
