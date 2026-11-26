import { describe, expect, it } from 'vitest';
import { PHYSICS_CONFIG } from '../src/config/gameConfig';
import { PhysicsEngine } from '../src/physics/PhysicsEngine';
import type { BlockEntity } from '../src/world/Entities';
import { ShaftGenerator } from '../src/world/ShaftGenerator';

describe('PhysicsEngine & AntiSoftlock', () => {
  it('prevents high-speed orb from tunneling through shaft walls (CCD)', () => {
    const engine = new PhysicsEngine();
    const orb = engine.createOrb(40, 120, Math.PI, 14, 10, 10);
    orb.vx = -PHYSICS_CONFIG.MAX_ORB_SPEED;
    orb.vy = 0;

    for (let i = 0; i < 60; i++) {
      engine.step(PHYSICS_CONFIG.FIXED_DT, [orb], [], 1, 1, 0);
      expect(orb.x).toBeGreaterThanOrEqual(orb.radius - 0.01);
      expect(orb.x).toBeLessThanOrEqual(PHYSICS_CONFIG.SHAFT_WIDTH - orb.radius + 0.01);
    }
  });

  it('produces identical deterministic trajectories across identical runs', () => {
    const runSim = () => {
      const engine = new PhysicsEngine();
      const gen = new ShaftGenerator({
        baseRowOffset: 0,
        luckLevel: 1,
        bossGateHpByBiome: {},
        unlockedBiomeIndex: 0,
        seed: 12345,
      });
      const entities: BlockEntity[] = [];
      gen.ensureChunksUpToRow(12, entities);
      const orb = engine.createOrb(270, 72, Math.PI / 2 - 0.25, 14, 8, 10);
      for (let i = 0; i < 240; i++) {
        engine.step(PHYSICS_CONFIG.FIXED_DT, [orb], entities, 1, 1, 0);
      }
      return { x: orb.x, y: orb.y, bouncesLeft: orb.bouncesLeft };
    };

    const a = runSim();
    const b = runSim();
    expect(a).toEqual(b);
  });

  it('cleaves weak blocks without consuming bounce stamina', () => {
    const engine = new PhysicsEngine();
    const orb = engine.createOrb(150, 200, Math.PI / 2, 14, 8, 50);
    const weakBlock = {
      id: 1,
      kind: 'strata' as const,
      col: 2,
      row: 4,
      colSpan: 1,
      x: 122,
      y: 242,
      width: 56,
      height: 56,
      radius: 0,
      hp: 10, // 50 >= 2 * 10 -> Cleave!
      maxHp: 10,
      depthMeters: 10,
      biomeIndex: 0,
      hitFlashTimer: 0,
      alive: true,
    };

    for (let i = 0; i < 30; i++) {
      engine.step(PHYSICS_CONFIG.FIXED_DT, [orb], [weakBlock], 1, 1, 0);
    }

    expect(weakBlock.alive).toBe(false);
    expect(orb.bouncesLeft).toBe(8);
  });

  it('triggers accelerated recall and 2x speed-up after 4.5s without progress', () => {
    const engine = new PhysicsEngine();
    const orb = engine.createOrb(270, 200, Math.PI / 2, 14, 12, 10);
    let sawAccel = false;
    // Simulate up to 15 seconds with no blocks
    for (let i = 0; i < 15 * 120; i++) {
      engine.step(PHYSICS_CONFIG.FIXED_DT, [orb], [], 1, 1, 0);
      if (orb.overheatDraining && orb.stallBoostApplied) {
        sawAccel = true;
      }
      if (!orb.alive) break;
    }
    expect(sawAccel).toBe(true);
    expect(orb.alive).toBe(false);
  });

  it('detects shallow horizontal wall traps and deflects downward', () => {
    const engine = new PhysicsEngine();
    const orb = engine.createOrb(270, 200, 0.05, 14, 20, 10);
    orb.vy = 0;
    const initialVy = orb.vy;
    for (let i = 0; i < 240; i++) {
      engine.step(PHYSICS_CONFIG.FIXED_DT, [orb], [], 1, 1, 0);
    }
    expect(orb.vy).toBeGreaterThan(initialVy + 50);
  });

  it('transfers 20% splash damage from boss_armor to nearest boss_core', () => {
    const engine = new PhysicsEngine();
    const orb = engine.createOrb(150, 200, Math.PI / 2, 14, 8, 100);
    const armor = {
      id: 1,
      kind: 'boss_armor' as const,
      col: 2,
      row: 4,
      colSpan: 1,
      x: 122,
      y: 242,
      width: 56,
      height: 56,
      radius: 0,
      hp: Infinity,
      maxHp: Infinity,
      depthMeters: 150,
      biomeIndex: 0,
      hitFlashTimer: 0,
      alive: true,
    };
    const core = {
      id: 2,
      kind: 'boss_core' as const,
      col: 1,
      row: 4,
      colSpan: 1,
      x: 62,
      y: 242,
      width: 56,
      height: 56,
      radius: 0,
      hp: 500,
      maxHp: 500,
      depthMeters: 150,
      biomeIndex: 0,
      hitFlashTimer: 0,
      bossCoreIndex: 0,
      alive: true,
    };

    for (let i = 0; i < 20; i++) {
      engine.step(PHYSICS_CONFIG.FIXED_DT, [orb], [armor, core], 1, 1, 0);
    }

    expect(core.hp).toBeLessThan(500);
  });

  it('computes 2-bounce trajectory preview without placing any dots inside solid blocks', () => {
    const engine = new PhysicsEngine();
    const gen = new ShaftGenerator({
      baseRowOffset: 0,
      luckLevel: 1,
      bossGateHpByBiome: {},
      unlockedBiomeIndex: 0,
      seed: 0x5249434f,
    });
    const entities: BlockEntity[] = [];
    gen.ensureChunksUpToRow(20, entities);

    const orbR = 14;
    // Side-wall bank shot -> clear pre-bounce and post-bounce bank segment
    const bankPreview = engine.computeTrajectoryPreview(270, 108, 0.28, orbR, entities);
    expect(bankPreview.dots).toHaveLength(PHYSICS_CONFIG.TRAJECTORY_DOTS);
    expect(bankPreview.impactPoint).not.toBeNull();
    expect(bankPreview.bounceStartIdx).toBeLessThan(PHYSICS_CONFIG.TRAJECTORY_DOTS);

    // Direct angled shot into blocks -> zero dots inside solid blocks
    const blockPreview = engine.computeTrajectoryPreview(270, 108, 0.55, orbR, entities);
    expect(blockPreview.dots).toHaveLength(PHYSICS_CONFIG.TRAJECTORY_DOTS);
    expect(blockPreview.impactPoint).not.toBeNull();

    for (const dot of [...bankPreview.dots, ...blockPreview.dots]) {
      for (const b of entities) {
        if (!b.alive || b.kind === 'bumper' || b.kind === 'portal_entry' || b.kind === 'portal_exit') {
          continue;
        }
        const inside =
          dot.x > b.x + 1 &&
          dot.x < b.x + b.width - 1 &&
          dot.y > b.y + 1 &&
          dot.y < b.y + b.height - 1;
        expect(inside).toBe(false);
      }
    }
  });
});
