/**
 * Audio Asset Mastering Pipeline for Ricochet Miner (Track B)
 *
 * Recursively scans `raw-audio/` for CC0 studio SFX & BGM packs, masters them
 * via `ffmpeg-static`, cleans stale `.ogg` fallbacks and unnumbered duplicates,
 * and emits browser/Safari-safe `.wav` & `.mp3` files into `src/assets/audio/`:
 *   - Short SFX: 24 kHz 16-bit mono `.wav`, trimmed silence + fade-out, -16 LUFS / -1.0 dBTP
 *   - Heavy/Long SFX: 44.1 kHz 160 kbps mono `.mp3`, trimmed + capped + fade-out, -16 LUFS / -1.0 dBTP
 *   - Music loops: 44.1 kHz 112 kbps stereo `.mp3`, trimmed edges, -20 LUFS / -1.5 dBTP
 */
import ffmpegStatic from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'raw-audio');
const OUT_DIR = path.join(ROOT, 'src', 'assets', 'audio');
const TMP_DIR = path.join(ROOT, '.tmp-audio');

const FFMPEG = ffmpegStatic;
if (!FFMPEG || !fs.existsSync(FFMPEG)) {
  console.error('ffmpeg-static binary not found.');
  process.exit(1);
}

/** Recursively collect all audio files under `raw-audio/`. */
function walkAudioFiles(dir, baseDir = dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkAudioFiles(full, baseDir));
    } else if (/\.(wav|ogg|mp3|flac)$/i.test(entry.name)) {
      const rel = path.relative(baseDir, full).replace(/\\/g, '/');
      const stat = fs.statSync(full);
      results.push({ full, rel, name: entry.name, size: stat.size });
    }
  }
  return results;
}

/** Find a raw audio file by one or more matcher predicates/path fragments. */
function findRawFile(inventory, matchers) {
  for (const matcher of matchers) {
    if (typeof matcher === 'function') {
      const hit = inventory.find(matcher);
      if (hit) return hit;
    } else {
      const norm = matcher.replace(/\\/g, '/').toLowerCase();
      // Prefer exact relative suffix match first, then substring match
      const exact = inventory.find(
        (item) =>
          item.rel.toLowerCase() === norm ||
          item.rel.toLowerCase().endsWith('/' + norm) ||
          item.name.toLowerCase() === norm
      );
      if (exact) return exact;
      const partial = inventory.find((item) => item.rel.toLowerCase().includes(norm));
      if (partial) return partial;
    }
  }
  return null;
}

function runFfmpeg(args) {
  execFileSync(FFMPEG, args, { stdio: 'pipe' });
}

function readWavDurationSec(wavPath) {
  const buf = fs.readFileSync(wavPath);
  if (buf.length < 44) return 0;
  let offset = 12;
  let sampleRate = 24000;
  let blockAlign = 2;
  let dataBytes = 0;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;
    if (chunkId === 'fmt ' && chunkDataStart + 16 <= buf.length) {
      sampleRate = buf.readUInt32LE(chunkDataStart + 4);
      blockAlign = buf.readUInt16LE(chunkDataStart + 12) || 2;
    } else if (chunkId === 'data') {
      dataBytes = chunkSize;
      break;
    }
    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }
  if (!dataBytes || !sampleRate || !blockAlign) return 0;
  return dataBytes / (sampleRate * blockAlign);
}

/**
 * Master one SFX file to either 24kHz 16-bit mono .wav or 44.1kHz 160kbps mono .mp3.
 */
