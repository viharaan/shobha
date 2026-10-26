'use client';

import { useState } from 'react';
import { StatusBadge } from '@/components/ui/primitives';
import { PHASES, PLC_TIERS, PROJECT, TOWERS, UNIT_TYPES } from '@/data/project';
import { FLATS } from '@/data/sobha/flats/directory';
import { compass, homePrice, resolveHome, statusForKind } from '@/lib/homes';
import { fmtCr, fmtInr } from '@/lib/scale';
import { useShortlist } from '@/lib/shortlist';
import { useUrlState } from '@/lib/useUrlState';
import { Facts, type Crumb } from './ContextUI';

const FACING_ORDER = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const FACING_NAME: Record<string, string> = { N: 'North', E: 'East', S: 'South', W: 'West', NE: 'North-east', NW: 'North-west', SE: 'South-east', SW: 'South-west' };
const FACINGS = Array.from(new Set(FLATS.map((r) => r.facing).filter((f): f is NonNullable<typeof f> => !!f))).sort((a, b) => FACING_ORDER.indexOf(a) - FACING_ORDER.indexOf(b));
const FACING_NOTE = 'Letter as printed on the sales sheet. The sheet publishes no legend; reading it as the main-door direction is an inference.';
const bedsOf = (c: string) => parseInt(c, 10);
const finishOf = (c: string) => (c.includes('Grande') ? 'Grande' : c.includes('Luxe') ? 'Luxe' : null);
const midFloor = (wing: number) => Math.round((TOWERS.find((t) => t.wing === wing)?.typicalFloors ?? 46) / 2);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

type Rec = (typeof FLATS)[number];
type Step = 'beds' | 'finish' | 'facing' | 'tower' | 'flat' | 'done';
const STEPS: Step[] = ['beds', 'finish', 'facing', 'tower', 'flat'];
const QUESTION: Record<Step, string> = { beds: 'How many bedrooms?', finish: 'Which finish?', facing: 'Which way should it face?', tower: 'Pick a tower', flat: 'Pick your home', done: 'Your home' };

/** A big choice tile: the answer, then what it leaves (count, price) underneath. */
function Tile({ title, sub, onClick, disabled, active }: { title: React.ReactNode; sub?: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-pressed={active}
      className={`group flex min-w-0 flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30 ${active ? 'border-accent bg-accent/15' : 'border-line bg-surface/60 hover:-translate-y-0.5 hover:border-accent/70 hover:bg-surface-2'}`}>
      <span className="text-sm text-fg">{title}</span>
      {sub && <span className="text-[11px] leading-snug text-fg-muted">{sub}</span>}
    </button>
  );
}

