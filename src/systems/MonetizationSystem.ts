import { AD_CONFIG, type RewardedPlacementId } from '../config/adConfig';
import { PlatformSDK, type AdResult } from '../sdk/PlatformSDK';
import type { SaveData } from '../sdk/SaveManager';

export class MonetizationSystem {
  private sessionElapsedS = 0;
  private lastMidgameAdTimeS = -9999;
  private lastDoubleRunAt = -99;
  private lastFreeUpgradeAt = -99;
  private lastOverdriveAt = -99;

  updateSessionTime(dt: number): void {
    this.sessionElapsedS += dt;
  }

  canShowMidgameAd(): boolean {
    if (this.sessionElapsedS < AD_CONFIG.MIDGAME_GRACE_PERIOD_S) return false;
    return this.sessionElapsedS - this.lastMidgameAdTimeS >= AD_CONFIG.MIDGAME_COOLDOWN_S;
  }

  resetMidgameCooldown(): void {
    this.lastMidgameAdTimeS = this.sessionElapsedS;
  }

  async tryShowMidgameAd(): Promise<AdResult> {
    if (!this.canShowMidgameAd()) {
      return { rewarded: false, reason: 'skipped' };
    }
    this.lastMidgameAdTimeS = this.sessionElapsedS;
    return await PlatformSDK.showMidgameAd();
  }

  async showRewarded(placementId: RewardedPlacementId): Promise<AdResult> {
    const res = await PlatformSDK.showRewardedAd(placementId);
    if (res.rewarded) {
      // Rewarded Ad Relief Rule: reset midgame cooldown back to 150s
      this.resetMidgameCooldown();
    }
    return res;
  }

  canOfferDoubleRun(save: SaveData, runCoins: number): boolean {
    if (runCoins <= 0 || save.runsCompleted < 1) return false;
    if (save.runsCompleted - this.lastDoubleRunAt < AD_CONFIG.RV_DOUBLE_RUN_COOLDOWN_RUNS) {
      return false;
    }
    if (save.recentRunEarnings.length === 0) return true;
    const avg =
      save.recentRunEarnings.reduce((a, b) => a + b, 0) / save.recentRunEarnings.length;
    return runCoins >= avg * AD_CONFIG.RV_DOUBLE_RUN_RATIO;
  }

  markDoubleRunOffered(runNumber: number): void {
    this.lastDoubleRunAt = runNumber;
  }

  canOfferFreeUpgrade(runNumber: number): boolean {
    return runNumber - this.lastFreeUpgradeAt >= AD_CONFIG.RV_FREE_UPGRADE_COOLDOWN_RUNS;
  }

  markFreeUpgradeOffered(runNumber: number): void {
    this.lastFreeUpgradeAt = runNumber;
  }

  canOfferOverdriveTrial(runNumber: number): boolean {
    return runNumber >= 2 && runNumber - this.lastOverdriveAt >= AD_CONFIG.RV_OVERDRIVE_COOLDOWN_RUNS;
  }

  markOverdriveOffered(runNumber: number): void {
    this.lastOverdriveAt = runNumber;
  }
}
