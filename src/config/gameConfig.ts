export type BiomeId =
  | 'quarry'
  | 'crystal'
  | 'magma'
  | 'subzero'
  | 'cyber'
  | 'quantum';

export type UpgradeId =
  | 'damage'
  | 'bounces'
  | 'multiorb'
  | 'orbsize'
  | 'luck'
  | 'orevalue'
  | 'dronebay'
  | 'relicforge'
  | 'overclockcore';

export type EntityKind =
  | 'strata'
  | 'granite'
  | 'ore'
  | 'tnt'
  | 'bumper'
  | 'splitter'
  | 'laser'
  | 'vault'
  | 'boss_core'
  | 'boss_armor'
  | 'frost'
  | 'portal_entry'
  | 'portal_exit'
  | 'pickup_split'
  | 'pickup_magnet'
  | 'pickup_overclock'
  | 'boss_shard';

export type BladePassiveId =
  | 'precision_cleave'
  | 'prospectors_teeth'
  | 'ricochet_gyro'
  | 'thermite_edge'
  | 'shatter_chill'
  | 'midas_magnetism'
  | 'arc_discharge'
  | 'corrosive_splash'
  | 'phase_cleave';

export type ArtifactId =
  | 'chain_fork'
  | 'volatile_gold'
  | 'twin_emitter'
  | 'kinetic_ramp'
  | 'vampiric_bounces'
  | 'prism_multiply'
  | 'boss_breaker'
  | 'magnetic_wake'
  | 'overclock_surge'
  | 'precision_lens';

export interface BiomeSpec {
  id: BiomeId;
  index: number;
  nameKey: string;
  startDepthM: number;
  endDepthM: number;
  coinMultiplier: number;
  palette: {
    bgTop: string;
    bgBottom: string;
    wall: string;
    strataFill: string;
    strataStroke: string;
    accent: string;
    glow: string;
  };
}

export interface UpgradeSpec {
  id: UpgradeId;
  nameKey: string;
  descKey: string;
  baseCost: number;
  growthRate: number;
  maxLevel: number;
  icon: string;
}

export interface SkinSpec {
  id: string;
  nameKey: string;
  category: 'default' | 'milestone' | 'mastery' | 'coin_or_ad';
  unlockDescKey: string;
  passiveId: BladePassiveId;
  passiveTitleKey: string;
  passiveDescKey: string;
  primaryColor: string;
  secondaryColor: string;
  trailColor: string;
  bladeTeeth: number;
  coinCost?: number;
  unlockBiomeIndex?: number;
  masteryStat?: 'tntDetonated' | 'maxBounceCombo' | 'vaultsBroken' | 'blocksDestroyed';
  masteryTarget?: number;
  rvCost?: number;
}

export interface ArtifactSpec {
  id: ArtifactId;
  nameKey: string;
  descKey: string;
  icon: 'lightning' | 'blast' | 'orb' | 'pickaxe' | 'clover' | 'gem' | 'bossCore' | 'coin' | 'fastForward';
  accentColor: string;
  maxStacks: number;
}

