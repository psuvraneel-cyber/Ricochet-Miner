import { describe, expect, it } from 'vitest';
import {
  ARTIFACTS,
  BIOMES,
  SKILL_CONFIG,
  SKINS,
  calcCoinValue,
  calcDroneStats,
  calcMagPulseCooldownS,
  calcOverclockDurationS,
  calcRelicPotencyMult,
} from '../src/config/gameConfig';
import { PhysicsEngine } from '../src/physics/PhysicsEngine';
import { createDefaultSave } from '../src/sdk/SaveManager';
import { ArtifactSystem } from '../src/systems/ArtifactSystem';
import { EconomySystem } from '../src/systems/EconomySystem';
import type { BlockEntity, CoinDrop, CompanionDroneState } from '../src/world/Entities';
import { ShaftGenerator } from '../src/world/ShaftGenerator';

function makeBlock(
  id: number,
  kind: BlockEntity['kind'],
  col: number,
  row: number,
  hp: number,
  biomeIndex: number = 0
): BlockEntity {
  const x = col * 60 + 2;
  const y = row * 60 + 2;
  return {
    id,
    kind,
    col,
    row,
    colSpan: 1,
    x,
    y,
    width: 56,
    height: 56,
    radius: kind.startsWith('pickup_') ? 18 : 0,
    hp,
    maxHp: hp,
    depthMeters: row * 2.5,
    biomeIndex,
    hitFlashTimer: 0,
    alive: true,
  };
}

