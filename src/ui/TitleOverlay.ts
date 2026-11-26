import { toRomanNumeral } from '../config/gameConfig';
import { i18n } from '../i18n/translations';
import { formatMeters } from '../utils/format';
import { svgIcon } from './icons';
import { UI_ICONS, getCrestUrlForTier } from './uiAssets';

export interface TitleOverlayCallbacks {
  onUserGesture?: () => void;
  onPlay: () => void;
  onToggleMute: () => void;
  onOpenSettings: () => void;
  onOpenSkins: () => void;
  onOpenAchievements: () => void;
}

export class TitleOverlay {
  private el: HTMLDivElement;
  private floatingCrestEl: HTMLDivElement;
  private visible = false;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'rm-title-overlay';
    this.el.style.display = 'none';
    root.appendChild(this.el);

    this.floatingCrestEl = document.createElement('div');
    this.floatingCrestEl.className = 'rm-floating-brand';
    this.floatingCrestEl.style.display = 'none';
    root.appendChild(this.floatingCrestEl);
  }

  showFloatingIntroBanner(logoUrl: string): void {
    this.floatingCrestEl.innerHTML = `<img src="${logoUrl}" alt="Ricochet Miner" />`;
    this.floatingCrestEl.classList.remove('fading');
    this.floatingCrestEl.style.display = 'flex';
  }

  dismissFloatingIntroBanner(): void {
    if (this.floatingCrestEl.style.display === 'none') return;
    this.floatingCrestEl.classList.add('fading');
    window.setTimeout(() => {
      this.floatingCrestEl.style.display = 'none';
      this.floatingCrestEl.classList.remove('fading');
    }, 240);
  }

  show(params: {
    logoUrl: string;
    bestDepthMeters: number;
    ascensionTier: number;
    hasUnclaimedFeats: boolean;
    muted: boolean;
    callbacks: TitleOverlayCallbacks;
  }): void {
    this.dismissFloatingIntroBanner();
    this.visible = true;
    this.el.classList.remove('hiding');
    this.el.style.display = 'flex';

    const tierHtml =
      params.ascensionTier >= 1
        ? `<div class="rm-ascension-crest-pill">
            <img src="${getCrestUrlForTier(params.ascensionTier)}" style="width:20px;height:20px;object-fit:contain;" alt="" />
            <img src="${UI_ICONS.badgeAscensionStar}" style="width:16px;height:16px;object-fit:contain;" alt="" />
            <span>${i18n.t('tier_label').toUpperCase()} ${toRomanNumeral(params.ascensionTier)}</span>
          </div>`
        : '';

    this.el.innerHTML = `
      <img src="${params.logoUrl}" class="rm-logo-img" alt="Ricochet Miner" />

      <button class="rm-btn rm-btn-green rm-play-btn" data-title="play" data-interactive="true">
        ${svgIcon('play')} ${i18n.t('play_btn')}
      </button>

      ${
        params.bestDepthMeters > 0
          ? `<div class="rm-pill" style="border-color:#fbbf24;">${svgIcon('pickaxe')} ${i18n.t('best_depth')}: ${formatMeters(params.bestDepthMeters)}</div>`
          : ''
      }
      ${tierHtml}

      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;">
        <button class="rm-btn" data-title="mute" data-interactive="true" aria-label="Mute">
          ${svgIcon(params.muted ? 'soundOff' : 'soundOn')}
        </button>
        <button class="rm-btn" data-title="skins" data-interactive="true">
          ${svgIcon('palette')} ${i18n.t('skins')}
        </button>
        <button class="rm-btn" data-title="achievements" data-interactive="true">
          <img src="${UI_ICONS.trophy}" style="width:18px;height:18px;object-fit:contain;" alt="" />
          ${i18n.t('achievements')}
          ${params.hasUnclaimedFeats ? '<span class="rm-dot"></span>' : ''}
        </button>
        <button class="rm-btn" data-title="settings" data-interactive="true">
          ${svgIcon('gear')} ${i18n.t('settings')}
        </button>
      </div>
    `;

    this.el.querySelector('[data-title="play"]')?.addEventListener('click', () => {
      params.callbacks.onUserGesture?.();
      this.hideAnimated(params.callbacks.onPlay);
    });
    this.el.querySelector('[data-title="mute"]')?.addEventListener('click', () => {
      params.callbacks.onUserGesture?.();
      params.callbacks.onToggleMute();
    });
    this.el.querySelector('[data-title="skins"]')?.addEventListener('click', () => {
      params.callbacks.onUserGesture?.();
      params.callbacks.onOpenSkins();
    });
    this.el.querySelector('[data-title="achievements"]')?.addEventListener('click', () => {
      params.callbacks.onUserGesture?.();
      params.callbacks.onOpenAchievements();
    });
    this.el.querySelector('[data-title="settings"]')?.addEventListener('click', () => {
      params.callbacks.onUserGesture?.();
      params.callbacks.onOpenSettings();
    });
  }

  hideAnimated(onDone: () => void): void {
    if (!this.visible) return;
    this.visible = false;
    this.el.classList.add('hiding');
    window.setTimeout(() => {
      this.el.style.display = 'none';
      this.el.classList.remove('hiding');
      onDone();
    }, 220);
  }

  hideImmediate(): void {
    this.visible = false;
    this.el.style.display = 'none';
  }
}
