import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';
import { BIOME_THEMES } from '../src/audio/MusicEngine';
import { StateMachine } from '../src/core/StateMachine';

class MockAudioParam {
  value: number;
  lastLinearTarget: number | null = null;
  lastSetTarget: number | null = null;

  constructor(initial = 0) {
    this.value = initial;
  }

  setValueAtTime(v: number, _t: number): this {
    this.value = v;
    return this;
  }

  linearRampToValueAtTime(v: number, _t: number): this {
    this.lastLinearTarget = v;
    this.value = v;
    return this;
  }

  exponentialRampToValueAtTime(v: number, _t: number): this {
    this.lastLinearTarget = v;
    this.value = v;
    return this;
  }

  setTargetAtTime(v: number, _t: number, _tc: number): this {
    this.lastSetTarget = v;
    this.value = v;
    return this;
  }

  cancelScheduledValues(_t: number): this {
    return this;
  }
}

class MockAudioNode {
  connect(dest: unknown): unknown {
    return dest;
  }
  disconnect(): void {}
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam(1);
}

class MockFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new MockAudioParam(350);
  Q = new MockAudioParam(1);
}

class MockCompressorNode extends MockAudioNode {
  threshold = new MockAudioParam(-24);
  knee = new MockAudioParam(30);
  ratio = new MockAudioParam(12);
  attack = new MockAudioParam(0.003);
  release = new MockAudioParam(0.25);
}

class MockDelayNode extends MockAudioNode {
  delayTime = new MockAudioParam(0);
}

class MockOscillatorNode extends MockAudioNode {
  type: OscillatorType = 'sine';
  frequency = new MockAudioParam(440);
  started = false;
  stopped = false;
  start(_when?: number): void {
    this.started = true;
  }
  stop(_when?: number): void {
    this.stopped = true;
  }
}

class MockBufferSourceNode extends MockAudioNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  started = false;
  stopped = false;
  start(_when?: number): void {
    this.started = true;
  }
  stop(_when?: number): void {
    this.stopped = true;
  }
}

class MockAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state: AudioContextState = 'running';
  destination = new MockAudioNode();
  oscillatorCount = 0;
  compressorCount = 0;
  suspendCount = 0;
  resumeCount = 0;
  gains: MockGainNode[] = [];

  createGain(): GainNode {
    const g = new MockGainNode();
    this.gains.push(g);
    return g as unknown as GainNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    return new MockFilterNode() as unknown as BiquadFilterNode;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    this.compressorCount++;
    return new MockCompressorNode() as unknown as DynamicsCompressorNode;
  }

  createDelay(): DelayNode {
    return new MockDelayNode() as unknown as DelayNode;
  }

  createOscillator(): OscillatorNode {
    this.oscillatorCount++;
    return new MockOscillatorNode() as unknown as OscillatorNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    return new MockBufferSourceNode() as unknown as AudioBufferSourceNode;
  }

  createBuffer(_channels: number, length: number, sampleRate: number): AudioBuffer {
    const data = new Float32Array(length);
    return {
      sampleRate,
      length,
      numberOfChannels: 1,
      duration: length / sampleRate,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
  }

  async suspend(): Promise<void> {
    this.state = 'suspended';
    this.suspendCount++;
  }

  async resume(): Promise<void> {
    this.state = 'running';
    this.resumeCount++;
  }
}