export const PHYSICS_CONFIG = {
  FIXED_DT: 1 / 120,
  MAX_FRAME_DT: 0.05,
  SHAFT_WIDTH: 540,
  GRID_COLS: 9,
  TILE_SIZE: 60,
  CHUNK_ROWS: 12,
  CHUNK_HEIGHT: 720,
  METERS_PER_ROW: 2.5,
  LAUNCHER_Y: 72,
  MUZZLE_PIVOT_OFFSET_Y: -22,
  MUZZLE_LENGTH: 58,
  LAUNCH_SPEED: 920,
  GRAVITY: 480,
  MIN_AIM_DEG: 12,
  MAX_AIM_DEG: 168,
  RESTITUTION_BLOCK: 0.96,
  RESTITUTION_BUMPER: 1.25,
  MAX_ORB_SPEED: 1450,
  MIN_ORB_SPEED: 420,
  WALL_BOUNCE_COST: 0.5,
  BLOCK_BOUNCE_COST: 1,
  CLEAVE_RATIO: 2,
  BUMPER_MAX_HITS: 5,
  BUMPER_BOUNCE_BONUS: 2,
  MAX_ACTIVE_ORBS: 24,
  TRAJECTORY_DOTS: 14,
  CANCEL_DEADZONE_PX: 16,
  HORIZONTAL_TRAP_WALL_HITS: 4,
  HORIZONTAL_TRAP_DEFLECT_DEG: 8,
  OVERHEAT_STALL_SECONDS: 25,
  CAMERA_LOOKAHEAD_Y: 160,
  MULTI_ORB_INTERVAL_S: 0.12,
  PORTAL_COOLDOWN_S: 0.4,
  PORTAL_BONUS_BOUNCES: 2,
  PORTAL_SPEED_BOOST: 1.3,
  BOSS_ARMOR_SPLASH_RATIO: 0.2,
} as const;

export const ENTITY_STATS: Record<
  EntityKind,
  { hpMult: number; coinMult: number }
> = {
  strata: { hpMult: 1.0, coinMult: 1.0 },
  granite: { hpMult: 3.2, coinMult: 2.0 },
  ore: { hpMult: 1.5, coinMult: 3.0 },
  tnt: { hpMult: 0.5, coinMult: 1.4 },
  bumper: { hpMult: Number.POSITIVE_INFINITY, coinMult: 0.5 },
  splitter: { hpMult: 0.5, coinMult: 1.0 },
  laser: { hpMult: 1.1, coinMult: 1.5 },
  vault: { hpMult: 5.5, coinMult: 10.0 },
  boss_core: { hpMult: 30.0, coinMult: 20.0 },
  boss_armor: { hpMult: Number.POSITIVE_INFINITY, coinMult: 0.2 },
  frost: { hpMult: 1.4, coinMult: 1.4 },
  portal_entry: { hpMult: Number.POSITIVE_INFINITY, coinMult: 0 },
  portal_exit: { hpMult: Number.POSITIVE_INFINITY, coinMult: 0 },
  pickup_split: { hpMult: 0, coinMult: 0 },
  pickup_magnet: { hpMult: 0, coinMult: 0 },
  pickup_overclock: { hpMult: 0, coinMult: 0 },
  boss_shard: { hpMult: 0.35, coinMult: 1.5 },
};

export const SKILL_CONFIG = {
  MAG_PULSE_BASE_COOLDOWN_S: 4.0,
  MAG_PULSE_MIN_COOLDOWN_S: 2.1,
  MAG_PULSE_COOLDOWN_REDUCTION_PER_LV: 0.12,
  MAG_PULSE_RADIUS_PX: 175,
  OVERCLOCK_BASE_DURATION_S: 3.5,
  OVERCLOCK_DURATION_PER_LV: 0.25,
  OVERCLOCK_DAMAGE_MULT: 1.55,
  OVERCLOCK_SPEED_MULT: 1.25,
  OVERCLOCK_CLEAVE_BONUS: 1.35,
  OVERCLOCK_BREAKS_PER_RECHARGE: 20,
  BOSS_WEAKPOINT_CYCLE_S: 4.5,
  BOSS_WEAKPOINT_CRIT_MULT: 2.0,
  BOSS_PHASE2_HP_RATIO: 0.5,
  BOSS_SHARD_INTERVAL_S: 3.0,
  DRONE_FREE_UNLOCK_DEPTH_M: 100,
} as const;

export const TNT_BASE_RADIUS_TILES = 2.5;
export const TNT_DAMAGE_MULT = 3.5;
export const LASER_DAMAGE_MULT = 2.5;
export const VAULT_INTERVAL_METERS = 50;
export const PRESTIGE_UNLOCK_DEPTH_M = 1300;
export const PRESTIGE_BONUS_PER_LEVEL = 0.5;

