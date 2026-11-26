import { RETENTION_CONFIG } from '../config/gameConfig';
import type { DailyQuestState, SaveData } from '../sdk/SaveManager';
import { getUtcDayKey } from '../utils/format';

export class RetentionSystem {
  calculateOfflineEarnings(save: SaveData, nowMs: number): number {
    if (save.runsCompleted < RETENTION_CONFIG.OFFLINE_UNLOCK_RUNS) return 0;
    if (!save.lastActiveTimestamp || nowMs <= save.lastActiveTimestamp) return 0;

    const elapsedMs = nowMs - save.lastActiveTimestamp;
    const elapsedMinutes = elapsedMs / 60000;
    if (elapsedMinutes < RETENTION_CONFIG.OFFLINE_MIN_MINUTES) return 0;

    const maxMinutes = RETENTION_CONFIG.OFFLINE_MAX_HOURS * 60;
    const clampedMinutes = Math.min(elapsedMinutes, maxMinutes);
    const ratePerMin = Math.max(10, save.recentRunCoinsPerMin) * RETENTION_CONFIG.OFFLINE_RATE_FRACTION;
    return Math.max(1, Math.floor(clampedMinutes * ratePerMin));
  }

  refreshDailyQuestsIfNeeded(save: SaveData, nowMs: number): void {
    const todayKey = getUtcDayKey(nowMs);
    if (save.dailyQuests.dateKey === todayKey && save.dailyQuests.quests.length === 3) {
      return;
    }

    const pool = [...RETENTION_CONFIG.DAILY_QUEST_POOL];
    // Deterministic daily rotation based on date string hash
    let hash = 0;
    for (let i = 0; i < todayKey.length; i++) {
      hash = (hash * 31 + todayKey.charCodeAt(i)) >>> 0;
    }

    const picked: DailyQuestState[] = [];
    for (let i = 0; i < 3; i++) {
      const idx = (hash + i * 2) % pool.length;
      const item = pool.splice(idx, 1)[0];
      picked.push({
        id: item.id,
        progress: 0,
        target: item.target,
        claimed: false,
      });
    }

    save.dailyQuests = {
      dateKey: todayKey,
      quests: picked,
      megaChestClaimed: false,
    };
  }

  recordQuestProgress(
    save: SaveData,
    metric: 'tntDetonated' | 'bumpersHit' | 'blocksDestroyed' | 'runsCompleted' | 'vaultsBroken',
    delta: number
  ): void {
    for (const q of save.dailyQuests.quests) {
      const spec = RETENTION_CONFIG.DAILY_QUEST_POOL.find((p) => p.id === q.id);
      if (spec && spec.metric === metric && !q.claimed) {
        q.progress = Math.min(q.target, q.progress + delta);
      }
    }
  }

  claimQuest(save: SaveData, questId: string): number {
    const q = save.dailyQuests.quests.find((item) => item.id === questId);
    if (!q || q.claimed || q.progress < q.target) return 0;
    const spec = RETENTION_CONFIG.DAILY_QUEST_POOL.find((p) => p.id === q.id);
    if (!spec) return 0;
    q.claimed = true;
    save.coins += spec.rewardCoins;
    save.totalCoinsEarned += spec.rewardCoins;
    return spec.rewardCoins;
  }

  canClaimMegaChest(save: SaveData): boolean {
    if (save.dailyQuests.megaChestClaimed) return false;
    return (
      save.dailyQuests.quests.length === 3 &&
      save.dailyQuests.quests.every((q) => q.claimed)
    );
  }

  claimMegaChest(save: SaveData): boolean {
    if (!this.canClaimMegaChest(save)) return false;
    save.dailyQuests.megaChestClaimed = true;
    save.coins += RETENTION_CONFIG.DAILY_MEGA_CHEST_COINS;
    save.totalCoinsEarned += RETENTION_CONFIG.DAILY_MEGA_CHEST_COINS;
    save.shards += RETENTION_CONFIG.DAILY_MEGA_CHEST_SHARDS;
    return true;
  }

  syncLoginStreakState(save: SaveData, nowMs: number): void {
    const todayKey = getUtcDayKey(nowMs);
    if (save.loginStreak.lastClaimDate === todayKey) {
      save.loginStreak.claimedToday = true;
      return;
    }
    save.loginStreak.claimedToday = false;
    if (save.loginStreak.lastClaimDate) {
      const lastMs = Date.parse(`${save.loginStreak.lastClaimDate}T00:00:00Z`);
      const todayMs = Date.parse(`${todayKey}T00:00:00Z`);
      const diffDays = Math.round((todayMs - lastMs) / 86400000);
      if (diffDays > 1) {
        save.loginStreak.day = 1;
      } else if (diffDays === 1) {
        save.loginStreak.day = save.loginStreak.day >= 7 ? 1 : save.loginStreak.day + 1;
      }
    }
  }

  claimDailyLoginReward(save: SaveData, nowMs: number): boolean {
    this.syncLoginStreakState(save, nowMs);
    if (save.loginStreak.claimedToday) return false;

    const dayIdx = Math.max(0, Math.min(6, save.loginStreak.day - 1));
    const reward = RETENTION_CONFIG.LOGIN_REWARDS[dayIdx];
    if (reward.type === 'coins') {
      save.coins += reward.amount;
      save.totalCoinsEarned += reward.amount;
    } else if (reward.type === 'free_damage') {
      save.upgrades.damage = Math.min(40, save.upgrades.damage + reward.amount);
    } else if (reward.type === 'shards') {
      save.shards += reward.amount;
    } else if (reward.type === 'overdrive_pass') {
      save.overdrivePasses += reward.amount;
    } else if (reward.type === 'skin') {
      if (!save.unlockedSkins.includes(reward.skinId)) {
        save.unlockedSkins.push(reward.skinId);
      }
    }

    save.loginStreak.lastClaimDate = getUtcDayKey(nowMs);
    save.loginStreak.claimedToday = true;
    return true;
  }
}
