import blockBedrockCoreUrl from '../assets/block_bedrock_core.webp';
import blockBossArmorUrl from '../assets/block_boss_armor.webp';
import blockFrostUrl from '../assets/block_frost.webp';
import blockLaserUrl from '../assets/block_laser.webp';
import blockOreGoldUrl from '../assets/block_ore_gold.webp';
import blockOreMoltenUrl from '../assets/block_ore_molten.webp';
import blockOreNuggetsUrl from '../assets/block_ore_nuggets.webp';
import blockSplitterUrl from '../assets/block_splitter.webp';
import blockStoneGraniteUrl from '../assets/block_stone_granite.webp';
import blockStoneSandUrl from '../assets/block_stone_sand.webp';
import blockStoneSlateUrl from '../assets/block_stone_slate.webp';
import blockTntUrl from '../assets/block_tnt.webp';
import blockVaultUrl from '../assets/block_vault.webp';
import envRockFlankUrl from '../assets/env_rock_flank.webp';
import envTimberBeamUrl from '../assets/env_timber_beam.webp';
import logoEmblemUrl from '../assets/logo_emblem.webp';
import pickupMagnetCoilUrl from '../assets/pickup_magnet_coil.webp';
import pickupOverclockBatteryUrl from '../assets/pickup_overclock_battery.webp';
import pickupSplitGemUrl from '../assets/pickup_split_gem.webp';
import propBumperAmberUrl from '../assets/prop_bumper_amber.webp';
import propBumperCyanUrl from '../assets/prop_bumper_cyan.webp';
import propLanternUrl from '../assets/prop_lantern.webp';
import propPortalUrl from '../assets/prop_portal.webp';
import propPortalEntryUrl from '../assets/prop_portal_entry.webp';
import propPortalExitUrl from '../assets/prop_portal_exit.webp';
import propTurretUrl from '../assets/prop_turret.webp';
import skinCopperGearUrl from '../assets/skin_copper_gear.webp';
import skinEmeraldBuzzsawUrl from '../assets/skin_emerald_buzzsaw.webp';
import skinFrostStarUrl from '../assets/skin_frost_star.webp';
import skinGoldChakramUrl from '../assets/skin_gold_chakram.webp';
import skinMagmaCutterUrl from '../assets/skin_magma_cutter.webp';
import skinSteelSawbladeUrl from '../assets/skin_steel_sawblade.webp';
import skinTeslaRotorUrl from '../assets/skin_tesla_rotor.webp';
import skinToxicDrillUrl from '../assets/skin_toxic_drill.webp';
import skinVoidReaperUrl from '../assets/skin_void_reaper.webp';

import type { BiomeSpec, EntityKind, SkinSpec } from '../config/gameConfig';

export type DrawableImage = HTMLImageElement | HTMLCanvasElement;

const SKIN_URL_MAP: Record<string, string> = {
  steel_sawblade: skinSteelSawbladeUrl,
  copper_gear: skinCopperGearUrl,
  emerald_buzzsaw: skinEmeraldBuzzsawUrl,
  magma_cutter: skinMagmaCutterUrl,
  frost_star: skinFrostStarUrl,
  gold_chakram: skinGoldChakramUrl,
  tesla_rotor: skinTeslaRotorUrl,
  toxic_drill: skinToxicDrillUrl,
  void_reaper: skinVoidReaperUrl,
};

interface BiomeGradeSpec {
  multiplyHex: string;
  multiplyAlpha: number;
  glowAlpha: number;
}

// Tasteful multi-pass biome grading (replaces harsh CSS hue-rotate saturation/yellow artifacts)
const BIOME_GRADE_SPECS: Record<number, BiomeGradeSpec> = {
  0: { multiplyHex: '#ffffff', multiplyAlpha: 0, glowAlpha: 0 },
  1: { multiplyHex: '#4f6ef7', multiplyAlpha: 0.42, glowAlpha: 0.08 },
  2: { multiplyHex: '#9a3412', multiplyAlpha: 0.36, glowAlpha: 0.08 },
  3: { multiplyHex: '#38bdf8', multiplyAlpha: 0.48, glowAlpha: 0.1 },
  4: { multiplyHex: '#7e22ce', multiplyAlpha: 0.46, glowAlpha: 0.09 },
  5: { multiplyHex: '#334155', multiplyAlpha: 0.5, glowAlpha: 0.07 },
};

export class SpriteAtlas {
  private images = new Map<string, HTMLImageElement>();
  private tintedCache = new Map<string, HTMLCanvasElement>();
  private loaded = false;

  getLogoEmblemUrl(): string {
    return logoEmblemUrl;
  }

  getSkinThumbnailUrl(skinId: string): string {
    return SKIN_URL_MAP[skinId] ?? skinSteelSawbladeUrl;
  }

