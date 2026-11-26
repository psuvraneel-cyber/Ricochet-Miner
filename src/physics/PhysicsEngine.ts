import {
  LASER_DAMAGE_MULT,
  PHYSICS_CONFIG,
  TNT_DAMAGE_MULT,
  calcCoinValue,
  calcTntRadiusPx,
} from '../config/gameConfig';
import { clamp } from '../utils/math';
import type { BlockEntity, Orb } from '../world/Entities';
import { AntiSoftlock } from './AntiSoftlock';
import { SpatialGrid } from './SpatialGrid';

export interface PhysicsEvents {
  onWallHit?: (orb: Orb, x: number, y: number) => void;
  onBlockHit?: (orb: Orb, block: BlockEntity, damage: number, cleaved: boolean) => void;
  onBlockDestroyed?: (block: BlockEntity, coins: number, isTnt: boolean, isVault: boolean) => void;
  onTntExplode?: (x: number, y: number, radius: number) => void;
  onBumperHit?: (orb: Orb, bumper: BlockEntity, coins: number) => void;
  onLaserFire?: (rowY: number, biomeIndex: number) => void;
  onPortalWarp?: (orb: Orb, from: BlockEntity, to: BlockEntity) => void;
  onBossGateBroken?: (biomeIndex: number, row: number) => void;
  onBossCoreDamaged?: (biomeIndex: number, coreIndex: number, hpLeft: number, maxHp: number) => void;
  onOrbExpired?: (orb: Orb) => void;
}

const TRAIL_CAPACITY = 14;
const HEIGHT_SAMPLE_CAPACITY = 16;

