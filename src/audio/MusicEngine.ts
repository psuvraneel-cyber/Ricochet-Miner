import type { GameState } from '../core/StateMachine';

export type MusicIntensity = 'chill' | 'aiming' | 'running';
export type LeadTimbre = 'kalimba' | 'crystal' | 'analog' | 'felt' | 'synthwave' | 'arcade';

interface BiomeMusicTheme {
  readonly name: string;
  readonly bpm: number;
  readonly swingRatio: number; // subtle groove offset on odd 16th notes
  readonly timbre: LeadTimbre;
  readonly cutoffChill: number;
  readonly cutoffAim: number;
  readonly cutoffRun: number;
  readonly chords: readonly (readonly number[])[]; // 4 chords (1 chord per bar of 16 steps across 64-step phrase)
  readonly bass: readonly (number | null)[]; // 64 steps (MIDI)
  readonly lead: readonly (number | null)[]; // 64 steps (MIDI)
  readonly ostinato: readonly number[]; // 8-step repeating MIDI motif for Boss Gate tension
  readonly kickMask: readonly number[]; // 16 steps
  readonly snareMask: readonly number[]; // 16 steps
  readonly hatMask: readonly number[]; // 16 steps
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const OPTIONAL_BGM_GLOB: Record<string, string> =
  typeof import.meta !== 'undefined' && typeof import.meta.glob === 'function'
    ? (import.meta.glob('../assets/bgm_*.{mp3,ogg,wav}', {
        query: '?url',
        import: 'default',
        eager: true,
      }) as Record<string, string>)
    : {};

const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

// Helper to repeat a 16-step pattern neatly or compose full 64-step (4-bar) arcs
// Every note sits strictly inside its bar's chord & diatonic scale for zero sour clashes.
export const BIOME_THEMES: readonly BiomeMusicTheme[] = [
  // 0. Biome 1: Sunlit Quarry (114 BPM, C Major / A Minor upbeat frontier arcade groove: C -> G/B -> Am7 -> Fmaj7)
  {
    name: 'Sunlit Quarry',
    bpm: 114,
    swingRatio: 0.12,
    timbre: 'kalimba',
    cutoffChill: 1900,
    cutoffAim: 3000,
    cutoffRun: 4600,
    chords: [
      [60, 64, 67, 72], // Bar 1: C
      [59, 62, 67, 71], // Bar 2: G/B
      [57, 60, 64, 67], // Bar 3: Am7
      [53, 57, 60, 64], // Bar 4: Fmaj7
    ],
    bass: [
      // Bar 1 (C)
      36, null, null, 36, 48, null, 43, null, 36, null, 40, null, 43, null, 40, null,
      // Bar 2 (G)
      43, null, null, 43, 50, null, 47, null, 43, null, 38, null, 43, null, 47, null,
      // Bar 3 (Am)
      45, null, null, 45, 52, null, 48, null, 45, null, 40, null, 45, null, 48, null,
      // Bar 4 (F -> G turnaround)
      41, null, null, 41, 48, null, 45, null, 43, null, null, 43, 47, null, 43, null,
    ],
    lead: [
      // Bar 1 (C): bright memorable hook
      72, null, 76, null, 79, null, 76, null, 74, null, 72, null, 67, null, null, null,
      // Bar 2 (G): answering climb
      71, null, 74, null, 79, null, 74, null, 76, null, 74, null, 71, null, null, null,
      // Bar 3 (Am): warm step-up
      72, null, 76, null, 81, null, 79, null, 76, null, 72, null, 69, null, null, null,
      // Bar 4 (F -> G): satisfying cadence
      77, null, 76, null, 74, null, 72, null, 74, null, 76, null, 74, null, null, null,
    ],
    ostinato: [48, 55, 60, 55, 48, 55, 64, 55],
    kickMask:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    snareMask: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hatMask:   [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
  },

  // 1. Biome 2: Crystal Cavern (118 BPM, E Minor shimmering mystery: Em7 -> Cmaj7 -> G -> D)
  {
    name: 'Crystal Cavern',
    bpm: 118,
    swingRatio: 0.06,
    timbre: 'crystal',
    cutoffChill: 2100,
    cutoffAim: 3300,
    cutoffRun: 5000,
    chords: [
      [59, 64, 67, 71], // Em7
      [60, 64, 67, 71], // Cmaj7
      [59, 62, 67, 71], // G
      [57, 62, 66, 69], // D
    ],
    bass: [
      40, null, null, 40, 47, null, 40, null, 40, null, 43, null, 47, null, 40, null,
      36, null, null, 36, 43, null, 36, null, 36, null, 40, null, 43, null, 36, null,
      43, null, null, 43, 50, null, 43, null, 43, null, 47, null, 50, null, 43, null,
      38, null, null, 38, 45, null, 38, null, 38, null, 42, null, 45, null, 47, null,
    ],
    lead: [
      76, null, 79, null, 83, null, 79, null, 78, null, 76, null, 71, null, null, null,
      72, null, 76, null, 79, null, 76, null, 74, null, 72, null, 71, null, null, null,
      74, null, 79, null, 83, null, 79, null, 78, null, 74, null, 71, null, null, null,
      74, null, 78, null, 81, null, 78, null, 76, null, 74, null, 71, null, null, null,
    ],
    ostinato: [52, 59, 64, 59, 52, 59, 67, 59],
    kickMask:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    snareMask: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hatMask:   [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0],
  },

  // 2. Biome 3: Magma Core (122 BPM, D Minor heroic forge drive: Dm -> Bb -> C -> A7sus4/Dm)
  {
    name: 'Magma Core',
    bpm: 122,
    swingRatio: 0.08,
    timbre: 'analog',
    cutoffChill: 1700,
    cutoffAim: 2700,
    cutoffRun: 4200,
    chords: [
      [57, 62, 65, 69], // Dm
      [58, 62, 65, 70], // Bb
      [60, 64, 67, 72], // C
      [57, 61, 64, 69], // A
    ],
    bass: [
      38, 38, null, 38, 45, null, 38, null, 38, 38, null, 38, 41, null, 45, null,
      34, 34, null, 34, 41, null, 34, null, 34, 34, null, 34, 38, null, 41, null,
      36, 36, null, 36, 43, null, 36, null, 36, 36, null, 36, 40, null, 43, null,
      33, 33, null, 33, 40, null, 33, null, 33, null, 40, null, 45, null, 40, null,
    ],
    lead: [
      74, null, 74, 76, 77, null, 74, null, 72, null, 69, null, 74, null, null, null,
      70, null, 74, null, 77, null, 74, null, 72, null, 70, null, 69, null, null, null,
      72, null, 76, null, 79, null, 76, null, 74, null, 72, null, 67, null, null, null,
      69, null, 73, null, 76, null, 73, null, 76, null, 74, null, 73, null, null, null,
    ],
    ostinato: [50, 57, 62, 57, 50, 57, 65, 57],
    kickMask:  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    snareMask: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hatMask:   [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0],
  },

  // 3. Biome 4: Frost Depths (108 BPM, F Major / Dm9 crystalline chill: Dm9 -> Bbmaj7 -> Gm7 -> C6)
  {
    name: 'Frost Depths',
    bpm: 108,
    swingRatio: 0.05,
    timbre: 'felt',
    cutoffChill: 1850,
    cutoffAim: 2900,
    cutoffRun: 4500,
    chords: [
      [57, 60, 64, 69], // Dm9 (no-3 airy)
      [58, 62, 65, 69], // Bbmaj7
      [55, 58, 62, 65], // Gm7
      [57, 60, 64, 67], // C6
    ],
    bass: [
      38, null, null, 45, 50, null, null, null, 38, null, null, 45, 48, null, null, null,
      34, null, null, 41, 46, null, null, null, 34, null, null, 41, 45, null, null, null,
      43, null, null, 50, 46, null, null, null, 43, null, null, 46, 50, null, null, null,
      36, null, null, 43, 48, null, null, null, 36, null, null, 40, 43, null, null, null,
    ],
    lead: [
      74, null, 76, null, 77, null, 81, null, 79, null, 77, null, 76, null, null, null,
      74, null, 70, null, 74, null, 77, null, 76, null, 74, null, 72, null, null, null,
      70, null, 74, null, 79, null, 77, null, 74, null, 70, null, 67, null, null, null,
      72, null, 76, null, 79, null, 76, null, 74, null, 72, null, 69, null, null, null,
    ],
    ostinato: [50, 57, 62, 57, 50, 57, 64, 57],
    kickMask:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snareMask: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hatMask:   [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0],
  },

  // 4. Biome 5: Warp Abyss (124 BPM, A Minor synthwave neon pulse: Am -> F -> C -> G)
  {
    name: 'Warp Abyss',
    bpm: 124,
    swingRatio: 0.0,
    timbre: 'synthwave',
    cutoffChill: 1800,
    cutoffAim: 3000,
    cutoffRun: 4800,
    chords: [
      [57, 60, 64, 69], // Am
      [53, 57, 60, 65], // F
      [60, 64, 67, 72], // C
      [59, 62, 67, 71], // G
    ],
    bass: [
      45, 45, 57, 45, 45, 57, 45, 45, 45, 45, 57, 45, 48, 45, 43, 45,
      41, 41, 53, 41, 41, 53, 41, 41, 41, 41, 53, 41, 45, 41, 43, 41,
      36, 36, 48, 36, 36, 48, 36, 36, 36, 36, 48, 36, 40, 36, 43, 36,
      43, 43, 55, 43, 43, 55, 43, 43, 43, 43, 50, 43, 47, 43, 40, 43,
    ],
    lead: [
      76, null, 72, null, 69, null, 72, null, 76, null, 79, null, 76, null, null, null,
      77, null, 76, null, 72, null, 69, null, 72, null, 76, null, 74, null, null, null,
      79, null, 76, null, 72, null, 74, null, 76, null, 79, null, 84, null, null, null,
      83, null, 79, null, 74, null, 76, null, 79, null, 76, null, 74, null, null, null,
    ],
    ostinato: [57, 64, 69, 64, 57, 64, 72, 64],
    kickMask:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snareMask: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hatMask:   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  },

  // 5. Biome 6: Quantum Core (128 BPM, G Minor heroic climax groove: Gm -> Eb -> Bb -> F)
  {
    name: 'Quantum Core',
    bpm: 128,
    swingRatio: 0.04,
    timbre: 'arcade',
    cutoffChill: 1950,
    cutoffAim: 3200,
    cutoffRun: 5100,
    chords: [
      [55, 58, 62, 67], // Gm
      [55, 58, 63, 67], // Eb
      [58, 62, 65, 70], // Bb
      [57, 60, 65, 69], // F
    ],
    bass: [
      43, null, 43, 55, 43, null, 50, null, 43, null, 43, 55, 46, null, 50, null,
      39, null, 39, 51, 39, null, 46, null, 39, null, 39, 51, 43, null, 46, null,
      46, null, 46, 58, 46, null, 53, null, 46, null, 46, 58, 50, null, 53, null,
      41, null, 41, 53, 41, null, 48, null, 41, null, 45, null, 48, null, 45, null,
    ],
    lead: [
      79, null, 74, null, 70, null, 74, null, 79, null, 82, null, 79, null, null, null,
      79, null, 75, null, 70, null, 75, null, 79, null, 82, null, 84, null, null, null,
      82, null, 79, null, 77, null, 74, null, 77, null, 79, null, 82, null, null, null,
      81, null, 79, null, 77, null, 74, null, 77, null, 76, null, 74, null, null, null,
    ],
    ostinato: [55, 62, 67, 62, 55, 62, 70, 62],
    kickMask:  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    snareMask: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hatMask:   [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
  },
];

export function gameStateToMusicIntensity(state: GameState): MusicIntensity {
  if (state === 'RUNNING') return 'running';
  if (state === 'AIMING') return 'aiming';
  return 'chill';
}

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private outputBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Separated mixing buses so Bass + Drums stay tight & punchy while ONLY Melody gets gentle space echo
  private rhythmDryBus: GainNode | null = null;
  private harmonyBus: GainNode | null = null;
  private melodyBus: GainNode | null = null;
  private melodyFilter: BiquadFilterNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;

  private schedulerId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private pausedForAd = false;
  private pausedByHidden = false;
  private nextStepTime = 0;
  private stepIndex = 0;

  private activeBiomeIndex = 0;
  private pendingBiomeIndex = 0;
  private activeIntensity: MusicIntensity = 'chill';
  private pendingIntensity: MusicIntensity = 'chill';
  private bossActive = false;

  private customBuffer: AudioBuffer | null = null;
  private customSource: AudioBufferSourceNode | null = null;
  private customLoadStarted = false;
  private customTrackUrl: string | null = null;

  constructor() {
    const globEntries = Object.values(OPTIONAL_BGM_GLOB);
    if (globEntries.length > 0) {
      this.customTrackUrl = globEntries[0];
    }
  }

  attach(ctx: AudioContext, outputBus: GainNode, noiseBuffer: AudioBuffer | null): void {
    if (this.ctx === ctx && this.outputBus === outputBus) {
      return;
    }
    this.ctx = ctx;
    this.outputBus = outputBus;
    this.noiseBuffer = noiseBuffer;
    this.buildInternalRouting();

    if (this.customTrackUrl && !this.customLoadStarted && !this.customBuffer) {
      this.customLoadStarted = true;
      void this.loadCustomTrack(this.customTrackUrl);
    }
  }

  private buildInternalRouting(): void {
    if (!this.ctx || !this.outputBus) return;
    const now = this.ctx.currentTime;

    // 1. Dry punchy rhythm + sub-bass bus -> directly to outputBus (zero reverb/delay mud)
    const rhythmDryBus = this.ctx.createGain();
    rhythmDryBus.gain.setValueAtTime(1.0, now);
    rhythmDryBus.connect(this.outputBus);

    // 2. Warm chord harmony bus -> clean soft lowpass -> outputBus
    const harmonyBus = this.ctx.createGain();
    harmonyBus.gain.setValueAtTime(0.85, now);
    const harmonyFilter = this.ctx.createBiquadFilter();
    harmonyFilter.type = 'lowpass';
    harmonyFilter.frequency.setValueAtTime(1250, now);
    harmonyFilter.Q.setValueAtTime(0.5, now);
    harmonyBus.connect(harmonyFilter).connect(this.outputBus);

    // 3. Lead melody bus -> warm dynamic lowpass -> dry + subtle dotted-8th cavern echo
    const melodyBus = this.ctx.createGain();
    melodyBus.gain.setValueAtTime(1.0, now);
    const melodyFilter = this.ctx.createBiquadFilter();
    melodyFilter.type = 'lowpass';
    melodyFilter.frequency.setValueAtTime(BIOME_THEMES[this.activeBiomeIndex].cutoffChill, now);
    melodyFilter.Q.setValueAtTime(0.6, now);

    melodyBus.connect(melodyFilter);
    melodyFilter.connect(this.outputBus);

    if (typeof this.ctx.createDelay === 'function') {
      const delay = this.ctx.createDelay(1.0);
      const echoS = (60 / BIOME_THEMES[this.activeBiomeIndex].bpm) * 0.75;
      delay.delayTime.setValueAtTime(echoS, now);
      const fb = this.ctx.createGain();
      fb.gain.setValueAtTime(0.18, now);
      const delayFilter = this.ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.setValueAtTime(1350, now);
      const wet = this.ctx.createGain();
      wet.gain.setValueAtTime(0.14, now);

      melodyFilter.connect(delay);
      delay.connect(delayFilter);
      delayFilter.connect(fb);
      fb.connect(delay);
      delayFilter.connect(wet);
      wet.connect(this.outputBus);

      this.delayNode = delay;
      this.delayFeedback = fb;
      this.delayWet = wet;
    }

    this.rhythmDryBus = rhythmDryBus;
    this.harmonyBus = harmonyBus;
    this.melodyBus = melodyBus;
    this.melodyFilter = melodyFilter;
  }

  async loadCustomTrack(url: string): Promise<boolean> {
    if (!this.ctx || typeof fetch !== 'function') return false;
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const arr = await res.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(arr);
      this.setCustomTrackBuffer(decoded);
      return true;
    } catch {
      return false;
    }
  }

  setCustomTrackBuffer(buffer: AudioBuffer | null): void {
    this.customBuffer = buffer;
    this.stopCustomSource();
    if (this.running && !this.pausedForAd && !this.pausedByHidden && this.customBuffer) {
      this.startCustomSource();
    }
  }

  setBiome(biomeIndex: number): void {
    const clamped = Math.max(0, Math.min(BIOME_THEMES.length - 1, Math.floor(biomeIndex)));
    if (clamped === this.pendingBiomeIndex) return;
    this.pendingBiomeIndex = clamped;
    if (!this.running) {
      this.activeBiomeIndex = clamped;
    }
  }

  setGameState(state: GameState, bossActive: boolean = false): void {
    this.bossActive = bossActive;
    this.setIntensity(gameStateToMusicIntensity(state));
  }

  setIntensity(intensity: MusicIntensity): void {
    if (intensity === this.pendingIntensity && intensity === this.activeIntensity) return;
    this.pendingIntensity = intensity;
    if (!this.running) {
      this.activeIntensity = intensity;
      this.syncMasterFilterCutoff();
    }
  }

  setBossActive(active: boolean): void {
    this.bossActive = active;
  }

  getActiveBiomeIndex(): number {
    return this.activeBiomeIndex;
  }

  getActiveIntensity(): MusicIntensity {
    return this.activeIntensity;
  }

  isRunning(): boolean {
    return this.running && this.schedulerId !== null;
  }

  start(): void {
    if (!this.ctx || !this.outputBus) return;
    if (this.pausedForAd || this.pausedByHidden) return;

    this.activeBiomeIndex = this.pendingBiomeIndex;
    this.activeIntensity = this.pendingIntensity;
    this.syncMasterFilterCutoff();

    if (this.customBuffer) {
      this.running = true;
      this.startCustomSource();
      return;
    }

    if (this.schedulerId !== null) return;
    this.running = true;
    this.nextStepTime = Math.max(this.ctx.currentTime + 0.04, this.nextStepTime);
    this.scheduler();
    this.schedulerId = setInterval(() => this.scheduler(), SCHEDULER_INTERVAL_MS);
  }

  stop(): void {
    this.running = false;
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    this.stopCustomSource();
    this.nextStepTime = 0;
    this.stepIndex = 0;
  }

  pauseForAd(): void {
    this.pausedForAd = true;
    this.clearSchedulerOnly();
    this.stopCustomSource();
  }

  resumeFromAd(canPlayMusic: boolean): void {
    this.pausedForAd = false;
    if (canPlayMusic && !this.pausedByHidden) {
      this.nextStepTime = 0;
      this.start();
    }
  }

  setHiddenPaused(hidden: boolean, canPlayMusic: boolean): void {
    this.pausedByHidden = hidden;
    if (hidden) {
      this.clearSchedulerOnly();
      this.stopCustomSource();
    } else if (canPlayMusic && !this.pausedForAd) {
      this.nextStepTime = 0;
      this.start();
    }
  }

  private clearSchedulerOnly(): void {
    this.running = false;
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private startCustomSource(): void {
    if (!this.ctx || !this.outputBus || !this.customBuffer) return;
    if (this.customSource) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.customBuffer;
    src.loop = true;
    src.connect(this.outputBus);
    src.start(this.ctx.currentTime);
    this.customSource = src;
  }

  private stopCustomSource(): void {
    if (!this.customSource) return;
    try {
      this.customSource.stop();
      this.customSource.disconnect();
    } catch {
      // ignore already-stopped nodes
    }
    this.customSource = null;
  }

  private syncMasterFilterCutoff(): void {
    if (!this.ctx || !this.melodyFilter) return;
    const theme = BIOME_THEMES[this.activeBiomeIndex];
    const cutoff =
      this.activeIntensity === 'running'
        ? theme.cutoffRun
        : this.activeIntensity === 'aiming'
        ? theme.cutoffAim
        : theme.cutoffChill;
    this.melodyFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.2);

    if (this.delayWet && this.delayFeedback) {
      this.delayWet.gain.setTargetAtTime(this.activeIntensity === 'chill' ? 0.16 : 0.12, this.ctx.currentTime, 0.2);
    }
    if (this.delayNode) {
      const echoS = (60 / theme.bpm) * 0.75;
      this.delayNode.delayTime.setTargetAtTime(echoS, this.ctx.currentTime, 0.25);
    }
  }

  private scheduler(): void {
    if (!this.ctx || !this.running || this.pausedForAd || this.pausedByHidden) return;
    const now = this.ctx.currentTime;
    if (this.nextStepTime < now - 0.15) {
      this.nextStepTime = now + 0.03;
    }

    let safety = 0;
    while (this.nextStepTime < now + SCHEDULE_AHEAD_S && safety < 8) {
      const theme = BIOME_THEMES[this.activeBiomeIndex];
      const stepDur = 60 / theme.bpm / 4;
      const swingOffset = this.stepIndex % 2 === 1 ? stepDur * theme.swingRatio : 0;
      this.scheduleStep(this.stepIndex, this.nextStepTime + swingOffset);
      this.nextStepTime += stepDur;
      this.stepIndex = (this.stepIndex + 1) % 64;
      safety++;
    }
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.ctx || !this.rhythmDryBus || !this.harmonyBus || !this.melodyBus) return;

    // Bar-boundary transitions (every 16 steps)
    if (step % 16 === 0 && this.pendingIntensity !== this.activeIntensity) {
      this.activeIntensity = this.pendingIntensity;
      this.syncMasterFilterCutoff();
    }
    if (step % 8 === 0 && this.pendingBiomeIndex !== this.activeBiomeIndex) {
      this.activeBiomeIndex = this.pendingBiomeIndex;
      this.syncMasterFilterCutoff();
    }

    const theme = BIOME_THEMES[this.activeBiomeIndex];
    const stepDur = 60 / theme.bpm / 4;
    const intensity = this.activeIntensity;

    // 1. Warm Rhodes / Electric-Piano Chords: downbeat + light rhythmic push
    const barStep = step % 16;
    if (barStep === 0 || barStep === 6) {
      const chordIdx = Math.floor(step / 16) % theme.chords.length;
      const dur = barStep === 0 ? stepDur * 5.5 : stepDur * 7.5;
      const vol =
        (barStep === 0 ? 1.0 : 0.65) *
        (intensity === 'chill' ? 0.14 : intensity === 'aiming' ? 0.12 : 0.10);
      this.triggerRhodesChord(theme.chords[chordIdx], time, dur, vol);
    }

    // 2. Warm Round Sub/Pick Bass (all modes — warm & present, never muddy)
    const bassMidi = theme.bass[step];
    if (bassMidi !== null) {
      const bassVol = intensity === 'chill' ? 0.26 : intensity === 'aiming' ? 0.30 : 0.34;
      this.triggerBass(midiToHz(bassMidi), time, stepDur * 1.65, bassVol);
    }

    // 3. Catchy Melodic Lead (all modes — soft felt/kalimba in Chill, expressive lead in Aiming/Running)
    const leadMidi = theme.lead[step];
    if (leadMidi !== null) {
      const leadVol = intensity === 'chill' ? 0.18 : intensity === 'aiming' ? 0.22 : 0.26;
      const dur = stepDur * 1.85;
      this.triggerLead(midiToHz(leadMidi), theme.timbre, time, dur, leadVol);
    }

    // 4. Tight Dry Percussion (subtle brushed hat + soft kick even during Aiming; full energetic punch in Running)
    if (intensity === 'aiming') {
      if (barStep === 0 || barStep === 8) {
        this.triggerKick(time, 0.20);
      }
      if (theme.hatMask[barStep]) {
        this.triggerHat(time, barStep % 2 === 0 ? 0.032 : 0.018);
      }
    } else if (intensity === 'running') {
      if (theme.kickMask[barStep]) {
        this.triggerKick(time, 0.36);
      }
      if (theme.snareMask[barStep]) {
        this.triggerSnare(time, 0.13);
      }
      if (theme.hatMask[barStep]) {
        this.triggerHat(time, barStep % 2 === 0 ? 0.042 : 0.022);
      }
    }

    // 5. Boss Gate Tension Ostinato (tight muted pluck during AIMING / RUNNING near Boss Gate)
    if (this.bossActive && intensity !== 'chill') {
      const ostMidi = theme.ostinato[step % theme.ostinato.length];
      this.triggerOstinatoPulse(midiToHz(ostMidi), time, stepDur * 0.65, 0.09);
    }
  }