describe('Adaptive Music & Audio Mastering (Phase 14)', () => {
  let mockCtxInstance: MockAudioContext | null = null;
  const originalWindow = (globalThis as Record<string, unknown>).window;

  beforeEach(() => {
    vi.useFakeTimers();
    mockCtxInstance = null;

    class Ctor extends MockAudioContext {
      constructor() {
        super();
        mockCtxInstance = this;
      }
    }

    (globalThis as Record<string, unknown>).window = {
      AudioContext: Ctor,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as Record<string, unknown>).window = originalWindow;
  });

  it('unlocks clean separate SFX & compressed Music routing and fades music in', () => {
    const audio = new AudioEngine(false, false, false, 'high');
    expect(audio.hasAudioRouting()).toBe(false);

    audio.unlock();
    expect(audio.hasAudioRouting()).toBe(true);
    expect(audio.isMusicPlaying()).toBe(true);
    expect(mockCtxInstance).not.toBeNull();
    expect(mockCtxInstance!.compressorCount).toBe(1);
    // gain[0] = sfxGain (~0.75), gain[1] = musicDuckGain (1.0), gain[2] = musicGain (~0.28)
    expect(mockCtxInstance!.gains[0].gain.value).toBeCloseTo(0.75, 2);
    expect(mockCtxInstance!.gains[2].gain.lastLinearTarget).toBeCloseTo(0.28, 2);

    // Advance real-time 25ms lookahead ticks cleanly over ~400ms
    const beforeOsc = mockCtxInstance!.oscillatorCount;
    for (let i = 0; i < 16; i++) {
      mockCtxInstance!.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }
    expect(mockCtxInstance!.oscillatorCount).toBeGreaterThan(beforeOsc);
  });

  it('respects Global Mute and independent Settings Music toggle + 3-step volume', () => {
    const audio = new AudioEngine(false, false, false, 'high');
    audio.unlock();
    expect(audio.isMusicPlaying()).toBe(true);

    // Disable only music via Settings -> music stops, SFX still works
    audio.setMusicMuted(true);
    expect(audio.isMusicMuted()).toBe(true);
    expect(audio.isMusicPlaying()).toBe(false);

    const oscBeforeSfx = mockCtxInstance!.oscillatorCount;
    audio.playClick();
    expect(mockCtxInstance!.oscillatorCount).toBe(oscBeforeSfx + 1);

    // Settings Low volume -> music resumes cleanly at 50% of 0.28 = 0.14
    audio.setMusicVolume('low');
    expect(audio.isMusicMuted()).toBe(false);
    expect(audio.getMusicVolume()).toBe('low');
    expect(audio.isMusicPlaying()).toBe(true);
    expect(mockCtxInstance!.gains[2].gain.lastLinearTarget).toBeCloseTo(0.14, 2);

    // Global Mute silences both SFX and Music and suspends context
    audio.setUserMuted(true);
    expect(audio.isMuted()).toBe(true);
    expect(audio.isMusicPlaying()).toBe(false);
    expect(mockCtxInstance!.suspendCount).toBeGreaterThanOrEqual(1);

    const oscDuringMute = mockCtxInstance!.oscillatorCount;
    audio.playClick();
    expect(mockCtxInstance!.oscillatorCount).toBe(oscDuringMute);

    // Global Unmute resumes music smoothly because Settings Music is 'low'
    audio.setUserMuted(false);
    expect(audio.isMusicPlaying()).toBe(true);
  });

  it('suspends and resumes cleanly on pauseForAd() / resumeFromAd() without duplicating schedulers', () => {
    const audio = new AudioEngine(false, false, false, 'high');
    audio.unlock();
    const musicEngine = audio.getMusicEngine();

    // Calling start() redundantly never spawns a duplicate timer
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    musicEngine.start();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    // Ad starts -> ramps music to 0 and stops lookahead scheduler
    audio.pauseForAd();
    expect(audio.isMusicPlaying()).toBe(false);
    expect(musicEngine.isRunning()).toBe(false);
    expect(mockCtxInstance!.gains[2].gain.lastLinearTarget).toBe(0);

    // Ad ends -> single clean resume if not muted
    audio.resumeFromAd();
    expect(audio.isMusicPlaying()).toBe(true);
    expect(musicEngine.isRunning()).toBe(true);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    // If music was muted by user before ad, resumeFromAd() keeps music muted
    audio.setMusicMuted(true);
    audio.pauseForAd();
    audio.resumeFromAd();
    expect(audio.isMusicPlaying()).toBe(false);
    expect(musicEngine.isRunning()).toBe(false);
  });

  it('switches cleanly across all 6 biomes, state intensities, ducking, and custom buffers', () => {
    const audio = new AudioEngine(false, false, false, 'high');
    audio.unlock();
    const sm = new StateMachine();
    sm.transition('TITLE');
    audio.updateMusicState(0, sm.state, false);
    expect(audio.getMusicIntensity()).toBe('chill');

    sm.transition('AIMING');
    sm.transition('RUNNING');
    for (let b = 0; b < BIOME_THEMES.length; b++) {
      audio.updateMusicState(b, sm.state, b === 5);
      // Advance simulated audio clock + lookahead timer past a full bar (16 steps) so crossfade commits cleanly
      for (let step = 0; step < 32; step++) {
        mockCtxInstance!.currentTime += 0.14;
        vi.advanceTimersByTime(30);
      }
      expect(audio.getMusicBiomeIndex()).toBe(b);
      expect(audio.getMusicIntensity()).toBe('running');
    }

    // Ducking dips musicDuckGain smoothly to 0.45 and recovers to 1.0
    audio.duck(500);
    expect(mockCtxInstance!.gains[1].gain.lastLinearTarget).toBeCloseTo(1.0, 2);

    // Custom AudioBuffer drop-in hook works cleanly without throwing
    const customBuf = mockCtxInstance!.createBuffer(1, 44100, 44100);
    const me = audio.getMusicEngine();
    me.setCustomTrackBuffer(customBuf);
    audio.pauseForAd();
    audio.resumeFromAd();
    me.setCustomTrackBuffer(null);
  });

  it('throttles rapid SFX within 55ms and caps active SFX voices at 16', () => {
    const audio = new AudioEngine(false, false, false, 'high');
    audio.unlock();

    // Rapid wall hits within 10ms should be throttled after the first
    const oscBefore = mockCtxInstance!.oscillatorCount;
    for (let i = 0; i < 6; i++) {
      audio.playWallHit(900, 120 + i * 20);
    }
    expect(mockCtxInstance!.oscillatorCount - oscBefore).toBe(1);

    // Distinct sounds triggering rapidly never exceed 16 concurrent active SFX voices
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(60);
      audio.playHit(i, true, false, 950, 270);
      expect(audio.getActiveVoiceCount()).toBeLessThanOrEqual(16);
    }
  });
});