export interface AscensionMilestoneSpec {
  tier: number;
  titleKey: string;
  quoteKey: string;
}

export interface MasteryFeatSpec {
  id: string;
  nameKey: string;
  descKey: string;
  rewardCoins: number;
}

export const ASCENSION_CONFIG = {
  FINAL_BIOME_INDEX: 5,
  FINAL_GATE_DEPTH_M: 1550,
  HP_BASE: 2.0,
  COIN_BASE: 1.65,
  CAP_BONUS_PER_TIER: 10,
  DAMAGE_BONUS_PER_TIER: 0.15,
} as const;

export const ASCENSION_MILESTONES: readonly AscensionMilestoneSpec[] = [
  { tier: 1, titleKey: 'asc_tier_1_title', quoteKey: 'asc_tier_1_quote' },
  { tier: 2, titleKey: 'asc_tier_2_title', quoteKey: 'asc_tier_2_quote' },
  { tier: 3, titleKey: 'asc_tier_3_title', quoteKey: 'asc_tier_3_quote' },
  { tier: 4, titleKey: 'asc_tier_4_title', quoteKey: 'asc_tier_4_quote' },
];

export const MASTERY_FEATS: readonly MasteryFeatSpec[] = [
  { id: 'chain_detonator', nameKey: 'feat_chain_title', descKey: 'feat_chain_desc', rewardCoins: 1500 },
  { id: 'combo_master', nameKey: 'feat_combo_title', descKey: 'feat_combo_desc', rewardCoins: 2500 },
  { id: 'heavy_investor', nameKey: 'feat_investor_title', descKey: 'feat_investor_desc', rewardCoins: 5000 },
  { id: 'zero_skip_purist', nameKey: 'feat_zeroskip_title', descKey: 'feat_zeroskip_desc', rewardCoins: 10000 },
];

export function getAscensionHpMultiplier(tier: number): number {
  return Math.pow(ASCENSION_CONFIG.HP_BASE, Math.max(0, tier));
}

export function getAscensionCoinMultiplier(tier: number): number {
  return Math.pow(ASCENSION_CONFIG.COIN_BASE, Math.max(0, tier));
}

export function getAscensionCapBonus(tier: number): number {
  return Math.max(0, tier) * ASCENSION_CONFIG.CAP_BONUS_PER_TIER;
}

export function getAscensionDamageBonus(tier: number): number {
  return 1 + Math.max(0, tier) * ASCENSION_CONFIG.DAMAGE_BONUS_PER_TIER;
}

export function getAscensionMilestone(tier: number): AscensionMilestoneSpec {
  const idx = Math.max(0, Math.min(ASCENSION_MILESTONES.length - 1, tier - 1));
  return ASCENSION_MILESTONES[idx];
}

export function toRomanNumeral(n: number): string {
  const num = Math.max(1, Math.floor(n));
  const map: Array<[number, string]> = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let rem = num;
  let out = '';
  for (const [val, sym] of map) {
    while (rem >= val) {
      out += sym;
      rem -= val;
    }
  }
  return out;
}

