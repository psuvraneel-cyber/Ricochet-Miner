import { i18n } from '../i18n/translations';
import { svgIcon } from './icons';

export class FTUEOverlay {
  private el: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'rm-ftue';
    this.el.innerHTML = `
      <div class="rm-ftue-hand">${svgIcon('handPointer')}</div>
      <div class="rm-pill" style="margin-top:8px;border-color:#fde047;color:#fde047;">
        ${i18n.t('drag_to_shoot')}
      </div>
    `;
    root.appendChild(this.el);
  }

  setVisible(visible: boolean): void {
    this.el.style.display = visible ? 'block' : 'none';
  }

  refreshText(): void {
    const pill = this.el.querySelector('.rm-pill');
    if (pill) pill.textContent = i18n.t('drag_to_shoot');
  }
}
