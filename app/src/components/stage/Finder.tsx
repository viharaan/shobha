'use client';

import { useState } from 'react';
import { StatusBadge } from '@/components/ui/primitives';
import { PLC_TIERS, PROJECT, TOWERS, UNIT_TYPES } from '@/data/project';
import { FLATS, UNLABELLED_WINGS } from '@/data/sobha/flats/directory';
import { compass, homePrice, resolveHome, statusForKind } from '@/lib/homes';
import { fmtCr, fmtInr } from '@/lib/scale';
import { useShortlist } from '@/lib/shortlist';
import { useUrlState } from '@/lib/useUrlState';
import { Facts, InfoCard, type Crumb } from './ContextUI';

const FACING_ORDER = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const FACING_NAME: Record<string, string> = { N: 'North', E: 'East', S: 'South', W: 'West', NE: 'North-east', NW: 'North-west', SE: 'South-east', SW: 'South-west' };
const FACINGS = Array.from(new Set(FLATS.map((r) => r.facing).filter((f): f is NonNullable<typeof f> => !!f))).sort((a, b) => FACING_ORDER.indexOf(a) - FACING_ORDER.indexOf(b));
const FACING_NOTE = 'Letter as printed on the sales sheet. The sheet publishes no legend; reading it as the main-door direction is an inference.';
const bedsOf = (c: string) => parseInt(c, 10);
const finishOf = (c: string) => (c.includes('Grande') ? 'Grande' : c.includes('Luxe') ? 'Luxe' : null);
const midFloor = (wing: number) => Math.round((TOWERS.find((t) => t.wing === wing)?.typicalFloors ?? 46) / 2);

type Rec = (typeof FLATS)[number];

/**
 * One filter as a labelled native select: quiet when unset ("Any"), gold edge when set. Option text carries the
 * match count; options that would leave nothing are disabled rather than hidden, so the choices stay stable.
 */
function FilterSelect({ label, value, onChange, options, title }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string; n?: number; disabled?: boolean }[]; title?: string }) {
  const set = value !== '';
  return (
    <label className="relative block min-w-0" title={title}>
      <span className="label pointer-events-none absolute left-2.5 top-1.5 z-10 !text-[9px] !tracking-[0.12em]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full cursor-pointer appearance-none truncate rounded-lg border bg-black/60 pb-1.5 pl-2.5 pr-7 pt-[1.15rem] text-[13px] leading-tight text-fg backdrop-blur transition-colors hover:border-accent/60 focus:outline-none focus-visible:border-accent ${set ? 'border-accent/70' : 'border-line'}`}
      >
        <option value="">Any</option>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}{o.n !== undefined ? ` · ${o.n}` : ''}</option>)}
      </select>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
    </label>
  );
}

/**
 * Find a home inside the stage (`find=1`, Community mode). Filters (bedrooms, finish, facing; legacy `config`) live in
 * the URL as before; each option shows how many printed flat positions it would leave. Towers without a match are
 * ghosted in the 3D model and their labels carry the count, so filtering lights up where the homes are. Picking a
 * tower glides the camera there and lists its flats; picking a flat gives the summary, price, shortlist and Step inside.
 * Only homes printed on the sales sheet are offered; nothing is invented for the unlabelled wings.
 */