export const BIOMES: readonly BiomeSpec[] = [
  {
    id: 'quarry',
    index: 0,
    nameKey: 'biome_quarry',
    startDepthM: 0,
    endDepthM: 150,
    coinMultiplier: 1,
    palette: {
      bgTop: '#161b2e',
      bgBottom: '#231c24',
      wall: '#3a2d28',
      strataFill: '#c96f44',
      strataStroke: '#f4a261',
      accent: '#38bdf8',
      glow: '#fbbf24',
    },
  },
  {
    id: 'crystal',
    index: 1,
    nameKey: 'biome_crystal',
    startDepthM: 150,
    endDepthM: 350,
    coinMultiplier: 1.8,
    palette: {
      bgTop: '#13112c',
      bgBottom: '#1e1642',
      wall: '#2b2459',
      strataFill: '#4338ca',
      strataStroke: '#22d3ee',
      accent: '#e879f9',
      glow: '#22d3ee',
    },
  },
  {
    id: 'magma',
    index: 2,
    nameKey: 'biome_magma',
    startDepthM: 350,
    endDepthM: 600,
    coinMultiplier: 3.1,
    palette: {
      bgTop: '#181214',
      bgBottom: '#2b130e',
      wall: '#331c17',
      strataFill: '#451a14',
      strataStroke: '#fb923c',
      accent: '#f97316',
      glow: '#fbbf24',
    },
  },
  {
    id: 'subzero',
    index: 3,
    nameKey: 'biome_subzero',
    startDepthM: 600,
    endDepthM: 900,
    coinMultiplier: 5.4,
    palette: {
      bgTop: '#0b192c',
      bgBottom: '#102a43',
      wall: '#1e3a5f',
      strataFill: '#1d4ed8',
      strataStroke: '#bae6fd',
      accent: '#7dd3fc',
      glow: '#e0f2fe',
    },
  },
  {
    id: 'cyber',
    index: 4,
    nameKey: 'biome_cyber',
    startDepthM: 900,
    endDepthM: 1300,
    coinMultiplier: 9.2,
    palette: {
      bgTop: '#120a21',
      bgBottom: '#1b0f30',
      wall: '#2a1647',
      strataFill: '#3b0764',
      strataStroke: '#a3e635',
      accent: '#f43f5e',
      glow: '#a3e635',
    },
  },
  {
    id: 'quantum',
    index: 5,
    nameKey: 'biome_quantum',
    startDepthM: 1300,
    endDepthM: Number.POSITIVE_INFINITY,
    coinMultiplier: 15.5,
    palette: {
      bgTop: '#05070e',
      bgBottom: '#111827',
      wall: '#1f2937',
      strataFill: '#1e293b',
      strataStroke: '#fde047',
      accent: '#f8fafc',
      glow: '#fde047',
    },
  },
];

export const UPGRADES: readonly UpgradeSpec[] = [
  {
    id: 'damage',
    nameKey: 'upg_damage',
    descKey: 'upg_damage_desc',
    baseCost: 25,
    growthRate: 1.32,
    maxLevel: 64,
    icon: 'pickaxe',
  },
  {
    id: 'bounces',
    nameKey: 'upg_bounces',
    descKey: 'upg_bounces_desc',
    baseCost: 35,
    growthRate: 1.31,
    maxLevel: 54,
    icon: 'lightning',
  },
  {
    id: 'multiorb',
    nameKey: 'upg_multiorb',
    descKey: 'upg_multiorb_desc',
    baseCost: 480,
    growthRate: 1.56,
    maxLevel: 16,
    icon: 'orb',
  },
  {
    id: 'orbsize',
    nameKey: 'upg_orbsize',
    descKey: 'upg_orbsize_desc',
    baseCost: 55,
    growthRate: 1.31,
    maxLevel: 44,
    icon: 'blast',
  },
  {
    id: 'luck',
    nameKey: 'upg_luck',
    descKey: 'upg_luck_desc',
    baseCost: 65,
    growthRate: 1.31,
    maxLevel: 44,
    icon: 'clover',
  },
  {
    id: 'orevalue',
    nameKey: 'upg_orevalue',
    descKey: 'upg_orevalue_desc',
    baseCost: 45,
    growthRate: 1.32,
    maxLevel: 58,
    icon: 'coin',
  },
  {
    id: 'dronebay',
    nameKey: 'upg_dronebay',
    descKey: 'upg_dronebay_desc',
    baseCost: 240,
    growthRate: 1.29,
    maxLevel: 46,
    icon: 'drone',
  },
  {
    id: 'relicforge',
    nameKey: 'upg_relicforge',
    descKey: 'upg_relicforge_desc',
    baseCost: 340,
    growthRate: 1.3,
    maxLevel: 44,
    icon: 'gem',
  },
  {
    id: 'overclockcore',
    nameKey: 'upg_overclockcore',
    descKey: 'upg_overclockcore_desc',
    baseCost: 220,
    growthRate: 1.29,
    maxLevel: 46,
    icon: 'lightning',
  },
];

