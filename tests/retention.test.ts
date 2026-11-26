import { describe, expect, it } from 'vitest';
import { createDefaultSave } from '../src/sdk/SaveManager';
import { RetentionSystem } from '../src/systems/RetentionSystem';

describe('RetentionSystem', () => {
  it('enforces Run 3 unlock, 15m minimum, 4h cap, and negative clock guard on Offline Idle Drill', () => {
    const retention = new RetentionSystem();
    const save = createDefaultSave(1000000);
    save.recentRunCoinsPerMin = 200;

    // Before Run 3 -> 0
    save.runsCompleted = 2;
    expect(retention.calculateOfflineEarnings(save, 1000000 + 3600000)).toBe(0);

    // After Run 3, < 15 mins -> 0
    save.runsCompleted = 3;
    expect(retention.calculateOfflineEarnings(save, 1000000 + 10 * 60000)).toBe(0);

    // Negative clock tampering -> 0
    expect(retention.calculateOfflineEarnings(save, 500000)).toBe(0);

    // 4 hours vs 12 hours must cap identically at 4 hours
    const at4h = retention.calculateOfflineEarnings(save, 1000000 + 4 * 3600000);
    const at12h = retention.calculateOfflineEarnings(save, 1000000 + 12 * 3600000);
    expect(at4h).toBeGreaterThan(0);
    expect(at12h).toBe(at4h);
  });

  it('rotates 3 daily quests and awards Mega Chest after all 3 are claimed', () => {
    const retention = new RetentionSystem();
    const save = createDefaultSave(Date.UTC(2026, 5, 10));
    retention.refreshDailyQuestsIfNeeded(save, Date.UTC(2026, 5, 10));

    expect(save.dailyQuests.quests.length).toBe(3);
    expect(retention.canClaimMegaChest(save)).toBe(false);

    for (const q of save.dailyQuests.quests) {
      q.progress = q.target;
      expect(retention.claimQuest(save, q.id)).toBeGreaterThan(0);
    }

    expect(retention.canClaimMegaChest(save)).toBe(true);
    expect(retention.claimMegaChest(save)).toBe(true);
    expect(save.shards).toBe(5);
  });

  it('advances 7-day login streak cleanly across consecutive days', () => {
    const retention = new RetentionSystem();
    const day1 = Date.UTC(2026, 5, 10, 12, 0, 0);
    const day2 = Date.UTC(2026, 5, 11, 12, 0, 0);
    const save = createDefaultSave(day1);

    expect(retention.claimDailyLoginReward(save, day1)).toBe(true);
    expect(save.coins).toBe(300);
    expect(retention.claimDailyLoginReward(save, day1)).toBe(false);

    expect(retention.claimDailyLoginReward(save, day2)).toBe(true);
    expect(save.loginStreak.day).toBe(2);
    expect(save.upgrades.damage).toBe(2);
  });
});
