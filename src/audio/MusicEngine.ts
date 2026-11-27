import type { GameState } from '../core/StateMachine';

export type MusicIntensity = 'chill' | 'aiming' | 'running';
export type LeadTimbre = 'kalimba' | 'crystal' | 'analog' | 'felt' | 'synthwave' | 'arcade';

interface BiomeMusicTheme {
  readonly name: string;
  readonly bpm: number;
  readonly swingRatio: number;
  readonly timbre: LeadTimbre;
  readonly cutoffChill: number;
  readonly cutoffAim: number;
  readonly cutoffRun: number;
  readonly chords: readonly (readonly number[])[];
  readonly bass: readonly (number | null)[];
  readonly lead: readonly (number | null)[];
  readonly leadB: readonly (number | null)[];
  readonly counter: readonly (number | null)[];
  readonly ostinato: readonly number[];
  readonly kickMask: readonly number[];
  readonly snareMask: readonly number[];
  readonly hatMask: readonly number[];
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const OPTIONAL_BGM_GLOB: Record<string, string> = {
  ...(import.meta.glob('../assets/audio/bgm_*.mp3', {
    query: '?url',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob('../assets/bgm_*.mp3', {
    query: '?url',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
};

function extractTrackKey(pathKey: string): string {
  const base = pathKey.split('/').pop() ?? pathKey;
  return base.replace(/\.mp3$/i, '');
}

const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;
const DECK_CROSSFADE_S = 0.12;
const BIOME_CROSSFADE_S = 1.4;
const BOSS_OSTINATO_MASK = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0] as const;

export const BIOME_THEMES: readonly BiomeMusicTheme[] = [
  {
    name: 'Sunlit Quarry',
    bpm: 114,
    swingRatio: 0.12,
    timbre: 'kalimba',
    cutoffChill: 1900,
    cutoffAim: 3000,
    cutoffRun: 4600,
    chords: [
      [60, 64, 67, 72],
      [59, 62, 67, 71],
      [57, 60, 64, 67],
      [53, 57, 60, 64],
    ],
    bass: [
      36, null, null, 36, 48, null, 43, null, 36, null, 40, null, 43, null, 40, null,
      43, null, null, 43, 50, null, 47, null, 43, null, 38, null, 43, null, 47, null,
      45, null, null, 45, 52, null, 48, null, 45, null, 40, null, 45, null, 48, null,
      41, null, null, 41, 48, null, 45, null, 43, null, null, 43, 47, null, 43, null,
    ],
    lead: [
      72, null, 76, null, 79, null, 76, null, 74, null, 72, null, 67, null, null, null,
      71, null, 74, null, 79, null, 74, null, 76, null, 74, null, 71, null, null, null,
      72, null, 76, null, 81, null, 79, null, 76, null, 72, null, 69, null, null, null,
      77, null, 76, null, 74, null, 72, null, 74, null, 76, null, 74, null, null, null,
    ],
    leadB: [
      76, null, 79, null, 84, null, 79, null, 76, null, 74, null, 72, null, null, null,
      74, null, 79, null, 83, null, 79, null, 76, null, 74, null, 71, null, null, null,
      76, null, 81, null, 84, null, 81, null, 79, null, 76, null, 72, null, null, null,
      81, null, 79, null, 76, null, 74, null, 76, null, 79, null, 74, null, null, null,
    ],
    counter: [
      60, null, 64, null, 67, null, 64, null, 60, null, 64, null, 67, null, 64, null,
      59, null, 62, null, 67, null, 62, null, 59, null, 62, null, 67, null, 62, null,
      57, null, 60, null, 64, null, 60, null, 57, null, 60, null, 64, null, 60, null,
      53, null, 57, null, 60, null, 57, null, 59, null, 62, null, 67, null, 62, null,
    ],
    ostinato: [48, 55, 60, 55, 48, 55, 64, 55],
    kickMask: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    snareMask: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hatMask: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
  },
  {
    name: 'Crystal Cavern',
    bpm: 118,
    swingRatio: 0.06,
    timbre: 'crystal',
    cutoffChill: 2100,
    cutoffAim: 3300,
    cutoffRun: 5000,
    chords: [
      [59, 64, 67, 71],
      [60, 64, 67, 71],
      [59, 62, 67, 71],
      [57, 62, 66, 69],
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
    leadB: [
      83, null, 79, null, 88, null, 83, null, 79, null, 78, null, 76, null, null, null,
      79, null, 76, null, 84, null, 79, null, 76, null, 74, null, 72, null, null, null,
      79, null, 83, null, 86, null, 83, null, 79, null, 78, null, 74, null, null, null,
      81, null, 78, null, 86, null, 81, null, 78, null, 76, null, 74, null, null, null,
    ],
    counter: [
      64, null, 67, null, 71, null, 67, null, 64, null, 67, null, 71, null, 67, null,
      60, null, 64, null, 67, null, 64, null, 60, null, 64, null, 67, null, 64, null,
      62, null, 67, null, 71, null, 67, null, 62, null, 67, null, 71, null, 67, null,
      62, null, 66, null, 69, null, 66, null, 62, null, 66, null, 69, null, 66, null,
    ],
    ostinato: [52, 59, 64, 59, 52, 59, 67, 59],
    kickMask: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    snareMask: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hatMask: [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0],
  },
  {
    name: 'Magma Core',
    bpm: 122,
    swingRatio: 0.08,
    timbre: 'analog',
    cutoffChill: 1700,
    cutoffAim: 2700,
    cutoffRun: 4200,
    chords: [
      [57, 62, 65, 69],
      [58, 62, 65, 70],
      [60, 64, 67, 72],
      [57, 61, 64, 69],
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
    leadB: [
      77, null, 81, null, 86, null, 81, null, 77, null, 76, null, 74, null, null, null,
      74, null, 77, null, 82, null, 77, null, 74, null, 72, null, 70, null, null, null,
      76, null, 79, null, 84, null, 79, null, 76, null, 74, null, 72, null, null, null,
      81, null, 79, null, 76, null, 73, null, 76, null, 79, null, 76, null, null, null,
    ],
    counter: [
      62, 65, 69, 65, 62, 65, 69, 65, 62, 65, 69, 65, 62, 65, 69, 65,
      58, 62, 65, 62, 58, 62, 65, 62, 58, 62, 65, 62, 58, 62, 65, 62,
      60, 64, 67, 64, 60, 64, 67, 64, 60, 64, 67, 64, 60, 64, 67, 64,
      57, 61, 64, 61, 57, 61, 64, 61, 57, 64, 69, 64, 61, 64, 69, 64,
    ],
    ostinato: [50, 57, 62, 57, 50, 57, 65, 57],
    kickMask: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    snareMask: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hatMask: [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0],
  },
  {
    name: 'Frost Depths',
    bpm: 108,
    swingRatio: 0.05,
    timbre: 'felt',
    cutoffChill: 1850,
    cutoffAim: 2900,
    cutoffRun: 4500,
    chords: [
      [57, 60, 64, 69],
      [58, 62, 65, 69],
      [55, 58, 62, 65],
      [57, 60, 64, 67],
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
    leadB: [
      81, null, 79, null, 77, null, 76, null, 74, null, 76, null, 79, null, null, null,
      77, null, 74, null, 70, null, 74, null, 77, null, 76, null, 74, null, null, null,
      74, null, 77, null, 82, null, 79, null, 77, null, 74, null, 70, null, null, null,
      76, null, 79, null, 84, null, 79, null, 76, null, 74, null, 72, null, null, null,
    ],
    counter: [
      64, null, 69, null, 64, null, 69, null, 64, null, 69, null, 64, null, null, null,
      62, null, 65, null, 69, null, 65, null, 62, null, 65, null, 69, null, null, null,
      58, null, 62, null, 67, null, 62, null, 58, null, 62, null, 67, null, null, null,
      60, null, 64, null, 67, null, 64, null, 60, null, 64, null, 67, null, null, null,
    ],
    ostinato: [50, 57, 62, 57, 50, 57, 64, 57],
    kickMask: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snareMask: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hatMask: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0],
  },
  {
    name: 'Warp Abyss',
    bpm: 124,
    swingRatio: 0.0,
    timbre: 'synthwave',
    cutoffChill: 1800,
    cutoffAim: 3000,
    cutoffRun: 4800,
    chords: [
      [57, 60, 64, 69],
      [53, 57, 60, 65],
      [60, 64, 67, 72],
      [59, 62, 67, 71],
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
    leadB: [
      81, null, 79, null, 76, null, 79, null, 81, null, 84, null, 81, null, null, null,
      81, null, 77, null, 76, null, 72, null, 77, null, 76, null, 74, null, null, null,
      84, null, 79, null, 76, null, 79, null, 84, null, 88, null, 84, null, null, null,
      83, null, 79, null, 83, null, 86, null, 83, null, 79, null, 74, null, null, null,
    ],
    counter: [
      69, 64, 60, 64, 69, 64, 60, 64, 69, 64, 60, 64, 69, 64, 60, 64,
      65, 60, 57, 60, 65, 60, 57, 60, 65, 60, 57, 60, 65, 60, 57, 60,
      72, 67, 64, 67, 72, 67, 64, 67, 72, 67, 64, 67, 72, 67, 64, 67,
      71, 67, 62, 67, 71, 67, 62, 67, 71, 67, 62, 67, 71, 67, 62, 67,
    ],
    ostinato: [57, 64, 69, 64, 57, 64, 72, 64],
    kickMask: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snareMask: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hatMask: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  },
  {
    name: 'Quantum Core',
    bpm: 128,
    swingRatio: 0.04,
    timbre: 'arcade',
    cutoffChill: 1950,
    cutoffAim: 3200,
    cutoffRun: 5100,
    chords: [
      [55, 58, 62, 67],
      [55, 58, 63, 67],
      [58, 62, 65, 70],
      [57, 60, 65, 69],
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
    leadB: [
      86, null, 82, null, 79, null, 82, null, 86, null, 91, null, 86, null, null, null,
      87, null, 82, null, 79, null, 82, null, 87, null, 91, null, 86, null, null, null,
      89, null, 86, null, 82, null, 79, null, 82, null, 86, null, 89, null, null, null,
      88, null, 86, null, 84, null, 81, null, 84, null, 81, null, 79, null, null, null,
    ],
    counter: [
      67, 62, 58, 62, 67, 62, 58, 62, 67, 62, 58, 62, 67, 62, 58, 62,
      67, 63, 58, 63, 67, 63, 58, 63, 67, 63, 58, 63, 67, 63, 58, 63,
      70, 65, 62, 65, 70, 65, 62, 65, 70, 65, 62, 65, 70, 65, 62, 65,
      69, 65, 60, 65, 69, 65, 60, 65, 69, 65, 60, 65, 69, 65, 60, 65,
    ],
    ostinato: [55, 62, 67, 62, 55, 62, 70, 62],
    kickMask: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    snareMask: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hatMask: [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
  },
];

export function gameStateToMusicIntensity(state: GameState): MusicIntensity {
  if (state === 'RUNNING') return 'running';
  if (state === 'AIMING') return 'aiming';
  return 'chill';
}

function isModalState(state: GameState): boolean {
  return (
    state === 'PAUSED' ||
    state === 'SHOP' ||
    state === 'PERK_DRAFT' ||
    state === 'RUN_SUMMARY'
  );
}

interface CustomDeckHandle {
  source: AudioBufferSourceNode;
  gain: GainNode;
  nextTimer: ReturnType<typeof setTimeout> | null;
  trackKey: string;
}

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private outputBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private modalFilter: BiquadFilterNode | null = null;
  private modalGain: GainNode | null = null;
  private rhythmDryBus: GainNode | null = null;
  private harmonyBus: GainNode | null = null;
  private melodyBus: GainNode | null = null;
  private melodyFilter: BiquadFilterNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;

  // 3 pre-allocated static panners so per-note scheduling creates zero StereoPannerNode leaks
  private rhythmPanCenter: AudioNode | null = null;
  private rhythmPanLeft: AudioNode | null = null;
  private rhythmPanRight: AudioNode | null = null;
  private melodyPanLeft: AudioNode | null = null;

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
  private modalMuffled = false;
  private bossActive = false;

  private readonly trackUrls = new Map<string, string>();
  private readonly trackBuffers = new Map<string, AudioBuffer>();
  private customBuffer: AudioBuffer | null = null;
  private customLoadStarted = false;
  private activeCustomDecks = new Set<CustomDeckHandle>();
  private currentCustomDeck: CustomDeckHandle | null = null;
  private customDeckActive = false;
  private activeTrackKey = '';

  constructor() {
    for (const [k, url] of Object.entries(OPTIONAL_BGM_GLOB)) {
      if (url) this.trackUrls.set(extractTrackKey(k), url);
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

    if (this.trackUrls.size > 0 && !this.customLoadStarted) {
      this.customLoadStarted = true;
      void this.preloadAllTracks();
    }
  }

  private createStaticPan(dest: AudioNode, panVal: number): AudioNode {
    if (!this.ctx || typeof this.ctx.createStereoPanner !== 'function') return dest;
    const pan = this.ctx.createStereoPanner();
    pan.pan.setValueAtTime(Math.max(-0.8, Math.min(0.8, panVal)), this.ctx.currentTime);
    pan.connect(dest);
    return pan;
  }

  private buildInternalRouting(): void {
    if (!this.ctx || !this.outputBus) return;
    const now = this.ctx.currentTime;

    const modalFilter = this.ctx.createBiquadFilter();
    modalFilter.type = 'lowpass';
    modalFilter.frequency.setValueAtTime(this.modalMuffled ? 780 : 18000, now);
    modalFilter.Q.setValueAtTime(0.6, now);

    const modalGain = this.ctx.createGain();
    modalGain.gain.setValueAtTime(this.modalMuffled ? 0.58 : 1.0, now);
    modalFilter.connect(modalGain);
    modalGain.connect(this.outputBus);

    const rhythmDryBus = this.ctx.createGain();
    rhythmDryBus.gain.setValueAtTime(1.0, now);
    rhythmDryBus.connect(modalFilter);

    const harmonyBus = this.ctx.createGain();
    harmonyBus.gain.setValueAtTime(0.85, now);
    const harmonyFilter = this.ctx.createBiquadFilter();
    harmonyFilter.type = 'lowpass';
    harmonyFilter.frequency.setValueAtTime(1250, now);
    harmonyFilter.Q.setValueAtTime(0.5, now);
    harmonyBus.connect(harmonyFilter).connect(modalFilter);

    const melodyBus = this.ctx.createGain();
    melodyBus.gain.setValueAtTime(1.0, now);
    const melodyFilter = this.ctx.createBiquadFilter();
    melodyFilter.type = 'lowpass';
    melodyFilter.frequency.setValueAtTime(BIOME_THEMES[this.activeBiomeIndex].cutoffChill, now);
    melodyFilter.Q.setValueAtTime(0.6, now);

    melodyBus.connect(melodyFilter);
    melodyFilter.connect(modalFilter);

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
      wet.connect(modalFilter);

      this.delayNode = delay;
      this.delayFeedback = fb;
      this.delayWet = wet;
    }

    this.modalFilter = modalFilter;
    this.modalGain = modalGain;
    this.rhythmDryBus = rhythmDryBus;
    this.harmonyBus = harmonyBus;
    this.melodyBus = melodyBus;
    this.melodyFilter = melodyFilter;

    this.rhythmPanCenter = rhythmDryBus;
    this.rhythmPanLeft = this.createStaticPan(rhythmDryBus, -0.28);
    this.rhythmPanRight = this.createStaticPan(rhythmDryBus, 0.28);
    this.melodyPanLeft = this.createStaticPan(melodyBus, -0.28);
  }

  private async preloadAllTracks(): Promise<void> {
    if (!this.ctx || typeof fetch !== 'function' || typeof this.ctx.decodeAudioData !== 'function') {
      return;
    }
    const ctx = this.ctx;
    await Promise.all(
      Array.from(this.trackUrls.entries()).map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(arr);
          this.trackBuffers.set(key, buf);
        } catch {
          // Graceful procedural fallback if custom track fails decode
        }
      })
    );
    const resolved = this.resolveBufferForBiome(this.activeBiomeIndex);
    if (resolved && !this.customBuffer) {
      this.setCustomTrackBuffer(resolved.buffer, resolved.key);
    }
  }

  private resolveBufferForBiome(biomeIndex: number): { key: string; buffer: AudioBuffer } | null {
    if (this.trackBuffers.size === 0) return null;
    const specific = `bgm_biome_${biomeIndex + 1}`;
    if (this.trackBuffers.has(specific)) {
      return { key: specific, buffer: this.trackBuffers.get(specific)! };
    }
    const tierKey =
      biomeIndex <= 1 ? 'bgm_surface' : biomeIndex <= 3 ? 'bgm_deep' : 'bgm_void';
    if (this.trackBuffers.has(tierKey)) {
      return { key: tierKey, buffer: this.trackBuffers.get(tierKey)! };
    }
    const first = this.trackBuffers.entries().next();
    if (!first.done) {
      return { key: first.value[0], buffer: first.value[1] };
    }
    return null;
  }

  async loadCustomTrack(url: string): Promise<boolean> {
    if (!this.ctx || typeof fetch !== 'function') return false;
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const arr = await res.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(arr);
      this.setCustomTrackBuffer(decoded, 'custom');
      return true;
    } catch {
      return false;
    }
  }

  setCustomTrackBuffer(buffer: AudioBuffer | null, trackKey: string = 'custom'): void {
    this.customBuffer = buffer;
    this.activeTrackKey = buffer ? trackKey : '';
    if (buffer) {
      // Stop procedural scheduler immediately so MP3 and synth never overlap
      this.clearProceduralInterval();
      this.stopCustomSource();
      if (this.running && !this.pausedForAd && !this.pausedByHidden) {
        this.startCustomDeck(buffer, trackKey, 0.08);
      }
    } else {
      this.stopCustomSource();
      if (this.running && !this.pausedForAd && !this.pausedByHidden && this.schedulerId === null) {
        this.nextStepTime = Math.max((this.ctx?.currentTime ?? 0) + 0.04, this.nextStepTime);
        this.scheduler();
        this.schedulerId = setInterval(() => this.scheduler(), SCHEDULER_INTERVAL_MS);
      }
    }
  }

  setBiome(biomeIndex: number): void {
    const clamped = Math.max(0, Math.min(BIOME_THEMES.length - 1, Math.floor(biomeIndex)));
    if (clamped === this.pendingBiomeIndex) return;
    this.pendingBiomeIndex = clamped;
    if (!this.running) {
      this.activeBiomeIndex = clamped;
    }
    if (this.customBuffer && this.trackBuffers.size > 1) {
      const resolved = this.resolveBufferForBiome(clamped);
      if (resolved && resolved.key !== this.activeTrackKey) {
        this.crossfadeToTrack(resolved.buffer, resolved.key, BIOME_CROSSFADE_S);
      }
    }
  }

  setGameState(state: GameState, bossActive: boolean = false): void {
    this.bossActive = bossActive;
    const modal = isModalState(state);
    if (modal !== this.modalMuffled) {
      this.modalMuffled = modal;
      this.syncModalFilter();
    }
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

  getActiveBiomeIndex(): number {
    return this.activeBiomeIndex;
  }

  getActiveIntensity(): MusicIntensity {
    return this.activeIntensity;
  }

  isRunning(): boolean {
    return this.running && (this.schedulerId !== null || this.customDeckActive);
  }

  start(): void {
    if (!this.ctx || !this.outputBus) return;
    if (this.pausedForAd || this.pausedByHidden) return;

    this.activeBiomeIndex = this.pendingBiomeIndex;
    this.activeIntensity = this.pendingIntensity;
    this.syncMasterFilterCutoff();
    this.syncModalFilter();

    if (this.customBuffer) {
      this.clearProceduralInterval();
      this.running = true;
      if (!this.customDeckActive) {
        this.startCustomDeck(this.customBuffer, this.activeTrackKey || 'custom', 0.05);
      }
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
    this.clearProceduralInterval();
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

  private clearProceduralInterval(): void {
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private clearSchedulerOnly(): void {
    this.running = false;
    this.clearProceduralInterval();
  }

  private crossfadeToTrack(buffer: AudioBuffer, trackKey: string, fadeSec: number): void {
    this.customBuffer = buffer;
    this.activeTrackKey = trackKey;
    if (!this.running || this.pausedForAd || this.pausedByHidden || !this.ctx) return;

    const prevDeck = this.currentCustomDeck;
    if (prevDeck) {
      if (prevDeck.nextTimer !== null) {
        clearTimeout(prevDeck.nextTimer);
        prevDeck.nextTimer = null;
      }
      const now = this.ctx.currentTime;
      prevDeck.gain.gain.cancelScheduledValues(now);
      prevDeck.gain.gain.setValueAtTime(Math.max(0.0001, prevDeck.gain.gain.value), now);
      prevDeck.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      try {
        prevDeck.source.stop(now + fadeSec + 0.02);
      } catch {
        // ignore
      }
    }
    this.startCustomDeck(buffer, trackKey, fadeSec);
  }

  private startCustomDeck(buffer: AudioBuffer, trackKey: string, fadeInSec: number): void {
    const dest = this.modalFilter ?? this.outputBus;
    if (!this.ctx || !dest) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = false;

    const gain = ctx.createGain();
    if (fadeInSec > 0.005) {
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(1.0, now + fadeInSec);
    } else {
      gain.gain.setValueAtTime(1.0, now);
    }
    src.connect(gain);
    gain.connect(dest);

    const deck: CustomDeckHandle = {
      source: src,
      gain,
      nextTimer: null,
      trackKey,
    };
    this.activeCustomDecks.add(deck);
    this.currentCustomDeck = deck;
    this.customDeckActive = true;

    (src as { onended?: (() => void) | null }).onended = () => {
      if (deck.nextTimer !== null) {
        clearTimeout(deck.nextTimer);
        deck.nextTimer = null;
      }
      this.activeCustomDecks.delete(deck);
      if (this.currentCustomDeck === deck) {
        this.currentCustomDeck = null;
        this.customDeckActive = this.activeCustomDecks.size > 0;
      }
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        // ignore
      }
    };

    src.start(now);

    // Dual-deck gapless crossfade loop: schedule overlap 120ms before end
    const dur = Math.max(0.25, buffer.duration || 1);
    const overlap = Math.min(DECK_CROSSFADE_S, dur * 0.35);
    const delayMs = Math.max(40, (dur - overlap - 0.02) * 1000);
    deck.nextTimer = setTimeout(() => {
      deck.nextTimer = null;
      if (!this.running || this.pausedForAd || this.pausedByHidden) return;
      if (this.currentCustomDeck !== deck || !this.customBuffer) return;

      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
      gain.gain.linearRampToValueAtTime(0.0001, t + overlap);
      try {
        src.stop(t + overlap + 0.02);
      } catch {
        // ignore
      }
      this.startCustomDeck(this.customBuffer, this.activeTrackKey || trackKey, overlap);
    }, delayMs);
  }

  private stopCustomSource(): void {
    this.customDeckActive = false;
    this.currentCustomDeck = null;
    for (const deck of this.activeCustomDecks) {
      if (deck.nextTimer !== null) {
        clearTimeout(deck.nextTimer);
        deck.nextTimer = null;
      }
      try {
        deck.source.stop();
        deck.source.disconnect();
        deck.gain.disconnect();
      } catch {
        // ignore already-stopped nodes
      }
    }
    this.activeCustomDecks.clear();
  }

  private syncModalFilter(): void {
    if (!this.ctx || !this.modalFilter || !this.modalGain) return;
    const now = this.ctx.currentTime;
    this.modalFilter.frequency.setTargetAtTime(this.modalMuffled ? 780 : 18000, now, 0.14);
    this.modalGain.gain.setTargetAtTime(this.modalMuffled ? 0.58 : 1.0, now, 0.14);
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
      this.delayWet.gain.setTargetAtTime(
        this.activeIntensity === 'chill' ? 0.16 : 0.12,
        this.ctx.currentTime,
        0.2
      );
    }
    if (this.delayNode) {
      const echoS = (60 / theme.bpm) * 0.75;
      this.delayNode.delayTime.setTargetAtTime(echoS, this.ctx.currentTime, 0.25);
    }
  }

  private scheduler(): void {
    if (!this.ctx || !this.running || this.pausedForAd || this.pausedByHidden || this.customBuffer) {
      return;
    }
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
      this.stepIndex = (this.stepIndex + 1) % 128;
      safety++;
    }
  }

  private attachNodeCleanup(sources: AudioScheduledSourceNode[], nodes: AudioNode[]): void {
    const primary = sources[sources.length - 1];
    if (!primary) return;
    (primary as { onended?: (() => void) | null }).onended = () => {
      for (const s of sources) {
        try {
          s.disconnect();
        } catch {
          // ignore
        }
      }
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          // ignore
        }
      }
    };
  }

  private scheduleStep(phraseStep: number, time: number): void {
    if (!this.ctx || !this.rhythmDryBus || !this.harmonyBus || !this.melodyBus) return;

    const isSectionB = phraseStep >= 64;
    const step = phraseStep % 64;

    if (phraseStep % 4 === 0 && this.pendingIntensity !== this.activeIntensity) {
      const droppedIntoRun = this.pendingIntensity === 'running' && this.activeIntensity !== 'running';
      this.activeIntensity = this.pendingIntensity;
      this.syncMasterFilterCutoff();
      if (droppedIntoRun) {
        this.triggerSnare(time, 0.16);
      }
    }
    if (phraseStep % 8 === 0 && this.pendingBiomeIndex !== this.activeBiomeIndex) {
      this.activeBiomeIndex = this.pendingBiomeIndex;
      this.syncMasterFilterCutoff();
    }

    const theme = BIOME_THEMES[this.activeBiomeIndex];
    const stepDur = 60 / theme.bpm / 4;
    const intensity = this.activeIntensity;

    const barStep = step % 16;
    if (barStep === 0 || barStep === 6) {
      const chordIdx = Math.floor(step / 16) % theme.chords.length;
      const dur = barStep === 0 ? stepDur * 5.5 : stepDur * 7.5;
      const vol =
        (barStep === 0 ? 1.0 : 0.65) *
        (intensity === 'chill' ? 0.14 : intensity === 'aiming' ? 0.12 : 0.10);
      this.triggerRhodesChord(theme.chords[chordIdx], time, dur, vol);
    }

    const bassMidi = theme.bass[step];
    if (bassMidi !== null) {
      const bassVol = intensity === 'chill' ? 0.26 : intensity === 'aiming' ? 0.30 : 0.34;
      this.triggerBass(midiToHz(bassMidi), time, stepDur * 1.65, bassVol);
    }

    const leadMidi = isSectionB ? theme.leadB[step] : theme.lead[step];
    if (leadMidi !== null) {
      const leadVol = intensity === 'chill' ? 0.18 : intensity === 'aiming' ? 0.22 : 0.27;
      const dur = stepDur * 1.85;
      this.triggerLead(midiToHz(leadMidi), theme.timbre, time, dur, leadVol);
    }

    if (isSectionB && intensity !== 'chill') {
      const counterMidi = theme.counter[step];
      if (counterMidi !== null) {
        this.triggerCounterArp(midiToHz(counterMidi), time, stepDur * 1.15, 0.085);
      }
    }

    const isTurnaroundBar = phraseStep >= 112 || (phraseStep >= 48 && phraseStep < 64);
    if (intensity === 'aiming') {
      if (barStep === 0 || barStep === 8) {
        this.triggerKick(time, 0.21);
      }
      if (theme.hatMask[barStep]) {
        this.triggerHat(time, barStep % 2 === 0 ? 0.032 : 0.018);
      }
    } else if (intensity === 'running') {
      if (theme.kickMask[barStep] || (this.bossActive && barStep === 8)) {
        this.triggerKick(time, 0.38);
      }
      if (theme.snareMask[barStep] || (isTurnaroundBar && (barStep === 14 || barStep === 15))) {
        this.triggerSnare(time, barStep >= 14 ? 0.11 : 0.14);
      }
      if (theme.hatMask[barStep]) {
        this.triggerHat(time, barStep % 2 === 0 ? 0.044 : 0.024);
      }
    }

    // Syncopated Boss Gate ostinato with breathing rests (no 16th-note ear fatigue)
    if (this.bossActive && intensity !== 'chill' && BOSS_OSTINATO_MASK[barStep]) {
      const ostMidi = theme.ostinato[step % theme.ostinato.length] + (step % 4 === 0 ? 12 : 0);
      this.triggerOstinatoPulse(midiToHz(ostMidi), time, stepDur * 0.72, 0.10);
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
    // True -1 octave sub layer (clamped >= 36 Hz so phone speakers remain audible)
    sub.type = 'sine';
    sub.frequency.setValueAtTime(Math.max(36, freq * 0.5), time);
    subMix.gain.setValueAtTime(0.45, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(1100, freq * 5.2), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(140, freq * 2.4), time + dur);
    filter.Q.setValueAtTime(0.8, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

    osc.connect(filter);
    sub.connect(subMix).connect(filter);
    filter.connect(gain).connect(this.rhythmDryBus);

    this.attachNodeCleanup([osc, sub], [subMix, filter, gain]);
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
    const bodies: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [masterGain];

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
      bodies.push(body);
      nodes.push(bGain);

      const tine = ctx.createOscillator();
      const tGain = ctx.createGain();
      tine.type = 'triangle';
      tine.frequency.setValueAtTime(f * 2, time);
      tGain.gain.setValueAtTime(perVoice * 0.16, time);
      tGain.gain.exponentialRampToValueAtTime(0.0008, time + Math.min(0.09, dur * 0.4));
      tine.connect(tGain).connect(masterGain);
      this.attachNodeCleanup([tine], [tGain]);
      tine.start(time);
      tine.stop(time + Math.min(0.1, dur * 0.45));
    }

    this.attachNodeCleanup(bodies, nodes);
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

      this.attachNodeCleanup([body, warm], [warmGain, gain]);
      body.start(time);
      warm.start(time);
      body.stop(time + dur + 0.02);
      warm.stop(time + dur + 0.02);
      return;
    }

    if (timbre === 'crystal') {
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const body = ctx.createOscillator();
      const gain = ctx.createGain();

      mod.type = 'sine';
      mod.frequency.setValueAtTime(freq * 3.5, time);
      modGain.gain.setValueAtTime(freq * 1.4, time);
      modGain.gain.exponentialRampToValueAtTime(freq * 0.05, time + dur * 0.55);

      body.type = 'sine';
      body.frequency.setValueAtTime(freq, time);
      mod.connect(modGain).connect(body.frequency);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(vol * 0.92, time + 0.007);
      gain.gain.exponentialRampToValueAtTime(0.0008, time + dur * 1.15);

      body.connect(gain).connect(out);
      this.attachNodeCleanup([mod, body], [modGain, gain]);
      mod.start(time);
      body.start(time);
      mod.stop(time + dur * 1.2);
      body.stop(time + dur * 1.2);
      return;
    }

    if (timbre === 'synthwave') {
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      oscA.type = 'sawtooth';
      oscB.type = 'square';
      oscA.frequency.setValueAtTime(freq * 0.996, time);
      oscB.frequency.setValueAtTime(freq * 1.004, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(3400, freq * 4.0), time);
      filter.frequency.exponentialRampToValueAtTime(Math.max(480, freq * 1.4), time + dur);
      filter.Q.setValueAtTime(1.8, time);

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(vol * 0.65, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain).connect(out);
      this.attachNodeCleanup([oscA, oscB], [filter, gain]);
      oscA.start(time);
      oscB.start(time);
      oscA.stop(time + dur + 0.02);
      oscB.stop(time + dur + 0.02);
      return;
    }

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const bMix = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    oscA.type = timbre === 'arcade' ? 'square' : 'triangle';
    oscB.type = 'sawtooth';
    oscA.frequency.setValueAtTime(freq, time);
    oscB.frequency.setValueAtTime(freq * (timbre === 'arcade' ? 2.0 : 1.003), time);
    bMix.gain.setValueAtTime(timbre === 'arcade' ? 0.2 : 0.3, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(2800, freq * 3.4), time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(420, freq * 1.35), time + dur);
    filter.Q.setValueAtTime(0.95, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol * 0.85, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

    oscA.connect(filter);
    oscB.connect(bMix).connect(filter);
    filter.connect(gain).connect(out);

    this.attachNodeCleanup([oscA, oscB], [bMix, filter, gain]);
    oscA.start(time);
    oscB.start(time);
    oscA.stop(time + dur + 0.02);
    oscB.stop(time + dur + 0.02);
  }

  private triggerCounterArp(freq: number, time: number, dur: number, vol: number): void {
    if (!this.ctx || !this.melodyBus) return;
    const dest = this.melodyPanLeft ?? this.melodyBus;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    osc.connect(gain).connect(dest);
    this.attachNodeCleanup([osc], [gain]);
    osc.start(time);
    osc.stop(time + dur + 0.015);
  }

  private triggerKick(time: number, vol: number): void {
    if (!this.ctx || !this.rhythmDryBus) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(132, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.055);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    osc.connect(gain).connect(this.rhythmDryBus);
    this.attachNodeCleanup([osc], [gain]);
    osc.start(time);
    osc.stop(time + 0.15);

    // 2.5 kHz 8ms beater click so kicks cut through small mobile speakers
    const click = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(2500, time);
    click.frequency.exponentialRampToValueAtTime(750, time + 0.008);
    clickGain.gain.setValueAtTime(vol * 0.28, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.009);
    click.connect(clickGain).connect(this.rhythmDryBus);
    this.attachNodeCleanup([click], [clickGain]);
    click.start(time);
    click.stop(time + 0.012);
  }

  private triggerSnare(time: number, vol: number): void {
    if (!this.ctx || !this.rhythmDryBus) return;
    const dest = this.rhythmPanCenter ?? this.rhythmDryBus;
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1750, time);
      filter.Q.setValueAtTime(1.2, time);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol * 0.78, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      noise.connect(filter).connect(gain).connect(dest);
      this.attachNodeCleanup([noise], [filter, gain]);
      noise.start(time);
      noise.stop(time + 0.09);
    }

    const body = this.ctx.createOscillator();
    const bGain = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(205, time);
    body.frequency.exponentialRampToValueAtTime(118, time + 0.055);
    bGain.gain.setValueAtTime(vol * 0.78, time);
    bGain.gain.exponentialRampToValueAtTime(0.001, time + 0.068);
    body.connect(bGain).connect(dest);
    this.attachNodeCleanup([body], [bGain]);
    body.start(time);
    body.stop(time + 0.075);
  }

  private triggerHat(time: number, vol: number): void {
    if (!this.ctx || !this.rhythmDryBus || !this.noiseBuffer) return;
    const dest = this.rhythmPanRight ?? this.rhythmDryBus;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(8200, time);
    bp.Q.setValueAtTime(2.2, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.026);
    noise.connect(bp).connect(gain).connect(dest);
    this.attachNodeCleanup([noise], [bp, gain]);
    noise.start(time);
    noise.stop(time + 0.032);
  }

  private triggerOstinatoPulse(freq: number, time: number, dur: number, vol: number): void {
    if (!this.ctx || !this.rhythmDryBus) return;
    const dest = this.rhythmPanLeft ?? this.rhythmDryBus;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1350, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    osc.connect(filter).connect(gain).connect(dest);
    this.attachNodeCleanup([osc], [filter, gain]);
    osc.start(time);
    osc.stop(time + dur + 0.015);
  }
}