export const ARTIFACTS: readonly ArtifactSpec[] = [
  {
    id: 'chain_fork',
    nameKey: 'perk_chain_fork',
    descKey: 'perk_chain_fork_desc',
    icon: 'lightning',
    accentColor: '#38bdf8',
    maxStacks: 4,
  },
  {
    id: 'volatile_gold',
    nameKey: 'perk_volatile_gold',
    descKey: 'perk_volatile_gold_desc',
    icon: 'blast',
    accentColor: '#fbbf24',
    maxStacks: 4,
  },
  {
    id: 'twin_emitter',
    nameKey: 'perk_twin_emitter',
    descKey: 'perk_twin_emitter_desc',
    icon: 'orb',
    accentColor: '#c084fc',
    maxStacks: 4,
  },
  {
    id: 'kinetic_ramp',
    nameKey: 'perk_kinetic_ramp',
    descKey: 'perk_kinetic_ramp_desc',
    icon: 'fastForward',
    accentColor: '#fb923c',
    maxStacks: 5,
  },
  {
    id: 'vampiric_bounces',
    nameKey: 'perk_vampiric_bounces',
    descKey: 'perk_vampiric_bounces_desc',
    icon: 'clover',
    accentColor: '#4ade80',
    maxStacks: 4,
  },
  {
    id: 'prism_multiply',
    nameKey: 'perk_prism_multiply',
    descKey: 'perk_prism_multiply_desc',
    icon: 'gem',
    accentColor: '#e879f9',
    maxStacks: 4,
  },
  {
    id: 'boss_breaker',
    nameKey: 'perk_boss_breaker',
    descKey: 'perk_boss_breaker_desc',
    icon: 'bossCore',
    accentColor: '#f43f5e',
    maxStacks: 4,
  },
  {
    id: 'magnetic_wake',
    nameKey: 'perk_magnetic_wake',
    descKey: 'perk_magnetic_wake_desc',
    icon: 'coin',
    accentColor: '#facc15',
    maxStacks: 4,
  },
  {
    id: 'overclock_surge',
    nameKey: 'perk_overclock_surge',
    descKey: 'perk_overclock_surge_desc',
    icon: 'fastForward',
    accentColor: '#22d3ee',
    maxStacks: 4,
  },
  {
    id: 'precision_lens',
    nameKey: 'perk_precision_lens',
    descKey: 'perk_precision_lens_desc',
    icon: 'pickaxe',
    accentColor: '#f8fafc',
    maxStacks: 4,
  },
];

