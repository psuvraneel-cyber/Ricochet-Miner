import type { AdResult, IPortalAdapter } from '../PlatformSDK';

interface PokiSDKGlobal {
  init?: () => Promise<void>;
  gameLoadingFinished?: () => void;
  gameplayStart?: () => void;
  gameplayStop?: () => void;
  commercialBreak?: (cb?: () => void) => Promise<void>;
  rewardedBreak?: (cb?: () => void) => Promise<boolean>;
}

const AD_TIMEOUT_MS = 45000;

export class PokiAdapter implements IPortalAdapter {
  readonly name = 'poki';
  readonly supportsBanners = false; // Poki prohibits banner ads
  readonly hideFullscreenButton = false;

  private get sdk(): PokiSDKGlobal | undefined {
    return (window as unknown as { PokiSDK?: PokiSDKGlobal }).PokiSDK;
  }

  async init(): Promise<void> {
    try {
      await this.sdk?.init?.();
    } catch {
      // AdBlock fallback: game must still run cleanly
    }
  }

  loadingStart(): void {}

  loadingStop(): void {
    try {
      this.sdk?.gameLoadingFinished?.();
    } catch {
      // ignore
    }
  }

  gameplayStart(): void {
    try {
      this.sdk?.gameplayStart?.();
    } catch {
      // ignore
    }
  }

  gameplayStop(): void {
    try {
      this.sdk?.gameplayStop?.();
    } catch {
      // ignore
    }
  }

  happytime(): void {}

  async showMidgameAd(): Promise<AdResult> {
    if (!this.sdk?.commercialBreak) return { rewarded: false, reason: 'error' };
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race<AdResult>([
        this.sdk.commercialBreak().then(() => ({ rewarded: true, reason: 'finished' as const })),
        new Promise<AdResult>((resolve) => {
          timer = setTimeout(() => resolve({ rewarded: false, reason: 'error' }), AD_TIMEOUT_MS);
        }),
      ]);
      if (timer) clearTimeout(timer);
      return result;
    } catch {
      return { rewarded: false, reason: 'error' };
    }
  }

  async showRewardedAd(_placementId: string): Promise<AdResult> {
    if (!this.sdk?.rewardedBreak) return { rewarded: false, reason: 'error' };
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race<AdResult>([
        this.sdk.rewardedBreak().then((success) => ({
          rewarded: Boolean(success),
          reason: success ? ('finished' as const) : ('skipped' as const),
        })),
        new Promise<AdResult>((resolve) => {
          timer = setTimeout(() => resolve({ rewarded: false, reason: 'error' }), AD_TIMEOUT_MS);
        }),
      ]);
      if (timer) clearTimeout(timer);
      return result;
    } catch {
      return { rewarded: false, reason: 'error' };
    }
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
