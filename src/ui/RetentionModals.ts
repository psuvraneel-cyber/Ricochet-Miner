import { BIOMES, RETENTION_CONFIG } from '../config/gameConfig';
import { i18n, type TranslationKey } from '../i18n/translations';
import type { SaveData } from '../sdk/SaveManager';
import type { RetentionSystem } from '../systems/RetentionSystem';
import { formatCompact } from '../utils/format';
import { svgIcon } from './icons';
import { UI_ICONS } from './uiAssets';

export class RetentionModals {
  private backdrop: HTMLElement;

  constructor(root: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'rm-modal-backdrop';
    this.backdrop.style.display = 'none';
    root.appendChild(this.backdrop);
  }

  showOfflineModal(amount: number, onCollect: (doubled: boolean) => void): void {
    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell">
        <img src="${UI_ICONS.chest}" class="rm-crown-icon" alt="" />
        <div style="display:flex;justify-content:center;">
          <div class="rm-header-plaque">${i18n.t('welcome_back')}</div>
        </div>
        <p style="margin:0;text-align:center;color:#cbd5e1;font-size:13px;">${i18n.t('offline_earned')}</p>
        <div class="rm-stat-plaque" style="flex-direction:row;justify-content:center;gap:10px;">
          <img src="${UI_ICONS.oreValue}" style="width:32px;height:32px;object-fit:contain;" alt="" />
          <span style="font-size:26px;font-weight:900;color:#fbbf24;">${formatCompact(amount)}</span>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="rm-btn rm-btn-green" style="flex:1.1;min-height:48px;" data-act="collect">${i18n.t('collect')}</button>
          <button class="rm-btn rm-btn-gold" style="flex:1;min-height:48px;" data-act="collect2x">${svgIcon('adPlay')} ${i18n.t('collect_2x')}</button>
        </div>
      </div>
    `;
    this.backdrop.style.display = 'flex';
    this.backdrop.querySelector('[data-act="collect"]')?.addEventListener('click', () => {
      this.hide();
      onCollect(false);
    });
    this.backdrop.querySelector('[data-act="collect2x"]')?.addEventListener('click', () => {
      this.hide();
      onCollect(true);
    });
  }

  showDailyLogin(save: SaveData, onClaim: () => void, onClose: () => void): void {
    const rows = RETENTION_CONFIG.LOGIN_REWARDS.map((r) => {
      const isCurrent = r.day === save.loginStreak.day;
      const isPast = r.day < save.loginStreak.day || (isCurrent && save.loginStreak.claimedToday);
      return `
        <div class="rm-upgrade-plaque" style="justify-content:space-between;border-color:${isCurrent ? '#fbbf24' : '#120c08'};">
          <span style="font-weight:900;font-size:13px;">Day ${r.day}: ${i18n.t(r.labelKey as TranslationKey)}</span>
          <span style="font-size:12px;color:${isPast ? '#4ade80' : '#fbbf24'};">${isPast ? svgIcon('check') : isCurrent ? 'READY' : svgIcon('lock')}</span>
        </div>
      `;
    }).join('');

    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell">
        <img src="${UI_ICONS.chest}" class="rm-crown-icon" alt="" />
        <div class="rm-modal-header">
          <div class="rm-header-plaque">${i18n.t('daily_login')}</div>
          <button class="rm-btn rm-close-btn" data-act="close" aria-label="Close">${svgIcon('close')}</button>
        </div>
        <div class="rm-scroll-area"><div class="rm-upgrade-list">${rows}</div></div>
        ${
          !save.loginStreak.claimedToday
            ? `<button class="rm-btn rm-btn-green" data-act="claim">${i18n.t('claim')}</button>`
            : `<button class="rm-btn" disabled>${i18n.t('claimed')}</button>`
        }
      </div>
    `;
    this.backdrop.style.display = 'flex';
    this.backdrop.querySelector('[data-act="close"]')?.addEventListener('click', () => {
      this.hide();
      onClose();
    });
    this.backdrop.querySelector('[data-act="claim"]')?.addEventListener('click', () => {
      onClaim();
      this.hide();
      onClose();
    });
  }

