'use client';

import { useEffect, useRef, useState } from 'react';
import type { TourStop } from '@/lib/tour';

/**
 * Guided-tour strip over a canvas: title + caption of the current stop, step counter, Prev / Next,
 * Play (auto-advance), Voice, Exit, and at the last stop an optional hand-off link.
 *
 * Narration: a pre-generated clip at /narration/<audioId>.mp3 (ElevenLabs, built once by
 * `npm run narration`) when it exists, otherwise the browser's speech synthesis reading the same
 * line. When a clip plays, auto-advance waits for it to finish; otherwise it uses the stop's dwell.
 * Browsers block audio until the page has been tapped, so a tour opened straight from a link may
 * need one click on Voice.
 */
export function TourBar({ stops, index, onIndex, onExit, handoff }: {
  stops: TourStop[];
  index: number;
  onIndex: (i: number) => void;
  onExit: () => void;
  handoff?: { label: string; onClick: () => void } | null;
}) {
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(playing);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  const [replay, setReplay] = useState(0); // bumped on resume when the narration has to start over
  // voice defaults on; the stored 'off' preference is applied after mount so server and client HTML match
  const [voice, setVoice] = useState(true);
  useEffect(() => {
    let off = false;
    try { off = window.localStorage.getItem('shobha.tour.voice') === 'off'; } catch { /* ignore */ }
    if (off) Promise.resolve().then(() => setVoice(false));
  }, []);
  const [blocked, setBlocked] = useState(false);
  const [clips, setClips] = useState<Set<string> | null>(null);
  const [ended, setEnded] = useState<string | null>(null); // audioId whose clip finished
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = stops[index];
  const last = index >= stops.length - 1;
  const [canSpeak, setCanSpeak] = useState(false);
  useEffect(() => { if ('speechSynthesis' in window) Promise.resolve().then(() => setCanSpeak(true)); }, []);

  // which clips exist (index.json is written by the narration build; missing = browser voice)
  useEffect(() => {
    let alive = true;
    fetch('/narration/index.json').then((r) => (r.ok ? r.json() : { ids: [] })).then((j: { ids?: string[] }) => alive && setClips(new Set(j.ids ?? []))).catch(() => alive && setClips(new Set()));
    return () => { alive = false; };
  }, []);

  // narrate the current stop
  useEffect(() => {
    if (!stop || clips === null) return;
    const synth = canSpeak ? window.speechSynthesis : null;
    audio.current?.pause();
    audio.current = null;
    synth?.cancel();
    if (!voice || !playingRef.current) return; // paused: stay silent until Play
    if (clips.has(stop.audioId)) {
      const a = new Audio(`/narration/${stop.audioId}.mp3`);
      audio.current = a;
      a.onended = () => setEnded(stop.audioId);
      a.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
      return () => { a.pause(); a.onended = null; };
    }
    if (synth) {
      const u = new SpeechSynthesisUtterance(stop.narration);
      const voices = synth.getVoices();
      u.voice = voices.find((v) => v.lang === 'en-IN') ?? voices.find((v) => v.lang.startsWith('en-GB')) ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
      u.rate = 0.98;
      u.onend = () => setEnded(stop.audioId);
      synth.speak(u);
      return () => synth.cancel();
    }
  }, [voice, stop, clips, canSpeak, replay]);

  // auto-advance: after the narration ends (+ a beat), or after the dwell when there is no narration
  useEffect(() => {
    if (!playing || !stop || last || clips === null) return;
    const narrated = voice && !blocked && (clips.has(stop.audioId) || canSpeak);
    if (narrated && ended !== stop.audioId) return; // wait for the clip to finish
    const t = window.setTimeout(() => onIndex(index + 1), narrated ? 1500 : stop.dwell * 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, last, clips, voice, blocked, ended, stop?.audioId, stop?.dwell, canSpeak]);

  useEffect(() => () => { audio.current?.pause(); if (canSpeak) window.speechSynthesis.cancel(); }, [canSpeak]);

  // Pause silences the narration as well as the auto-advance; Play resumes a clip where it stopped, or restarts the line
  const togglePlay = () => {
    const next = !playing;
    setPlaying(next);
    if (!next) {
      audio.current?.pause();
      if (canSpeak) window.speechSynthesis.cancel();
      return;
    }
    const a = audio.current;
    if (a && !a.ended && a.currentTime > 0) a.play().catch(() => setBlocked(true));
    else { setEnded(null); setReplay((r) => r + 1); }
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && !last) onIndex(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      else if (e.key === 'Escape') onExit();
      else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const toggleVoice = () => {
    const n = !voice;
    try { window.localStorage.setItem('shobha.tour.voice', n ? 'on' : 'off'); } catch { /* ignore */ }
    setBlocked(false);
    setVoice(n);
    if (n) setEnded(null); // re-run the narration effect for the current stop
  };

  if (!stop) return null;
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 border-t border-line bg-bg/92 px-3 py-2 backdrop-blur md:px-5" role="region" aria-label="Guided tour">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="label">{index + 1} / {stops.length}</span>
            <span className="truncate text-base text-fg">{stop.title}</span>
            {blocked && voice && <span className="text-[11px] text-warn">tap Voice to hear the narration</span>}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{stop.caption}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <button type="button" className="btn" onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous stop">‹ Prev</button>
          <button type="button" className="btn" onClick={togglePlay} aria-pressed={playing} title="Space">{playing ? '❚❚ Pause' : '▶ Play'}</button>
          <button type="button" className="btn" onClick={toggleVoice} aria-pressed={voice} title={clips?.has(stop.audioId) ? 'Narration (recorded)' : 'Narration (browser voice; run npm run narration for the recorded voice)'}>{voice ? '🔊 Voice' : '🔇 Voice'}</button>
          {!last && <button type="button" className="btn btn-primary" onClick={() => onIndex(index + 1)} aria-label="Next stop">Next ›</button>}
          {last && handoff && <button type="button" className="btn btn-primary" onClick={handoff.onClick}>{handoff.label} ›</button>}
          <button type="button" className="btn" onClick={onExit} title="Esc">Exit tour</button>
        </div>
      </div>
      <div className="mt-2 flex gap-0.5" aria-hidden>
        {stops.map((s, i) => <span key={s.id} className={`h-0.5 flex-1 rounded ${i <= index ? 'bg-accent' : 'bg-line'}`} />)}
      </div>
    </div>
  );
}