export class PhysicsEngine {
  private grid = new SpatialGrid();
  private nextOrbId = 1;
  private events: PhysicsEvents;
  private cloneBuffer: Orb[] = [];

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
    ascensionTier: number = 0
  ): void {
    this.grid.rebuild(entities);

    for (let i = 0; i < entities.length; i++) {
      const block = entities[i];
      if (block.hitFlashTimer > 0) {
        block.hitFlashTimer = Math.max(0, block.hitFlashTimer - dt);
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

      const totalDx = orb.vx * dt;
      const totalDy = orb.vy * dt;
      const dist = Math.hypot(totalDx, totalDy);
      const maxStep = Math.max(2, orb.radius * 0.35);
      const subSteps = Math.max(1, Math.ceil(dist / maxStep));
      const subDt = dt / subSteps;

      for (let s = 0; s < subSteps; s++) {
        if (!orb.alive) break;
        const stepStartX = orb.x;
        const stepStartY = orb.y;
        orb.x += orb.vx * subDt;
        orb.y += orb.vy * subDt;

        this.resolveWallCollisions(orb);
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
          ascensionTier
        );

        // Safeguard: clamp back inside shaft bounds if block push-out pressed into wall
        if (orb.alive) {
          this.enforceWallBounds(orb);
        }
      }

      orb.rotation += (Math.hypot(orb.vx, orb.vy) / Math.max(8, orb.radius)) * dt * 1.4;
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

  private resolveWallCollisions(orb: Orb): void {
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
    ascensionTier: number
  ): void {
    const queryRadius = orb.radius + Math.hypot(orb.x - stepStartX, orb.y - stepStartY) + 6;
    const candidates = this.grid.queryCircle(orb.x, orb.y, queryRadius);

    for (let i = 0; i < candidates.length; i++) {
      const block = candidates[i];
      if (!block.alive || !orb.alive) continue;
      if (block.kind === 'portal_exit') continue;

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

          const coins = calcCoinValue(
            block.depthMeters,
            'bumper',
            oreValueLevel,
            prestigeLevel,
            ascensionTier
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

      // Cleave check: D >= 2 * HP_rem (never cleave indestructible boss_armor)
      const canCleave =
        Number.isFinite(block.hp) &&
        orb.damage >= PHYSICS_CONFIG.CLEAVE_RATIO * block.hp;

      if (!canCleave) {
        // Push out cleanly and reflect
        const overlap = orb.radius - Math.sqrt(Math.max(0, distSq));
        orb.x += nx * (overlap + 0.6);
        orb.y += ny * (overlap + 0.6);

        const dot = orb.vx * nx + orb.vy * ny;
        if (dot < 0) {
          orb.vx = (orb.vx - 2 * dot * nx) * PHYSICS_CONFIG.RESTITUTION_BLOCK;
          orb.vy = (orb.vy - 2 * dot * ny) * PHYSICS_CONFIG.RESTITUTION_BLOCK;
          this.normalizeOrbSpeed(orb);
        }

        orb.bouncesLeft -= PHYSICS_CONFIG.BLOCK_BOUNCE_COST;
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
        canCleave
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
    cleaved: boolean
  ): void {
    block.hitFlashTimer = 0.045;

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
          orb.damage
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

    // Splitter prism spawns 1 clone orb with 50% remaining bounces
    if (block.kind === 'splitter') {
      const activeTotal = aliveCount + newClones.length;
      if (activeTotal < PHYSICS_CONFIG.MAX_ACTIVE_ORBS && orb.bouncesLeft >= 2) {
        const cloneAngle = Math.atan2(orb.vy, -orb.vx);
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

    this.events.onBlockHit?.(orb, block, orb.damage, cleaved);
    // Tougher armored Granite at Biome 2+ (0.38x un-cleaved direct dmg; 0.5x in Biome 1)
    const graniteMult = block.biomeIndex >= 1 ? 0.38 : 0.5;
    const directDmg =
      block.kind === 'granite' && !cleaved ? orb.damage * graniteMult : orb.damage;
    this.damageBlockDirect(
      block,
      directDmg,
      entities,
      oreValueLevel,
      orbSizeLevel,
      prestigeLevel,
      ascensionTier,
      orb.damage
    );
  }

  private damageBlockDirect(
    block: BlockEntity,
    dmg: number,
    entities: BlockEntity[],
    oreValueLevel: number,
    orbSizeLevel: number,
    prestigeLevel: number,
    ascensionTier: number,
    baseOrbDamage: number
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

    const coins = calcCoinValue(
      block.depthMeters,
      block.kind,
      oreValueLevel,
      prestigeLevel,
      ascensionTier
    );
    const isTnt = block.kind === 'tnt';
    const isVault = block.kind === 'vault';
    this.events.onBlockDestroyed?.(block, coins, isTnt, isVault);

    if (isTnt) {
      const cx = block.x + block.width * 0.5;
      const cy = block.y + block.height * 0.5;
      const radius = calcTntRadiusPx(orbSizeLevel);
      this.events.onTntExplode?.(cx, cy, radius);
      const tntDmg = baseOrbDamage * TNT_DAMAGE_MULT;

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
            baseOrbDamage
          );
        }
      }
    } else if (block.kind === 'laser') {
      const rowY = block.y + block.height * 0.5;
      this.events.onLaserFire?.(rowY, block.biomeIndex);
      const laserDmg = baseOrbDamage * LASER_DAMAGE_MULT;
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
            baseOrbDamage
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
    bounceStartIdx: number;
  } {
    let impactPoint: { x: number; y: number } | null = null;
    let secondImpactPoint: { x: number; y: number } | null = null;
    let x = startX;
    let y = startY;
    let vx = Math.cos(angleRad) * PHYSICS_CONFIG.LAUNCH_SPEED;
    let vy = Math.sin(angleRad) * PHYSICS_CONFIG.LAUNCH_SPEED;
    let bounces = 0;

    const poly: Array<{ x: number; y: number; segment: number }> = [{ x, y, segment: 0 }];
    let firstBouncePolyIdx = -1;

    const simDt = 1 / 120;
    const maxFrames = 96; // ~0.8s flight lookahead

    const recordImpact = (ix: number, iy: number) => {
      if (bounces === 0) {
        impactPoint = { x: ix, y: iy };
        firstBouncePolyIdx = Math.max(0, poly.length - 1);
      } else if (bounces === 1) {
        secondImpactPoint = { x: ix, y: iy };
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
          if (!b.alive || b.kind === 'portal_exit') continue;

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
            recordImpact(hitCx, hitCy);
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
          recordImpact(hitCx, hitCy);
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

    return { dots, impactPoint, secondImpactPoint, bounceStartIdx };
  }
}
