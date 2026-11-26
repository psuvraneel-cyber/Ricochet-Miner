import { BIOMES, getBiomeForDepth, type BiomeSpec } from '../config/gameConfig';

export class BiomeTheme {
  static getBiomeAtDepth(depthMeters: number): BiomeSpec {
    return getBiomeForDepth(depthMeters);
  }

  static getBiomeByIndex(index: number): BiomeSpec {
    return BIOMES[Math.max(0, Math.min(BIOMES.length - 1, index))];
  }
}
