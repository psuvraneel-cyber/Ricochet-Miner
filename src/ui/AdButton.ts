import { PlatformSDK } from '../sdk/PlatformSDK';
import { svgIcon } from './icons';

export interface AdButtonRenderOptions {
  labelHtml: string;
  attrs: string;
  className?: string;
  style?: string;
  fallbackMode?: 'hide' | 'coin_alt';
  coinAltHtml?: string;
  coinAltAttrs?: string;
  coinAltClassName?: string;
  coinAltDisabled?: boolean;
}

/**
 * Centralized rewarded-ad CTA helper ensuring zero dead/clickable ad buttons render
 * during CrazyGames Basic Launch, AdBlock sessions, or unfilled ad error states.
 */
export class AdButton {
  static isAvailable(): boolean {
    return PlatformSDK.canShowRewardedAds();
  }

  static renderMarkup(opts: AdButtonRenderOptions): string {
    if (this.isAvailable()) {
      const cls = opts.className ?? 'rm-btn rm-btn-gold';
      const st = opts.style ? ` style="${opts.style}"` : '';
      return `<button class="${cls}"${st} data-ad-cta="true" ${opts.attrs}>${svgIcon('adPlay')} ${opts.labelHtml}</button>`;
    }

    if (opts.fallbackMode === 'coin_alt' && opts.coinAltHtml) {
      const cls = opts.coinAltClassName ?? 'rm-btn rm-btn-green';
      const st = opts.style ? ` style="${opts.style}"` : '';
      const dis = opts.coinAltDisabled ? ' disabled' : '';
      return `<button class="${cls}"${st} ${opts.coinAltAttrs ?? ''}${dis}>${opts.coinAltHtml}</button>`;
    }

    return '';
  }

  static syncVisibility(el: HTMLElement | null, extraAllowed: boolean = true): void {
    if (!el) return;
    const show = extraAllowed && this.isAvailable();
    el.style.display = show ? 'inline-flex' : 'none';
  }
}
