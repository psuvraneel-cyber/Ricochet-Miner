import { AudioEngine, type SfxMaterial } from './audio/AudioEngine';
import { AD_CONFIG } from './config/adConfig';
import {
  ASCENSION_CONFIG,
  BIOMES,
  PHYSICS_CONFIG,
  SKILL_CONFIG,
  UPGRADES,
  getMuzzlePosition,
  type ArtifactId,
  type UpgradeId,
} from './config/gameConfig';
import { GameLoop } from './core/GameLoop';
import { InputManager, type AimFeedback } from './core/InputManager';
import { StateMachine } from './core/StateMachine';
import { ViewportManager } from './core/ViewportManager';
import { i18n, type SupportedLocale, type TranslationKey } from './i18n/translations';
import { PhysicsEngine } from './physics/PhysicsEngine';
import { FloatingTextPool } from './rendering/FloatingTextPool';
import { JuiceSystem } from './rendering/JuiceSystem';
import { ParticlePool } from './rendering/ParticlePool';
import { Renderer } from './rendering/Renderer';
import { PlatformSDK } from './sdk/PlatformSDK';
import {
  SaveManager,
  createDefaultSave,
  parseAndMigrateSave,
  resolveSaveConflict,
  type SaveData,
} from './sdk/SaveManager';
import type { ChunkSpriteKey } from './rendering/SpriteAtlas';
import { ArtifactSystem } from './systems/ArtifactSystem';
import { EconomySystem } from './systems/EconomySystem';
import { MonetizationSystem } from './systems/MonetizationSystem';
import { ProgressionSystem } from './systems/ProgressionSystem';
import { RetentionSystem } from './systems/RetentionSystem';
import { SkinSystem } from './systems/SkinSystem';
import { AchievementsModal } from './ui/AchievementsModal';
import { AscensionVictoryModal } from './ui/AscensionVictoryModal';
import { DebugOverlay } from './ui/DebugOverlay';
import { FTUEOverlay } from './ui/FTUEOverlay';
import { HUDController } from './ui/HUDController';
import { PerkDraftModal } from './ui/PerkDraftModal';
import { RetentionModals } from './ui/RetentionModals';
import { RunSummaryModal } from './ui/RunSummaryModal';
import { SettingsModal } from './ui/SettingsModal';
import { ShopOverlay } from './ui/ShopOverlay';
import { TitleOverlay } from './ui/TitleOverlay';
import { injectGameStyles } from './ui/styles';
import { formatCompact } from './utils/format';
import { BiomeTheme } from './world/BiomeTheme';
import type { BlockEntity, CoinDrop, CompanionDroneState, Orb } from './world/Entities';
import { ShaftGenerator } from './world/ShaftGenerator';

const COIN_POOL_SIZE = 96;

class RicochetMinerApp {
  private canvas: HTMLCanvasElement;
  private uiRoot: HTMLElement;
  private adShield: HTMLDivElement;
  private saveManager = new SaveManager();
  private save: SaveData = createDefaultSave();

  private stateMachine = new StateMachine();
  private viewport: ViewportManager;
  private renderer: Renderer;
  private physics = new PhysicsEngine();
  private particles = new ParticlePool();
  private floatingText = new FloatingTextPool();
  private juice = new JuiceSystem();

  private economy = new EconomySystem();
  private progression = new ProgressionSystem();
  private retention = new RetentionSystem();
  private skins = new SkinSystem();
  private artifacts = new ArtifactSystem();
  private monetization = new MonetizationSystem();
  private audio = new AudioEngine(false);

  private hud!: HUDController;
  private ftue!: FTUEOverlay;
  private shop!: ShopOverlay;
  private summary!: RunSummaryModal;
  private victoryModal!: AscensionVictoryModal;
  private achievementsModal!: AchievementsModal;
  private retentionModals!: RetentionModals;
  private settingsModal!: SettingsModal;
  private titleOverlay!: TitleOverlay;
  private perkDraftModal!: PerkDraftModal;
  private input!: InputManager;
  private loop!: GameLoop;
  private generator!: ShaftGenerator;

  private entities: BlockEntity[] = [];
  private orbs: Orb[] = [];
  private coins: CoinDrop[] = [];
  private coinCursor = 0;
  private cameraY = 0;
  private aimAngleRad: number | null = null;
  private trajectoryDots: Array<{ x: number; y: number }> = [];
  private trajectoryImpact: { x: number; y: number } | null = null;
  private trajectorySecondImpact: { x: number; y: number } | null = null;
  private targetedBlockId: number | null = null;
  private secondTargetedBlockId: number | null = null;
  private trajectoryBounceIdx = 14;
  private aimFeedback: AimFeedback | null = null;

  private pendingVolleyOrbs = 0;
  private volleyTimerS = 0;
  private volleyAngleRad = Math.PI / 2;
  private isOverdriveRun = false;

  private runCoins = 0;
  private runMaxDepthM = 0;
  private runStartBestDepthM = 0;
  private runElapsedS = 0;
  private isFullShaftRun = true;
  private runBlocksSmashed = 0;
  private runMaxCombo = 0;
  private runTntCount = 0;
  private clearedBiome6ThisRun = false;
  private victorySlowMoTimer = 0;
  private pendingVictoryTier: number | null = null;
  private hasStartedGameplayOnce = false;
  private skipNextMidgameBreak = false;
  private pausedFromState: 'AIMING' | 'RUNNING' | null = null;
  private bossActiveForAudio = false;
  private lastMusicBiomeIdx = -1;
  private lastMusicState = '';
  private lastMusicBoss = false;
  private volleySpawnIndex = 0;
  private pendingBiomeUnlock: { biomeIndex: number; unlockedSkinNames: string[] } | null = null;
  private turretRecoil = 0;
  private timeS = 0;
  private magPulseCooldownS = 0;
  private overclockCharges = 1;
  private overclockTimerS = 0;
  private overclockBreakCounter = 0;
  private magPulseShockwaves: Array<{ x: number; y: number; radius: number; maxRadius: number; alpha: number }> = [];
  private lightningArcs: Array<{ x1: number; y1: number; x2: number; y2: number; alpha: number }> = [];
  private drone: CompanionDroneState = {
    active: false,
    x: 270,
    y: 120,
    bobPhase: 0,
    propRotation: 0,
    fireCooldown: 0,
    targetX: null,
    targetY: null,
    beamTimer: 0,
  };
  private weakPointTimerS = 0;
  private activeWeakPointCoreIndex: number | null = 0;
  private bossShardTimerS = 0;
  private bossPhase2Active = false;
  private playerName: string | null = null;

