import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';
import { BIOME_THEMES } from '../src/audio/MusicEngine';
import { StateMachine } from '../src/core/StateMachine';
import { PhysicsEngine } from '../src/physics/PhysicsEngine';
import { PlatformSDKManager } from '../src/sdk/PlatformSDK';
import { CrazyGamesAdapter } from '../src/sdk/adapters/CrazyGamesAdapter';
import type { BlockEntity } from '../src/world/Entities';

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

  cancelAndHoldAtTime(_t: number): this {
    return this;
  }
}

class MockAudioNode {
  connections: unknown[] = [];
  connect(dest: unknown): unknown {
    this.connections.push(dest);
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

class MockPannerNode extends MockAudioNode {
  pan = new MockAudioParam(0);
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
  playbackRate = new MockAudioParam(1);
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
  pannerCount = 0;
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

  createStereoPanner(): StereoPannerNode {
    this.pannerCount++;
    return new MockPannerNode() as unknown as StereoPannerNode;
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

describe('Adaptive Music, Audio Mastering & Compliance', () => {
  let mockCtxInstance: MockAudioContext | null = null;
  let windowListeners: Map<string, Set<EventListenerOrEventListenerObject>>;
  const originalWindow = (globalThis as Record<string, unknown>).window;

  beforeEach(() => {
    vi.useFakeTimers();
    mockCtxInstance = null;
    windowListeners = new Map();

    class Ctor extends MockAudioContext {
      constructor() {
        super();
        mockCtxInstance = this;
      }
    }

    (globalThis as Record<string, unknown>).window = {
      AudioContext: Ctor,
      addEventListener: vi.fn((type: string, fn: EventListenerOrEventListenerObject) => {
        const set = windowListeners.get(type) ?? new Set();
        set.add(fn);
        windowListeners.set(type, set);
      }),
      removeEventListener: vi.fn((type: string, fn: EventListenerOrEventListenerObject) => {
        windowListeners.get(type)?.delete(fn);
      }),
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as Record<string, unknown>).window = originalWindow;
  });

  it('unlocks clean master limiter + SFX + Music routing and fades music in', () => {
    const audio = new AudioEngine(false, false, false, 'high');
    expect(audio.hasAudioRouting()).toBe(false);

    audio.unlock();
    expect(audio.hasAudioRouting()).toBe(true);
    expect(audio.isMusicPlaying()).toBe(true);
    expect(mockCtxInstance).not.toBeNull();
    // 3 compressors: masterLimiter, musicCompressor, sfxCompressor
    expect(mockCtxInstance!.compressorCount).toBe(3);

    const buses = audio.getDebugBuses();
    expect((buses.sfxGain as unknown as MockGainNode).gain.value).toBeCloseTo(0.75, 2);
    expect((buses.musicGain as unknown as MockGainNode).gain.lastLinearTarget).toBeCloseTo(0.28, 2);
    expect((buses.masterGain as unknown as MockGainNode).gain.value).toBeCloseTo(1.0, 2);

    const limiter = buses.masterLimiter as unknown as MockCompressorNode;
    expect(limiter.threshold.value).toBeCloseTo(-1.5, 2);
    expect(limiter.ratio.value).toBe(20);
    expect(limiter.connections).toContain(mockCtxInstance!.destination);

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
    const buses = audio.getDebugBuses();
    expect(audio.isMusicPlaying()).toBe(true);

    audio.setMusicMuted(true);
    expect(audio.isMusicMuted()).toBe(true);
    expect(audio.isMusicPlaying()).toBe(false);

    const oscBeforeSfx = mockCtxInstance!.oscillatorCount;
    audio.playClick();
    expect(mockCtxInstance!.oscillatorCount).toBeGreaterThan(oscBeforeSfx);

    audio.setMusicVolume('low');
    expect(audio.isMusicMuted()).toBe(false);
    expect(audio.getMusicVolume()).toBe('low');
    expect(audio.isMusicPlaying()).toBe(true);
    expect((buses.musicGain as unknown as MockGainNode).gain.lastLinearTarget).toBeCloseTo(0.14, 2);

    audio.setUserMuted(true);
    expect(audio.isMuted()).toBe(true);
    expect(audio.isMusicPlaying()).toBe(false);
    expect(mockCtxInstance!.suspendCount).toBeGreaterThanOrEqual(1);

    const oscDuringMute = mockCtxInstance!.oscillatorCount;
    audio.playClick();
    expect(mockCtxInstance!.oscillatorCount).toBe(oscDuringMute);

    audio.setUserMuted(false);
    expect(audio.isMusicPlaying()).toBe(true);
  });

  it('enforces CrazyGames muteAudio priority over in-game toggles and wires adStarted', async () => {
    let settingsCb: ((s: { muteAudio?: boolean }) => void) | null = null;
    const adStartedCalls: string[] = [];
    (globalThis as Record<string, unknown>).window = {
      ...(globalThis as Record<string, unknown>).window as object,
      location: { search: '' },
      CrazyGames: {
        SDK: {
          environment: 'crazygames',
          init: async () => {},
          ad: {
            hasAdblock: async () => false,
            requestAd: (
              _type: 'midgame' | 'rewarded',
              cbs: { adStarted?: () => void; adFinished?: () => void; adError?: () => void }
            ) => {
              expect(typeof cbs.adStarted).toBe('function');
              cbs.adStarted?.();
              cbs.adFinished?.();
            },
          },
          game: {
            settings: { muteAudio: true },
            addSettingsChangeListener: (cb: (s: { muteAudio?: boolean }) => void) => {
              settingsCb = cb;
            },
          },
        },
      },
    };

    const adapter = new CrazyGamesAdapter();
    const sdk = new PlatformSDKManager(adapter);
    const audio = new AudioEngine(false, false, false, 'high');
    sdk.setAdLifecycleCallbacks({
      onBeforeAd: () => audio.pauseForAd(),
      onAdStarted: () => {
        adStartedCalls.push('adStarted');
        audio.pauseForAd();
      },
      onAfterAd: () => audio.resumeFromAd(),
    });

    await sdk.init();
    audio.setPlatformMuted(sdk.isPlatformMuted());
    sdk.onPlatformMuteChange((m) => audio.setPlatformMuted(m));
    audio.unlock();

    // Platform muteAudio=true strictly overrides user toggles
    expect(audio.isPlatformMuted()).toBe(true);
    expect(audio.isMuted()).toBe(true);
    expect(audio.isMusicPlaying()).toBe(false);
    expect(audio.toggleMute()).toBe(true);
    audio.setSfxMuted(false);
    audio.setMusicVolume('high');
    expect(audio.isMusicPlaying()).toBe(false);

    const oscBefore = mockCtxInstance!.oscillatorCount;
    audio.playClick();
    expect(mockCtxInstance!.oscillatorCount).toBe(oscBefore);

    // Unmuting via CrazyGames settings listener restores audio
    (settingsCb as ((s: { muteAudio?: boolean }) => void) | null)?.({ muteAudio: false });
    expect(audio.isPlatformMuted()).toBe(false);
    expect(audio.isMusicPlaying()).toBe(true);

    // Ad lifecycle fires adStarted and cleanly restores afterwards
    await sdk.showMidgameAd();
    expect(adStartedCalls).toEqual(['adStarted']);
    expect(audio.isMusicPlaying()).toBe(true);
  });

  it('recovers iOS interrupted AudioContext on touchend', () => {
    const audio = new AudioEngine(false, false, false, 'high');
    audio.unlock();
    expect(mockCtxInstance).not.toBeNull();

    // Simulate iOS WebKit transitioning AudioContext.state to 'interrupted'
    (mockCtxInstance as unknown as { state: string }).state = 'interrupted';
    audio.armIosResume();

    const touchendHandlers = Array.from(windowListeners.get('touchend') ?? []);
    expect(touchendHandlers.length).toBeGreaterThan(0);
    for (const h of touchendHandlers) {
      if (typeof h === 'function') h(new Event('touchend'));
    }
    expect(mockCtxInstance!.resumeCount).toBeGreaterThanOrEqual(1);
    expect(mockCtxInstance!.state).toBe('running');
  });

  it('suspends and resumes cleanly on pauseForAd() / resumeFromAd() without duplicating schedulers', () => {
    const audio = new AudioEngine(false, false, false, 'high');
    audio.unlock();
    const musicEngine = audio.getMusicEngine();
    const buses = audio.getDebugBuses();

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    musicEngine.start();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    audio.playFanfare();
    expect(audio.getActiveVoiceCount()).toBeGreaterThan(0);

    audio.pauseForAd();
    expect(audio.isMusicPlaying()).toBe(false);
    expect(musicEngine.isRunning()).toBe(false);
    expect(audio.getActiveVoiceCount()).toBe(0);
    expect((buses.musicGain as unknown as MockGainNode).gain.lastLinearTarget).toBe(0);

    vi.advanceTimersByTime(60);
    expect(mockCtxInstance!.suspendCount).toBeGreaterThanOrEqual(1);

    audio.resumeFromAd();
    expect(audio.isMusicPlaying()).toBe(true);
    expect(musicEngine.isRunning()).toBe(true);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    audio.setMusicMuted(true);
    audio.pauseForAd();
    audio.resumeFromAd();
    expect(audio.isMusicPlaying()).toBe(false);
    expect(musicEngine.isRunning()).toBe(false);
  });

  it('allocates zero new StereoPannerNodes across 60s of MusicEngine playback and keeps isRunning() true for customBuffer', () => {
    const audio = new AudioEngine(false, false, false, 'high');
    audio.unlock();
    const pannersAtStart = mockCtxInstance!.pannerCount;

    // Advance 60 seconds of simulated 25ms lookahead ticks
    for (let i = 0; i < 2400; i++) {
      mockCtxInstance!.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }
    expect(mockCtxInstance!.pannerCount).toBe(pannersAtStart);

    const me = audio.getMusicEngine();
    const customBuf = mockCtxInstance!.createBuffer(1, 44100, 44100);
    me.setCustomTrackBuffer(customBuf);
    expect(me.isRunning()).toBe(true);
    expect(audio.isMusicPlaying()).toBe(true);

    audio.pauseForAd();
    expect(me.isRunning()).toBe(false);
    audio.resumeFromAd();
    expect(me.isRunning()).toBe(true);
    me.setCustomTrackBuffer(null);
    expect(me.isRunning()).toBe(true);
  });

  it('switches cleanly across all 6 biomes, state intensities, and ducking', () => {
    const audio = new AudioEngine(false, false, false, 'high');
    audio.unlock();
    const buses = audio.getDebugBuses();
    const sm = new StateMachine();
    sm.transition('TITLE');
    audio.updateMusicState(0, sm.state, false);
    expect(audio.getMusicIntensity()).toBe('chill');

    sm.transition('AIMING');
    sm.transition('RUNNING');
    for (let b = 0; b < BIOME_THEMES.length; b++) {
      audio.updateMusicState(b, sm.state, b === 5);
      for (let step = 0; step < 32; step++) {
        mockCtxInstance!.currentTime += 0.14;
        vi.advanceTimersByTime(30);
      }
      expect(audio.getMusicBiomeIndex()).toBe(b);
      expect(audio.getMusicIntensity()).toBe('running');
    }

    audio.duck(500);
    expect((buses.musicDuckGain as unknown as MockGainNode).gain.lastLinearTarget).toBeCloseTo(1.0, 2);
  });

  it('uses priority throttles (never dropping vault/boss_core behind strata), caps voices at 24, and avoids kill double-fire', () => {
    const audio = new AudioEngine(false, false, false, 'high');
    audio.unlock();

    // Rapid wall hits within 10ms throttle after the first
    const oscBefore = mockCtxInstance!.oscillatorCount;
    for (let i = 0; i < 6; i++) {
      audio.playWallHit(900, 120 + i * 20);
    }
    expect(mockCtxInstance!.oscillatorCount - oscBefore).toBe(1);

    // Strata hit does NOT swallow boss_core / vault hit on the same millisecond
    const oscBeforePriority = mockCtxInstance!.oscillatorCount;
    audio.playHit(0, false, 'strata', 900, 200);
    const afterStrata = mockCtxInstance!.oscillatorCount;
    expect(afterStrata).toBeGreaterThan(oscBeforePriority);
    audio.playHit(0, false, 'boss_core', 900, 270);
    expect(mockCtxInstance!.oscillatorCount).toBeGreaterThan(afterStrata);

    // Cap polyphony at 24 active SFX voices
    for (let i = 0; i < 40; i++) {
      vi.advanceTimersByTime(60);
      audio.playHit(i, true, false, 950, 270);
      expect(audio.getActiveVoiceCount()).toBeLessThanOrEqual(24);
    }

    // Physics block kill marks meta.willKill = true so main.ts skips redundant playHit
    const physics = new PhysicsEngine();
    const block: BlockEntity = {
      id: 1,
      kind: 'strata',
      col: 4,
      row: 4,
      colSpan: 1,
      x: 242,
      y: 242,
      width: 56,
      height: 56,
      radius: 0,
      hp: 10,
      maxHp: 10,
      depthMeters: 10,
      biomeIndex: 0,
      hitFlashTimer: 0,
      alive: true,
    };
    let hitCalls = 0;
    let killMetaFlag = false;
    let destroyCalls = 0;
    physics.setEvents({
      onBlockHit: (_orb, _b, _dmg, _cleaved, meta) => {
        hitCalls++;
        if (meta?.willKill) killMetaFlag = true;
      },
      onBlockDestroyed: () => {
        destroyCalls++;
      },
    });
    const orb = physics.createOrb(270, 220, Math.PI / 2, 14, 10, 50);
    for (let i = 0; i < 5; i++) {
      physics.step(1 / 120, [orb], [block], 1, 1, 0, 0);
    }
    expect(hitCalls).toBe(1);
    expect(killMetaFlag).toBe(true);
    expect(destroyCalls).toBe(1);
  });

  it('plays all Stage 2, passive, and UI SFX cleanly', () => {
    const audio = new AudioEngine(false, false, false, 'high');
    audio.unlock();
    const oscBefore = mockCtxInstance!.oscillatorCount;

    audio.playAimTick(44);
    audio.playAimCancel();
    audio.playLaunch();
    audio.playLaunchVolleyOrb(1);
    audio.playHit(2, false, 'ore', 950, 200);
    audio.playCrunch('frost', 300);
    audio.playLaserBeam(270);
    audio.playPortalWarp(180);
    audio.playArmorClang(270);
    audio.playCritHit(true, 270);
    audio.playWeakPointLock();
    audio.playBossPhase2();
    audio.playBossShardSpawn();
    audio.playBossShardSalvage(250);
    audio.playPassiveCue('burn', 220);
    audio.playPassiveCue('chill', 240);
    audio.playPassiveCue('acid', 260);
    audio.playPassiveCue('void', 280);
    audio.playPassiveCue('gyro', 10);
    audio.playDroneShot(240);
    audio.playPickup('split', 250);
    audio.playOverclockReady();
    audio.playOrbExpired();
    audio.playPerkOpen();
    audio.playPerkSelect();
    audio.playRecall();
    audio.playMagPulse();
    audio.playOverclock();
    audio.playLightning();
    audio.playModalOpen();
    audio.playModalClose();
    audio.playError();
    audio.playElevator();
    audio.playBiomeUnlock();

    expect(mockCtxInstance!.oscillatorCount).toBeGreaterThan(oscBefore);
    expect(audio.getActiveVoiceCount()).toBeLessThanOrEqual(24);
  });
});
