import { toRomanNumeral } from '../config/gameConfig';
import { i18n } from '../i18n/translations';
import { formatCompact, formatMeters } from '../utils/format';
import { svgIcon } from './icons';
import { UI_ICONS } from './uiAssets';

export interface HUDCallbacks {
  onToggleMute: () => void;
  onTogglePause: () => void;
  onToggleSpeed: () => void;
  onRecall: () => void;
  onOpenShop: () => void;
  onOpenAchievements: () => void;
  onOpenQuests: () => void;
  onOpenDailyLogin: () => void;
  onOpenElevator: () => void;
  onTriggerOverdriveAd: () => void;
}

const FULL_SHAFT_STAR_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M12 2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 8.3l6-.8L12 2z" fill="#fde047" stroke="#1a1310" stroke-width="2" stroke-linejoin="round"/></svg>`;

export class HUDController {
  private root: HTMLElement;
  private topEl: HTMLElement;
  private depthEl: HTMLElement;
  private coinsEl: HTMLElement;
  private biomeEl: HTMLElement;
  private crestPillEl: HTMLElement;
  private crestTextEl: HTMLElement;
  private bouncesEl: HTMLElement;
  private muteBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private recallBtn: HTMLButtonElement;
  private overdriveBtn: HTMLButtonElement;
  private shopBtn: HTMLButtonElement;
  private shopBadgeEl: HTMLElement;
  private achievementsBtn: HTMLButtonElement;
  private achievementsDotEl: HTMLElement;
  private questBtn: HTMLButtonElement;
  private questDotEl: HTMLElement;
  private loginBtn: HTMLButtonElement;
  private loginDotEl: HTMLElement;
  private elevatorBtn: HTMLButtonElement;
  private toastEl: HTMLElement;
  private toastTimer: number | null = null;
  private arcadeConsole: HTMLElement;
  private runningBar: HTMLElement;
  private bossRowEl: HTMLElement;
  private bossBarEl: HTMLElement;
  private bossTextEl: HTMLElement;
  private bossFillEl: HTMLElement;
  private bossIcoEl: HTMLElement;
  private fullShaftPillEl: HTMLElement;
  private gateHpBarEl: HTMLElement;
  private gateTitleEl: HTMLElement;
  private gateHpTextEl: HTMLElement;
  private gateHpFillEl: HTMLElement;

