import type { AdResult, IPortalAdapter } from '../PlatformSDK';

interface CrazyGamesSDKGlobal {
  SDK?: {
    init?: () => Promise<void>;
    environment?: 'crazygames' | 'local' | 'disabled' | { locale?: string; device?: { type?: string } };
    user?: {
      systemInfo?: {
        countryCode?: string;
        locale?: string;
        device?: { type?: string };
      };
    };
    game?: {
      loadingStart?: () => void;
      loadingStop?: () => void;
      gameplayStart?: () => void;
      gameplayStop?: () => void;
      happytime?: () => void;
    };
    ad?: {
      hasAdblock?: () => Promise<boolean>;
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
      clearAllBanners?: () => void;
    };
    data?: {
      setItem?: (key: string, value: string) => void;
      getItem?: (key: string) => string | null;
    };
  };
}

const BANNER_COOLDOWN_MS = 60_000;

export class CrazyGamesAdapter implements IPortalAdapter {
  readonly name = 'crazygames';
  readonly supportsBanners = true;
  readonly hideFullscreenButton = true;

  private disabled = false;
  private lastBannerRequestMs = new Map<string, number>();

  private get sdk() {
    return (window as unknown as { CrazyGames?: CrazyGamesSDKGlobal }).CrazyGames?.SDK;
  }

  isDisabled(): boolean {
    if (this.disabled) return true;
    const env = this.sdk?.environment;
    return env === 'disabled';
  }

  async init(): Promise<void> {
    try {
      const sdk = this.sdk;
      if (!sdk || sdk.environment === 'disabled' || !sdk.init) {
        this.disabled = true;
        return;
      }
      await sdk.init();
      if (this.sdk?.environment === 'disabled') {
        this.disabled = true;
      }
    } catch {
      this.disabled = true;
    }
  }

  async hasAdblock(): Promise<boolean> {
    if (this.isDisabled()) return true;
    try {
      const fn = this.sdk?.ad?.hasAdblock;
      if (!fn) return false;
      const timerPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 1500);
      });
      return await Promise.race([fn(), timerPromise]);
    } catch {
      return false;
    }
  }

  loadingStart(): void {
    if (this.isDisabled()) return;
    try {
      this.sdk?.game?.loadingStart?.();
    } catch {
      // ignore
    }
  }

  loadingStop(): void {
    if (this.isDisabled()) return;
    try {
      this.sdk?.game?.loadingStop?.();
    } catch {
      // ignore
    }
  }

  gameplayStart(): void {
    if (this.isDisabled()) return;
    try {
      this.sdk?.game?.gameplayStart?.();
    } catch {
      // ignore
    }
  }

  gameplayStop(): void {
    if (this.isDisabled()) return;
    try {
      this.sdk?.game?.gameplayStop?.();
    } catch {
      // ignore
    }
  }

  happytime(): void {
    if (this.isDisabled()) return;
    try {
      this.sdk?.game?.happytime?.();
    } catch {
      // ignore
    }
  }

  private requestAd(type: 'midgame' | 'rewarded'): Promise<AdResult> {
    if (this.isDisabled()) {
      return Promise.resolve({ rewarded: false, reason: 'error' });
    }
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
          adError: (err) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              const msg = String((err as { code?: string; message?: string })?.code ?? err ?? '').toLowerCase();
              const isAdblock = msg.includes('adblock');
              resolve({ rewarded: false, reason: isAdblock ? 'adblock' : 'error' });
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
    if (this.isDisabled()) return;
    const now = Date.now();
    const last = this.lastBannerRequestMs.get(containerId) ?? 0;
    if (now - last < BANNER_COOLDOWN_MS) {
      return;
    }
    this.lastBannerRequestMs.set(containerId, now);
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

  clearAllBanners(): void {
    try {
      this.sdk?.banner?.clearAllBanners?.();
    } catch {
      // ignore
    }
  }

  async saveCloudData(json: string): Promise<void> {
    if (this.isDisabled()) return;
    try {
      this.sdk?.data?.setItem?.('ricochet_miner_save', json);
    } catch {
      // ignore
    }
  }

  async loadCloudData(): Promise<string | null> {
    if (this.isDisabled()) return null;
    try {
      return this.sdk?.data?.getItem?.('ricochet_miner_save') ?? null;
    } catch {
      return null;
    }
  }

  getLocale(): string {
    const sysLocale = this.sdk?.user?.systemInfo?.locale;
    const envObj = typeof this.sdk?.environment === 'object' ? this.sdk.environment : undefined;
    return sysLocale ?? envObj?.locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en');
  }

  getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
    const sysType = this.sdk?.user?.systemInfo?.device?.type;
    const envObj = typeof this.sdk?.environment === 'object' ? this.sdk.environment : undefined;
    const t = sysType ?? envObj?.device?.type;
    if (t === 'mobile' || t === 'tablet' || t === 'desktop') return t;
    if (typeof window === 'undefined') return 'desktop';
    if (window.innerWidth <= 640) return 'mobile';
    if (window.innerWidth <= 1024 && window.innerHeight > window.innerWidth) return 'tablet';
    return 'desktop';
  }

  getServerTimeMs(): number {
    return Date.now();
  }
}
