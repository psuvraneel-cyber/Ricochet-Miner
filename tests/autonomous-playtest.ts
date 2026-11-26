import {
  BIOMES,
  PHYSICS_CONFIG,
  UPGRADES,
  type UpgradeId,
} from '../src/config/gameConfig';
import { PhysicsEngine } from '../src/physics/PhysicsEngine';
import { PlatformSDKManager, type AdResult, type IPortalAdapter } from '../src/sdk/PlatformSDK';
import { SaveManager, createDefaultSave, type SaveData } from '../src/sdk/SaveManager';
import { EconomySystem } from '../src/systems/EconomySystem';
import { ProgressionSystem } from '../src/systems/ProgressionSystem';
import { RetentionSystem } from '../src/systems/RetentionSystem';
import { SkinSystem } from '../src/systems/SkinSystem';
import { degToRad } from '../src/utils/math';
import type { BlockEntity, Orb } from '../src/world/Entities';
import { ShaftGenerator } from '../src/world/ShaftGenerator';

export interface SimulationMetrics {
  totalRuns: number;
  unlockedBiomes: string[];
  maxDepth: number;
  averageRunScore: number;
  upgradePacingLogs: { runNum: number; upgradesPurchased: string[]; balance: number }[];
  biomeUnlockRuns: Record<string, number>;
  unlockedSkins: string[];
  questsClaimed: number;
  maxCoinsBeforeBiome2: number;
  maxRunsWithoutUpgrade: number;
  gameplayStartCount: number;
  gameplayStopCount: number;
  saveErrors: number;
  trajectoryVerifiedRuns: number;
}

function createSimAdapter() {
  let starts = 0;
  let stops = 0;
  let nowMs = Date.UTC(2026, 10, 1, 12, 0, 0);
  const adapter: IPortalAdapter = {
    name: 'sim',
    supportsBanners: false,
    hideFullscreenButton: false,
    async init() {},
    loadingStart() {},
    loadingStop() {},
    gameplayStart() {
      starts++;
    },
    gameplayStop() {
      stops++;
    },
    happytime() {},
    async showMidgameAd(): Promise<AdResult> {
      return { rewarded: true, reason: 'finished' };
    },
    async showRewardedAd(): Promise<AdResult> {
      return { rewarded: true, reason: 'finished' };
    },
    requestBanner() {},
    clearBanner() {},
    async saveCloudData() {},
    async loadCloudData() {
      return null;
    },
    getLocale() {
      return 'en';
    },
    getDeviceType() {
      return 'mobile';
    },
    getServerTimeMs() {
      return nowMs;
    },
  };
  return {
    adapter,
    advanceTimeMs: (ms: number) => {
      nowMs += ms;
    },
    getCounts: () => ({ starts, stops }),
  };
}

/**
 * Simulates a mobile slingshot drag-and-release gesture and returns clamped launch angle (rad).
 */
function simulateSlingshotDrag(dxCss: number, dyCss: number): number | null {
  const distCss = Math.hypot(dxCss, dyCss);
  if (distCss < Math.max(PHYSICS_CONFIG.CANCEL_DEADZONE_PX, 18)) {
    return null;
  }
  const aimDx = -dxCss;
  const aimDy = Math.max(12, Math.abs(dyCss));
  const rawAngle = Math.atan2(aimDy, aimDx);
  const minRad = degToRad(PHYSICS_CONFIG.MIN_AIM_DEG);
  const maxRad = degToRad(PHYSICS_CONFIG.MAX_AIM_DEG);
  return Math.max(minRad, Math.min(maxRad, rawAngle));
}

