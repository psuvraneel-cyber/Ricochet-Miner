import { CrazyGamesAdapter } from './adapters/CrazyGamesAdapter';
import { GameDistributionAdapter } from './adapters/GameDistributionAdapter';
import { MockAdapter } from './adapters/MockAdapter';
import { PokiAdapter } from './adapters/PokiAdapter';
import { YandexGamesAdapter } from './adapters/YandexGamesAdapter';

export interface AdResult {
  rewarded: boolean;
  reason?: 'finished' | 'skipped' | 'error' | 'adblock';
}

export type ActivePlaystate = 'IDLE' | 'GAMEPLAY' | 'AD_PAUSED';

export interface IPortalAdapter {
  readonly name: string;
  readonly supportsBanners: boolean;
  readonly hideFullscreenButton: boolean;
  init(): Promise<void>;
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  happytime(): void;
  showMidgameAd(): Promise<AdResult>;
  showRewardedAd(placementId: string): Promise<AdResult>;
  requestBanner(containerId: string, size?: string): void;
  clearBanner(containerId: string): void;
  saveCloudData(json: string): Promise<void>;
  loadCloudData(): Promise<string | null>;
  getLocale(): string;
  getDeviceType(): 'desktop' | 'mobile' | 'tablet';
  getServerTimeMs(): number;
}

export type AdLifecycleCallbacks = {
  onBeforeAd: () => void;
  onAfterAd: () => void;
};

export class PlatformSDKManager {
  private adapter: IPortalAdapter;
  private initialized = false;
  private playstate: ActivePlaystate = 'IDLE';
  private lifecycle: AdLifecycleCallbacks = {
    onBeforeAd: () => {},
    onAfterAd: () => {},
  };

  constructor(adapter?: IPortalAdapter) {
    this.adapter = adapter ?? this.createAdapter();
  }

  private createAdapter(): IPortalAdapter {
    const target = typeof __PLATFORM__ !== 'undefined' ? __PLATFORM__ : 'mock';
    switch (target) {
      case 'crazygames':
        return new CrazyGamesAdapter();
      case 'poki':
        return new PokiAdapter();
      case 'gamedistribution':
        return new GameDistributionAdapter();
      case 'yandex':
        return new YandexGamesAdapter();
      case 'standalone':
        return new MockAdapter('standalone', false);
      default:
        return new MockAdapter('mock', true);
    }
  }

  setAdapterForTest(adapter: IPortalAdapter): void {
    this.adapter = adapter;
    this.initialized = false;
    this.playstate = 'IDLE';
  }

  setAdLifecycleCallbacks(callbacks: AdLifecycleCallbacks): void {
    this.lifecycle = callbacks;
  }

  getAdapter(): IPortalAdapter {
    return this.adapter;
  }

  get activePlaystate(): ActivePlaystate {
    return this.playstate;
  }

  get gameplayActive(): boolean {
    return this.playstate === 'GAMEPLAY';
  }

  get adInFlight(): boolean {
    return this.playstate === 'AD_PAUSED';
  }

  get supportsBanners(): boolean {
    return this.adapter.supportsBanners;
  }

  get hideFullscreenButton(): boolean {
    return this.adapter.hideFullscreenButton;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this.adapter.init();
  }

  loadingStart(): void {
    this.adapter.loadingStart();
  }

  loadingStop(): void {
    this.adapter.loadingStop();
  }

  gameplayStart(): void {
    if (this.playstate !== 'IDLE') return;
    this.playstate = 'GAMEPLAY';
    this.adapter.gameplayStart();
  }

  gameplayStop(): void {
    if (this.playstate !== 'GAMEPLAY') return;
    this.playstate = 'IDLE';
    this.adapter.gameplayStop();
  }

  happytime(): void {
    if (this.playstate === 'AD_PAUSED') return;
    this.adapter.happytime();
  }

  async showMidgameAd(): Promise<AdResult> {
    if (this.playstate === 'AD_PAUSED') return { rewarded: false, reason: 'skipped' };
    this.gameplayStop();
    this.playstate = 'AD_PAUSED';
    this.lifecycle.onBeforeAd();
    try {
      return await this.adapter.showMidgameAd();
    } catch {
      return { rewarded: false, reason: 'error' };
    } finally {
      this.playstate = 'IDLE';
      this.lifecycle.onAfterAd();
    }
  }

  async showRewardedAd(placementId: string): Promise<AdResult> {
    if (this.playstate === 'AD_PAUSED') return { rewarded: false, reason: 'skipped' };
    this.gameplayStop();
    this.playstate = 'AD_PAUSED';
    this.lifecycle.onBeforeAd();
    try {
      return await this.adapter.showRewardedAd(placementId);
    } catch {
      return { rewarded: false, reason: 'error' };
    } finally {
      this.playstate = 'IDLE';
      this.lifecycle.onAfterAd();
    }
  }

  requestBanner(containerId: string, size?: string): void {
    if (this.playstate === 'AD_PAUSED' || !this.adapter.supportsBanners) return;
    this.adapter.requestBanner(containerId, size);
  }

  clearBanner(containerId: string): void {
    if (this.playstate === 'AD_PAUSED' || !this.adapter.supportsBanners) return;
    this.adapter.clearBanner(containerId);
  }

  async saveCloudData(json: string): Promise<void> {
    await this.adapter.saveCloudData(json);
  }

  async loadCloudData(): Promise<string | null> {
    return await this.adapter.loadCloudData();
  }

  getLocale(): string {
    return this.adapter.getLocale();
  }

  getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
    return this.adapter.getDeviceType();
  }

  getServerTimeMs(): number {
    return this.adapter.getServerTimeMs();
  }
}

export const PlatformSDK = new PlatformSDKManager();
