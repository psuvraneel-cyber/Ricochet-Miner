import type { ArtifactId, ArtifactSpec } from '../config/gameConfig';
import { i18n, type TranslationKey } from '../i18n/translations';
import { svgIcon } from './icons';
import { UI_ICONS } from './uiAssets';

export interface PerkDraftOptions {
  choices: ArtifactSpec[];
  currentStacks: Partial<Record<ArtifactId, number>>;
  source: 'vault' | 'boss';
  onSelect: (id: ArtifactId) => void;
}

export class PerkDraftModal {
  private backdrop: HTMLElement;
  private isOpen = false;

  constructor(root: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'rm-modal-backdrop';
    this.backdrop.style.display = 'none';
    root.appendChild(this.backdrop);
  }

  get openState(): boolean {
    return this.isOpen;
  }

  show(opts: PerkDraftOptions): void {
    this.isOpen = true;
    const title = opts.source === 'boss' ? i18n.t('perk_draft_boss_title') : i18n.t('perk_draft_title');
    const cardsHtml = opts.choices
      .map((spec) => {
        const current = opts.currentStacks[spec.id] ?? 0;
        const badgeText = current > 0 ? `${i18n.t('perk_stack')} ${current + 1}` : i18n.t('perk_new');
        return `
          <button class="rm-perk-card" data-interactive="true" data-perk="${spec.id}" style="border-color:${spec.accentColor};">
            <div class="rm-perk-badge" style="background:${spec.accentColor};">${badgeText}</div>
            <div class="rm-perk-icon-wrap">
              <img src="${UI_ICONS.perkCard}" class="rm-perk-card-bg" alt="" />
              <span class="rm-perk-ico">${svgIcon(spec.icon)}</span>
            </div>
            <div class="rm-perk-title">${i18n.t(spec.nameKey as TranslationKey)}</div>
            <div class="rm-perk-desc">${i18n.t(spec.descKey as TranslationKey)}</div>
          </button>
        `;
      })
      .join('');

    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell rm-perk-modal-shell">
        <div class="rm-title-ribbon-wrap">
          <img src="${UI_ICONS.titleRibbon}" class="rm-title-ribbon-bg" alt="" />
          <div class="rm-title-ribbon-txt">${title}</div>
        </div>
        <div class="rm-perk-sub">${i18n.t('perk_draft_subtitle')}</div>
        <div class="rm-perk-grid">${cardsHtml}</div>
      </div>
    `;
    this.backdrop.style.display = 'flex';

    this.backdrop.querySelectorAll('[data-perk]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.perk as ArtifactId;
        this.hide();
        opts.onSelect(id);
      });
    });
  }

  hide(): void {
    this.isOpen = false;
    this.backdrop.style.display = 'none';
  }
}
