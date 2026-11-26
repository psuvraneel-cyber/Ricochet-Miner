import type { AdResult, IPortalAdapter } from '../PlatformSDK';

interface CrazyGamesSDKGlobal {
  SDK?: {
    init?: () => Promise<void>;
    environment?: { locale?: string; device?: { type?: string } };
    game?: {
      loadingStart?: () => void;
      loadingStop?: () => void;
      gameplayStart?: () => void;
      gameplayStop?: () => void;
      happytime?: () => void;
    };
    ad?: {
      requestAd?: (
        type: 'midgame' | 'rewarded',
        callbacks: {
          adStarted?: () => void;
          adFinished?: () => void;
          adError?: (error: unknown) => void;
        }
      ) => void;
    };
    banner?: {
      requestResponsiveBanner?: (containerId: string) => void;
      clearBanner?: (containerId: string) => void;
    };
    data?: {
      setItem?: (key: string, value: string) => void;
      getItem?: (key: string) => string | null;
    };
  };
}

export class CrazyGamesAdapter implements IPortalAdapter {
  readonly name = 'crazygames';
  readonly supportsBanners = true;
  readonly hideFullscreenButton = true;

  private get sdk() {
    return (window as unknown as { CrazyGames?: CrazyGamesSDKGlobal }).CrazyGames?.SDK;
  }

  async init(): Promise<void> {
    try {
      if (this.sdk?.init) {
        await this.sdk.init();
      }
    } catch {
      // AdBlock or offline fallback
    }
  }

  loadingStart(): void {
    try {
      this.sdk?.game?.loadingStart?.();
    } catch {
      // ignore
    }
  }

  loadingStop(): void {
    try {
      this.sdk?.game?.loadingStop?.();
    } catch {
      // ignore
    }
  }

  gameplayStart(): void {
    try {
      this.sdk?.game?.gameplayStart?.();
    } catch {
      // ignore
    }
  }

  gameplayStop(): void {
    try {
      this.sdk?.game?.gameplayStop?.();
    } catch {
      // ignore
    }
  }

  happytime(): void {
    try {
      this.sdk?.game?.happytime?.();
    } catch {
      // ignore
    }
  }

  private requestAd(type: 'midgame' | 'rewarded'): Promise<AdResult> {
    return new Promise((resolve) => {
      const requestAdFn = this.sdk?.ad?.requestAd;
      if (!requestAdFn) {
        resolve({ rewarded: false, reason: 'error' });
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ rewarded: false, reason: 'error' });
        }
      }, 60000);

      try {
        requestAdFn(type, {
          adFinished: () => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve({ rewarded: true, reason: 'finished' });
            }
          },
          adError: () => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve({ rewarded: false, reason: 'error' });
            }
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

  showMidgameAd(): Promise<AdResult> {
    return this.requestAd('midgame');
  }

  showRewardedAd(_placementId: string): Promise<AdResult> {
    return this.requestAd('rewarded');
  }

  requestBanner(containerId: string): void {
    try {
      this.sdk?.banner?.requestResponsiveBanner?.(containerId);
    } catch {
      // ignore
    }
  }

  clearBanner(containerId: string): void {
    try {
      this.sdk?.banner?.clearBanner?.(containerId);
    } catch {
      // ignore
    }
  }

  async saveCloudData(json: string): Promise<void> {
    try {
      this.sdk?.data?.setItem?.('ricochet_miner_save', json);
    } catch {
      // ignore
    }
  }

  async loadCloudData(): Promise<string | null> {
    try {
      return this.sdk?.data?.getItem?.('ricochet_miner_save') ?? null;
    } catch {
      return null;
    }
  }

  getLocale(): string {
    return this.sdk?.environment?.locale ?? navigator.language ?? 'en';
  }

  getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
    const t = this.sdk?.environment?.device?.type;
    if (t === 'mobile' || t === 'tablet' || t === 'desktop') return t;
    return window.innerWidth < 768 ? 'mobile' : 'desktop';
  }

  getServerTimeMs(): number {
    return Date.now();
  }
}
