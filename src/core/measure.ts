/** Human-scale measures of a PIN's count: relative to an average PIN instead of raw counts or tiny percentages. */

/** Count relative to an average PIN: 1 = as common as if all PINs were equally likely. */
export function lift(count: number, total: number, nPins: number): number {
  return total > 0 && nPins > 0 ? (count * nPins) / total : 0;
}

/** "3.2×", "0.05×", "1,200×": two significant digits. */
export function fmtX(v: number): string {
  const r = +v.toPrecision(2);
  return `${r.toLocaleString('en-US', { maximumFractionDigits: 6 })}×`;
}

/** "3.2× above average" / "5× below average" / "about average" / "not seen". */
export function describeLift(l: number): string {
  if (!(l > 0)) return 'not seen';
  if (l >= 0.95 && l <= 1.05) return 'about average';
  return l > 1 ? `${fmtX(l)} above average` : `${fmtX(1 / l)} below average`;
}

/** N in "1 in N occurrences", or null for a PIN that never occurs. */
export function oneIn(count: number, total: number): number | null {
  return count > 0 && total > 0 ? total / count : null;
}