  constructor() {
    injectGameStyles();
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    const uiRoot = document.getElementById('ui-root');
    if (!canvas || !uiRoot) throw new Error('Missing #game-canvas or #ui-root');
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.adShield = document.createElement('div');
    this.adShield.style.cssText =
      'position:absolute;inset:0;z-index:999;background:transparent;pointer-events:auto;display:none;';
    this.uiRoot.appendChild(this.adShield);
    for (let i = 0; i < COIN_POOL_SIZE; i++) {
      this.coins.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        value: 0,
        life: 0,
        magnetized: false,
        alive: false,
      });
    }
    this.viewport = new ViewportManager(this.canvas);
    this.renderer = new Renderer(this.canvas);
  }

  async boot(): Promise<void> {
    await PlatformSDK.init();
    PlatformSDK.loadingStart();
    const nowMs = PlatformSDK.getServerTimeMs();
    const localSave = this.saveManager.loadLocal(nowMs);
    const cloudRaw = await PlatformSDK.loadCloudData();
    const cloudSave = cloudRaw ? parseAndMigrateSave(cloudRaw, nowMs) : null;
    this.save = resolveSaveConflict(localSave, cloudSave);

    i18n.setLocale(this.save.settings.localeOverride ?? PlatformSDK.getLocale());

    this.audio.setPlatformMuted(PlatformSDK.isPlatformMuted());
    PlatformSDK.onPlatformMuteChange((muted) => {
      this.audio.setPlatformMuted(muted);
    });

    this.audio.setUserMuted(this.save.settings.muted);
    this.audio.setSfxMuted(this.save.settings.sfxMuted);
    this.audio.setMusicVolume(
      this.save.settings.musicVolume ?? (this.save.settings.musicMuted ? 'off' : 'high')
    );
    if (!this.save.settings.aimModeUserSet) {
      this.save.settings.aimMode = this.getDefaultAimModeForDevice();
    }
    this.retention.refreshDailyQuestsIfNeeded(this.save, nowMs);
    this.retention.syncLoginStreakState(this.save, nowMs);

    PlatformSDK.getUser().then((user) => {
      if (user?.username) this.playerName = user.username;
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          PlatformSDK.gameplayStop();
        } else if (
          this.hasStartedGameplayOnce &&
          (this.stateMachine.state === 'AIMING' || this.stateMachine.state === 'RUNNING')
        ) {
          PlatformSDK.gameplayStart();
        }
      });
    }

    PlatformSDK.setAdLifecycleCallbacks({
      onBeforeAd: () => {
        this.stateMachine.pauseForAd();
        this.audio.pauseForAd();
        this.input.setLocked(true);
        this.adShield.style.display = 'block';
      },
      onAdStarted: () => {
        this.audio.pauseForAd();
      },
      onAfterAd: () => {
        this.adShield.style.display = 'none';
        this.audio.resumeFromAd();
        this.input.setLocked(false);
        this.stateMachine.resumeFromAd();
        if (
          this.hasStartedGameplayOnce &&
          (this.stateMachine.state === 'AIMING' || this.stateMachine.state === 'RUNNING')
        ) {
          PlatformSDK.gameplayStart();
        }
        this.loop.resetAccumulator();
      },
    });

    this.setupUI();
    this.setupInput();
    this.setupPhysicsEvents();

    await this.renderer.preloadAssets();

    this.generator = new ShaftGenerator({
      baseRowOffset: this.progression.getBaseRowOffset(this.save),
      luckLevel: this.save.upgrades.luck,
      bossGateHpByBiome: this.save.bossGateHpByBiome,
      unlockedBiomeIndex: this.save.unlockedBiomeIndex,
      ascensionTier: this.save.ascensionTier,
    });
    this.resetShaft();

    this.loop = new GameLoop({
      onFixedUpdate: (dt) => this.fixedUpdate(dt),
      onRender: (_alpha, rawDt) => this.render(rawDt),
      onVisibilityBlur: () => {
        this.input?.setLocked(false);
      },
    });

    this.stateMachine.onChange(() => {
      this.syncMusicStateIfChanged();
    });

    this.stateMachine.transition('AIMING');
    this.titleOverlay.hideImmediate();
    this.titleOverlay.showFloatingIntroBanner(this.renderer.getLogoEmblemUrl());
    this.ftue.setAimMode(this.save.settings.aimMode);
    this.ftue.updateLayout(this.viewport.getLayout());
    this.ftue.setVisible(!this.save.ftueDone);
    this.hasStartedGameplayOnce = true;
    PlatformSDK.loadingStop();
    PlatformSDK.gameplayStart();
    this.loop.start();

    // Offline Idle Drill check
    const offlineCoins = this.retention.calculateOfflineEarnings(this.save, nowMs);
    if (offlineCoins > 0) {
      this.retentionModals.showOfflineModal(offlineCoins, async (doubled) => {
        this.audio.unlock();
        let payout = offlineCoins;
        if (doubled) {
          const res = await this.monetization.showRewarded('rv_offline_double');
          if (res.rewarded) {
            payout *= 2;
          } else {
            this.showAdFailureToast(res.reason);
          }
        }
        this.audio.playUpgrade();
        this.save.coins += payout;
        this.save.totalCoinsEarned += payout;
        this.persistSave();
      });
    }
  }

  private setupUI(): void {
    this.ftue = new FTUEOverlay(this.uiRoot);
    this.ftue.setVisible(false);
    this.viewport.onResize((layout) => {
      this.ftue.updateLayout(layout);
    });

    this.shop = new ShopOverlay(this.uiRoot);
    this.summary = new RunSummaryModal(this.uiRoot);
    this.victoryModal = new AscensionVictoryModal(this.uiRoot);
    this.achievementsModal = new AchievementsModal(this.uiRoot);
    this.retentionModals = new RetentionModals(this.uiRoot);
    this.settingsModal = new SettingsModal(this.uiRoot);
    this.titleOverlay = new TitleOverlay(this.uiRoot);
    this.perkDraftModal = new PerkDraftModal(this.uiRoot);

    const dedicatedSfxSelector =
      '[data-upg], [data-free-upg], [data-coin-unlock], [data-rv-skin], [data-act="prestige"], [data-perk], [data-qclaim], [data-act="mega"], [data-act="claim"], [data-feat-claim], [data-hud="recall"], [data-hud="magpulse"], [data-hud="overclock"], [data-biome], [data-act="collect"], [data-act="collect2x"], [data-hud="aim-mode"], [data-hud="speed"], [data-equip], [data-act="close"], [data-set="close"]';

    this.uiRoot.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      const stack =
        typeof document.elementsFromPoint === 'function'
          ? document.elementsFromPoint(e.clientX, e.clientY)
          : [e.target as Element | null];
      for (const el of stack) {
        if (!el || !(el instanceof HTMLElement)) continue;
        const btn = el.closest('.rm-btn') as HTMLButtonElement | null;
        if (btn && (btn.disabled || btn.classList.contains('unaffordable'))) {
          this.audio.playError();
          break;
        }
      }
    });

    this.uiRoot.addEventListener('click', (e) => {
      this.audio.unlock();
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-act="close"], [data-set="close"]')) {
        this.audio.playModalClose();
        return;
      }
      if (target.closest(dedicatedSfxSelector)) return;
      if (target.closest('.rm-btn, [data-interactive="true"], select[data-set="lang"]')) {
        this.audio.playClick();
      }
    });

    this.hud = new HUDController(this.uiRoot, {
      onToggleMute: () => {
        this.audio.unlock();
        this.save.settings.muted = this.audio.toggleMute();
        this.persistSave();
      },
      onTogglePause: () => this.togglePause(),
      onToggleAimMode: () => {
        this.save.settings.aimMode =
          this.save.settings.aimMode === 'slingshot' ? 'direct' : 'slingshot';
        this.save.settings.aimModeUserSet = true;
        this.audio.playClick();
        this.aimAngleRad = null;
        this.trajectoryDots = [];
        this.trajectoryImpact = null;
        this.trajectorySecondImpact = null;
        this.targetedBlockId = null;
        this.secondTargetedBlockId = null;
        this.aimFeedback = null;
        this.persistSave();
      },
      onToggleSpeed: () => {
        const next = this.loop.getSpeedMultiplier() > 1 ? 1 : 2;
        this.loop.setSpeedMultiplier(next);
        this.audio.playClick();
      },
      onRecall: () => {
        this.audio.playRecall();
        for (const orb of this.orbs) {
          if (orb.alive) {
            this.particles.emitSparks(orb.x, orb.y, 10, '#fde047');
            orb.alive = false;
          }
        }
        for (let i = 0; i < this.coins.length; i++) {
          const c = this.coins[i];
          if (c.alive) {
            c.magnetized = true;
            c.life = Math.min(c.life, 0.45);
          }
        }
        this.pendingVolleyOrbs = 0;
      },
      onOpenShop: () => this.openShop(),
      onOpenAchievements: () => this.openAchievements(false),
      onOpenQuests: () => {
        PlatformSDK.gameplayStop();
        this.stateMachine.transition('SHOP');
        this.audio.playModalOpen();
        this.retentionModals.showDailyQuests(
          this.save,
          this.retention,
          (qId) => {
            const reward = this.retention.claimQuest(this.save, qId);
            if (reward > 0) {
              this.audio.playUpgrade();
              this.persistSave();
              this.retentionModals.hide();
              this.resumeToAiming();
            }
          },
          () => {
            if (this.retention.claimMegaChest(this.save)) {
              this.audio.playUpgrade();
              this.persistSave();
              this.retentionModals.hide();
              this.resumeToAiming();
            }
          },
          () => this.resumeToAiming()
        );
      },
      onOpenDailyLogin: () => {
        PlatformSDK.gameplayStop();
        this.stateMachine.transition('SHOP');
        this.audio.playModalOpen();
        this.retentionModals.showDailyLogin(
          this.save,
          () => {
            if (this.retention.claimDailyLoginReward(this.save, PlatformSDK.getServerTimeMs())) {
              this.audio.playUpgrade();
              this.persistSave();
            }
          },
          () => this.resumeToAiming()
        );
      },
      onOpenElevator: () => {
        PlatformSDK.gameplayStop();
        this.stateMachine.transition('SHOP');
        this.audio.playModalOpen();
        this.retentionModals.showElevator(
          this.save,
          (biomeIdx) => {
            if (this.progression.selectBiome(this.save, biomeIdx)) {
              this.audio.playElevator();
              this.persistSave();
              this.resetShaft();
            }
          },
          () => this.resumeToAiming()
        );
      },
      onTriggerOverdriveAd: async () => {
        const res = await this.monetization.showRewarded('rv_overdrive_trial');
        if (res.rewarded) {
          this.monetization.markOverdriveOffered(this.save.runsCompleted);
          this.save.overdrivePasses += 1;
          this.persistSave();
          this.hud.showToast('Super-Orb Armed!');
        } else {
          this.showAdFailureToast(res.reason);
        }
      },
      onMagPulse: () => this.activateMagPulse(),
      onOverclock: () => this.activateOverclock(),
      onOpenLeaderboard: () => {
        PlatformSDK.submitLeaderboardScore(Math.floor(this.save.maxDepthMeters));
        PlatformSDK.showLeaderboard();
      },
    });

    new DebugOverlay(this.uiRoot, {
      getSave: () => this.save,
      onAddCoins: (amt) => {
        this.save.coins += amt;
        this.save.totalCoinsEarned += amt;
        this.persistSave();
      },
      onUnlockAllBiomes: () => {
        this.save.unlockedBiomeIndex = 5;
        this.persistSave();
      },
      onSimulateOneShotClear: () => this.simulateFinalGateClear(true),
      onSimulateElevatorClear: () => this.simulateFinalGateClear(false),
      onResetSave: () => {
        this.save = createDefaultSave();
        this.persistSave();
        this.resetShaft();
        this.ftue.setVisible(true);
      },
    });
  }

  private setupInput(): void {
    this.input = new InputManager(this.canvas, {
      canAim: () => this.stateMachine.state === 'AIMING',
      isRunning: () => this.stateMachine.state === 'RUNNING',
      getAimMode: () => this.save.settings.aimMode,
      getLauncherPos: () => ({
        x: PHYSICS_CONFIG.SHAFT_WIDTH * 0.5,
        y: PHYSICS_CONFIG.LAUNCHER_Y,
      }),
      clientToWorld: (cx, cy) => this.viewport.clientToWorld(cx, cy, this.cameraY),
      onAimStart: () => {
        this.audio.unlock();
        this.titleOverlay.dismissFloatingIntroBanner();
        if (!this.hasStartedGameplayOnce) {
          this.hasStartedGameplayOnce = true;
          PlatformSDK.gameplayStart();
        }
      },
      onAimUpdate: (angleRad, canceled, feedback) => {
        this.aimFeedback = feedback ?? null;
        if (canceled || angleRad === null) {
          if (feedback?.dragging) {
            this.audio.playAimCancel();
          }
          this.aimAngleRad = null;
          this.trajectoryDots = [];
          this.trajectoryImpact = null;
          this.trajectorySecondImpact = null;
          this.targetedBlockId = null;
          this.secondTargetedBlockId = null;
          this.trajectoryBounceIdx = PHYSICS_CONFIG.TRAJECTORY_DOTS;
          return;
        }
        if (feedback?.dragging) {
          this.audio.playAimTick((angleRad * 180) / Math.PI);
        }
        this.aimAngleRad = angleRad;
        const orbR = this.economy.getEffectiveOrbRadius(this.save);
        const muzzle = getMuzzlePosition(
          PHYSICS_CONFIG.SHAFT_WIDTH * 0.5,
          PHYSICS_CONFIG.LAUNCHER_Y,
          angleRad
        );
        const preview = this.physics.computeTrajectoryPreview(
          muzzle.x,
          muzzle.y,
          angleRad,
          orbR,
          this.entities
        );
        this.trajectoryDots = preview.dots;
        this.trajectoryImpact = preview.impactPoint;
        this.trajectorySecondImpact = preview.secondImpactPoint;
        this.targetedBlockId = preview.impactBlockId;
        this.secondTargetedBlockId = preview.secondImpactBlockId;
        this.trajectoryBounceIdx = preview.bounceStartIdx;
      },
      onLaunch: (angleRad) => {
        if (!this.save.ftueDone) {
          this.save.ftueDone = true;
          this.ftue.setVisible(false);
        }
        this.launchVolley(angleRad);
      },
      onActiveMagPulse: () => this.activateMagPulse(),
      onActiveOverclock: () => this.activateOverclock(),
      onQuickRelaunch: () => {
        if (this.stateMachine.state === 'RUN_SUMMARY') {
          this.summary.hide();
          this.prepareNextRun();
        }
      },
      onToggleMute: () => {
        this.audio.unlock();
        this.save.settings.muted = this.audio.toggleMute();
        this.persistSave();
      },
      onTogglePause: () => this.togglePause(),
      onBuyUpgradeSlot: (slotIndex) => {
        if (this.stateMachine.state !== 'SHOP') return;
        const spec = UPGRADES[slotIndex];
        if (spec) {
          if (this.economy.buyUpgrade(this.save, spec.id)) {
            this.audio.playUpgrade();
            this.persistSave();
          } else {
            this.audio.playError();
          }
        }
      },
    });
  }

  private spawnCoinDrop(x: number, y: number, value: number): void {
    const slot = this.coins[this.coinCursor];
    this.coinCursor = (this.coinCursor + 1) % COIN_POOL_SIZE;
    slot.x = x;
    slot.y = y;
    slot.vx = (Math.random() - 0.5) * 140;
    slot.vy = -140 - Math.random() * 80;
    slot.value = value;
    slot.life = 0.7;
    slot.magnetized = true;
    slot.alive = true;
  }

  private setupPhysicsEvents(): void {
    this.physics.setEvents({
      onWallHit: (orb, x, y) => {
        this.audio.playWallHit(Math.hypot(orb.vx, orb.vy), x);
        this.particles.emitSparks(x, y, 5, '#38bdf8');
      },
      onBlockHit: (orb, block, _dmg, cleaved, meta) => {
        const cx = block.x + block.width * 0.5;
        const cy = block.y + block.height * 0.5;
        const mat = this.toSfxMaterial(block);
        if (block.kind === 'boss_armor') {
          this.audio.playArmorClang(cx);
        } else if (!meta?.willKill && !meta?.critFired) {
          this.audio.playHit(
            orb.comboCount,
            cleaved,
            mat,
            Math.hypot(orb.vx, orb.vy),
            cx
          );
        }
        if (cleaved) {
          this.particles.emitSparks(cx, cy, 10, '#fde047');
        } else {
          this.particles.emitRockShards(cx, cy, 6, block.kind === 'frost' ? '#bae6fd' : '#e2e8f0');
        }
        this.juice.triggerShake(cleaved ? 3.5 : 1.8);
        if (cleaved) {
          this.floatingText.spawn(cx, cy - 12, 'CLEAVE!', '#38bdf8', 1.05);
        }
        if (orb.comboCount > this.runMaxCombo) {
          this.runMaxCombo = orb.comboCount;
        }
        if (orb.comboCount > this.save.stats.maxBounceCombo) {
          this.save.stats.maxBounceCombo = orb.comboCount;
        }
      },
      onBlockDestroyed: (block, coins, isTnt, isVault) => {
        const cx = block.x + block.width * 0.5;
        const cy = block.y + block.height * 0.5;
        this.runCoins += coins;
        this.runBlocksSmashed += 1;
        this.save.coins += coins;
        this.save.totalCoinsEarned += coins;
        this.save.stats.blocksDestroyed += 1;
        this.retention.recordQuestProgress(this.save, 'blocksDestroyed', 1);
        if (!isTnt) {
          this.audio.playCrunch(this.toSfxMaterial(block), cx);
          const chunkKind: ChunkSpriteKey =
            block.kind === 'ore'
              ? 'gold'
              : block.kind === 'frost' || block.biomeIndex === 1 || block.biomeIndex === 3
              ? 'crystal'
              : block.biomeIndex === 2
              ? 'ember'
              : block.col % 2 === 0
              ? 'sandstone'
              : 'slate';
          this.particles.emitRockShards(
            cx,
            cy,
            8,
            block.kind === 'ore' ? '#fbbf24' : block.kind === 'frost' ? '#7dd3fc' : '#cbd5e1',
            chunkKind
          );
          this.particles.emitSmokePuff(cx, cy, 3, '#64748b');
        } else {
          this.particles.emitRockShards(cx, cy, 6, '#fb923c', 'tnt_plank');
        }

        if (this.overclockTimerS <= 0 && this.overclockCharges === 0) {
          this.overclockBreakCounter++;
          if (this.overclockBreakCounter >= SKILL_CONFIG.OVERCLOCK_BREAKS_PER_RECHARGE) {
            this.overclockBreakCounter = 0;
            this.overclockCharges = 1;
            this.audio.playOverclockReady();
            this.floatingText.spawn(cx, cy - 22, 'OVERCLOCK READY!', '#22d3ee', 1.15);
          }
        }

        if (block.kind === 'boss_core') {
          this.audio.duck(200, 0.72);
        }

        if (isTnt) {
          this.runTntCount += 1;
          this.save.stats.tntDetonated += 1;
          this.retention.recordQuestProgress(this.save, 'tntDetonated', 1);
        }
        if (isVault) {
          this.save.stats.vaultsBroken += 1;
          this.save.shards += 1;
          this.retention.recordQuestProgress(this.save, 'vaultsBroken', 1);
          this.audio.playFanfare();
          this.juice.triggerHitStop(0.04);
          this.floatingText.spawn(cx, cy - 18, '+1 SHARD!', '#e879f9', 1.25);
          PlatformSDK.happytime();
          this.openPerkDraft('vault');
        }

        if (coins > 0) {
          this.audio.playCoin(cx);
          this.floatingText.spawn(cx, cy, `+${formatCompact(coins)}`, '#fbbf24', 1);
          this.spawnCoinDrop(cx, cy, coins);
        }
      },
      onTntExplode: (x, y, radius) => {
        this.audio.playExplosion(x);
        if (this.runTntCount >= 2) {
          this.audio.duck(350, 0.55);
        }
        this.juice.triggerHitStop(0.035);
        this.juice.triggerShake(7.5);
        this.juice.triggerVignette(0.35);
        this.juice.addShockwave(x, y, radius, '#fb923c');
        this.particles.emitSparks(x, y, 16, '#fde047');
        this.particles.emitAdditiveSprite(x, y, 'tnt_fireball', '#fb923c', radius * 1.4, 0.34);
        this.particles.emitAdditiveSprite(x, y, 'shockwave_ring', '#fde047', radius * 1.65, 0.36);
        this.particles.emitRockShards(x, y, 10, '#fb923c', 'tnt_plank');
        this.particles.emitSmokePuff(x, y, 6, '#334155');
      },
      onPickupCollected: (_orb, pickup) => {
        const cx = pickup.x + pickup.width * 0.5;
        const cy = pickup.y + pickup.height * 0.5;
        this.particles.emitAdditiveSprite(cx, cy, 'spark_star', '#38bdf8', 56, 0.28);
        if (pickup.kind === 'pickup_split') {
          this.audio.playPickup('split', cx);
          this.floatingText.spawn(cx, cy - 8, '+SPLIT ORB!', '#22d3ee', 1.2);
        } else if (pickup.kind === 'pickup_magnet') {
          this.audio.playPickup('magnet', cx);
          for (let i = 0; i < this.coins.length; i++) {
            if (this.coins[i].alive) this.coins[i].magnetized = true;
          }
          this.floatingText.spawn(cx, cy - 8, 'MAGNET COIL!', '#fde047', 1.2);
        } else if (pickup.kind === 'pickup_overclock') {
          this.audio.playPickup('overclock', cx);
          this.overclockCharges = Math.min(2, this.overclockCharges + 1);
          this.activateOverclock();
          this.floatingText.spawn(cx, cy - 8, 'OVERCLOCK BATTERY!', '#fb923c', 1.25);
        }
      },
      onLightningArc: (x1, y1, x2, y2) => {
        this.audio.playLightning();
        this.lightningArcs.push({ x1, y1, x2, y2, alpha: 1 });
      },
      onBlockCrit: (block, dmg) => {
        const cx = block.x + block.width * 0.5;
        const cy = block.y + block.height * 0.5;
        this.audio.playCritHit(false, cx);
        this.floatingText.spawn(cx, cy - 16, `CRIT ${formatCompact(Math.round(dmg))}!`, '#fde047', 1.15);
      },
      onBossWeakPointHit: (block) => {
        const cx = block.x + block.width * 0.5;
        const cy = block.y + block.height * 0.5;
        this.audio.playCritHit(true, cx);
        this.floatingText.spawn(cx, cy - 18, '2.0x WEAK POINT!', '#fde047', 1.2);
        this.particles.emitAdditiveSprite(cx, cy, 'spark_star', '#fde047', 64, 0.3);
      },
      onDroneShot: (x) => {
        this.audio.playDroneShot(x);
      },
      onBossShardHit: (shard) => {
        this.audio.playHit(0, false, 'boss_shard', 900, shard.x + shard.width * 0.5);
      },
      onBossShardSalvaged: (shard) => {
        this.audio.playBossShardSalvage(shard.x + shard.width * 0.5);
      },
      onPassiveProc: (passive, x) => {
        this.audio.playPassiveCue(passive, x);
      },
      onOrbExpired: () => {
        this.audio.playOrbExpired();
      },
      onBumperHit: (orb, bumper, coins) => {
        const cx = bumper.x + bumper.width * 0.5;
        const cy = bumper.y + bumper.height * 0.5;
        this.audio.playBumper(orb.comboCount, cx);
        this.save.stats.bumpersHit += 1;
        this.retention.recordQuestProgress(this.save, 'bumpersHit', 1);
        this.runCoins += coins;
        this.save.coins += coins;
        this.save.totalCoinsEarned += coins;
        this.floatingText.spawn(cx, cy - 10, '+2 BOUNCE', '#22d3ee', 1.1);
        this.particles.emitSparks(cx, cy, 10, '#e879f9');
      },
      onLaserFire: (rowY) => {
        this.audio.playLaserBeam(PHYSICS_CONFIG.SHAFT_WIDTH * 0.5);
        this.juice.addLaserBeam(rowY, '#fef08a');
        this.juice.triggerShake(4.5);
      },
      onPortalWarp: (_orb, from, to) => {
        this.audio.playPortalWarp(to.x + 28);
        this.particles.emitBurst(from.x + 28, from.y + 28, 10, '#a3e635', 60, 180, 4, 0.35);
        this.particles.emitBurst(to.x + 28, to.y + 28, 10, '#f43f5e', 60, 180, 4, 0.35);
        this.floatingText.spawn(to.x + 28, to.y, '+2 WARP!', '#a3e635', 1.15);
      },
      onBossCoreDamaged: (biomeIndex, coreIndex, hpLeft) => {
        this.progression.recordBossCoreDamage(this.save, biomeIndex, coreIndex, hpLeft);
      },
      onBossGateBroken: (biomeIndex) => {
        if (biomeIndex >= ASCENSION_CONFIG.FINAL_BIOME_INDEX) {
          this.clearedBiome6ThisRun = true;
          const res = this.progression.completeFinalGateClear(
            this.save,
            this.isFullShaftRun,
            {
              blocksSmashed: this.runBlocksSmashed,
              maxCombo: this.runMaxCombo,
              timestamp: PlatformSDK.getServerTimeMs(),
            }
          );
          if (res.ascended) {
            this.audio.playVictoryFanfare();
            this.juice.triggerHitStop(0.06);
            this.juice.triggerShake(10);
            PlatformSDK.happytime();
            const midX = PHYSICS_CONFIG.SHAFT_WIDTH * 0.5;
            const midY = this.cameraY + 240;
            this.particles.emitBurst(midX, midY, 50, '#fde047', 120, 440, 6, 1.3);
            this.particles.emitBurst(midX - 70, midY - 30, 40, '#f59e0b', 110, 400, 5.5, 1.25);
            this.particles.emitBurst(midX + 70, midY - 30, 40, '#fffbeb', 110, 400, 5, 1.2);
            this.particles.emitBurst(midX, midY - 60, 25, '#38bdf8', 90, 360, 5, 1.15);
            this.pendingVictoryTier = res.newTier;
            this.victorySlowMoTimer = 0.45;
          } else {
            this.audio.playFanfare();
            this.juice.triggerHitStop(0.05);
            this.juice.triggerShake(8);
            PlatformSDK.happytime();
            this.hud.showToast(i18n.t('elevator_clear_title'));
          }
          this.persistSave();
          return;
        }

        this.audio.playFanfare();
        this.juice.triggerHitStop(0.05);
        this.juice.triggerShake(8);
        PlatformSDK.happytime();
        const unlockedBiome = this.progression.unlockNextBiome(this.save, biomeIndex);
        this.generator.updateOptions({ unlockedBiomeIndex: this.save.unlockedBiomeIndex });
        const newlyUnlockedIds = this.skins.checkAndUnlockEligibleSkins(this.save);
        const unlockedSkinNames = newlyUnlockedIds.map((id) => {
          const sk = this.skins.getEquippedSkin({ ...this.save, equippedSkin: id });
          return i18n.t(sk.nameKey as TranslationKey);
        });
        if (unlockedBiome) {
          this.pendingBiomeUnlock = {
            biomeIndex: this.save.unlockedBiomeIndex,
            unlockedSkinNames,
          };
          this.hud.showToast(i18n.t('biome_unlocked_title'));
          this.openPerkDraft('boss');
        }
        this.persistSave();
      },
    });
  }

  private toSfxMaterial(block: BlockEntity): SfxMaterial {
    if (block.kind === 'strata' && block.biomeIndex === 1) return 'crystal';
    switch (block.kind) {
      case 'granite':
      case 'ore':
      case 'frost':
      case 'boss_core':
      case 'boss_armor':
      case 'boss_shard':
      case 'tnt':
      case 'vault':
      case 'splitter':
      case 'laser':
        return block.kind;
      default:
        return 'strata';
    }
  }

  private getPhysicsModifiers() {
    const skin = this.skins.getEquippedSkin(this.save);
    return {
      bladePassive: skin.passiveId,
      overclockActive: this.overclockTimerS > 0,
      artifactStacks: this.artifacts.getAllStacks(),
      relicPotencyMult: this.economy.getRelicPotencyMult(this.save),
      activeWeakPointCoreIndex: this.activeWeakPointCoreIndex,
    };
  }

  private activateMagPulse(): void {
    if (this.stateMachine.state !== 'RUNNING') return;
    if (this.magPulseCooldownS > 0) {
      this.audio.playError();
      return;
    }
    this.magPulseCooldownS = this.economy.getMagPulseCooldownS(this.save);
    this.audio.playMagPulse();
    this.juice.triggerShake(5);
    const pulses = this.physics.triggerMagPulseSlam(
      this.orbs,
      this.entities,
      this.coins,
      this.save.upgrades.orevalue,
      this.save.upgrades.orbsize,
      this.save.prestigeLevel,
      this.save.ascensionTier,
      this.getPhysicsModifiers()
    );
    for (const p of pulses) {
      this.magPulseShockwaves.push({
        x: p.x,
        y: p.y,
        radius: 26,
        maxRadius: p.radius,
        alpha: 1,
      });
    }
  }

  private activateOverclock(): void {
    if (this.stateMachine.state !== 'RUNNING') return;
    if (this.overclockTimerS > 0 || this.overclockCharges <= 0) {
      this.audio.playError();
      return;
    }
    this.overclockCharges -= 1;
    const surgeStacks = this.artifacts.getStack('overclock_surge');
    this.overclockTimerS = this.economy.getOverclockDurationS(this.save, surgeStacks);
    this.audio.playOverclock();
    this.juice.triggerShake(4.5);
    if (surgeStacks > 0) {
      this.magPulseCooldownS = 0;
      this.activateMagPulse();
    }
  }

  private openPerkDraft(source: 'vault' | 'boss'): void {
    if (this.stateMachine.state !== 'RUNNING') return;
    const choices = this.artifacts.rollDraftChoices(3);
    if (choices.length === 0) return;
    this.audio.playPerkOpen(source === 'vault' ? 180 : 0);
    this.stateMachine.transition('PERK_DRAFT');
    this.perkDraftModal.show({
      choices,
      currentStacks: this.artifacts.getAllStacks(),
      source,
      onSelect: (id: ArtifactId) => {
        this.artifacts.addArtifact(id);
        this.audio.playPerkSelect();
        this.stateMachine.transition('RUNNING');
        const hasAliveOrb = this.orbs.some((o) => o.alive);
        if (!hasAliveOrb && this.pendingVolleyOrbs <= 0 && this.victorySlowMoTimer <= 0) {
          this.finishRun();
        }
      },
    });
  }

  private resetShaft(): void {
    this.entities = [];
    this.orbs.length = 0;
    this.artifacts.resetRun();
    this.magPulseShockwaves.length = 0;
    this.lightningArcs.length = 0;
    for (let i = 0; i < COIN_POOL_SIZE; i++) {
      this.coins[i].alive = false;
    }
    this.cameraY = 0;
    this.drone.y = 120;
    this.particles.clear();
    this.floatingText.clear();
    this.juice.clear();

    this.generator.reset({
      baseRowOffset: this.progression.getBaseRowOffset(this.save),
      luckLevel: this.save.upgrades.luck,
      bossGateHpByBiome: this.save.bossGateHpByBiome,
      unlockedBiomeIndex: this.save.unlockedBiomeIndex,
      ascensionTier: this.save.ascensionTier,
    });
    this.generator.ensureChunksUpToRow(24, this.entities);
  }

  private launchVolley(angleRad: number): void {
    this.audio.playLaunch();
    this.aimFeedback = null;
    this.aimAngleRad = null;
    this.trajectoryDots = [];
    this.trajectoryImpact = null;
    this.trajectorySecondImpact = null;
    this.stateMachine.transition('RUNNING');
    this.loop.setSpeedMultiplier(1);
    this.runCoins = 0;
    this.runStartBestDepthM = this.save.maxDepthMeters;
    const selectedStartDepth = this.progression.getSelectedBiome(this.save).startDepthM;
    this.runMaxDepthM = selectedStartDepth;
    this.runElapsedS = 0;
    this.isFullShaftRun = selectedStartDepth === 0;
    this.runBlocksSmashed = 0;
    this.runMaxCombo = 0;
    this.runTntCount = 0;
    this.clearedBiome6ThisRun = false;
    this.victorySlowMoTimer = 0;
    this.pendingVictoryTier = null;
    this.magPulseCooldownS = 0;
    this.overclockCharges = 1;
    this.overclockTimerS = 0;
    this.overclockBreakCounter = 0;
    this.weakPointTimerS = 0;
    this.bossShardTimerS = 0;

    if (this.save.overdrivePasses > 0) {
      this.save.overdrivePasses -= 1;
      this.isOverdriveRun = true;
    } else {
      this.isOverdriveRun = false;
    }

    const totalOrbs = this.economy.getEffectiveMultiOrbCount(this.save);
    this.volleyAngleRad = angleRad;
    this.pendingVolleyOrbs = totalOrbs - 1;
    this.volleyTimerS = 0;
    this.volleySpawnIndex = 0;
    this.spawnLauncherOrb(angleRad, false);
  }

  private spawnLauncherOrb(angleRad: number, isVolleyFollowup: boolean = true): void {
    if (isVolleyFollowup) {
      this.volleySpawnIndex++;
      this.audio.playLaunchVolleyOrb(this.volleySpawnIndex);
    }
    this.turretRecoil = 1;
    const baseR = this.economy.getEffectiveOrbRadius(this.save);
    const radius = this.isOverdriveRun ? baseR * 1.4 : baseR;
    const bounces = this.economy.getEffectiveMaxBounces(this.save);
    const damage = this.economy.getEffectiveDrillDamage(this.save) * (this.isOverdriveRun ? 1.5 : 1);
    const muzzle = getMuzzlePosition(
      PHYSICS_CONFIG.SHAFT_WIDTH * 0.5,
      PHYSICS_CONFIG.LAUNCHER_Y,
      angleRad
    );
    this.particles.emitDirectionalBurst(
      muzzle.x,
      muzzle.y,
      angleRad,
      0.45,
      9,
      '#fde047',
      160,
      340,
      3.6,
      0.24,
      'spark',
      true
    );

    const orb = this.physics.createOrb(
      muzzle.x,
      muzzle.y,
      angleRad,
      radius,
      bounces,
      damage,
      false,
      this.isOverdriveRun
    );
    this.orbs.push(orb);
  }

  private syncMusicStateIfChanged(): void {
    const selectedBiome = this.progression.getSelectedBiome(this.save);
    const viewDepth =
      selectedBiome.startDepthM +
      (this.cameraY / PHYSICS_CONFIG.TILE_SIZE) * PHYSICS_CONFIG.METERS_PER_ROW;
    const activeBiome = BiomeTheme.getBiomeAtDepth(viewDepth);
    const st = this.stateMachine.state;
    if (
      activeBiome.index === this.lastMusicBiomeIdx &&
      st === this.lastMusicState &&
      this.bossActiveForAudio === this.lastMusicBoss
    ) {
      return;
    }
    this.lastMusicBiomeIdx = activeBiome.index;
    this.lastMusicState = st;
    this.lastMusicBoss = this.bossActiveForAudio;
    this.audio.updateMusicState(activeBiome.index, st, this.bossActiveForAudio);
  }

  private fixedUpdate(dt: number): void {
    this.monetization.updateSessionTime(dt);
    this.timeS += dt;
    if (this.turretRecoil > 0) {
      this.turretRecoil = Math.max(0, this.turretRecoil - dt * 8);
    }

    this.syncMusicStateIfChanged();

    if (this.stateMachine.state !== 'RUNNING') return;

    this.runElapsedS += dt;
    if (this.juice.consumeHitStop(dt)) {
      this.juice.update(dt);
      return;
    }

    let simDt = dt;
    if (this.victorySlowMoTimer > 0) {
      this.victorySlowMoTimer = Math.max(0, this.victorySlowMoTimer - dt);
      simDt = dt * 0.3;
    }

    if (this.pendingVolleyOrbs > 0) {
      this.volleyTimerS += simDt;
      if (this.volleyTimerS >= PHYSICS_CONFIG.MULTI_ORB_INTERVAL_S) {
        this.volleyTimerS -= PHYSICS_CONFIG.MULTI_ORB_INTERVAL_S;
        this.pendingVolleyOrbs--;
        this.spawnLauncherOrb(this.volleyAngleRad);
      }
    }

    if (this.magPulseCooldownS > 0) {
      this.magPulseCooldownS = Math.max(0, this.magPulseCooldownS - simDt);
    }
    if (this.overclockTimerS > 0) {
      this.overclockTimerS = Math.max(0, this.overclockTimerS - simDt);
    }

    // Update active Mag-Pulse shockwaves & Lightning Arc fades
    for (let i = this.magPulseShockwaves.length - 1; i >= 0; i--) {
      const w = this.magPulseShockwaves[i];
      w.radius += (w.maxRadius - w.radius) * Math.min(1, simDt * 12);
      w.alpha -= simDt * 3.1;
      if (w.alpha <= 0) this.magPulseShockwaves.splice(i, 1);
    }
    for (let i = this.lightningArcs.length - 1; i >= 0; i--) {
      this.lightningArcs[i].alpha -= simDt * 5.2;
      if (this.lightningArcs[i].alpha <= 0) this.lightningArcs.splice(i, 1);
    }

    // Multi-Phase Boss: cycle 2.0x Weak-Point reticle & spawn Phase 2 Boss Shards < 50% HP
    const activeBiomeIdx = this.progression.getSelectedBiome(this.save).index;
    const aliveCores: BlockEntity[] = [];
    let bossTotalMax = 0;
    let bossTotalHp = 0;
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.kind === 'boss_core' && e.biomeIndex === activeBiomeIdx) {
        bossTotalMax += e.maxHp;
        if (e.alive) {
          aliveCores.push(e);
          bossTotalHp += e.hp;
        }
      }
    }
    const wasPhase2 = this.bossPhase2Active;
    this.bossPhase2Active =
      bossTotalMax > 0 &&
      aliveCores.length > 0 &&
      bossTotalHp / bossTotalMax <= SKILL_CONFIG.BOSS_PHASE2_HP_RATIO;
    if (!wasPhase2 && this.bossPhase2Active) {
      this.audio.playBossPhase2();
    }

    if (aliveCores.length > 0) {
      this.weakPointTimerS += simDt;
      if (
        this.weakPointTimerS >= SKILL_CONFIG.BOSS_WEAKPOINT_CYCLE_S ||
        !aliveCores.some((c) => c.bossCoreIndex === this.activeWeakPointCoreIndex)
      ) {
        this.weakPointTimerS = 0;
        const pick = aliveCores[Math.floor(this.timeS * 2) % aliveCores.length];
        const nextCoreIdx = pick.bossCoreIndex ?? 0;
        if (nextCoreIdx !== this.activeWeakPointCoreIndex) {
          this.activeWeakPointCoreIndex = nextCoreIdx;
          this.audio.playWeakPointLock();
        }
      }

      if (this.bossPhase2Active) {
        this.bossShardTimerS += simDt;
        if (this.bossShardTimerS >= SKILL_CONFIG.BOSS_SHARD_INTERVAL_S) {
          this.bossShardTimerS = 0;
          const src = aliveCores[0];
          const shard = this.generator['createBlock']
            ? (this.generator as unknown as {
                createBlock: (k: 'boss_shard', c: number, r: number, d: number, b: number) => BlockEntity;
              }).createBlock('boss_shard', src.col, Math.max(2, src.row - 1), src.depthMeters, src.biomeIndex)
            : null;
          if (shard) {
            shard.width = 30;
            shard.height = 30;
            shard.radius = 15;
            shard.x = src.x + src.width * 0.5 - 15;
            shard.y = src.y - 20;
            shard.vy = -135;
            this.entities.push(shard);
            this.audio.playBossShardSpawn();
          }
        }
      }
    }

    const modifiers = this.getPhysicsModifiers();
    this.physics.step(
      simDt,
      this.orbs,
      this.entities,
      this.save.upgrades.orevalue,
      this.save.upgrades.orbsize,
      this.save.prestigeLevel,
      this.save.ascensionTier,
      modifiers
    );

    const droneStats = this.economy.getDroneStats(this.save);
    this.physics.stepCompanionDrone(
      simDt,
      this.drone,
      this.entities,
      this.coins,
      this.cameraY,
      droneStats,
      this.save.upgrades.orevalue,
      this.save.upgrades.orbsize,
      this.save.prestigeLevel,
      this.save.ascensionTier,
      modifiers
    );

    // Track deepest orb & generate chunks ahead
    let lowestY = 0;
    let anyAlive = false;
    for (const orb of this.orbs) {
      if (!orb.alive) continue;
      anyAlive = true;
      if (orb.y > lowestY) lowestY = orb.y;
    }

    if (anyAlive) {
      const targetCamY = Math.max(0, lowestY - PHYSICS_CONFIG.CAMERA_LOOKAHEAD_Y);
      this.cameraY += (targetCamY - this.cameraY) * Math.min(1, dt * 6);
      const bottomRow = Math.ceil((this.cameraY + 1200) / PHYSICS_CONFIG.TILE_SIZE);
      this.generator.ensureChunksUpToRow(bottomRow, this.entities);

      const baseDepth = this.progression.getSelectedBiome(this.save).startDepthM;
      const orbDepth = baseDepth + (lowestY / PHYSICS_CONFIG.TILE_SIZE) * PHYSICS_CONFIG.METERS_PER_ROW;
      if (orbDepth > this.runMaxDepthM) {
        this.runMaxDepthM = orbDepth;
      }
      if (orbDepth > this.save.maxDepthMeters) {
        this.save.maxDepthMeters = orbDepth;
      }
    }

    // Update coins (fountain pop -> magnetic wake / passive orb vacuum -> top-left coin HUD pill)
    const wakeStacks = this.artifacts.getStack('magnetic_wake');
    const passiveMagnetBoost =
      this.skins.getEquippedSkin(this.save).passiveId === 'midas_magnetism' ? 1.4 : 1.0;
    const orbMagnetR = (58 + wakeStacks * 55) * passiveMagnetBoost;
    const orbMagnetRSq = orbMagnetR * orbMagnetR;

    const magnetTargetX = 56;
    const magnetTargetY = this.cameraY + 26;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (!c.alive) continue;
      if (!c.magnetized) {
        for (let k = 0; k < this.orbs.length; k++) {
          const o = this.orbs[k];
          if (!o.alive) continue;
          const dx = o.x - c.x;
          const dy = o.y - c.y;
          if (dx * dx + dy * dy <= orbMagnetRSq) {
            c.magnetized = true;
            break;
          }
        }
      }
      c.life -= dt;
      if (c.life <= 0) {
        c.alive = false;
        continue;
      }
      if (c.magnetized && c.life <= 0.48) {
        const dx = magnetTargetX - c.x;
        const dy = magnetTargetY - c.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 22) {
          c.alive = false;
          this.particles.emitBurst(c.x, c.y, 2, '#fde047', 20, 60, 2.5, 0.16);
          continue;
        }
        const pullT = Math.min(1, dt * 16);
        const targetVx = (dx / dist) * 1150;
        const targetVy = (dy / dist) * 1150;
        c.vx += (targetVx - c.vx) * pullT;
        c.vy += (targetVy - c.vy) * pullT;
      } else {
        c.vy += 520 * dt;
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }

    this.particles.update(simDt);
    this.floatingText.update(simDt);
    this.juice.update(simDt);

    if (
      (this.pendingVictoryTier !== null && this.victorySlowMoTimer <= 0) ||
      (!anyAlive && this.pendingVolleyOrbs <= 0 && this.victorySlowMoTimer <= 0)
    ) {
      this.finishRun();
    }
  }

  private finishRun(): void {
    this.loop.setSpeedMultiplier(1);
    PlatformSDK.gameplayStop();
    this.save.runsCompleted += 1;
    this.save.stats.runsCompleted += 1;
    this.retention.recordQuestProgress(this.save, 'runsCompleted', 1);

    this.save.recentRunEarnings.push(this.runCoins);
    if (this.save.recentRunEarnings.length > 3) {
      this.save.recentRunEarnings.shift();
    }
    const mins = Math.max(0.25, this.runElapsedS / 60);
    this.save.recentRunCoinsPerMin = Math.max(40, Math.round(this.runCoins / mins));
    this.save.lastActiveTimestamp = PlatformSDK.getServerTimeMs();

    this.progression.checkMasteryFeats(this.save, {
      blocksSmashed: this.runBlocksSmashed,
      maxCombo: this.runMaxCombo,
      tntChainMax: this.runTntCount,
      maxDepthMeters: this.runMaxDepthM,
      isFullShaftRun: this.isFullShaftRun,
    });
    this.skins.checkAndUnlockEligibleSkins(this.save);
    PlatformSDK.submitLeaderboardScore(Math.floor(this.save.maxDepthMeters));
    this.persistSave();

    if (this.pendingVictoryTier !== null) {
      const victoryTier = this.pendingVictoryTier;
      this.pendingVictoryTier = null;
      this.stateMachine.transition('ASCENSION_VICTORY');
      this.victoryModal.show({
        newTier: victoryTier,
        blocksSmashed: this.runBlocksSmashed,
        maxCombo: this.runMaxCombo,
        coinsEarned: this.runCoins,
        onDescendNextTier: () => {
          this.progression.selectBiome(this.save, 0);
          this.persistSave();
          this.resetShaft();
          this.resumeToAiming();
        },
        onOpenUpgrades: () => {
          this.openShop('upgrades', false);
        },
        onDoubleVictoryCoins: async () => {
          const res = await this.monetization.showRewarded('rv_double_run');
          if (res.rewarded) {
            this.save.coins += this.runCoins;
            this.save.totalCoinsEarned += this.runCoins;
            this.persistSave();
            return true;
          }
          this.showAdFailureToast(res.reason);
          return false;
        },
      });
      return;
    }

    this.stateMachine.transition('RUN_SUMMARY');

    const hasCriticalTarget = this.entities.some(
      (e) =>
        e.alive &&
        (e.kind === 'vault' || e.kind === 'boss_core') &&
        e.hp / e.maxHp <= AD_CONFIG.RV_EXTRA_LAUNCH_HP_THRESHOLD
    );
    const showDouble =
      PlatformSDK.canShowRewardedAds() &&
      this.monetization.canOfferDoubleRun(this.save, this.runCoins);
    if (showDouble) {
      this.monetization.markDoubleRunOffered(this.save.runsCompleted);
    }
    this.skipNextMidgameBreak =
      !PlatformSDK.canShowRewardedAds() || showDouble || hasCriticalTarget;

    const affordableCount = UPGRADES.filter((u) => this.economy.canAfford(this.save, u.id)).length;
    const showSummary = () => {
      this.summary.show({
        coinsEarned: this.runCoins,
        maxDepthMeters: this.runMaxDepthM,
        isNewBest: this.runMaxDepthM > this.runStartBestDepthM && this.runMaxDepthM > 5,
        affordableUpgradeCount: affordableCount,
        showDoubleAd: showDouble,
        showExtraLaunchAd: hasCriticalTarget,
        clearedBiome6ViaElevator: this.clearedBiome6ThisRun && !this.isFullShaftRun,
        currentAscensionTier: this.save.ascensionTier,
        onRelaunch: () => this.prepareNextRun(),
        onOpenShop: () => this.openShop(),
        onStartZeroMeterRun: () => {
          this.progression.selectBiome(this.save, 0);
          this.persistSave();
          this.resetShaft();
          this.resumeToAiming();
        },
        onDoubleAd: async () => {
          const res = await this.monetization.showRewarded('rv_double_run');
          if (res.rewarded) {
            this.save.coins += this.runCoins;
            this.save.totalCoinsEarned += this.runCoins;
            this.persistSave();
            this.summary.hide();
            this.prepareNextRun();
          } else {
            this.showAdFailureToast(res.reason);
          }
        },
        onExtraLaunchAd: async () => {
          const res = await this.monetization.showRewarded('rv_extra_launch');
          if (res.rewarded) {
            this.summary.hide();
            this.cameraY = 0;
            this.resumeToAiming();
          } else {
            this.showAdFailureToast(res.reason);
          }
        },
      });
    };

    const unlockData = this.pendingBiomeUnlock;
    this.pendingBiomeUnlock = null;
    if (unlockData) {
      const unlockedSpec = BIOMES[unlockData.biomeIndex];
      if (unlockedSpec) {
        this.audio.playBiomeUnlock();
        this.retentionModals.showBiomeUnlockModal(
          i18n.t(unlockedSpec.nameKey as TranslationKey),
          unlockedSpec.coinMultiplier,
          unlockData.unlockedSkinNames,
          showSummary
        );
        return;
      }
    }
    showSummary();
  }

  private async prepareNextRun(): Promise<void> {
    PlatformSDK.clearAllBanners();
    const shouldTryMidgame =
      !this.skipNextMidgameBreak &&
      PlatformSDK.canShowRewardedAds() &&
      this.monetization.canShowMidgameAd();
    this.skipNextMidgameBreak = false;
    if (shouldTryMidgame) {
      this.hud.showToast(i18n.t('short_break'), 500);
      await new Promise((r) => setTimeout(r, AD_CONFIG.PRE_AD_CUE_S * 1000));
      await this.monetization.tryShowMidgameAd();
    }
    this.resetShaft();
    this.resumeToAiming();
  }

  private openShop(initialTab: 'upgrades' | 'skins' = 'upgrades', returnToTitle: boolean = false): void {
    this.titleOverlay.dismissFloatingIntroBanner();
    PlatformSDK.gameplayStop();
    this.stateMachine.transition('SHOP');
    this.audio.playModalOpen();
    const freeCandidate = this.monetization.canOfferFreeUpgrade(this.save.runsCompleted)
      ? this.economy.getCheapestNearlyAffordableUpgrade(
          this.save,
          AD_CONFIG.RV_FREE_UPGRADE_MIN_GAP,
          AD_CONFIG.RV_FREE_UPGRADE_MAX_GAP
        )
      : null;

    const refresh = () => {
      this.shop.render(
        this.save,
        this.economy,
        this.skins,
        this.progression,
        freeCandidate,
        shopCallbacks
      );
    };

    const shopCallbacks = {
      onBuyUpgrade: (id: UpgradeId) => {
        if (this.economy.buyUpgrade(this.save, id)) {
          this.audio.playUpgrade();
          this.persistSave();
          refresh();
        }
      },
      onFreeUpgradeAd: async (id: UpgradeId) => {
        const res = await this.monetization.showRewarded('rv_free_upgrade');
        if (res.rewarded) {
          this.monetization.markFreeUpgradeOffered(this.save.runsCompleted);
          this.economy.grantFreeUpgrade(this.save, id);
          this.audio.playUpgrade();
          this.persistSave();
          refresh();
        } else {
          this.showAdFailureToast(res.reason);
        }
      },
      onEquipSkin: (skinId: string) => {
        if (this.skins.equipSkin(this.save, skinId)) {
          this.audio.playClick();
          this.persistSave();
          refresh();
        }
      },
      onUnlockSkinCoins: (skinId: string) => {
        if (this.skins.unlockWithCoins(this.save, skinId)) {
          this.audio.playUpgrade();
          this.persistSave();
          refresh();
        }
      },
      onUnlockSkinAd: async (skinId: string) => {
        const res = await this.monetization.showRewarded('rv_skin_progress');
        if (res.rewarded) {
          this.skins.addRvProgress(this.save, skinId);
          this.audio.playUpgrade();
          this.persistSave();
          refresh();
        } else {
          this.showAdFailureToast(res.reason);
        }
      },
      onPrestige: () => {
        if (this.progression.triggerPrestige(this.save)) {
          this.audio.playUpgrade();
          this.persistSave();
          this.shop.close();
          this.resetShaft();
          this.stateMachine.transition('AIMING');
        }
      },
      onClose: () => {
        this.resetShaft();
        if (returnToTitle) {
          this.stateMachine.transition('TITLE');
          this.showTitleScreen();
        } else {
          this.resumeToAiming();
        }
      },
    };

    this.shop.open(
      this.save,
      this.economy,
      this.skins,
      this.progression,
      freeCandidate,
      shopCallbacks,
      initialTab
    );
  }

  private openAchievements(fromTitle: boolean): void {
    if (!fromTitle) {
      PlatformSDK.gameplayStop();
    }
    this.stateMachine.transition('SHOP');
    this.audio.playModalOpen();
    this.achievementsModal.open(
      this.save,
      (featId) => {
        const reward = this.progression.claimMasteryFeat(this.save, featId);
        if (reward > 0) {
          this.audio.playUpgrade();
          this.persistSave();
        }
      },
      () => {
        if (fromTitle) {
          this.stateMachine.transition('TITLE');
          this.showTitleScreen();
        } else {
          this.resumeToAiming();
        }
      }
    );
  }

  private simulateFinalGateClear(oneShot: boolean): void {
    this.titleOverlay.hideImmediate();
    this.shop.close();
    this.summary.hide();
    this.victoryModal.hide();
    this.achievementsModal.hide();
    this.retentionModals.hide();

    this.save.unlockedBiomeIndex = ASCENSION_CONFIG.FINAL_BIOME_INDEX;
    this.progression.selectBiome(this.save, oneShot ? 0 : ASCENSION_CONFIG.FINAL_BIOME_INDEX);
    this.isFullShaftRun = oneShot;
    this.runMaxDepthM = ASCENSION_CONFIG.FINAL_GATE_DEPTH_M;
    this.save.maxDepthMeters = Math.max(this.save.maxDepthMeters, this.runMaxDepthM);
    this.runBlocksSmashed = Math.max(this.runBlocksSmashed, 145);
    this.runMaxCombo = Math.max(this.runMaxCombo, 28);
    this.save.stats.maxBounceCombo = Math.max(this.save.stats.maxBounceCombo, this.runMaxCombo);
    this.runTntCount = Math.max(this.runTntCount, 4);

    const simCoins = Math.max(this.runCoins, 2500);
    this.runCoins = simCoins;
    this.save.coins += simCoins;
    this.save.totalCoinsEarned += simCoins;

    const { ascended, newTier } = this.progression.completeFinalGateClear(
      this.save,
      oneShot,
      {
        blocksSmashed: this.runBlocksSmashed,
        maxCombo: this.runMaxCombo,
        timestamp: PlatformSDK.getServerTimeMs(),
      }
    );
    this.clearedBiome6ThisRun = true;
    this.victorySlowMoTimer = 0;
    this.pendingVictoryTier = ascended ? newTier : null;
    if (ascended) {
      this.audio.playVictoryFanfare();
      PlatformSDK.happytime();
    }
    this.orbs.length = 0;
    this.pendingVolleyOrbs = 0;
    this.finishRun();
  }

  private showTitleScreen(): void {
    this.ftue.setVisible(false);
    this.titleOverlay.show({
      logoUrl: this.renderer.getLogoEmblemUrl(),
      bestDepthMeters: this.save.maxDepthMeters,
      ascensionTier: this.save.ascensionTier,
      hasUnclaimedFeats: this.progression.hasUnclaimedFeats(this.save),
      muted: this.audio.isMuted(),
      callbacks: {
        onUserGesture: () => {
          this.audio.unlock();
        },
        onPlay: () => {
          this.audio.unlock();
          this.stateMachine.transition('AIMING');
          this.ftue.setVisible(!this.save.ftueDone);
          if (!this.hasStartedGameplayOnce) {
            this.hasStartedGameplayOnce = true;
          }
          PlatformSDK.gameplayStart();
        },
        onToggleMute: () => {
          this.audio.unlock();
          this.save.settings.muted = this.audio.toggleMute();
          this.persistSave();
          this.showTitleScreen();
        },
        onOpenSettings: () => {
          this.openSettings(true);
        },
        onOpenSkins: () => {
          this.titleOverlay.hideImmediate();
          this.openShop('skins', true);
        },
        onOpenAchievements: () => {
          this.titleOverlay.hideImmediate();
          this.openAchievements(true);
        },
      },
    });
  }

  private openSettings(fromTitle: boolean): void {
    this.audio.playModalOpen();
    this.settingsModal.open(this.save, i18n.getLocale(), {
      onToggleSfx: () => {
        this.save.settings.sfxMuted = !this.save.settings.sfxMuted;
        this.audio.setSfxMuted(this.save.settings.sfxMuted);
        this.persistSave();
      },
      onToggleMusic: () => {
        this.audio.unlock();
        this.save.settings.musicMuted = !this.save.settings.musicMuted;
        this.audio.setMusicMuted(this.save.settings.musicMuted);
        this.save.settings.musicVolume = this.audio.getMusicVolume();
        this.persistSave();
      },
      onSetMusicVolume: (level) => {
        this.audio.unlock();
        this.save.settings.musicVolume = level;
        this.save.settings.musicMuted = level === 'off';
        this.audio.setMusicVolume(level);
        this.persistSave();
      },
      onToggleAimMode: () => {
        this.save.settings.aimMode =
          this.save.settings.aimMode === 'slingshot' ? 'direct' : 'slingshot';
        this.save.settings.aimModeUserSet = true;
        this.ftue.setAimMode(this.save.settings.aimMode);
        this.persistSave();
      },
      onSelectLocale: (locale: SupportedLocale) => {
        this.save.settings.localeOverride = locale;
        i18n.setLocale(locale);
        this.hud.refreshLabels();
        this.ftue.refreshText();
        this.persistSave();
      },
      onConfirmReset: () => {
        this.save = this.saveManager.resetProgress(PlatformSDK.getServerTimeMs());
        const json = JSON.stringify(this.save);
        void PlatformSDK.saveCloudData(json);
        this.audio.setUserMuted(false);
        this.audio.setSfxMuted(false);
        this.audio.setMusicVolume('high');
        this.save.settings.aimMode = this.getDefaultAimModeForDevice();
        this.save.settings.aimModeUserSet = false;
        this.ftue.setAimMode(this.save.settings.aimMode);
        i18n.setLocale(PlatformSDK.getLocale());
        this.hud.refreshLabels();
        this.ftue.refreshText();
        this.ftue.setVisible(true);
        this.returnToHome();
      },
      onClose: () => {
        if (fromTitle) {
          this.showTitleScreen();
        } else {
          this.resumeToAiming();
        }
      },
    });
  }

  private returnToHome(): void {
    PlatformSDK.gameplayStop();
    this.pausedFromState = null;
    this.orbs = [];
    this.pendingVolleyOrbs = 0;
    this.resetShaft();
    this.stateMachine.transition('TITLE');
    this.showTitleScreen();
  }

  private render(rawDt: number): void {
    const selectedBiome = this.progression.getSelectedBiome(this.save);
    const viewDepth =
      selectedBiome.startDepthM +
      (this.cameraY / PHYSICS_CONFIG.TILE_SIZE) * PHYSICS_CONFIG.METERS_PER_ROW;
    const currentBiome = BiomeTheme.getBiomeAtDepth(viewDepth);

    const activeBounces = this.orbs.reduce(
      (sum, o) => (o.alive ? sum + o.bouncesLeft : sum),
      0
    );
    const affordableCount = UPGRADES.filter((u) => this.economy.canAfford(this.save, u.id)).length;
    const hasClaimableQuest = this.save.dailyQuests.quests.some(
      (q) => !q.claimed && q.progress >= q.target
    );

    const currentDepth = this.stateMachine.state === 'RUNNING' ? this.runMaxDepthM : selectedBiome.startDepthM;
    const bossStart = selectedBiome.startDepthM;
    const bossEnd = Number.isFinite(selectedBiome.endDepthM)
      ? selectedBiome.endDepthM
      : ASCENSION_CONFIG.FINAL_GATE_DEPTH_M;
    const bossSpan = Math.max(1, bossEnd - bossStart);
    const bossPct = ((currentDepth - bossStart) / bossSpan) * 100;
    const bossNear = bossEnd - currentDepth <= 15;
    const nextBiomeNum = Math.min(6, selectedBiome.index + 2);
    const bossText =
      selectedBiome.index >= ASCENSION_CONFIG.FINAL_BIOME_INDEX
        ? `${Math.floor(currentDepth)}m / ${ASCENSION_CONFIG.FINAL_GATE_DEPTH_M}m (${i18n.t('boss_gate')})`
        : `${Math.floor(currentDepth)}m / ${Math.floor(bossEnd)}m to Biome ${nextBiomeNum} Boss`;

    // Check if current biome's Bedrock Boss Gate is visible or damaged to display active Boss HP bar
    const viewHeightWorld = this.viewport.getLayout().cssHeight / this.viewport.getLayout().scale;
    let gateRow = -1;
    let gateCoresAlive = 0;
    let gateHp = 0;
    let gateMaxHp = 0;
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.kind === 'boss_core' && e.biomeIndex === selectedBiome.index) {
        if (gateRow === -1) gateRow = e.row;
        if (e.row === gateRow) {
          gateMaxHp += e.maxHp;
          if (e.alive) {
            gateCoresAlive++;
            gateHp += e.hp;
          }
        }
      }
    }
    const gateY = gateRow * PHYSICS_CONFIG.TILE_SIZE;
    const gateVisibleOrDamaged =
      gateRow >= 0 &&
      gateCoresAlive > 0 &&
      (gateHp < gateMaxHp - 0.5 ||
        (gateY >= this.cameraY - 40 && gateY <= this.cameraY + viewHeightWorld + 60));
    this.bossActiveForAudio = bossNear || gateVisibleOrDamaged;

    this.hud.update({
      coins: this.save.coins,
      depthMeters: currentDepth,
      biomeName: i18n.t(currentBiome.nameKey as TranslationKey),
      bouncesLeft: activeBounces,
      isTitle: this.stateMachine.state === 'TITLE',
      isRunning: this.stateMachine.state === 'RUNNING',
      isAiming: this.stateMachine.state === 'AIMING',
      aimMode: this.save.settings.aimMode,
      muted: this.audio.isMuted(),
      speedMult: this.loop.getSpeedMultiplier(),
      hasElevator: this.save.unlockedBiomeIndex > 0,
      showOverdriveOffer:
        this.save.overdrivePasses === 0 &&
        this.monetization.canOfferOverdriveTrial(this.save.runsCompleted),
      hasClaimableLogin: !this.save.loginStreak.claimedToday,
      hasClaimableQuest,
      hasUnclaimedFeats: this.progression.hasUnclaimedFeats(this.save),
      affordableUpgradeCount: affordableCount,
      bossProgressText: bossText,
      bossProgressPct: bossPct,
      bossNear,
      isFullShaftRun:
        (this.stateMachine.state === 'RUNNING'
          ? this.isFullShaftRun
          : selectedBiome.startDepthM === 0) &&
        this.stateMachine.state !== 'TITLE',
      ascensionTier: this.save.ascensionTier,
      activeGate: gateVisibleOrDamaged
        ? { coresAlive: gateCoresAlive, hp: gateHp, maxHp: gateMaxHp }
        : null,
      magPulseCooldown: this.magPulseCooldownS,
      magPulseMaxCooldown: this.economy.getMagPulseCooldownS(this.save),
      overclockCharges: this.overclockCharges,
      overclockActiveTimer: this.overclockTimerS,
      overclockBreakProgress: this.overclockBreakCounter,
      activePerks: this.artifacts.getActiveEntries(),
      playerName: this.playerName,
      supportsLeaderboard: PlatformSDK.supportsLeaderboards(),
    });

    this.renderer.render(this.viewport.getLayout(), {
      cameraY: this.cameraY,
      baseDepthMeters: selectedBiome.startDepthM,
      launcherX: PHYSICS_CONFIG.SHAFT_WIDTH * 0.5,
      launcherY: PHYSICS_CONFIG.LAUNCHER_Y,
      aimAngleRad: this.stateMachine.state === 'AIMING' ? this.aimAngleRad : null,
      isAimingState: this.stateMachine.state === 'AIMING',
      loadedOrbRadius: this.economy.getEffectiveOrbRadius(this.save),
      loadedOrbCount: this.economy.getEffectiveMultiOrbCount(this.save),
      turretRecoil: this.turretRecoil,
      heavyTurret: this.save.upgrades.damage > 5,
      overclockTimer: this.overclockTimerS,
      magPulseShockwaves: this.magPulseShockwaves,
      lightningArcs: this.lightningArcs,
      drone: this.economy.isDroneUnlocked(this.save) ? { ...this.drone, active: true } : null,
      activeWeakPointCoreIndex: this.activeWeakPointCoreIndex,
      bossPhase2: this.bossPhase2Active,
      trajectoryDots: this.trajectoryDots,
      trajectoryImpact: this.trajectoryImpact,
      trajectorySecondImpact: this.trajectorySecondImpact,
      targetedBlockId: this.targetedBlockId,
      secondTargetedBlockId: this.secondTargetedBlockId,
      trajectoryBounceIdx: this.trajectoryBounceIdx,
      aimFeedback: this.aimFeedback,
      orbs: this.orbs,
      entities: this.entities,
      coins: this.coins,
      skin: this.skins.getEquippedSkin(this.save),
      particles: this.particles,
      floatingText: this.floatingText,
      juice: this.juice,
      timeS: this.timeS + rawDt,
    });
  }

  private getDefaultAimModeForDevice(): 'slingshot' | 'direct' {
    const dev = PlatformSDK.getDeviceType();
    if (dev === 'mobile' || dev === 'tablet') return 'slingshot';
    return 'direct';
  }

  private resumeToAiming(): void {
    PlatformSDK.clearAllBanners();
    this.stateMachine.transition('AIMING');
    if (this.hasStartedGameplayOnce) {
      PlatformSDK.gameplayStart();
    }
  }

  private togglePause(): void {
    const st = this.stateMachine.state;
    if (st === 'PAUSED') {
      this.retentionModals.hide();
      const target = this.pausedFromState ?? 'AIMING';
      this.pausedFromState = null;
      this.stateMachine.transition(target);
      if (this.hasStartedGameplayOnce) {
        PlatformSDK.gameplayStart();
      }
      return;
    }
    if (st !== 'AIMING' && st !== 'RUNNING') return;
    this.pausedFromState = st;
    this.stateMachine.transition('PAUSED');
    this.audio.playModalOpen();
    PlatformSDK.gameplayStop();
    this.retentionModals.showPauseModal(
      () => this.togglePause(),
      () => {
        this.pausedFromState = null;
        this.resetShaft();
        this.resumeToAiming();
      },
      () => {
        this.pausedFromState = null;
        this.openSettings(false);
      },
      () => this.returnToHome()
    );
  }

  private showAdFailureToast(reason?: string): void {
    // Poki prohibits custom ad-blocker error popups
    if (typeof __PLATFORM__ !== 'undefined' && __PLATFORM__ === 'poki') return;
    this.hud.showToast(reason === 'skipped' ? i18n.t('ad_incomplete') : i18n.t('ad_unavailable'));
  }

  private persistSave(): void {
    const json = this.saveManager.saveLocal(this.save);
    void PlatformSDK.saveCloudData(json);
  }
}

const app = new RicochetMinerApp();
void app.boot();
