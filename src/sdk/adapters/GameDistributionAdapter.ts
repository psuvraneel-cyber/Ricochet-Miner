import type { AdResult, IPortalAdapter } from '../PlatformSDK';

interface GDSDKGlobal {
  showAd?: (type?: 'interstitial' | 'rewarded') => Promise<void>;
}

export class GameDistributionAdapter implements IPortalAdapter {
  readonly name = 'gamedistribution';
  readonly supportsBanners = false;
  readonly hideFullscreenButton = false;

  private rewardedGranted = false;
  private adResolve: ((res: AdResult) => void) | null = null;

  private get sdk(): GDSDKGlobal | undefined {
    return (window as unknown as { gdsdk?: GDSDKGlobal }).gdsdk;
  }

  async init(): Promise<void> {
    const win = window as unknown as { GD_OPTIONS?: Record<string, unknown> };
    const existing = win.GD_OPTIONS ?? {};
    win.GD_OPTIONS = {
      ...existing,
      onEvent: (event: { name?: string }) => {
        if (event?.name === 'SDK_REWARDED_WATCH_COMPLETE') {
          this.rewardedGranted = true;
        } else if (event?.name === 'SDK_GAME_START') {
          const resolve = this.adResolve;
          this.adResolve = null;
          if (resolve) {
            resolve({
              rewarded: this.rewardedGranted,
              reason: this.rewardedGranted ? 'finished' : 'skipped',
            });
          }
        }
      },
    };
  }

  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  happytime(): void {}

  async showMidgameAd(): Promise<AdResult> {
    if (!this.sdk?.showAd) return { rewarded: false, reason: 'error' };
    this.rewardedGranted = true;
    try {
      await this.sdk.showAd('interstitial');
      return { rewarded: true, reason: 'finished' };
    } catch {
      return { rewarded: false, reason: 'error' };
    }
  }

  showRewardedAd(_placementId: string): Promise<AdResult> {
    if (!this.sdk?.showAd) return Promise.resolve({ rewarded: false, reason: 'error' });
    this.rewardedGranted = false;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.adResolve) {
          this.adResolve = null;
          resolve({ rewarded: false, reason: 'error' });
        }
      }, 60000);

      this.adResolve = (res) => {
        clearTimeout(timer);
        resolve(res);
      };

      this.sdk!.showAd!('rewarded').catch(() => {
        clearTimeout(timer);
        this.adResolve = null;
        resolve({ rewarded: false, reason: 'error' });
      });
    });
  }

  requestBanner(): void {}
  clearBanner(): void {}
  async saveCloudData(): Promise<void> {}
  async loadCloudData(): Promise<string | null> {
    return null;
  }

  getLocale(): string {
    return navigator.language ?? 'en';
  }

  getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
    return window.innerWidth < 768 ? 'mobile' : 'desktop';
  }

  getServerTimeMs(): number {
    return Date.now();
  }
}
