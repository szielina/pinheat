/** How bar heights map onto the plot: the top of the axis, where the ticks go, and value -> 0..1. */
export interface BarScale {
  /** The value at the top of the axis (at least `max`). */
  top: number;
  /** Values that get a gridline and a label. */
  ticks: number[];
  /** Height of a value as a fraction of the plot, 0..1. */
  at(value: number): number;
}

/** Smallest 1, 2 or 5 times a power of ten that is at least `x`. */
function niceStep(x: number): number {
  if (!(x > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(x));
  const f = x / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

/**
 * Scale for bars of non-negative values up to `max`. Linear: about four steps of 1, 2 or 5 times a power of ten, never below 1.
 * Logarithmic: heights follow log10(1 + value), so a value of 0 stays at the bottom and every other value is visible;
 * ticks sit at 0 and at the powers of ten.
 */
export function barScale(max: number, log: boolean): BarScale {
  if (!log) {
    const step = Math.max(1, niceStep(max / 4)); // the values are whole numbers
    const top = Math.max(step, Math.ceil(max / step) * step);
    const ticks: number[] = [];
    for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
    return { top, ticks, at: (value) => value / top };
  }
  const exp = Math.max(1, Math.ceil(Math.log10(Math.max(1, max))));
  const top = 10 ** exp;
  const ticks = [0];
  for (let e = 0; e <= exp; e++) ticks.push(10 ** e);
  const span = Math.log10(1 + top);
  return { top, ticks, at: (value) => Math.log10(1 + Math.max(0, value)) / span };
}
