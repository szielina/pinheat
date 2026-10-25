/** One labelled position on an axis: a grid cell index and its text. */
export interface Tick {
  cell: number;
  label: string;
}

const MANTISSAS = [1, 2, 5];
const WILDCARD = 'n';

/** Smallest "round" step (1, 2, 5, 10, 20, 50, ...) whose spacing on screen is at least minPx. */
export function tickStep(pxPerCell: number, minPx: number): number {
  if (!(pxPerCell > 0)) return Number.POSITIVE_INFINITY;
  for (let mag = 1; mag <= 1e9; mag *= 10) {
    for (const m of MANTISSAS) {
      if (m * mag * pxPerCell >= minPx) return m * mag;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Ticks for the visible part of an axis. The range [from, to] is in cell units; a tick is placed at the
 * centre of every step-th cell whose centre lies inside it. `label` turns a cell index into its text.
 */
export function axisTicks(size: number, from: number, to: number, step: number, label: (cell: number) => string): Tick[] {
  if (!Number.isFinite(step) || step < 1) return [];
  const first = Math.max(0, Math.ceil(from - 0.5));
  const last = Math.min(size - 1, Math.floor(to - 0.5));
  const ticks: Tick[] = [];
  for (let c = Math.ceil(first / step) * step; c <= last; c += step) {
    ticks.push({ cell: c, label: label(c) });
  }
  return ticks;
}

/**
 * Axis value shown as a PIN pattern: the digits of `value` sit at the given positions (0 = A), every other
 * position is a wildcard. For AB × CD: y = 47 is "47nn", x = 12 is "nn12"; for AC × BD: y = 47 is "4n7n".
 */
export function axisLabel(value: number, positions: number[], n: number): string {
  const chars = new Array<string>(n).fill(WILDCARD);
  const digits = String(value).padStart(positions.length, '0');
  positions.forEach((p, i) => (chars[p] = digits[i]));
  return chars.join('');
}

/** Axis title as a pattern of letters, e.g. "ABnn" for the first two digits or "AnCn" for the first and third. */
export function axisTitle(positions: number[], n: number): string {
  const chars = new Array<string>(n).fill(WILDCARD);
  for (const p of positions) chars[p] = String.fromCharCode(65 + p);
  return chars.join('');
}
