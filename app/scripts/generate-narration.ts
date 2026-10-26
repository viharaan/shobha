/**
 * One-time narration build: turns every tour stop's `narration` line into an MP3 with ElevenLabs
 * and writes public/narration/<audioId>.mp3 plus public/narration/index.json.
 *
 *   ELEVENLABS_API_KEY=… npm run narration            # only missing clips
 *   ELEVENLABS_API_KEY=… npm run narration -- --force # regenerate all
 *   ELEVENLABS_VOICE_ID=… to pick a voice (default: ElevenLabs "Rachel"); ELEVENLABS_MODEL_ID to pick a model.
 *
 * Reads the key from the environment (or app/.env.local); never commit it. The MP3s are static
 * assets and are committed, so production needs no key and no runtime TTS calls.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLANS } from '../src/data/manifest';
import { TOWERS } from '../src/data/project';
import { planTour, siteTour } from '../src/lib/tour';

function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnvLocal();
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set (put it in app/.env.local).');
  const voice = process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM';
  const model = process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2';
  const force = process.argv.includes('--force');
  const out = join(process.cwd(), 'public', 'narration');
  mkdirSync(out, { recursive: true });

  const clips = new Map<string, string>();
  for (const t of TOWERS) for (const s of siteTour(t.wing)) clips.set(s.audioId, s.narration);
  for (const p of PLANS) for (const s of planTour(p)) clips.set(s.audioId, s.narration);

  let made = 0;
  for (const [id, text] of clips) {
    const file = join(out, `${id}.mp3`);
    if (!force && existsSync(file)) continue;
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true } }),
    });
    if (!res.ok) throw new Error(`${id}: ElevenLabs ${res.status} ${await res.text()}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    made++;
    console.log(`✓ ${id} (${text.length} chars)`);
  }
  writeFileSync(join(out, 'index.json'), JSON.stringify({ voice, model, generatedAt: new Date().toISOString(), ids: [...clips.keys()] }, null, 2));
  console.log(`${made} new clip(s), ${clips.size} total → public/narration`);
}

main().catch((e) => { console.error(e); process.exit(1); });