  constructor(root: HTMLElement, callbacks: HUDCallbacks) {
    this.root = root;

    const topStack = document.createElement('div');
    topStack.className = 'rm-hud-stack';
    this.root.appendChild(topStack);

    this.topEl = document.createElement('div');
    this.topEl.className = 'rm-hud-top';
    this.topEl.innerHTML = `
      <div class="rm-pill-row">
        <div class="rm-pill">${svgIcon('coin')} <span data-hud="coins">0</span></div>
        <div class="rm-pill">${svgIcon('pickaxe')} <span data-hud="depth">0m</span></div>
        <div class="rm-pill"><span data-hud="biome">Sunlit Quarry</span></div>
        <div class="rm-ascension-crest-pill" data-hud="crest-pill" style="display:none;">
          <img src="${UI_ICONS.badgeAscensionStar}" style="width:16px;height:16px;object-fit:contain;" alt="" />
          <span data-hud="crest-text">TIER I</span>
        </div>
        <div class="rm-pill" data-hud="bounces-pill" style="display:none;">${svgIcon('lightning')} <span data-hud="bounces">0</span></div>
      </div>
      <div class="rm-pill-row rm-pill-row-nowrap">
        <button class="rm-btn" data-interactive="true" data-hud="pause" aria-label="Pause">${svgIcon('pause')}</button>
        <button class="rm-btn" data-interactive="true" data-hud="mute" aria-label="Mute">${svgIcon('soundOn')}</button>
      </div>
    `;
    topStack.appendChild(this.topEl);

    this.bossRowEl = document.createElement('div');
    this.bossRowEl.className = 'rm-boss-row';
    this.bossRowEl.style.display = 'none';
    topStack.appendChild(this.bossRowEl);

    this.bossBarEl = document.createElement('div');
    this.bossBarEl.className = 'rm-boss-bar';
    this.bossBarEl.innerHTML = `
      <span data-hud="boss-ico" class="rm-boss-pulse">${svgIcon('bossCore')}</span>
      <span data-hud="boss-text">0m / 150m to Biome 2 Boss</span>
      <div class="rm-boss-track"><div class="rm-boss-fill" data-hud="boss-fill" style="width:0%;"></div></div>
    `;
    this.bossRowEl.appendChild(this.bossBarEl);
    this.bossTextEl = this.bossBarEl.querySelector('[data-hud="boss-text"]')!;
    this.bossFillEl = this.bossBarEl.querySelector('[data-hud="boss-fill"]')!;
    this.bossIcoEl = this.bossBarEl.querySelector('[data-hud="boss-ico"]')!;

    this.fullShaftPillEl = document.createElement('div');
    this.fullShaftPillEl.className = 'rm-fullshaft-pill';
    this.fullShaftPillEl.innerHTML = `<span class="rm-ico" aria-hidden="true">${FULL_SHAFT_STAR_SVG}</span> <span data-lbl="fullshaft">${i18n.t('full_shaft_run')}</span>`;
    this.bossRowEl.appendChild(this.fullShaftPillEl);

    this.gateHpBarEl = document.createElement('div');
    this.gateHpBarEl.className = 'rm-gate-hp-bar';
    this.gateHpBarEl.innerHTML = `
      <div class="rm-gate-hp-head">
        <span style="display:inline-flex;align-items:center;gap:5px;">${svgIcon('bossCore')} <span data-hud="gate-title">${i18n.t('boss_gate')}</span></span>
        <span data-hud="gate-hp-text">0 / 0</span>
      </div>
      <div class="rm-gate-hp-track">
        <div class="rm-gate-hp-fill" data-hud="gate-hp-fill" style="width:100%;"></div>
      </div>
    `;
    topStack.appendChild(this.gateHpBarEl);
    this.gateTitleEl = this.gateHpBarEl.querySelector('[data-hud="gate-title"]')!;
    this.gateHpTextEl = this.gateHpBarEl.querySelector('[data-hud="gate-hp-text"]')!;
    this.gateHpFillEl = this.gateHpBarEl.querySelector('[data-hud="gate-hp-fill"]')!;

    this.coinsEl = this.topEl.querySelector('[data-hud="coins"]')!;
    this.depthEl = this.topEl.querySelector('[data-hud="depth"]')!;
    this.biomeEl = this.topEl.querySelector('[data-hud="biome"]')!;
    this.crestPillEl = this.topEl.querySelector('[data-hud="crest-pill"]')!;
    this.crestTextEl = this.topEl.querySelector('[data-hud="crest-text"]')!;
    this.bouncesEl = this.topEl.querySelector('[data-hud="bounces"]')!;
    this.muteBtn = this.topEl.querySelector('[data-hud="mute"]')!;
    this.muteBtn.addEventListener('click', callbacks.onToggleMute);
    this.topEl.querySelector('[data-hud="pause"]')?.addEventListener('click', callbacks.onTogglePause);

    // Running controls (2x Speed & Recall)
    this.runningBar = document.createElement('div');
    this.runningBar.className = 'rm-bottom-bar';
    this.runningBar.style.display = 'none';
    this.runningBar.innerHTML = `
      <button class="rm-btn" data-interactive="true" data-hud="speed">${svgIcon('fastForward')} <span data-lbl="speed">${i18n.t('fast_forward')}</span></button>
      <button class="rm-btn rm-btn-gold" data-interactive="true" data-hud="recall">${svgIcon('recall')} <span data-lbl="recall">${i18n.t('recall')}</span></button>
    `;
    this.root.appendChild(this.runningBar);
    this.speedBtn = this.runningBar.querySelector('[data-hud="speed"]')!;
    this.recallBtn = this.runningBar.querySelector('[data-hud="recall"]')!;
    this.speedBtn.addEventListener('click', callbacks.onToggleSpeed);
    this.recallBtn.addEventListener('click', callbacks.onRecall);

    // Right-Flank Arcade Console (Desktop) / Compact Bottom Dock (Mobile)
    this.arcadeConsole = document.createElement('div');
    this.arcadeConsole.className = 'rm-arcade-console';
    this.arcadeConsole.innerHTML = `
      <button class="rm-btn rm-btn-primary" data-interactive="true" data-hud="shop">
        ${svgIcon('upgradePickaxe')} <span data-lbl="upgrades">${i18n.t('upgrades').toUpperCase()}</span>
        <span class="rm-badge-count" data-hud="shop-badge" style="display:none;">0</span>
      </button>
      <button class="rm-btn" data-interactive="true" data-hud="achievements">
        <img src="${UI_ICONS.trophy}" style="width:18px;height:18px;object-fit:contain;" alt="" />
        <span data-lbl="achievements">${i18n.t('achievements')}</span>
        <span class="rm-dot" data-hud="ach-dot" style="display:none;"></span>
      </button>
      <button class="rm-btn" data-interactive="true" data-hud="quests">
        ${svgIcon('questClipboard')} <span data-lbl="quests">${i18n.t('quests')}</span>
        <span class="rm-dot" data-hud="quest-dot" style="display:none;"></span>
      </button>
      <button class="rm-btn" data-interactive="true" data-hud="login">
        ${svgIcon('streakArrows')} <span data-lbl="streak">${i18n.t('streak_short')}</span>
        <span class="rm-dot" data-hud="login-dot" style="display:none;"></span>
      </button>
      <button class="rm-btn" data-interactive="true" data-hud="elevator" style="display:none;">
        ${svgIcon('elevatorCar')} <span data-lbl="elevator">${i18n.t('elevator')}</span>
      </button>
      <button class="rm-btn rm-btn-gold" data-interactive="true" data-hud="overdrive" style="display:none;flex-direction:column;gap:1px;padding:6px 10px;">
        <span style="display:inline-flex;align-items:center;gap:6px;">${svgIcon('adPlay')} <span data-lbl="superorb">${i18n.t('super_orb_label')}</span></span>
        <span data-lbl="freead" style="font-size:10px;opacity:0.9;">${i18n.t('free_ad_sub')}</span>
      </button>
    `;
    this.root.appendChild(this.arcadeConsole);

    this.shopBtn = this.arcadeConsole.querySelector('[data-hud="shop"]')!;
    this.shopBadgeEl = this.arcadeConsole.querySelector('[data-hud="shop-badge"]')!;
    this.achievementsBtn = this.arcadeConsole.querySelector('[data-hud="achievements"]')!;
    this.achievementsDotEl = this.arcadeConsole.querySelector('[data-hud="ach-dot"]')!;
    this.questBtn = this.arcadeConsole.querySelector('[data-hud="quests"]')!;
    this.questDotEl = this.arcadeConsole.querySelector('[data-hud="quest-dot"]')!;
    this.loginBtn = this.arcadeConsole.querySelector('[data-hud="login"]')!;
    this.loginDotEl = this.arcadeConsole.querySelector('[data-hud="login-dot"]')!;
    this.elevatorBtn = this.arcadeConsole.querySelector('[data-hud="elevator"]')!;
    this.overdriveBtn = this.arcadeConsole.querySelector('[data-hud="overdrive"]')!;

    this.shopBtn.addEventListener('click', callbacks.onOpenShop);
    this.achievementsBtn.addEventListener('click', callbacks.onOpenAchievements);
    this.questBtn.addEventListener('click', callbacks.onOpenQuests);
    this.loginBtn.addEventListener('click', callbacks.onOpenDailyLogin);
    this.elevatorBtn.addEventListener('click', callbacks.onOpenElevator);
    this.overdriveBtn.addEventListener('click', callbacks.onTriggerOverdriveAd);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'rm-toast';
    this.toastEl.style.display = 'none';
    this.root.appendChild(this.toastEl);
  }

