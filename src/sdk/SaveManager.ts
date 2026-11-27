import type { UpgradeId } from '../config/gameConfig';
import { getUtcDayKey } from '../utils/format';

export const SAVE_VERSION = 1;
export const LOCAL_SAVE_KEY = 'ricochet_miner_save_v1';

export interface DailyQuestState {
  id: string;
  progress: number;
  target: number;
  claimed: boolean;
}

export interface AscensionRecord {
  tier: number;
  titleKey: string;
  blocksSmashed: number;
  maxCombo: number;
  timestamp: number;
}

export interface SaveData {
  version: number;
  saveTimestamp: number;
  coins: number;
  totalCoinsEarned: number;
  shards: number;
  prestigeLevel: number;
  relicGems: number;
  ascensionTier: number;
  ascensionRecords: AscensionRecord[];
  unlockedAchievements: string[];
  claimedAchievements: string[];
  runsCompleted: number;
  recentRunEarnings: number[];
  recentRunCoinsPerMin: number;
  maxDepthMeters: number;
  unlockedBiomeIndex: number;
  selectedBiomeIndex: number;
  bossGateHpByBiome: Record<number, number[]>;
  upgrades: Record<UpgradeId, number>;
  unlockedSkins: string[];
  equippedSkin: string;
  skinRvProgress: Record<string, number>;
  overdrivePasses: number;
  stats: {
    tntDetonated: number;
    bumpersHit: number;
    blocksDestroyed: number;
    vaultsBroken: number;
    maxBounceCombo: number;
    runsCompleted: number;
  };
  loginStreak: {
    day: number;
    lastClaimDate: string;
    claimedToday: boolean;
  };
  dailyQuests: {
    dateKey: string;
    quests: DailyQuestState[];
    megaChestClaimed: boolean;
  };
  settings: {
    muted: boolean;
    sfxMuted: boolean;
    musicMuted: boolean;
    musicVolume?: 'off' | 'low' | 'high';
    aimMode: 'slingshot' | 'direct';
    aimModeUserSet?: boolean;
    localeOverride?: string;
  };
  ftueDone: boolean;
  lastActiveTimestamp: number;
}

export function createDefaultSave(nowMs: number = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    saveTimestamp: nowMs,
    coins: 0,
    totalCoinsEarned: 0,
    shards: 0,
    prestigeLevel: 0,
    relicGems: 0,
    ascensionTier: 0,
    ascensionRecords: [],
    unlockedAchievements: [],
    claimedAchievements: [],
    runsCompleted: 0,
    recentRunEarnings: [],
    recentRunCoinsPerMin: 120,
    maxDepthMeters: 0,
    unlockedBiomeIndex: 0,
    selectedBiomeIndex: 0,
    bossGateHpByBiome: {},
    upgrades: {
      damage: 1,
      bounces: 1,
      multiorb: 1,
      orbsize: 1,
      luck: 1,
      orevalue: 1,
      dronebay: 0,
      relicforge: 1,
      overclockcore: 1,
    },
    unlockedSkins: ['steel_sawblade'],
    equippedSkin: 'steel_sawblade',
    skinRvProgress: {},
    overdrivePasses: 0,
    stats: {
      tntDetonated: 0,
      bumpersHit: 0,
      blocksDestroyed: 0,
      vaultsBroken: 0,
      maxBounceCombo: 0,
      runsCompleted: 0,
    },
    loginStreak: {
      day: 1,
      lastClaimDate: '',
      claimedToday: false,
    },
    dailyQuests: {
      dateKey: getUtcDayKey(nowMs),
      quests: [],
      megaChestClaimed: false,
    },
    settings: {
      muted: false,
      sfxMuted: false,
      musicMuted: false,
      musicVolume: 'high',
      aimMode: 'direct',
      aimModeUserSet: false,
    },
    ftueDone: false,
    lastActiveTimestamp: nowMs,
  };
}

