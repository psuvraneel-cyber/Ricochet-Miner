import {
  getAscensionMilestone,
  toRomanNumeral,
} from '../config/gameConfig';
import { i18n, type TranslationKey } from '../i18n/translations';
import { formatCompact } from '../utils/format';
import { svgIcon } from './icons';
import { UI_ICONS, getCrestUrlForTier } from './uiAssets';

export interface AscensionVictoryOptions {
  newTier: number;
  blocksSmashed: number;
  maxCombo: number;
  coinsEarned: number;
  onDescendNextTier: () => void;
  onOpenUpgrades: () => void;
  onDoubleVictoryCoins: () => Promise<boolean>;
}

function renderStarsSvg(count: number): string {
  const clamped = Math.max(1, Math.min(4, count));
  const star = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 16.9 6.1 20l1.2-6.5L2.5 8.9l6.6-.9L12 2z" fill="#fde047" stroke="#1a1310" stroke-width="2" stroke-linejoin="round"/></svg>`;
  return new Array(clamped).fill(star).join('');
}

export class AscensionVictoryModal {
  private backdrop: HTMLElement;

  constructor(root: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'rm-modal-backdrop';
    this.backdrop.style.display = 'none';
    root.appendChild(this.backdrop);
  }

  show(opts: AscensionVictoryOptions): void {
    const milestone = getAscensionMilestone(opts.newTier);
    const tierTitle = i18n.t(milestone.titleKey as TranslationKey);
    const tierQuote = i18n.t(milestone.quoteKey as TranslationKey);
    const roman = toRomanNumeral(opts.newTier);
    const nextRoman = toRomanNumeral(opts.newTier + 1);
    const crestUrl = getCrestUrlForTier(opts.newTier);
    const nextCrestUrl = getCrestUrlForTier(opts.newTier + 1);
    const isPoki = typeof __PLATFORM__ !== 'undefined' && __PLATFORM__ === 'poki';

    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell rm-victory-shell">
        <div class="rm-sunburst" aria-hidden="true"></div>

        <div class="rm-victory-crest-wrap">
          <div class="rm-victory-stars">${renderStarsSvg(Math.min(2, opts.newTier))}</div>
          <img src="${crestUrl}" class="rm-victory-crest" alt="" />
          <div class="rm-victory-stars">${renderStarsSvg(Math.min(2, Math.max(1, opts.newTier - 1)))}</div>
        </div>

        <div class="rm-victory-ribbon">${i18n.t('one_shot_victory')}</div>

        <div style="text-align:center;position:relative;z-index:2;">
          <div class="rm-victory-title">${tierTitle.toUpperCase()} — ${i18n.t('tier_label').toUpperCase()} ${roman}</div>
          <div class="rm-victory-quote">"${tierQuote}"</div>
        </div>

        <div class="rm-scroll-area" style="position:relative;z-index:2;">
          <div class="rm-stat-row">
            <div class="rm-stat-plaque">
              <img src="${UI_ICONS.drillDamage}" style="width:32px;height:32px;object-fit:contain;" alt="" />
              <div style="font-size:10px;color:#cbd5e1;font-weight:900;letter-spacing:0.4px;">${i18n.t('blocks_smashed').toUpperCase()}</div>
              <div style="font-size:20px;font-weight:900;color:#fffbeb;text-shadow:0 2px 0 #120c08;">${formatCompact(opts.blocksSmashed)}</div>
            </div>
            <div class="rm-stat-plaque">
              <img src="${UI_ICONS.maxBounces}" style="width:32px;height:32px;object-fit:contain;" alt="" />
              <div style="font-size:10px;color:#cbd5e1;font-weight:900;letter-spacing:0.4px;">${i18n.t('max_combo_label').toUpperCase()}</div>
              <div style="font-size:20px;font-weight:900;color:#fde047;text-shadow:0 2px 0 #120c08;">${opts.maxCombo}x</div>
            </div>
            <div class="rm-stat-plaque">
              <img src="${UI_ICONS.oreValue}" style="width:32px;height:32px;object-fit:contain;" alt="" />
              <div style="font-size:10px;color:#cbd5e1;font-weight:900;letter-spacing:0.4px;">${i18n.t('earned_coins').toUpperCase()}</div>
              <div style="font-size:20px;font-weight:900;color:#fbbf24;text-shadow:0 2px 0 #120c08;" data-vic="coins">${formatCompact(opts.coinsEarned)}</div>
            </div>
            <div class="rm-stat-plaque" style="border-color:#d97706;">
              <img src="${nextCrestUrl}" style="width:32px;height:32px;object-fit:contain;" alt="" />
              <div style="font-size:10px;color:#fde68a;font-weight:900;letter-spacing:0.4px;">${i18n.t('next_tier_label').toUpperCase()} ${nextRoman}</div>
              <div style="font-size:10px;font-weight:900;color:#fffbeb;text-align:center;line-height:1.25;">${i18n.t('next_tier_preview')}</div>
            </div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;position:relative;z-index:2;flex-shrink:0;">
          <button class="rm-btn rm-btn-ascend" style="width:100%;min-height:48px;font-size:14px;" data-vic="descend">
            ${i18n.t('descend_to_tier').replace('{tier}', nextRoman)}
          </button>
          <div style="display:flex;gap:8px;">
            <button class="rm-btn rm-btn-primary" style="flex:1;min-height:44px;" data-vic="upgrades">
              <img src="${UI_ICONS.drillDamage}" style="width:18px;height:18px;object-fit:contain;" alt="" />
              ${i18n.t('upgrades').toUpperCase()}
            </button>
            ${
              opts.coinsEarned > 0
                ? `<button class="rm-btn rm-btn-gold" style="flex:1;min-height:44px;" data-vic="double">
                    ${svgIcon('adPlay')} ${i18n.t('double_victory_coins')}
                  </button>`
                : ''
            }
          </div>
        </div>
      </div>
    `;
    this.backdrop.style.display = 'flex';

    this.backdrop.querySelector('[data-vic="descend"]')?.addEventListener('click', () => {
      this.hide();
      opts.onDescendNextTier();
    });
    this.backdrop.querySelector('[data-vic="upgrades"]')?.addEventListener('click', () => {
      this.hide();
      opts.onOpenUpgrades();
    });
    const doubleBtn = this.backdrop.querySelector('[data-vic="double"]') as HTMLButtonElement | null;
    doubleBtn?.addEventListener('click', async () => {
      doubleBtn.disabled = true;
      const ok = await opts.onDoubleVictoryCoins();
      if (ok) {
        const coinsEl = this.backdrop.querySelector('[data-vic="coins"]');
        if (coinsEl) coinsEl.textContent = formatCompact(opts.coinsEarned * 2);
        doubleBtn.style.display = 'none';
      } else if (isPoki) {
        doubleBtn.style.display = 'none';
      } else {
        doubleBtn.disabled = false;
      }
    });
  }

  hide(): void {
    this.backdrop.style.display = 'none';
  }
}
