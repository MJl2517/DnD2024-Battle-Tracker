export function readNumber(value: string | number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeSignedInput(value: string): string {
  const clean = value.replace(/[^\d+-]/g, '');
  const sign = clean.startsWith('-') ? '-' : clean.startsWith('+') ? '+' : '';
  const digits = clean.replace(/[+-]/g, '');
  return `${sign}${digits}`;
}

export function readSignedNumber(value: string): number {
  if (value === '+' || value === '-') return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

export function formatSignedInput(value: number): string {
  if (value === 0) return '';
  return value > 0 ? `+${value}` : String(value);
}

export function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}
