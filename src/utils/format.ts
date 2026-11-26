const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'] as const;

/**
 * Formats numbers compactly for HUD and upgrade cards (e.g. 1250 -> "1.25K").
 */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';
  if (value < 1000) return Math.floor(value).toString();

  const tier = Math.min(Math.floor(Math.log10(value) / 3), SUFFIXES.length - 1);
  const scaled = value / Math.pow(1000, tier);
  const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}${SUFFIXES[tier]}`;
}

export function formatMeters(meters: number): string {
  return `${Math.floor(Math.max(0, meters)).toLocaleString('en-US')}m`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${rem}s`;
  return `${rem}s`;
}

export function getUtcDayKey(timestampMs: number = Date.now()): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}
