import { describe, expect, it } from 'vitest';
import {
  BIOMES,
  UPGRADES,
  calcCoinValue,
  calcUpgradeCost,
  getBiomeCoinMultiplier,
} from '../src/config/gameConfig';
import { PhysicsEngine } from '../src/physics/PhysicsEngine';
import { createDefaultSave } from '../src/sdk/SaveManager';
import { EconomySystem } from '../src/systems/EconomySystem';
import type { BlockEntity } from '../src/world/Entities';
import { ShaftGenerator } from '../src/world/ShaftGenerator';

describe('EconomySystem & GDD Curves', () => {
  it('ensures upgrade cost curves are strictly monotonically increasing', () => {
    for (const spec of UPGRADES) {
      let prev = 0;
      for (let lvl = 1; lvl <= spec.maxLevel; lvl++) {
        const cost = calcUpgradeCost(spec, lvl);
        expect(cost).toBeGreaterThan(prev);
        prev = cost;
      }
    }
  });

  it('guarantees Run 1 earns at least 25 coins to afford Drill Damage Lv.2', () => {
    const engine = new PhysicsEngine();
    const gen = new ShaftGenerator({
      baseRowOffset: 0,
      luckLevel: 1,
      bossGateHpByBiome: {},
      unlockedBiomeIndex: 0,
    });
    const entities: BlockEntity[] = [];
    gen.ensureChunksUpToRow(12, entities);

    let earned = 0;
    engine.setEvents({
      onBlockDestroyed: (_block, coins) => {
        earned += coins;
      },
      onBumperHit: (_orb, _bumper, coins) => {
        earned += coins;
      },
    });

    // Aim straight down at the FTUE TNT cluster
    const orb = engine.createOrb(270, 72, Math.PI / 2, 14, 8, 10);
    for (let i = 0; i < 120 * 10; i++) {
      engine.step(1 / 120, [orb], entities, 1, 1, 0);
      if (!orb.alive) break;
    }

    const eco = new EconomySystem();
    const save = createDefaultSave();
    const firstUpgradeCost = eco.getUpgradeCost(save, 'damage');
    expect(firstUpgradeCost).toBe(25);
    expect(earned).toBeGreaterThanOrEqual(firstUpgradeCost);
    expect(earned).toBeLessThan(500); // Anti-inflation check on shallow Run 1
  });

  it('scales Quantum Core biome multiplier exponentially every 250m past 1300m without runaway inflation', () => {
    const baseQuantum = BIOMES[5].coinMultiplier;
    expect(getBiomeCoinMultiplier(1300)).toBe(baseQuantum);
    expect(getBiomeCoinMultiplier(1550)).toBeCloseTo(baseQuantum * 1.15, 2);
    expect(calcCoinValue(1550, 'ore', 1, 0)).toBeGreaterThan(calcCoinValue(1300, 'ore', 1, 0));
    expect(calcCoinValue(10, 'ore', 5, 0)).toBeLessThan(100);
  });
});