function processSfx(spec, inventory) {
  const hit = findRawFile(inventory, spec.matchers);
  if (!hit) {
    throw new Error(`Missing raw SFX source for ${spec.output} (tried: ${spec.matchers.map(String).join(', ')})`);
  }

  const isMp3 = spec.output.endsWith('.mp3');
  const trimThreshold = spec.trimThreshold ?? '-50dB';
  const stageTrimWav = path.join(TMP_DIR, `${spec.id}_trim.wav`);
  const stageNormWav = path.join(TMP_DIR, `${spec.id}_norm.wav`);

  // Step 1: Decode to 44.1 kHz mono WAV and trim leading/trailing dead silence
  runFfmpeg([
    '-y',
    '-i',
    hit.full,
    '-ac',
    '1',
    '-ar',
    '44100',
    '-af',
    `silenceremove=start_periods=1:start_duration=0:start_threshold=${trimThreshold},areverse,silenceremove=start_periods=1:start_duration=0:start_threshold=${trimThreshold},areverse`,
    stageTrimWav,
  ]);

  let rawDur = readWavDurationSec(stageTrimWav);
  if (rawDur < 0.025) {
    // Fallback if trim was overly aggressive
    runFfmpeg(['-y', '-i', hit.full, '-ac', '1', '-ar', '44100', stageTrimWav]);
    rawDur = readWavDurationSec(stageTrimWav);
  }

  const effectiveDur = spec.maxDurationS ? Math.min(rawDur, spec.maxDurationS) : rawDur;
  const fadeOutSec = Math.min(
    Math.max((spec.fadeOutMs ?? 25) / 1000, 0.015),
    Math.max(0.02, effectiveDur * 0.45)
  );
  const fadeStart = Math.max(0.005, effectiveDur - fadeOutSec);

  // Step 2: Cap duration + smooth fade-out BEFORE loudness normalization (pad to >3s for loudnorm)
  const normFilter = [
    `atrim=0:${effectiveDur.toFixed(4)}`,
    `asetpts=PTS-STARTPTS`,
    `afade=t=out:st=${fadeStart.toFixed(4)}:d=${fadeOutSec.toFixed(4)}`,
    'apad=pad_dur=3.2',
    'loudnorm=I=-16:TP=-1.0:LRA=7',
    `atrim=0:${effectiveDur.toFixed(4)}`,
    'asetpts=PTS-STARTPTS',
  ].join(',');

  const outPath = path.join(OUT_DIR, spec.output);
  if (!isMp3) {
    runFfmpeg([
      '-y',
      '-i',
      stageTrimWav,
      '-ac',
      '1',
      '-ar',
      '24000',
      '-af',
      normFilter,
      '-c:a',
      'pcm_s16le',
      outPath,
    ]);
  } else {
    runFfmpeg([
      '-y',
      '-i',
      stageTrimWav,
      '-ac',
      '1',
      '-ar',
      '44100',
      '-af',
      normFilter,
      '-c:a',
      'pcm_s16le',
      stageNormWav,
    ]);
    runFfmpeg([
      '-y',
      '-i',
      stageNormWav,
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
  }

  const finalSize = fs.statSync(outPath).size;
  return {
    output: spec.output,
    source: hit.rel,
    format: isMp3 ? 'mp3-160k-mono' : 'wav-24k-mono',
    durationS: Number(effectiveDur.toFixed(3)),
    sizeBytes: finalSize,
  };
}

/**
 * Master one BGM track: trim leading/trailing dead edges, normalize to -20 LUFS / -1.5 dBTP,
 * and encode at 112 kbps 44.1 kHz stereo MP3.
 */
function processBgm(spec, inventory) {
  const hit = findRawFile(inventory, spec.matchers);
  if (!hit) {
    throw new Error(`Missing raw BGM source for ${spec.output}`);
  }

  const trimWav = path.join(TMP_DIR, `${spec.id}_trim.wav`);
  const outPath = path.join(OUT_DIR, spec.output);

  runFfmpeg([
    '-y',
    '-i',
    hit.full,
    '-ac',
    '2',
    '-ar',
    '44100',
    '-af',
    'silenceremove=start_periods=1:start_duration=0:start_threshold=-55dB,areverse,silenceremove=start_periods=1:start_duration=0:start_threshold=-55dB,areverse',
    trimWav,
  ]);

  runFfmpeg([
    '-y',
    '-i',
    trimWav,
    '-ac',
    '2',
    '-ar',
    '44100',
    '-af',
    'loudnorm=I=-20:TP=-1.5:LRA=9',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '112k',
    outPath,
  ]);

  const finalSize = fs.statSync(outPath).size;
  return {
    output: spec.output,
    source: hit.rel,
    format: 'mp3-112k-stereo',
    sizeBytes: finalSize,
  };
}

const SFX_MANIFEST = [
  // A. Core Impacts & Destruction (24 kHz 16-bit mono WAV)
  { id: 'hit_stone_1', output: 'sfx_hit_stone_1.wav', matchers: ['impactMining_000.ogg'] },
  { id: 'hit_stone_2', output: 'sfx_hit_stone_2.wav', matchers: ['impactMining_001.ogg'] },
  { id: 'hit_stone_3', output: 'sfx_hit_stone_3.wav', matchers: ['impactMining_002.ogg'] },

  { id: 'hit_granite_1', output: 'sfx_hit_granite_1.wav', matchers: ['impactMetal_heavy_000.ogg'] },
  { id: 'hit_granite_2', output: 'sfx_hit_granite_2.wav', matchers: ['impactMetal_heavy_001.ogg'] },
  { id: 'hit_granite_3', output: 'sfx_hit_granite_3.wav', matchers: ['impactMetal_heavy_002.ogg'] },

  { id: 'hit_frost_1', output: 'sfx_hit_frost_1.wav', matchers: ['impactGlass_heavy_000.ogg'] },
  { id: 'hit_frost_2', output: 'sfx_hit_frost_2.wav', matchers: ['impactGlass_heavy_001.ogg'] },
  { id: 'hit_frost_3', output: 'sfx_hit_frost_3.wav', matchers: ['impactGlass_heavy_002.ogg'] },

  { id: 'hit_ore_1', output: 'sfx_hit_ore_1.wav', matchers: ['impactMetal_medium_003.ogg'] },
  { id: 'hit_ore_2', output: 'sfx_hit_ore_2.wav', matchers: ['impactMetal_medium_004.ogg'] },

  { id: 'hit_wood_1', output: 'sfx_hit_wood_1.wav', matchers: ['impactWood_heavy_000.ogg'] },
  { id: 'hit_wood_2', output: 'sfx_hit_wood_2.wav', matchers: ['impactWood_heavy_001.ogg'] },

  { id: 'break_rock_1', output: 'sfx_break_rock_1.wav', matchers: ['explosionCrunch_000.ogg'], maxDurationS: 0.45, fadeOutMs: 40 },
  { id: 'break_rock_2', output: 'sfx_break_rock_2.wav', matchers: ['explosionCrunch_002.ogg'], maxDurationS: 0.45, fadeOutMs: 40 },

  { id: 'break_crystal_1', output: 'sfx_break_crystal_1.wav', matchers: ['western-fps-2d/glass-breaking-1.ogg'] },
  { id: 'break_crystal_2', output: 'sfx_break_crystal_2.wav', matchers: ['western-fps-2d/glass-breaking-2.ogg'] },

  { id: 'coin_1', output: 'sfx_coin_1.wav', matchers: ['handleCoins.ogg', 'ninja-adventure/gold-1.ogg'] },
  { id: 'coin_2', output: 'sfx_coin_2.wav', matchers: ['handleCoins2.ogg', 'ninja-adventure/gold-2.ogg'] },

  { id: 'bumper', output: 'sfx_bumper.wav', matchers: ['impactPlate_heavy_000.ogg'] },
  { id: 'wall_hit', output: 'sfx_wall_hit.wav', matchers: ['impactPlate_light_000.ogg', 'impactMetal_light_000.ogg'] },
  { id: 'launch', output: 'sfx_launch.wav', matchers: ['medieval-fantasy/woosh-1.wav'], maxDurationS: 0.30, fadeOutMs: 35 },
  { id: 'crit', output: 'sfx_crit.wav', matchers: ['impactBell_heavy_000.ogg'], maxDurationS: 0.32, fadeOutMs: 45 },
  { id: 'drone_shot', output: 'sfx_drone_shot.wav', matchers: ['laserSmall_000.ogg'] },
  { id: 'pickup', output: 'sfx_pickup.wav', matchers: ['kenney_digital-audio/Audio/powerUp7.ogg', 'powerUp7.ogg'] },

  // B. Heavy Explosions, Active Skills, Blade Passives & UI
  {
    id: 'tnt_explosion_1',
    output: 'sfx_tnt_explosion_1.mp3',
    matchers: [
      'synthetic_explosion_1.flac',
      (f) => !f.rel.includes('/') && /explosion/i.test(f.name),
    ],
    maxDurationS: 1.1,
    fadeOutMs: 80,
  },
  { id: 'tnt_explosion_2', output: 'sfx_tnt_explosion_2.mp3', matchers: ['lowFrequency_explosion_000.ogg'], maxDurationS: 1.1, fadeOutMs: 80 },
  { id: 'tnt_explosion_3', output: 'sfx_tnt_explosion_3.mp3', matchers: ['top-down-shooter/explosion-1.wav'], maxDurationS: 1.1, fadeOutMs: 80 },

  { id: 'boss_shatter', output: 'sfx_boss_shatter.mp3', matchers: ['space-shooter/boss-death.wav'], maxDurationS: 1.6, fadeOutMs: 120 },

  { id: 'magpulse', output: 'sfx_magpulse.mp3', matchers: ['lowFrequency_explosion_001.ogg'], maxDurationS: 0.50, fadeOutMs: 50 },
  { id: 'overclock', output: 'sfx_overclock.mp3', matchers: ['space-shooter/power-up-1.wav'], maxDurationS: 0.55, fadeOutMs: 55 },
  { id: 'laser', output: 'sfx_laser.mp3', matchers: ['laserLarge_000.ogg'], maxDurationS: 0.45, fadeOutMs: 45 },
  { id: 'lightning', output: 'sfx_lightning.wav', matchers: ['kenney_digital-audio/Audio/zap1.ogg', 'zap1.ogg'] },
  { id: 'portal', output: 'sfx_portal.mp3', matchers: ['forceField_000.ogg'], maxDurationS: 0.48, fadeOutMs: 50 },
  { id: 'burn', output: 'sfx_burn.wav', matchers: ['top-down-shooter/flame-thrower.wav'], maxDurationS: 0.28, fadeOutMs: 50 },
  { id: 'acid', output: 'sfx_acid.wav', matchers: ['kenney_sci-fi-sounds/Audio/slime_000.ogg', 'slime_000.ogg'], maxDurationS: 0.24, fadeOutMs: 40 },

  { id: 'ui_click', output: 'sfx_ui_click.wav', matchers: ['kenney_ui-audio/Audio/click1.ogg', 'click1.ogg'] },
  { id: 'ui_open', output: 'sfx_ui_open.wav', matchers: ['kenney_ui-audio/Audio/switch10.ogg', 'switch10.ogg'] },
  { id: 'ui_error', output: 'sfx_ui_error.wav', matchers: ['top-down-shooter/no-ammo.wav'] },
  { id: 'elevator', output: 'sfx_elevator.mp3', matchers: ['kenney_sci-fi-sounds/Audio/doorOpen_000.ogg', 'doorOpen_000.ogg'], maxDurationS: 0.40, fadeOutMs: 45 },
  { id: 'upgrade', output: 'sfx_upgrade.wav', matchers: ['ninja-adventure/power-up.ogg'] },
  { id: 'perk_open', output: 'sfx_perk_open.wav', matchers: ['ninja-adventure/magic-1.ogg'] },
  { id: 'perk_select', output: 'sfx_perk_select.wav', matchers: ['ninja-adventure/succes.ogg'] },
  { id: 'fanfare', output: 'sfx_fanfare.mp3', matchers: ['ninja-adventure/succes-3.ogg'] },
  { id: 'victory', output: 'sfx_victory.mp3', matchers: ['medieval-fantasy/victory-1.wav'], maxDurationS: 3.0, fadeOutMs: 120 },
];

const BGM_MANIFEST = [
  { id: 'bgm_surface', output: 'bgm_surface.mp3', matchers: ['Juhani Junkala [Retro Game Music Pack] Level 1.wav'] },
  { id: 'bgm_deep', output: 'bgm_deep.mp3', matchers: ['Juhani Junkala [Retro Game Music Pack] Level 2.wav'] },
  {
    id: 'bgm_biome_5',
    output: 'bgm_biome_5.mp3',
    matchers: [
      '684511__seth_makes_sounds__simple-game-music-loop.wav',
      (f) => !f.rel.includes('Juhani Junkala') && /\.(wav|mp3|ogg|flac)$/i.test(f.name) && f.size > 1_000_000,
    ],
  },
  { id: 'bgm_biome_6', output: 'bgm_biome_6.mp3', matchers: ['Juhani Junkala [Retro Game Music Pack] Level 3.wav'] },
];

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const inventory = walkAudioFiles(RAW_DIR);
  if (inventory.length === 0) {
    console.error(`No raw audio files found under ${RAW_DIR}`);
    process.exit(1);
  }

  const expectedOutputs = new Set([
    ...SFX_MANIFEST.map((s) => s.output),
    ...BGM_MANIFEST.map((b) => b.output),
  ]);

  const sfxResults = SFX_MANIFEST.map((spec) => processSfx(spec, inventory));
  const bgmResults = BGM_MANIFEST.map((spec) => processBgm(spec, inventory));

  // Section D: Clean up all stale .ogg fallback files and any unnumbered/stale assets
  const removedFiles = [];
  for (const existing of fs.readdirSync(OUT_DIR)) {
    if (existing.endsWith('.ogg') || !expectedOutputs.has(existing)) {
      fs.unlinkSync(path.join(OUT_DIR, existing));
      removedFiles.push(existing);
    }
  }

  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  const totalBytes = [...sfxResults, ...bgmResults].reduce((sum, item) => sum + item.sizeBytes, 0);
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);

  console.log('\n=== Track B Studio Audio Manifest ===');
  console.log(`Raw inventory scanned: ${inventory.length} files`);
  console.log('\nSFX Stems:');
  for (const r of sfxResults) {
    console.log(
      `  ${r.output.padEnd(26)} <- ${r.source.padEnd(56)} [${r.format}, ${r.durationS}s, ${(r.sizeBytes / 1024).toFixed(1)} KB]`
    );
  }
  console.log('\nBGM Stems:');
  for (const r of bgmResults) {
    console.log(
      `  ${r.output.padEnd(26)} <- ${r.source.padEnd(56)} [${r.format}, ${(r.sizeBytes / 1024).toFixed(1)} KB]`
    );
  }
  console.log(`\nRemoved stale files (${removedFiles.length}): ${removedFiles.length ? removedFiles.join(', ') : 'none'}`);
  console.log(`Total mastered audio size: ${(totalBytes / 1024).toFixed(1)} KB (${totalMb} MB)\n`);
}

main();
