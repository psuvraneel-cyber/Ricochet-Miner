import type { MusicVolumeLevel } from '../audio/AudioEngine';
import { i18n, type SupportedLocale } from '../i18n/translations';
import type { SaveData } from '../sdk/SaveManager';
import { svgIcon } from './icons';
import { UI_ICONS } from './uiAssets';

const LOCALES: Array<{ code: SupportedLocale; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
];

export interface SettingsCallbacks {
  onToggleSfx: () => void;
  onToggleMusic: () => void;
  onSetMusicVolume: (level: MusicVolumeLevel) => void;
  onToggleAimMode: () => void;
  onSelectLocale: (locale: SupportedLocale) => void;
  onConfirmReset: () => void;
  onClose: () => void;
}

export class SettingsModal {
  private backdrop: HTMLElement;
  private confirmingReset = false;

  constructor(root: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'rm-modal-backdrop';
    this.backdrop.style.display = 'none';
    root.appendChild(this.backdrop);
  }

  open(save: SaveData, locale: SupportedLocale, callbacks: SettingsCallbacks): void {
    this.confirmingReset = false;
    this.render(save, locale, callbacks);
    this.backdrop.style.display = 'flex';
  }

  render(save: SaveData, locale: SupportedLocale, callbacks: SettingsCallbacks): void {
    if (this.confirmingReset) {
      this.backdrop.innerHTML = `
        <div class="arcade-modal-shell">
          <div style="display:flex;justify-content:center;">
            <div class="rm-header-plaque" style="color:#fca5a5;">${i18n.t('reset_progress')}</div>
          </div>
          <p style="margin:0;text-align:center;color:#e2e8f0;font-size:14px;line-height:1.45;">
            ${i18n.t('reset_confirm_desc')}
          </p>
          <div style="display:flex;gap:10px;">
            <button class="rm-btn rm-btn-primary" style="flex:1;" data-set="cancel-reset">${i18n.t('cancel_btn')}</button>
            <button class="rm-btn rm-btn-crimson" style="flex:1;" data-set="confirm-reset">${i18n.t('confirm_reset_btn')}</button>
          </div>
        </div>
      `;
      this.backdrop.querySelector('[data-set="cancel-reset"]')?.addEventListener('click', () => {
        this.confirmingReset = false;
        this.render(save, locale, callbacks);
      });
      this.backdrop.querySelector('[data-set="confirm-reset"]')?.addEventListener('click', () => {
        this.hide();
        callbacks.onConfirmReset();
      });
      return;
    }

    const langOpts = LOCALES.map(
      (l) => `<option value="${l.code}" ${l.code === locale ? 'selected' : ''}>${l.label}</option>`
    ).join('');
    const musicVol: MusicVolumeLevel =
      save.settings.musicVolume ?? (save.settings.musicMuted ? 'off' : 'high');

    this.backdrop.innerHTML = `
      <div class="arcade-modal-shell">
        <img src="${UI_ICONS.gearElevator}" class="rm-crown-icon" alt="" />
        <div class="rm-modal-header">
          <div class="rm-header-plaque">${i18n.t('settings')}</div>
          <button class="rm-btn rm-close-btn" data-set="close" aria-label="Close">${svgIcon('close')}</button>
        </div>

        <div class="rm-scroll-area">
          <div class="rm-upgrade-list">
            <button class="rm-btn" style="justify-content:space-between;" data-set="sfx">
              <span>${svgIcon(save.settings.sfxMuted ? 'soundOff' : 'soundOn')} ${i18n.t('sfx_label')}</span>
              <span style="color:${save.settings.sfxMuted ? '#fca5a5' : '#4ade80'};">${save.settings.sfxMuted ? i18n.t('vol_off') : 'ON'}</span>
            </button>

            <div class="rm-btn" style="justify-content:space-between;cursor:default;">
              <span style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;" data-set="music">
                ${svgIcon(musicVol === 'off' ? 'soundOff' : 'soundOn')} ${i18n.t('music_label')}
              </span>
              <span style="display:inline-flex;gap:4px;">
                <button class="rm-btn" style="min-height:28px;padding:3px 8px;font-size:11px;border-color:${musicVol === 'off' ? '#ef4444' : '#3f2e21'};color:${musicVol === 'off' ? '#fca5a5' : '#94a3b8'};" data-set="music-vol" data-vol="off">${i18n.t('vol_off')}</button>
                <button class="rm-btn" style="min-height:28px;padding:3px 8px;font-size:11px;border-color:${musicVol === 'low' ? '#fbbf24' : '#3f2e21'};color:${musicVol === 'low' ? '#fde047' : '#94a3b8'};" data-set="music-vol" data-vol="low">${i18n.t('vol_low')}</button>
                <button class="rm-btn" style="min-height:28px;padding:3px 8px;font-size:11px;border-color:${musicVol === 'high' ? '#22c55e' : '#3f2e21'};color:${musicVol === 'high' ? '#4ade80' : '#94a3b8'};" data-set="music-vol" data-vol="high">${i18n.t('vol_high')}</button>
              </span>
            </div>

            <button class="rm-btn" style="justify-content:space-between;" data-set="aim">
              <span>${svgIcon('orb')} ${i18n.t('aim_mode_label')}</span>
              <span style="color:#38bdf8;">${save.settings.aimMode === 'slingshot' ? i18n.t('aim_slingshot') : i18n.t('aim_direct')}</span>
            </button>

            <label class="rm-btn" style="justify-content:space-between;">
              <span style="display:inline-flex;align-items:center;gap:6px;">${svgIcon('globe')} ${i18n.t('language_label')}</span>
              <select data-set="lang" style="background:#181210;color:#fffbeb;border:1.5px solid #8c5a2b;border-radius:6px;padding:4px 8px;font-weight:800;font-size:13px;">
                ${langOpts}
              </select>
            </label>
          </div>
        </div>

        <button class="rm-btn rm-btn-crimson" data-set="reset" style="margin-top:4px;">
          ${i18n.t('reset_progress')}
        </button>
      </div>
    `;

    this.backdrop.querySelector('[data-set="close"]')?.addEventListener('click', () => {
      this.hide();
      callbacks.onClose();
    });
    this.backdrop.querySelector('[data-set="sfx"]')?.addEventListener('click', () => {
      callbacks.onToggleSfx();
      this.render(save, locale, callbacks);
    });
    this.backdrop.querySelector('[data-set="music"]')?.addEventListener('click', () => {
      callbacks.onToggleMusic();
      this.render(save, locale, callbacks);
    });
    this.backdrop.querySelectorAll('[data-set="music-vol"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vol = (btn as HTMLElement).dataset.vol as MusicVolumeLevel;
        callbacks.onSetMusicVolume(vol);
        this.render(save, locale, callbacks);
      });
    });
    this.backdrop.querySelector('[data-set="aim"]')?.addEventListener('click', () => {
      callbacks.onToggleAimMode();
      this.render(save, locale, callbacks);
    });
    this.backdrop.querySelector('[data-set="lang"]')?.addEventListener('change', (e) => {
      const next = (e.target as HTMLSelectElement).value as SupportedLocale;
      callbacks.onSelectLocale(next);
      this.render(save, next, callbacks);
    });
    this.backdrop.querySelector('[data-set="reset"]')?.addEventListener('click', () => {
      this.confirmingReset = true;
      this.render(save, locale, callbacks);
    });
  }

  hide(): void {
    this.backdrop.style.display = 'none';
  }
}
