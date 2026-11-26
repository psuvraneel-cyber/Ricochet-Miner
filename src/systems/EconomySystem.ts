import {
  UPGRADES,
  calcDrillDamage,
  calcMaxBounces,
  calcMultiOrbCount,
  calcOrbRadius,
  calcOreValueMultiplier,
  calcUpgradeCost,
  getAscensionCapBonus,
  type UpgradeId,
  type UpgradeSpec,
} from '../config/gameConfig';
import type { SaveData } from '../sdk/SaveManager';

export class EconomySystem {
  getSpec(id: UpgradeId): UpgradeSpec {
    const spec = UPGRADES.find((u) => u.id === id);
    if (!spec) throw new Error(`Unknown upgrade: ${id}`);
    return spec;
  }

  getLevel(save: SaveData, id: UpgradeId): number {
    return save.upgrades[id] ?? 1;
  }

  getMaxLevel(save: SaveData, id: UpgradeId): number {
    return this.getSpec(id).maxLevel + getAscensionCapBonus(save.ascensionTier);
  }

  isMaxLevel(save: SaveData, id: UpgradeId): boolean {
    return this.getLevel(save, id) >= this.getMaxLevel(save, id);
  }

  getUpgradeCost(save: SaveData, id: UpgradeId): number {
    const spec = this.getSpec(id);
    const level = this.getLevel(save, id);
    return calcUpgradeCost(spec, level);
  }

  canAfford(save: SaveData, id: UpgradeId): boolean {
    if (this.isMaxLevel(save, id)) return false;
    return save.coins >= this.getUpgradeCost(save, id);
  }

  buyUpgrade(save: SaveData, id: UpgradeId): boolean {
    if (!this.canAfford(save, id)) return false;
    const cost = this.getUpgradeCost(save, id);
    save.coins -= cost;
    save.upgrades[id] = this.getLevel(save, id) + 1;
    return true;
  }

  grantFreeUpgrade(save: SaveData, id: UpgradeId): boolean {
    if (this.isMaxLevel(save, id)) return false;
    save.upgrades[id] = this.getLevel(save, id) + 1;
    return true;
  }

  getCheapestNearlyAffordableUpgrade(
    save: SaveData,
    minGap: number,
    maxGap: number
  ): UpgradeId | null {
    let bestId: UpgradeId | null = null;
    let bestCost = Number.POSITIVE_INFINITY;

    for (const spec of UPGRADES) {
      if (this.isMaxLevel(save, spec.id)) continue;
      const cost = this.getUpgradeCost(save, spec.id);
      if (save.coins >= cost) continue;
      const gap = (cost - save.coins) / cost;
      if (gap >= minGap && gap <= maxGap && cost < bestCost) {
        bestCost = cost;
        bestId = spec.id;
      }
    }
    return bestId;
  }

  getEffectiveDrillDamage(save: SaveData): number {
    return calcDrillDamage(save.upgrades.damage, save.prestigeLevel, save.ascensionTier);
  }

  getEffectiveMaxBounces(save: SaveData): number {
    return calcMaxBounces(save.upgrades.bounces);
  }

  getEffectiveMultiOrbCount(save: SaveData): number {
    return calcMultiOrbCount(save.upgrades.multiorb);
  }

  getEffectiveOrbRadius(save: SaveData): number {
    return calcOrbRadius(save.upgrades.orbsize);
  }

  getEffectiveOreValueMultiplier(save: SaveData): number {
    return calcOreValueMultiplier(save.upgrades.orevalue);
  }
}
