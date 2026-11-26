import type { GameState } from '../core/StateMachine';
import { MusicEngine, type MusicIntensity } from './MusicEngine';

const PENTATONIC_HZ = [
  523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0,
];

export type MusicVolumeLevel = 'off' | 'low' | 'high';

// Mix mastering defaults: music sits roughly -8 dB below SFX so ricochets & TNT blasts stay crisp
const SFX_DEFAULT_GAIN = 0.75;
const MUSIC_DEFAULT_GAIN = 0.28;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicDuckGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicCompressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private readonly music = new MusicEngine();
  private musicVolume: MusicVolumeLevel = 'high';
  private lastNonOffVolume: 'low' | 'high' = 'high';
  private musicStartedOnce = false;

  private userMuted = false;
  private sfxMuted = false;
  private musicMuted = false;
  private systemMuted = false;
  private adPaused = false;
  private gestureUnlocked = false;
  private resumeArmed = false;
  private boundResumeHandler: (() => void) | null = null;

  constructor(
    initialMuted: boolean = false,
    sfxMuted: boolean = false,
    musicMuted: boolean = false,
    musicVolume?: MusicVolumeLevel
  ) {
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
        if (!this.userMuted && !this.systemMuted && !this.adPaused) {
          this.armIosResume();
        }
      });
      this.armIosResume();
    }
  }

  private getTargetMusicGain(): number {
    if (this.userMuted || this.musicMuted || this.systemMuted || this.adPaused) return 0;
    if (this.musicVolume === 'off') return 0;
    const scale = this.musicVolume === 'low' ? 0.5 : 1.0;
    return MUSIC_DEFAULT_GAIN * scale;
  }

  private canPlayMusic(): boolean {
    return (
      this.gestureUnlocked &&
      !this.userMuted &&
      !this.musicMuted &&
      !this.systemMuted &&
      !this.adPaused &&
      this.musicVolume !== 'off'
    );
  }

  /**
   * Must be called during an active pointer/keyboard user interaction (e.g. PLAY click or pointerdown).
   */
  unlock(): void {
    this.gestureUnlocked = true;
    const ctx = this.getOrCreateContextFromGesture();
    if (!ctx) return;
    if (ctx.state === 'suspended' && !this.userMuted && !this.systemMuted && !this.adPaused) {
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
      if (ctx && ctx.state === 'suspended' && !this.userMuted && !this.systemMuted && !this.adPaused) {
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

      // SFX bus
      const sfxGain = ctx.createGain();
      sfxGain.gain.setValueAtTime(
        !this.userMuted && !this.sfxMuted && !this.systemMuted ? SFX_DEFAULT_GAIN : 0,
        ctx.currentTime
      );
      sfxGain.connect(ctx.destination);
      this.sfxGain = sfxGain;

      // Dedicated Music bus: musicDuckGain -> musicGain -> DynamicsCompressorNode -> destination
      const duckGain = ctx.createGain();
      duckGain.gain.setValueAtTime(1, ctx.currentTime);
      const musicGain = ctx.createGain();
      musicGain.gain.setValueAtTime(0, ctx.currentTime); // Always starts at 0 for click-free fade-in

      duckGain.connect(musicGain);

      if (typeof ctx.createDynamicsCompressor === 'function') {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-14, ctx.currentTime);
        comp.knee.setValueAtTime(18, ctx.currentTime);
        comp.ratio.setValueAtTime(3, ctx.currentTime);
        comp.attack.setValueAtTime(0.008, ctx.currentTime);
        comp.release.setValueAtTime(0.15, ctx.currentTime);
        musicGain.connect(comp);
        comp.connect(ctx.destination);
        this.musicCompressor = comp;
      } else {
        musicGain.connect(ctx.destination);
      }

      this.musicDuckGain = duckGain;
      this.musicGain = musicGain;
      this.noiseBuffer = this.createNoiseBuffer(ctx);
      this.music.attach(ctx, duckGain, this.noiseBuffer);
      this.syncGainLevels(false);
    }
    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate; // 1 second pre-allocated buffer
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Slightly warm pink-ish filtering for richer explosions & crunches
      last = (last + 0.08 * white) / 1.08;
      data[i] = last * 2.6 + white * 0.4;
    }
    return buffer;
  }

  private ensureSfxContext(): { ctx: AudioContext; out: GainNode } | null {
    if (this.userMuted || this.sfxMuted || this.systemMuted || this.adPaused) return null;
    if (!this.gestureUnlocked || !this.ctx || !this.sfxGain) return null;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return { ctx: this.ctx, out: this.sfxGain };
  }

  private syncGainLevels(smoothFadeIn: boolean = false): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const masterOn = !this.userMuted && !this.systemMuted && !this.adPaused;

    if (this.sfxGain) {
      const targetSfx = masterOn && !this.sfxMuted ? SFX_DEFAULT_GAIN : 0;
      this.sfxGain.gain.setTargetAtTime(targetSfx, now, 0.02);
    }

    if (this.musicGain) {
      const targetMusic = this.getTargetMusicGain();
      if (targetMusic <= 0) {
        // Fast clean ramp down (50ms) to avoid abrupt pops or ad bleed
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
      if (this.userMuted || this.musicMuted || this.musicVolume === 'off') {
        this.music.stop();
      }
    }
  }

  /**
   * Smoothly dips music gain by 55% during victory fanfares or heavy TNT chain reactions,
   * recovering gracefully over 400ms.
   */
  duck(durationMs: number = 550): void {
    if (!this.ctx || !this.musicDuckGain || !this.canPlayMusic()) return;
    const now = this.ctx.currentTime;
    const holdS = Math.max(0.05, durationMs / 1000);
    const g = this.musicDuckGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.45, now + 0.035); // -55% dip
    g.setValueAtTime(0.45, now + holdS);
    g.linearRampToValueAtTime(1.0, now + holdS + 0.4); // 400ms smooth recovery
  }

  /**
   * Update adaptive multi-biome soundtrack theme and state intensity layer.
   */
  updateMusicState(biomeIndex: number, gameState: GameState, bossActive: boolean = false): void {
    this.music.setBiome(biomeIndex);
    this.music.setGameState(gameState, bossActive);
    if (this.canPlayMusic() && !this.music.isRunning()) {
      this.syncMusicPlayback(true);
    }
  }

  /**
   * Backwards-compatible wrapper for direct callers.
   */
  updateAmbience(_dt: number, biomeIndex: number, isActiveGameplay: boolean): void {
    const state: GameState = isActiveGameplay ? 'RUNNING' : 'TITLE';
    this.updateMusicState(biomeIndex, state, false);
  }

  /**
   * Pause audio engine & music lookahead scheduler strictly for ad playback.
   */
  pauseForAd(): void {
    this.adPaused = true;
    this.music.pauseForAd();
    if (this.ctx && this.musicGain) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(0, now + 0.05);
    }
    this.setSystemMuted(true);
  }

  /**
   * Resume audio after ad completes, strictly respecting user mute & music settings.
   */
  resumeFromAd(): void {
    this.adPaused = false;
    this.setSystemMuted(false);
    this.music.resumeFromAd(this.canPlayMusic());
    if (this.canPlayMusic()) {
      this.syncGainLevels(true);
    }
  }

  isMuted(): boolean {
    return this.userMuted;
  }

  isSfxMuted(): boolean {
    return this.sfxMuted;
  }

  isMusicMuted(): boolean {
    return this.musicMuted || this.musicVolume === 'off';
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
    return Boolean(this.sfxGain && this.musicGain && this.musicDuckGain && this.musicCompressor);
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
    if (this.userMuted || this.systemMuted || this.adPaused) {
      this.music.setHiddenPaused(true, false);
      if (this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } else {
      if (this.ctx.state === 'suspended' && this.gestureUnlocked) {
        this.ctx.resume().catch(() => {});
      }
      this.music.setHiddenPaused(false, this.canPlayMusic());
    }
  }

  playLaunch(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.13);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.16);

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.08, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      noise.connect(filter).connect(nGain).connect(out);
      noise.start(now);
      noise.stop(now + 0.09);
    }
  }

  playWallHit(speed: number = 900): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const norm = Math.max(0.5, Math.min(1.5, speed / 900));

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1450 * norm, now);
    osc.frequency.exponentialRampToValueAtTime(780 * norm, now + 0.045);
    gain.gain.setValueAtTime(0.055 * norm, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  playHit(combo: number, cleaved: boolean, isGranite: boolean = false, speed: number = 900): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const idx = Math.min(PENTATONIC_HZ.length - 1, Math.max(0, combo % PENTATONIC_HZ.length));
    const octaveShift = combo >= PENTATONIC_HZ.length ? 1.5 : 1;
    const freq = PENTATONIC_HZ[idx] * octaveShift;
    const velScale = Math.max(0.75, Math.min(1.3, speed / 900));

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = cleaved ? 'sawtooth' : isGranite ? 'square' : 'sine';
    osc.frequency.setValueAtTime(cleaved ? freq * 1.25 : freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.88, now + 0.085);
    gain.gain.setValueAtTime((cleaved ? 0.14 : 0.11) * velScale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.1);

    if (cleaved) {
      const shimmer = ctx.createOscillator();
      const sGain = ctx.createGain();
      shimmer.type = 'triangle';
      shimmer.frequency.setValueAtTime(freq * 1.5, now);
      sGain.gain.setValueAtTime(0.09, now);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      shimmer.connect(sGain).connect(out);
      shimmer.start(now);
      shimmer.stop(now + 0.12);
    } else if (isGranite && this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(620, now);
      filter.Q.setValueAtTime(2.4, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.14, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      noise.connect(filter).connect(nGain).connect(out);
      noise.start(now);
      noise.stop(now + 0.08);
    }
  }

  playCrunch(isGranite: boolean = false): void {
    const s = this.ensureSfxContext();
    if (!s || !this.noiseBuffer) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isGranite ? 850 : 520, now);
    filter.Q.setValueAtTime(isGranite ? 2.8 : 1.4, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isGranite ? 0.18 : 0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    noise.connect(filter).connect(gain).connect(out);
    noise.start(now);
    noise.stop(now + 0.12);
  }

  playBumper(combo: number = 0): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const lift = 1 + Math.min(8, combo) * 0.03;

    const body = ctx.createOscillator();
    const bGain = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(740 * lift, now);
    body.frequency.exponentialRampToValueAtTime(1320 * lift, now + 0.11);
    bGain.gain.setValueAtTime(0.16, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    body.connect(bGain).connect(out);
    body.start(now);
    body.stop(now + 0.15);

    const ping = ctx.createOscillator();
    const pGain = ctx.createGain();
    ping.type = 'triangle';
    ping.frequency.setValueAtTime(1480 * lift, now);
    pGain.gain.setValueAtTime(0.08, now);
    pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    ping.connect(pGain).connect(out);
    ping.start(now);
    ping.stop(now + 0.09);
  }

  playExplosion(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(115, now);
    sub.frequency.exponentialRampToValueAtTime(26, now + 0.34);
    subGain.gain.setValueAtTime(0.32, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    sub.connect(subGain).connect(out);
    sub.start(now);
    sub.stop(now + 0.37);

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, now);
      filter.frequency.exponentialRampToValueAtTime(110, now + 0.35);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.28, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      noise.connect(filter).connect(nGain).connect(out);
      noise.start(now);
      noise.stop(now + 0.39);
    }
  }

  playCoin(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1174.66, now);
    osc.frequency.setValueAtTime(1567.98, now + 0.045);
    gain.gain.setValueAtTime(0.085, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playUpgrade(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      const t = now + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  playFanfare(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    this.duck(550);
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
      osc.start(t);
      osc.stop(t + 0.38);
    });
  }

  /**
   * Triumphant 4-note rising brass-and-chime victory fanfare for One-Shot Ascension clears.
   */
  playVictoryFanfare(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    this.duck(1100);
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
      brass.start(t);
      brass.stop(t + dur + 0.02);

      const chime = ctx.createOscillator();
      const cGain = ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(freq * 2, t + 0.02);
      cGain.gain.setValueAtTime(0.09, t + 0.02);
      cGain.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.18);
      chime.connect(cGain).connect(out);
      chime.start(t + 0.02);
      chime.stop(t + dur + 0.2);
    });
  }

  playClick(): void {
    const s = this.ensureSfxContext();
    if (!s) return;
    const { ctx, out } = s;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(760, now);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 0.045);
  }
}
