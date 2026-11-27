import {
  ASCENSION_CONFIG,
  BIOMES,
  PHYSICS_CONFIG,
  VAULT_INTERVAL_METERS,
  calcBlockHP,
  calcLuckWeights,
  type EntityKind,
} from '../config/gameConfig';
import { SeededRNG } from '../utils/math';
import type { BlockEntity } from './Entities';

export interface ShaftGeneratorOptions {
  baseRowOffset: number;
  luckLevel: number;
  bossGateHpByBiome: Record<number, number[]>;
  unlockedBiomeIndex: number;
  ascensionTier?: number;
  seed?: number;
}

export class ShaftGenerator {
  private nextEntityId = 1;
  private generatedChunks = new Set<number>();
  private rng: SeededRNG;
  private options: ShaftGeneratorOptions;
  private spawnedBossGates = new Set<number>();
  private lastPickupRow = -10;

  constructor(options: ShaftGeneratorOptions) {
    this.options = options;
    this.rng = new SeededRNG(options.seed ?? 0x5249434f);
  }

  updateOptions(partial: Partial<ShaftGeneratorOptions>): void {
    Object.assign(this.options, partial);
  }

  reset(options: ShaftGeneratorOptions): void {
    this.nextEntityId = 1;
    this.generatedChunks.clear();
    this.spawnedBossGates.clear();
    this.options = options;
    this.rng = new SeededRNG(options.seed ?? 0x5249434f);
  }

  ensureChunksUpToRow(maxRow: number, entities: BlockEntity[]): void {
    const maxChunk = Math.floor(maxRow / PHYSICS_CONFIG.CHUNK_ROWS);
    for (let c = 0; c <= maxChunk; c++) {
      if (!this.generatedChunks.has(c)) {
        this.generatedChunks.add(c);
        this.generateChunk(c, entities);
      }
    }
  }