function chooseUpgradeStrategy(
  save: SaveData,
  economy: EconomySystem,
  unlockedBiomeIdx: number
): UpgradeId[] {
  const purchased: UpgradeId[] = [];
  // Prioritized weights: damage & orevalue drive biome clears and income; bounces & multiorb scale volume
  const priorityOrder: UpgradeId[] = [
    'damage',
    'orevalue',
    'bounces',
    'multiorb',
    'orbsize',
    'luck',
  ];

  // Keep buying while affordable upgrades provide strong value, prioritizing weakest lagging stats
  let boughtAny = true;
  let guard = 0;
  while (boughtAny && guard < 20) {
    boughtAny = false;
    guard++;

    // Sort candidates by cost relative to desired level balance
    let bestId: UpgradeId | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const id of priorityOrder) {
      if (!economy.canAfford(save, id)) continue;
      const lvl = economy.getLevel(save, id);
      const cost = economy.getUpgradeCost(save, id);
      // Weight factor: keep damage & orevalue leading, multiorb very attractive when affordable
      const weight =
        id === 'damage'
          ? 0.65
          : id === 'orevalue'
          ? 0.72
          : id === 'multiorb'
          ? 0.55
          : id === 'bounces'
          ? 0.85
          : 1.1;
      const targetBias = id === 'damage' && lvl < (unlockedBiomeIdx + 1) * 5 ? 0.6 : 1.0;
      const score = cost * weight * targetBias;
      if (score < bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    if (bestId && economy.buyUpgrade(save, bestId)) {
      purchased.push(bestId);
      boughtAny = true;
    }
  }
  return purchased;
}

export function runAutonomousPlaytest(minRuns: number = 60): SimulationMetrics {
  const sim = createSimAdapter();
  const sdk = new PlatformSDKManager(sim.adapter);

  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };
  const saveManager = new SaveManager(storage);
  const save = createDefaultSave(sim.adapter.getServerTimeMs());
  const economy = new EconomySystem();
  const progression = new ProgressionSystem();
  const retention = new RetentionSystem();
  const skins = new SkinSystem();

  retention.refreshDailyQuestsIfNeeded(save, sim.adapter.getServerTimeMs());
  retention.syncLoginStreakState(save, sim.adapter.getServerTimeMs());

  const physics = new PhysicsEngine();
  const generator = new ShaftGenerator({
    baseRowOffset: progression.getBaseRowOffset(save),
    luckLevel: save.upgrades.luck,
    bossGateHpByBiome: save.bossGateHpByBiome,
    unlockedBiomeIndex: save.unlockedBiomeIndex,
    seed: 0x5249434f,
  });

  const upgradePacingLogs: SimulationMetrics['upgradePacingLogs'] = [];
  const biomeUnlockRuns: Record<string, number> = { [BIOMES[0].id]: 0 };
  let totalCoinsAccumulatedAcrossRuns = 0;
  let maxCoinsBeforeBiome2 = 0;
  let runsWithoutUpgrade = 0;
  let maxRunsWithoutUpgrade = 0;
  let saveErrors = 0;
  let questsClaimed = 0;
  let trajectoryVerifiedRuns = 0;

  // Sweep varied aiming gestures: straight down, slight angles, wall-hug ricochets
  const dragVectors: Array<[number, number]> = [
    [0, 90], // straight down (Run 1 FTUE)
    [-26, 85], // slight right
    [28, 85], // slight left
    [-75, 55], // medium-wide right bank
    [78, 52], // medium-wide left bank
    [-110, 32], // wall-hug ricochet right
    [110, 32], // wall-hug ricochet left
  ];

  let runNum = 0;
  while (runNum < minRuns || (save.unlockedBiomeIndex < 5 && runNum < 120)) {
    runNum++;
    if (runNum === 3) {
      retention.claimDailyLoginReward(save, sim.adapter.getServerTimeMs());
    }
    // Simulate daily rollover every 15 runs to exercise login streak + daily quest refresh
    if (runNum % 15 === 0) {
      sim.advanceTimeMs(24 * 3600 * 1000);
      const now = sim.adapter.getServerTimeMs();
      const offline = retention.calculateOfflineEarnings(save, now);
      if (offline > 0) {
        save.coins += offline;
        save.totalCoinsEarned += offline;
      }
      retention.refreshDailyQuestsIfNeeded(save, now);
      retention.syncLoginStreakState(save, now);
      retention.claimDailyLoginReward(save, now);
    }

    const selectedBiome = progression.getSelectedBiome(save);
    generator.reset({
      baseRowOffset: progression.getBaseRowOffset(save),
      luckLevel: save.upgrades.luck,
      bossGateHpByBiome: save.bossGateHpByBiome,
      unlockedBiomeIndex: save.unlockedBiomeIndex,
      seed: 0x5249434f + runNum * 7919,
    });
    const entities: BlockEntity[] = [];
    generator.ensureChunksUpToRow(28, entities);

    // Cancel test once + valid drag gesture
    const canceledAngle = simulateSlingshotDrag(4, 6);
    if (canceledAngle !== null) {
      throw new Error('Deadzone drag failed to cancel');
    }

    const [dx, dy] = dragVectors[(runNum - 1) % dragVectors.length];
    const aimAngle = simulateSlingshotDrag(dx, dy);
    if (aimAngle === null) {
      throw new Error('Valid slingshot drag returned null angle');
    }

    // Verify 14-dot trajectory preview
    const orbRadius = economy.getEffectiveOrbRadius(save);
    const preview = physics.computeTrajectoryPreview(
      PHYSICS_CONFIG.SHAFT_WIDTH * 0.5,
      PHYSICS_CONFIG.LAUNCHER_Y,
      aimAngle,
      orbRadius,
      entities
    );
    if (preview.dots.length === PHYSICS_CONFIG.TRAJECTORY_DOTS) {
      trajectoryVerifiedRuns++;
    }

    sdk.gameplayStart();

    let runCoins = 0;
    let runMaxDepth = selectedBiome.startDepthM;
    let runElapsedS = 0;
    let bossBrokenThisRun = false;

    physics.setEvents({
      onBlockHit: (orb) => {
        if (orb.comboCount > save.stats.maxBounceCombo) {
          save.stats.maxBounceCombo = orb.comboCount;
        }
      },
      onBlockDestroyed: (_block, coins, isTnt, isVault) => {
        runCoins += coins;
        save.coins += coins;
        save.totalCoinsEarned += coins;
        save.stats.blocksDestroyed += 1;
        retention.recordQuestProgress(save, 'blocksDestroyed', 1);
        if (isTnt) {
          save.stats.tntDetonated += 1;
          retention.recordQuestProgress(save, 'tntDetonated', 1);
        }
        if (isVault) {
          save.stats.vaultsBroken += 1;
          save.shards += 1;
          retention.recordQuestProgress(save, 'vaultsBroken', 1);
        }
      },
      onBumperHit: (_orb, _bumper, coins) => {
        runCoins += coins;
        save.coins += coins;
        save.totalCoinsEarned += coins;
        save.stats.bumpersHit += 1;
        retention.recordQuestProgress(save, 'bumpersHit', 1);
      },
      onBossCoreDamaged: (biomeIndex, coreIndex, hpLeft) => {
        progression.recordBossCoreDamage(save, biomeIndex, coreIndex, hpLeft);
      },
      onBossGateBroken: (biomeIndex) => {
        bossBrokenThisRun = true;
        if (progression.unlockNextBiome(save, biomeIndex)) {
          const unlockedBiome = BIOMES[save.unlockedBiomeIndex];
          biomeUnlockRuns[unlockedBiome.id] = runNum;
        }
        skins.checkAndUnlockEligibleSkins(save);
      },
    });

    const totalOrbs = economy.getEffectiveMultiOrbCount(save);
    let pendingOrbs = totalOrbs - 1;
    let volleyTimer = 0;
    const orbs: Orb[] = [
      physics.createOrb(
        PHYSICS_CONFIG.SHAFT_WIDTH * 0.5,
        PHYSICS_CONFIG.LAUNCHER_Y,
        aimAngle,
        orbRadius,
        economy.getEffectiveMaxBounces(save),
        economy.getEffectiveDrillDamage(save)
      ),
    ];

    const dt = PHYSICS_CONFIG.FIXED_DT;
    const maxTicks = 120 * 40; // max 40s per run safety bound
    for (let tick = 0; tick < maxTicks; tick++) {
      runElapsedS += dt;
      if (pendingOrbs > 0) {
        volleyTimer += dt;
        if (volleyTimer >= PHYSICS_CONFIG.MULTI_ORB_INTERVAL_S) {
          volleyTimer -= PHYSICS_CONFIG.MULTI_ORB_INTERVAL_S;
          pendingOrbs--;
          orbs.push(
            physics.createOrb(
              PHYSICS_CONFIG.SHAFT_WIDTH * 0.5,
              PHYSICS_CONFIG.LAUNCHER_Y,
              aimAngle,
              orbRadius,
              economy.getEffectiveMaxBounces(save),
              economy.getEffectiveDrillDamage(save)
            )
          );
        }
      }

      physics.step(
        dt,
        orbs,
        entities,
        save.upgrades.orevalue,
        save.upgrades.orbsize,
        save.prestigeLevel
      );

      let lowestY = 0;
      let anyAlive = false;
      for (let i = 0; i < orbs.length; i++) {
        if (orbs[i].alive) {
          anyAlive = true;
          if (orbs[i].y > lowestY) lowestY = orbs[i].y;
        }
      }

      if (anyAlive) {
        const camY = Math.max(0, lowestY - PHYSICS_CONFIG.CAMERA_LOOKAHEAD_Y);
        const bottomRow = Math.ceil((camY + 1200) / PHYSICS_CONFIG.TILE_SIZE);
        generator.ensureChunksUpToRow(bottomRow, entities);
        const depth =
          selectedBiome.startDepthM +
          (lowestY / PHYSICS_CONFIG.TILE_SIZE) * PHYSICS_CONFIG.METERS_PER_ROW;
        if (depth > runMaxDepth) runMaxDepth = depth;
        if (depth > save.maxDepthMeters) save.maxDepthMeters = depth;
      } else if (pendingOrbs <= 0) {
        break;
      }
    }

    // End of run: verify gameplayStop(), quest/skin/save updates
    sdk.gameplayStop();
    save.runsCompleted += 1;
    save.stats.runsCompleted += 1;
    retention.recordQuestProgress(save, 'runsCompleted', 1);
    save.recentRunEarnings.push(runCoins);
    if (save.recentRunEarnings.length > 3) save.recentRunEarnings.shift();
    save.recentRunCoinsPerMin = Math.max(
      40,
      Math.round(runCoins / Math.max(0.25, runElapsedS / 60))
    );
    save.lastActiveTimestamp = sim.adapter.getServerTimeMs();

    for (const q of save.dailyQuests.quests) {
      if (!q.claimed && q.progress >= q.target) {
        if (retention.claimQuest(save, q.id) > 0) questsClaimed++;
      }
    }
    retention.claimMegaChest(save);
    skins.checkAndUnlockEligibleSkins(save);

    if (save.unlockedBiomeIndex < 1 && save.coins > maxCoinsBeforeBiome2) {
      maxCoinsBeforeBiome2 = save.coins;
    }

    totalCoinsAccumulatedAcrossRuns += runCoins;

    const anyUnmaxed = UPGRADES.some((u) => !economy.isMaxLevel(save, u.id));
    const bought = chooseUpgradeStrategy(save, economy, save.unlockedBiomeIndex);
    if (bought.length > 0) {
      runsWithoutUpgrade = 0;
    } else if (anyUnmaxed) {
      runsWithoutUpgrade++;
      if (runsWithoutUpgrade > maxRunsWithoutUpgrade) {
        maxRunsWithoutUpgrade = runsWithoutUpgrade;
      }
    }

    upgradePacingLogs.push({
      runNum,
      upgradesPurchased: bought,
      balance: save.coins,
    });

    try {
      saveManager.saveLocal(save);
      const reloaded = saveManager.loadLocal(sim.adapter.getServerTimeMs());
      if (reloaded.runsCompleted !== save.runsCompleted) {
        saveErrors++;
      }
    } catch {
      saveErrors++;
    }

    // Advance depth check when boss gate broken
    if (bossBrokenThisRun) {
      const nextBiome = progression.getSelectedBiome(save);
      if (nextBiome.startDepthM > save.maxDepthMeters) {
        save.maxDepthMeters = nextBiome.startDepthM;
      }
    }
  }

  const counts = sim.getCounts();
  return {
    totalRuns: runNum,
    unlockedBiomes: BIOMES.slice(0, save.unlockedBiomeIndex + 1).map((b) => b.id),
    maxDepth: Math.round(save.maxDepthMeters),
    averageRunScore: Math.round(totalCoinsAccumulatedAcrossRuns / runNum),
    upgradePacingLogs,
    biomeUnlockRuns,
    unlockedSkins: [...save.unlockedSkins],
    questsClaimed,
    maxCoinsBeforeBiome2,
    maxRunsWithoutUpgrade,
    gameplayStartCount: counts.starts,
    gameplayStopCount: counts.stops,
    saveErrors,
    trajectoryVerifiedRuns,
  };
}
