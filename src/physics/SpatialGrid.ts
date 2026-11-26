import { PHYSICS_CONFIG } from '../config/gameConfig';
import type { BlockEntity } from '../world/Entities';

export class SpatialGrid {
  private buckets = new Map<number, BlockEntity[]>();
  private activeKeys: number[] = [];
  private queryResult: BlockEntity[] = [];
  private visitedStamp = new Map<number, number>();
  private querySeq = 0;

  rebuild(entities: readonly BlockEntity[]): void {
    // Clear existing bucket arrays in-place with zero allocations
    for (let i = 0; i < this.activeKeys.length; i++) {
      const list = this.buckets.get(this.activeKeys[i]);
      if (list) list.length = 0;
    }
    this.activeKeys.length = 0;

    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e.alive) continue;
      for (let dc = 0; dc < e.colSpan; dc++) {
        const key = this.key(e.col + dc, e.row);
        let list = this.buckets.get(key);
        if (!list) {
          list = [];
          this.buckets.set(key, list);
        }
        if (list.length === 0) {
          this.activeKeys.push(key);
        }
        list.push(e);
      }
    }
  }

  queryCircle(cx: number, cy: number, radius: number): readonly BlockEntity[] {
    const ts = PHYSICS_CONFIG.TILE_SIZE;
    const minCol = Math.max(0, Math.floor((cx - radius) / ts));
    const maxCol = Math.min(PHYSICS_CONFIG.GRID_COLS - 1, Math.floor((cx + radius) / ts));
    const minRow = Math.max(0, Math.floor((cy - radius) / ts));
    const maxRow = Math.floor((cy + radius) / ts);

    this.queryResult.length = 0;
    this.querySeq++;
    if (this.querySeq >= 0x7fffffff) {
      this.visitedStamp.clear();
      this.querySeq = 1;
    }
    const seq = this.querySeq;

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const list = this.buckets.get(this.key(c, r));
        if (!list || list.length === 0) continue;
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e.alive && this.visitedStamp.get(e.id) !== seq) {
            this.visitedStamp.set(e.id, seq);
            this.queryResult.push(e);
          }
        }
      }
    }
    return this.queryResult;
  }

  isCellOccupied(col: number, row: number, entities: readonly BlockEntity[]): boolean {
    if (col < 0 || col >= PHYSICS_CONFIG.GRID_COLS || row < 0) return true;
    const list = this.buckets.get(this.key(col, row));
    if (list) {
      for (let i = 0; i < list.length; i++) {
        if (list[i].alive) return true;
      }
    }
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e.alive && e.row === row && col >= e.col && col < e.col + e.colSpan) {
        return true;
      }
    }
    return false;
  }

  private key(col: number, row: number): number {
    return row * 32 + col;
  }
}
