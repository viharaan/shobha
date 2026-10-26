'use client';

import { useEffect, useRef, useState } from 'react';
import { SITE_ORIGIN } from '@/data/sobha/siteFrame';
import { compass } from '@/lib/homes';
import { istDate, istDay, istHoursNow, istTodayYmd, sunPosition, sunTimes } from '@/lib/solar';

const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
/** smallest angle between two bearings, degrees */
const angleBetween = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/**
 * Sunlight for the stage (a dock popup): moves the computed sun (NOAA, at the site) through the day so the light and
 * shadows can be seen falling into the rooms, through the windows and onto the balcony. Quick times of day, three
 * reference dates, a slider and "Play the day". With the balcony's bearing it says whether direct sun is on that side.
 */
export function SunPanel({ date, hour, onDate, onHour, facing = null, note }: { date: string; hour: number; onDate: (d: string) => void; onHour: (h: number) => void; facing?: number | null; note?: string }) {
  const day = istDay(date);
  const sun = sunPosition(istDate(day, hour), SITE_ORIGIN.lat, SITE_ORIGIN.lng);
  const times = sunTimes(day, SITE_ORIGIN.lat, SITE_ORIGIN.lng);
  const rise = times.sunrise ?? 6;
  const set = times.sunset ?? 18.5;
  const year = date.slice(0, 4);

  // play the day: sunrise → sunset in about 25 s, then stop
  const [playing, setPlaying] = useState(false);
  const hourRef = useRef(hour);
  useEffect(() => { hourRef.current = hour; }, [hour]);
  useEffect(() => {
    if (!playing) return;
    if (hourRef.current >= set || hourRef.current < rise - 0.5) Promise.resolve().then(() => onHour(Math.max(5, rise - 0.25)));
    const t = window.setInterval(() => {
      const h = hourRef.current + 0.05;
      if (h >= set + 0.25) { setPlaying(false); return; }
      onHour(h);
    }, 90);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const presets: [string, number][] = [['Sunrise', rise + 0.25], ['Morning', 9], ['Noon', 12.5], ['Afternoon', 15.5], ['Sunset', set - 0.25]];
  const seasons: [string, string][] = [['21 Jun', `${year}-06-21`], ['22 Sep', `${year}-09-22`], ['21 Dec', `${year}-12-21`]];
  const up = sun.altitudeDeg > 0;
  const onBalcony = up && facing !== null && angleBetween(sun.azimuthDeg, facing) < 90;

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="display text-3xl leading-none text-fg">{hhmm(hour)}</div>
          <div className="mt-1 text-fg-muted">IST · {day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>
        <button type="button" className="btn btn-primary" aria-pressed={playing} onClick={() => setPlaying(!playing)}>{playing ? '❚❚ Pause' : '▶ Play the day'}</button>
      </div>

      <input type="range" min={5} max={20} step={0.05} value={hour} onChange={(e) => { setPlaying(false); onHour(parseFloat(e.target.value)); }} className="w-full" aria-label="Time of day (IST)" />
      <div className="flex flex-wrap gap-1">
        {presets.map(([l, h]) => <button key={l} type="button" className="btn px-2.5 py-1 text-[11px]" aria-pressed={Math.abs(hour - h) < 0.1} onClick={() => { setPlaying(false); onHour(h); }}>{l}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {seasons.map(([l, d]) => <button key={l} type="button" className="btn px-2.5 py-1 text-[11px]" aria-pressed={date === d} onClick={() => onDate(d)}>{l}</button>)}
        <input type="date" value={date} onChange={(e) => onDate(e.target.value)} className="rounded-md border border-line bg-bg-2 px-2 py-1 text-[11px]" aria-label="Date (IST)" />
        <button type="button" className="btn px-2.5 py-1 text-[11px]" onClick={() => { setPlaying(false); onDate(istTodayYmd()); onHour(Math.min(20, Math.max(5, istHoursNow()))); }}>Now</button>
      </div>

      <div className={`rounded-lg border px-3 py-2 ${onBalcony ? 'border-warn/50 bg-warn/10' : 'border-line bg-surface/60'}`}>
        <div className="text-fg">{up ? `Sun ${Math.round(sun.altitudeDeg)}° up, from the ${compass(sun.azimuthDeg)} (${Math.round(sun.azimuthDeg)}°)` : 'Sun below the horizon'}</div>
        {facing !== null && <div className="mt-0.5 text-fg-muted">{!up ? 'No direct sun.' : onBalcony ? `Direct sun on the balcony side (it faces ${compass(facing)}).` : `Balcony side (${compass(facing)}) in shade.`}</div>}
        <div className="mt-0.5 text-fg-muted">Sunrise {hhmm(rise)} · sunset {hhmm(set)}</div>
      </div>
      <p className="text-[11px] text-fg-muted">{note ?? 'Sun direction computed for the site (NOAA). Neighbouring towers are massing and finishes are illustrative, so light and shadows are indicative, not a guarantee of a view or of sunlight hours.'}</p>
    </div>
  );
}
