import type { ViewportLayout } from '../core/ViewportManager';
import { i18n } from '../i18n/translations';
import { svgIcon } from './icons';

const RETICLE_SVG = `<svg viewBox="0 0 36 36" width="34" height="34" fill="none"><circle cx="18" cy="18" r="11" stroke="#fde047" stroke-width="2.5" stroke-dasharray="4 3"/><circle cx="18" cy="18" r="4" fill="#fbbf24" stroke="#181210" stroke-width="2"/><path d="M18 3v6M18 27v6M3 18h6M27 18h6" stroke="#fde047" stroke-width="2.5" stroke-linecap="round"/></svg>`;

export class FTUEOverlay {
  private el: HTMLDivElement;
  private iconEl: HTMLElement;
  private pillEl: HTMLElement;
  private aimMode: 'direct' | 'slingshot' = 'direct';

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'rm-ftue';
    this.el.innerHTML = `
      <div class="rm-ftue-hand">${RETICLE_SVG}</div>
      <div class="rm-pill rm-ftue-pill" style="margin-top:6px;border-color:#fde047;color:#fde047;">
        ${i18n.t('click_to_shoot')}
      </div>
    `;
    root.appendChild(this.el);
    this.iconEl = this.el.querySelector('.rm-ftue-hand')!;
    this.pillEl = this.el.querySelector('.rm-ftue-pill')!;
  }

  setAimMode(mode: 'direct' | 'slingshot'): void {
    this.aimMode = mode;
    this.refreshText();
  }

  updateLayout(layout: ViewportLayout): void {
    // Position strictly in the unobstructed open-air zone (Row 2-3 corridor: ~158 world Y, cleanly above Row 4 blocks at 240 Y)
    const targetWorldY = 152;
    const screenY = layout.topOffsetPx + targetWorldY * layout.scale;
    this.el.style.top = `${Math.round(screenY)}px`;
  }

  setVisible(visible: boolean): void {
    this.el.style.display = visible ? 'block' : 'none';
  }

  refreshText(): void {
    if (this.aimMode === 'slingshot') {
      this.iconEl.className = 'rm-ftue-hand';
      this.iconEl.innerHTML = svgIcon('handPointer');
      this.pillEl.textContent = i18n.t('drag_to_shoot');
    } else {
      this.iconEl.className = 'rm-ftue-reticle';
      this.iconEl.innerHTML = RETICLE_SVG;
      this.pillEl.textContent = i18n.t('click_to_shoot');
    }
  }
}
