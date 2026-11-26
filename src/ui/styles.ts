import lilitaOneUrl from '../assets/fonts/lilita-one.woff2';
import fredokaBoldUrl from '../assets/fonts/fredoka-bold.woff2';
import { UI_MODAL_FRAME_URL } from './uiAssets';

export function injectGameStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('rm-styles')) return;
  const style = document.createElement('style');
  style.id = 'rm-styles';
  style.textContent = `
    @font-face {
      font-family: 'Lilita One';
      src: url("${lilitaOneUrl}") format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Fredoka';
      src: url("${fredokaBoldUrl}") format('woff2');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
    html, body, #app, #ui-root {
      scrollbar-width: none;
      -ms-overflow-style: none;
      font-family: 'Fredoka', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    }
    html::-webkit-scrollbar,
    body::-webkit-scrollbar,
    .rm-modal::-webkit-scrollbar,
    .arcade-modal-shell::-webkit-scrollbar,
    .rm-scroll-area::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
    .rm-ico {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .rm-hud-stack {
      position: absolute;
      top: max(8px, env(safe-area-inset-top));
      left: max(8px, env(safe-area-inset-left));
      right: max(8px, env(safe-area-inset-right));
      display: flex;
      flex-direction: column;
      gap: 6px;
      pointer-events: none;
      z-index: 10;
    }
    .rm-hud-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 6px;
      pointer-events: none;
    }
    .rm-pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      min-width: 0;
    }
    .rm-pill-row-nowrap {
      flex-wrap: nowrap;
      flex-shrink: 0;
    }
    .rm-pill {
      background: linear-gradient(180deg, #4f3a2a 0%, #2d1e15 100%);
      border: 2.5px solid #1a1310;
      box-shadow: inset 0 2px 0 rgba(255, 240, 200, 0.25), 0 4px 0 #1a1310;
      border-radius: 12px;
      padding: 5px 10px;
      font-size: clamp(11px, 2.8vw, 14px);
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: #fffbeb;
      text-shadow: 0 2px 0 #1a1310;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: 42vw;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rm-btn {
      position: relative;
      min-width: 42px;
      min-height: 42px;
      border-radius: 12px;
      border: 2.5px solid #1a1310;
      background: linear-gradient(180deg, #624836 0%, #3b291d 100%);
      box-shadow: inset 0 2px 0 rgba(255, 245, 220, 0.28), 0 4px 0 #1a1310;
      color: #fffbeb;
      text-shadow: 0 2px 0 #1a1310;
      font-family: 'Lilita One', 'Fredoka', system-ui, sans-serif;
      font-size: clamp(12px, 2.7vw, 14px);
      font-weight: 700;
      letter-spacing: 0.3px;
      padding: 7px 11px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      overflow: visible;
      white-space: nowrap;
      transition: filter 0.1s ease, box-shadow 0.06s ease;
    }
    .rm-btn:hover:not(:disabled) {
      filter: brightness(1.07);
    }
    .rm-btn:active:not(:disabled) {
      transform: translateY(3px);
      box-shadow: inset 0 2px 0 rgba(255, 245, 220, 0.15), 0 1px 0 #1a1310;
    }
    .rm-btn-primary {
      background: linear-gradient(180deg, #38bdf8 0%, #0284c7 100%);
      box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.45), 0 4px 0 #0c4a6e, 0 6px 0 #1a1310;
    }
    .rm-btn-gold {
      background: linear-gradient(180deg, #fbbf24 0%, #d97706 100%);
      box-shadow: inset 0 2px 0 rgba(255, 255, 220, 0.55), 0 4px 0 #92400e, 0 6px 0 #1a1310;
      color: #fffbeb;
    }
    .rm-btn-green {
      background: linear-gradient(180deg, #4ade80 0%, #16a34a 100%);
      box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.5), 0 4px 0 #14532d, 0 6px 0 #1a1310;
    }
    .rm-btn-crimson {
      background: linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%);
      box-shadow: inset 0 2px 0 rgba(255, 220, 220, 0.3), 0 4px 0 #450a0a, 0 6px 0 #1a1310;
    }
    .rm-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .rm-badge-count {
      position: absolute;
      top: -7px;
      right: -7px;
      min-width: 20px;
      height: 20px;
      border-radius: 999px;
      background: #ef4444;
      border: 2px solid #1a1310;
      color: #ffffff;
      font-size: 11px;
      font-weight: 900;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }
    .rm-dot {
      position: absolute;
      top: 5px;
      right: 5px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #ef4444;
      border: 2px solid #1a1310;
    }
    .rm-arcade-console {
      position: absolute;
      bottom: max(10px, env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(180deg, #332720 0%, #1e1612 100%);
      border: 3px solid #1a1310;
      box-shadow: inset 0 2px 0 rgba(255, 235, 200, 0.16), 0 6px 18px rgba(0,0,0,0.65);
      border-radius: 16px;
      padding: 7px;
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: center;
      width: max-content;
      max-width: calc(100vw - 16px);
      z-index: 12;
      pointer-events: auto;
    }
    @media (min-width: 780px) and (min-aspect-ratio: 11/10) {
      .rm-hud-top > .rm-pill-row:first-child {
        max-width: max(180px, calc(var(--rm-shaft-x, 220px) - 16px));
      }
      .rm-boss-row {
        max-width: max(180px, calc(var(--rm-shaft-x, 220px) - 16px));
      }
      .rm-boss-bar {
        max-width: 100%;
        flex-wrap: wrap;
      }
      .rm-arcade-console {
        left: auto;
        right: 12px;
        bottom: 16px;
        transform: none;
        flex-direction: column;
        align-items: stretch;
        width: clamp(156px, calc(var(--rm-shaft-x, 220px) - 24px), 206px);
        padding: 9px;
        gap: 7px;
      }
    }
    .rm-bottom-bar {
      position: absolute;
      bottom: max(12px, env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 8px;
      justify-content: center;
      z-index: 12;
    }
    .rm-modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(10, 8, 7, 0.78);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: clamp(8px, 2.5vw, 16px);
      pointer-events: auto;
      z-index: 30;
    }
    .rm-modal,
    .arcade-modal-shell {
      position: relative;
      width: min(490px, 100%);
      max-height: 88dvh;
      overflow: hidden;
      background: #231b16;
      border-style: solid;
      border-width: clamp(14px, 3.2vw, 22px);
      border-image-source: url("${UI_MODAL_FRAME_URL}");
      border-image-slice: 74;
      border-image-repeat: stretch;
      box-shadow: inset 0 0 26px rgba(0, 0, 0, 0.75), 0 24px 55px rgba(0, 0, 0, 0.85);
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: #fffbeb;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .rm-scroll-area {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
      padding-right: 1px;
    }
    .rm-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .rm-header-plaque {
      background: linear-gradient(180deg, #4b3526 0%, #312117 100%);
      border: 2.5px solid #120c08;
      box-shadow: inset 0 2px 0 rgba(255, 225, 165, 0.25), 0 3px 0 #120c08;
      border-radius: 10px;
      padding: 6px 12px;
      color: #fbbf24;
      font-weight: 900;
      font-size: clamp(14px, 3.5vw, 18px);
      text-shadow: 0 2px 0 #120c08;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      letter-spacing: 0.4px;
      white-space: nowrap;
    }
    .rm-close-btn {
      min-width: 38px;
      min-height: 38px;
      padding: 6px;
      border-radius: 10px;
      background: linear-gradient(180deg, #7f1d1d 0%, #450a0a 100%);
      border: 2.5px solid #120c08;
      box-shadow: inset 0 2px 0 rgba(255, 200, 200, 0.25), 0 3px 0 #120c08;
      flex-shrink: 0;
    }
    .rm-crown-icon {
      width: 52px;
      height: 52px;
      object-fit: contain;
      display: block;
      margin: -2px auto 0 auto;
      flex-shrink: 0;
      filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.75));
    }
    .rm-new-best {
      align-self: center;
      background: linear-gradient(180deg, #fde047 0%, #d97706 100%);
      border: 2px solid #120c08;
      color: #120c08;
      font-size: 11px;
      font-weight: 900;
      padding: 2px 10px;
      border-radius: 999px;
      letter-spacing: 0.8px;
      box-shadow: 0 2px 0 #120c08;
    }
    .rm-stat-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .rm-stat-plaque {
      background: linear-gradient(180deg, #271d17 0%, #17110d 100%);
      border: 2.5px solid #6b4c30;
      box-shadow: inset 0 2px 0 rgba(255, 225, 170, 0.14), inset 0 -4px 10px rgba(0, 0, 0, 0.55), 0 3px 0 #120c08;
      border-radius: 12px;
      padding: 10px 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .rm-stat-coin-svg svg {
      width: 34px;
      height: 34px;
      display: block;
    }
    .rm-upgrade-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .rm-upgrade-plaque {
      background: linear-gradient(180deg, #3c2e24 0%, #271d16 100%);
      border: 2.5px solid #120c08;
      box-shadow: inset 0 2px 0 rgba(255, 235, 195, 0.16), 0 3px 0 #120c08;
      border-radius: 12px;
      padding: 7px 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .rm-icon-socket {
      width: 46px;
      height: 46px;
      border-radius: 10px;
      background: #181210;
      border: 2px solid #4a3728;
      box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 3px;
    }
    .rm-icon-socket img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .rm-lv-pill {
      display: inline-block;
      background: #181210;
      border: 1.5px solid #8c5a2b;
      color: #fbbf24;
      font-size: 10px;
      font-weight: 900;
      padding: 1px 6px;
      border-radius: 6px;
      letter-spacing: 0.4px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .rm-buy-btn {
      min-width: 78px;
      min-height: 40px;
      padding: 6px 9px;
      font-size: 12px;
      flex-shrink: 0;
    }
    .rm-buy-btn.unaffordable {
      opacity: 0.72;
      background: linear-gradient(180deg, #3b3531 0%, #24201d 100%);
      box-shadow: 0 3px 0 #120c08;
    }
    .rm-upgrade-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .rm-skin-card {
      background: linear-gradient(180deg, #3c2e24 0%, #241b16 100%);
      border: 2.5px solid #120c08;
      box-shadow: inset 0 2px 0 rgba(255, 235, 195, 0.16), 0 3px 0 #120c08;
      border-radius: 12px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      text-align: center;
      min-width: 0;
    }
    .rm-skin-name {
      font-weight: 900;
      font-size: 12px;
      text-shadow: 0 2px 0 #120c08;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rm-skin-showcase {
      width: 62px;
      height: 62px;
      border-radius: 14px;
      background: #181210;
      border: 2.5px solid #8c5a2b;
      box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 5px;
    }
    .rm-skin-showcase img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .rm-toast {
      position: absolute;
      top: 96px;
      left: 50%;
      transform: translateX(-50%);
      background: #1a1310;
      border: 2px solid #fbbf24;
      color: #fde047;
      padding: 8px 16px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 900;
      z-index: 60;
      pointer-events: none;
      white-space: nowrap;
      max-width: 90vw;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .rm-banner-slot {
      width: 100%;
      min-width: 320px;
      max-width: 728px;
      height: 50px;
      margin: 0 auto;
      background: transparent;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: #cbd5e1;
      flex-shrink: 0;
      overflow: hidden;
    }
    .rm-banner-slot.suppressed {
      min-width: 0;
      height: 0 !important;
      visibility: hidden;
      pointer-events: none;
      margin: 0;
      padding: 0;
    }
    .rm-ftue {
      position: absolute;
      top: calc(var(--rm-top-offset, 0px) + 150px);
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
      pointer-events: none;
      z-index: 15;
    }
    .rm-ftue-hand {
      display: inline-block;
      animation: rmPull 1.3s ease-in-out infinite;
    }
    .rm-ftue-reticle {
      display: inline-block;
      animation: rmReticleBob 1.5s ease-in-out infinite;
    }
    @keyframes rmReticleBob {
      0%, 100% { transform: translateY(0px); opacity: 0.95; }
      50% { transform: translateY(6px); opacity: 0.72; }
    }
    .rm-floating-brand {
      position: absolute;
      bottom: max(112px, 14vh);
      left: 50%;
      transform: translateX(-50%);
      z-index: 14;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.24s ease;
    }
    .rm-floating-brand img {
      width: min(210px, 46vw);
      max-height: 78px;
      object-fit: contain;
      filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.82));
    }
    .rm-floating-brand.fading {
      opacity: 0;
    }
    @keyframes rmPull {
      0%, 100% { transform: translateY(0px); opacity: 0.95; }
      50% { transform: translateY(28px); opacity: 0.65; }
    }
    .rm-title-overlay {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 35%, rgba(26, 19, 16, 0.45), rgba(10, 8, 7, 0.78));
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      padding: 20px;
      z-index: 25;
      pointer-events: auto;
      transition: opacity 0.22s ease, transform 0.22s ease;
    }
    .rm-title-overlay.hiding {
      opacity: 0;
      transform: scale(1.03);
      pointer-events: none;
    }
    .rm-logo-img {
      width: min(440px, 86vw);
      max-height: 36vh;
      object-fit: contain;
      filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.85));
      animation: rmLogoFloat 3.2s ease-in-out infinite;
      pointer-events: none;
    }
    .rm-boss-bar {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(26, 19, 16, 0.9);
      border: 2px solid #1a1310;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 900;
      color: #fde68a;
      pointer-events: none;
      box-shadow: 0 3px 0 #1a1310;
      max-width: calc(100vw - 24px);
    }
    .rm-boss-track {
      width: 78px;
      height: 8px;
      background: #2e2017;
      border: 1.5px solid #1a1310;
      border-radius: 999px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .rm-boss-fill {
      height: 100%;
      background: linear-gradient(90deg, #f59e0b, #ef4444);
      transition: width 0.15s ease;
    }
    .rm-boss-pulse {
      animation: rmBossPulse 0.9s ease-in-out infinite;
    }
    .rm-gate-hp-bar {
      align-self: center;
      width: min(360px, calc(100vw - 24px));
      background: linear-gradient(180deg, #3b1318 0%, #220b0e 100%);
      border: 2.5px solid #1a1310;
      border-radius: 12px;
      padding: 5px 10px;
      box-shadow: inset 0 2px 0 rgba(255, 180, 180, 0.2), 0 4px 0 #1a1310;
      display: none;
      flex-direction: column;
      gap: 4px;
      pointer-events: none;
    }
    .rm-gate-hp-bar.critical {
      border-color: #fbbf24;
      animation: rmGateCritical 0.75s ease-in-out infinite;
    }
    @keyframes rmGateCritical {
      0%, 100% { box-shadow: 0 0 8px rgba(251, 191, 36, 0.45), 0 4px 0 #1a1310; }
      50% { box-shadow: 0 0 18px rgba(239, 68, 68, 0.85), 0 4px 0 #1a1310; }
    }
    .rm-gate-hp-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 900;
      color: #fecaca;
      text-shadow: 0 1px 0 #120c08;
    }
    .rm-gate-hp-track {
      width: 100%;
      height: 10px;
      background: #18090b;
      border: 1.5px solid #120c08;
      border-radius: 999px;
      overflow: hidden;
    }
    .rm-gate-hp-fill {
      height: 100%;
      background: linear-gradient(90deg, #ef4444 0%, #f97316 55%, #fde047 100%);
      transition: width 0.08s linear;
    }
    .rm-boss-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      pointer-events: none;
    }
    .rm-fullshaft-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: linear-gradient(180deg, #4b3519 0%, #2d1d0b 100%);
      border: 2px solid #fbbf24;
      box-shadow: 0 3px 0 #1a1310, 0 0 10px rgba(251, 191, 36, 0.35);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 900;
      color: #fde047;
      text-shadow: 0 1px 0 #120c08;
      white-space: nowrap;
    }
    .rm-ascension-crest-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: linear-gradient(180deg, #6b4c14 0%, #3d2807 100%);
      border: 2px solid #fde047;
      box-shadow: inset 0 1px 0 rgba(255, 250, 210, 0.4), 0 3px 0 #1a1310;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 900;
      color: #fffbeb;
      text-shadow: 0 1px 0 #120c08;
      white-space: nowrap;
    }
    .rm-victory-shell {
      overflow: visible;
      padding-top: 38px;
    }
    .rm-sunburst {
      position: absolute;
      top: -90px;
      left: 50%;
      width: 260px;
      height: 260px;
      margin-left: -130px;
      background: conic-gradient(
        from 0deg,
        rgba(253, 224, 71, 0.28) 0deg 15deg,
        transparent 15deg 30deg,
        rgba(251, 191, 36, 0.26) 30deg 45deg,
        transparent 45deg 60deg,
        rgba(253, 224, 71, 0.28) 60deg 75deg,
        transparent 75deg 90deg,
        rgba(251, 191, 36, 0.26) 90deg 105deg,
        transparent 105deg 120deg,
        rgba(253, 224, 71, 0.28) 120deg 135deg,
        transparent 135deg 150deg,
        rgba(251, 191, 36, 0.26) 150deg 165deg,
        transparent 165deg 180deg,
        rgba(253, 224, 71, 0.28) 180deg 195deg,
        transparent 195deg 210deg,
        rgba(251, 191, 36, 0.26) 210deg 225deg,
        transparent 225deg 240deg,
        rgba(253, 224, 71, 0.28) 240deg 255deg,
        transparent 255deg 270deg,
        rgba(251, 191, 36, 0.26) 270deg 285deg,
        transparent 285deg 300deg,
        rgba(253, 224, 71, 0.28) 300deg 315deg,
        transparent 315deg 330deg,
        rgba(251, 191, 36, 0.26) 330deg 345deg,
        transparent 345deg 360deg
      );
      border-radius: 50%;
      mask-image: radial-gradient(circle, #000 18%, transparent 72%);
      -webkit-mask-image: radial-gradient(circle, #000 18%, transparent 72%);
      animation: rmSunburstSpin 18s linear infinite;
      pointer-events: none;
      z-index: 1;
    }
    @keyframes rmSunburstSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .rm-victory-crest-wrap {
      position: absolute;
      top: -54px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      z-index: 3;
      pointer-events: none;
    }
    .rm-victory-crest {
      width: 86px;
      height: 86px;
      object-fit: contain;
      filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.85));
    }
    .rm-victory-stars {
      display: inline-flex;
      gap: 2px;
      filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.85));
    }
    .rm-victory-ribbon {
      align-self: center;
      position: relative;
      z-index: 2;
      background: linear-gradient(180deg, #4b3526 0%, #2b1c12 100%);
      border: 2.5px solid #fbbf24;
      box-shadow: inset 0 2px 0 rgba(255, 240, 200, 0.3), 0 4px 0 #120c08;
      border-radius: 10px;
      padding: 4px 16px;
      color: #fde68a;
      font-weight: 900;
      font-size: 13px;
      letter-spacing: 0.8px;
      text-shadow: 0 2px 0 #120c08;
    }
    .rm-victory-title {
      font-size: clamp(18px, 4.4vw, 22px);
      font-weight: 900;
      color: #fde047;
      text-shadow: 0 3px 0 #120c08;
      letter-spacing: 0.6px;
      margin-top: 2px;
    }
    .rm-victory-quote {
      font-size: 12px;
      font-style: italic;
      color: #fef3c7;
      line-height: 1.35;
      margin-top: 4px;
      text-shadow: 0 1px 0 #120c08;
    }
    .rm-btn-ascend {
      background: linear-gradient(180deg, #dc2626 0%, #b45309 100%);
      border-color: #fde047;
      box-shadow: inset 0 2px 0 rgba(255, 235, 190, 0.5), 0 4px 0 #7f1d1d, 0 6px 0 #1a1310;
      color: #fffbeb;
    }
    .rm-teaser-banner {
      background: linear-gradient(180deg, #4a3118 0%, #2a1b0d 100%);
      border: 2.5px solid #fbbf24;
      border-radius: 12px;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: inset 0 2px 0 rgba(255, 235, 195, 0.2), 0 3px 0 #120c08;
    }
    .rm-achievement-card {
      background: linear-gradient(180deg, #3c2e24 0%, #271d16 100%);
      border: 2.5px solid #120c08;
      box-shadow: inset 0 2px 0 rgba(255, 235, 195, 0.16), 0 3px 0 #120c08;
      border-radius: 12px;
      padding: 7px 9px;
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }
    .rm-achievement-card.unlocked {
      border-color: #fbbf24;
    }
    .rm-achievement-card.locked {
      opacity: 0.78;
    }
    @keyframes rmBossPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.24); }
    }
    .rm-skin-thumb {
      width: 40px;
      height: 40px;
      object-fit: contain;
      flex-shrink: 0;
      filter: drop-shadow(0 2px 2px rgba(0,0,0,0.6));
    }
    @keyframes rmLogoFloat {
      0%, 100% { transform: translateY(-4px); }
      50% { transform: translateY(4px); }
    }
    .rm-play-btn {
      min-width: 210px;
      min-height: 58px;
      font-size: 22px;
      letter-spacing: 1px;
      border-radius: 16px;
      box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.5), 0 5px 0 #14532d, 0 8px 18px rgba(34, 197, 94, 0.35);
    }
    @media (max-width: 430px) {
      .rm-pill {
        padding: 4px 8px;
        font-size: 11px;
        max-width: 39vw;
      }
      .rm-arcade-console .rm-btn {
        min-height: 38px;
        padding: 6px 8px;
        font-size: 11px;
      }
      .rm-icon-socket {
        width: 40px;
        height: 40px;
      }
      .rm-buy-btn {
        min-width: 68px;
        min-height: 38px;
        padding: 5px 7px;
        font-size: 11px;
      }
      .rm-boss-track {
        width: 62px;
      }
    }
  `;
  document.head.appendChild(style);
}