/**
 * "Configure your home" inside the stage (`find=1`, Community mode): one question at a time — bedrooms, finish,
 * facing, tower, flat — as big tiles that say how many printed homes each answer leaves and from what price. Every
 * answer moves the model: towers without a match are ghosted and the camera glides to frame the ones that remain;
 * picking a tower flies to it. Answered steps stay above as a summary with Change. Filters live in the URL as before
 * (beds, finish, facing, legacy config, wing, flat, floor); "No preference" is remembered for the visit only.
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
  const [skipped, setSkipped] = useState<Partial<Record<Step, boolean>>>({});
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
  const lit = TOWERS.filter((t) => wingCount(t.wing) > 0).map((t) => t.wing);
  const dimWings = active ? TOWERS.filter((t) => !lit.includes(t.wing)).map((t) => t.wing) : null;
  const filtered = beds !== null || !!finish || !!facing || !!config;
  // the camera frames what is left after each answer (the tower step flies to the tower itself)
  const frameWings = active && wing === null && filtered && lit.length ? lit : null;

  // which question is open: a deep link to a flat or a tower skips straight there
  const done: Record<Step, boolean> = {
    beds: wing !== null || beds !== null || !!config || !!skipped.beds,
    finish: wing !== null || !!finish || !!config || beds === 1 || !!skipped.finish,
    facing: wing !== null || !!facing || !!skipped.facing,
    tower: wing !== null,
    flat: wing !== null && flat !== null,
    done: false,
  };
  const step: Step = STEPS.find((s) => !done[s]) ?? 'done';
  const stepNo = step === 'done' ? STEPS.length : STEPS.indexOf(step);

  // Change: reopen a step and forget everything after it
  const reopen = (s: Step) => {
    const i = STEPS.indexOf(s);
    const later = STEPS.slice(i);
    setSkipped((k) => Object.fromEntries(Object.entries(k).filter(([key]) => !later.includes(key as Step))));
    set({
      flat: null,
      ...(i <= 3 ? { wing: null, floor: null } : {}),
      ...(i <= 2 ? { facing: null } : {}),
      ...(i <= 1 ? { finish: null, config: null } : {}),
      ...(i <= 0 ? { beds: null } : {}),
    });
  };
  const startOver = () => { setSkipped({}); set({ beds: null, finish: null, facing: null, config: null, wing: null, flat: null, floor: null }); };
  const skip = (s: Step) => setSkipped((k) => ({ ...k, [s]: true }));
  const exit = () => set({ find: null, flat: null });

  const crumbs: Crumb[] = [{ label: 'SOBHA OneWorld', onClick: exit }, { label: 'Configure your home', onClick: startOver }];

  const answers: { step: Step; label: string; value: string }[] = [];
  if (done.beds) answers.push({ step: 'beds', label: 'Bedrooms', value: config ?? (beds !== null ? `${beds} BHK` : 'Any') });
  if (done.finish && !config && beds !== 1) answers.push({ step: 'finish', label: 'Finish', value: finish ?? 'Any' });
  if (done.facing) answers.push({ step: 'facing', label: 'Facing', value: facing ? FACING_NAME[facing] ?? facing : 'Any' });
  if (done.tower && wing !== null) answers.push({ step: 'tower', label: 'Tower', value: `Wing ${wing}` });
  if (done.flat && flat !== null) answers.push({ step: 'flat', label: 'Home', value: `Flat ${flat}` });

  const fromPrice = (pred: (u: (typeof UNIT_TYPES)[number]) => boolean) => {
    const p = UNIT_TYPES.filter(pred).map((u) => u.avgPriceCr);
    return p.length ? `avg from ₹${Math.min(...p)} Cr` : null;
  };

  let options: React.ReactNode = null;
  if (step === 'beds') {
    options = (
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((b) => {
          const n = count('beds', (r) => bedsOf(r.config) === b);
          return <Tile key={b} title={`${b} BHK`} sub={<>{plural(n, 'home')}{fromPrice((u) => u.bedrooms === b) ? <><br />{fromPrice((u) => u.bedrooms === b)}</> : null}</>} disabled={n === 0} onClick={() => set({ beds: b, config: null, flat: null, ...(b === 1 ? { finish: null } : {}) })} />;
        })}
      </div>
    );
  } else if (step === 'finish') {
    options = (
      <div className="grid grid-cols-2 gap-2">
        {(['Grande', 'Luxe'] as const).map((f) => {
          const n = count('finish', (r) => finishOf(r.config) === f);
          const u = UNIT_TYPES.find((x) => x.tier === f && (beds === null || x.bedrooms === beds));
          const size = u ? (Array.isArray(u.sbaSqft) ? `${u.sbaSqft[0].toLocaleString('en-IN')}+ sq ft` : `${Math.round(u.sbaSqft).toLocaleString('en-IN')} sq ft`) : null;
          return <Tile key={f} title={f} sub={<>{f === 'Grande' ? 'Larger' : 'Compact'}{size ? ` · ${size}` : ''}<br />{plural(n, 'home')}{u ? ` · avg ₹${u.avgPriceCr} Cr` : ''}</>} disabled={n === 0} onClick={() => set({ finish: f, config: null, flat: null })} />;
        })}
      </div>
    );
  } else if (step === 'facing') {
    options = (
      <div className="grid grid-cols-2 gap-2">
        {FACINGS.map((f) => {
          const n = count('facing', (r) => r.facing === f);
          return <Tile key={f} title={FACING_NAME[f] ?? f} sub={plural(n, 'home')} disabled={n === 0} onClick={() => set({ facing: f, flat: null })} />;
        })}
      </div>
    );
  } else if (step === 'tower') {
    options = lit.length ? (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
        {TOWERS.filter((t) => lit.includes(t.wing)).map((t) => {
          const ph = PHASES.find((p) => p.wings.includes(t.wing));
          return <Tile key={t.wing} title={`Wing ${t.wing}`} sub={<>{plural(wingCount(t.wing), 'home')}<br />Phase {t.phase} · {ph?.handover ?? t.handover}</>} onClick={() => selectWing(t.wing)} />;
        })}
      </div>
    ) : <p className="text-xs text-fg-muted">No printed home matches these answers. Change one above.</p>;
  } else if (step === 'flat') {
    options = candidates.length ? (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {candidates.map((r) => (
          <Tile key={`${r.wing}-${r.flat}`} title={<span className="flex items-center gap-2">Flat {r.flat} <span className="text-xs text-fg-muted">{r.config}</span></span>}
            sub={<>{r.sbaSft ? `${r.sbaSft.toLocaleString('en-IN')} sq ft` : 'SBA not printed'}{r.facing ? ` · faces ${FACING_NAME[r.facing] ?? r.facing}` : ''}</>}
            onClick={() => set({ wing: r.wing, flat: r.flat, floor: floor ?? midFloor(r.wing) })} />
        ))}
      </div>
    ) : <p className="text-xs text-fg-muted">Nothing in Wing {wing} matches these answers. Change one above.</p>;
  }

  // the answer: the chosen flat, its floor and price, and what to do next
  const chosen = step === 'done' && wing !== null && flat !== null ? resolveHome({ wing, flat, floor: floor ?? midFloor(wing) }) : null;
  const price = chosen ? homePrice(chosen, plc) : null;
  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const result = chosen && (
    <div className="space-y-2.5 text-xs">
      {!chosen.record ? <p className="text-warn">Flat {chosen.ref.flat} is not printed for Wing {chosen.ref.wing}.</p> : (
        <>
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="display text-2xl leading-none text-fg">{price ? fmtCr(price.total) : '—'}</div>
              <div className="mt-1 text-fg-muted">{chosen.record.config} · {chosen.record.sbaSft ? `${chosen.record.sbaSft.toLocaleString('en-IN')} sq ft` : 'SBA not printed'}</div>
            </div>
            <StatusBadge status={statusForKind(chosen.record.kind)} />
          </div>
          <label className="block">
            <span className="label !text-[10px]">Floor {chosen.ref.floor} of {chosen.maxFloor}{chosen.refuge ? ' · refuge floor' : ''}</span>
            <input type="range" min={1} max={chosen.maxFloor} value={chosen.ref.floor} onChange={(e) => set({ floor: +e.target.value })} className="w-full" aria-label="Floor" />
          </label>
          <Facts rows={[
            ['Facing', chosen.record.facing ? <span key="f" title={FACING_NOTE}>{FACING_NAME[chosen.record.facing] ?? chosen.record.facing} (printed)</span> : '–'],
            ['Balcony', chosen.balconyBearingDeg !== null ? `≈ ${compass(chosen.balconyBearingDeg)} (estimated)` : '–'],
            ['Handover', chosen.phase ? `${chosen.phase.handover} · phase ${chosen.phase.phase}` : '–'],
            ['PLC tier', <select key="plc" value={plc} onChange={(e) => setPlc(e.target.value)} className="rounded border border-line bg-bg-2 px-1 text-xs">{PLC_TIERS.map((t) => <option key={t.tier}>{t.tier}</option>)}</select>],
          ]} />
          {price && <p className="text-[11px] text-fg-muted">Indicative: {fmtInr(price.perSqft)}/sq ft = basic {fmtInr(PROJECT.basicRatePerSqft.launch)} + floor rise + PLC; excl. taxes, parking, deposits. Per-flat PLC tier is not published.</p>}
        </>
      )}
      <div className="flex flex-wrap gap-1">
        {chosen.planId && <button type="button" className="btn btn-primary" onClick={() => set({ mode: 'home', plan: chosen.planId, find: null })}>Step inside</button>}
        <button type="button" className="btn" aria-pressed={has(chosen.ref)} onClick={() => toggle(chosen.ref)}>{has(chosen.ref) ? '★ Shortlisted' : '☆ Shortlist'}</button>
        <button type="button" className="btn" onClick={share}>{copied ? 'Link copied' : 'Copy link'}</button>
      </div>
    </div>
  );

  const card = (
    <section className="ctx-enter flex flex-col gap-3 rounded-xl border border-line bg-bg/85 p-3 shadow-2xl backdrop-blur-md" aria-label="Configure your home">
      <header>
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow !text-[10px]">Configure your home{step !== 'done' ? ` · ${stepNo + 1} of ${STEPS.length}` : ''}</span>
          <span className="tnum text-[11px] text-fg-muted">{plural(candidates.length, 'home')}</span>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden>
          {STEPS.map((s, i) => <span key={s} className={`h-0.5 flex-1 rounded transition-colors duration-300 ${i < stepNo ? 'bg-accent' : i === stepNo ? 'bg-accent/50' : 'bg-line'}`} />)}
        </div>
        <h2 key={step} className="ctx-enter display mt-2.5 text-xl leading-tight">{step === 'done' && chosen ? `Wing ${chosen.ref.wing} · Flat ${chosen.ref.flat}` : QUESTION[step]}</h2>
      </header>

      {answers.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {answers.map((a) => (
            <li key={a.step}>
              <button type="button" onClick={() => reopen(a.step)} title={`Change ${a.label.toLowerCase()}`} className="group flex items-center gap-1.5 rounded-full border border-line bg-surface/60 px-2.5 py-1 text-[11px] hover:border-accent/70">
                <span className="text-fg-muted">{a.label}</span><span className="text-fg">{a.value}</span><span className="text-fg-muted group-hover:text-accent" aria-hidden>✎</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {step !== 'done' && <div key={`o-${step}`} className="ctx-enter">{options}</div>}
      {result}

      <footer className="flex items-center justify-between gap-2 text-[11px]">
        {(step === 'beds' || step === 'finish' || step === 'facing') ? <button type="button" className="text-fg-muted underline-offset-2 hover:text-accent hover:underline" onClick={() => skip(step)}>No preference ›</button> : <span />}
        {(answers.length > 0 || filtered) && <button type="button" className="text-fg-muted underline-offset-2 hover:text-accent hover:underline" onClick={startOver}>Start over</button>}
      </footer>
    </section>
  );

  return { active, crumbs, card, dimWings, frameWings, wingCount };
}
