/** How often each digit 0-9 occurs in a set of PINs, wherever in the PIN it stands. */
export interface DigitFrequency {
  /** PINs in the set. */
  pins: number;
  /** Digit slots counted: the weighted number of PINs times digits per PIN. */
  total: number;
  /** `counts[d]` = weighted number of digits equal to `d`. Sums to `total`. */
  counts: Float64Array;
}

/**
 * Digit frequency of the PINs flagged in `member` (1 = in the set; index = the PIN).
 * Each PIN counts `weights[pin]` times, so with the occurrence counts as weights the result says which digits
 * people actually pick; with weights of 1 it says what the set is made of.
 */
export function digitFrequency(digits: number, member: ArrayLike<number>, weights: ArrayLike<number>): DigitFrequency {
  const counts = new Float64Array(10);
  let pins = 0;
  let total = 0;
  for (let pin = 0; pin < member.length; pin++) {
    if (member[pin] !== 1) continue;
    pins++;
    const w = weights[pin];
    total += w * digits;
    let rest = pin;
    for (let pos = 0; pos < digits; pos++) {
      const d = rest % 10;
      counts[d] += w;
      rest = (rest - d) / 10;
    }
  }
  return { pins, total, counts };
}

/** Share of all counted digits (0-1) that equal `d`; 0 when nothing was counted. */
export function digitShare(f: DigitFrequency, d: number): number {
  return f.total > 0 ? f.counts[d] / f.total : 0;
}
