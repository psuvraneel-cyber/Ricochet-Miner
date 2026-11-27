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
  clearAllBanners?(): void;
  hasAdblock?(): Promise<boolean>;
  isDisabled?(): boolean;
  supportsLeaderboards?(): boolean;
  getUser?(): Promise<{ username: string; avatarUrl?: string } | null>;
  submitLeaderboardScore?(score: number): void;
  showLeaderboard?(): void;
  saveCloudData(json: string): Promise<void>;
  loadCloudData(): Promise<string | null>;
  getLocale(): string;
  getDeviceType(): 'desktop' | 'mobile' | 'tablet';
  getServerTimeMs(): number;
  isPlatformMuted?(): boolean;
  onPlatformMuteChange?(cb: (muted: boolean) => void): () => void;
  setAdCallbacks?(callbacks: { onAdStarted?: () => void; onAdEnded?: () => void }): void;
}

export type AdLifecycleCallbacks = {
  onBeforeAd: () => void;
  onAdStarted?: () => void;
  onAfterAd: () => void;
};

const SDK_INIT_TIMEOUT_MS = 3000;

export class PlatformSDKManager {
  private adapter: IPortalAdapter;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private fallbackToOffline = false;
  private rewardedAdsAvailable = true;
  private sessionAdsBlocked = false;
  private activeBannerIds = new Set<string>();
  private adListeners = new Set<(available: boolean) => void>();
  private platformMuteListeners = new Set<(muted: boolean) => void>();
  private adapterMuteUnsub: (() => void) | null = null;
  private playstate: ActivePlaystate = 'IDLE';
  private lifecycle: AdLifecycleCallbacks = {
    onBeforeAd: () => {},
    onAfterAd: () => {},
  };