describe('Stage 2 Mechanics & Economy', () => {
  it('assigns unique gameplay passives to all 9 blades', () => {
    const passives = new Set(SKINS.map((s) => s.passiveId));
    expect(SKINS.length).toBe(9);
    expect(passives.size).toBe(9);
  });

  it('triggers Mag-Pulse Slam coin magnetizing, boss shard salvage, and AoE damage', () => {
    const engine = new PhysicsEngine();
    const orb = engine.createOrb(270, 220, Math.PI / 2, 14, 10, 40);
    const block = makeBlock(1, 'strata', 4, 4, 200);
    const shard = makeBlock(2, 'boss_shard', 2, 3, 15, 2);
    shard.radius = 15;
    const coin: CoinDrop = {
      x: 100,
      y: 300,
      vx: 0,
      vy: 0,
      value: 25,
      life: 2,
      magnetized: false,
      alive: true,
    };

    const pulses = engine.triggerMagPulseSlam([orb], [block, shard], [coin], 1, 1, 0, 0);
    expect(pulses.length).toBe(1);
    expect(coin.magnetized).toBe(true);
    expect(shard.alive).toBe(false);
    expect(block.hp).toBeLessThan(200);
  });

  it('collects shaft pickups without consuming bounces and splits on pickup_split', () => {
    const engine = new PhysicsEngine();
    const collected: string[] = [];
    engine.setEvents({
      onPickupCollected: (_orb, pickup) => collected.push(pickup.kind),
    });

    const splitPickup = makeBlock(10, 'pickup_split', 4, 4, 0);
    const orb = engine.createOrb(4 * 60 + 30, 4 * 60 + 25, Math.PI / 2, 14, 8, 25);
    const orbs = [orb];
    engine.step(1 / 120, orbs, [splitPickup], 1, 1, 0, 0);

    expect(splitPickup.alive).toBe(false);
    expect(collected).toEqual(['pickup_split']);
    expect(orbs.length).toBe(2);
    expect(orb.bouncesLeft).toBe(8);
  });

  it('spawns shaft pickups cleanly in procedural waves (never in Run-1 rows <= 3)', () => {
    const gen = new ShaftGenerator({
      baseRowOffset: 0,
      luckLevel: 1,
      bossGateHpByBiome: {},
      unlockedBiomeIndex: 0,
      seed: 123456,
    });
    const entities: BlockEntity[] = [];
    gen.ensureChunksUpToRow(80, entities);
    const pickups = entities.filter((e) => e.kind.startsWith('pickup_'));
    expect(pickups.length).toBeGreaterThan(0);
    expect(pickups.every((p) => p.row >= 7)).toBe(true);
  });

  it('rolls 3 distinct stackable Relic choices from the 10-perk pool', () => {
    expect(ARTIFACTS.length).toBe(10);
    const sys = new ArtifactSystem();
    const choices = sys.rollDraftChoices(3);
    expect(choices.length).toBe(3);
    expect(new Set(choices.map((c) => c.id)).size).toBe(3);

    sys.addArtifact(choices[0].id);
    sys.addArtifact(choices[0].id);
    expect(sys.getStack(choices[0].id)).toBe(2);
  });

  it('applies Multi-Phase Boss 2.0x weak-point multiplier on matching core index', () => {
    const engine = new PhysicsEngine();
    const weakCore = makeBlock(1, 'boss_core', 4, 5, 1000, 1);
    weakCore.bossCoreIndex = 1;
    const otherCore = makeBlock(2, 'boss_core', 1, 5, 1000, 1);
    otherCore.bossCoreIndex = 0;

    const orb1 = engine.createOrb(weakCore.x + 28, weakCore.y - 10, Math.PI / 2, 14, 10, 50);
    const orb2 = engine.createOrb(otherCore.x + 28, otherCore.y - 10, Math.PI / 2, 14, 10, 50);
    engine.step(1 / 120, [orb1, orb2], [weakCore, otherCore], 1, 1, 0, 0, {
      activeWeakPointCoreIndex: 1,
    });

    const dmgWeak = 1000 - weakCore.hp;
    const dmgOther = 1000 - otherCore.hp;
    expect(dmgWeak).toBeCloseTo(dmgOther * SKILL_CONFIG.BOSS_WEAKPOINT_CRIT_MULT, 1);
  });

  it('activates Companion Drone at 100m depth or Drone Bay purchase and fires drill beam', () => {
    const eco = new EconomySystem();
    const save = createDefaultSave();
    expect(eco.isDroneUnlocked(save)).toBe(false);
    save.maxDepthMeters = 100;
    expect(eco.isDroneUnlocked(save)).toBe(true);

    const engine = new PhysicsEngine();
    const drone: CompanionDroneState = {
      active: true,
      x: 270,
      y: 120,
      bobPhase: 0,
      propRotation: 0,
      fireCooldown: 0,
      targetX: null,
      targetY: null,
      beamTimer: 0,
    };
    const target = makeBlock(1, 'ore', 4, 4, 500, 0);
    const coin: CoinDrop = {
      x: 275,
      y: 130,
      vx: 0,
      vy: 0,
      value: 10,
      life: 2,
      magnetized: false,
      alive: true,
    };
    const stats = calcDroneStats(2, 20);
    engine.stepCompanionDrone(1 / 60, drone, [target], [coin], 0, stats, 1, 1, 0, 0);
    expect(target.hp).toBeLessThan(500);
    expect(coin.magnetized).toBe(true);
    expect(drone.beamTimer).toBeGreaterThan(0);
  });

  it('scales Overclock Core, Relic Forge & Blade Passives accurately', () => {
    expect(calcMagPulseCooldownS(1)).toBe(4.0);
    expect(calcMagPulseCooldownS(10)).toBeLessThan(4.0);
    expect(calcOverclockDurationS(5, 1)).toBeGreaterThan(calcOverclockDurationS(1, 0));
    expect(calcRelicPotencyMult(5)).toBeGreaterThan(1.4);

    // Thermite Edge burn DoT reduces block HP across dt even without second bounce
    const engine = new PhysicsEngine();
    const sturdy = makeBlock(1, 'strata', 4, 4, 400);
    const orb = engine.createOrb(sturdy.x + 28, sturdy.y - 12, Math.PI / 2, 14, 8, 50);
    engine.step(1 / 120, [orb], [sturdy], 1, 1, 0, 0, { bladePassive: 'thermite_edge' });
    const hpRightAfterHit = sturdy.hp;
    orb.alive = false;
    engine.step(0.5, [], [sturdy], 1, 1, 0, 0, { bladePassive: 'thermite_edge' });
    expect(sturdy.hp).toBeLessThan(hpRightAfterHit);
    expect(BIOMES[5].coinMultiplier).toBeGreaterThan(10);
    expect(calcCoinValue(150, 'ore', 1, 0)).toBeGreaterThan(0);
  });
});
