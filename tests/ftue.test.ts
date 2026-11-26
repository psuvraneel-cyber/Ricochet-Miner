import { describe, expect, it } from 'vitest';
import type { BlockEntity } from '../src/world/Entities';
import { ShaftGenerator } from '../src/world/ShaftGenerator';

describe('FTUE Clearance Grid Verification', () => {
  it('guarantees Row 0..3 are 100% empty on Run 1 Chunk 0 across 50 random seeds', () => {
    for (let s = 0; s < 50; s++) {
      const seed = (0x12345678 + s * 2654435761) >>> 0;
      const gen = new ShaftGenerator({
        baseRowOffset: 0,
        luckLevel: 1 + (s % 5),
        bossGateHpByBiome: {},
        unlockedBiomeIndex: 0,
        ascensionTier: 0,
        seed,
      });

      const entities: BlockEntity[] = [];
      gen.ensureChunksUpToRow(12, entities);

      const upperEntities = entities.filter((e) => e.row <= 3);
      expect(upperEntities).toHaveLength(0);

      const ftueCluster = entities.filter((e) => e.row >= 4 && e.row <= 6);
      expect(ftueCluster.some((e) => e.kind === 'tnt')).toBe(true);
      expect(ftueCluster.some((e) => e.kind === 'ore')).toBe(true);
    }
  });
});
