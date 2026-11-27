import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const ROOT = process.cwd();
const RAW_AUDIO_DIR = path.join(ROOT, 'raw-audio');
const OUT_DIR = path.join(ROOT, 'src', 'assets', 'audio');
const TMP_DIR = path.join(ROOT, '.tmp_audio_process');

const SUPPORTED_EXTS = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac']);
const SHORT_IMPACT_MAX_S = 0.35;
const LONG_SFX_PREFIXES = [
  'sfx_tnt',
  'sfx_laser',
  'sfx_lightning',
  'sfx_magpulse',
  'sfx_overclock',
  'sfx_portal',
  'sfx_boss_shatter',
  'sfx_fanfare',
  'sfx_victory',
  'sfx_elevator',
  'sfx_biome_unlock',
];

function ensureFfmpeg() {
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw new Error('ffmpeg-static binary not found. Run npm install.');
  }
  return ffmpegPath;
}

function readWavDurationSec(wavPath) {
  const buf = fs.readFileSync(wavPath);
  if (buf.length < 44) return 0;
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ' && offset + 8 + 12 <= buf.length) {
      byteRate = buf.readUInt32LE(offset + 8 + 8);
    } else if (id === 'data') {
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!byteRate || !dataSize) return 0;
  return dataSize / byteRate;
}

function shouldExportShortWav(key, durSec) {
  if (key.startsWith('bgm_')) return false;
  if (LONG_SFX_PREFIXES.some((p) => key.startsWith(p))) return false;
  return durSec > 0 && durSec <= SHORT_IMPACT_MAX_S;
}

function runFfmpeg(ffmpeg, args) {
  execFileSync(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

function collectSources() {
  const sources = new Map();

  // Fallback sources: existing .ogg files in src/assets/audio/ (lower priority)
  if (fs.existsSync(OUT_DIR)) {
    for (const entry of fs.readdirSync(OUT_DIR, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (ext !== '.ogg') continue;
      const key = path.basename(entry.name, ext);
      sources.set(key, path.join(OUT_DIR, entry.name));
    }
  }

  // Primary studio sources: raw-audio/ overrides any fallback slot
  if (fs.existsSync(RAW_AUDIO_DIR)) {
    for (const entry of fs.readdirSync(RAW_AUDIO_DIR, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTS.has(ext)) continue;
      const key = path.basename(entry.name, ext);
      sources.set(key, path.join(RAW_AUDIO_DIR, entry.name));
    }
  }

  return sources;
}

function processSfx(ffmpeg, key, inputPath) {
  const trimmedWav = path.join(TMP_DIR, `${key}_trimmed.wav`);
  runFfmpeg(ffmpeg, [
    '-y',
    '-i',
    inputPath,
    '-af',
    'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse',
    '-ac',
    '1',
    '-ar',
    '44100',
    '-c:a',
    'pcm_s16le',
    trimmedWav,
  ]);

  let dur = readWavDurationSec(trimmedWav);
  const effectiveInput = dur > 0.01 ? trimmedWav : inputPath;
  if (dur <= 0.01) {
    // Fallback uncompressed copy without silence removal if clip was ultra-quiet
    runFfmpeg(ffmpeg, ['-y', '-i', inputPath, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', trimmedWav]);
    dur = Math.max(0.05, readWavDurationSec(trimmedWav));
  }

  const fadeStart = Math.max(0, dur - 0.004).toFixed(4);
  const trimDur = dur.toFixed(4);
  const filter = `apad=pad_dur=3.1,loudnorm=I=-16:TP=-1.0:LRA=7,atrim=0:${trimDur},afade=t=out:st=${fadeStart}:d=0.004`;

  const useWav = shouldExportShortWav(key, dur);
  if (useWav) {
    const outPath = path.join(OUT_DIR, `${key}.wav`);
    const staleMp3 = path.join(OUT_DIR, `${key}.mp3`);
    if (fs.existsSync(staleMp3)) fs.unlinkSync(staleMp3);
    runFfmpeg(ffmpeg, [
      '-y',
      '-i',
      effectiveInput,
      '-af',
      filter,
      '-ac',
      '1',
      '-ar',
      '24000',
      '-c:a',
      'pcm_s16le',
      outPath,
    ]);
    return { outPath, format: 'wav', dur, bytes: fs.statSync(outPath).size };
  }

  const outPath = path.join(OUT_DIR, `${key}.mp3`);
  const staleWav = path.join(OUT_DIR, `${key}.wav`);
  if (fs.existsSync(staleWav)) fs.unlinkSync(staleWav);
  runFfmpeg(ffmpeg, [
    '-y',
    '-i',
    effectiveInput,
    '-af',
    filter,
    '-ac',
    '1',
    '-ar',
    '44100',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '160k',
    outPath,
  ]);
  return { outPath, format: 'mp3', dur, bytes: fs.statSync(outPath).size };
}

function processBgm(ffmpeg, key, inputPath) {
  const outPath = path.join(OUT_DIR, `${key}.mp3`);
  runFfmpeg(ffmpeg, [
    '-y',
    '-i',
    inputPath,
    '-af',
    'silenceremove=start_periods=1:start_threshold=-55dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse,loudnorm=I=-20:TP=-1.5:LRA=9',
    '-ac',
    '2',
    '-ar',
    '44100',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    outPath,
  ]);
  return { outPath, format: 'mp3', dur: 0, bytes: fs.statSync(outPath).size };
}

function main() {
  const ffmpeg = ensureFfmpeg();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const sources = collectSources();
  if (sources.size === 0) {
    console.log('[audio:process] No audio sources found.');
    return;
  }

  let totalBytes = 0;
  let wavCount = 0;
  let mp3Count = 0;

  try {
    for (const [key, srcPath] of Array.from(sources.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const fromRaw = srcPath.startsWith(RAW_AUDIO_DIR);
      const res = key.startsWith('bgm_')
        ? processBgm(ffmpeg, key, srcPath)
        : processSfx(ffmpeg, key, srcPath);
      totalBytes += res.bytes;
      if (res.format === 'wav') wavCount++;
      else mp3Count++;
      console.log(
        `[audio:process] ${path.basename(res.outPath).padEnd(26)} ${res.format.toUpperCase()} ${(res.bytes / 1024).toFixed(1).padStart(6)} KB (${fromRaw ? 'raw-audio' : 'ogg-fallback'})`
      );
    }
  } finally {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }

  console.log(
    `[audio:process] Complete: ${wavCount} WAV + ${mp3Count} MP3 = ${(totalBytes / 1024).toFixed(1)} KB total`
  );
}

main();
