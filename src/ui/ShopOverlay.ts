import { SKINS, UPGRADES, type UpgradeId } from '../config/gameConfig';
import { i18n, type TranslationKey } from '../i18n/translations';
import { sharedSpriteAtlas } from '../rendering/SpriteAtlas';
import { PlatformSDK } from '../sdk/PlatformSDK';
import type { SaveData } from '../sdk/SaveManager';
import type { EconomySystem } from '../systems/EconomySystem';
import type { ProgressionSystem } from '../systems/ProgressionSystem';
import type { SkinSystem } from '../systems/SkinSystem';
import { formatCompact } from '../utils/format';
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

export class ShopOverlay {
  private backdrop: HTMLElement;
  private tab: 'upgrades' | 'skins' = 'upgrades';
  private isOpen = false;

  constructor(root: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'rm-modal-backdrop';
    this.backdrop.style.display = 'none';
    root.appendChild(this.backdrop);
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
    this.render(save, economy, skins, progression, freeUpgradeCandidate, callbacks);
    this.backdrop.style.display = 'flex';
    if (PlatformSDK.supportsBanners) {
      PlatformSDK.requestBanner(BANNER_CONTAINER_ID);
    }
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

    const prestigeBtn = progression.canPrestige(save)
      ? `<button class="rm-btn rm-btn-gold" data-act="prestige">${svgIcon('lightning')} ${i18n.t('prestige_btn')} (+50%)</button>`
      : '';

    let bodyHtml = '';
    if (this.tab === 'upgrades') {
      const plaques = UPGRADES.map((spec) => {
        const level = economy.getLevel(save, spec.id);
        const maxLevel = economy.getMaxLevel(save, spec.id);
        const maxed = economy.isMaxLevel(save, spec.id);
        const cost = economy.getUpgradeCost(save, spec.id);
        const affordable = economy.canAfford(save, spec.id);
        const showFreeAd = freeUpgradeCandidate === spec.id;
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
              ${
                showFreeAd
                  ? `<button class="rm-btn rm-btn-gold" style="min-height:40px;padding:4px 8px;font-size:11px;" data-free-upg="${spec.id}">${svgIcon('adPlay')}</button>`
                  : ''
              }
              <button class="rm-btn rm-buy-btn ${maxed ? '' : affordable ? 'rm-btn-green' : 'unaffordable'}" data-upg="${spec.id}" ${maxed || !affordable ? 'disabled' : ''}>
                ${
                  maxed
                    ? i18n.t('maxed')
                    : `<img src="${UI_ICONS.oreValue}" style="width:16px;height:16px;object-fit:contain;" alt="" /> ${formatCompact(cost)}`
                }
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
          actionHtml = `
            <div style="display:flex;flex-direction:column;gap:4px;align-items:center;width:100%;">
              ${
                skin.coinCost
                  ? `<button class="rm-btn ${canBuyCoin ? 'rm-btn-green' : 'unaffordable'}" style="min-height:32px;font-size:11px;padding:4px 8px;width:100%;" data-coin-unlock="${skin.id}" ${canBuyCoin ? '' : 'disabled'}>
                      <img src="${UI_ICONS.oreValue}" style="width:15px;height:15px;object-fit:contain;" alt="" /> ${formatCompact(skin.coinCost)}
                    </button>`
                  : ''
              }
              ${
                skin.rvCost
                  ? `<button class="rm-btn rm-btn-gold" style="min-height:32px;font-size:11px;padding:4px 8px;width:100%;" data-rv-skin="${skin.id}">${svgIcon('adPlay')} ${rvDone}/${skin.rvCost}</button>`
                  : ''
              }
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

    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell">
        <div class="rm-modal-header">
          <div style="display:flex;gap:6px;">
            <button class="rm-btn ${this.tab === 'upgrades' ? 'rm-btn-primary' : ''}" data-tab="upgrades">
              <img src="${UI_ICONS.drillDamage}" style="width:18px;height:18px;object-fit:contain;" alt="" /> ${i18n.t('upgrades')}
            </button>
            <button class="rm-btn ${this.tab === 'skins' ? 'rm-btn-primary' : ''}" data-tab="skins">
              ${svgIcon('palette')} ${i18n.t('skins')}
            </button>
          </div>
          <button class="rm-btn rm-close-btn" data-act="close" aria-label="Close">${svgIcon('close')}</button>
        </div>
        ${bodyHtml}
        <div id="${BANNER_CONTAINER_ID}" class="rm-banner-slot"></div>
      </div>
    `;

    this.backdrop.querySelector('[data-act="close"]')?.addEventListener('click', () => {
      this.close();
      callbacks.onClose();
    });
    this.backdrop.querySelector('[data-tab="upgrades"]')?.addEventListener('click', () => {
      this.tab = 'upgrades';
      this.render(save, economy, skins, progression, freeUpgradeCandidate, callbacks);
    });
    this.backdrop.querySelector('[data-tab="skins"]')?.addEventListener('click', () => {
      this.tab = 'skins';
      this.render(save, economy, skins, progression, freeUpgradeCandidate, callbacks);
    });
    this.backdrop.querySelector('[data-act="prestige"]')?.addEventListener('click', callbacks.onPrestige);

    this.backdrop.querySelectorAll('[data-upg]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.upg as UpgradeId;
        callbacks.onBuyUpgrade(id);
      });
    });

    this.backdrop.querySelectorAll('[data-free-upg]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.freeUpg as UpgradeId;
        callbacks.onFreeUpgradeAd(id);
      });
    });

    this.backdrop.querySelectorAll('[data-equip]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.equip!;
        callbacks.onEquipSkin(id);
      });
    });

    this.backdrop.querySelectorAll('[data-coin-unlock]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.coinUnlock!;
        callbacks.onUnlockSkinCoins(id);
      });
    });

    this.backdrop.querySelectorAll('[data-rv-skin]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.rvSkin!;
        callbacks.onUnlockSkinAd(id);
      });
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.backdrop.style.display = 'none';
    if (PlatformSDK.supportsBanners) {
      PlatformSDK.clearBanner(BANNER_CONTAINER_ID);
    }
  }
}
