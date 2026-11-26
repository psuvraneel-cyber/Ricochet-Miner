import { SKINS, UPGRADES, type UpgradeId } from '../config/gameConfig';
import { i18n, type TranslationKey } from '../i18n/translations';
import { sharedSpriteAtlas } from '../rendering/SpriteAtlas';
import { PlatformSDK } from '../sdk/PlatformSDK';
import type { SaveData } from '../sdk/SaveManager';
import type { EconomySystem } from '../systems/EconomySystem';
import type { ProgressionSystem } from '../systems/ProgressionSystem';
import type { SkinSystem } from '../systems/SkinSystem';
import { formatCompact } from '../utils/format';
import { AdButton } from './AdButton';
import { svgIcon } from './icons';
import { UI_ICONS, UPGRADE_ICON_URLS } from './uiAssets';

export interface ShopCallbacks {
  onBuyUpgrade: (id: UpgradeId) => void;
  onFreeUpgradeAd: (id: UpgradeId) => void;
  onEquipSkin: (skinId: string) => void;
  onUnlockSkinCoins: (skinId: string) => void;
  onUnlockSkinAd: (skinId: string) => void;
  onPrestige: () => void;
  onClose: () => void;
}

const BANNER_CONTAINER_ID = 'rm-shop-banner-slot';
const MIN_BANNER_WIDTH_PX = 320;
const MIN_BANNER_HEIGHT_PX = 50;

export class ShopOverlay {
  private backdrop: HTMLElement;
  private shellEl: HTMLElement;
  private headerEl: HTMLElement;
  private bodyEl: HTMLElement;
  private bannerEl: HTMLElement;
  private tab: 'upgrades' | 'skins' = 'upgrades';
  private isOpen = false;
  private resizeObserver: ResizeObserver | null = null;
  private lastProps: {
    save: SaveData;
    economy: EconomySystem;
    skins: SkinSystem;
    progression: ProgressionSystem;
    freeUpgradeCandidate: UpgradeId | null;
    callbacks: ShopCallbacks;
  } | null = null;

