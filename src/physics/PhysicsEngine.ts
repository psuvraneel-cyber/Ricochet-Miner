import {
  LASER_DAMAGE_MULT,
  PHYSICS_CONFIG,
  SKILL_CONFIG,
  TNT_DAMAGE_MULT,
  calcCoinValue,
  calcTntRadiusPx,
  type ArtifactId,
  type BladePassiveId,
} from '../config/gameConfig';
import { clamp } from '../utils/math';
import type { BlockEntity, CoinDrop, CompanionDroneState, Orb } from '../world/Entities';
import { AntiSoftlock } from './AntiSoftlock';
import { SpatialGrid } from './SpatialGrid';

export interface PhysicsModifiers {
  bladePassive?: BladePassiveId;
  overclockActive?: boolean;
  artifactStacks?: Partial<Record<ArtifactId, number>>;
  relicPotencyMult?: number;
  activeWeakPointCoreIndex?: number | null;
}

export interface BlockHitMeta {
  willKill?: boolean;
  critFired?: boolean;
}

export interface PhysicsEvents {
  onWallHit?: (orb: Orb, x: number, y: number) => void;
  onBlockHit?: (
    orb: Orb,
    block: BlockEntity,
    damage: number,
    cleaved: boolean,
    meta?: BlockHitMeta
  ) => void;
  onBlockDestroyed?: (block: BlockEntity, coins: number, isTnt: boolean, isVault: boolean) => void;
  onTntExplode?: (x: number, y: number, radius: number) => void;
  onBumperHit?: (orb: Orb, bumper: BlockEntity, coins: number) => void;
  onLaserFire?: (rowY: number, biomeIndex: number) => void;
  onPortalWarp?: (orb: Orb, from: BlockEntity, to: BlockEntity) => void;
  onBossGateBroken?: (biomeIndex: number, row: number) => void;
  onBossCoreDamaged?: (biomeIndex: number, coreIndex: number, hpLeft: number, maxHp: number) => void;
  onBossWeakPointHit?: (block: BlockEntity, damage: number) => void;
  onBossShardHit?: (shard: BlockEntity) => void;
  onBossShardSalvaged?: (shard: BlockEntity) => void;
  onPickupCollected?: (orb: Orb, pickup: BlockEntity) => void;
  onLightningArc?: (x1: number, y1: number, x2: number, y2: number, target: BlockEntity) => void;
  onBlockCrit?: (block: BlockEntity, damage: number) => void;
  onDroneShot?: (x: number, y: number, targetX: number, targetY: number) => void;
  onPassiveProc?: (passive: 'burn' | 'chill' | 'acid' | 'void' | 'gyro', x: number, y: number) => void;
  onOrbExpired?: (orb: Orb) => void;
}

const TRAIL_CAPACITY = 14;
const HEIGHT_SAMPLE_CAPACITY = 16;

export class PhysicsEngine {
  private grid = new SpatialGrid();
  private nextOrbId = 1;
  private events: PhysicsEvents;
  private cloneBuffer: Orb[] = [];
  private wallGyroUsed = new WeakSet<Orb>();
  private orbBreakCounts = new WeakMap<Orb, number>();

  constructor(events: PhysicsEvents = {}) {
    this.events = events;
  }

  setEvents(events: PhysicsEvents): void {
    this.events = events;
  }

  createOrb(
    x: number,
    y: number,
    angleRad: number,
    radius: number,
    maxBounces: number,
    damage: number,
    isClone: boolean = false,
    isOverdrive: boolean = false
  ): Orb {
    const speed = PHYSICS_CONFIG.LAUNCH_SPEED * (isOverdrive ? 1.08 : 1);
    const trailPool: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < TRAIL_CAPACITY; i++) {
      trailPool.push({ x, y });
    }
    const heightSamples = new Array<number>(HEIGHT_SAMPLE_CAPACITY).fill(y);