export function parseAndMigrateSave(raw: string | null, nowMs: number = Date.now()): SaveData {
  const fallback = createDefaultSave(nowMs);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (!parsed || typeof parsed !== 'object') return fallback;

    const merged: SaveData = {
      ...fallback,
      ...parsed,
      upgrades: {
        ...fallback.upgrades,
        ...(parsed.upgrades ?? {}),
      },
      stats: {
        ...fallback.stats,
        ...(parsed.stats ?? {}),
      },
      loginStreak: {
        ...fallback.loginStreak,
        ...(parsed.loginStreak ?? {}),
      },
      dailyQuests: {
        ...fallback.dailyQuests,
        ...(parsed.dailyQuests ?? {}),
      },
      settings: {
        ...fallback.settings,
        ...(parsed.settings ?? {}),
      },
      version: SAVE_VERSION,
    };

    if (!Array.isArray(merged.unlockedSkins) || merged.unlockedSkins.length === 0) {
      merged.unlockedSkins = ['steel_sawblade'];
    }
    if (!merged.unlockedSkins.includes(merged.equippedSkin)) {
      merged.equippedSkin = 'steel_sawblade';
    }
    if (!Number.isFinite(merged.coins) || merged.coins < 0) merged.coins = 0;
    if (!Number.isFinite(merged.totalCoinsEarned) || merged.totalCoinsEarned < 0) {
      merged.totalCoinsEarned = merged.coins;
    }
    if (!Number.isFinite(merged.ascensionTier) || merged.ascensionTier < 0) {
      merged.ascensionTier = 0;
    }
    if (!Array.isArray(merged.ascensionRecords)) {
      merged.ascensionRecords = [];
    }
    if (!Array.isArray(merged.unlockedAchievements)) {
      merged.unlockedAchievements = [];
    }
    if (!Array.isArray(merged.claimedAchievements)) {
      merged.claimedAchievements = [];
    }
    if (
      merged.settings.musicVolume !== 'off' &&
      merged.settings.musicVolume !== 'low' &&
      merged.settings.musicVolume !== 'high'
    ) {
      merged.settings.musicVolume = merged.settings.musicMuted ? 'off' : 'high';
    }
    if (merged.settings.musicVolume === 'off') {
      merged.settings.musicMuted = true;
    }

    return merged;
  } catch {
    return fallback;
  }
}

export function resolveSaveConflict(localSave: SaveData, cloudSave: SaveData | null): SaveData {
  if (!cloudSave) return localSave;
  if (cloudSave.totalCoinsEarned > localSave.totalCoinsEarned) return cloudSave;
  if (localSave.totalCoinsEarned > cloudSave.totalCoinsEarned) return localSave;
  return cloudSave.saveTimestamp > localSave.saveTimestamp ? cloudSave : localSave;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class SaveManager {
  private storage: StorageLike | null;
  private memoryFallback = new Map<string, string>();
  private storageWriteFailed = false;

  constructor(storage?: StorageLike | null) {
    if (storage !== undefined) {
      this.storage = storage;
    } else if (typeof window !== 'undefined') {
      try {
        this.storage = window.localStorage;
      } catch {
        this.storage = null;
      }
    } else {
      this.storage = null;
    }
  }

  loadLocal(nowMs: number = Date.now()): SaveData {
    if (this.storageWriteFailed) {
      const memRaw = this.memoryFallback.get(LOCAL_SAVE_KEY) ?? null;
      return parseAndMigrateSave(memRaw, nowMs);
    }
    try {
      const raw = this.storage?.getItem(LOCAL_SAVE_KEY) ?? this.memoryFallback.get(LOCAL_SAVE_KEY) ?? null;
      return parseAndMigrateSave(raw, nowMs);
    } catch {
      this.storageWriteFailed = true;
      const memRaw = this.memoryFallback.get(LOCAL_SAVE_KEY) ?? null;
      return parseAndMigrateSave(memRaw, nowMs);
    }
  }

  saveLocal(data: SaveData): string {
    data.saveTimestamp = Date.now();
    const json = JSON.stringify(data);
    this.memoryFallback.set(LOCAL_SAVE_KEY, json);
    try {
      this.storage?.setItem(LOCAL_SAVE_KEY, json);
      this.storageWriteFailed = false;
    } catch {
      // Safari private mode / Incognito SecurityError / sandboxed iframe safe fallback
      this.storageWriteFailed = true;
    }
    return json;
  }

  resetProgress(nowMs: number = Date.now()): SaveData {
    const fresh = createDefaultSave(nowMs);
    this.saveLocal(fresh);
    return fresh;
  }
}
