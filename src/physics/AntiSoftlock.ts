import { PHYSICS_CONFIG } from '../config/gameConfig';
import { degToRad } from '../utils/math';
import type { Orb } from '../world/Entities';

const HEIGHT_SAMPLE_INTERVAL_S = 0.15;
const HEIGHT_STDDEV_THRESHOLD_PX = 14;
const STALL_ACCEL_SECONDS = 4.5;

export class AntiSoftlock {
  static onWallBounce(orb: Orb): void {
    orb.consecutiveWallHits++;
    if (orb.y <= orb.maxProgressY + 12) {
      orb.nonProgressBounces++;
    } else {
      orb.maxProgressY = orb.y;
    }

    const stdDevY = AntiSoftlock.computeHeightStdDev(orb);
    const isLowVarianceTrap =
      orb.heightSampleCount >= 6 &&
      stdDevY < HEIGHT_STDDEV_THRESHOLD_PX &&
      (orb.consecutiveWallHits >= 2 || orb.nonProgressBounces >= 4);

    if (orb.consecutiveWallHits >= PHYSICS_CONFIG.HORIZONTAL_TRAP_WALL_HITS || isLowVarianceTrap) {
      orb.consecutiveWallHits = 0;
      orb.nonProgressBounces = 0;
      AntiSoftlock.deflectDownward(orb, isLowVarianceTrap ? 14 : PHYSICS_CONFIG.HORIZONTAL_TRAP_DEFLECT_DEG);
    }
  }

  static onIndestructibleHit(orb: Orb): void {
    if (orb.y <= orb.maxProgressY + 12) {
      orb.nonProgressBounces++;
    } else {
      orb.maxProgressY = orb.y;
    }

    const stdDevY = AntiSoftlock.computeHeightStdDev(orb);
    if (
      orb.nonProgressBounces >= 5 ||
      (orb.heightSampleCount >= 6 && stdDevY < HEIGHT_STDDEV_THRESHOLD_PX && orb.nonProgressBounces >= 3)
    ) {
      orb.nonProgressBounces = 0;
      AntiSoftlock.deflectDownward(orb, 14);
    }
  }

  static onBlockHit(orb: Orb): void {
    orb.consecutiveWallHits = 0;
    orb.nonProgressBounces = 0;
    orb.timeSinceProgress = 0;
    orb.overheatDraining = false;
    orb.stallBoostApplied = false;
    if (orb.y > orb.maxProgressY) {
      orb.maxProgressY = orb.y;
    }
  }

  static updateStallWatchdog(orb: Orb, dt: number): boolean {
    if (orb.y > orb.maxProgressY + 24) {
      orb.maxProgressY = orb.y;
      orb.nonProgressBounces = 0;
    }

    // Record periodic Y samples in pre-allocated ring buffer (zero GC)
    orb.heightSampleTimer += dt;
    if (orb.heightSampleTimer >= HEIGHT_SAMPLE_INTERVAL_S) {
      orb.heightSampleTimer -= HEIGHT_SAMPLE_INTERVAL_S;
      const cap = orb.heightSamples.length;
      orb.heightSamples[orb.heightSampleCursor] = orb.y;
      orb.heightSampleCursor = (orb.heightSampleCursor + 1) % cap;
      if (orb.heightSampleCount < cap) {
        orb.heightSampleCount++;
      }
    }

    orb.timeSinceProgress += dt;

    // Accelerated recall / 2x speed-up after 4.5s of stalled progress
    if (orb.timeSinceProgress >= STALL_ACCEL_SECONDS) {
      orb.overheatDraining = true;
      if (!orb.stallBoostApplied) {
        orb.stallBoostApplied = true;
        const speed = Math.hypot(orb.vx, orb.vy);
        if (speed > 1e-4) {
          const boosted = Math.min(PHYSICS_CONFIG.MAX_ORB_SPEED, speed * 2.0);
          const scale = boosted / speed;
          orb.vx *= scale;
          orb.vy *= scale;
        }
      }
      const drainRate = orb.timeSinceProgress >= PHYSICS_CONFIG.OVERHEAT_STALL_SECONDS ? 14 : 4.5;
      orb.bouncesLeft = Math.max(0, orb.bouncesLeft - dt * drainRate);
      if (orb.bouncesLeft <= 0) {
        orb.alive = false;
        return true;
      }
    }
    return false;
  }

  static computeHeightStdDev(orb: Orb): number {
    const count = orb.heightSampleCount;
    if (count < 2) return Number.POSITIVE_INFINITY;
    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += orb.heightSamples[i];
    }
    const mean = sum / count;
    let sq = 0;
    for (let i = 0; i < count; i++) {
      const d = orb.heightSamples[i] - mean;
      sq += d * d;
    }
    return Math.sqrt(sq / count);
  }

  private static deflectDownward(orb: Orb, deflectDeg: number): void {
    const deflect = degToRad(deflectDeg);
    const speed = Math.hypot(orb.vx, orb.vy);
    const signX = orb.vx >= 0 ? 1 : -1;
    const currentAngle = Math.atan2(Math.abs(orb.vy), Math.abs(orb.vx));
    const nextAngle = Math.min(Math.PI / 2 - 0.08, currentAngle + deflect);
    orb.vx = signX * Math.cos(nextAngle) * speed;
    orb.vy = Math.sin(nextAngle) * speed;
    orb.y += 2;
  }
}