  refreshLabels(): void {
    const set = (sel: string, txt: string) => {
      const el = this.root.querySelector(sel);
      if (el) el.textContent = txt;
    };
    set('[data-lbl="speed"]', i18n.t('fast_forward'));
    set('[data-lbl="recall"]', i18n.t('recall'));
    set('[data-lbl="upgrades"]', i18n.t('upgrades').toUpperCase());
    set('[data-lbl="achievements"]', i18n.t('achievements'));
    set('[data-lbl="quests"]', i18n.t('quests'));
    set('[data-lbl="streak"]', i18n.t('streak_short'));
    set('[data-lbl="elevator"]', i18n.t('elevator'));
    set('[data-lbl="superorb"]', i18n.t('super_orb_label'));
    set('[data-lbl="freead"]', i18n.t('free_ad_sub'));
    set('[data-lbl="fullshaft"]', i18n.t('full_shaft_run'));
  }

  update(params: {
    coins: number;
    depthMeters: number;
    biomeName: string;
    bouncesLeft: number;
    isTitle: boolean;
    isRunning: boolean;
    isAiming: boolean;
    muted: boolean;
    speedMult: number;
    hasElevator: boolean;
    isFullShaftRun: boolean;
    ascensionTier: number;
    hasUnclaimedFeats: boolean;
    showOverdriveOffer: boolean;
    hasClaimableLogin: boolean;
    hasClaimableQuest: boolean;
    affordableUpgradeCount: number;
    bossProgressText: string;
    bossProgressPct: number;
    bossNear: boolean;
    activeGate?: {
      coresAlive: number;
      hp: number;
      maxHp: number;
    } | null;
  }): void {
    this.topEl.style.display = params.isTitle ? 'none' : 'flex';
    this.bossRowEl.style.display = params.isTitle ? 'none' : 'flex';
    this.bossTextEl.textContent = params.bossProgressText;
    this.bossFillEl.style.width = `${Math.max(0, Math.min(100, params.bossProgressPct))}%`;
    this.bossIcoEl.classList.toggle('rm-boss-pulse', params.bossNear || params.isRunning);

    this.fullShaftPillEl.style.display = params.isFullShaftRun ? 'inline-flex' : 'none';

    if (params.ascensionTier >= 1) {
      this.crestPillEl.style.display = 'inline-flex';
      this.crestTextEl.textContent = `${i18n.t('tier_label').toUpperCase()} ${toRomanNumeral(params.ascensionTier)}`;
    } else {
      this.crestPillEl.style.display = 'none';
    }

    if (!params.isTitle && params.activeGate && params.activeGate.maxHp > 0) {
      const pct = Math.max(0, Math.min(100, (params.activeGate.hp / params.activeGate.maxHp) * 100));
      this.gateHpBarEl.style.display = 'flex';
      this.gateHpBarEl.classList.toggle('critical', pct <= 20);
      this.gateTitleEl.textContent = `${i18n.t('boss_gate')} (${params.activeGate.coresAlive}/3)`;
      this.gateHpTextEl.textContent = `${formatCompact(Math.ceil(params.activeGate.hp))} / ${formatCompact(Math.ceil(params.activeGate.maxHp))}`;
      this.gateHpFillEl.style.width = `${pct}%`;
    } else {
      this.gateHpBarEl.style.display = 'none';
      this.gateHpBarEl.classList.remove('critical');
    }

    this.coinsEl.textContent = formatCompact(params.coins);
    this.depthEl.textContent = formatMeters(params.depthMeters);
    this.biomeEl.textContent = params.biomeName;
    this.muteBtn.innerHTML = svgIcon(params.muted ? 'soundOff' : 'soundOn');

    const bPill = this.topEl.querySelector('[data-hud="bounces-pill"]') as HTMLElement | null;
    if (bPill) {
      bPill.style.display = params.isRunning ? 'inline-flex' : 'none';
    }
    this.bouncesEl.textContent = Math.ceil(params.bouncesLeft).toString();

    this.runningBar.style.display = params.isRunning ? 'flex' : 'none';
    this.speedBtn.style.borderColor = params.speedMult > 1 ? '#fde047' : '#1a1310';
    this.arcadeConsole.style.display = params.isAiming ? 'flex' : 'none';
    this.elevatorBtn.style.display = params.hasElevator ? 'inline-flex' : 'none';
    this.overdriveBtn.style.display = params.showOverdriveOffer ? 'inline-flex' : 'none';

    this.achievementsDotEl.style.display = params.hasUnclaimedFeats ? 'block' : 'none';
    this.loginDotEl.style.display = params.hasClaimableLogin ? 'block' : 'none';
    this.questDotEl.style.display = params.hasClaimableQuest ? 'block' : 'none';
    this.shopBadgeEl.style.display = params.affordableUpgradeCount > 0 ? 'inline-flex' : 'none';
    this.shopBadgeEl.textContent = params.affordableUpgradeCount.toString();
  }

  showToast(message: string, durationMs: number = 2200): void {
    this.toastEl.textContent = message;
    this.toastEl.style.display = 'block';
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.style.display = 'none';
      this.toastTimer = null;
    }, durationMs);
  }
}
