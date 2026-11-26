import { describe, expect, it } from 'vitest';
import { runAutonomousPlaytest } from './autonomous-playtest';

describe('Autonomous Playtest Simulation (Biomes 1-6)', () => {
  it('completes 50+ continuous runs across all 6 biomes with balanced pacing and zero SDK/save errors', () => {
    const metrics = runAutonomousPlaytest(55);

    console.log('\n=== AUTONOMOUS PLAYTEST SIMULATION REPORT ===');
    console.log(`Total Runs: ${metrics.totalRuns}`);
    console.log(`Unlocked Biomes (${metrics.unlockedBiomes.length}/6): ${metrics.unlockedBiomes.join(' -> ')}`);
    console.log(`Biome Unlock Run #s:`, metrics.biomeUnlockRuns);
    console.log(`Max Depth Reached: ${metrics.maxDepth}m`);
    console.log(`Average Run Coins: ${metrics.averageRunScore}`);
    console.log(`Max Coins Held Before Biome 2: ${metrics.maxCoinsBeforeBiome2}`);
    console.log(`Max Runs Without Upgrade: ${metrics.maxRunsWithoutUpgrade}`);
    console.log(`Quests Claimed: ${metrics.questsClaimed} | Unlocked Skins: ${metrics.unlockedSkins.join(', ')}`);
    console.log(`SDK gameplayStart/gameplayStop: ${metrics.gameplayStartCount}/${metrics.gameplayStopCount}`);
    console.log(`Trajectory Verified Runs: ${metrics.trajectoryVerifiedRuns}/${metrics.totalRuns}`);
    console.log(
      'Sample Pacing (Runs 1, 5, 10, 20, 30, 40, 50):',
      metrics.upgradePacingLogs.filter((l) => [1, 5, 10, 20, 30, 40, 50].includes(l.runNum))
    );

    expect(metrics.totalRuns).toBeGreaterThanOrEqual(50);
    expect(metrics.trajectoryVerifiedRuns).toBe(metrics.totalRuns);
    expect(metrics.gameplayStartCount).toBe(metrics.totalRuns);
    expect(metrics.gameplayStopCount).toBe(metrics.totalRuns);
    expect(metrics.saveErrors).toBe(0);
    expect(metrics.maxCoinsBeforeBiome2).toBeLessThan(100000);
    expect(metrics.unlockedBiomes.length).toBe(6);
    expect(metrics.maxDepth).toBeGreaterThanOrEqual(1300);
    expect(metrics.maxRunsWithoutUpgrade).toBeLessThanOrEqual(5);
  });
});