  private generateChunk(chunkIndex: number, entities: BlockEntity[]): void {
    const startRow = chunkIndex * PHYSICS_CONFIG.CHUNK_ROWS;
    const endRow = startRow + PHYSICS_CONFIG.CHUNK_ROWS - 1;
    const { tntChance, bumperChance } = calcLuckWeights(this.options.luckLevel);

    // Reserve top 3 rows of chunk 0 for launcher clearance, and keep Row 3 completely empty on Run 1 FTUE
    const isFirstRunFtueChunk = chunkIndex === 0 && this.options.baseRowOffset === 0;
    const firstPlayableRow = chunkIndex === 0 ? (isFirstRunFtueChunk ? 4 : 3) : startRow;

    for (let row = firstPlayableRow; row <= endRow; row++) {
      if (isFirstRunFtueChunk && row <= 3) continue;
      const globalRow = this.options.baseRowOffset + row;
      const depthMeters = globalRow * PHYSICS_CONFIG.METERS_PER_ROW;
      const biome = this.getBiomeForRow(globalRow);

      // Check if this row is the active Bedrock Boss Gate boundary (1 gate milestone per run)
      const activeGateBiomeIdx = this.options.unlockedBiomeIndex;
      const nextBiome = BIOMES[activeGateBiomeIdx + 1];
      const gateDepthM = nextBiome
        ? nextBiome.startDepthM
        : activeGateBiomeIdx === ASCENSION_CONFIG.FINAL_BIOME_INDEX
        ? ASCENSION_CONFIG.FINAL_GATE_DEPTH_M
        : null;
      if (
        gateDepthM !== null &&
        depthMeters >= gateDepthM &&
        depthMeters < gateDepthM + PHYSICS_CONFIG.METERS_PER_ROW &&
        !this.spawnedBossGates.has(activeGateBiomeIdx)
      ) {
        this.spawnedBossGates.add(activeGateBiomeIdx);
        this.spawnBossGate(row, depthMeters, activeGateBiomeIdx, entities);
        continue;
      }

      // Guaranteed FTUE Run-1 TNT + Gold cluster right below launcher in chunk 0
      if (chunkIndex === 0 && this.options.baseRowOffset === 0 && row >= 4 && row <= 6) {
        this.spawnFtueRow(row, depthMeters, biome.index, entities);
        continue;
      }

      // Vault Chest every 50m (every 20 rows)
      const prevDepth = (globalRow - 1) * PHYSICS_CONFIG.METERS_PER_ROW;
      const isVaultRow =
        globalRow > 8 &&
        Math.floor(depthMeters / VAULT_INTERVAL_METERS) > Math.floor(prevDepth / VAULT_INTERVAL_METERS);

      if (isVaultRow) {
        const vaultCol = this.rng.int(2, PHYSICS_CONFIG.GRID_COLS - 4);
        entities.push(this.createBlock('vault', vaultCol, row, depthMeters, biome.index, 2));
        for (let col = 0; col < PHYSICS_CONFIG.GRID_COLS; col++) {
          if (col === vaultCol || col === vaultCol + 1) continue;
          if (this.rng.next() < 0.45) {
            entities.push(this.createBlock('ore', col, row, depthMeters, biome.index));
          }
        }
        continue;
      }

      // Standard procedural row
      const rowDensity = Math.min(0.72, 0.48 + biome.index * 0.04);
      let spawnedPortalInRow = false;
      let spawnedPickupInRow = false;

      for (let col = 0; col < PHYSICS_CONFIG.GRID_COLS; col++) {
        if (this.rng.next() > rowDensity) {
          if (
            row >= 7 &&
            !spawnedPickupInRow &&
            row - this.lastPickupRow >= 5 &&
            this.rng.next() < 0.085
          ) {
            spawnedPickupInRow = true;
            this.lastPickupRow = row;
            const pRoll = this.rng.next();
            const pickupKind: EntityKind =
              pRoll < 0.4 ? 'pickup_split' : pRoll < 0.75 ? 'pickup_magnet' : 'pickup_overclock';
            entities.push(this.createBlock(pickupKind, col, row, depthMeters, biome.index));
          }
          continue;
        }

        const roll = this.rng.next();
        let kind: EntityKind = 'strata';

        if (roll < tntChance) {
          kind = 'tnt';
        } else if (roll < tntChance + bumperChance) {
          kind = 'bumper';
        } else if (biome.index >= 1 && roll < tntChance + bumperChance + 0.06) {
          kind = 'splitter';
        } else if (biome.index >= 2 && roll < tntChance + bumperChance + 0.11) {
          kind = 'laser';
        } else if (biome.index >= 3 && roll < tntChance + bumperChance + 0.18) {
          kind = 'frost';
        } else if (biome.index >= 4 && !spawnedPortalInRow && roll < tntChance + bumperChance + 0.22) {
          spawnedPortalInRow = true;
          this.spawnPortalPair(col, row, depthMeters, biome.index, entities);
          continue;
        } else if (roll < tntChance + bumperChance + 0.36) {
          kind = 'ore';
        } else if (depthMeters >= 60 && roll < tntChance + bumperChance + 0.54) {
          kind = 'granite';
        } else {
          kind = 'strata';
        }

        entities.push(this.createBlock(kind, col, row, depthMeters, biome.index));
      }
    }
  }

  private spawnFtueRow(row: number, depthMeters: number, biomeIndex: number, entities: BlockEntity[]): void {
    // Rich, high-satisfaction opening layout: center TNT flanked by gold ore & strata
    if (row === 4) {
      entities.push(this.createBlock('strata', 2, row, depthMeters, biomeIndex));
      entities.push(this.createBlock('ore', 3, row, depthMeters, biomeIndex));
      entities.push(this.createBlock('ore', 5, row, depthMeters, biomeIndex));
      entities.push(this.createBlock('strata', 6, row, depthMeters, biomeIndex));
    } else if (row === 5) {
      entities.push(this.createBlock('strata', 2, row, depthMeters, biomeIndex));
      entities.push(this.createBlock('ore', 3, row, depthMeters, biomeIndex));
      entities.push(this.createBlock('tnt', 4, row, depthMeters, biomeIndex));
      entities.push(this.createBlock('ore', 5, row, depthMeters, biomeIndex));
      entities.push(this.createBlock('strata', 6, row, depthMeters, biomeIndex));
    } else if (row === 6) {
      entities.push(this.createBlock('strata', 1, row, depthMeters, biomeIndex));
      entities.push(this.createBlock('strata', 3, row, depthMeters, biomeIndex));
      entities.push(this.createBlock('bumper', 4, row, depthMeters, biomeIndex));
      entities.push(this.createBlock('strata', 5, row, depthMeters, biomeIndex));
      entities.push(this.createBlock('strata', 7, row, depthMeters, biomeIndex));
    }
  }

