import type { GameState } from '../core/StateMachine';
import { MusicEngine, type MusicIntensity } from './MusicEngine';

const PENTATONIC_HZ = [
  523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0,
];
const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] as const;

export type MusicVolumeLevel = 'off' | 'low' | 'high';
export type SfxMaterial =
  | 'strata'
  | 'granite'
  | 'ore'
  | 'frost'
  | 'boss_core'
  | 'boss_armor'
  | 'boss_shard'
  | 'crystal'
  | 'tnt'
  | 'vault'
  | 'splitter'
  | 'laser';

export type VoicePriority = 0 | 1 | 2 | 3;

export const OPTIONAL_SFX_GLOB: Record<string, string> = import.meta.glob(
  '../assets/audio/sfx_*.{wav,mp3}',
  {
    query: '?url',
    import: 'default',
    eager: true,
  }
) as Record<string, string>;

function extractSampleKey(pathKey: string): string {
  const base = pathKey.split('/').pop() ?? pathKey;
  return base.replace(/\.(wav|mp3|ogg)$/i, '');
}

function pentatonicRate(step: number, semitoneOffset: number = 0): number {
  const clamped = Math.max(0, Math.min(PENTATONIC_SEMITONES.length - 1, Math.floor(step)));
  return Math.pow(2, (PENTATONIC_SEMITONES[clamped] + semitoneOffset) / 12);
}

const SFX_DEFAULT_GAIN = 0.75;
const MUSIC_DEFAULT_GAIN = 0.28;
const MAX_ACTIVE_SFX_VOICES = 24;
const DEFAULT_THROTTLE_MS = 50;

interface ActiveVoiceEntry {
  stopNode: AudioScheduledSourceNode;
  gainNode: GainNode;
  extraNodes: AudioNode[];
  priority: VoicePriority;
  startedAt: number;
}

export interface AudioDebugBuses {
  masterGain: GainNode | null;
  masterLimiter: DynamicsCompressorNode | null;
  sfxGain: GainNode | null;
  sfxCompressor: DynamicsCompressorNode | null;
  musicDuckGain: GainNode | null;
  musicGain: GainNode | null;
  musicCompressor: DynamicsCompressorNode | null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private sfxGain: GainNode | null = null;
  private sfxBusOut: AudioNode | null = null;
  private sfxCompressor: DynamicsCompressorNode | null = null;
  private sfxPanBuckets: StereoPannerNode[] = [];
  private musicDuckGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicCompressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private readonly sampleUrls = new Map<string, string>();
  private readonly samplePools = new Map<string, string[]>();
  private readonly lastPoolIndex = new Map<string, number>();
  private readonly sampleBuffers = new Map<string, AudioBuffer>();
  private samplesPreloaded = false;
  private coinStreak = 0;
  private lastCoinMs = 0;
  private lastOverclockPickupMs = -Infinity;
  private lastAimTickDeg = Number.NaN;

  private readonly music = new MusicEngine();
  private musicVolume: MusicVolumeLevel = 'high';
  private lastNonOffVolume: 'low' | 'high' = 'high';
  private musicStartedOnce = false;

  private platformMuted = false;
  private userMuted = false;
  private sfxMuted = false;
  private musicMuted = false;
  private systemMuted = false;
  private adPaused = false;
  private gestureUnlocked = false;
  private resumeArmed = false;
  private boundResumeHandler: (() => void) | null = null;
  private adSuspendTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSoundTimes = new Map<string, number>();
  private activeVoices: ActiveVoiceEntry[] = [];