  async loadAll(): Promise<void> {
    if (this.loaded || typeof Image === 'undefined') return;
    const entries: Array<[string, string]> = [
      ['stone_slate', blockStoneSlateUrl],
      ['stone_sand', blockStoneSandUrl],
      ['stone_granite', blockStoneGraniteUrl],
      ['ore_nuggets', blockOreNuggetsUrl],
      ['ore_gold', blockOreGoldUrl],
      ['ore_molten', blockOreMoltenUrl],
      ['tnt', blockTntUrl],
      ['frost', blockFrostUrl],
      ['bedrock_core', blockBedrockCoreUrl],
      ['vault', blockVaultUrl],
      ['splitter', blockSplitterUrl],
      ['laser', blockLaserUrl],
      ['boss_armor', blockBossArmorUrl],
      ['bumper_amber', propBumperAmberUrl],
      ['bumper_cyan', propBumperCyanUrl],
      ['turret', propTurretUrl],
      ['lantern', propLanternUrl],
      ['portal', propPortalUrl],
      ['portal_entry', propPortalEntryUrl],
      ['portal_exit', propPortalExitUrl],
      ['pickup_split_gem', pickupSplitGemUrl],
      ['pickup_magnet_coil', pickupMagnetCoilUrl],
      ['pickup_overclock_battery', pickupOverclockBatteryUrl],
      ['timber_beam', envTimberBeamUrl],
      ['rock_flank', envRockFlankUrl],
      ['logo_emblem', logoEmblemUrl],
      ...Object.entries(SKIN_URL_MAP).map(([id, url]) => [`skin:${id}`, url] as [string, string]),
    ];

    await Promise.all(
      entries.map(
        ([key, url]) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              this.images.set(key, img);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = url;
          })
      )
    );
    this.loaded = true;
  }

  getEnvTimberBeam(biome?: BiomeSpec): DrawableImage | null {
    const base = this.images.get('timber_beam');
    if (!base) return null;
    if (!biome || biome.index === 0) return base;
    return this.getGraded(`beam:${biome.index}`, base, biome, 0.42, 0.04);
  }

  getEnvRockFlank(biome: BiomeSpec): DrawableImage | null {
    const base = this.images.get('rock_flank');
    if (!base) return null;
    if (biome.index === 0) return base;
    return this.getGraded(`flank:${biome.index}`, base, biome);
  }

  getPropTurret(): DrawableImage | null {
    return this.images.get('turret') ?? null;
  }

  getPropLantern(): DrawableImage | null {
    return this.images.get('lantern') ?? null;
  }

  getPropPortal(isEntry?: boolean): DrawableImage | null {
    if (isEntry === true) {
      return this.images.get('portal_entry') ?? this.images.get('portal') ?? null;
    }
    if (isEntry === false) {
      return this.images.get('portal_exit') ?? this.images.get('portal') ?? null;
    }
    return this.images.get('portal') ?? null;
  }

  getPickupSprite(kind: 'split_gem' | 'magnet_coil' | 'overclock_battery'): DrawableImage | null {
    return this.images.get(`pickup_${kind}`) ?? null;
  }

  getPropBumper(isAmber: boolean): DrawableImage | null {
    return this.images.get(isAmber ? 'bumper_amber' : 'bumper_cyan') ?? null;
  }

  getPropSawblade(skin: SkinSpec): DrawableImage | null {
    return this.images.get(`skin:${skin.id}`) ?? this.images.get('skin:steel_sawblade') ?? null;
  }

  getBlockSprite(kind: EntityKind, biome: BiomeSpec, col: number, row: number): DrawableImage | null {
    const variant = Math.abs((col * 73856093) ^ (row * 19349663)) % 3;
    let baseKey = 'stone_slate';
    let allowBiomeTint = true;

    switch (kind) {
      case 'strata':
        baseKey = variant === 0 ? 'stone_slate' : variant === 1 ? 'stone_sand' : 'stone_granite';
        break;
      case 'granite':
        baseKey = 'stone_granite';
        break;
      case 'boss_armor':
        baseKey = 'boss_armor';
        allowBiomeTint = false;
        break;
      case 'ore':
        baseKey = variant === 0 ? 'ore_nuggets' : variant === 1 ? 'ore_gold' : 'ore_molten';
        break;
      case 'tnt':
        baseKey = 'tnt';
        allowBiomeTint = false;
        break;
      case 'frost':
        baseKey = 'frost';
        allowBiomeTint = false;
        break;
      case 'boss_core':
        baseKey = 'bedrock_core';
        allowBiomeTint = false;
        break;
      case 'splitter':
        baseKey = 'splitter';
        allowBiomeTint = false;
        break;
      case 'laser':
        baseKey = 'laser';
        allowBiomeTint = false;
        break;
      case 'vault':
        baseKey = 'vault';
        allowBiomeTint = false;
        break;
      default:
        baseKey = 'stone_slate';
    }

    const base = this.images.get(baseKey);
    if (!base) return null;
    if (!allowBiomeTint || biome.index === 0) return base;

    return this.getGraded(`blk:${baseKey}:${biome.index}`, base, biome);
  }

  private getGraded(
    cacheKey: string,
    img: HTMLImageElement,
    biome: BiomeSpec,
    overrideMultiplyAlpha?: number,
    overrideGlowAlpha?: number
  ): DrawableImage {
    const cached = this.tintedCache.get(cacheKey);
    if (cached) return cached;
    if (typeof document === 'undefined') return img;

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return img;

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return img;

    const grade = BIOME_GRADE_SPECS[biome.index] ?? BIOME_GRADE_SPECS[0];
    const multAlpha = overrideMultiplyAlpha ?? grade.multiplyAlpha;
    const glowAlpha = overrideGlowAlpha ?? grade.glowAlpha;

    ctx.drawImage(img, 0, 0, w, h);
    if (multAlpha > 0) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = multAlpha;
      ctx.fillStyle = grade.multiplyHex;
      ctx.fillRect(0, 0, w, h);
    }
    if (glowAlpha > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = glowAlpha;
      ctx.fillStyle = biome.palette.glow;
      ctx.fillRect(0, 0, w, h);
    }
    // Preserve exact original silhouette & anti-aliased alpha edges
    ctx.globalCompositeOperation = 'destination-in';
    ctx.globalAlpha = 1;
    ctx.drawImage(img, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    this.tintedCache.set(cacheKey, c);
    return c;
  }
}

export const sharedSpriteAtlas = new SpriteAtlas();