  showDailyQuests(
    save: SaveData,
    retention: RetentionSystem,
    onClaimQuest: (id: string) => void,
    onClaimMega: () => void,
    onClose: () => void
  ): void {
    const items = save.dailyQuests.quests
      .map((q) => {
        const spec = RETENTION_CONFIG.DAILY_QUEST_POOL.find((p) => p.id === q.id);
        const label = spec ? i18n.t(spec.labelKey as TranslationKey) : q.id;
        const done = q.progress >= q.target;
        return `
          <div class="rm-upgrade-plaque" style="justify-content:space-between;">
            <div>
              <div style="font-weight:900;font-size:13px;">${label}</div>
              <div style="font-size:12px;color:#cbd5e1;display:inline-flex;align-items:center;gap:5px;">
                ${q.progress}/${q.target}
                <img src="${UI_ICONS.oreValue}" style="width:15px;height:15px;object-fit:contain;" alt="" />
                ${spec?.rewardCoins ?? 0}
              </div>
            </div>
            ${
              q.claimed
                ? `${svgIcon('check')}`
                : done
                ? `<button class="rm-btn rm-btn-green" style="min-height:36px;" data-qclaim="${q.id}">${i18n.t('claim')}</button>`
                : `<span class="rm-lv-pill">${q.progress}/${q.target}</span>`
            }
          </div>
        `;
      })
      .join('');

    const canMega = retention.canClaimMegaChest(save);

    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell">
        <img src="${UI_ICONS.chest}" class="rm-crown-icon" alt="" />
        <div class="rm-modal-header">
          <div class="rm-header-plaque">${i18n.t('quests')}</div>
          <button class="rm-btn rm-close-btn" data-act="close" aria-label="Close">${svgIcon('close')}</button>
        </div>
        <div class="rm-scroll-area"><div class="rm-upgrade-list">${items}</div></div>
        <button class="rm-btn rm-btn-gold" data-act="mega" ${canMega ? '' : 'disabled'}>
          <img src="${UI_ICONS.chest}" style="width:22px;height:22px;object-fit:contain;" alt="" />
          ${i18n.t('daily_mega_chest')}
        </button>
      </div>
    `;
    this.backdrop.style.display = 'flex';
    this.backdrop.querySelector('[data-act="close"]')?.addEventListener('click', () => {
      this.hide();
      onClose();
    });
    this.backdrop.querySelectorAll('[data-qclaim]').forEach((el) => {
      el.addEventListener('click', () => {
        onClaimQuest((el as HTMLElement).dataset.qclaim!);
      });
    });
    this.backdrop.querySelector('[data-act="mega"]')?.addEventListener('click', onClaimMega);
  }

  showElevator(save: SaveData, onSelectBiome: (idx: number) => void, onClose: () => void): void {
    const items = BIOMES.map((b) => {
      const unlocked = b.index <= save.unlockedBiomeIndex;
      const selected = b.index === save.selectedBiomeIndex;
      return `
        <button class="rm-btn ${selected ? 'rm-btn-primary' : ''}" data-biome="${b.index}" ${unlocked ? '' : 'disabled'} style="justify-content:space-between;">
          <span>${i18n.t(b.nameKey as TranslationKey)} (${b.startDepthM}m)</span>
          <span class="rm-lv-pill">${unlocked ? `${b.coinMultiplier}x` : svgIcon('lock')}</span>
        </button>
      `;
    }).join('');

    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell">
        <img src="${UI_ICONS.gearElevator}" class="rm-crown-icon" alt="" />
        <div class="rm-modal-header">
          <div class="rm-header-plaque">${i18n.t('elevator')}</div>
          <button class="rm-btn rm-close-btn" data-act="close" aria-label="Close">${svgIcon('close')}</button>
        </div>
        <div class="rm-scroll-area"><div class="rm-upgrade-list">${items}</div></div>
      </div>
    `;
    this.backdrop.style.display = 'flex';
    this.backdrop.querySelector('[data-act="close"]')?.addEventListener('click', () => {
      this.hide();
      onClose();
    });
    this.backdrop.querySelectorAll('[data-biome]').forEach((el) => {
      el.addEventListener('click', () => {
        onSelectBiome(Number((el as HTMLElement).dataset.biome));
        this.hide();
        onClose();
      });
    });
  }