  constructor(adapter?: IPortalAdapter) {
    this.adapter = adapter ?? this.createAdapter();
    this.bindAdapterHooks();
    this.rewardedAdsAvailable = this.computeInitialAdSupport();
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

  private computeInitialAdSupport(): boolean {
    if (this.fallbackToOffline || this.sessionAdsBlocked) return false;
    if (this.adapter.name === 'standalone') return false;
    if (this.adapter.isDisabled?.()) return false;
    return true;
  }

  setAdapterForTest(adapter: IPortalAdapter): void {
    this.adapter = adapter;
    this.initialized = false;
    this.initPromise = null;
    this.fallbackToOffline = false;
    this.sessionAdsBlocked = false;
    this.activeBannerIds.clear();
    this.playstate = 'IDLE';
    this.bindAdapterHooks();
    this.rewardedAdsAvailable = this.computeInitialAdSupport();
    this.emitAdAvailabilityChanged();
    this.emitPlatformMuteChanged();
  }

  private bindAdapterHooks(): void {
    this.adapterMuteUnsub?.();
    this.adapterMuteUnsub =
      this.adapter.onPlatformMuteChange?.(() => {
        this.emitPlatformMuteChanged();
      }) ?? null;
    this.adapter.setAdCallbacks?.({
      onAdStarted: () => {
        this.lifecycle.onAdStarted?.();
      },
      onAdEnded: () => {
        // Post-ad restore is handled cleanly in finally { onAfterAd() }
      },
    });
  }

  private emitPlatformMuteChanged(): void {
    const muted = this.isPlatformMuted();
    for (const cb of this.platformMuteListeners) {
      try {
        cb(muted);
      } catch {
        // ignore
      }
    }
  }

  isPlatformMuted(): boolean {
    if (this.adapter.isPlatformMuted) {
      return this.adapter.isPlatformMuted();
    }
    if (typeof window !== 'undefined') {
      try {
        const search = window.location?.search;
        if (typeof search === 'string' && new URLSearchParams(search).get('muteAudio') === 'true') {
          return true;
        }
      } catch {
        // ignore
      }
    }
    return false;
  }

  onPlatformMuteChange(cb: (muted: boolean) => void): () => void {
    this.platformMuteListeners.add(cb);
    return () => {
      this.platformMuteListeners.delete(cb);
    };
  }

  setAdLifecycleCallbacks(callbacks: AdLifecycleCallbacks): void {
    this.lifecycle = callbacks;
    this.bindAdapterHooks();
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

  get isOfflineFallback(): boolean {
    return this.fallbackToOffline || Boolean(this.adapter.isDisabled?.());
  }

  get supportsBanners(): boolean {
    return !this.isOfflineFallback && this.adapter.supportsBanners;
  }

  get hideFullscreenButton(): boolean {
    return this.adapter.hideFullscreenButton;
  }

  canShowRewardedAds(): boolean {
    return this.rewardedAdsAvailable && !this.isOfflineFallback && !this.sessionAdsBlocked;
  }

  canShowBanners(): boolean {
    return this.supportsBanners && this.canShowRewardedAds();
  }

  onAdAvailabilityChange(cb: (available: boolean) => void): () => void {
    this.adListeners.add(cb);
    return () => {
      this.adListeners.delete(cb);
    };
  }

  private emitAdAvailabilityChanged(): void {
    const avail = this.canShowRewardedAds();
    for (const cb of this.adListeners) {
      try {
        cb(avail);
      } catch {
        // ignore listener failure
      }
    }
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('ad-availability-changed', { detail: { available: avail } }));
      } catch {
        // ignore in mocked node windows
      }
    }
  }

  async init(timeoutMs: number = SDK_INIT_TIMEOUT_MS): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race<'ok' | 'timeout'>([
          this.adapter.init().then(() => 'ok' as const),
          new Promise<'timeout'>((resolve) => {
            timer = setTimeout(() => resolve('timeout'), timeoutMs);
          }),
        ]);
        if (result === 'timeout') {
          console.warn(`[PlatformSDK] ${this.adapter.name} init timed out after ${timeoutMs}ms; activating offline fallback.`);
          this.fallbackToOffline = true;
        } else if (this.adapter.isDisabled?.()) {
          this.fallbackToOffline = true;
        }
      } catch (err) {
        console.warn(`[PlatformSDK] ${this.adapter.name} init failed; activating offline fallback.`, err);
        this.fallbackToOffline = true;
      } finally {
        if (timer) clearTimeout(timer);
      }

      this.initialized = true;
      this.emitPlatformMuteChanged();
      await this.refreshAdAvailability();
    })();

    return this.initPromise;
  }

  async refreshAdAvailability(): Promise<boolean> {
    const prev = this.canShowRewardedAds();
    if (this.isOfflineFallback || this.adapter.name === 'standalone' || this.sessionAdsBlocked) {
      this.rewardedAdsAvailable = false;
      if (prev !== this.canShowRewardedAds()) this.emitAdAvailabilityChanged();
      return false;
    }

    let blocked = false;
    try {
      if (this.adapter.hasAdblock) {
        blocked = await this.adapter.hasAdblock();
      }
    } catch {
      blocked = false;
    }

    if (blocked) {
      this.sessionAdsBlocked = true;
      this.rewardedAdsAvailable = false;
    } else {
      this.rewardedAdsAvailable = true;
    }

    const next = this.canShowRewardedAds();
    if (prev !== next) {
      this.emitAdAvailabilityChanged();
    }
    return next;
  }

  loadingStart(): void {
    if (this.isOfflineFallback) return;
    this.adapter.loadingStart();
  }

  loadingStop(): void {
    if (this.isOfflineFallback) return;
    this.adapter.loadingStop();
  }

  gameplayStart(): void {
    if (this.playstate !== 'IDLE') return;
    this.playstate = 'GAMEPLAY';
    if (this.isOfflineFallback) return;
    this.adapter.gameplayStart();
  }

  gameplayStop(): void {
    if (this.playstate !== 'GAMEPLAY') return;
    this.playstate = 'IDLE';
    if (this.isOfflineFallback) return;
    this.adapter.gameplayStop();
  }

  happytime(): void {
    if (this.playstate === 'AD_PAUSED' || this.isOfflineFallback) return;
    this.adapter.happytime();
  }

  async showMidgameAd(): Promise<AdResult> {
    if (this.playstate === 'AD_PAUSED') return { rewarded: false, reason: 'skipped' };
    if (!this.canShowRewardedAds()) return { rewarded: false, reason: 'skipped' };
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
    if (!this.canShowRewardedAds()) return { rewarded: false, reason: 'adblock' };
    this.gameplayStop();
    this.playstate = 'AD_PAUSED';
    this.lifecycle.onBeforeAd();
    try {
      const res = await this.adapter.showRewardedAd(placementId);
      if (!res.rewarded && (res.reason === 'adblock' || res.reason === 'error')) {
        this.sessionAdsBlocked = true;
        this.rewardedAdsAvailable = false;
        this.emitAdAvailabilityChanged();
      }
      return res;
    } catch {
      this.sessionAdsBlocked = true;
      this.rewardedAdsAvailable = false;
      this.emitAdAvailabilityChanged();
      return { rewarded: false, reason: 'error' };
    } finally {
      this.playstate = 'IDLE';
      this.lifecycle.onAfterAd();
    }
  }

  requestBanner(containerId: string, size?: string): void {
    if (this.playstate === 'AD_PAUSED' || !this.canShowBanners()) return;
    this.activeBannerIds.add(containerId);
    this.adapter.requestBanner(containerId, size);
  }

  clearBanner(containerId: string): void {
    this.activeBannerIds.delete(containerId);
    if (this.playstate === 'AD_PAUSED' || !this.supportsBanners) return;
    this.adapter.clearBanner(containerId);
  }

  clearAllBanners(): void {
    if (!this.supportsBanners) {
      this.activeBannerIds.clear();
      return;
    }
    if (this.adapter.clearAllBanners) {
      this.adapter.clearAllBanners();
    } else {
      for (const id of this.activeBannerIds) {
        this.adapter.clearBanner(id);
      }
    }
    this.activeBannerIds.clear();
  }

  async saveCloudData(json: string): Promise<void> {
    if (this.isOfflineFallback) return;
    await this.adapter.saveCloudData(json);
  }

  async loadCloudData(): Promise<string | null> {
    if (this.isOfflineFallback) return null;
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

  supportsLeaderboards(): boolean {
    if (this.isOfflineFallback) return false;
    return this.adapter.supportsLeaderboards?.() ?? false;
  }

  async getUser(): Promise<{ username: string; avatarUrl?: string } | null> {
    if (this.isOfflineFallback) return null;
    try {
      return (await this.adapter.getUser?.()) ?? null;
    } catch {
      return null;
    }
  }

  submitLeaderboardScore(score: number): void {
    if (this.isOfflineFallback) return;
    this.adapter.submitLeaderboardScore?.(score);
  }

  showLeaderboard(): void {
    if (this.isOfflineFallback) return;
    this.adapter.showLeaderboard?.();
  }
}

export const PlatformSDK = new PlatformSDKManager();
