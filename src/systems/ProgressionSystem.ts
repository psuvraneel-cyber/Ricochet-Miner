import {
  ASCENSION_CONFIG,
  BIOMES,
  MASTERY_FEATS,
  PHYSICS_CONFIG,
  PRESTIGE_UNLOCK_DEPTH_M,
  UPGRADES,
  getAscensionMilestone,
  type BiomeSpec,
} from '../config/gameConfig';
import type { SaveData } from '../sdk/SaveManager';

export interface RunTelemetry {
  blocksSmashed: number;
  maxCombo: number;
  tntChainMax: number;
  maxDepthMeters: number;
  isFullShaftRun: boolean;
}

export class ProgressionSystem {
  getSelectedBiome(save: SaveData): BiomeSpec {
    const idx = Math.max(0, Math.min(save.unlockedBiomeIndex, save.selectedBiomeIndex));
    return BIOMES[idx] ?? BIOMES[0];
  }

  getBaseRowOffset(save: SaveData): number {
    const biome = this.getSelectedBiome(save);
    return Math.floor(biome.startDepthM / PHYSICS_CONFIG.METERS_PER_ROW);
  }

  selectBiome(save: SaveData, biomeIndex: number): boolean {
    if (biomeIndex < 0 || biomeIndex > save.unlockedBiomeIndex || biomeIndex >= BIOMES.length) {
      return false;
    }
    save.selectedBiomeIndex = biomeIndex;
    return true;
  }

  unlockNextBiome(save: SaveData, brokenGateBiomeIndex: number): boolean {
    const nextIdx = brokenGateBiomeIndex + 1;
    if (nextIdx >= BIOMES.length) return false;
    delete save.bossGateHpByBiome[brokenGateBiomeIndex];
    if (nextIdx > save.unlockedBiomeIndex) {
      save.unlockedBiomeIndex = nextIdx;
      save.selectedBiomeIndex = nextIdx;
      return true;
    }
    return false;
  }

  recordBossCoreDamage(save: SaveData, biomeIndex: number, coreIndex: number, hpLeft: number): void {
    if (!save.bossGateHpByBiome[biomeIndex]) {
      save.bossGateHpByBiome[biomeIndex] = [-1, -1, -1];
    }
    save.bossGateHpByBiome[biomeIndex][coreIndex] = Math.max(0, hpLeft);
  }

  /**
   * Handles Biome 6 Final Boss Gate clear branching:
   * - Strictly 0m Full-Shaft Run -> increments ascensionTier (zero reset) and records victory milestone
   * - Elevator Run -> clears gate HP and leaves ascensionTier untouched
   */
  completeFinalGateClear(
    save: SaveData,
    isFullShaftRun: boolean,
    telemetry: { blocksSmashed: number; maxCombo: number; timestamp: number }
  ): { ascended: boolean; newTier: number } {
    delete save.bossGateHpByBiome[ASCENSION_CONFIG.FINAL_BIOME_INDEX];
    if (!isFullShaftRun) {
      return { ascended: false, newTier: save.ascensionTier };
    }

    const nextTier = save.ascensionTier + 1;
    save.ascensionTier = nextTier;
    const milestone = getAscensionMilestone(nextTier);
    save.ascensionRecords.push({
      tier: nextTier,
      titleKey: milestone.titleKey,
      blocksSmashed: telemetry.blocksSmashed,
      maxCombo: telemetry.maxCombo,
      timestamp: telemetry.timestamp,
    });
    save.selectedBiomeIndex = 0; // Next tier starts cleanly at 0m
    return { ascended: true, newTier: nextTier };
  }

  checkMasteryFeats(save: SaveData, telemetry: RunTelemetry): string[] {
    const newlyUnlocked: string[] = [];
    const unlock = (id: string) => {
      if (!save.unlockedAchievements.includes(id)) {
        save.unlockedAchievements.push(id);
        newlyUnlocked.push(id);
      }
    };

    if (telemetry.tntChainMax >= 5) unlock('chain_detonator');
    if (telemetry.maxCombo >= 50) unlock('combo_master');
    if (UPGRADES.some((u) => (save.upgrades[u.id] ?? 1) >= 20)) unlock('heavy_investor');
    if (telemetry.isFullShaftRun && telemetry.maxDepthMeters >= BIOMES[3].startDepthM) {
      unlock('zero_skip_purist');
    }
    return newlyUnlocked;
  }

  claimMasteryFeat(save: SaveData, featId: string): number {
    if (!save.unlockedAchievements.includes(featId)) return 0;
    if (save.claimedAchievements.includes(featId)) return 0;
    const spec = MASTERY_FEATS.find((f) => f.id === featId);
    if (!spec) return 0;
    save.claimedAchievements.push(featId);
    save.coins += spec.rewardCoins;
    save.totalCoinsEarned += spec.rewardCoins;
    return spec.rewardCoins;
  }

  hasUnclaimedFeats(save: SaveData): boolean {
    return save.unlockedAchievements.some((id) => !save.claimedAchievements.includes(id));
  }

  canPrestige(save: SaveData): boolean {
    return save.maxDepthMeters >= PRESTIGE_UNLOCK_DEPTH_M;
  }

  triggerPrestige(save: SaveData): boolean {
    if (!this.canPrestige(save)) return false;
    save.prestigeLevel += 1;
    save.relicGems += 1;
    save.coins = 0;
    save.unlockedBiomeIndex = 0;
    save.selectedBiomeIndex = 0;
    save.bossGateHpByBiome = {};
    save.upgrades = {
      damage: 1,
      bounces: 1,
      multiorb: 1,
      orbsize: 1,
      luck: 1,
      orevalue: 1,
    };
    return true;
  }
}
