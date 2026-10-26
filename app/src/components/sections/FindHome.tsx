'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Panel, StatusBadge } from '@/components/ui/primitives';
import { PLC_TIERS, PROJECT, TOWERS } from '@/data/project';
import { FLATS, UNLABELLED_WINGS } from '@/data/sobha/flats/directory';
import { compass, homePrice, hrefForHome, hrefForPlan, hrefForSite, resolveHome, statusForKind } from '@/lib/homes';
import { fmtCr, fmtInr, sqftToSqm } from '@/lib/scale';
import { useShortlist } from '@/lib/shortlist';
import { useUrlState } from '@/lib/useUrlState';

/**
 * Find-a-home section. Guided home finder: Tower → Configuration → Floor → Flat, or any order. Every choice lives in the
 * URL (?wing&config&floor&flat) so the page is shareable and the browser back button steps back.
 * Only combinations present in the flat directory are offered; wings without labels on the sales
 * sheet are shown as such, never filled in.
 */
export default function FindHome() {
  const { params, set, num } = useUrlState();
  const wing = num('wing');
  const floor = num('floor');
  const flat = num('flat');
  const config = params.get('config'); // legacy links: an exact configuration such as 4B-Grande
  const beds = num('beds');
  const finish = params.get('finish');
  const facing = params.get('facing');
  const [plc, setPlc] = useState('Select');
  const [copied, setCopied] = useState(false);
  const { has, toggle } = useShortlist();

  // filters: bedrooms (1–4), finish (Grande / Luxe), facing letter as printed, tower; legacy `config` still narrows
  const bedsOf = (c: string) => parseInt(c, 10);
  const finishOf = (c: string) => (c.includes('Grande') ? 'Grande' : c.includes('Luxe') ? 'Luxe' : null);
  const matches = (r: (typeof FLATS)[number], skip?: 'wing' | 'beds' | 'finish' | 'facing') =>
    (skip === 'wing' || wing === null || r.wing === wing) &&
    (!config || r.config === config) &&
    (skip === 'beds' || beds === null || bedsOf(r.config) === beds) &&
    (skip === 'finish' || !finish || finishOf(r.config) === finish) &&
    (skip === 'facing' || !facing || r.facing === facing);
  const candidates = FLATS.filter((r) => matches(r));
  const count = (skip: 'wing' | 'beds' | 'finish' | 'facing', pred: (r: (typeof FLATS)[number]) => boolean) => FLATS.filter((r) => matches(r, skip) && pred(r)).length;
  const wingsWithConfig = new Set(FLATS.filter((r) => matches(r, 'wing')).map((r) => r.wing));
  const FACINGS = Array.from(new Set(FLATS.map((r) => r.facing).filter((f): f is NonNullable<typeof f> => !!f))).sort((a, b) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].indexOf(a) - ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].indexOf(b));
  const FACING_NAME: Record<string, string> = { N: 'North', E: 'East', S: 'South', W: 'West', NE: 'North-east', NW: 'North-west', SE: 'South-east', SW: 'South-west' };
  const narrowed = wing !== null || candidates.length <= 9;
  const tower = wing !== null ? TOWERS.find((t) => t.wing === wing) ?? null : null;
  const maxFloor = tower?.typicalFloors ?? 46;
  const chosen = wing !== null && flat !== null && floor !== null ? resolveHome({ wing, flat, floor }) : null;
  const price = chosen ? homePrice(chosen, plc) : null;
  const facingNote = 'Letter as printed on the sales sheet. The sheet publishes no legend; reading it as the main-door direction is an inference.';

  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <div>
      <header className="mb-6">
        <h2 className="eyebrow">Find a home</h2>
        <p className="display mt-1 text-3xl md:text-4xl">Size, finish, facing, tower, floor</p>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">Pick in any order. Only homes printed on the sales sheet are offered; nothing is invented for the rest.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Panel title="1 · Tower">
            <div className="grid grid-cols-7 gap-1">
              {TOWERS.map((t) => {
                const unl = UNLABELLED_WINGS.includes(t.wing);
                const dim = !unl && !wingsWithConfig.has(t.wing);
                return (
                  <button key={t.wing} type="button" className={`btn justify-center px-0 ${dim ? 'opacity-40' : ''}`} aria-pressed={wing === t.wing} disabled={unl} title={unl ? 'Not labelled on the sales sheet' : `Wing ${t.wing} · Phase ${t.phase} · ${t.typicalFloors} floors`} onClick={() => set({ wing: wing === t.wing ? null : t.wing, flat: null })}>
                    {t.wing}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-fg-muted">Wings {UNLABELLED_WINGS.join(', ')} carry no flat labels on the sales sheet, so they cannot be chosen yet. {tower && `Wing ${tower.wing}: Phase ${tower.phase}, handover ${tower.handover}, ${tower.typicalFloors} typical floors.`}</p>
          </Panel>

          <Panel title="2 · Size & finish">
            <div className="flex flex-wrap items-center gap-1">
              <span className="label mr-1">Bedrooms</span>
              {[1, 2, 3, 4].map((b) => {
                const n = count('beds', (r) => bedsOf(r.config) === b);
                return (
                  <button key={b} type="button" className="btn" aria-pressed={beds === b} disabled={n === 0} title={n ? `${n} flat position${n === 1 ? '' : 's'}` : 'None match the other filters'} onClick={() => set({ beds: beds === b ? null : b, config: null, flat: null, ...(b === 1 ? { finish: null } : {}) })}>
                    {b} BHK{n > 0 && <span className="ml-1 text-[10px] text-fg-muted">{n}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="label mr-1">Finish</span>
              {(['Grande', 'Luxe'] as const).map((f) => {
                const n = count('finish', (r) => finishOf(r.config) === f);
                return (
                  <button key={f} type="button" className="btn" aria-pressed={finish === f} disabled={n === 0} title={n ? `${n} flat position${n === 1 ? '' : 's'}` : 'None match the other filters'} onClick={() => set({ finish: finish === f ? null : f, config: null, flat: null })}>
                    {f}{n > 0 && <span className="ml-1 text-[10px] text-fg-muted">{n}</span>}
                  </button>
                );
              })}
              <span className="ml-2 text-[11px] text-fg-muted">Grande = larger plan of the same bedroom count; 1 BHK comes in one finish.</span>
            </div>
          </Panel>

          <Panel title="3 · Facing">
            <div className="flex flex-wrap gap-1">
              {FACINGS.map((f) => {
                const n = count('facing', (r) => r.facing === f);
                return (
                  <button key={f} type="button" className="btn" aria-pressed={facing === f} disabled={n === 0} title={`${FACING_NAME[f] ?? f} · ${n} flat position${n === 1 ? '' : 's'} · ${facingNote}`} onClick={() => set({ facing: facing === f ? null : f, flat: null })}>
                    {FACING_NAME[f] ?? f}{n > 0 && <span className="ml-1 text-[10px] text-fg-muted">{n}</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-fg-muted">{facingNote}</p>
          </Panel>

          <Panel title="4 · Floor">
            {wing === null ? (
              <p className="text-xs text-fg-muted">Choose a tower first: wings have 45 or 46 typical floors.</p>
            ) : (
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={maxFloor} value={floor ?? 1} onChange={(e) => set({ floor: +e.target.value })} className="w-full" aria-label="Floor" />
                <input type="number" min={1} max={maxFloor} value={floor ?? ''} placeholder="–" onChange={(e) => { const v = +e.target.value; set({ floor: v >= 1 && v <= maxFloor ? v : null }); }} className="w-16 rounded-md border border-line bg-bg-2 px-2 py-1 text-sm" aria-label="Floor number" />
              </div>
            )}
            {floor !== null && PROJECT.refugeFloors.includes(floor) && <p className="mt-2 text-xs text-warn">Floor {floor} carries refuge units; the sheet does not say which positions are dropped there.</p>}
          </Panel>

          <Panel title="5 · Flat" right={<span className="text-[11px] text-fg-muted">{candidates.length} match{candidates.length === 1 ? '' : 'es'}</span>}>
            {candidates.length === 0 ? (
              <p className="text-xs text-fg-muted">No flat in the directory matches these filters. Loosen the size, finish or facing{wing ? `, or try another tower` : ''}.</p>
            ) : !narrowed ? (
              <p className="text-xs text-fg-muted">{candidates.length} flat positions across {new Set(candidates.map((r) => r.wing)).size} wings match. Pick a tower, a facing or a finish to bring it down to a handful.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {candidates.map((r) => {
                  const active = r.wing === wing && r.flat === flat;
                  return (
                    <li key={`${r.wing}-${r.flat}`}>
                      <button type="button" aria-pressed={active} className={`w-full rounded-lg border p-2 text-left transition-colors ${active ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/60'}`} onClick={() => set({ wing: r.wing, flat: r.flat, floor: floor ?? Math.round((TOWERS.find((t) => t.wing === r.wing)?.typicalFloors ?? 46) / 2) })}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span>Wing {r.wing} · Flat {r.flat}</span>
                          <span className="rounded border border-line px-1.5 font-mono text-[11px]" title={facingNote}>{r.facing ?? '–'}</span>
                        </div>
                        <div className="mt-1 text-xs text-fg-muted">{r.config} · {r.sbaSft ? `${r.sbaSft.toLocaleString()} sq ft` : 'SBA not printed'}{r.typeIsProxy ? ' · plan is a variant stand-in' : ''}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-16 lg:self-start">
          {!chosen ? (
            <Panel title="Your home">
              <p className="text-xs text-fg-muted">Select a tower, a flat and a floor to see the summary, the indicative price and the 1:1 plan.</p>
              <p className="mt-2 text-[11px] text-fg-muted">{FLATS.length} flat positions across {new Set(FLATS.map((r) => r.wing)).size} labelled wings; typical floors repeat the same stack.</p>
            </Panel>
          ) : (
            <Panel title="Your home" right={chosen.record && <StatusBadge status={statusForKind(chosen.record.kind)} />}>
              <div className="text-lg leading-tight">{chosen.label}</div>
              {!chosen.record ? (
                <p className="mt-2 text-xs text-warn">Flat {chosen.ref.flat} is not printed for Wing {chosen.ref.wing}.</p>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                    <span className="rounded-full border border-line px-2 py-0.5">{chosen.record.config}</span>
                    {chosen.record.sbaSft && <span className="rounded-full border border-line px-2 py-0.5">{chosen.record.sbaSft.toLocaleString()} sq ft SBA · {sqftToSqm(chosen.record.sbaSft).toFixed(0)} m²</span>}
                    {chosen.carpetSqft && <span className="rounded-full border border-line px-2 py-0.5">{chosen.carpetSqft.toLocaleString()} sq ft carpet</span>}
                    {chosen.record.facing && <span className="rounded-full border border-line px-2 py-0.5" title={facingNote}>Facing {chosen.record.facing} (printed)</span>}
                    {chosen.balconyBearingDeg !== null && <span className="rounded-full border border-line px-2 py-0.5" title={`Estimated from the key-plan placement, confidence ${chosen.placementConfidence}`}>Balcony ≈ {compass(chosen.balconyBearingDeg)} (estimated)</span>}
                    {chosen.refuge && <span className="rounded-full border border-warn/50 px-2 py-0.5 text-warn">refuge floor</span>}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="label">Phase</dt><dd>{chosen.phase ? `${chosen.phase.phase} · handover ${chosen.phase.handover}` : '–'}</dd>
                    <dt className="label">Floor rise</dt><dd>{fmtInr(chosen.floorRiseRate)}/sq ft</dd>
                    <dt className="label">Plan</dt><dd>{chosen.record.typeCode ? `Type ${chosen.record.typeCode}${chosen.record.typeIsProxy ? ' (variant stand-in)' : ''}` : 'not drawn'}</dd>
                  </dl>
                  <div className="mt-3 rounded-md border border-line p-2 text-xs">
                    <label className="label">PLC tier <select value={plc} onChange={(e) => setPlc(e.target.value)} className="ml-1 rounded border border-line bg-bg-2 px-1 text-xs">{PLC_TIERS.map((t) => <option key={t.tier}>{t.tier}</option>)}</select></label>
                    {price ? (
                      <div className="mt-1">Indicative <b>{fmtCr(price.total)}</b> <span className="text-fg-muted">({fmtInr(price.perSqft)}/sq ft = basic {fmtInr(PROJECT.basicRatePerSqft.launch)} + floor rise + PLC; excl. taxes, parking, deposits). Per-flat PLC tier is not published.</span></div>
                    ) : (
                      <div className="mt-1 text-fg-muted">No printed SBA, so no price.</div>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-fg-muted">{facingNote}</p>
                </>
              )}
              <div className="mt-3 flex flex-wrap gap-1">
                <button type="button" className="btn btn-primary" aria-pressed={has(chosen.ref)} onClick={() => toggle(chosen.ref)}>{has(chosen.ref) ? '★ Shortlisted' : '☆ Shortlist'}</button>
                {hrefForPlan(chosen) && <Link href={hrefForPlan(chosen)!} className="btn no-underline">Open 1:1 plan</Link>}
                <Link href={hrefForSite(chosen.ref)} className="btn no-underline">Show in site</Link>
                <button type="button" className="btn" onClick={share}>{copied ? 'Link copied' : 'Copy link'}</button>
              </div>
            </Panel>
          )}
          <Panel title="Shortlist">
            <ShortlistList />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function ShortlistList() {
  const { items, remove } = useShortlist();
  if (items.length === 0) return <p className="text-xs text-fg-muted">Nothing yet. Shortlist homes to compare them side by side.</p>;
  return (
    <ul className="space-y-1 text-xs">
      {items.map((h) => {
        const v = resolveHome(h);
        return (
          <li key={`${h.wing}-${h.flat}-${h.floor}`} className="flex items-center justify-between gap-2">
            <Link href={hrefForHome(h)} className="truncate">{v.label}{v.record ? ` · ${v.record.config}` : ''}</Link>
            <button type="button" className="btn px-1.5" aria-label={`Remove ${v.label}`} onClick={() => remove(h)}>×</button>
          </li>
        );
      })}
      <li><Link href="/#compare" className="btn mt-1 no-underline">Compare {items.length}</Link></li>
    </ul>
  );
}
