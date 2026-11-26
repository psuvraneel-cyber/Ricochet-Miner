import { describe, expect, it, vi } from 'vitest';
import {
  ASCENSION_CONFIG,
  UPGRADES,
  calcBlockHP,
  calcCoinValue,
  calcDrillDamage,
  calcMultiOrbCount,
  getAscensionCapBonus,
  getAscensionCoinMultiplier,
  getAscensionDamageBonus,
  getAscensionHpMultiplier,
  getAscensionMilestone,
  toRomanNumeral,
} from '../src/config/gameConfig';
import { StateMachine } from '../src/core/StateMachine';
import { PlatformSDKManager, type IPortalAdapter } from '../src/sdk/PlatformSDK';
import { SaveManager, createDefaultSave, parseAndMigrateSave } from '../src/sdk/SaveManager';
import { EconomySystem } from '../src/systems/EconomySystem';
import { ProgressionSystem } from '../src/systems/ProgressionSystem';
import type { BlockEntity } from '../src/world/Entities';
import { ShaftGenerator } from '../src/world/ShaftGenerator';

describe('Ascension System (Phase 13)', () => {
  it('increments ascensionTier strictly on 0m one-shot clear and preserves upgrades/coins/skins', () => {
    const prog = new ProgressionSystem();
    const econ = new EconomySystem();
    const save = createDefaultSave(1_700_000_000_000);
    save.unlockedBiomeIndex = ASCENSION_CONFIG.FINAL_BIOME_INDEX;
    save.coins = 42_000;
    save.upgrades.damage = 14;
    save.upgrades.bounces = 9;
    save.unlockedSkins.push('magma_cutter');
    save.equippedSkin = 'magma_cutter';
    save.loginStreak.day = 5;

    // 0m One-Shot Clear -> Tier 1
    const res1 = prog.completeFinalGateClear(save, true, {
      blocksSmashed: 320,
      maxCombo: 45,
      timestamp: 1_700_000_123_000,
    });
    expect(res1).toEqual({ ascended: true, newTier: 1 });
    expect(save.ascensionTier).toBe(1);
    expect(save.ascensionRecords).toHaveLength(1);
    expect(save.ascensionRecords[0]).toEqual({
      tier: 1,
      titleKey: 'asc_tier_1_title',
      blocksSmashed: 320,
      maxCombo: 45,
      timestamp: 1_700_000_123_000,
    });

    // Zero reset invariant
    expect(save.coins).toBe(42_000);
    expect(save.upgrades.damage).toBe(14);
    expect(save.upgrades.bounces).toBe(9);
    expect(save.unlockedSkins).toContain('magma_cutter');
    expect(save.equippedSkin).toBe('magma_cutter');
    expect(save.loginStreak.day).toBe(5);

    // Exact Ascension formulas at Tier 1 & Tier 2
    expect(getAscensionHpMultiplier(1)).toBe(2);
    expect(getAscensionHpMultiplier(2)).toBe(4);
    expect(getAscensionCoinMultiplier(1)).toBeCloseTo(1.65, 6);
    expect(getAscensionCoinMultiplier(2)).toBeCloseTo(2.7225, 6);
    expect(getAscensionCapBonus(1)).toBe(10);
    expect(getAscensionDamageBonus(1)).toBeCloseTo(1.15, 6);

    const hp0 = calcBlockHP(200, 'strata', 0);
    const hp1 = calcBlockHP(200, 'strata', 1);
    expect(hp1).toBeGreaterThanOrEqual(hp0 * 2);

    const coin0 = calcCoinValue(200, 'ore', 5, 0, 0);
    const coin1 = calcCoinValue(200, 'ore', 5, 0, 1);
    expect(coin1).toBeGreaterThan(coin0);
    expect(coin1 / coin0).toBeCloseTo(1.65, 1);

    const dmg0 = calcDrillDamage(10, 0, 0);
    const dmg1 = calcDrillDamage(10, 0, 1);
    expect(dmg1 / dmg0).toBeCloseTo(1.15, 6);

    // Max level cap grows by +10 per tier
    const damageSpec = UPGRADES.find((u) => u.id === 'damage')!;
    expect(econ.getMaxLevel(save, 'damage')).toBe(damageSpec.maxLevel + 10);
  });

  it('does NOT increment ascensionTier when clearing Biome 6 via Elevator', () => {
    const prog = new ProgressionSystem();
    const econ = new EconomySystem();
    const save = createDefaultSave();
    save.unlockedBiomeIndex = ASCENSION_CONFIG.FINAL_BIOME_INDEX;
    prog.selectBiome(save, ASCENSION_CONFIG.FINAL_BIOME_INDEX);

    const res = prog.completeFinalGateClear(save, false, {
      blocksSmashed: 90,
      maxCombo: 22,
      timestamp: 123_456,
    });

    expect(res).toEqual({ ascended: false, newTier: 0 });
    expect(save.ascensionTier).toBe(0);
    expect(save.ascensionRecords).toHaveLength(0);

    const damageSpec = UPGRADES.find((u) => u.id === 'damage')!;
    expect(econ.getMaxLevel(save, 'damage')).toBe(damageSpec.maxLevel);
  });

  it('spawns Biome 6 Final Boss Gate at 1550m scaled by Ascension Tier', () => {
    const baseOpts = {
      baseRowOffset: 0,
      luckLevel: 1,
      bossGateHpByBiome: {},
      unlockedBiomeIndex: 5,
    };
    const genT0 = new ShaftGenerator({ ...baseOpts, ascensionTier: 0 });
    const entitiesT0: BlockEntity[] = [];
    // 1550m / 2.5m per row = row 620
    genT0.ensureChunksUpToRow(630, entitiesT0);
    const gateT0 = entitiesT0.filter((e) => e.kind === 'boss_core' && e.biomeIndex === 5);
    expect(gateT0).toHaveLength(3);
    expect(Math.round(gateT0[0].depthMeters)).toBe(ASCENSION_CONFIG.FINAL_GATE_DEPTH_M);

    const genT2 = new ShaftGenerator({ ...baseOpts, ascensionTier: 2 });
    const entitiesT2: BlockEntity[] = [];
    genT2.ensureChunksUpToRow(630, entitiesT2);
    const gateT2 = entitiesT2.filter((e) => e.kind === 'boss_core' && e.biomeIndex === 5);
    expect(gateT2).toHaveLength(3);
    // Tier 2 multiplies gate HP by 4x vs Tier 0
    expect(gateT2[0].maxHp).toBeGreaterThanOrEqual(gateT0[0].maxHp * 4 - 4);
    expect(gateT2[0].maxHp).toBeLessThanOrEqual(gateT0[0].maxHp * 4 + 4);
  });

  it('persists, migrates, and resets Ascension data in SaveManager', () => {
    const store = new Map<string, string>();
    const sm = new SaveManager({
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, v);
      },
    });

    // Legacy save without ascension fields migrates cleanly
    const legacy = parseAndMigrateSave(JSON.stringify({ coins: 500, unlockedBiomeIndex: 3 }));
    expect(legacy.ascensionTier).toBe(0);
    expect(legacy.ascensionRecords).toEqual([]);
    expect(legacy.unlockedAchievements).toEqual([]);
    expect(legacy.claimedAchievements).toEqual([]);

    legacy.ascensionTier = 3;
    legacy.ascensionRecords = [{ tier: 3, titleKey: 'asc_tier_3_title', blocksSmashed: 999, maxCombo: 60, timestamp: 9999 }];
    legacy.unlockedAchievements = ['combo_master'];
    legacy.claimedAchievements = ['combo_master'];
    sm.saveLocal(legacy);

    const loaded = sm.loadLocal();
    expect(loaded.ascensionTier).toBe(3);
    expect(loaded.ascensionRecords).toHaveLength(1);
    expect(loaded.unlockedAchievements).toEqual(['combo_master']);
    expect(loaded.claimedAchievements).toEqual(['combo_master']);

    const reset = sm.resetProgress();
    expect(reset.ascensionTier).toBe(0);
    expect(reset.ascensionRecords).toEqual([]);
    expect(reset.unlockedAchievements).toEqual([]);
    expect(reset.claimedAchievements).toEqual([]);
  });

  it('unlocks and claims Mastery Feats once without duplicate payouts', () => {
    const prog = new ProgressionSystem();
    const save = createDefaultSave();
    save.upgrades.damage = 20;

    const unlocked = prog.checkMasteryFeats(save, {
      blocksSmashed: 100,
      maxCombo: 52,
      tntChainMax: 5,
      maxDepthMeters: 700,
      isFullShaftRun: true,
    });

    expect(unlocked).toEqual(
      expect.arrayContaining(['chain_detonator', 'combo_master', 'heavy_investor', 'zero_skip_purist'])
    );
    expect(prog.hasUnclaimedFeats(save)).toBe(true);

    const beforeCoins = save.coins;
    const reward1 = prog.claimMasteryFeat(save, 'chain_detonator');
    expect(reward1).toBe(1500);
    expect(save.coins).toBe(beforeCoins + 1500);

    // Second claim returns 0
    const rewardDup = prog.claimMasteryFeat(save, 'chain_detonator');
    expect(rewardDup).toBe(0);
    expect(save.coins).toBe(beforeCoins + 1500);
  });

  it('supports ASCENSION_VICTORY state transitions, milestones, and SDK single-fire compliance', () => {
    expect(toRomanNumeral(1)).toBe('I');
    expect(toRomanNumeral(4)).toBe('IV');
    expect(getAscensionMilestone(1).titleKey).toBe('asc_tier_1_title');
    expect(getAscensionMilestone(6).titleKey).toBe('asc_tier_4_title');

    const sm = new StateMachine();
    sm.transition('TITLE');
    expect(sm.state).toBe('TITLE');
    sm.transition('AIMING');
    expect(sm.state).toBe('AIMING');
    sm.transition('RUNNING');
    expect(sm.state).toBe('RUNNING');
    sm.transition('ASCENSION_VICTORY');
    expect(sm.state).toBe('ASCENSION_VICTORY');
    sm.transition('AIMING');
    expect(sm.state).toBe('AIMING');

    const gameplayStart = vi.fn();
    const gameplayStop = vi.fn();
    const happytime = vi.fn();
    const adapter: IPortalAdapter = {
      name: 'mock',
      supportsBanners: false,
      hideFullscreenButton: false,
      init: async () => {},
      loadingStart: () => {},
      loadingStop: () => {},
      gameplayStart,
      gameplayStop,
      happytime,
      showMidgameAd: async () => ({ rewarded: true, reason: 'finished' }),
      showRewardedAd: async () => ({ rewarded: true, reason: 'finished' }),
      requestBanner: () => {},
      clearBanner: () => {},
      saveCloudData: async () => {},
      loadCloudData: async () => null,
      getLocale: () => 'en',
      getDeviceType: () => 'desktop',
      getServerTimeMs: () => Date.now(),
    };
    const sdk = new PlatformSDKManager(adapter);
    sdk.gameplayStart();
    sdk.happytime();
    sdk.gameplayStop();
    sdk.gameplayStop();

    expect(gameplayStart).toHaveBeenCalledTimes(1);
    expect(happytime).toHaveBeenCalledTimes(1);
    expect(gameplayStop).toHaveBeenCalledTimes(1);
  });

  it('scales calcMultiOrbCount monotonically past level 6 up to Ascension tiers', () => {
    let prev = 0;
    for (let lvl = 1; lvl <= 16; lvl++) {
      const count = calcMultiOrbCount(lvl);
      expect(count).toBe(lvl);
      expect(count).toBeGreaterThan(prev);
      prev = count;
    }
    expect(calcMultiOrbCount(18)).toBe(18);
  });
});
