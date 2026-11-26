import { toRomanNumeral } from '../config/gameConfig';
import { i18n } from '../i18n/translations';
import { formatCompact, formatMeters } from '../utils/format';
import { svgIcon } from './icons';
import { UI_ICONS } from './uiAssets';

export interface RunSummaryOptions {
  coinsEarned: number;
  maxDepthMeters: number;
  isNewBest: boolean;
  affordableUpgradeCount: number;
  showDoubleAd: boolean;
  showExtraLaunchAd: boolean;
  clearedBiome6ViaElevator?: boolean;
  currentAscensionTier?: number;
  onStartZeroMeterRun?: () => void;
  onRelaunch: () => void;
  onOpenShop: () => void;
  onDoubleAd: () => void;
  onExtraLaunchAd: () => void;
}

export class RunSummaryModal {
  private backdrop: HTMLElement;

  constructor(root: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'rm-modal-backdrop';
    this.backdrop.style.display = 'none';
    root.appendChild(this.backdrop);
  }

  show(opts: RunSummaryOptions): void {
    const nextRoman = toRomanNumeral((opts.currentAscensionTier ?? 0) + 1);
    const teaserHtml = opts.clearedBiome6ViaElevator
      ? `
        <div class="rm-teaser-banner">
          <img src="${UI_ICONS.badgeZeroSkip}" style="width:42px;height:42px;object-fit:contain;flex-shrink:0;" alt="" />
          <div style="flex:1;min-width:0;">
            <div style="font-weight:900;font-size:13px;color:#fde047;">${i18n.t('elevator_clear_title')}</div>
            <div style="font-size:11px;color:#fffbeb;line-height:1.3;">${i18n.t('elevator_clear_desc').replace('{tier}', nextRoman)}</div>
          </div>
          <button class="rm-btn rm-btn-gold" style="min-height:38px;padding:6px 10px;font-size:11px;flex-shrink:0;" data-act="start0m">
            ${i18n.t('start_0m_run')}
          </button>
        </div>
      `
      : '';

    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell">
        <img src="${UI_ICONS.trophy}" class="rm-crown-icon" style="width:64px;height:64px;" alt="" />
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          ${opts.isNewBest ? `<div class="rm-new-best">${i18n.t('new_best_badge')}</div>` : ''}
          <div class="rm-header-plaque">${i18n.t('run_complete')}</div>
        </div>

        ${teaserHtml}

        <div class="rm-stat-row">
          <div class="rm-stat-plaque">
            <img src="${UI_ICONS.oreValue}" style="width:36px;height:36px;object-fit:contain;" alt="" />
            <div style="font-size:11px;color:#cbd5e1;font-weight:800;">${i18n.t('earned_coins')}</div>
            <div style="font-size:21px;font-weight:900;color:#fbbf24;text-shadow:0 2px 0 #120c08;">${formatCompact(opts.coinsEarned)}</div>
          </div>
          <div class="rm-stat-plaque">
            <img src="${UI_ICONS.drillDamage}" style="width:36px;height:36px;object-fit:contain;" alt="" />
            <div style="font-size:11px;color:#cbd5e1;font-weight:800;">${i18n.t('max_depth')}</div>
            <div style="font-size:21px;font-weight:900;color:#fffbeb;text-shadow:0 2px 0 #120c08;">${formatMeters(opts.maxDepthMeters)}</div>
          </div>
        </div>

        <div style="display:flex;gap:8px;">
          <button class="rm-btn rm-btn-green" style="flex:1.15;min-height:50px;" data-act="relaunch">
            ${svgIcon('play')} ${i18n.t('launch_again')}
          </button>
          <button class="rm-btn rm-btn-primary" style="flex:1;min-height:50px;" data-act="shop">
            <img src="${UI_ICONS.drillDamage}" style="width:20px;height:20px;object-fit:contain;" alt="" />
            ${i18n.t('upgrades')}
            ${opts.affordableUpgradeCount > 0 ? `<span class="rm-badge-count">${opts.affordableUpgradeCount}</span>` : ''}
          </button>
        </div>

        ${
          opts.showExtraLaunchAd
            ? `<button class="rm-btn rm-btn-gold" data-act="extra">${svgIcon('adPlay')} ${i18n.t('extra_launch_cta')}</button>`
            : ''
        }
        ${
          opts.showDoubleAd
            ? `<button class="rm-btn rm-btn-gold" data-act="double">
                <img src="${UI_ICONS.oreValue}" style="width:20px;height:20px;object-fit:contain;" alt="" />
                ${svgIcon('adPlay')} ${i18n.t('double_run_cta')}
              </button>`
            : ''
        }
      </div>
    `;
    this.backdrop.style.display = 'flex';

    this.backdrop.querySelector('[data-act="start0m"]')?.addEventListener('click', () => {
      this.hide();
      opts.onStartZeroMeterRun?.();
    });
    this.backdrop.querySelector('[data-act="relaunch"]')?.addEventListener('click', () => {
      this.hide();
      opts.onRelaunch();
    });
    this.backdrop.querySelector('[data-act="shop"]')?.addEventListener('click', () => {
      this.hide();
      opts.onOpenShop();
    });
    this.backdrop.querySelector('[data-act="double"]')?.addEventListener('click', opts.onDoubleAd);
    this.backdrop.querySelector('[data-act="extra"]')?.addEventListener('click', opts.onExtraLaunchAd);
  }

  hide(): void {
    this.backdrop.style.display = 'none';
  }
}
