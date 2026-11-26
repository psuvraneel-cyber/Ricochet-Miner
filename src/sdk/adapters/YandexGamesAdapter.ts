import type { AdResult, IPortalAdapter } from '../PlatformSDK';

interface YaGamesSDK {
  environment?: { i18n?: { lang?: string } };
  deviceInfo?: { type?: string };
  serverTime?: () => number;
  features?: {
    LoadingAPI?: { ready?: () => void };
    GameplayAPI?: { start?: () => void; stop?: () => void };
  };
  adv?: {
    showFullscreenAdv?: (opts: { callbacks: { onClose?: (wasShown: boolean) => void; onError?: () => void } }) => void;
    showRewardedVideo?: (opts: {
      callbacks: { onRewarded?: () => void; onClose?: () => void; onError?: () => void };
    }) => void;
    showBannerAdv?: () => void;
    hideBannerAdv?: () => void;
  };
  getPlayer?: (opts?: { scopes: boolean }) => Promise<{
    setData: (data: Record<string, unknown>, flush?: boolean) => Promise<void>;
    getData: (keys?: string[]) => Promise<Record<string, unknown>>;
  }>;
}

const AD_TIMEOUT_MS = 45000;

export class YandexGamesAdapter implements IPortalAdapter {
  readonly name = 'yandex';
  readonly supportsBanners = true;
  readonly hideFullscreenButton = false;

  private ysdk: YaGamesSDK | null = null;
  private player: Awaited<ReturnType<NonNullable<YaGamesSDK['getPlayer']>>> | null = null;

  async init(): Promise<void> {
    try {
      const yaGames = (window as unknown as { YaGames?: { init: () => Promise<YaGamesSDK> } }).YaGames;
      if (yaGames?.init) {
        this.ysdk = await yaGames.init();
        try {
          this.player = (await this.ysdk.getPlayer?.({ scopes: false })) ?? null;
        } catch {
          this.player = null;
        }
      }
    } catch {
      this.ysdk = null;
    }
  }

  loadingStart(): void {}

  loadingStop(): void {
    try {
      this.ysdk?.features?.LoadingAPI?.ready?.();
    } catch {
      // ignore
    }
  }

  gameplayStart(): void {
    try {
      this.ysdk?.features?.GameplayAPI?.start?.();
    } catch {
      // ignore
    }
  }

  gameplayStop(): void {
    try {
      this.ysdk?.features?.GameplayAPI?.stop?.();
    } catch {
      // ignore
    }
  }

  happytime(): void {}

  showMidgameAd(): Promise<AdResult> {
    return new Promise((resolve) => {
      if (!this.ysdk?.adv?.showFullscreenAdv) {
        resolve({ rewarded: false, reason: 'error' });
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ rewarded: false, reason: 'error' });
        }
      }, AD_TIMEOUT_MS);

      try {
        this.ysdk.adv.showFullscreenAdv({
          callbacks: {
            onClose: (wasShown) => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve({ rewarded: Boolean(wasShown), reason: 'finished' });
              }
            },
            onError: () => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve({ rewarded: false, reason: 'error' });
              }
            },
          },
        });
      } catch {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ rewarded: false, reason: 'error' });
        }
      }
    });
  }

  showRewardedAd(_placementId: string): Promise<AdResult> {
    return new Promise((resolve) => {
      if (!this.ysdk?.adv?.showRewardedVideo) {
        resolve({ rewarded: false, reason: 'error' });
        return;
      }
      let rewarded = false;
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ rewarded: false, reason: 'error' });
        }
      }, AD_TIMEOUT_MS);

      try {
        this.ysdk.adv.showRewardedVideo({
          callbacks: {
            onRewarded: () => {
              rewarded = true;
            },
            onClose: () => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve({ rewarded, reason: rewarded ? 'finished' : 'skipped' });
              }
            },
            onError: () => {
              if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve({ rewarded: false, reason: 'error' });
              }
            },
          },
        });
      } catch {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ rewarded: false, reason: 'error' });
        }
      }
    });
  }

  requestBanner(): void {
    try {
      if (window.innerHeight >= 600) {
        this.ysdk?.adv?.showBannerAdv?.();
      }
    } catch {
      // ignore
    }
  }

  clearBanner(): void {
    try {
      this.ysdk?.adv?.hideBannerAdv?.();
    } catch {
      // ignore
    }
  }

  async saveCloudData(json: string): Promise<void> {
    try {
      await this.player?.setData({ ricochet_miner_save: json }, true);
    } catch {
      // ignore
    }
  }

  async loadCloudData(): Promise<string | null> {
    try {
      const data = await this.player?.getData(['ricochet_miner_save']);
      const val = data?.ricochet_miner_save;
      return typeof val === 'string' ? val : null;
    } catch {
      return null;
    }
  }

  getLocale(): string {
    return this.ysdk?.environment?.i18n?.lang ?? navigator.language ?? 'en';
  }

  getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
    const t = this.ysdk?.deviceInfo?.type;
    if (t === 'mobile' || t === 'tablet' || t === 'desktop') return t;
    return window.innerWidth < 768 ? 'mobile' : 'desktop';
  }

  getServerTimeMs(): number {
    try {
      const st = this.ysdk?.serverTime?.();
      if (typeof st === 'number' && st > 0) return st;
    } catch {
      // ignore
    }
    return Date.now();
  }
}
