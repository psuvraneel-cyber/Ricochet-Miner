import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';
import { UPGRADES, BIOMES } from '../src/config/gameConfig';
import { StateMachine } from '../src/core/StateMachine';
import { TRANSLATIONS, type SupportedLocale } from '../src/i18n/translations';
import { SpriteAtlas } from '../src/rendering/SpriteAtlas';
import { PlatformSDK, PlatformSDKManager, type AdResult, type IPortalAdapter } from '../src/sdk/PlatformSDK';
import { CrazyGamesAdapter } from '../src/sdk/adapters/CrazyGamesAdapter';
import { SaveManager, createDefaultSave } from '../src/sdk/SaveManager';
import { AdButton } from '../src/ui/AdButton';

function createSpyAdapter(opts: { adResult?: AdResult; delayMs?: number } = {}) {
  const calls: string[] = [];
  const adapter: IPortalAdapter = {
    name: 'spy',
    supportsBanners: true,
    hideFullscreenButton: false,
    async init() {
      calls.push('init');
    },
    loadingStart() {
      calls.push('loadingStart');
    },
    loadingStop() {
      calls.push('loadingStop');
    },
    gameplayStart() {
      calls.push('gameplayStart');
    },
    gameplayStop() {
      calls.push('gameplayStop');
    },
    happytime() {
      calls.push('happytime');
    },
    async showMidgameAd() {
      calls.push('showMidgameAd');
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      return opts.adResult ?? { rewarded: true, reason: 'finished' };
    },
    async showRewardedAd(placementId: string) {
      calls.push(`showRewardedAd:${placementId}`);
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      return opts.adResult ?? { rewarded: true, reason: 'finished' };
    },
    requestBanner(id: string) {
      calls.push(`requestBanner:${id}`);
    },
    clearBanner(id: string) {
      calls.push(`clearBanner:${id}`);
    },
    async saveCloudData() {},
    async loadCloudData() {
      return null;
    },
    getLocale() {
      return 'en';
    },
    getDeviceType() {
      return 'desktop';
    },
    getServerTimeMs() {
      return Date.now();
    },
  };
  return { adapter, calls };
}