export const SKINS: readonly SkinSpec[] = [
  {
    id: 'steel_sawblade',
    nameKey: 'skin_steel_sawblade',
    category: 'default',
    unlockDescKey: 'skin_unlock_default',
    passiveId: 'precision_cleave',
    passiveTitleKey: 'passive_precision_cleave',
    passiveDescKey: 'passive_precision_cleave_desc',
    primaryColor: '#e2e8f0',
    secondaryColor: '#d97706',
    trailColor: '#ffb732',
    bladeTeeth: 10,
  },
  {
    id: 'copper_gear',
    nameKey: 'skin_copper_gear',
    category: 'coin_or_ad',
    unlockDescKey: 'skin_unlock_copper',
    passiveId: 'prospectors_teeth',
    passiveTitleKey: 'passive_prospectors_teeth',
    passiveDescKey: 'passive_prospectors_teeth_desc',
    primaryColor: '#d97706',
    secondaryColor: '#78350f',
    trailColor: '#f59e0b',
    bladeTeeth: 12,
    coinCost: 450,
  },
  {
    id: 'emerald_buzzsaw',
    nameKey: 'skin_emerald_buzzsaw',
    category: 'milestone',
    unlockDescKey: 'skin_unlock_biome_1',
    passiveId: 'ricochet_gyro',
    passiveTitleKey: 'passive_ricochet_gyro',
    passiveDescKey: 'passive_ricochet_gyro_desc',
    primaryColor: '#34d399',
    secondaryColor: '#065f46',
    trailColor: '#10b981',
    bladeTeeth: 14,
    unlockBiomeIndex: 1,
    coinCost: 1200,
  },
  {
    id: 'magma_cutter',
    nameKey: 'skin_magma_cutter',
    category: 'milestone',
    unlockDescKey: 'skin_unlock_biome_2',
    passiveId: 'thermite_edge',
    passiveTitleKey: 'passive_thermite_edge',
    passiveDescKey: 'passive_thermite_edge_desc',
    primaryColor: '#fb7185',
    secondaryColor: '#991b1b',
    trailColor: '#f97316',
    bladeTeeth: 12,
    unlockBiomeIndex: 2,
    coinCost: 4500,
  },
  {
    id: 'frost_star',
    nameKey: 'skin_frost_star',
    category: 'milestone',
    unlockDescKey: 'skin_unlock_biome_3',
    passiveId: 'shatter_chill',
    passiveTitleKey: 'passive_shatter_chill',
    passiveDescKey: 'passive_shatter_chill_desc',
    primaryColor: '#7dd3fc',
    secondaryColor: '#0369a1',
    trailColor: '#38bdf8',
    bladeTeeth: 12,
    unlockBiomeIndex: 3,
    coinCost: 15000,
  },
  {
    id: 'gold_chakram',
    nameKey: 'skin_gold_chakram',
    category: 'coin_or_ad',
    unlockDescKey: 'skin_unlock_day7',
    passiveId: 'midas_magnetism',
    passiveTitleKey: 'passive_midas_magnetism',
    passiveDescKey: 'passive_midas_magnetism_desc',
    primaryColor: '#fde047',
    secondaryColor: '#dc2626',
    trailColor: '#fbbf24',
    bladeTeeth: 8,
    coinCost: 45000,
  },
  {
    id: 'tesla_rotor',
    nameKey: 'skin_tesla_rotor',
    category: 'mastery',
    unlockDescKey: 'skin_unlock_combo',
    passiveId: 'arc_discharge',
    passiveTitleKey: 'passive_arc_discharge',
    passiveDescKey: 'passive_arc_discharge_desc',
    primaryColor: '#2dd4bf',
    secondaryColor: '#1e293b',
    trailColor: '#22d3ee',
    bladeTeeth: 8,
    masteryStat: 'maxBounceCombo',
    masteryTarget: 40,
    coinCost: 120000,
  },
  {
    id: 'toxic_drill',
    nameKey: 'skin_toxic_drill',
    category: 'coin_or_ad',
    unlockDescKey: 'skin_unlock_toxic',
    passiveId: 'corrosive_splash',
    passiveTitleKey: 'passive_corrosive_splash',
    passiveDescKey: 'passive_corrosive_splash_desc',
    primaryColor: '#a3e635',
    secondaryColor: '#3f6212',
    trailColor: '#bef264',
    bladeTeeth: 14,
    coinCost: 350000,
    rvCost: 3,
  },
  {
    id: 'void_reaper',
    nameKey: 'skin_void_reaper',
    category: 'milestone',
    unlockDescKey: 'skin_unlock_biome_4',
    passiveId: 'phase_cleave',
    passiveTitleKey: 'passive_phase_cleave',
    passiveDescKey: 'passive_phase_cleave_desc',
    primaryColor: '#818cf8',
    secondaryColor: '#0f172a',
    trailColor: '#e0f2fe',
    bladeTeeth: 6,
    unlockBiomeIndex: 5,
    coinCost: 1000000,
  },
];

