import blockBedrockCoreUrl from '../assets/block_bedrock_core.webp';
import blockFrostUrl from '../assets/block_frost.webp';
import blockOreGoldUrl from '../assets/block_ore_gold.webp';
import blockOreMoltenUrl from '../assets/block_ore_molten.webp';
import blockOreNuggetsUrl from '../assets/block_ore_nuggets.webp';
import blockStoneGraniteUrl from '../assets/block_stone_granite.webp';
import blockStoneSandUrl from '../assets/block_stone_sand.webp';
import blockStoneSlateUrl from '../assets/block_stone_slate.webp';
import blockTntUrl from '../assets/block_tnt.webp';
import envRockFlankUrl from '../assets/env_rock_flank.webp';
import envTimberBeamUrl from '../assets/env_timber_beam.webp';
import logoEmblemUrl from '../assets/logo_emblem.webp';
import propBumperAmberUrl from '../assets/prop_bumper_amber.webp';
import propBumperCyanUrl from '../assets/prop_bumper_cyan.webp';
import propLanternUrl from '../assets/prop_lantern.webp';
import propPortalUrl from '../assets/prop_portal.webp';
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

const BIOME_TINT_FILTERS: Record<number, string> = {
  0: 'none',
  1: 'hue-rotate(215deg) saturate(1.25) brightness(0.95)',
  2: 'hue-rotate(-18deg) saturate(1.35) brightness(0.9)',
  3: 'hue-rotate(175deg) saturate(1.1) brightness(1.05)',
  4: 'hue-rotate(255deg) saturate(1.4) contrast(1.08)',
  5: 'hue-rotate(30deg) saturate(1.25) brightness(1.08)',
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
      ['bumper_amber', propBumperAmberUrl],
      ['bumper_cyan', propBumperCyanUrl],
      ['turret', propTurretUrl],
      ['lantern', propLanternUrl],
      ['portal', propPortalUrl],
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

  getEnvTimberBeam(): DrawableImage | null {
    return this.images.get('timber_beam') ?? null;
  }

  getEnvRockFlank(biome: BiomeSpec): DrawableImage | null {
    const base = this.images.get('rock_flank');
    if (!base) return null;
    if (biome.index === 0) return base;
    return this.getTinted(`flank:${biome.index}`, base, BIOME_TINT_FILTERS[biome.index] ?? 'none', biome.palette.strataFill);
  }

  getPropTurret(): DrawableImage | null {
    return this.images.get('turret') ?? null;
  }

  getPropLantern(): DrawableImage | null {
    return this.images.get('lantern') ?? null;
  }

  getPropPortal(): DrawableImage | null {
    return this.images.get('portal') ?? null;
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
      case 'boss_armor':
        baseKey = 'stone_granite';
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
        baseKey = 'frost';
        break;
      case 'laser':
        baseKey = 'ore_molten';
        allowBiomeTint = false;
        break;
      case 'vault':
        baseKey = 'ore_gold';
        allowBiomeTint = false;
        break;
      default:
        baseKey = 'stone_slate';
    }

    const base = this.images.get(baseKey);
    if (!base) return null;
    if (!allowBiomeTint || biome.index === 0) return base;

    return this.getTinted(
      `blk:${baseKey}:${biome.index}`,
      base,
      BIOME_TINT_FILTERS[biome.index] ?? 'none',
      biome.palette.strataFill,
      0.24
    );
  }

  private getTinted(
    cacheKey: string,
    img: HTMLImageElement,
    cssFilter: string,
    fallbackTintHex: string,
    tintAlpha: number = 0.28
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

    if (cssFilter !== 'none' && 'filter' in ctx) {
      ctx.filter = cssFilter;
      ctx.drawImage(img, 0, 0, w, h);
      ctx.filter = 'none';
    } else {
      ctx.drawImage(img, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = fallbackTintHex;
      ctx.globalAlpha = tintAlpha;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    this.tintedCache.set(cacheKey, c);
    return c;
  }
}

export const sharedSpriteAtlas = new SpriteAtlas();