describe('Portal SDK & QA Compliance', () => {
  it('never double-fires gameplayStart or gameplayStop in sequence', () => {
    const { adapter, calls } = createSpyAdapter();
    const sdk = new PlatformSDKManager(adapter);

    sdk.gameplayStop(); // Should not fire when not active
    expect(calls).toEqual([]);

    sdk.gameplayStart();
    sdk.gameplayStart();
    sdk.gameplayStart();
    expect(calls).toEqual(['gameplayStart']);

    sdk.gameplayStop();
    sdk.gameplayStop();
    expect(calls).toEqual(['gameplayStart', 'gameplayStop']);
  });

  it('blocks re-entrant SDK calls during ads and restores audio mute state cleanly', async () => {
    const { adapter, calls } = createSpyAdapter({ delayMs: 25 });
    const sdk = new PlatformSDKManager(adapter);
    const audio = new AudioEngine(true); // User manually muted

    let sysMutedDuringAd = false;
    sdk.setAdLifecycleCallbacks({
      onBeforeAd: () => {
        audio.setSystemMuted(true);
        sysMutedDuringAd = true;
      },
      onAfterAd: () => {
        audio.setSystemMuted(false);
      },
    });

    sdk.gameplayStart();
    const adPromise = sdk.showRewardedAd('rv_double_run');

    // Attempt re-entrant SDK calls while ad is in flight
    sdk.gameplayStart();
    sdk.happytime();
    sdk.requestBanner('slot');

    const res = await adPromise;
    expect(res.rewarded).toBe(true);
    expect(sysMutedDuringAd).toBe(true);
    // User's manual mute must still be respected after ad finishes
    expect(audio.isMuted()).toBe(true);
    // Re-entrant calls during ad must have been blocked
    expect(calls).toEqual(['gameplayStart', 'gameplayStop', 'showRewardedAd:rv_double_run']);
  });

  it('never grants reward on adblock or ad error', async () => {
    const { adapter } = createSpyAdapter({ adResult: { rewarded: false, reason: 'adblock' } });
    const sdk = new PlatformSDKManager(adapter);
    const res = await sdk.showRewardedAd('rv_double_run');
    expect(res.rewarded).toBe(false);
    expect(res.reason).toBe('adblock');
  });

  it('operates safely in Incognito when localStorage throws SecurityError', () => {
    const throwingStorage = {
      getItem: () => {
        throw new DOMException('SecurityError', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('SecurityError', 'SecurityError');
      },
    };
    const mgr = new SaveManager(throwingStorage);
    const save = createDefaultSave(1000);
    save.coins = 777;

    expect(() => mgr.saveLocal(save)).not.toThrow();
    const loaded = mgr.loadLocal(2000);
    expect(loaded.coins).toBe(777);
  });

  it('tracks activePlaystate cleanly and prefers memory fallback if storage write fails after prior read', () => {
    const { adapter } = createSpyAdapter();
    const sdk = new PlatformSDKManager(adapter);
    expect(sdk.activePlaystate).toBe('IDLE');
    sdk.gameplayStart();
    expect(sdk.activePlaystate).toBe('GAMEPLAY');
    sdk.gameplayStop();
    expect(sdk.activePlaystate).toBe('IDLE');

    const staleSave = JSON.stringify({ ...createDefaultSave(500), coins: 10 });
    const quotaStorage = {
      getItem: () => staleSave,
      setItem: () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      },
    };
    const mgr = new SaveManager(quotaStorage);
    const save = mgr.loadLocal(1000);
    expect(save.coins).toBe(10);
    save.coins = 999;
    mgr.saveLocal(save);
    expect(mgr.loadLocal(2000).coins).toBe(999);
  });

  it('has 100% key parity with en across all 9 launch languages', () => {
    const enKeys = Object.keys(TRANSLATIONS.en).sort();
    const locales = Object.keys(TRANSLATIONS) as SupportedLocale[];
    expect(locales.length).toBe(9);

    for (const loc of locales) {
      const keys = Object.keys(TRANSLATIONS[loc]).sort();
      expect(keys).toEqual(enKeys);
      for (const k of enKeys) {
        const val = TRANSLATIONS[loc][k as keyof typeof TRANSLATIONS.en];
        expect(typeof val).toBe('string');
        expect(val.trim().length).toBeGreaterThan(0);
        // Zero OS emoji codepoints in translations
        expect(/\p{Extended_Pictographic}/u.test(val)).toBe(false);
      }
    }

    for (const upg of UPGRADES) {
      expect(/\p{Extended_Pictographic}/u.test(upg.icon)).toBe(false);
    }
  });

  it('transitions TITLE -> AIMING cleanly and never fires gameplayStart on TITLE', () => {
    const { adapter, calls } = createSpyAdapter();
    const sdk = new PlatformSDKManager(adapter);
    const sm = new StateMachine();

    sm.transition('TITLE');
    sdk.loadingStop();
    expect(sm.state).toBe('TITLE');
    expect(calls).toEqual(['loadingStop']);

    sm.transition('AIMING');
    sdk.gameplayStart();
    expect(sm.state).toBe('AIMING');
    expect(calls).toEqual(['loadingStop', 'gameplayStart']);

    // Returning Home from Pause stops gameplay and transitions to TITLE
    sm.transition('PAUSED');
    sdk.gameplayStop();
    sm.transition('TITLE');
    expect(sm.state).toBe('TITLE');
    expect(calls).toEqual(['loadingStop', 'gameplayStart', 'gameplayStop']);
  });

  it('handles SpriteAtlas preload and lookups safely in headless Node', async () => {
    const atlas = new SpriteAtlas();
    await expect(atlas.loadAll()).resolves.toBeUndefined();
    expect(atlas.getBlockSprite('strata', BIOMES[0], 0, 0)).toBeNull();
    expect(atlas.getLogoEmblemUrl()).toContain('logo_emblem');
  });

  it('falls back cleanly after 3000ms init timeout and tracks adblock/adError state', async () => {
    vi.useFakeTimers();
    try {
      const hangingAdapter: IPortalAdapter = {
        ...createSpyAdapter().adapter,
        init: () => new Promise<void>(() => {}), // Never resolves
      };
      const sdk = new PlatformSDKManager(hangingAdapter);
      const initPromise = sdk.init();
      await vi.advanceTimersByTimeAsync(3100);
      await initPromise;

      // Fell back cleanly to offline fallback mode so game still boots without ads
      expect(sdk.isOfflineFallback).toBe(true);
      expect(sdk.canShowRewardedAds()).toBe(false);
    } finally {
      vi.useRealTimers();
    }

    const { adapter: adErrAdapter } = createSpyAdapter({
      adResult: { rewarded: false, reason: 'error' },
    });
    const sdk2 = new PlatformSDKManager(adErrAdapter);
    await sdk2.init();
    expect(sdk2.canShowRewardedAds()).toBe(true);

    let notified = 0;
    const unsub = sdk2.onAdAvailabilityChange(() => {
      notified++;
    });
    const res = await sdk2.showRewardedAd('rv_double_run');
    expect(res.rewarded).toBe(false);
    expect(sdk2.canShowRewardedAds()).toBe(false);
    expect(notified).toBeGreaterThanOrEqual(1);
    unsub();
  });

  it('enforces CrazyGamesAdapter disabled env blocking & 60s banner refresh throttle', async () => {
    const originalWindow = (globalThis as Record<string, unknown>).window;
    const bannerCalls: string[] = [];
    const gameCalls: string[] = [];

    (globalThis as Record<string, unknown>).window = {
      CrazyGames: {
        SDK: {
          environment: 'crazygames',
          init: async () => {},
          ad: { hasAdblock: async () => false },
          game: { gameplayStart: () => gameCalls.push('start') },
          banner: {
            requestResponsiveBanner: (id: string) => bannerCalls.push(`req:${id}`),
            clearAllBanners: () => bannerCalls.push('clearAll'),
          },
        },
      },
    };

    try {
      const cg = new CrazyGamesAdapter();
      await cg.init();
      expect(cg.isDisabled()).toBe(false);

      cg.requestBanner('rm-shop-banner-slot');
      cg.requestBanner('rm-shop-banner-slot'); // Throttled inside 60s window
      expect(bannerCalls).toEqual(['req:rm-shop-banner-slot']);

      cg.clearAllBanners();
      expect(bannerCalls).toContain('clearAll');

      // Disabled environment blocks all live SDK calls
      (
        (globalThis as Record<string, unknown>).window as {
          CrazyGames: { SDK: { environment: string } };
        }
      ).CrazyGames.SDK.environment = 'disabled';
      const cgDisabled = new CrazyGamesAdapter();
      await cgDisabled.init();
      expect(cgDisabled.isDisabled()).toBe(true);
      cgDisabled.gameplayStart();
      expect(gameCalls).toEqual([]);
    } finally {
      (globalThis as Record<string, unknown>).window = originalWindow;
    }
  });

  it('renders AdButton dynamically: hides when unavailable or swaps cleanly to coin fallback', () => {
    vi.spyOn(PlatformSDK, 'canShowRewardedAds').mockReturnValue(false);

    expect(
      AdButton.renderMarkup({
        labelHtml: 'DOUBLE (AD)',
        attrs: 'data-test="double"',
        fallbackMode: 'hide',
      })
    ).toBe('');

    const coinHtml = AdButton.renderMarkup({
      labelHtml: 'BONUS COIN (AD)',
      attrs: 'data-test="bonus"',
      fallbackMode: 'coin_alt',
      coinAltHtml: '100 COINS',
      coinAltAttrs: 'data-test="coin-buy"',
    });
    expect(coinHtml).toContain('100 COINS');
    expect(coinHtml).not.toContain('AD');
    expect(coinHtml).not.toContain('data-ad-cta');

    vi.restoreAllMocks();
  });
});
