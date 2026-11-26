import {
  ASCENSION_MILESTONES,
  MASTERY_FEATS,
  getAscensionCapBonus,
  getAscensionCoinMultiplier,
  getAscensionDamageBonus,
  getAscensionHpMultiplier,
  toRomanNumeral,
} from '../config/gameConfig';
import { i18n, type TranslationKey } from '../i18n/translations';
import type { SaveData } from '../sdk/SaveManager';
import { formatCompact } from '../utils/format';
import { svgIcon } from './icons';
import { UI_ICONS, getCrestUrlForTier } from './uiAssets';

const FEAT_BADGE_MAP: Record<string, string> = {
  chain_detonator: UI_ICONS.badgeChainDetonator,
  combo_master: UI_ICONS.badgeComboMaster,
  heavy_investor: UI_ICONS.badgeHeavyInvestor,
  zero_skip_purist: UI_ICONS.badgeZeroSkip,
};

export class AchievementsModal {
  private backdrop: HTMLElement;

  constructor(root: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'rm-modal-backdrop';
    this.backdrop.style.display = 'none';
    root.appendChild(this.backdrop);
  }

  open(save: SaveData, onClaimFeat: (featId: string) => void, onClose: () => void): void {
    this.render(save, onClaimFeat, onClose);
    this.backdrop.style.display = 'flex';
  }

  render(save: SaveData, onClaimFeat: (featId: string) => void, onClose: () => void): void {
    const tier = save.ascensionTier;
    const hpMult = getAscensionHpMultiplier(tier);
    const coinMult = getAscensionCoinMultiplier(tier);
    const capBonus = getAscensionCapBonus(tier);
    const dmgPct = Math.round((getAscensionDamageBonus(tier) - 1) * 100);
    const headerCrest = tier > 0 ? getCrestUrlForTier(tier) : UI_ICONS.badgeAscensionStar;
    const tierBanner =
      tier > 0
        ? `${i18n.t('tier_label').toUpperCase()} ${toRomanNumeral(tier)}`
        : i18n.t('no_ascension_yet');

    const tierPlaques = ASCENSION_MILESTONES.map((m) => {
      const unlocked = tier >= m.tier;
      const rec = save.ascensionRecords.find((r) =>
        m.tier === 4 ? r.tier >= 4 : r.tier === m.tier
      );
      const crestUrl = getCrestUrlForTier(m.tier);
      const roman = toRomanNumeral(m.tier);
      return `
        <div class="rm-achievement-card ${unlocked ? 'unlocked' : 'locked'}">
          <div class="rm-icon-socket" style="border-color:${unlocked ? '#fbbf24' : '#3b3531'};">
            <img src="${crestUrl}" style="${unlocked ? '' : 'filter:grayscale(1) brightness(0.45);'}" alt="" />
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span style="font-weight:900;font-size:13px;color:${unlocked ? '#fde047' : '#94a3b8'};">
                ${i18n.t(m.titleKey as TranslationKey)} (${i18n.t('tier_label')} ${roman}${m.tier === 4 ? '+' : ''})
              </span>
            </div>
            <div style="font-size:11px;color:${unlocked ? '#e2e8f0' : '#94a3b8'};">
              ${
                rec
                  ? `${i18n.t('blocks_smashed')}: ${formatCompact(rec.blocksSmashed)} • ${i18n.t('max_combo_label')}: ${rec.maxCombo}x`
                  : i18n.t('asc_req_hint').replace('{tier}', roman)
              }
            </div>
          </div>
          <span class="rm-lv-pill" style="border-color:${unlocked ? '#4ade80' : '#4a3728'};color:${unlocked ? '#4ade80' : '#94a3b8'};">
            ${unlocked ? svgIcon('check') : svgIcon('lock')}
          </span>
        </div>
      `;
    }).join('');

    const featPlaques = MASTERY_FEATS.map((f) => {
      const unlocked = save.unlockedAchievements.includes(f.id);
      const claimed = save.claimedAchievements.includes(f.id);
      const badgeUrl = FEAT_BADGE_MAP[f.id] ?? UI_ICONS.trophy;
      return `
        <div class="rm-achievement-card ${unlocked ? 'unlocked' : 'locked'}">
          <div class="rm-icon-socket" style="border-color:${unlocked ? '#fbbf24' : '#3b3531'};">
            <img src="${badgeUrl}" style="${unlocked ? '' : 'filter:grayscale(1) brightness(0.45);'}" alt="" />
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:900;font-size:13px;color:${unlocked ? '#fffbeb' : '#94a3b8'};">
              ${i18n.t(f.nameKey as TranslationKey)}
            </div>
            <div style="font-size:11px;color:#cbd5e1;">
              ${i18n.t(f.descKey as TranslationKey)}
            </div>
          </div>
          ${
            claimed
              ? `<span class="rm-lv-pill" style="color:#4ade80;border-color:#4ade80;">${i18n.t('claimed')}</span>`
              : unlocked
              ? `<button class="rm-btn rm-btn-green" style="min-height:36px;padding:4px 9px;font-size:11px;" data-feat-claim="${f.id}">
                  ${svgIcon('coin')} +${formatCompact(f.rewardCoins)}
                </button>`
              : `<span class="rm-lv-pill">${formatCompact(f.rewardCoins)}</span>`
          }
        </div>
      `;
    }).join('');

    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell">
        <div class="rm-modal-header">
          <div class="rm-header-plaque">
            <img src="${UI_ICONS.trophy}" style="width:22px;height:22px;object-fit:contain;" alt="" />
            ${i18n.t('hall_of_ascension')}
          </div>
          <button class="rm-btn rm-close-btn" data-act="close" aria-label="Close">${svgIcon('close')}</button>
        </div>

        <div class="rm-stat-plaque" style="flex-direction:row;justify-content:space-between;padding:8px 10px;border-color:#8c5a2b;flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="${headerCrest}" style="width:44px;height:44px;object-fit:contain;" alt="" />
            <div>
              <div style="font-weight:900;font-size:13px;color:#fde047;">${tierBanner}</div>
              <div style="font-size:11px;color:#e2e8f0;font-weight:800;">
                ${hpMult}x HP • ${coinMult.toFixed(2).replace(/\.00$/, '')}x ${i18n.t('coins')} • +${capBonus} Cap • +${dmgPct}% DMG
              </div>
            </div>
          </div>
        </div>

        <div class="rm-scroll-area">
          <div class="rm-upgrade-list">
            <div style="font-size:11px;font-weight:900;color:#fbbf24;letter-spacing:0.6px;margin-top:2px;">
              ${i18n.t('ascension_milestones').toUpperCase()}
            </div>
            ${tierPlaques}
            <div style="font-size:11px;font-weight:900;color:#38bdf8;letter-spacing:0.6px;margin-top:6px;">
              ${i18n.t('mastery_feats').toUpperCase()}
            </div>
            ${featPlaques}
          </div>
        </div>
      </div>
    `;

    this.backdrop.querySelector('[data-act="close"]')?.addEventListener('click', () => {
      this.hide();
      onClose();
    });
    this.backdrop.querySelectorAll('[data-feat-claim]').forEach((el) => {
      el.addEventListener('click', () => {
        onClaimFeat((el as HTMLElement).dataset.featClaim!);
        this.render(save, onClaimFeat, onClose);
      });
    });
  }

  hide(): void {
    this.backdrop.style.display = 'none';
  }
}