  showPauseModal(onResume: () => void, onRestart: () => void, onSettings: () => void, onHome: () => void): void {
    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell">
        <div style="display:flex;justify-content:center;">
          <div class="rm-header-plaque">${svgIcon('pause')} ${i18n.t('paused')}</div>
        </div>
        <button class="rm-btn rm-btn-green" style="min-height:48px;" data-act="resume">${svgIcon('play')} ${i18n.t('resume')}</button>
        <button class="rm-btn" data-act="restart">${svgIcon('restart')} ${i18n.t('restart_run')}</button>
        <div style="display:flex;gap:8px;">
          <button class="rm-btn" style="flex:1;" data-act="settings">
            <img src="${UI_ICONS.gearElevator}" style="width:20px;height:20px;object-fit:contain;" alt="" /> ${i18n.t('settings')}
          </button>
          <button class="rm-btn rm-btn-gold" style="flex:1;" data-act="home">${svgIcon('home')} ${i18n.t('home_btn')}</button>
        </div>
      </div>
    `;
    this.backdrop.style.display = 'flex';
    this.backdrop.querySelector('[data-act="resume"]')?.addEventListener('click', () => {
      this.hide();
      onResume();
    });
    this.backdrop.querySelector('[data-act="restart"]')?.addEventListener('click', () => {
      this.hide();
      onRestart();
    });
    this.backdrop.querySelector('[data-act="settings"]')?.addEventListener('click', () => {
      this.hide();
      onSettings();
    });
    this.backdrop.querySelector('[data-act="home"]')?.addEventListener('click', () => {
      this.hide();
      onHome();
    });
  }

  showBiomeUnlockModal(
    biomeName: string,
    coinMultiplier: number,
    unlockedSkinNames: string[],
    onContinue: () => void
  ): void {
    const skinHtml =
      unlockedSkinNames.length > 0
        ? `<div class="rm-stat-plaque" style="border-color:#4ade80;padding:8px;">
            <div style="font-size:11px;color:#86efac;font-weight:900;">${i18n.t('skin_unlocked_badge').toUpperCase()}</div>
            <div style="font-size:15px;font-weight:900;color:#fffbeb;">${unlockedSkinNames.join(', ')}</div>
          </div>`
        : '';

    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell" style="border-color:#fbbf24;">
        <img src="${UI_ICONS.trophy}" class="rm-crown-icon" style="width:68px;height:68px;" alt="" />
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <div class="rm-new-best">${i18n.t('biome_unlocked_desc').toUpperCase()}</div>
          <div class="rm-header-plaque" style="color:#fde047;">${i18n.t('biome_unlocked_title')}</div>
        </div>
        <div class="rm-stat-plaque" style="border-color:#fbbf24;">
          <div style="font-size:22px;font-weight:900;color:#38bdf8;text-shadow:0 2px 0 #120c08;">${biomeName}</div>
          <div style="font-size:14px;font-weight:900;color:#fbbf24;">${coinMultiplier}x ${i18n.t('coin_mult_badge')}</div>
        </div>
        ${skinHtml}
        <button class="rm-btn rm-btn-green" style="min-height:50px;font-size:16px;" data-act="biome-go">
          ${svgIcon('elevatorCar')} ${i18n.t('descend_now')}
        </button>
      </div>
    `;
    this.backdrop.style.display = 'flex';
    this.backdrop.querySelector('[data-act="biome-go"]')?.addEventListener('click', () => {
      this.hide();
      onContinue();
    });
  }

  hide(): void {
    this.backdrop.style.display = 'none';
  }
}