    return {
      id: this.nextOrbId++,
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(angleRad) * speed,
      vy: Math.sin(angleRad) * speed,
      radius,
      bouncesLeft: maxBounces,
      maxBounces,
      damage,
      rotation: 0,
      comboCount: 0,
      consecutiveWallHits: 0,
      nonProgressBounces: 0,
      maxProgressY: y,
      timeSinceProgress: 0,
      heightSamples,
      heightSampleCursor: 0,
      heightSampleCount: 1,
      heightSampleTimer: 0,
      overheatDraining: false,
      stallBoostApplied: false,
      portalCooldown: 0,
      isClone,
      isOverdrive,
      trail: [trailPool[0]],
      trailPool,
      alive: true,
    };
  }

  step(
    dt: number,
    orbs: Orb[],
    entities: BlockEntity[],
    oreValueLevel: number,
    orbSizeLevel: number,
    prestigeLevel: number,
    ascensionTier: number = 0,
    modifiers: PhysicsModifiers = {}
  ): void {
    this.grid.rebuild(entities);

    for (let i = 0; i < entities.length; i++) {
      const block = entities[i];
      if (!block.alive) continue;
      if (block.hitFlashTimer > 0) {
        block.hitFlashTimer = Math.max(0, block.hitFlashTimer - dt);
      }
      if (block.kind === 'boss_shard' && block.vy) {
        block.y += block.vy * dt;
        block.x += Math.sin(block.y * 0.03 + block.id) * 18 * dt;
        block.x = clamp(block.x, 8, PHYSICS_CONFIG.SHAFT_WIDTH - block.width - 8);
      }
      if (block.burnTimer && block.burnTimer > 0 && block.burnDps && Number.isFinite(block.hp)) {
        block.burnTimer = Math.max(0, block.burnTimer - dt);
        this.damageBlockDirect(
          block,
          block.burnDps * dt,
          entities,
          oreValueLevel,
          orbSizeLevel,
          prestigeLevel,
          ascensionTier,
          block.burnDps,
          modifiers,
          undefined,
          true
        );
      }
    }

    this.cloneBuffer.length = 0;
    let aliveCount = 0;
    for (let i = 0; i < orbs.length; i++) {
      if (orbs[i].alive) aliveCount++;
    }

    for (let i = 0; i < orbs.length; i++) {
      const orb = orbs[i];
      if (!orb.alive) continue;

      orb.prevX = orb.x;
      orb.prevY = orb.y;
      if (orb.portalCooldown > 0) {
        orb.portalCooldown = Math.max(0, orb.portalCooldown - dt);
      }

      // Gravity
      orb.vy += PHYSICS_CONFIG.GRAVITY * dt;
      this.normalizeOrbSpeed(orb);

      const speedMult = modifiers.overclockActive ? SKILL_CONFIG.OVERCLOCK_SPEED_MULT : 1;
      const totalDx = orb.vx * speedMult * dt;
      const totalDy = orb.vy * speedMult * dt;
      const dist = Math.hypot(totalDx, totalDy);
      const maxStep = Math.max(2, orb.radius * 0.35);
      const subSteps = Math.max(1, Math.ceil(dist / maxStep));
      const subDt = (dt * speedMult) / subSteps;

      for (let s = 0; s < subSteps; s++) {
        if (!orb.alive) break;
        const stepStartX = orb.x;
        const stepStartY = orb.y;
        orb.x += orb.vx * subDt;
        orb.y += orb.vy * subDt;

        const wallBounced = this.resolveWallCollisions(orb, modifiers);
        if (wallBounced && !this.wallGyroUsed.has(orb)) {
          const hasGyro = modifiers.bladePassive === 'ricochet_gyro';
          const hasTwinWall = (modifiers.artifactStacks?.twin_emitter ?? 0) > 0;
          if (hasGyro || hasTwinWall) {
            this.wallGyroUsed.add(orb);
            orb.bouncesLeft = Math.min(orb.maxBounces + 6, orb.bouncesLeft + 1);
            if (hasGyro) {
              this.events.onPassiveProc?.('gyro', orb.x, orb.y);
            }
          }
        }
        if (!orb.alive) break;

        this.resolveEntityCollisions(
          orb,
          stepStartX,
          stepStartY,
          aliveCount,
          this.cloneBuffer,
          entities,
          oreValueLevel,
          orbSizeLevel,
          prestigeLevel,
          ascensionTier,
          modifiers
        );

        // Safeguard: clamp back inside shaft bounds if block push-out pressed into wall
        if (orb.alive) {
          this.enforceWallBounds(orb);
        }
      }

      orb.rotation +=
        (Math.hypot(orb.vx, orb.vy) / Math.max(8, orb.radius)) *
        dt *
        (modifiers.overclockActive ? 2.4 : 1.4);
      this.pushTrailPoint(orb);

      if (orb.alive && AntiSoftlock.updateStallWatchdog(orb, dt)) {
        this.events.onOrbExpired?.(orb);
      }
    }

    for (let i = 0; i < this.cloneBuffer.length; i++) {
      if (aliveCount >= PHYSICS_CONFIG.MAX_ACTIVE_ORBS) break;
      orbs.push(this.cloneBuffer[i]);
      aliveCount++;
    }
  }

  private pushTrailPoint(orb: Orb): void {
    if (orb.trail.length < TRAIL_CAPACITY) {
      const slot = orb.trailPool[orb.trail.length];
      slot.x = orb.x;
      slot.y = orb.y;
      orb.trail.push(slot);
    } else {
      const recycled = orb.trail.shift()!;
      recycled.x = orb.x;
      recycled.y = orb.y;
      orb.trail.push(recycled);
    }
  }

  private normalizeOrbSpeed(orb: Orb): void {
    const clamped = this.clampVelocity(orb.vx, orb.vy);
    orb.vx = clamped.vx;
    orb.vy = clamped.vy;
  }

  private clampVelocity(vx: number, vy: number): { vx: number; vy: number } {
    const speed = Math.hypot(vx, vy);
    if (speed < 1e-5) {
      return { vx: 0, vy: PHYSICS_CONFIG.MIN_ORB_SPEED };
    }
    if (speed < PHYSICS_CONFIG.MIN_ORB_SPEED) {
      const scale = PHYSICS_CONFIG.MIN_ORB_SPEED / speed;
      return { vx: vx * scale, vy: vy * scale };
    }
    if (speed > PHYSICS_CONFIG.MAX_ORB_SPEED) {
      const scale = PHYSICS_CONFIG.MAX_ORB_SPEED / speed;
      return { vx: vx * scale, vy: vy * scale };
    }
    return { vx, vy };
  }

  private enforceWallBounds(orb: Orb): void {
    if (orb.x - orb.radius < 0) {
      orb.x = orb.radius;
      if (orb.vx < 0) orb.vx = Math.abs(orb.vx);
    } else if (orb.x + orb.radius > PHYSICS_CONFIG.SHAFT_WIDTH) {
      orb.x = PHYSICS_CONFIG.SHAFT_WIDTH - orb.radius;
      if (orb.vx > 0) orb.vx = -Math.abs(orb.vx);
    }
    if (orb.y - orb.radius < 0) {
      orb.y = orb.radius;
      if (orb.vy < 0) orb.vy = Math.abs(orb.vy);
    }
  }

  private resolveWallCollisions(orb: Orb, _modifiers: PhysicsModifiers = {}): boolean {
    let hitWall = false;
    if (orb.x - orb.radius < 0) {
      orb.x = orb.radius;
      orb.vx = Math.abs(orb.vx) * PHYSICS_CONFIG.RESTITUTION_BLOCK;
      hitWall = true;
    } else if (orb.x + orb.radius > PHYSICS_CONFIG.SHAFT_WIDTH) {
      orb.x = PHYSICS_CONFIG.SHAFT_WIDTH - orb.radius;
      orb.vx = -Math.abs(orb.vx) * PHYSICS_CONFIG.RESTITUTION_BLOCK;
      hitWall = true;
    }

    if (orb.y - orb.radius < 0) {
      orb.y = orb.radius;
      orb.vy = Math.abs(orb.vy) * PHYSICS_CONFIG.RESTITUTION_BLOCK;
      hitWall = true;
    }

    if (hitWall) {
      this.normalizeOrbSpeed(orb);
      AntiSoftlock.onWallBounce(orb);
      orb.bouncesLeft -= PHYSICS_CONFIG.WALL_BOUNCE_COST;
      this.events.onWallHit?.(orb, orb.x, orb.y);
      if (orb.bouncesLeft <= 0) {
        orb.bouncesLeft = 0;
        orb.alive = false;
        this.events.onOrbExpired?.(orb);
      }
    }
    return hitWall;
  }

  private resolveEntityCollisions(
    orb: Orb,
    stepStartX: number,
    stepStartY: number,
    aliveCount: number,
    newClones: Orb[],
    entities: BlockEntity[],
    oreValueLevel: number,
    orbSizeLevel: number,
    prestigeLevel: number,
    ascensionTier: number,
    modifiers: PhysicsModifiers
  ): void {
    const queryRadius = orb.radius + Math.hypot(orb.x - stepStartX, orb.y - stepStartY) + 6;
    const candidates = this.grid.queryCircle(orb.x, orb.y, queryRadius);

    for (let i = 0; i < candidates.length; i++) {
      const block = candidates[i];
      if (!block.alive || !orb.alive) continue;
      if (block.kind === 'portal_exit') continue;

      if (
        block.kind === 'pickup_split' ||
        block.kind === 'pickup_magnet' ||
        block.kind === 'pickup_overclock'
      ) {
        const cx = block.x + block.width * 0.5;
        const cy = block.y + block.height * 0.5;
        const minDist = orb.radius + (block.radius || 18);
        const dx = orb.x - cx;
        const dy = orb.y - cy;
        if (
          dx * dx + dy * dy < minDist * minDist ||
          this.segmentCircleHit(stepStartX, stepStartY, orb.x, orb.y, cx, cy, minDist)
        ) {
          block.alive = false;
          if (block.kind === 'pickup_split') {
            const activeTotal = aliveCount + newClones.length;
            if (activeTotal < PHYSICS_CONFIG.MAX_ACTIVE_ORBS) {
              const splitAngle = Math.atan2(Math.abs(orb.vy) + 100, -orb.vx);
              const clone = this.createOrb(
                cx,
                cy,
                splitAngle,
                orb.radius * 0.92,
                Math.max(3, Math.ceil(orb.bouncesLeft * 0.7)),
                orb.damage * 0.9,
                true,
                orb.isOverdrive
              );
              newClones.push(clone);
            }
          }
          this.events.onPickupCollected?.(orb, block);
        }
        continue;
      }

      if (block.kind === 'bumper' || block.kind === 'portal_entry') {
        const cx = block.x + block.width * 0.5;
        const cy = block.y + block.height * 0.5;
        const minDist = orb.radius + block.radius;

        // Swept segment-vs-circle fallback check to prevent high-speed tunneling
        const hitCircle = this.segmentCircleHit(stepStartX, stepStartY, orb.x, orb.y, cx, cy, minDist);
        const dx = orb.x - cx;
        const dy = orb.y - cy;
        const distSq = dx * dx + dy * dy;

        if (distSq < minDist * minDist || hitCircle) {
          if (block.kind === 'portal_entry') {
            this.handlePortalEntry(orb, block, entities);
            continue;
          }

          const dist = Math.max(0.001, Math.sqrt(distSq));
          const nx = distSq > 1e-6 ? dx / dist : 0;
          const ny = distSq > 1e-6 ? dy / dist : -1;
          orb.x = cx + nx * (minDist + 0.5);
          orb.y = cy + ny * (minDist + 0.5);

          const dot = orb.vx * nx + orb.vy * ny;
          if (dot < 0) {
            orb.vx -= 2 * dot * nx;
            orb.vy -= 2 * dot * ny;
          }
          orb.vx *= PHYSICS_CONFIG.RESTITUTION_BUMPER;
          orb.vy *= PHYSICS_CONFIG.RESTITUTION_BUMPER;
          this.normalizeOrbSpeed(orb);

          orb.bouncesLeft = Math.min(
            orb.maxBounces + 6,
            orb.bouncesLeft + PHYSICS_CONFIG.BUMPER_BOUNCE_BONUS
          );
          orb.comboCount++;
          AntiSoftlock.onBlockHit(orb);

          const coins = Math.round(
            calcCoinValue(
              block.depthMeters,
              'bumper',
              oreValueLevel,
              prestigeLevel,
              ascensionTier
            ) *
              (1 +
                (modifiers.artifactStacks?.magnetic_wake ?? 0) *
                  0.2 *
                  (modifiers.relicPotencyMult ?? 1))
          );
          block.hitFlashTimer = 0.08;
          if (typeof block.hitsRemaining === 'number') {
            block.hitsRemaining--;
            if (block.hitsRemaining <= 0) {
              block.alive = false;
            }
          }
          this.events.onBumperHit?.(orb, block, coins);
          continue;
        }
        continue;
      }

      // Falling Boss Shard crystal intercept
      if (block.kind === 'boss_shard') {
        const cx = block.x + block.width * 0.5;
        const cy = block.y + block.height * 0.5;
        const minDist = orb.radius + (block.radius || 15);
        const dx = orb.x - cx;
        const dy = orb.y - cy;
        if (dx * dx + dy * dy < minDist * minDist) {
          const nonLethal = block.hp - orb.damage > 0;
          this.damageBlockDirect(
            block,
            orb.damage,
            entities,
            oreValueLevel,
            orbSizeLevel,
            prestigeLevel,
            ascensionTier,
            orb.damage,
            modifiers,
            orb
          );
          if (nonLethal && block.alive) {
            this.events.onBossShardHit?.(block);
          }
        }
        continue;
      }

      // Circle vs AABB (plus swept midpoint fallback)
      let closestX = clamp(orb.x, block.x, block.x + block.width);
      let closestY = clamp(orb.y, block.y, block.y + block.height);
      let dx = orb.x - closestX;
      let dy = orb.y - closestY;
      let distSq = dx * dx + dy * dy;

      if (distSq >= orb.radius * orb.radius) {
        // Check swept midpoint in case high speed grazed corner
        const midX = (stepStartX + orb.x) * 0.5;
        const midY = (stepStartY + orb.y) * 0.5;
        const mcx = clamp(midX, block.x, block.x + block.width);
        const mcy = clamp(midY, block.y, block.y + block.height);
        const mdx = midX - mcx;
        const mdy = midY - mcy;
        const mDistSq = mdx * mdx + mdy * mdy;
        if (mDistSq >= orb.radius * orb.radius) continue;
        orb.x = midX;
        orb.y = midY;
        closestX = mcx;
        closestY = mcy;
        dx = mdx;
        dy = mdy;
        distSq = mDistSq;
      }

      // Determine collision normal
      let nx = 0;
      let ny = 0;
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        nx = dx / dist;
        ny = dy / dist;
      } else {
        // Center inside AABB: push out along shallowest axis (or back toward stepStart)
        const leftPen = orb.x - block.x;
        const rightPen = block.x + block.width - orb.x;
        const topPen = orb.y - block.y;
        const bottomPen = block.y + block.height - orb.y;
        const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);
        if (minPen === leftPen) nx = -1;
        else if (minPen === rightPen) nx = 1;
        else if (minPen === topPen) ny = -1;
        else ny = 1;
      }

      // Cleave check: D >= ratio * HP_rem (never cleave indestructible boss_armor)
      let cleaveRatio = PHYSICS_CONFIG.CLEAVE_RATIO;
      if (modifiers.overclockActive) {
        cleaveRatio /= SKILL_CONFIG.OVERCLOCK_CLEAVE_BONUS;
      }
      if (modifiers.bladePassive === 'precision_cleave') {
        cleaveRatio *= 0.85;
      }
      const effectiveHitDmg = this.computeEffectiveOrbDamage(orb, block, modifiers);
      const canCleave =
        Number.isFinite(block.hp) &&
        effectiveHitDmg >= cleaveRatio * block.hp;

      if (!canCleave) {
        // Push out cleanly and reflect
        const overlap = orb.radius - Math.sqrt(Math.max(0, distSq));
        orb.x += nx * (overlap + 0.6);
        orb.y += ny * (overlap + 0.6);

        const dot = orb.vx * nx + orb.vy * ny;
        if (dot < 0) {
          const rest =
            modifiers.bladePassive === 'ricochet_gyro'
              ? Math.min(1.01, PHYSICS_CONFIG.RESTITUTION_BLOCK * 1.05)
              : PHYSICS_CONFIG.RESTITUTION_BLOCK;
          orb.vx = (orb.vx - 2 * dot * nx) * rest;
          orb.vy = (orb.vy - 2 * dot * ny) * rest;
          this.normalizeOrbSpeed(orb);
        }

        orb.bouncesLeft -= PHYSICS_CONFIG.BLOCK_BOUNCE_COST;
      } else if (modifiers.bladePassive === 'phase_cleave') {
        this.normalizeOrbSpeed(orb);
        this.events.onPassiveProc?.('void', orb.x, orb.y);
      }

      orb.comboCount++;
      if (block.kind === 'boss_armor') {
        AntiSoftlock.onIndestructibleHit(orb);
      } else {
        AntiSoftlock.onBlockHit(orb);
      }

      this.applyHitToBlock(
        orb,
        block,
        nx,
        aliveCount,
        newClones,
        entities,
        oreValueLevel,
        orbSizeLevel,
        prestigeLevel,
        ascensionTier,
        canCleave,
        modifiers
      );

      if (!canCleave && orb.bouncesLeft <= 0) {
        orb.bouncesLeft = 0;
        orb.alive = false;
        this.events.onOrbExpired?.(orb);
      }
    }
  }

  private segmentCircleHit(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    r: number
  ): boolean {
    const abx = bx - ax;
    const aby = by - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq <= 1e-6) return false;
    const t = clamp(((cx - ax) * abx + (cy - ay) * aby) / abLenSq, 0, 1);
    const px = ax + abx * t;
    const py = ay + aby * t;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy < r * r;
  }

  private handlePortalEntry(orb: Orb, entry: BlockEntity, entities: BlockEntity[]): void {
    if (orb.portalCooldown > 0) return;
    let exit: BlockEntity | undefined;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e.id === entry.portalTargetId && e.alive) {
        exit = e;
        break;
      }
    }
    if (!exit) return;

    orb.x = exit.x + exit.width * 0.5;
    orb.y = exit.y + exit.height * 0.5 + orb.radius + 6;
    if (this.grid.isCellOccupied(exit.col, exit.row + 1, entities)) {
      orb.y = exit.y + exit.height * 0.5;
    }
    orb.portalCooldown = PHYSICS_CONFIG.PORTAL_COOLDOWN_S;
    orb.bouncesLeft = Math.min(orb.maxBounces + 6, orb.bouncesLeft + PHYSICS_CONFIG.PORTAL_BONUS_BOUNCES);

    const speed = Math.min(
      PHYSICS_CONFIG.MAX_ORB_SPEED,
      Math.hypot(orb.vx, orb.vy) * PHYSICS_CONFIG.PORTAL_SPEED_BOOST
    );
    const downwardAngle = clamp(Math.atan2(Math.abs(orb.vy) + 120, orb.vx), 0.35, Math.PI - 0.35);
    orb.vx = Math.cos(downwardAngle) * speed;
    orb.vy = Math.sin(downwardAngle) * speed;

    orb.trail.length = 0;
    orb.trailPool[0].x = orb.x;
    orb.trailPool[0].y = orb.y;
    orb.trail.push(orb.trailPool[0]);

    AntiSoftlock.onBlockHit(orb);
    this.events.onPortalWarp?.(orb, entry, exit);
  }

  private computeEffectiveOrbDamage(
    orb: Orb,
    block: BlockEntity,
    modifiers: PhysicsModifiers
  ): number {
    const potency = modifiers.relicPotencyMult ?? 1;
    const stacks = modifiers.artifactStacks ?? {};
    let dmg = orb.damage;

    if (modifiers.overclockActive) {
      dmg *= SKILL_CONFIG.OVERCLOCK_DAMAGE_MULT;
    }

    const rampStacks = stacks.kinetic_ramp ?? 0;
    if (rampStacks > 0) {
      dmg *= 1 + Math.min(2.0, rampStacks * 0.04 * potency * orb.comboCount);
    }

    if (
      modifiers.bladePassive === 'precision_cleave' &&
      Number.isFinite(block.hp) &&
      block.hp < block.maxHp
    ) {
      dmg *= 1.15;
    } else if (
      modifiers.bladePassive === 'shatter_chill' &&
      (block.kind === 'frost' || block.kind === 'granite' || block.hp < block.maxHp * 0.85)
    ) {
      dmg *= 1.25;
    } else if (modifiers.bladePassive === 'phase_cleave' && block.kind === 'boss_core') {
      dmg *= 1.35;
    }

    if (block.kind === 'boss_core') {
      const breaker = stacks.boss_breaker ?? 0;
      if (breaker > 0) {
        dmg *= 1 + 0.35 * breaker * potency;
      }
      if (
        modifiers.activeWeakPointCoreIndex !== null &&
        modifiers.activeWeakPointCoreIndex !== undefined &&
        block.bossCoreIndex === modifiers.activeWeakPointCoreIndex
      ) {
        dmg *= SKILL_CONFIG.BOSS_WEAKPOINT_CRIT_MULT + breaker * 0.5;
      }
    }

    return dmg;
  }

  private applyHitToBlock(
    orb: Orb,
    block: BlockEntity,
    nx: number,
    aliveCount: number,
    newClones: Orb[],
    entities: BlockEntity[],
    oreValueLevel: number,
    orbSizeLevel: number,
    prestigeLevel: number,
    ascensionTier: number,
    cleaved: boolean,
    modifiers: PhysicsModifiers = {}
  ): void {
    block.hitFlashTimer = 0.045;
    const potency = modifiers.relicPotencyMult ?? 1;
    const stacks = modifiers.artifactStacks ?? {};

    if (block.kind === 'boss_armor') {
      // Transfer 20% splash damage to nearest surviving boss_core in same row (zero-GC loop)
      let nearest: BlockEntity | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        if (e.alive && e.kind === 'boss_core' && e.row === block.row) {
          const d = Math.abs(e.col - block.col);
          if (d < bestDist) {
            bestDist = d;
            nearest = e;
          }
        }
      }
      if (nearest) {
        const splashDmg = orb.damage * PHYSICS_CONFIG.BOSS_ARMOR_SPLASH_RATIO;
        this.damageBlockDirect(
          nearest,
          splashDmg,
          entities,
          oreValueLevel,
          orbSizeLevel,
          prestigeLevel,
          ascensionTier,
          orb.damage,
          modifiers,
          orb
        );
      }
      this.events.onBlockHit?.(orb, block, 0, false);
      return;
    }

    // Frost block slides 1 tile horizontally away from impact if adjacent tile is empty
    if (block.kind === 'frost' && block.hp > orb.damage) {
      const slideDir = nx >= 0 ? -1 : 1;
      const targetCol = block.col + slideDir;
      if (!this.grid.isCellOccupied(targetCol, block.row, entities)) {
        block.renderX = block.renderX ?? block.x;
        block.col = targetCol;
        block.x = targetCol * PHYSICS_CONFIG.TILE_SIZE + 2;
        this.grid.rebuild(entities);
      }
    }

    // Splitter prism spawns 1+ clone orbs
    if (block.kind === 'splitter') {
      const forkBonus = stacks.chain_fork ?? 0;
      const twinExtra = (stacks.twin_emitter ?? 0) > 0 ? 1 : 0;
      const count = 1 + (forkBonus > 0 || twinExtra > 0 ? 1 : 0);
      for (let c = 0; c < count; c++) {
        const activeTotal = aliveCount + newClones.length;
        if (activeTotal < PHYSICS_CONFIG.MAX_ACTIVE_ORBS && orb.bouncesLeft >= 2) {
          const cloneAngle = Math.atan2(orb.vy, -orb.vx) + (c === 1 ? 0.28 : 0);
          const clone = this.createOrb(
            orb.x,
            orb.y,
            cloneAngle,
            orb.radius * 0.9,
            Math.max(2, Math.floor(orb.bouncesLeft * 0.5)),
            orb.damage * 0.85,
            true,
            orb.isOverdrive
          );
          newClones.push(clone);
        }
      }
    }

    // Thermite Edge Burn DoT
    if (modifiers.bladePassive === 'thermite_edge' && Number.isFinite(block.hp)) {
      block.burnTimer = 3.0;
      block.burnDps = Math.max(block.burnDps ?? 0, orb.damage * 0.22);
      this.events.onPassiveProc?.('burn', block.x + block.width * 0.5, block.y + block.height * 0.5);
    }

    // Effective hit damage + Weak-Point + Crit + Armor Pierce
    let hitDmg = this.computeEffectiveOrbDamage(orb, block, modifiers);
    const lensStacks = stacks.precision_lens ?? 0;
    const critChance = lensStacks > 0 ? Math.min(0.65, lensStacks * 0.2 * potency) : 0;
    const isWeakPoint =
      block.kind === 'boss_core' &&
      modifiers.activeWeakPointCoreIndex !== null &&
      modifiers.activeWeakPointCoreIndex !== undefined &&
      block.bossCoreIndex === modifiers.activeWeakPointCoreIndex;
    let critFired = false;
    if (isWeakPoint) {
      if (critChance > 0 && Math.random() < critChance) {
        hitDmg *= 1.75;
      }
      this.events.onBossWeakPointHit?.(block, hitDmg);
      critFired = true;
    } else if (critChance > 0 && Math.random() < critChance) {
      hitDmg *= 1.75;
      this.events.onBlockCrit?.(block, hitDmg);
      critFired = true;
    }

    const baseGraniteMult = block.biomeIndex >= 1 ? 0.38 : 0.5;
    const graniteMult = modifiers.overclockActive
      ? Math.max(baseGraniteMult, 0.72)
      : modifiers.bladePassive === 'corrosive_splash'
      ? Math.max(baseGraniteMult, 0.65)
      : baseGraniteMult;

    const directDmg =
      block.kind === 'granite' && !cleaved ? hitDmg * graniteMult : hitDmg;
    const willKill = Number.isFinite(block.hp) && block.hp - directDmg <= 0;

    this.events.onBlockHit?.(orb, block, hitDmg, cleaved, { willKill, critFired });

    this.damageBlockDirect(
      block,
      directDmg,
      entities,
      oreValueLevel,
      orbSizeLevel,
      prestigeLevel,
      ascensionTier,
      orb.damage,
      modifiers,
      orb
    );

    // Arc Discharge (Tesla Rotor passive or Chain Fork on every 5th bounce)
    if (
      modifiers.bladePassive === 'arc_discharge' &&
      orb.comboCount > 0 &&
      orb.comboCount % 5 === 0
    ) {
      this.triggerChainLightning(
        block,
        orb.damage * 0.55,
        2 + (stacks.chain_fork ?? 0),
        entities,
        oreValueLevel,
        orbSizeLevel,
        prestigeLevel,
        ascensionTier,
        orb.damage,
        modifiers,
        orb
      );
    }
  }

  private triggerChainLightning(
    source: BlockEntity,
    dmg: number,
    maxTargets: number,
    entities: BlockEntity[],
    oreValueLevel: number,
    orbSizeLevel: number,
    prestigeLevel: number,
    ascensionTier: number,
    baseOrbDamage: number,
    modifiers: PhysicsModifiers,
    sourceOrb?: Orb
  ): void {
    const sx = source.x + source.width * 0.5;
    const sy = source.y + source.height * 0.5;
    const nearby: Array<{ block: BlockEntity; dist: number }> = [];
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e.alive || e.id === source.id || !Number.isFinite(e.hp)) continue;
      const d = Math.hypot(e.x + e.width * 0.5 - sx, e.y + e.height * 0.5 - sy);
      if (d <= 165) nearby.push({ block: e, dist: d });
    }
    nearby.sort((a, b) => a.dist - b.dist);
    const limit = Math.min(maxTargets, nearby.length);
    for (let i = 0; i < limit; i++) {
      const t = nearby[i].block;
      this.events.onLightningArc?.(sx, sy, t.x + t.width * 0.5, t.y + t.height * 0.5, t);
      this.damageBlockDirect(
        t,
        dmg,
        entities,
        oreValueLevel,
        orbSizeLevel,
        prestigeLevel,
        ascensionTier,
        baseOrbDamage,
        modifiers,
        sourceOrb,
        true
      );
    }
  }

  private damageBlockDirect(
    block: BlockEntity,
    dmg: number,
    entities: BlockEntity[],
    oreValueLevel: number,
    orbSizeLevel: number,
    prestigeLevel: number,
    ascensionTier: number,
    baseOrbDamage: number,
    modifiers: PhysicsModifiers = {},
    sourceOrb?: Orb,
    suppressSideEffects: boolean = false
  ): void {
    if (!block.alive || !Number.isFinite(block.hp)) return;
    block.hp -= dmg;
    block.hitFlashTimer = 0.045;

    if (block.kind === 'boss_core') {
      this.events.onBossCoreDamaged?.(
        block.biomeIndex,
        block.bossCoreIndex ?? 0,
        Math.max(0, block.hp),
        block.maxHp
      );
    }

    if (block.hp > 0) return;

    block.hp = 0;
    block.alive = false;

    const potency = modifiers.relicPotencyMult ?? 1;
    const stacks = modifiers.artifactStacks ?? {};
    let coins = calcCoinValue(
      block.depthMeters,
      block.kind,
      oreValueLevel,
      prestigeLevel,
      ascensionTier
    );
    if (
      (modifiers.bladePassive === 'prospectors_teeth' ||
        modifiers.bladePassive === 'midas_magnetism') &&
      (block.kind === 'ore' || block.kind === 'vault')
    ) {
      const mult = modifiers.bladePassive === 'prospectors_teeth' ? 1.2 : 1.15;
      coins = Math.round(coins * mult);
    }
    const wakeStacks = stacks.magnetic_wake ?? 0;
    if (wakeStacks > 0) {
      coins = Math.round(coins * (1 + 0.2 * wakeStacks * potency));
    }

    const isTnt = block.kind === 'tnt';
    const isVault = block.kind === 'vault';
    this.events.onBlockDestroyed?.(block, coins, isTnt, isVault);

    if (sourceOrb && (stacks.vampiric_bounces ?? 0) > 0) {
      const prevBreaks = this.orbBreakCounts.get(sourceOrb) ?? 0;
      const nextBreaks = prevBreaks + 1;
      this.orbBreakCounts.set(sourceOrb, nextBreaks);
      const threshold = Math.max(2, 7 - (stacks.vampiric_bounces ?? 1));
      if (nextBreaks % threshold === 0) {
        sourceOrb.bouncesLeft = Math.min(sourceOrb.maxBounces + 6, sourceOrb.bouncesLeft + 1);
      }
    }

    if (!suppressSideEffects && (modifiers.bladePassive === 'corrosive_splash' || modifiers.bladePassive === 'shatter_chill')) {
      const cx = block.x + block.width * 0.5;
      const cy = block.y + block.height * 0.5;
      const splashRatio = modifiers.bladePassive === 'corrosive_splash' ? 0.25 : 0.2;
      let splashed = false;
      for (let i = 0; i < entities.length; i++) {
        const other = entities[i];
        if (!other.alive || other.id === block.id || !Number.isFinite(other.hp)) continue;
        const d = Math.hypot(other.x + other.width * 0.5 - cx, other.y + other.height * 0.5 - cy);
        if (d <= 82) {
          splashed = true;
          this.damageBlockDirect(
            other,
            baseOrbDamage * splashRatio,
            entities,
            oreValueLevel,
            orbSizeLevel,
            prestigeLevel,
            ascensionTier,
            baseOrbDamage,
            modifiers,
            sourceOrb,
            true
          );
          if (modifiers.bladePassive === 'shatter_chill') break;
        }
      }
      if (splashed) {
        this.events.onPassiveProc?.(
          modifiers.bladePassive === 'corrosive_splash' ? 'acid' : 'chill',
          cx,
          cy
        );
      }
    }

    if (!suppressSideEffects && block.kind === 'ore' && (stacks.volatile_gold ?? 0) > 0) {
      const cx = block.x + block.width * 0.5;
      const cy = block.y + block.height * 0.5;
      const blastDmg = baseOrbDamage * 0.75 * (stacks.volatile_gold ?? 1) * potency;
      this.events.onTntExplode?.(cx, cy, 85);
      for (let i = 0; i < entities.length; i++) {
        const other = entities[i];
        if (!other.alive || other.id === block.id || !Number.isFinite(other.hp)) continue;
        const d = Math.hypot(other.x + other.width * 0.5 - cx, other.y + other.height * 0.5 - cy);
        if (d <= 92) {
          this.damageBlockDirect(
            other,
            blastDmg,
            entities,
            oreValueLevel,
            orbSizeLevel,
            prestigeLevel,
            ascensionTier,
            baseOrbDamage,
            modifiers,
            sourceOrb,
            true
          );
        }
      }
    }

    const prismStacks = stacks.prism_multiply ?? 0;
    const prismMult = 1 + 0.25 * prismStacks * potency;

    if (isTnt) {
      const cx = block.x + block.width * 0.5;
      const cy = block.y + block.height * 0.5;
      const radius = calcTntRadiusPx(orbSizeLevel) * (1 + 0.2 * prismStacks * potency);
      this.events.onTntExplode?.(cx, cy, radius);
      const tntDmg = baseOrbDamage * TNT_DAMAGE_MULT * prismMult;

      for (let i = 0; i < entities.length; i++) {
        const other = entities[i];
        if (!other.alive || other.id === block.id || !Number.isFinite(other.hp)) continue;
        const ox = other.x + other.width * 0.5;
        const oy = other.y + other.height * 0.5;
        if (Math.hypot(ox - cx, oy - cy) <= radius + other.width * 0.4) {
          const bonusTnt = other.kind === 'granite' ? tntDmg * 1.25 : tntDmg;
          this.damageBlockDirect(
            other,
            bonusTnt,
            entities,
            oreValueLevel,
            orbSizeLevel,
            prestigeLevel,
            ascensionTier,
            baseOrbDamage,
            modifiers,
            sourceOrb
          );
        }
      }
    } else if (block.kind === 'laser') {
      const rowY = block.y + block.height * 0.5;
      this.events.onLaserFire?.(rowY, block.biomeIndex);
      const laserDmg = baseOrbDamage * LASER_DAMAGE_MULT * prismMult;
      for (let i = 0; i < entities.length; i++) {
        const other = entities[i];
        if (!other.alive || other.id === block.id || other.row !== block.row) continue;
        if (Number.isFinite(other.hp)) {
          this.damageBlockDirect(
            other,
            laserDmg,
            entities,
            oreValueLevel,
            orbSizeLevel,
            prestigeLevel,
            ascensionTier,
            baseOrbDamage,
            modifiers,
            sourceOrb
          );
        }
      }
    } else if (block.kind === 'boss_core') {
      let remainingCores = false;
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        if (e.alive && e.kind === 'boss_core' && e.row === block.row) {
          remainingCores = true;
          break;
        }
      }
      if (!remainingCores) {
        for (let i = 0; i < entities.length; i++) {
          const armor = entities[i];
          if (armor.alive && armor.kind === 'boss_armor' && armor.row === block.row) {
            armor.alive = false;
          }
        }
        this.events.onBossGateBroken?.(block.biomeIndex, block.row);
      }
    }
  }

  /**
   * Active Skill: Mag-Pulse Slam — pulls coins, steers orbs toward highest-value nearby target,
   * salvages falling Boss Shards, and blasts a localized kinetic shockwave.
   */
  triggerMagPulseSlam(
    orbs: Orb[],
    entities: BlockEntity[],
    coins: CoinDrop[],
    oreValueLevel: number,
    orbSizeLevel: number,
    prestigeLevel: number,
    ascensionTier: number,
    modifiers: PhysicsModifiers = {}
  ): Array<{ x: number; y: number; radius: number }> {
    const pulses: Array<{ x: number; y: number; radius: number }> = [];
    for (let i = 0; i < coins.length; i++) {
      if (coins[i].alive) coins[i].magnetized = true;
    }

    // Salvage all falling Boss Shards immediately
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e.alive && e.kind === 'boss_shard') {
        this.events.onBossShardSalvaged?.(e);
        this.damageBlockDirect(
          e,
          e.hp + 10,
          entities,
          oreValueLevel,
          orbSizeLevel,
          prestigeLevel,
          ascensionTier,
          10,
          modifiers,
          undefined,
          true
        );
      }
    }

    for (let i = 0; i < orbs.length; i++) {
      const orb = orbs[i];
      if (!orb.alive) continue;
      pulses.push({ x: orb.x, y: orb.y, radius: SKILL_CONFIG.MAG_PULSE_RADIUS_PX });

      // Steer orb toward nearest high-value target (boss_core > vault > tnt > ore > strata)
      let bestTarget: BlockEntity | null = null;
      let bestScore = -1;
      for (let j = 0; j < entities.length; j++) {
        const b = entities[j];
        if (!b.alive || !Number.isFinite(b.hp) || b.kind === 'boss_armor') continue;
        const bx = b.x + b.width * 0.5;
        const by = b.y + b.height * 0.5;
        const d = Math.hypot(bx - orb.x, by - orb.y);
        if (d > 300 || d < 4) continue;
        const priority =
          b.kind === 'boss_core'
            ? 4.0
            : b.kind === 'tnt'
            ? 3.2
            : b.kind === 'vault'
            ? 3.0
            : b.kind === 'ore'
            ? 2.0
            : 1.0;
        const score = priority * (1 / (40 + d));
        if (score > bestScore) {
          bestScore = score;
          bestTarget = b;
        }
        if (d <= SKILL_CONFIG.MAG_PULSE_RADIUS_PX) {
          this.damageBlockDirect(
            b,
            orb.damage * 0.45,
            entities,
            oreValueLevel,
            orbSizeLevel,
            prestigeLevel,
            ascensionTier,
            orb.damage,
            modifiers,
            orb,
            true
          );
        }
      }

      const speed = Math.min(PHYSICS_CONFIG.MAX_ORB_SPEED, Math.max(PHYSICS_CONFIG.MIN_ORB_SPEED, Math.hypot(orb.vx, orb.vy) * 1.12));
      if (bestTarget) {
        const tx = bestTarget.x + bestTarget.width * 0.5 - orb.x;
        const ty = bestTarget.y + bestTarget.height * 0.5 - orb.y;
        const len = Math.max(1, Math.hypot(tx, ty));
        orb.vx = (tx / len) * speed;
        orb.vy = (ty / len) * speed;
      } else {
        orb.vy = Math.abs(orb.vy) + 180;
        this.normalizeOrbSpeed(orb);
      }
      AntiSoftlock.onBlockHit(orb);
    }

    return pulses;
  }

  /**
   * Updates Companion Auto-Drill Drone position, coin magnet, and autonomous laser drill fire.
   */
  stepCompanionDrone(
    dt: number,
    drone: CompanionDroneState,
    entities: BlockEntity[],
    coins: CoinDrop[],
    cameraY: number,
    droneStats: { unlocked: boolean; fireIntervalS: number; beamDamage: number; magnetRadiusPx: number },
    oreValueLevel: number,
    orbSizeLevel: number,
    prestigeLevel: number,
    ascensionTier: number,
    modifiers: PhysicsModifiers = {}
  ): void {
    if (!droneStats.unlocked) {
      drone.active = false;
      return;
    }
    drone.active = true;
    drone.bobPhase += dt * 4.2;
    drone.propRotation += dt * 18;
    drone.beamTimer = Math.max(0, drone.beamTimer - dt);
    drone.fireCooldown = Math.max(0, drone.fireCooldown - dt);

    const desiredX = PHYSICS_CONFIG.SHAFT_WIDTH * 0.5 + Math.sin(drone.bobPhase * 0.42) * 155;
    const desiredY = cameraY + 115;
    drone.x += (desiredX - drone.x) * Math.min(1, dt * 4);
    drone.y += (desiredY - drone.y) * Math.min(1, dt * 4);

    // Passive Drone Coin Vacuum
    const rSq = droneStats.magnetRadiusPx * droneStats.magnetRadiusPx;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.alive || c.magnetized) continue;
      const dx = c.x - drone.x;
      const dy = c.y - drone.y;
      if (dx * dx + dy * dy <= rSq) {
        c.magnetized = true;
      }
    }

    if (drone.fireCooldown > 0) return;

    let bestTarget: BlockEntity | null = null;
    let bestScore = -1;
    for (let i = 0; i < entities.length; i++) {
      const b = entities[i];
      if (!b.alive || !Number.isFinite(b.hp) || b.kind === 'boss_armor') continue;
      if (b.kind === 'pickup_split' || b.kind === 'pickup_magnet' || b.kind === 'pickup_overclock') continue;
      if (b.y < cameraY + 30 || b.y > cameraY + 650) continue;
      const isWeak =
        b.kind === 'boss_core' &&
        modifiers.activeWeakPointCoreIndex !== null &&
        b.bossCoreIndex === modifiers.activeWeakPointCoreIndex;
      const priority =
        isWeak
          ? 6
          : b.kind === 'boss_core'
          ? 4.2
          : b.kind === 'tnt'
          ? 3.2
          : b.kind === 'vault'
          ? 3.0
          : b.kind === 'ore'
          ? 2.0
          : 1.0;
      const d = Math.hypot(b.x + b.width * 0.5 - drone.x, b.y + b.height * 0.5 - drone.y);
      const score = priority / (60 + d);
      if (score > bestScore) {
        bestScore = score;
        bestTarget = b;
      }
    }

    if (bestTarget) {
      drone.targetX = bestTarget.x + bestTarget.width * 0.5;
      drone.targetY = bestTarget.y + bestTarget.height * 0.5;
      drone.beamTimer = 0.16;
      drone.fireCooldown = droneStats.fireIntervalS;
      this.events.onDroneShot?.(drone.x, drone.y, drone.targetX, drone.targetY);
      this.damageBlockDirect(
        bestTarget,
        droneStats.beamDamage,
        entities,
        oreValueLevel,
        orbSizeLevel,
        prestigeLevel,
        ascensionTier,
        droneStats.beamDamage,
        modifiers,
        undefined,
        true
      );
    }
  }

  /**
   * Simulates the initial trajectory using identical speed clamping and CCD substeps,
   * supporting up to 2 accurate ricochets (walls, bumpers, blocks) with zero block ghosting.
   */
  computeTrajectoryPreview(
    startX: number,
    startY: number,
    angleRad: number,
    orbRadius: number,
    entities: readonly BlockEntity[],
    maxBouncesPreview: number = 2
  ): {
    dots: Array<{ x: number; y: number }>;
    impactPoint: { x: number; y: number } | null;
    secondImpactPoint: { x: number; y: number } | null;
    impactBlockId: number | null;
    secondImpactBlockId: number | null;
    bounceStartIdx: number;
  } {
    let impactPoint: { x: number; y: number } | null = null;
    let secondImpactPoint: { x: number; y: number } | null = null;
    let impactBlockId: number | null = null;
    let secondImpactBlockId: number | null = null;
    let x = startX;
    let y = startY;
    let vx = Math.cos(angleRad) * PHYSICS_CONFIG.LAUNCH_SPEED;
    let vy = Math.sin(angleRad) * PHYSICS_CONFIG.LAUNCH_SPEED;
    let bounces = 0;

    const poly: Array<{ x: number; y: number; segment: number }> = [{ x, y, segment: 0 }];
    let firstBouncePolyIdx = -1;

    const simDt = 1 / 120;
    const maxFrames = 96; // ~0.8s flight lookahead

    const recordImpact = (ix: number, iy: number, blockId: number | null = null) => {
      if (bounces === 0) {
        impactPoint = { x: ix, y: iy };
        impactBlockId = blockId;
        firstBouncePolyIdx = Math.max(0, poly.length - 1);
      } else if (bounces === 1) {
        secondImpactPoint = { x: ix, y: iy };
        secondImpactBlockId = blockId;
      }
      bounces++;
    };

    for (let f = 0; f < maxFrames && bounces < maxBouncesPreview; f++) {
      vy += PHYSICS_CONFIG.GRAVITY * simDt;
      const norm = this.clampVelocity(vx, vy);
      vx = norm.vx;
      vy = norm.vy;

      const dxTotal = vx * simDt;
      const dyTotal = vy * simDt;
      const dist = Math.hypot(dxTotal, dyTotal);
      const subSteps = Math.max(1, Math.ceil(dist / Math.max(2, orbRadius * 0.35)));
      const subDt = simDt / subSteps;

      for (let s = 0; s < subSteps && bounces < maxBouncesPreview; s++) {
        const prevX = x;
        const prevY = y;
        x += vx * subDt;
        y += vy * subDt;

        // Wall reflections
        let hitThisSubstep = false;
        if (x - orbRadius < 0) {
          x = orbRadius;
          vx = Math.abs(vx) * PHYSICS_CONFIG.RESTITUTION_BLOCK;
          const clamped = this.clampVelocity(vx, vy);
          vx = clamped.vx;
          vy = clamped.vy;
          poly.push({ x, y, segment: bounces });
          recordImpact(0, y);
          hitThisSubstep = true;
        } else if (x + orbRadius > PHYSICS_CONFIG.SHAFT_WIDTH) {
          x = PHYSICS_CONFIG.SHAFT_WIDTH - orbRadius;
          vx = -Math.abs(vx) * PHYSICS_CONFIG.RESTITUTION_BLOCK;
          const clamped = this.clampVelocity(vx, vy);
          vx = clamped.vx;
          vy = clamped.vy;
          poly.push({ x, y, segment: bounces });
          recordImpact(PHYSICS_CONFIG.SHAFT_WIDTH, y);
          hitThisSubstep = true;
        }

        if (hitThisSubstep) {
          if (bounces >= maxBouncesPreview) break;
          continue;
        }

        // Block / bumper / portal collision check
        let hitBlock: BlockEntity | null = null;
        let hitNx = 0;
        let hitNy = 0;
        let hitCx = x;
        let hitCy = y;

        for (let j = 0; j < entities.length; j++) {
          const b = entities[j];
          if (
            !b.alive ||
            b.kind === 'portal_exit' ||
            b.kind === 'pickup_split' ||
            b.kind === 'pickup_magnet' ||
            b.kind === 'pickup_overclock' ||
            b.kind === 'boss_shard'
          ) {
            continue;
          }

          if (b.kind === 'bumper' || b.kind === 'portal_entry') {
            const bx = b.x + b.width * 0.5;
            const by = b.y + b.height * 0.5;
            const minD = orbRadius + b.radius;
            const ddx = x - bx;
            const ddy = y - by;
            if (ddx * ddx + ddy * ddy < minD * minD || this.segmentCircleHit(prevX, prevY, x, y, bx, by, minD)) {
              const d = Math.max(0.001, Math.hypot(ddx, ddy));
              hitBlock = b;
              hitNx = ddx / d;
              hitNy = ddy / d;
              hitCx = bx + hitNx * b.radius;
              hitCy = by + hitNy * b.radius;
              break;
            }
          } else {
            const cx = clamp(x, b.x, b.x + b.width);
            const cy = clamp(y, b.y, b.y + b.height);
            const ddx = x - cx;
            const ddy = y - cy;
            const dSq = ddx * ddx + ddy * ddy;
            if (dSq < orbRadius * orbRadius) {
              const d = Math.hypot(ddx, ddy);
              let nx = 0;
              let ny = -1;
              if (d > 1e-4) {
                nx = ddx / d;
                ny = ddy / d;
              } else {
                const lDist = Math.abs(x - b.x);
                const rDist = Math.abs(b.x + b.width - x);
                const tDist = Math.abs(y - b.y);
                const bDist = Math.abs(b.y + b.height - y);
                const m = Math.min(lDist, rDist, tDist, bDist);
                if (m === lDist) {
                  nx = -1;
                  ny = 0;
                } else if (m === rDist) {
                  nx = 1;
                  ny = 0;
                } else if (m === tDist) {
                  nx = 0;
                  ny = -1;
                } else {
                  nx = 0;
                  ny = 1;
                }
              }
              hitBlock = b;
              hitNx = nx;
              hitNy = ny;
              hitCx = cx;
              hitCy = cy;
              break;
            }
          }
        }

        if (hitBlock) {
          if (hitBlock.kind === 'portal_entry') {
            poly.push({ x: hitCx, y: hitCy, segment: bounces });
            recordImpact(hitCx, hitCy, hitBlock.id);
            bounces = maxBouncesPreview; // stop at warp entry cleanly
            break;
          }

          if (hitBlock.kind === 'bumper') {
            const bx = hitBlock.x + hitBlock.width * 0.5;
            const by = hitBlock.y + hitBlock.height * 0.5;
            const minD = orbRadius + hitBlock.radius + 0.5;
            x = bx + hitNx * minD;
            y = by + hitNy * minD;
          } else {
            x = hitCx + hitNx * (orbRadius + 0.5);
            y = hitCy + hitNy * (orbRadius + 0.5);
          }

          const dot = vx * hitNx + vy * hitNy;
          const rest =
            hitBlock.kind === 'bumper'
              ? PHYSICS_CONFIG.RESTITUTION_BUMPER
              : PHYSICS_CONFIG.RESTITUTION_BLOCK;
          if (dot < 0) {
            vx = (vx - 2 * dot * hitNx) * rest;
            vy = (vy - 2 * dot * hitNy) * rest;
          }
          const clamped = this.clampVelocity(vx, vy);
          vx = clamped.vx;
          vy = clamped.vy;

          poly.push({ x, y, segment: bounces });
          recordImpact(hitCx, hitCy, hitBlock.id);
          if (bounces >= maxBouncesPreview) break;
        }
      }

      if (bounces < maxBouncesPreview) {
        poly.push({ x, y, segment: bounces });
      }
    }

    const targetDots = PHYSICS_CONFIG.TRAJECTORY_DOTS;
    const cumDist: number[] = [0];
    for (let i = 1; i < poly.length; i++) {
      cumDist.push(
        cumDist[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y)
      );
    }
    const totalLen = cumDist[cumDist.length - 1];
    const dots: Array<{ x: number; y: number }> = [];
    const splitDist =
      firstBouncePolyIdx > 0 && firstBouncePolyIdx < cumDist.length
        ? cumDist[firstBouncePolyIdx]
        : totalLen + 1;
    let bounceStartIdx = targetDots;

    if (totalLen < 1) {
      for (let d = 0; d < targetDots; d++) {
        dots.push({ x: startX, y: startY });
      }
    } else {
      let seg = 1;
      for (let d = 1; d <= targetDots; d++) {
        const desired = (totalLen * d) / targetDots;
        while (seg < poly.length - 1 && cumDist[seg] < desired) {
          seg++;
        }
        const d0 = cumDist[seg - 1];
        const d1 = cumDist[seg];
        const t = d1 > d0 ? clamp((desired - d0) / (d1 - d0), 0, 1) : 1;
        dots.push({
          x: poly[seg - 1].x + (poly[seg].x - poly[seg - 1].x) * t,
          y: poly[seg - 1].y + (poly[seg].y - poly[seg - 1].y) * t,
        });
        if (bounceStartIdx === targetDots && desired > splitDist) {
          bounceStartIdx = d - 1;
        }
      }
    }

    return {
      dots,
      impactPoint,
      secondImpactPoint,
      impactBlockId,
      secondImpactBlockId,
      bounceStartIdx,
    };
  }
}