export const RETENTION_CONFIG = {
  OFFLINE_UNLOCK_RUNS: 3,
  OFFLINE_RATE_FRACTION: 0.15,
  OFFLINE_MAX_HOURS: 4,
  OFFLINE_MIN_MINUTES: 15,
  LOGIN_REWARDS: [
    { day: 1, type: 'coins', amount: 300, labelKey: 'reward_300_coins' },
    { day: 2, type: 'free_damage', amount: 1, labelKey: 'reward_free_damage' },
    { day: 3, type: 'shards', amount: 5, labelKey: 'reward_5_shards' },
    { day: 4, type: 'coins', amount: 1500, labelKey: 'reward_1500_coins' },
    { day: 5, type: 'overdrive_pass', amount: 3, labelKey: 'reward_overdrive_pass' },
    { day: 6, type: 'shards', amount: 10, labelKey: 'reward_10_shards' },
    { day: 7, type: 'skin', skinId: 'gold_chakram', labelKey: 'reward_golden_skin' },
  ] as const,
  DAILY_QUEST_POOL: [
    { id: 'q_tnt', metric: 'tntDetonated' as const, target: 20, labelKey: 'quest_tnt', rewardCoins: 250 },
    { id: 'q_bumpers', metric: 'bumpersHit' as const, target: 35, labelKey: 'quest_bumpers', rewardCoins: 250 },
    { id: 'q_blocks', metric: 'blocksDestroyed' as const, target: 120, labelKey: 'quest_blocks', rewardCoins: 300 },
    { id: 'q_runs', metric: 'runsCompleted' as const, target: 8, labelKey: 'quest_runs', rewardCoins: 200 },
    { id: 'q_vaults', metric: 'vaultsBroken' as const, target: 3, labelKey: 'quest_vaults', rewardCoins: 400 },
  ],
  DAILY_MEGA_CHEST_COINS: 1000,
  DAILY_MEGA_CHEST_SHARDS: 5,
} as const;

export function getMuzzlePosition(
  launcherX: number,
  launcherY: number,
  angleRad: number
): { x: number; y: number } {
  const pivotY = launcherY + PHYSICS_CONFIG.MUZZLE_PIVOT_OFFSET_Y;
  return {
    x: launcherX + Math.cos(angleRad) * PHYSICS_CONFIG.MUZZLE_LENGTH,
    y: pivotY + Math.sin(angleRad) * PHYSICS_CONFIG.MUZZLE_LENGTH,
  };
}

export function getBiomeForDepth(depthMeters: number): BiomeSpec {
  for (let i = BIOMES.length - 1; i >= 0; i--) {
    if (depthMeters >= BIOMES[i].startDepthM) {
      return BIOMES[i];
    }
  }
  return BIOMES[0];
}

export function getBiomeCoinMultiplier(depthMeters: number): number {
  const biome = getBiomeForDepth(depthMeters);
  if (biome.id !== 'quantum') return biome.coinMultiplier;
  const k = Math.max(0, Math.floor((depthMeters - 1300) / 250));
  return biome.coinMultiplier * Math.pow(1.15, k);
}

export function calcBlockHP(
  depthMeters: number,
  kind: EntityKind,
  ascensionTier: number = 0
): number {
  const mult = ENTITY_STATS[kind].hpMult;
  if (!Number.isFinite(mult)) return Number.POSITIVE_INFINITY;
  const ascHp = getAscensionHpMultiplier(ascensionTier);
  const d = Math.max(0, depthMeters);
  const deepRamp = d > 150 ? Math.pow(1 + (d - 150) / 146, 1.36) : 1;
  return Math.max(
    1,
    Math.floor(13 * Math.pow(1 + 0.0155 * d, 1.38) * deepRamp * mult * ascHp)
  );
}

