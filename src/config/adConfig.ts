export type RewardedPlacementId =
  | 'rv_double_run'
  | 'rv_extra_launch'
  | 'rv_free_upgrade'
  | 'rv_overdrive_trial'
  | 'rv_offline_double'
  | 'rv_skin_progress';

export const AD_CONFIG = {
  MIDGAME_GRACE_PERIOD_S: 180,
  MIDGAME_COOLDOWN_S: 150,
  PRE_AD_CUE_S: 0.4,
  RV_DOUBLE_RUN_RATIO: 1.2,
  RV_DOUBLE_RUN_COOLDOWN_RUNS: 2,
  RV_EXTRA_LAUNCH_HP_THRESHOLD: 0.2,
  RV_FREE_UPGRADE_MIN_GAP: 0.1,
  RV_FREE_UPGRADE_MAX_GAP: 0.35,
  RV_FREE_UPGRADE_COOLDOWN_RUNS: 4,
  RV_OVERDRIVE_COOLDOWN_RUNS: 6,
} as const;
