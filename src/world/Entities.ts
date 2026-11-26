import type { EntityKind } from '../config/gameConfig';

export interface Orb {
  id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  bouncesLeft: number;
  maxBounces: number;
  damage: number;
  rotation: number;
  comboCount: number;
  consecutiveWallHits: number;
  nonProgressBounces: number;
  maxProgressY: number;
  timeSinceProgress: number;
  heightSamples: number[];
  heightSampleCursor: number;
  heightSampleCount: number;
  heightSampleTimer: number;
  overheatDraining: boolean;
  stallBoostApplied: boolean;
  portalCooldown: number;
  isClone: boolean;
  isOverdrive: boolean;
  trail: Array<{ x: number; y: number }>;
  trailPool: Array<{ x: number; y: number }>;
  alive: boolean;
}

export interface BlockEntity {
  id: number;
  kind: EntityKind;
  col: number;
  row: number;
  colSpan: number;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number; // used for circular bumpers & portals
  hp: number;
  maxHp: number;
  depthMeters: number;
  biomeIndex: number;
  hitFlashTimer: number;
  hitsRemaining?: number; // for pinball bumper (5 hits)
  bossCoreIndex?: number; // 0, 1, 2 for boss_core
  portalTargetId?: number; // for portal_entry -> portal_exit
  alive: boolean;
}

export interface CoinDrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  life: number;
  magnetized: boolean;
  alive: boolean;
}
