import type { AdResult, IPortalAdapter } from '../PlatformSDK';

export class MockAdapter implements IPortalAdapter {
  readonly name: string;
  readonly supportsBanners: boolean;
  readonly hideFullscreenButton = false;

  public simulateAdError = false;
  public simulateAdBlock = false;
  public simulatedDelayMs = 450;

  constructor(name: string = 'mock', simulateAds: boolean = true) {
    this.name = name;
    this.supportsBanners = simulateAds;
  }

  async init(): Promise<void> {
    return Promise.resolve();
  }

  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  happytime(): void {}

  async showMidgameAd(): Promise<AdResult> {
    if (this.name === 'standalone') {
      return { rewarded: false, reason: 'skipped' };
    }
    if (this.simulateAdBlock) return { rewarded: false, reason: 'adblock' };
    if (this.simulateAdError) return { rewarded: false, reason: 'error' };
    await new Promise((r) => setTimeout(r, this.simulatedDelayMs));
    return { rewarded: true, reason: 'finished' };
  }

  async showRewardedAd(_placementId: string): Promise<AdResult> {
    if (this.name === 'standalone') {
      // Standalone build has no ad network; treat as unavailable unless testing in mock
      return { rewarded: false, reason: 'error' };
    }
    if (this.simulateAdBlock) return { rewarded: false, reason: 'adblock' };
    if (this.simulateAdError) return { rewarded: false, reason: 'error' };
    await new Promise((r) => setTimeout(r, this.simulatedDelayMs));
    return { rewarded: true, reason: 'finished' };
  }

  async hasAdblock(): Promise<boolean> {
    return this.simulateAdBlock || this.simulateAdError;
  }

  isDisabled(): boolean {
    return this.name === 'standalone';
  }

  requestBanner(containerId: string): void {
    const el = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
    if (el) {
      el.textContent = 'BANNER AD SLOT (DEV)';
      el.style.visibility = 'visible';
    }
  }

  clearBanner(containerId: string): void {
    const el = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
    if (el) {
      el.textContent = '';
    }
  }

  clearAllBanners(): void {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.rm-banner-slot').forEach((node) => {
      node.textContent = '';
    });
  }

  async saveCloudData(_json: string): Promise<void> {
    return Promise.resolve();
  }

  async loadCloudData(): Promise<string | null> {
    return Promise.resolve(null);
  }

  getLocale(): string {
    return typeof navigator !== 'undefined' ? navigator.language : 'en';
  }

  getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
    if (typeof window === 'undefined') return 'desktop';
    return window.innerWidth < 768 ? 'mobile' : 'desktop';
  }

  getServerTimeMs(): number {
    return Date.now();
  }
}
