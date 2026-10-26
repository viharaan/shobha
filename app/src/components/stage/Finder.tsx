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

function Chip({ on, n, disabled, onClick, children, title }: { on: boolean; n?: number; disabled?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" className={`btn shrink-0 whitespace-nowrap px-2.5 py-1.5 text-xs max-lg:bg-black/60 max-lg:backdrop-blur ${disabled ? 'opacity-40' : ''}`} aria-pressed={on} disabled={disabled} onClick={onClick} title={title}>
      {children}{n !== undefined && n > 0 && <span className={`text-[10px] ${on ? 'text-black/60' : 'text-fg-muted'}`}>{n}</span>}
    </button>
  );
}

/**
 * Find a home inside the stage (`find=1`, Community mode). Filters (bedrooms, finish, facing; legacy `config`) live in
 * the URL as before; every chip shows how many printed flat positions it would leave. Towers without a match are
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
    <div className="flex min-h-0 flex-col gap-1.5 lg:gap-2.5">
      <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] lg:flex-col lg:gap-2.5 lg:overflow-visible lg:pb-0">
        <div className="flex shrink-0 items-center gap-1 lg:flex-wrap">
          <span className="label w-full px-1 max-lg:hidden">Bedrooms</span>
          {[1, 2, 3, 4].map((b) => {
            const n = count('beds', (r) => bedsOf(r.config) === b);
            return <Chip key={b} on={beds === b} n={n} disabled={n === 0} onClick={() => set({ beds: beds === b ? null : b, config: null, flat: null, ...(b === 1 ? { finish: null } : {}) })}>{b} BHK</Chip>;
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1 lg:flex-wrap">
          <span className="label w-full px-1 max-lg:hidden">Finish</span>
          {(['Grande', 'Luxe'] as const).map((f) => {
            const n = count('finish', (r) => finishOf(r.config) === f);
            return <Chip key={f} on={finish === f} n={n} disabled={n === 0} onClick={() => set({ finish: finish === f ? null : f, config: null, flat: null })} title="Grande = the larger plan of the same bedroom count">{f}</Chip>;
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1 lg:flex-wrap">
          <span className="label w-full px-1 max-lg:hidden">Facing (printed)</span>
          {FACINGS.map((f) => {
            const n = count('facing', (r) => r.facing === f);
            return <Chip key={f} on={facing === f} n={n} disabled={n === 0} onClick={() => set({ facing: facing === f ? null : f, flat: null })} title={FACING_NOTE}>{FACING_NAME[f] ?? f}</Chip>;
          })}
        </div>
      </div>
      <div>
        <div className="label px-1 pb-1 max-lg:hidden">Towers · lit ones have matches</div>
        <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] lg:grid lg:grid-cols-7 lg:overflow-visible lg:pb-0">
          {TOWERS.map((t) => {
            const unl = UNLABELLED_WINGS.includes(t.wing);
            const n = wingCount(t.wing);
            return (
              <button key={t.wing} type="button" disabled={unl} aria-pressed={wing === t.wing} onClick={() => selectWing(wing === t.wing ? null : t.wing)} title={unl ? 'Not labelled on the sales sheet' : `Wing ${t.wing} · ${n} matching flat position${n === 1 ? '' : 's'}`}
                className={`btn shrink-0 flex-col gap-0.5 px-2 py-1 max-lg:flex-row max-lg:bg-black/60 lg:justify-center lg:px-0 ${n === 0 ? 'opacity-35' : ''}`}>
                <span className="max-lg:hidden">{t.wing}</span><span className="lg:hidden">Wing {t.wing}</span>
                <span className={`text-[9px] leading-none ${wing === t.wing ? 'text-black/60' : 'text-fg-muted'}`}>{unl ? '–' : n}</span>
              </button>
            );
          })}
        </div>
      </div>
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