  private triggerBass(freq: number, time: number, dur: number, vol: number): void {
    if (!this.ctx || !this.rhythmDryBus) return;
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    const subMix = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq, time);
    subMix.gain.setValueAtTime(0.5, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(720, freq * 4.5), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(110, freq * 2.1), time + dur);
    filter.Q.setValueAtTime(0.8, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

    osc.connect(filter);
    sub.connect(subMix).connect(filter);
    filter.connect(gain).connect(this.rhythmDryBus);

    osc.start(time);
    sub.start(time);
    osc.stop(time + dur + 0.02);
    sub.stop(time + dur + 0.02);
  }

  private triggerRhodesChord(
    midiNotes: readonly number[],
    time: number,
    dur: number,
    vol: number
  ): void {
    if (!this.ctx || !this.harmonyBus) return;
    const ctx = this.ctx;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, time);
    masterGain.gain.linearRampToValueAtTime(vol, time + 0.018);
    masterGain.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    masterGain.connect(this.harmonyBus);

    const perVoice = 1 / Math.max(1, midiNotes.length);
    for (let i = 0; i < midiNotes.length; i++) {
      const f = midiToHz(midiNotes[i]);
      const body = ctx.createOscillator();
      const bGain = ctx.createGain();
      body.type = 'sine';
      body.frequency.setValueAtTime(f * (i % 2 === 0 ? 1.001 : 0.999), time);
      bGain.gain.setValueAtTime(perVoice * 0.85, time);
      body.connect(bGain).connect(masterGain);
      body.start(time);
      body.stop(time + dur + 0.02);

      // Gentle Rhodes tine bell overtone (decays fast in 85ms so it never sounds muddy)
      const tine = ctx.createOscillator();
      const tGain = ctx.createGain();
      tine.type = 'triangle';
      tine.frequency.setValueAtTime(f * 2, time);
      tGain.gain.setValueAtTime(perVoice * 0.16, time);
      tGain.gain.exponentialRampToValueAtTime(0.0008, time + Math.min(0.09, dur * 0.4));
      tine.connect(tGain).connect(masterGain);
      tine.start(time);
      tine.stop(time + Math.min(0.1, dur * 0.45));
    }
  }

  private triggerLead(
    freq: number,
    timbre: LeadTimbre,
    time: number,
    dur: number,
    vol: number
  ): void {
    if (!this.ctx || !this.melodyBus) return;
    const ctx = this.ctx;
    const out = this.melodyBus;

    if (timbre === 'kalimba' || timbre === 'felt') {
      // Warm acoustic sine + octave harmonic warmth (zero cheap plastic clicks)
      const body = ctx.createOscillator();
      const warm = ctx.createOscillator();
      const warmGain = ctx.createGain();
      const gain = ctx.createGain();

      body.type = 'sine';
      body.frequency.setValueAtTime(freq, time);
      warm.type = 'triangle';
      warm.frequency.setValueAtTime(timbre === 'kalimba' ? freq * 2 : freq * 0.5, time);

      warmGain.gain.setValueAtTime(timbre === 'kalimba' ? 0.16 : 0.22, time);
      warmGain.gain.exponentialRampToValueAtTime(0.001, time + Math.min(0.11, dur * 0.6));

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(vol, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

      body.connect(gain);
      warm.connect(warmGain).connect(gain);
      gain.connect(out);

      body.start(time);
      warm.start(time);
      body.stop(time + dur + 0.02);
      warm.stop(time + dur + 0.02);
      return;
    }

    if (timbre === 'crystal') {
      const body = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const hGain = ctx.createGain();
      const gain = ctx.createGain();

      body.type = 'sine';
      body.frequency.setValueAtTime(freq, time);
      harmonic.type = 'sine';
      harmonic.frequency.setValueAtTime(freq * 2.0, time);
      hGain.gain.setValueAtTime(0.18, time);
      hGain.gain.exponentialRampToValueAtTime(0.001, time + dur * 0.65);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(vol * 0.9, time + 0.009);
      gain.gain.exponentialRampToValueAtTime(0.0008, time + dur * 1.15);

      body.connect(gain);
      harmonic.connect(hGain).connect(gain);
      gain.connect(out);
      body.start(time);
      harmonic.start(time);
      body.stop(time + dur * 1.2);
      harmonic.stop(time + dur * 1.2);
      return;
    }

    // 'analog' | 'synthwave' | 'arcade': lush warm triangle + light filtered sawtooth blend (Q=0.7, zero screech)
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const bMix = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    oscA.type = 'triangle';
    oscB.type = 'sawtooth';
    oscA.frequency.setValueAtTime(freq, time);
    oscB.frequency.setValueAtTime(freq * 1.003, time);
    bMix.gain.setValueAtTime(timbre === 'arcade' ? 0.22 : 0.28, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(2600, freq * 3.2), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(420, freq * 1.35), time + dur);
    filter.Q.setValueAtTime(0.75, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol * 0.92, time + 0.011);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

    oscA.connect(filter);
    oscB.connect(bMix).connect(filter);
    filter.connect(gain).connect(out);

    oscA.start(time);
    oscB.start(time);
    oscA.stop(time + dur + 0.02);
    oscB.stop(time + dur + 0.02);
  }

  private triggerKick(time: number, vol: number): void {
    if (!this.ctx || !this.rhythmDryBus) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(122, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.06);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
    osc.connect(gain).connect(this.rhythmDryBus);
    osc.start(time);
    osc.stop(time + 0.14);
  }

  private triggerSnare(time: number, vol: number): void {
    if (!this.ctx || !this.rhythmDryBus) return;
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1650, time);
      filter.Q.setValueAtTime(1.2, time);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol * 0.75, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.075);
      noise.connect(filter).connect(gain).connect(this.rhythmDryBus);
      noise.start(time);
      noise.stop(time + 0.085);
    }

    const body = this.ctx.createOscillator();
    const bGain = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(195, time);
    body.frequency.exponentialRampToValueAtTime(115, time + 0.055);
    bGain.gain.setValueAtTime(vol * 0.75, time);
    bGain.gain.exponentialRampToValueAtTime(0.001, time + 0.065);
    body.connect(bGain).connect(this.rhythmDryBus);
    body.start(time);
    body.stop(time + 0.075);
  }

  private triggerHat(time: number, vol: number): void {
    if (!this.ctx || !this.rhythmDryBus || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(7600, time);
    bp.Q.setValueAtTime(2.0, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.024);
    noise.connect(bp).connect(gain).connect(this.rhythmDryBus);
    noise.start(time);
    noise.stop(time + 0.03);
  }

  private triggerOstinatoPulse(freq: number, time: number, dur: number, vol: number): void {
    if (!this.ctx || !this.rhythmDryBus) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    osc.connect(filter).connect(gain).connect(this.rhythmDryBus);
    osc.start(time);
    osc.stop(time + dur + 0.015);
  }
}
