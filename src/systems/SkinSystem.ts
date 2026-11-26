import { SKINS, type SkinSpec } from '../config/gameConfig';
import type { SaveData } from '../sdk/SaveManager';

export class SkinSystem {
  getEquippedSkin(save: SaveData): SkinSpec {
    return SKINS.find((s) => s.id === save.equippedSkin) ?? SKINS[0];
  }

  checkAndUnlockEligibleSkins(save: SaveData): string[] {
    const newlyUnlocked: string[] = [];
    for (const skin of SKINS) {
      if (save.unlockedSkins.includes(skin.id)) continue;

      if (
        skin.category === 'milestone' &&
        typeof skin.unlockBiomeIndex === 'number' &&
        save.unlockedBiomeIndex >= skin.unlockBiomeIndex
      ) {
        save.unlockedSkins.push(skin.id);
        newlyUnlocked.push(skin.id);
      } else if (
        skin.category === 'mastery' &&
        skin.masteryStat &&
        typeof skin.masteryTarget === 'number' &&
        save.stats[skin.masteryStat] >= skin.masteryTarget
      ) {
        save.unlockedSkins.push(skin.id);
        newlyUnlocked.push(skin.id);
      }
    }
    return newlyUnlocked;
  }

  equipSkin(save: SaveData, skinId: string): boolean {
    if (!save.unlockedSkins.includes(skinId)) return false;
    save.equippedSkin = skinId;
    return true;
  }

  unlockWithCoins(save: SaveData, skinId: string): boolean {
    const skin = SKINS.find((s) => s.id === skinId);
    if (!skin || save.unlockedSkins.includes(skinId) || !skin.coinCost) return false;
    if (save.coins < skin.coinCost) return false;
    save.coins -= skin.coinCost;
    save.unlockedSkins.push(skinId);
    save.equippedSkin = skinId;
    return true;
  }

  addRvProgress(save: SaveData, skinId: string): boolean {
    const skin = SKINS.find((s) => s.id === skinId);
    if (!skin || save.unlockedSkins.includes(skinId) || !skin.rvCost) return false;
    const prev = save.skinRvProgress[skinId] ?? 0;
    const next = prev + 1;
    save.skinRvProgress[skinId] = next;
    if (next >= skin.rvCost) {
      save.unlockedSkins.push(skinId);
      save.equippedSkin = skinId;
      return true;
    }
    return false;
  }
}