  constructor(
    initialMuted: boolean = false,
    sfxMuted: boolean = false,
    musicMuted: boolean = false,
    musicVolume?: MusicVolumeLevel
  ) {
    for (const [k, url] of Object.entries(OPTIONAL_SFX_GLOB)) {
      if (!url) continue;
      const key = extractSampleKey(k);
      this.sampleUrls.set(key, url);
      const baseKey = key.replace(/_\d+$/, '');
      const pool = this.samplePools.get(baseKey) ?? [];
      pool.push(key);
      this.samplePools.set(baseKey, pool);
    }
    this.userMuted = initialMuted;
    this.sfxMuted = sfxMuted;
    this.musicMuted = musicMuted;
    this.musicVolume = musicVolume ?? (musicMuted ? 'off' : 'high');
    if (this.musicVolume !== 'off') {
      this.lastNonOffVolume = this.musicVolume;
    } else {
      this.musicMuted = true;
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.music.setHiddenPaused(true, false);
          this.setSystemMuted(true);
        } else {
          this.setSystemMuted(false);
          this.music.setHiddenPaused(false, this.canPlayMusic());
          this.armIosResume();
        }
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        if (!this.platformMuted && !this.userMuted && !this.systemMuted && !this.adPaused) {
          this.armIosResume();
        }
      });
      this.armIosResume();
    }
  }

  private isContextPaused(ctx: AudioContext): boolean {
    const state = ctx.state as string;
    return state === 'suspended' || state === 'interrupted';
  }

  private isMasterAllowed(): boolean {
    return !this.platformMuted && !this.userMuted && !this.systemMuted && !this.adPaused;
  }

  private getTargetMusicGain(): number {
    if (!this.isMasterAllowed() || this.musicMuted || this.musicVolume === 'off') return 0;
    const scale = this.musicVolume === 'low' ? 0.5 : 1.0;
    return MUSIC_DEFAULT_GAIN * scale;
  }

  private canPlayMusic(): boolean {
    return (
      this.gestureUnlocked &&
      this.isMasterAllowed() &&
      !this.musicMuted &&
      this.musicVolume !== 'off'
    );
  }

  setPlatformMuted(muted: boolean): void {
    const next = Boolean(muted);
    if (next === this.platformMuted) return;
    this.platformMuted = next;
    this.syncSuspendState();
    this.syncMusicPlayback(!next);
    if (!next) {
      this.armIosResume();
    }
  }

  isPlatformMuted(): boolean {
    return this.platformMuted;
  }

  unlock(): void {
    this.gestureUnlocked = true;
    const ctx = this.getOrCreateContextFromGesture();
    if (!ctx) return;
    if (this.isContextPaused(ctx) && this.isMasterAllowed()) {
      ctx.resume().catch(() => {});
    }
    this.syncMusicPlayback(true);
  }

  armIosResume(): void {
    if (typeof window === 'undefined' || this.resumeArmed) return;
    this.resumeArmed = true;
    const resume = () => {
      this.resumeArmed = false;
      this.gestureUnlocked = true;
      const ctx = this.getOrCreateContextFromGesture();
      if (ctx && this.isContextPaused(ctx) && this.isMasterAllowed()) {
        ctx.resume().catch(() => {});
      }
      this.syncMusicPlayback(true);
      if (this.boundResumeHandler) {
        window.removeEventListener('pointerdown', this.boundResumeHandler);
        window.removeEventListener('touchend', this.boundResumeHandler);
        window.removeEventListener('keydown', this.boundResumeHandler);
        this.boundResumeHandler = null;
      }
    };
    this.boundResumeHandler = resume;
    window.addEventListener('pointerdown', resume);
    window.addEventListener('touchend', resume);
    window.addEventListener('keydown', resume);
  }

  private getOrCreateContextFromGesture(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      this.ctx = ctx;

      // 0. Unified Master Bus -> Brickwall Safety Limiter -> destination
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.isMasterAllowed() ? 1.0 : 0.0, ctx.currentTime);
      let masterOut: AudioNode = ctx.destination;
      if (typeof ctx.createDynamicsCompressor === 'function') {
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-1.5, ctx.currentTime);
        limiter.knee.setValueAtTime(0, ctx.currentTime);
        limiter.ratio.setValueAtTime(20, ctx.currentTime);
        limiter.attack.setValueAtTime(0.001, ctx.currentTime);
        limiter.release.setValueAtTime(0.05, ctx.currentTime);
        masterGain.connect(limiter);
        limiter.connect(ctx.destination);
        this.masterLimiter = limiter;
        masterOut = limiter;
      } else {
        masterGain.connect(ctx.destination);
      }
      this.masterGain = masterGain;

      // 1. SFX bus + 7 pre-allocated static stereo panner buckets (zero per-hit StereoPannerNode allocation)
      const sfxGain = ctx.createGain();
      sfxGain.gain.setValueAtTime(
        this.isMasterAllowed() && !this.sfxMuted ? SFX_DEFAULT_GAIN : 0,
        ctx.currentTime
      );
      this.sfxGain = sfxGain;
      this.sfxBusOut = sfxGain;
      this.sfxPanBuckets = [];
      if (typeof ctx.createStereoPanner === 'function') {
        const panValues = [-0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.42];
        for (const pv of panValues) {
          const p = ctx.createStereoPanner();
          p.pan.setValueAtTime(pv, ctx.currentTime);
          p.connect(sfxGain);
          this.sfxPanBuckets.push(p);
        }
      }

      // 2. Music bus: musicDuckGain -> musicGain -> musicCompressor -> masterGain
      const duckGain = ctx.createGain();
      duckGain.gain.setValueAtTime(1, ctx.currentTime);
      const musicGain = ctx.createGain();
      musicGain.gain.setValueAtTime(0, ctx.currentTime);
      duckGain.connect(musicGain);

      if (typeof ctx.createDynamicsCompressor === 'function') {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-14, ctx.currentTime);
        comp.knee.setValueAtTime(18, ctx.currentTime);
        comp.ratio.setValueAtTime(3, ctx.currentTime);
        comp.attack.setValueAtTime(0.008, ctx.currentTime);
        comp.release.setValueAtTime(0.15, ctx.currentTime);
        musicGain.connect(comp);
        comp.connect(masterGain);
        this.musicCompressor = comp;
      } else {
        musicGain.connect(masterGain);
      }

      // 3. Warm SFX Mastering Chain -> sfxCompressor -> masterGain
      let sfxEndNode: AudioNode = masterGain;
      if (typeof ctx.createDynamicsCompressor === 'function') {
        const sfxComp = ctx.createDynamicsCompressor();
        sfxComp.threshold.setValueAtTime(-10, ctx.currentTime);
        sfxComp.knee.setValueAtTime(12, ctx.currentTime);
        sfxComp.ratio.setValueAtTime(4.5, ctx.currentTime);
        sfxComp.attack.setValueAtTime(0.003, ctx.currentTime);
        sfxComp.release.setValueAtTime(0.095, ctx.currentTime);
        sfxComp.connect(masterGain);
        this.sfxCompressor = sfxComp;
        sfxEndNode = sfxComp;
      }

      if (typeof ctx.createWaveShaper === 'function') {
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i * 2) / 255 - 1;
          curve[i] = Math.tanh(x * 1.45) / Math.tanh(1.45);
        }
        shaper.curve = curve;
        shaper.oversample = '2x';
        sfxGain.connect(shaper);
        shaper.connect(sfxEndNode);
      } else {
        sfxGain.connect(sfxEndNode);
      }

      if (typeof ctx.createDelay === 'function') {
        const caveDelay = ctx.createDelay(0.5);
        caveDelay.delayTime.setValueAtTime(0.046, ctx.currentTime);
        const caveLp = ctx.createBiquadFilter();
        caveLp.type = 'lowpass';
        caveLp.frequency.setValueAtTime(2100, ctx.currentTime);
        const caveWet = ctx.createGain();
        caveWet.gain.setValueAtTime(0.14, ctx.currentTime);
        sfxGain.connect(caveDelay);
        caveDelay.connect(caveLp);
        caveLp.connect(caveWet);
        caveWet.connect(sfxEndNode);
      }

      void masterOut;
      this.musicDuckGain = duckGain;
      this.musicGain = musicGain;
      this.noiseBuffer = this.createNoiseBuffer(ctx);
      this.music.attach(ctx, duckGain, this.noiseBuffer);
      this.syncGainLevels(false);
      void this.preloadSfxSamples();
    }
    return this.ctx;
  }

  getDebugBuses(): AudioDebugBuses {
    return {
      masterGain: this.masterGain,
      masterLimiter: this.masterLimiter,
      sfxGain: this.sfxGain,
      sfxCompressor: this.sfxCompressor,
      musicDuckGain: this.musicDuckGain,
      musicGain: this.musicGain,
      musicCompressor: this.musicCompressor,
    };
  }

  private async preloadSfxSamples(): Promise<void> {
    if (
      this.samplesPreloaded ||
      !this.ctx ||
      typeof fetch !== 'function' ||
      typeof this.ctx.decodeAudioData !== 'function'
    ) {
      return;
    }
    this.samplesPreloaded = true;
    const ctx = this.ctx;
    await Promise.all(
      Array.from(this.sampleUrls.entries()).map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(arr);
          this.sampleBuffers.set(key, buf);
        } catch {
          // Graceful fallback to procedural SFX if fetch/decode fails
        }
      })
    );
  }

  getLoadedSampleCount(): number {
    return this.sampleBuffers.size;
  }

  private pickRoundRobinBuffer(key: string): AudioBuffer | null {
    const direct = this.sampleBuffers.get(key);
    const pool = this.samplePools.get(key);
    if (!pool || pool.length === 0) return direct ?? null;
    const loadedKeys = pool.filter((k) => this.sampleBuffers.has(k));
    if (loadedKeys.length === 0) return direct ?? null;
    if (loadedKeys.length === 1) return this.sampleBuffers.get(loadedKeys[0]) ?? null;

    const prevIdx = this.lastPoolIndex.get(key) ?? -1;
    let nextIdx = Math.floor(Math.random() * loadedKeys.length);
    if (nextIdx === prevIdx) {
      nextIdx = (nextIdx + 1) % loadedKeys.length;
    }
    this.lastPoolIndex.set(key, nextIdx);
    return this.sampleBuffers.get(loadedKeys[nextIdx]) ?? null;
  }

  private playSample(
    key: string,
    opts: {
      volume?: number;
      rate?: number;
      pitchSpread?: number;
      worldX?: number;
      destNode?: AudioNode;
      priority?: VoicePriority;
      delaySec?: number;
    } = {}
  ): boolean {
    if (!this.ctx || !this.sfxGain) return false;
    const buf = this.pickRoundRobinBuffer(key);
    if (!buf) return false;

    const priority = opts.priority ?? 1;
    if (!this.canAllocateVoice(priority)) return false;

    const ctx = this.ctx;
    const dest = opts.destNode ?? this.createPannedDest(ctx, this.sfxGain, opts.worldX);
    const startAt = ctx.currentTime + Math.max(0, opts.delaySec ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const baseRate = opts.rate ?? 1;
    const spread = opts.pitchSpread ?? 0.05;
    const rate = Math.max(0.5, Math.min(2.2, baseRate * this.pitchJitter(spread)));
    if (src.playbackRate) {
      src.playbackRate.setValueAtTime(rate, startAt);
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.volume ?? 0.85, startAt);
    src.connect(g).connect(dest);
    this.registerVoice(ctx, src, g, [], priority);
    src.start(startAt);
    return true;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.08 * white) / 1.08;
      data[i] = last * 2.6 + white * 0.4;
    }
    return buffer;
  }

  private ensureSfxContext(): { ctx: AudioContext; out: GainNode } | null {
    if (!this.isMasterAllowed() || this.sfxMuted) return null;
    if (!this.gestureUnlocked || !this.ctx || !this.sfxGain) return null;
    if (this.isContextPaused(this.ctx)) {
      this.ctx.resume().catch(() => {});
    }
    return { ctx: this.ctx, out: this.sfxGain };
  }

  private getNowMs(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  playSoundThrottled(soundId: string, minIntervalMs: number = DEFAULT_THROTTLE_MS): boolean {
    const now = this.getNowMs();
    const last = this.lastSoundTimes.get(soundId) ?? -Infinity;
    if (now - last < minIntervalMs) {
      return false;
    }
    this.lastSoundTimes.set(soundId, now);
    return true;
  }

  getActiveVoiceCount(): number {
    return this.activeVoices.length;
  }

  private createPannedDest(_ctx: AudioContext, out: GainNode, worldX?: number): AudioNode {
    if (typeof worldX !== 'number' || this.sfxPanBuckets.length === 0) {
      return out;
    }
    const norm = Math.max(0, Math.min(1, worldX / 540));
    const idx = Math.min(
      this.sfxPanBuckets.length - 1,
      Math.max(0, Math.round(norm * (this.sfxPanBuckets.length - 1)))
    );
    return this.sfxPanBuckets[idx] ?? out;
  }

  private canAllocateVoice(incomingPriority: VoicePriority): boolean {
    if (this.activeVoices.length < MAX_ACTIVE_SFX_VOICES) return true;
    return this.findStealableIndex(incomingPriority) !== -1;
  }

  private findStealableIndex(incomingPriority: VoicePriority): number {
    let bestIdx = -1;
    let lowestPri = incomingPriority;
    for (let i = 0; i < this.activeVoices.length; i++) {
      const p = this.activeVoices[i].priority;
      if (p < lowestPri) {
        lowestPri = p;
        bestIdx = i;
      }
    }
    if (bestIdx !== -1) return bestIdx;
    // Never steal high-priority (3) voices for low-priority (0) strata hits
    if (incomingPriority === 0) return -1;
    for (let i = 0; i < this.activeVoices.length; i++) {
      if (this.activeVoices[i].priority <= incomingPriority) {
        return i;
      }
    }
    return -1;
  }

  private stopVoiceSmoothly(ctx: AudioContext, entry: ActiveVoiceEntry, fadeSec: number = 0.012): void {
    try {
      const t = ctx.currentTime;
      const gParam = entry.gainNode.gain as AudioParam & {
        cancelAndHoldAtTime?: (cancelTime: number) => AudioParam;
      };
      if (typeof gParam.cancelAndHoldAtTime === 'function') {
        gParam.cancelAndHoldAtTime(t);
      } else {
        gParam.cancelScheduledValues(t);
        const safeVal = Math.max(0.0001, Math.min(1.0, gParam.value || 0.0001));
        gParam.setValueAtTime(safeVal, t);
      }
      gParam.linearRampToValueAtTime(0.0001, t + fadeSec);
      entry.stopNode.stop(t + fadeSec + 0.005);
    } catch {
      // already ended
    }
  }

  private stopAllActiveVoicesImmediately(): void {
    if (!this.ctx) {
      this.activeVoices.length = 0;
      return;
    }
    const voices = this.activeVoices.splice(0, this.activeVoices.length);
    for (const v of voices) {
      try {
        v.stopNode.stop();
      } catch {
        // already stopped
      }
      try {
        v.stopNode.disconnect();
        v.gainNode.disconnect();
        for (const n of v.extraNodes) n.disconnect();
      } catch {
        // ignore
      }
    }
  }

  private registerVoice(
    ctx: AudioContext,
    stopNode: AudioScheduledSourceNode,
    gainNode: GainNode,
    extraNodes: AudioNode[] = [],
    priority: VoicePriority = 1
  ): void {
    while (this.activeVoices.length >= MAX_ACTIVE_SFX_VOICES) {
      const stealIdx = this.findStealableIndex(priority);
      if (stealIdx === -1) break;
      const [stolen] = this.activeVoices.splice(stealIdx, 1);
      if (stolen) {
        this.stopVoiceSmoothly(ctx, stolen, 0.012);
      }
    }

    const entry: ActiveVoiceEntry = {
      stopNode,
      gainNode,
      extraNodes,
      priority,
      startedAt: ctx.currentTime,
    };
    this.activeVoices.push(entry);

    const prevOnEnded = (stopNode as { onended?: (() => void) | null }).onended;
    (stopNode as { onended?: (() => void) | null }).onended = () => {
      prevOnEnded?.();
      const idx = this.activeVoices.indexOf(entry);
      if (idx !== -1) this.activeVoices.splice(idx, 1);
      try {
        stopNode.disconnect();
        gainNode.disconnect();
        for (const n of extraNodes) n.disconnect();
      } catch {
        // ignore safe disconnect
      }
    };
  }

  private pitchJitter(spread: number = 0.06): number {
    return 1 + (Math.random() * 2 - 1) * spread;
  }

  private syncGainLevels(smoothFadeIn: boolean = false): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const masterOn = this.isMasterAllowed();

    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(masterOn ? 1.0 : 0.0, now, 0.015);
    }

    if (this.sfxGain) {
      const targetSfx = masterOn && !this.sfxMuted ? SFX_DEFAULT_GAIN : 0;
      this.sfxGain.gain.setTargetAtTime(targetSfx, now, 0.02);
    }

    if (this.musicGain) {
      const targetMusic = this.getTargetMusicGain();
      if (targetMusic <= 0) {
        this.musicGain.gain.setTargetAtTime(0, now, 0.015);
      } else if (smoothFadeIn) {
        const current = this.musicGain.gain.value;
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(Math.min(current, targetMusic), now);
        this.musicGain.gain.linearRampToValueAtTime(targetMusic, now + 0.6);
      } else {
        this.musicGain.gain.setTargetAtTime(targetMusic, now, 0.08);
      }
    }
  }

  private syncMusicPlayback(fadeInOnStart: boolean = false): void {
    if (!this.ctx || !this.musicDuckGain) {
      this.syncGainLevels(false);
      return;
    }
    this.music.attach(this.ctx, this.musicDuckGain, this.noiseBuffer);

    if (this.canPlayMusic()) {
      const wasRunning = this.music.isRunning();
      if (!wasRunning) {
        this.music.start();
      }
      const shouldFadeIn = fadeInOnStart || !this.musicStartedOnce || !wasRunning;
      this.musicStartedOnce = true;
      this.syncGainLevels(shouldFadeIn);
    } else {
      this.syncGainLevels(false);
      if (this.platformMuted || this.userMuted || this.musicMuted || this.musicVolume === 'off') {
        this.music.stop();
      }
    }
  }

  duck(durationMs: number = 550, depthGain: number = 0.45): void {
    if (!this.ctx || !this.musicDuckGain || !this.canPlayMusic()) return;
    const now = this.ctx.currentTime;
    const holdS = Math.max(0.05, durationMs / 1000);
    const g = this.musicDuckGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(depthGain, now + 0.035);
    g.setValueAtTime(depthGain, now + holdS);
    g.linearRampToValueAtTime(1.0, now + holdS + 0.4);
  }

  updateMusicState(biomeIndex: number, gameState: GameState, bossActive: boolean = false): void {
    this.music.setBiome(biomeIndex);
    this.music.setGameState(gameState, bossActive);
    if (this.canPlayMusic() && !this.music.isRunning()) {
      this.syncMusicPlayback(true);
    }
  }

  pauseForAd(): void {
    this.adPaused = true;
    this.music.pauseForAd();
    this.stopAllActiveVoicesImmediately();
    if (this.adSuspendTimer !== null) {
      clearTimeout(this.adSuspendTimer);
      this.adSuspendTimer = null;
    }
    if (this.ctx) {
      const now = this.ctx.currentTime;
      if (this.masterGain) {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(0, now + 0.05);
      }
      if (this.musicGain) {
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
        this.musicGain.gain.linearRampToValueAtTime(0, now + 0.05);
      }
      const ctx = this.ctx;
      this.adSuspendTimer = setTimeout(() => {
        this.adSuspendTimer = null;
        if (this.adPaused && ctx.state === 'running') {
          ctx.suspend().catch(() => {});
        }
      }, 55);
    }
    this.systemMuted = true;
  }

  resumeFromAd(): void {
    if (this.adSuspendTimer !== null) {
      clearTimeout(this.adSuspendTimer);
      this.adSuspendTimer = null;
    }
    this.adPaused = false;
    this.systemMuted = false;
    if (this.ctx && this.isContextPaused(this.ctx) && this.gestureUnlocked && this.isMasterAllowed()) {
      this.ctx.resume().catch(() => {});
    }
    this.music.resumeFromAd(this.canPlayMusic());
    this.syncGainLevels(this.canPlayMusic());
  }

  isMuted(): boolean {
    return this.userMuted || this.platformMuted;
  }

  isSfxMuted(): boolean {
    return this.sfxMuted || this.platformMuted;
  }

  isMusicMuted(): boolean {
    return this.platformMuted || this.musicMuted || this.musicVolume === 'off';
  }

  getMusicVolume(): MusicVolumeLevel {
    return this.musicVolume;
  }

  getMusicIntensity(): MusicIntensity {
    return this.music.getActiveIntensity();
  }

  getMusicBiomeIndex(): number {
    return this.music.getActiveBiomeIndex();
  }

  isMusicPlaying(): boolean {
    return this.canPlayMusic() && this.music.isRunning();
  }

  hasAudioRouting(): boolean {
    return Boolean(
      this.masterGain &&
        this.masterLimiter &&
        this.sfxGain &&
        this.sfxBusOut &&
        this.sfxCompressor &&
        this.musicGain &&
        this.musicDuckGain &&
        this.musicCompressor
    );
  }

  getMusicEngine(): MusicEngine {
    return this.music;
  }

  setSfxMuted(muted: boolean): void {
    this.sfxMuted = muted;
    this.syncGainLevels(false);
  }

  setMusicVolume(level: MusicVolumeLevel): void {
    this.musicVolume = level;
    if (level === 'off') {
      this.musicMuted = true;
    } else {
      this.lastNonOffVolume = level;
      this.musicMuted = false;
    }
    this.syncMusicPlayback(level !== 'off');
  }

  setMusicMuted(muted: boolean): void {
    this.musicMuted = muted;
    if (muted) {
      this.musicVolume = 'off';
    } else if (this.musicVolume === 'off') {
      this.musicVolume = this.lastNonOffVolume;
    }
    this.syncMusicPlayback(!muted);
  }

  setUserMuted(muted: boolean): void {
    this.userMuted = muted;
    this.syncSuspendState();
    this.syncMusicPlayback(!muted);
  }

  toggleMute(): boolean {
    if (this.platformMuted) {
      return true;
    }
    this.setUserMuted(!this.userMuted);
    return this.userMuted;
  }

  setSystemMuted(muted: boolean): void {
    this.systemMuted = muted;
    this.syncSuspendState();
    this.syncGainLevels(false);
    if (!muted) {
      this.armIosResume();
    }
  }

  private syncSuspendState(): void {
    if (!this.ctx) return;
    if (!this.isMasterAllowed()) {
      this.music.setHiddenPaused(true, false);
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.012);
      }
      if (this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } else {
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.015);
      }
      if (this.isContextPaused(this.ctx) && this.gestureUnlocked) {
        this.ctx.resume().catch(() => {});
      }
      this.music.setHiddenPaused(false, this.canPlayMusic());
    }
  }

  playAimTick(angleDeg: number): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const quantized = Math.round(angleDeg / 4) * 4;
    if (quantized === this.lastAimTickDeg) return;
    this.lastAimTickDeg = quantized;
    if (!this.playSoundThrottled('aimTick', 55)) return;

    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520 + (quantized % 24) * 8, now);
    gain.gain.setValueAtTime(0.042, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
    osc.connect(gain).connect(out);
    this.registerVoice(ctx, osc, gain, [], 0);
    osc.start(now);
    osc.stop(now + 0.026);
  }

  playAimCancel(): void {
    this.lastAimTickDeg = Number.NaN;
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('aimCancel', 90)) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.05);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain).connect(out);
    this.registerVoice(ctx, osc, gain, [], 0);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playLaunch(): void {
    this.lastAimTickDeg = Number.NaN;
    const s = this.ensureSfxContext();
    if (!s) return;
    if (this.playSample('sfx_launch', { volume: 0.78, pitchSpread: 0.04, priority: 2 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(185, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.075);
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain).connect(out);
    this.registerVoice(ctx, osc, gain, [], 2);
    osc.start(now);
    osc.stop(now + 0.1);

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100, now);
      filter.frequency.exponentialRampToValueAtTime(3200, now + 0.14);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.18, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      noise.connect(filter).connect(nGain).connect(out);
      this.registerVoice(ctx, noise, nGain, [filter], 2);
      noise.start(now);
      noise.stop(now + 0.16);
    }
  }

  playLaunchVolleyOrb(orbIndex: number): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('volleyOrb', 55)) return;
    const rate = Math.min(1.55, 1.12 + orbIndex * 0.045);
    if (
      this.playSample('sfx_launch', {
        volume: 0.36,
        rate,
        pitchSpread: 0.04,
        priority: 1,
      })
    ) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240 * rate, now);
    osc.frequency.exponentialRampToValueAtTime(90 * rate, now + 0.045);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain).connect(out);
    this.registerVoice(ctx, osc, gain, [], 1);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playWallHit(speed: number = 900, worldX?: number): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('wallHit', 45)) return;
    const norm = Math.max(0.55, Math.min(1.45, speed / 900));
    if (
      this.playSample('sfx_wall_hit', {
        volume: 0.42 * norm,
        rate: 0.94 + norm * 0.12,
        pitchSpread: 0.07,
        worldX,
        priority: 0,
      })
    ) {
      return;
    }
    const { ctx, out } = s;
    const dest = this.createPannedDest(ctx, out, worldX);
    const now = ctx.currentTime;
    const jitter = this.pitchJitter(0.07);

    const thud = ctx.createOscillator();
    const tGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(290 * norm * jitter, now);
    thud.frequency.exponentialRampToValueAtTime(110 * jitter, now + 0.045);
    tGain.gain.setValueAtTime(0.11 * norm, now);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.052);
    thud.connect(tGain).connect(dest);
    this.registerVoice(ctx, thud, tGain, [], 0);
    thud.start(now);
    thud.stop(now + 0.056);
  }

  playHit(
    combo: number,
    cleaved: boolean,
    materialOrGranite: boolean | SfxMaterial = false,
    speed: number = 900,
    worldX?: number
  ): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const mat: SfxMaterial =
      typeof materialOrGranite === 'string'
        ? materialOrGranite
        : materialOrGranite
        ? 'granite'
        : 'strata';

    // Priority-tiered throttling so strata spam never swallows Vault / Boss Core / TNT hits
    const isPriority = mat === 'vault' || mat === 'boss_core' || mat === 'tnt';
    const isMetal =
      mat === 'granite' || mat === 'boss_armor' || mat === 'boss_shard' || mat === 'laser';
    const isCrystal =
      mat === 'frost' || mat === 'crystal' || mat === 'ore' || mat === 'splitter';
    const throttleKey = isPriority
      ? 'hit_priority'
      : isMetal
      ? 'hit_metal'
      : isCrystal
      ? 'hit_crystal'
      : 'hit_strata';
    const throttleMs = isPriority ? 25 : isMetal || isCrystal ? 42 : 48;
    if (!this.playSoundThrottled(throttleKey, throttleMs)) return;

    const velScale = Math.max(0.7, Math.min(1.3, speed / 900));
    const voicePri: VoicePriority = isPriority ? 3 : isMetal || isCrystal ? 1 : 0;

    // Musical quantized pentatonic pitch climb (no linear microtonal clash)
    const pentIdx = Math.min(8, Math.floor(Math.max(0, combo) / 2));
    const comboRate = 1 + (pentatonicRate(pentIdx) - 1) * 0.32;

    const sampleKey =
      mat === 'boss_armor' || mat === 'granite' || mat === 'boss_shard' || mat === 'laser'
        ? 'sfx_hit_granite'
        : mat === 'frost' || mat === 'crystal' || mat === 'splitter'
        ? 'sfx_hit_frost'
        : mat === 'vault' || mat === 'tnt'
        ? 'sfx_hit_wood'
        : mat === 'ore'
        ? 'sfx_hit_ore'
        : 'sfx_hit_stone';

    const { ctx, out } = s;
    const dest = this.createPannedDest(ctx, out, worldX);
    const playedFoley = this.playSample(sampleKey, {
      volume: (cleaved ? 0.68 : 0.56) * velScale,
      rate: comboRate,
      pitchSpread: mat === 'ore' || mat === 'crystal' ? 0.04 : 0.07,
      worldX,
      destNode: dest,
      priority: voicePri,
    });

    if (cleaved) {
      this.playSample('sfx_crit', {
        volume: 0.42,
        rate: 1.08,
        pitchSpread: 0.04,
        worldX,
        destNode: dest,
        priority: Math.max(2, voicePri) as VoicePriority,
      });
    }

    // Only play pentatonic synth oscillator as fallback when sample foley isn't decoded yet
    if (!playedFoley) {
      const now = ctx.currentTime;
      const idx = Math.min(PENTATONIC_HZ.length - 1, Math.max(0, combo % PENTATONIC_HZ.length));
      const octaveShift = combo >= PENTATONIC_HZ.length ? 1.5 : 1;
      const freq = PENTATONIC_HZ[idx] * octaveShift * this.pitchJitter(0.02);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = cleaved ? 'sawtooth' : mat === 'granite' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(cleaved ? freq * 1.25 : freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.9, now + 0.085);
      gain.gain.setValueAtTime((cleaved ? 0.14 : 0.10) * velScale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain).connect(dest);
      this.registerVoice(ctx, osc, gain, [], voicePri);
      osc.start(now);
      osc.stop(now + 0.095);

      if (this.noiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime((mat === 'granite' ? 780 : 480) * this.pitchJitter(0.07), now);
        filter.Q.setValueAtTime(mat === 'granite' ? 2.4 : 1.3, now);
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.14, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
        noise.connect(filter).connect(nGain).connect(dest);
        this.registerVoice(ctx, noise, nGain, [filter], voicePri);
        noise.start(now);
        noise.stop(now + 0.08);
      }
    }
  }

  playCrunch(materialOrGranite: boolean | SfxMaterial = false, worldX?: number): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const mat: SfxMaterial =
      typeof materialOrGranite === 'string'
        ? materialOrGranite
        : materialOrGranite
        ? 'granite'
        : 'strata';
    const isPriority = mat === 'vault' || mat === 'boss_core' || mat === 'boss_shard';
    const throttleKey = isPriority ? 'crunch_priority' : 'crunch_strata';
    if (!this.playSoundThrottled(throttleKey, isPriority ? 25 : 45)) return;

    const rate =
      mat === 'frost'
        ? 1.24
        : mat === 'ore'
        ? 1.1
        : mat === 'granite'
        ? 0.85
        : mat === 'boss_shard'
        ? 1.3
        : 1.0;
    const { ctx, out } = s;
    const dest = this.createPannedDest(ctx, out, worldX);
    const pri: VoicePriority = isPriority ? 3 : 1;

    if (mat === 'boss_core') {
      if (
        this.playSample('sfx_boss_shatter', {
          volume: 0.9,
          rate: 1.0,
          pitchSpread: 0.03,
          worldX,
          destNode: dest,
          priority: pri,
        })
      ) {
        return;
      }
    } else if (mat === 'frost' || mat === 'crystal' || mat === 'splitter') {
      if (
        this.playSample('sfx_break_crystal', {
          volume: 0.72,
          rate: mat === 'frost' ? 1.06 : 1.0,
          pitchSpread: 0.05,
          worldX,
          destNode: dest,
          priority: pri,
        })
      ) {
        return;
      }
    } else if (
      this.playSample('sfx_break_rock', {
        volume: 0.68,
        rate,
        pitchSpread: 0.07,
        worldX,
        destNode: dest,
        priority: pri,
      })
    ) {
      if (mat === 'ore') {
        this.playSample('sfx_hit_ore', {
          volume: 0.42,
          rate: 1.08,
          worldX,
          destNode: dest,
          priority: pri,
        });
      }
      return;
    }

    if (!this.noiseBuffer) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime((mat === 'granite' ? 850 : 520) * this.pitchJitter(0.08), now);
    filter.Q.setValueAtTime(mat === 'granite' ? 2.8 : 1.4, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(mat === 'granite' ? 0.2 : 0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    noise.connect(filter).connect(gain).connect(dest);
    this.registerVoice(ctx, noise, gain, [filter], pri);
    noise.start(now);
    noise.stop(now + 0.13);
  }

  playBumper(combo: number = 0, worldX?: number): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('bumper', 45)) return;
    const rate = Math.min(1.5, pentatonicRate(Math.min(6, combo)) * 0.5 + 0.5);
    if (this.playSample('sfx_bumper', { volume: 0.65, rate, pitchSpread: 0.03, worldX, priority: 1 })) {
      return;
    }
    const { ctx, out } = s;
    const dest = this.createPannedDest(ctx, out, worldX);
    const now = ctx.currentTime;
    const lift = rate * this.pitchJitter(0.03);

    const body = ctx.createOscillator();
    const bGain = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(740 * lift, now);
    body.frequency.exponentialRampToValueAtTime(1320 * lift, now + 0.11);
    bGain.gain.setValueAtTime(0.16, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    body.connect(bGain).connect(dest);
    this.registerVoice(ctx, body, bGain, [], 1);
    body.start(now);
    body.stop(now + 0.15);

    const ping = ctx.createOscillator();
    const pGain = ctx.createGain();
    ping.type = 'triangle';
    ping.frequency.setValueAtTime(1480 * lift, now);
    pGain.gain.setValueAtTime(0.08, now);
    pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    ping.connect(pGain).connect(dest);
    this.registerVoice(ctx, ping, pGain, [], 1);
    ping.start(now);
    ping.stop(now + 0.09);
  }

  playExplosion(worldX?: number): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('explosion', 65)) return;
    this.duck(180, 0.72);
    const played = this.playSample('sfx_tnt_explosion', {
      volume: 0.92,
      pitchSpread: 0.06,
      worldX,
      priority: 3,
    });
    const { ctx, out } = s;
    const now = ctx.currentTime;

    // Sub-bass drop (<140 Hz) strictly center-panned (out) for clean punch
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(105 * this.pitchJitter(0.05), now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 0.34);
    subGain.gain.setValueAtTime(played ? 0.22 : 0.34, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    sub.connect(subGain).connect(out);
    this.registerVoice(ctx, sub, subGain, [], 3);
    sub.start(now);
    sub.stop(now + 0.37);

    if (!played && this.noiseBuffer) {
      const dest = this.createPannedDest(ctx, out, worldX);
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1150, now);
      filter.frequency.exponentialRampToValueAtTime(110, now + 0.35);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.28, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      noise.connect(filter).connect(nGain).connect(dest);
      this.registerVoice(ctx, noise, nGain, [filter], 3);
      noise.start(now);
      noise.stop(now + 0.39);
    }
  }

  playCoin(worldX?: number): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('coin', 48)) return;
    const nowMs = this.getNowMs();
    if (nowMs - this.lastCoinMs <= 420) {
      this.coinStreak = Math.min(10, this.coinStreak + 1);
    } else {
      this.coinStreak = 0;
    }
    this.lastCoinMs = nowMs;
    // Quantized major pentatonic coin run (-2 semitones .. +12 semitones)
    const streakRate = Math.min(1.85, pentatonicRate(this.coinStreak, -2));

    if (
      this.playSample('sfx_coin', {
        volume: 0.42,
        rate: streakRate,
        pitchSpread: 0.02,
        worldX,
        priority: 1,
      })
    ) {
      return;
    }
    const { ctx, out } = s;
    const dest = this.createPannedDest(ctx, out, worldX);
    const now = ctx.currentTime;
    const jit = streakRate * this.pitchJitter(0.02);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1318.51 * jit, now);
    osc.frequency.setValueAtTime(1975.53 * jit, now + 0.04);
    gain.gain.setValueAtTime(0.085, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(dest);
    this.registerVoice(ctx, osc, gain, [], 1);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playLaserBeam(worldX?: number): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('laser', 80)) return;
    if (this.playSample('sfx_laser', { volume: 0.78, pitchSpread: 0.04, worldX, priority: 2 })) {
      return;
    }
    const { ctx, out } = s;
    const dest = this.createPannedDest(ctx, out, worldX);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1680, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.28);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain).connect(dest);
    this.registerVoice(ctx, osc, gain, [], 2);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  playPortalWarp(worldX?: number): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('portal', 90)) return;
    if (this.playSample('sfx_portal', { volume: 0.74, pitchSpread: 0.04, worldX, priority: 2 })) {
      return;
    }
    const { ctx, out } = s;
    const dest = this.createPannedDest(ctx, out, worldX);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.24);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain).connect(dest);
    this.registerVoice(ctx, osc, gain, [], 2);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  playArmorClang(worldX?: number): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('armorClang', 65)) return;
    if (
      this.playSample('sfx_hit_granite', {
        volume: 0.56,
        rate: 1.28,
        pitchSpread: 0.05,
        worldX,
        priority: 2,
      })
    ) {
      return;
    }
    const { ctx, out } = s;
    const dest = this.createPannedDest(ctx, out, worldX);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(980 * this.pitchJitter(0.05), now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(dest);
    this.registerVoice(ctx, osc, gain, [], 2);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playCritHit(isWeakPoint: boolean = false, worldX?: number): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('crit', 60)) return;
    if (isWeakPoint) {
      this.duck(150, 0.72);
    }
    if (
      this.playSample('sfx_crit', {
        volume: isWeakPoint ? 0.85 : 0.65,
        rate: isWeakPoint ? 1.12 : 1.0,
        pitchSpread: 0.04,
        worldX,
        priority: isWeakPoint ? 3 : 2,
      })
    ) {
      return;
    }
    const { ctx, out } = s;
    const dest = this.createPannedDest(ctx, out, worldX);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isWeakPoint ? 1480 : 1180, now);
    osc.frequency.exponentialRampToValueAtTime(isWeakPoint ? 740 : 590, now + 0.16);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain).connect(dest);
    this.registerVoice(ctx, osc, gain, [], isWeakPoint ? 3 : 2);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  playWeakPointLock(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('weakPointLock', 200)) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.setValueAtTime(1479.98, now + 0.04);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(out);
    this.registerVoice(ctx, osc, gain, [], 2);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playBossPhase2(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('bossPhase2', 1200)) return;
    this.duck(500, 0.55);
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const saw = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(110, now);
    saw.frequency.exponentialRampToValueAtTime(220, now + 0.42);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(1900, now + 0.35);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
    saw.connect(filter).connect(gain).connect(out);
    this.registerVoice(ctx, saw, gain, [filter], 3);
    saw.start(now);
    saw.stop(now + 0.48);
  }

  playBossShardSpawn(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('shardSpawn', 300)) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1240, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.12);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain).connect(out);
    this.registerVoice(ctx, osc, gain, [], 1);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playBossShardSalvage(worldX?: number): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('shardSalvage', 90)) return;
    if (
      this.playSample('sfx_pickup', {
        volume: 0.62,
        rate: 1.32,
        pitchSpread: 0.04,
        worldX,
        priority: 2,
      })
    ) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1318.51, now + 0.045);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(out);
    this.registerVoice(ctx, osc, gain, [], 2);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playPassiveCue(
    passive: 'burn' | 'chill' | 'acid' | 'void' | 'gyro',
    worldX?: number
  ): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const throttleMs = passive === 'burn' ? 160 : 110;
    if (!this.playSoundThrottled(`passive_${passive}`, throttleMs)) return;

    const { ctx, out } = s;
    const dest = this.createPannedDest(ctx, out, worldX);
    const now = ctx.currentTime;

    if (passive === 'chill') {
      if (
        this.playSample('sfx_hit_frost', {
          volume: 0.35,
          rate: 1.35,
          pitchSpread: 0.06,
          worldX,
          destNode: dest,
          priority: 0,
        })
      ) {
        return;
      }
    } else if (passive === 'burn') {
      if (
        this.playSample('sfx_burn', {
          volume: 0.42,
          pitchSpread: 0.06,
          worldX,
          destNode: dest,
          priority: 0,
        })
      ) {
        return;
      }
    } else if (passive === 'acid') {
      if (
        this.playSample('sfx_acid', {
          volume: 0.44,
          pitchSpread: 0.06,
          worldX,
          destNode: dest,
          priority: 0,
        })
      ) {
        return;
      }
    }

    if ((passive === 'burn' || passive === 'acid') && this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(passive === 'burn' ? 3200 : 4600, now);
      bp.Q.setValueAtTime(passive === 'burn' ? 2.2 : 3.4, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      noise.connect(bp).connect(gain).connect(dest);
      this.registerVoice(ctx, noise, gain, [bp], 0);
      noise.start(now);
      noise.stop(now + 0.08);
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = passive === 'gyro' ? 'triangle' : 'sine';
    if (passive === 'void') {
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.08);
    } else if (passive === 'gyro') {
      osc.frequency.setValueAtTime(1180, now);
      osc.frequency.exponentialRampToValueAtTime(1560, now + 0.05);
    } else {
      osc.frequency.setValueAtTime(1880, now);
      osc.frequency.exponentialRampToValueAtTime(940, now + 0.06);
    }
    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(gain).connect(dest);
    this.registerVoice(ctx, osc, gain, [], 0);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playDroneShot(worldX?: number): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('droneShot', 125)) return;
    if (this.playSample('sfx_drone_shot', { volume: 0.34, pitchSpread: 0.06, worldX, priority: 1 })) {
      return;
    }
    const { ctx, out } = s;
    const dest = this.createPannedDest(ctx, out, worldX);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1420, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.07);
    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain).connect(dest);
    this.registerVoice(ctx, osc, gain, [], 1);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  playPickup(kind: 'split' | 'magnet' | 'overclock', worldX?: number): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('pickup', 65)) return;
    if (kind === 'overclock') {
      this.lastOverclockPickupMs = this.getNowMs();
    }
    const rate = kind === 'overclock' ? 1.18 : kind === 'magnet' ? 1.08 : 1.0;
    if (
      this.playSample('sfx_pickup', {
        volume: 0.72,
        rate,
        pitchSpread: 0.03,
        worldX,
        priority: 2,
      })
    ) {
      return;
    }
    this.playUpgrade();
  }

  playOverclockReady(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('overclockReady', 250)) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    [659.25, 987.77].forEach((freq, idx) => {
      const t = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.085, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain).connect(out);
      this.registerVoice(ctx, osc, gain, [], 1);
      osc.start(t);
      osc.stop(t + 0.13);
    });
  }

  playOrbExpired(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('orbExpired', 90)) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.11);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(out);
    this.registerVoice(ctx, osc, gain, [], 0);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  playPerkOpen(delayMs: number = 0): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    if (
      this.playSample('sfx_perk_open', {
        volume: 0.68,
        pitchSpread: 0.02,
        priority: 2,
        delaySec: Math.max(0, delayMs) / 1000,
      })
    ) {
      return;
    }
    const { ctx, out } = s;
    const startAt = ctx.currentTime + Math.max(0, delayMs) / 1000;
    [440, 554.37, 659.25, 880].forEach((freq, i) => {
      const t = startAt + i * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.095, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(gain).connect(out);
      this.registerVoice(ctx, osc, gain, [], 2);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  playPerkSelect(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    if (this.playSample('sfx_perk_select', { volume: 0.72, pitchSpread: 0.02, priority: 2 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    [587.33, 880, 1174.66].forEach((freq, idx) => {
      const t = now + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain).connect(out);
      this.registerVoice(ctx, osc, gain, [], 2);
      osc.start(t);
      osc.stop(t + 0.19);
    });
  }

  playRecall(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    if (this.playSample('sfx_portal', { volume: 0.62, rate: 1.32, priority: 2 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(1240, now + 0.22);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain).connect(out);
    this.registerVoice(ctx, osc, gain, [], 2);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playUpgrade(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    if (this.playSample('sfx_upgrade', { volume: 0.68, rate: 1.0, pitchSpread: 0.03, priority: 2 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      const t = now + idx * 0.042;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain).connect(out);
      this.registerVoice(ctx, osc, gain, [], 2);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  playFanfare(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    this.duck(550, 0.45);
    if (this.playSample('sfx_fanfare', { volume: 0.78, pitchSpread: 0.02, priority: 3 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    chord.forEach((freq, idx) => {
      const t = now + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx >= 3 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
      osc.connect(gain).connect(out);
      this.registerVoice(ctx, osc, gain, [], 3);
      osc.start(t);
      osc.stop(t + 0.38);
    });
  }

  playVictoryFanfare(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    this.duck(1100, 0.45);
    if (this.playSample('sfx_victory', { volume: 0.85, pitchSpread: 0.01, priority: 3 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const brassNotes = [392.0, 523.25, 659.25, 783.99];
    brassNotes.forEach((freq, idx) => {
      const t = now + idx * 0.11;
      const dur = idx === brassNotes.length - 1 ? 0.65 : 0.24;

      const brass = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const bGain = ctx.createGain();
      brass.type = 'sawtooth';
      brass.frequency.setValueAtTime(freq, t);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, t);
      filter.frequency.exponentialRampToValueAtTime(2200, t + 0.08);
      bGain.gain.setValueAtTime(0.11, t);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      brass.connect(filter).connect(bGain).connect(out);
      this.registerVoice(ctx, brass, bGain, [filter], 3);
      brass.start(t);
      brass.stop(t + dur + 0.02);

      const chime = ctx.createOscillator();
      const cGain = ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(freq * 2, t + 0.02);
      cGain.gain.setValueAtTime(0.09, t + 0.02);
      cGain.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.18);
      chime.connect(cGain).connect(out);
      this.registerVoice(ctx, chime, cGain, [], 3);
      chime.start(t + 0.02);
      chime.stop(t + dur + 0.2);
    });
  }

  playClick(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('uiClick', 35)) return;
    if (this.playSample('sfx_ui_click', { volume: 0.55, pitchSpread: 0.04, priority: 1 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    // Layered wood-brass tactile transient instead of bare sine beep
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(620, now);
    body.frequency.exponentialRampToValueAtTime(290, now + 0.028);
    bodyGain.gain.setValueAtTime(0.085, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
    body.connect(bodyGain).connect(out);
    this.registerVoice(ctx, body, bodyGain, [], 1);
    body.start(now);
    body.stop(now + 0.036);

    if (this.noiseBuffer) {
      const tick = ctx.createBufferSource();
      tick.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2400, now);
      bp.Q.setValueAtTime(2.5, now);
      const tGain = ctx.createGain();
      tGain.gain.setValueAtTime(0.04, now);
      tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.014);
      tick.connect(bp).connect(tGain).connect(out);
      this.registerVoice(ctx, tick, tGain, [bp], 1);
      tick.start(now);
      tick.stop(now + 0.018);
    }
  }

  playModalOpen(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('modalOpen', 60)) return;
    if (this.playSample('sfx_ui_open', { volume: 0.52, rate: 1.04, pitchSpread: 0.02, priority: 1 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.065);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    osc.connect(gain).connect(out);
    this.registerVoice(ctx, osc, gain, [], 1);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playModalClose(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('modalClose', 60)) return;
    if (this.playSample('sfx_ui_open', { volume: 0.45, rate: 0.82, pitchSpread: 0.02, priority: 1 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.06);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain).connect(out);
    this.registerVoice(ctx, osc, gain, [], 1);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  playError(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('uiError', 100)) return;
    if (this.playSample('sfx_ui_error', { volume: 0.58, pitchSpread: 0.03, priority: 1 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    [155, 115].forEach((freq, idx) => {
      const t = now + idx * 0.065;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, t);
      gain.gain.setValueAtTime(0.085, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
      osc.connect(filter).connect(gain).connect(out);
      this.registerVoice(ctx, osc, gain, [filter], 1);
      osc.start(t);
      osc.stop(t + 0.08);
    });
  }

  playElevator(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('elevator', 180)) return;
    if (this.playSample('sfx_elevator', { volume: 0.74, pitchSpread: 0.03, priority: 2 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const clunk = ctx.createOscillator();
    const cGain = ctx.createGain();
    clunk.type = 'triangle';
    clunk.frequency.setValueAtTime(160, now);
    clunk.frequency.exponentialRampToValueAtTime(68, now + 0.09);
    cGain.gain.setValueAtTime(0.16, now);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    clunk.connect(cGain).connect(out);
    this.registerVoice(ctx, clunk, cGain, [], 2);
    clunk.start(now);
    clunk.stop(now + 0.12);

    const hum = ctx.createOscillator();
    const hGain = ctx.createGain();
    hum.type = 'sine';
    hum.frequency.setValueAtTime(220, now + 0.04);
    hum.frequency.exponentialRampToValueAtTime(520, now + 0.28);
    hGain.gain.setValueAtTime(0.09, now + 0.04);
    hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    hum.connect(hGain).connect(out);
    this.registerVoice(ctx, hum, hGain, [], 2);
    hum.start(now + 0.04);
    hum.stop(now + 0.31);
  }

  playBiomeUnlock(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('biomeUnlock', 300)) return;
    this.duck(450, 0.55);
    const { ctx, out } = s;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const t = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain).connect(out);
      this.registerVoice(ctx, osc, gain, [], 3);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  playMagPulse(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('magPulse', 110)) return;
    if (this.getNowMs() - this.lastOverclockPickupMs < 90) return;
    this.duck(220, 0.72);
    const played = this.playSample('sfx_magpulse', { volume: 0.85, pitchSpread: 0.03, priority: 3 });
    const { ctx, out } = s;
    const now = ctx.currentTime;
    // Sub-bass (<140 Hz) center-panned
    const sub = ctx.createOscillator();
    const gain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(150, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.26);
    gain.gain.setValueAtTime(played ? 0.18 : 0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    sub.connect(gain).connect(out);
    this.registerVoice(ctx, sub, gain, [], 3);
    sub.start(now);
    sub.stop(now + 0.29);

    if (!played) {
      const ping = ctx.createOscillator();
      const pGain = ctx.createGain();
      ping.type = 'triangle';
      ping.frequency.setValueAtTime(420, now);
      ping.frequency.exponentialRampToValueAtTime(980, now + 0.16);
      pGain.gain.setValueAtTime(0.11, now);
      pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      ping.connect(pGain).connect(out);
      this.registerVoice(ctx, ping, pGain, [], 3);
      ping.start(now);
      ping.stop(now + 0.19);
    }
  }

  playOverclock(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    // Suppress redundant collision if triggered within 90ms of pickup_overclock
    if (this.getNowMs() - this.lastOverclockPickupMs < 90) return;
    this.duck(200, 0.72);
    if (this.playSample('sfx_overclock', { volume: 0.85, pitchSpread: 0.02, priority: 3 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const saw = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(220, now);
    saw.frequency.exponentialRampToValueAtTime(880, now + 0.28);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(4200, now + 0.25);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    saw.connect(filter).connect(gain).connect(out);
    this.registerVoice(ctx, saw, gain, [filter], 3);
    saw.start(now);
    saw.stop(now + 0.36);
  }

  playLightning(): void {
    const s = this.ensureSfxContext();
    if (!s || !this.playSoundThrottled('lightning', 70)) return;
    if (this.playSample('sfx_lightning', { volume: 0.65, pitchSpread: 0.08, priority: 2 })) {
      return;
    }
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1240, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.09);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(out);
    this.registerVoice(ctx, osc, gain, [], 2);
    osc.start(now);
    osc.stop(now + 0.11);
  }
}