export function calcCoinValue(
  depthMeters: number,
  kind: EntityKind,
  oreValueLevel: number,
  prestigeLevel: number = 0,
  ascensionTier: number = 0
): number {
  const oreMult = ENTITY_STATS[kind].coinMult;
  if (oreMult <= 0) return 0;
  const biomeMult = getBiomeCoinMultiplier(depthMeters);
  const valMult = calcOreValueMultiplier(oreValueLevel);
  const prestigeMult = 1 + prestigeLevel * PRESTIGE_BONUS_PER_LEVEL;
  const ascCoin = getAscensionCoinMultiplier(ascensionTier);
  return Math.max(
    1,
    Math.floor(
      2 * (1 + 0.0018 * Math.max(0, depthMeters)) * biomeMult * oreMult * valMult * prestigeMult * ascCoin
    )
  );
}

export function calcUpgradeCost(spec: UpgradeSpec, currentLevel: number): number {
  if (spec.id === 'dronebay' && currentLevel <= 0) {
    return Math.floor(spec.baseCost * 0.6);
  }
  return Math.floor(spec.baseCost * Math.pow(spec.growthRate, Math.max(0, currentLevel - 1)));
}

export function calcMagPulseCooldownS(overclockCoreLevel: number): number {
  const reduction =
    Math.max(0, overclockCoreLevel - 1) * SKILL_CONFIG.MAG_PULSE_COOLDOWN_REDUCTION_PER_LV;
  return Math.max(
    SKILL_CONFIG.MAG_PULSE_MIN_COOLDOWN_S,
    SKILL_CONFIG.MAG_PULSE_BASE_COOLDOWN_S - reduction
  );
}

export function calcOverclockDurationS(overclockCoreLevel: number, surgeStacks: number = 0): number {
  return (
    SKILL_CONFIG.OVERCLOCK_BASE_DURATION_S +
    Math.max(0, overclockCoreLevel - 1) * SKILL_CONFIG.OVERCLOCK_DURATION_PER_LV +
    surgeStacks * 1.5
  );
}

export function calcRelicPotencyMult(relicForgeLevel: number): number {
  return 1 + Math.max(0, relicForgeLevel - 1) * 0.12;
}

export function calcDroneStats(
  droneBayLevel: number,
  drillDamage: number
): { unlocked: boolean; fireIntervalS: number; beamDamage: number; magnetRadiusPx: number } {
  const lv = Math.max(0, Math.floor(droneBayLevel));
  const effLv = Math.max(1, lv);
  return {
    unlocked: lv >= 1,
    fireIntervalS: Math.max(0.45, 1.35 - (effLv - 1) * 0.075),
    beamDamage: Math.max(4, drillDamage * (0.35 + (effLv - 1) * 0.08)),
    magnetRadiusPx: 95 + (effLv - 1) * 14,
  };
}

export function calcDrillDamage(
  level: number,
  prestigeLevel: number = 0,
  ascensionTier: number = 0
): number {
  const l = Math.max(1, level) - 1;
  const base = 10 + 8.5 * l + 1.65 * l * l;
  return base * (1 + prestigeLevel * PRESTIGE_BONUS_PER_LEVEL) * getAscensionDamageBonus(ascensionTier);
}

export function calcMaxBounces(level: number): number {
  return 8 + 2 * (Math.max(1, level) - 1);
}

export function calcMultiOrbCount(level: number): number {
  return Math.max(1, Math.min(18, Math.floor(level)));
}

export function calcOrbRadius(level: number): number {
  return 14 + 0.75 * (Math.max(1, level) - 1);
}

export function calcTntRadiusPx(orbSizeLevel: number): number {
  const bonus = 1 + 0.03 * Math.max(0, orbSizeLevel - 1);
  return TNT_BASE_RADIUS_TILES * PHYSICS_CONFIG.TILE_SIZE * bonus;
}

export function calcLuckWeights(luckLevel: number): { tntChance: number; bumperChance: number } {
  const bonus = 0.015 * Math.max(0, luckLevel - 1);
  return {
    tntChance: 0.08 + bonus,
    bumperChance: 0.06 + bonus,
  };
}

export function calcOreValueMultiplier(level: number): number {
  const l = Math.max(1, level) - 1;
  return 1 + 0.16 * l;
}