  constructor(root: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'rm-modal-backdrop';
    this.backdrop.style.display = 'none';
    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell">
        <div class="rm-modal-header" data-shop="header"></div>
        <div class="rm-shop-body" data-shop="body" style="display:flex;flex-direction:column;gap:8px;flex:1 1 auto;min-height:0;overflow:hidden;"></div>
        <div id="${BANNER_CONTAINER_ID}" class="rm-banner-slot"></div>
      </div>
    `;
    root.appendChild(this.backdrop);

    this.shellEl = this.backdrop.querySelector('.arcade-modal-shell')!;
    this.headerEl = this.backdrop.querySelector('[data-shop="header"]')!;
    this.bodyEl = this.backdrop.querySelector('[data-shop="body"]')!;
    this.bannerEl = this.backdrop.querySelector(`#${BANNER_CONTAINER_ID}`)!;

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.evaluateBannerViewportFit());
      this.resizeObserver.observe(this.shellEl);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.evaluateBannerViewportFit());
    }
    PlatformSDK.onAdAvailabilityChange(() => {
      if (this.isOpen && this.lastProps) {
        const p = this.lastProps;
        this.render(p.save, p.economy, p.skins, p.progression, p.freeUpgradeCandidate, p.callbacks);
        this.evaluateBannerViewportFit();
      }
    });
  }

  private evaluateBannerViewportFit(): void {
    if (!this.isOpen) return;
    if (!PlatformSDK.canShowBanners()) {
      this.suppressBanner();
      return;
    }

    // Measure available modal interior width without shrinking banner below CrazyGames 320x50 floor
    const availW = this.bannerEl.clientWidth || this.shellEl.clientWidth - 44;
    const availH = window.innerHeight;
    if (availW < MIN_BANNER_WIDTH_PX || availH < 420) {
      this.suppressBanner();
      return;
    }

    this.bannerEl.classList.remove('suppressed');
    this.bannerEl.style.visibility = 'visible';
    this.bannerEl.style.height = availW >= 468 && availH >= 560 ? '60px' : `${MIN_BANNER_HEIGHT_PX}px`;

    // Verify slot does not overflow viewport bounds
    const rect = this.bannerEl.getBoundingClientRect();
    if (
      rect.width < MIN_BANNER_WIDTH_PX ||
      rect.height < MIN_BANNER_HEIGHT_PX ||
      rect.bottom > window.innerHeight ||
      rect.right > window.innerWidth
    ) {
      this.suppressBanner();
      return;
    }

    PlatformSDK.requestBanner(BANNER_CONTAINER_ID);
  }

  private suppressBanner(): void {
    PlatformSDK.clearAllBanners();
    this.bannerEl.classList.add('suppressed');
    this.bannerEl.style.height = '0px';
    this.bannerEl.style.visibility = 'hidden';
  }

  open(
    save: SaveData,
    economy: EconomySystem,
    skins: SkinSystem,
    progression: ProgressionSystem,
    freeUpgradeCandidate: UpgradeId | null,
    callbacks: ShopCallbacks,
    initialTab: 'upgrades' | 'skins' = 'upgrades'
  ): void {
    this.tab = initialTab;
    this.isOpen = true;
    this.lastProps = { save, economy, skins, progression, freeUpgradeCandidate, callbacks };
    this.render(save, economy, skins, progression, freeUpgradeCandidate, callbacks);
    this.backdrop.style.display = 'flex';
    this.evaluateBannerViewportFit();
  }

  render(
    save: SaveData,
    economy: EconomySystem,
    skins: SkinSystem,
    progression: ProgressionSystem,
    freeUpgradeCandidate: UpgradeId | null,
    callbacks: ShopCallbacks
  ): void {
    if (!this.isOpen) return;
    this.lastProps = { save, economy, skins, progression, freeUpgradeCandidate, callbacks };

    const prestigeBtn = progression.canPrestige(save)
      ? `<button class="rm-btn rm-btn-gold" data-act="prestige">${svgIcon('lightning')} ${i18n.t('prestige_btn')} (+50%)</button>`
      : '';

    this.headerEl.innerHTML = `
      <div style="display:flex;gap:6px;">
        <button class="rm-btn ${this.tab === 'upgrades' ? 'rm-btn-primary' : ''}" data-tab="upgrades">
          <img src="${UI_ICONS.drillDamage}" style="width:18px;height:18px;object-fit:contain;" alt="" /> ${i18n.t('upgrades')}
        </button>
        <button class="rm-btn ${this.tab === 'skins' ? 'rm-btn-primary' : ''}" data-tab="skins">
          ${svgIcon('palette')} ${i18n.t('skins')}
        </button>
      </div>
      <button class="rm-btn rm-close-btn" data-act="close" aria-label="Close">${svgIcon('close')}</button>
    `;

    let bodyHtml = '';
    if (this.tab === 'upgrades') {
      const plaques = UPGRADES.map((spec) => {
        const level = economy.getLevel(save, spec.id);
        const maxLevel = economy.getMaxLevel(save, spec.id);
        const maxed = economy.isMaxLevel(save, spec.id);
        const cost = economy.getUpgradeCost(save, spec.id);
        const affordable = economy.canAfford(save, spec.id);
        const freeAdBtn =
          freeUpgradeCandidate === spec.id
            ? AdButton.renderMarkup({
                labelHtml: '',
                attrs: `data-free-upg="${spec.id}" aria-label="${i18n.t('free_upgrade_cta')}"`,
                className: 'rm-btn rm-btn-gold',
                style: 'min-height:40px;padding:4px 8px;font-size:11px;',
                fallbackMode: 'hide',
              })
            : '';

        return `
          <div class="rm-upgrade-plaque">
            <div class="rm-icon-socket">
              <img src="${UPGRADE_ICON_URLS[spec.id]}" alt="" />
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span style="font-weight:900;font-size:13px;text-shadow:0 2px 0 #120c08;">${i18n.t(spec.nameKey as TranslationKey)}</span>
                <span class="rm-lv-pill">LV. ${level}/${maxLevel}</span>
              </div>
              <div style="font-size:11px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${i18n.t(spec.descKey as TranslationKey)}
              </div>
            </div>
            <div style="display:flex;gap:5px;align-items:center;">
              ${freeAdBtn}
              <button class="rm-btn rm-buy-btn ${maxed ? '' : affordable ? 'rm-btn-green' : 'unaffordable'}" data-upg="${spec.id}" ${maxed || !affordable ? 'disabled' : ''}>
                ${maxed ? i18n.t('maxed') : `${svgIcon('coin')} ${formatCompact(cost)}`}
              </button>
            </div>
          </div>
        `;
      }).join('');

      bodyHtml = `
        <div class="rm-scroll-area">
          <div class="rm-upgrade-list">${plaques}</div>
        </div>
        ${prestigeBtn}
      `;
    } else {
      const skinCards = SKINS.map((skin) => {
        const unlocked = save.unlockedSkins.includes(skin.id);
        const equipped = save.equippedSkin === skin.id;
        const rvDone = save.skinRvProgress[skin.id] ?? 0;
        const thumbUrl = sharedSpriteAtlas.getSkinThumbnailUrl(skin.id);
        let actionHtml = '';
        if (equipped) {
          actionHtml = `<span class="rm-btn rm-btn-gold" style="min-height:34px;font-size:11px;cursor:default;">${svgIcon('check')} ${i18n.t('equipped')}</span>`;
        } else if (unlocked) {
          actionHtml = `<button class="rm-btn rm-btn-green" style="min-height:34px;font-size:11px;" data-equip="${skin.id}">${i18n.t('select_btn')}</button>`;
        } else {
          const canBuyCoin = Boolean(skin.coinCost && save.coins >= skin.coinCost);
          const skinAdBtn = skin.rvCost
            ? AdButton.renderMarkup({
                labelHtml: `${rvDone}/${skin.rvCost}`,
                attrs: `data-rv-skin="${skin.id}"`,
                className: 'rm-btn rm-btn-gold',
                style: 'min-height:32px;font-size:11px;padding:4px 8px;width:100%;',
                fallbackMode: 'hide',
              })
            : '';

          actionHtml = `
            <div style="display:flex;flex-direction:column;gap:4px;align-items:center;width:100%;">
              ${
                skin.coinCost
                  ? `<button class="rm-btn ${canBuyCoin ? 'rm-btn-green' : 'unaffordable'}" style="min-height:32px;font-size:11px;padding:4px 8px;width:100%;" data-coin-unlock="${skin.id}" ${canBuyCoin ? '' : 'disabled'}>
                      ${svgIcon('coin')} ${formatCompact(skin.coinCost)}
                    </button>`
                  : ''
              }
              ${skinAdBtn}
              <span style="font-size:10px;color:#cbd5e1;display:inline-flex;align-items:center;gap:3px;">${svgIcon('lock')} ${i18n.t(skin.unlockDescKey as TranslationKey)}</span>
            </div>
          `;
        }

        return `
          <div class="rm-skin-card">
            <div class="rm-skin-showcase" style="border-color:${equipped ? '#fbbf24' : '#8c5a2b'};">
              <img src="${thumbUrl}" alt="${i18n.t(skin.nameKey as TranslationKey)}" />
            </div>
            <div class="rm-skin-name">${i18n.t(skin.nameKey as TranslationKey)}</div>
            ${actionHtml}
          </div>
        `;
      }).join('');

      bodyHtml = `<div class="rm-scroll-area"><div class="rm-upgrade-grid">${skinCards}</div></div>`;
    }

    this.bodyEl.innerHTML = bodyHtml;

    this.headerEl.querySelector('[data-act="close"]')?.addEventListener('click', () => {
      this.close();
      callbacks.onClose();
    });
    this.headerEl.querySelector('[data-tab="upgrades"]')?.addEventListener('click', () => {
      this.tab = 'upgrades';
      this.render(save, economy, skins, progression, freeUpgradeCandidate, callbacks);
    });
    this.headerEl.querySelector('[data-tab="skins"]')?.addEventListener('click', () => {
      this.tab = 'skins';
      this.render(save, economy, skins, progression, freeUpgradeCandidate, callbacks);
    });
    this.bodyEl.querySelector('[data-act="prestige"]')?.addEventListener('click', callbacks.onPrestige);

    this.bodyEl.querySelectorAll('[data-upg]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.upg as UpgradeId;
        callbacks.onBuyUpgrade(id);
      });
    });

    this.bodyEl.querySelectorAll('[data-free-upg]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.freeUpg as UpgradeId;
        callbacks.onFreeUpgradeAd(id);
      });
    });

    this.bodyEl.querySelectorAll('[data-equip]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.equip!;
        callbacks.onEquipSkin(id);
      });
    });

    this.bodyEl.querySelectorAll('[data-coin-unlock]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.coinUnlock!;
        callbacks.onUnlockSkinCoins(id);
      });
    });

    this.bodyEl.querySelectorAll('[data-rv-skin]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.rvSkin!;
        callbacks.onUnlockSkinAd(id);
      });
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.lastProps = null;
    this.backdrop.style.display = 'none';
    this.suppressBanner();
  }
}
