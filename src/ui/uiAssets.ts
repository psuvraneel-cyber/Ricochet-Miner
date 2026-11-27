import badgeAscensionStarUrl from '../assets/badge_ascension_star.webp';
import badgeChainDetonatorUrl from '../assets/badge_chain_detonator.webp';
import badgeComboMasterUrl from '../assets/badge_combo_master.webp';
import badgeHeavyInvestorUrl from '../assets/badge_heavy_investor.webp';
import badgeZeroSkipUrl from '../assets/badge_zero_skip.webp';
import crestTier1Url from '../assets/crest_tier_1.webp';
import crestTier2Url from '../assets/crest_tier_2.webp';
import crestTier3Url from '../assets/crest_tier_3.webp';
import crestTier4Url from '../assets/crest_tier_4.webp';
import iconArmorySkinsUrl from '../assets/icon_armory_skins.webp';
import iconChestUrl from '../assets/icon_chest.webp';
import iconCoinHeroUrl from '../assets/icon_coin_hero.webp';
import iconCoinStackUrl from '../assets/icon_coin_stack.webp';
import iconDrillDamageUrl from '../assets/icon_drill_damage.webp';
import iconDroneBadgeUrl from '../assets/icon_drone_badge.webp';
import iconGearElevatorUrl from '../assets/icon_gear_elevator.webp';
import iconLeaderboardUrl from '../assets/icon_leaderboard.webp';
import iconLuckUrl from '../assets/icon_luck.webp';
import iconMaxBouncesUrl from '../assets/icon_max_bounces.webp';
import iconMultiballUrl from '../assets/icon_multiball.webp';
import iconOrbSizeUrl from '../assets/icon_orb_size.webp';
import iconOreValueUrl from '../assets/icon_ore_value.webp';
import iconPerkCardUrl from '../assets/icon_perk_card.webp';
import iconShardCrystalUrl from '../assets/icon_shard_crystal.webp';
import iconSkillMagpulseUrl from '../assets/icon_skill_magpulse.webp';
import iconSkillOverclockUrl from '../assets/icon_skill_overclock.webp';
import iconSuperOrbTokenUrl from '../assets/icon_super_orb_token.webp';
import iconTrophyUrl from '../assets/icon_trophy.webp';
import uiConsoleDockUrl from '../assets/ui_console_dock.webp';
import uiModalFrameUrl from '../assets/ui_modal_frame.webp';
import uiStatPlaqueUrl from '../assets/ui_stat_plaque.webp';
import uiSunburstCrestUrl from '../assets/ui_sunburst_crest.webp';
import uiTitleRibbonUrl from '../assets/ui_title_ribbon.webp';
import type { UpgradeId } from '../config/gameConfig';

export const UI_MODAL_FRAME_URL = uiModalFrameUrl;

export const UI_ICONS = {
  drillDamage: iconDrillDamageUrl,
  maxBounces: iconMaxBouncesUrl,
  multiball: iconMultiballUrl,
  orbSize: iconOrbSizeUrl,
  luck: iconLuckUrl,
  oreValue: iconOreValueUrl,
  trophy: iconTrophyUrl,
  gearElevator: iconGearElevatorUrl,
  chest: iconChestUrl,
  coinHero: iconCoinHeroUrl,
  coinStack: iconCoinStackUrl,
  shardCrystal: iconShardCrystalUrl,
  superOrbToken: iconSuperOrbTokenUrl,
  droneBadge: iconDroneBadgeUrl,
  armorySkins: iconArmorySkinsUrl,
  leaderboard: iconLeaderboardUrl,
  perkCard: iconPerkCardUrl,
  skillMagpulse: iconSkillMagpulseUrl,
  skillOverclock: iconSkillOverclockUrl,
  consoleDock: uiConsoleDockUrl,
  statPlaque: uiStatPlaqueUrl,
  sunburstCrest: uiSunburstCrestUrl,
  titleRibbon: uiTitleRibbonUrl,
  crestTier1: crestTier1Url,
  crestTier2: crestTier2Url,
  crestTier3: crestTier3Url,
  crestTier4: crestTier4Url,
  badgeChainDetonator: badgeChainDetonatorUrl,
  badgeComboMaster: badgeComboMasterUrl,
  badgeHeavyInvestor: badgeHeavyInvestorUrl,
  badgeZeroSkip: badgeZeroSkipUrl,
  badgeAscensionStar: badgeAscensionStarUrl,
} as const;

export function getCrestUrlForTier(tier: number): string {
  if (tier <= 1) return crestTier1Url;
  if (tier === 2) return crestTier2Url;
  if (tier === 3) return crestTier3Url;
  return crestTier4Url;
}

export const UPGRADE_ICON_URLS: Record<UpgradeId, string> = {
  damage: iconDrillDamageUrl,
  bounces: iconMaxBouncesUrl,
  multiorb: iconMultiballUrl,
  orbsize: iconOrbSizeUrl,
  luck: iconLuckUrl,
  orevalue: iconOreValueUrl,
  dronebay: iconDroneBadgeUrl,
  relicforge: iconPerkCardUrl,
  overclockcore: iconSkillOverclockUrl,
};