  private spawnBossGate(row: number, depthMeters: number, biomeIndex: number, entities: BlockEntity[]): void {
    const coreCols = [1, 4, 7];
    const savedHps = this.options.bossGateHpByBiome[biomeIndex];
    const fullCoreHp = calcBlockHP(depthMeters, 'boss_core', this.options.ascensionTier ?? 0);

    for (let col = 0; col < PHYSICS_CONFIG.GRID_COLS; col++) {
      const coreIdx = coreCols.indexOf(col);
      if (coreIdx !== -1) {
        const hp = savedHps && typeof savedHps[coreIdx] === 'number' ? savedHps[coreIdx] : fullCoreHp;
        if (hp > 0) {
          const core = this.createBlock('boss_core', col, row, depthMeters, biomeIndex);
          core.hp = hp;
          core.maxHp = fullCoreHp;
          core.bossCoreIndex = coreIdx;
          entities.push(core);
        } else {
          entities.push(this.createBlock('boss_armor', col, row, depthMeters, biomeIndex));
        }
      } else {
        entities.push(this.createBlock('boss_armor', col, row, depthMeters, biomeIndex));
      }
    }
  }

  private spawnPortalPair(
    col: number,
    row: number,
    depthMeters: number,
    biomeIndex: number,
    entities: BlockEntity[]
  ): void {
    const exitRow = row + 16; // ~1.33 chunks deeper
    const exitCol = clampCol(col + this.rng.int(-2, 2));
    const exitDepth = (this.options.baseRowOffset + exitRow) * PHYSICS_CONFIG.METERS_PER_ROW;

    const exit = this.createBlock('portal_exit', exitCol, exitRow, exitDepth, biomeIndex);
    const entry = this.createBlock('portal_entry', col, row, depthMeters, biomeIndex);
    entry.portalTargetId = exit.id;
    entities.push(entry, exit);
  }

  private getBiomeForRow(globalRow: number) {
    const depth = globalRow * PHYSICS_CONFIG.METERS_PER_ROW;
    for (let i = BIOMES.length - 1; i >= 0; i--) {
      if (depth >= BIOMES[i].startDepthM) return BIOMES[i];
    }
    return BIOMES[0];
  }

  private createBlock(
    kind: EntityKind,
    col: number,
    row: number,
    depthMeters: number,
    biomeIndex: number,
    colSpan: number = 1
  ): BlockEntity {
    const ts = PHYSICS_CONFIG.TILE_SIZE;
    const width = ts * colSpan - 4;
    const height = ts - 4;
    const x = col * ts + 2;
    const y = row * ts + 2;
    const hp = calcBlockHP(depthMeters, kind, this.options.ascensionTier ?? 0);

    return {
      id: this.nextEntityId++,
      kind,
      col,
      row,
      colSpan,
      x,
      y,
      width,
      height,
      radius:
        kind === 'bumper'
          ? 22
          : kind === 'portal_entry' || kind === 'portal_exit'
          ? 20
          : kind === 'pickup_split' || kind === 'pickup_magnet' || kind === 'pickup_overclock'
          ? 18
          : kind === 'boss_shard'
          ? 15
          : 0,
      hp,
      maxHp: hp,
      depthMeters,
      biomeIndex,
      hitFlashTimer: 0,
      hitsRemaining: kind === 'bumper' ? PHYSICS_CONFIG.BUMPER_MAX_HITS : undefined,
      alive: true,
    };
  }
}

function clampCol(c: number): number {
  return Math.max(0, Math.min(PHYSICS_CONFIG.GRID_COLS - 1, c));
}