export function useFinder({ selectWing }: { selectWing: (w: number | null) => void }) {
  const { params, set, num } = useUrlState();
  const active = params.get('find') === '1';
  const wing = num('wing');
  const flat = num('flat');
  const floor = num('floor');
  const config = params.get('config');
  const beds = num('beds');
  const finish = params.get('finish');
  const facing = params.get('facing');
  const [plc, setPlc] = useState('Select');
  const [copied, setCopied] = useState(false);
  const { has, toggle } = useShortlist();

  const matches = (r: Rec, skip?: 'wing' | 'beds' | 'finish' | 'facing') =>
    (skip === 'wing' || wing === null || r.wing === wing) &&
    (!config || r.config === config) &&
    (skip === 'beds' || beds === null || bedsOf(r.config) === beds) &&
    (skip === 'finish' || !finish || finishOf(r.config) === finish) &&
    (skip === 'facing' || !facing || r.facing === facing);
  const candidates = FLATS.filter((r) => matches(r));
  const count = (skip: 'beds' | 'finish' | 'facing', pred: (r: Rec) => boolean) => FLATS.filter((r) => matches(r, skip) && pred(r)).length;
  const wingCount = (w: number) => FLATS.filter((r) => r.wing === w && matches(r, 'wing')).length;
  const dimWings = active ? TOWERS.filter((t) => wingCount(t.wing) === 0).map((t) => t.wing) : null;
  const filtered = beds !== null || !!finish || !!facing || !!config;

  const exit = () => set({ find: null, flat: null });
  const clearFilters = () => set({ beds: null, finish: null, facing: null, config: null, flat: null });
  const pickFlat = (r: Rec) => set({ wing: r.wing, flat: r.flat, floor: floor ?? midFloor(r.wing) });

  const crumbs: Crumb[] = [{ label: 'SOBHA OneWorld', onClick: exit }, { label: 'Find a home', onClick: () => { selectWing(null); set({ flat: null }); } }];
  if (wing !== null) crumbs.push({ label: `Wing ${wing}`, onClick: () => set({ flat: null }) });
  if (wing !== null && flat !== null) crumbs.push({ label: `Flat ${flat}` });

  const nav = (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
      <FilterSelect label="Bedrooms" value={beds !== null ? String(beds) : ''}
        onChange={(v) => set({ beds: v || null, config: null, flat: null, ...(v === '1' ? { finish: null } : {}) })}
        options={[1, 2, 3, 4].map((b) => { const n = count('beds', (r) => bedsOf(r.config) === b); return { value: String(b), label: `${b} BHK`, n, disabled: n === 0 }; })} />
      <FilterSelect label="Finish" value={finish ?? ''} title="Grande = the larger plan of the same bedroom count"
        onChange={(v) => set({ finish: v || null, config: null, flat: null })}
        options={(['Grande', 'Luxe'] as const).map((f) => { const n = count('finish', (r) => finishOf(r.config) === f); return { value: f, label: f, n, disabled: n === 0 }; })} />
      <FilterSelect label="Facing" value={facing ?? ''} title={FACING_NOTE}
        onChange={(v) => set({ facing: v || null, flat: null })}
        options={FACINGS.map((f) => { const n = count('facing', (r) => r.facing === f); return { value: f, label: FACING_NAME[f] ?? f, n, disabled: n === 0 }; })} />
      <FilterSelect label="Tower" value={wing !== null ? String(wing) : ''} title="Lit towers in the model have matching homes"
        onChange={(v) => selectWing(v ? Number(v) : null)}
        options={TOWERS.map((t) => { const unl = UNLABELLED_WINGS.includes(t.wing); const n = wingCount(t.wing); return { value: String(t.wing), label: `Wing ${t.wing}${unl ? ' · not labelled' : ''}`, n: unl ? undefined : n, disabled: unl || n === 0 }; })} />
    </div>
  );

  const chosen = wing !== null && flat !== null ? resolveHome({ wing, flat, floor: floor ?? midFloor(wing) }) : null;
  const price = chosen ? homePrice(chosen, plc) : null;
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const flatList = (list: Rec[]) => (
    <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1">
      {list.map((r) => (
        <li key={`${r.wing}-${r.flat}`}>
          <button type="button" className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-2 py-1.5 text-left text-xs hover:border-accent/60" onClick={() => pickFlat(r)}>
            <span>Wing {r.wing} · Flat {r.flat} <span className="text-fg-muted">· {r.config}</span></span>
            <span className="flex items-center gap-1.5 text-fg-muted"><span className="tnum">{r.sbaSft ? `${r.sbaSft.toLocaleString('en-IN')} sq ft` : '–'}</span><span className="rounded border border-line px-1 font-mono text-[10px]" title={FACING_NOTE}>{r.facing ?? '–'}</span></span>
          </button>
        </li>
      ))}
    </ul>
  );

  let card: React.ReactNode;
  if (chosen) {
    const ref = chosen.ref;
    const planId = chosen.planId;
    card = (
      <InfoCard
        key={`home-${ref.wing}-${ref.flat}`}
        eyebrow={`Wing ${ref.wing} · Flat ${ref.flat} · Floor ${ref.floor}`}
        title={chosen.record?.config ?? `Flat ${ref.flat}`}
        badge={chosen.record ? <StatusBadge status={statusForKind(chosen.record.kind)} /> : <StatusBadge status="unverified" />}
        lead={!chosen.record ? <span className="text-warn">Flat {ref.flat} is not printed for Wing {ref.wing}.</span> : <>
          {chosen.record.sbaSft ? `${chosen.record.sbaSft.toLocaleString('en-IN')} sq ft SBA` : 'SBA not printed'}
          {chosen.record.facing ? ` · facing ${chosen.record.facing} (printed)` : ''}
          {chosen.balconyBearingDeg !== null ? ` · balcony ≈ ${compass(chosen.balconyBearingDeg)} (estimated)` : ''}
          {price ? <> · <b className="text-fg">{fmtCr(price.total)}</b> indicative</> : null}
        </>}
        details={chosen.record && (
          <div className="space-y-2">
            <label className="block">
              <span className="label !text-[10px]">Floor {ref.floor} of {chosen.maxFloor}{chosen.refuge ? ' · refuge floor' : ''}</span>
              <input type="range" min={1} max={chosen.maxFloor} value={ref.floor} onChange={(e) => set({ floor: +e.target.value })} className="w-full" aria-label="Floor" />
            </label>
            <Facts rows={[
              ['Phase', chosen.phase ? `${chosen.phase.phase} · handover ${chosen.phase.handover}` : '–'],
              ['Floor rise', `${fmtInr(chosen.floorRiseRate)}/sq ft`],
              ['Plan', chosen.record.typeCode ? `Type ${chosen.record.typeCode}${chosen.record.typeIsProxy ? ' (variant stand-in)' : ''}` : 'not drawn'],
            ]} />
            <div className="rounded-md border border-line p-2">
              <label className="label !text-[10px]">PLC tier <select value={plc} onChange={(e) => setPlc(e.target.value)} className="ml-1 rounded border border-line bg-bg-2 px-1 text-xs">{PLC_TIERS.map((t) => <option key={t.tier}>{t.tier}</option>)}</select></label>
              {price ? <div className="mt-1"><b>{fmtCr(price.total)}</b> <span className="text-fg-muted">({fmtInr(price.perSqft)}/sq ft = basic {fmtInr(PROJECT.basicRatePerSqft.launch)} + floor rise + PLC; excl. taxes, parking, deposits). Per-flat PLC tier is not published.</span></div> : <div className="mt-1 text-fg-muted">No printed SBA, so no price.</div>}
            </div>
          </div>
        )}
        actions={<>
          <button type="button" className="btn btn-primary" aria-pressed={has(ref)} onClick={() => toggle(ref)}>{has(ref) ? '★ Shortlisted' : '☆ Shortlist'}</button>
          {planId && <button type="button" className="btn" onClick={() => set({ mode: 'home', plan: planId, find: null })}>Step inside</button>}
          <button type="button" className="btn" onClick={share}>{copied ? 'Link copied' : 'Copy link'}</button>
        </>}
      />
    );
  } else if (wing !== null) {
    const list = candidates;
    card = (
      <InfoCard
        key={`wing-${wing}`}
        eyebrow="Find a home"
        title={`Wing ${wing}`}
        badge={<span className="text-[11px] text-fg-muted">{list.length} match{list.length === 1 ? '' : 'es'}</span>}
        lead={list.length ? 'Flat positions as printed on the sales sheet; typical floors repeat the stack. Pick one.' : `Nothing in Wing ${wing} matches these filters. Loosen them, or try a lit tower.`}
        details={list.length ? flatList(list) : undefined}
        detailsOpen
        actions={filtered ? <button type="button" className="btn" onClick={clearFilters}>Clear filters</button> : undefined}
      />
    );
  } else {
    const types = UNIT_TYPES.filter((u) => (beds === null || u.bedrooms === beds) && (!finish || u.tier === finish));
    const nWings = new Set(candidates.map((r) => r.wing)).size;
    card = (
      <InfoCard
        key="find"
        eyebrow="Find a home"
        title={`${candidates.length} home${candidates.length === 1 ? '' : 's'} match`}
        badge={<StatusBadge status="source" title="Flat directory read from the sales sheet of 08.08.26" />}
        lead={candidates.length ? `Across ${nWings} tower${nWings === 1 ? '' : 's'}, lit in the model. Pick a tower to see its flats, or step into a plan.` : 'No printed flat matches these filters. Loosen the size, finish or facing.'}
        detailsOpen
        details={candidates.length > 0 && candidates.length <= 6 ? flatList(candidates) : (
          <ul className="space-y-0.5">
            {types.map((u) => (
              <li key={u.code}>
                <button type="button" className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-2" onClick={() => u.planId && set({ mode: 'home', plan: u.planId, wing: null, flat: null, floor: null, find: null })} title="Step inside this plan at 1:1">
                  <span>{u.name} <span className="font-mono text-[10px] text-fg-muted">{u.code}</span></span>
                  <span className="tnum text-fg-muted">{Array.isArray(u.sbaSqft) ? `${u.sbaSqft[0].toLocaleString('en-IN')}–${u.sbaSqft[1].toLocaleString('en-IN')}` : Math.round(u.sbaSqft).toLocaleString('en-IN')} sq ft · ₹{u.avgPriceCr} Cr ›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        actions={filtered ? <button type="button" className="btn" onClick={clearFilters}>Clear filters</button> : undefined}
      />
    );
  }

  return { active, crumbs, nav, card, dimWings, wingCount };
}
