import iconCoinHeroUrl from '../assets/icon_coin_hero.webp';
import iconDroneBadgeUrl from '../assets/icon_drone_badge.webp';

export type IconName =
  | 'coin'
  | 'drone'
  | 'pickaxe'
  | 'pause'
  | 'play'
  | 'soundOn'
  | 'soundOff'
  | 'upgradePickaxe'
  | 'questClipboard'
  | 'streakArrows'
  | 'elevatorCar'
  | 'adPlay'
  | 'handPointer'
  | 'globe'
  | 'palette'
  | 'lightning'
  | 'orb'
  | 'blast'
  | 'clover'
  | 'gem'
  | 'close'
  | 'lock'
  | 'check'
  | 'fastForward'
  | 'recall'
  | 'restart'
  | 'gear'
  | 'home'
  | 'bossCore';

const SVG_MAP: Record<IconName, string> = {
  coin: `<img src="${iconCoinHeroUrl}" width="18" height="18" style="width:18px;height:18px;object-fit:contain;display:block;" alt="" />`,
  drone: `<img src="${iconDroneBadgeUrl}" width="18" height="18" style="width:18px;height:18px;object-fit:contain;display:block;" alt="" />`,
  pickaxe: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M5 19L15 9" stroke="#d97706" stroke-width="3" stroke-linecap="round"/><path d="M9 5c4-1 8 1 10 5l-3 2c-1.5-2.5-4-3.8-7-4V5z" fill="#94a3b8" stroke="#1a1310" stroke-width="2" stroke-linejoin="round"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><rect x="6" y="5" width="4.5" height="14" rx="1.5" fill="#f8fafc" stroke="#1a1310" stroke-width="1.8"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.5" fill="#f8fafc" stroke="#1a1310" stroke-width="1.8"/></svg>`,
  play: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M7 5l12 7-12 7V5z" fill="#f8fafc" stroke="#1a1310" stroke-width="2" stroke-linejoin="round"/></svg>`,
  soundOn: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M4 9h4l5-4v14l-5-4H4V9z" fill="#f8fafc" stroke="#1a1310" stroke-width="2" stroke-linejoin="round"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M4 9h4l5-4v14l-5-4H4V9z" fill="#94a3b8" stroke="#1a1310" stroke-width="2" stroke-linejoin="round"/><path d="M16 9l5 6m0-6l-5 6" stroke="#ef4444" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  upgradePickaxe: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M5 19L15 9" stroke="#fde68a" stroke-width="3" stroke-linecap="round"/><path d="M8 4c5-1 9 2 11 6l-3 2c-1.5-2.5-4.5-4-8-4.5V4z" fill="#38bdf8" stroke="#1a1310" stroke-width="2" stroke-linejoin="round"/></svg>`,
  questClipboard: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><rect x="5" y="4" width="14" height="16" rx="2.5" fill="#e2e8f0" stroke="#1a1310" stroke-width="2"/><rect x="9" y="2" width="6" height="4" rx="1" fill="#fbbf24" stroke="#1a1310" stroke-width="1.8"/><path d="M8.5 11h7M8.5 15h5" stroke="#334155" stroke-width="2" stroke-linecap="round"/></svg>`,
  streakArrows: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M7 18V7m0 0l-3.5 3.5M7 7l3.5 3.5M17 18V7m0 0l-3.5 3.5M17 7l3.5 3.5" stroke="#fb923c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  elevatorCar: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><rect x="5" y="4" width="14" height="16" rx="2" fill="#64748b" stroke="#1a1310" stroke-width="2"/><path d="M12 8l3 3.5H9L12 8zm0 8l-3-3.5h6L12 16z" fill="#fde047"/></svg>`,
  adPlay: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" fill="#fffbeb" stroke="#1a1310" stroke-width="2"/><path d="M10 9l6 3-6 3V9z" fill="#d97706" stroke="#1a1310" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  handPointer: `<svg viewBox="0 0 36 36" width="38" height="38" fill="none"><path d="M18 4v14m0 0l-5-5m5 5l5-5" stroke="#fde047" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="27" r="6" fill="#fbbf24" stroke="#1a1310" stroke-width="2.5"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><circle cx="12" cy="12" r="9" fill="#38bdf8" stroke="#1a1310" stroke-width="2"/><ellipse cx="12" cy="12" rx="4" ry="9" stroke="#1a1310" stroke-width="1.6"/><path d="M3.5 9h17M3.5 15h17" stroke="#1a1310" stroke-width="1.6"/></svg>`,
  palette: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><circle cx="12" cy="12" r="9" fill="#e879f9" stroke="#1a1310" stroke-width="2"/><circle cx="9" cy="10" r="1.8" fill="#fde047"/><circle cx="14.5" cy="9.5" r="1.8" fill="#38bdf8"/><circle cx="14" cy="14.5" r="1.8" fill="#4ade80"/></svg>`,
  lightning: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="#fde047" stroke="#1a1310" stroke-width="2" stroke-linejoin="round"/></svg>`,
  orb: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><circle cx="12" cy="12" r="8" fill="#c084fc" stroke="#1a1310" stroke-width="2"/><circle cx="9.5" cy="9.5" r="2.2" fill="#f5d0fe"/></svg>`,
  blast: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M12 2l2.5 5.5L20 6l-3 5.5L22 14l-5.5 2L18 21l-5.5-2.5L9 22l-1-5.5L2 15l4.5-3.5L4 6l5.5 1.5L12 2z" fill="#fb923c" stroke="#1a1310" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  clover: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><circle cx="9" cy="9" r="4" fill="#4ade80" stroke="#1a1310" stroke-width="1.8"/><circle cx="15" cy="9" r="4" fill="#4ade80" stroke="#1a1310" stroke-width="1.8"/><circle cx="12" cy="14.5" r="4" fill="#4ade80" stroke="#1a1310" stroke-width="1.8"/></svg>`,
  gem: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M6 4h12l4 6-10 11L2 10l4-6z" fill="#e879f9" stroke="#1a1310" stroke-width="2" stroke-linejoin="round"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#f8fafc" stroke-width="2.8" stroke-linecap="round"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" fill="#94a3b8" stroke="#1a1310" stroke-width="2"/><path d="M8 11V8a4 4 0 018 0v3" stroke="#cbd5e1" stroke-width="2.2"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M5 13l4 4L19 7" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  fastForward: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M4 6l8 6-8 6V6zm9 0l8 6-8 6V6z" fill="#fde047" stroke="#1a1310" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  recall: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M12 19V6m0 0l-5 5m5-5l5 5" stroke="#f8fafc" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  restart: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M4 12a8 8 0 102.3-5.6L4 9m0-5v5h5" stroke="#f8fafc" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><circle cx="12" cy="12" r="3.5" fill="#fbbf24" stroke="#1a1310" stroke-width="2"/><path d="M12 2v3m0 14v3M4.9 4.9l2.1 2.1m10 10l2.1 2.1M2 12h3m14 0h3M4.9 19.1l2.1-2.1m10-10l2.1-2.1" stroke="#cbd5e1" stroke-width="2.6" stroke-linecap="round"/></svg>`,
  home: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M3 11l9-7 9 7v9a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 20v-9z" fill="#fbbf24" stroke="#1a1310" stroke-width="2" stroke-linejoin="round"/><rect x="9.5" y="13" width="5" height="8" fill="#4b382a" stroke="#1a1310" stroke-width="1.6"/></svg>`,
  bossCore: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><circle cx="12" cy="12" r="9" fill="#be123c" stroke="#1a1310" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#fde047"/></svg>`,
};

export function svgIcon(name: IconName): string {
  return `<span class="rm-ico" aria-hidden="true">${SVG_MAP[name]}</span>`;
}
