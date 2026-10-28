/** How often each digit 0-9 occurs, per position, in a set of PINs. */
export interface DigitFrequency {
  /** Digits per PIN. */
  digits: number;
  /** PINs in the set. */
  pins: number;
  /** Sum of the weights of those PINs: the PINs counted as often as they are weighted. */
  weight: number;
  /** `counts[pos * 10 + d]` = weighted number of PINs with digit `d` at position `pos` (0 = leftmost). */
  counts: Float64Array;
}

/**
 * Digit frequency of the PINs flagged in `member` (1 = in the set; index = the PIN).
 * Each PIN counts `weights[pin]` times (default 1): with the occurrence counts as weights the result says which
 * digits people actually pick, without weights it says what the set is made of.
 */
export function digitFrequency(digits: number, member: ArrayLike<number>, weights?: ArrayLike<number>): DigitFrequency {
  const counts = new Float64Array(digits * 10);
  let pins = 0;
  let weight = 0;
  for (let pin = 0; pin < member.length; pin++) {
    if (member[pin] !== 1) continue;
    pins++;
    const w = weights ? weights[pin] : 1;
    weight += w;
    let rest = pin;
    for (let pos = digits - 1; pos >= 0; pos--) {
      const d = rest % 10;
      counts[pos * 10 + d] += w;
      rest = (rest - d) / 10;
    }
  }
  return { digits, pins, weight, counts };
}

/** Weighted number of digits equal to `d`, at position `pos` or (without `pos`) at any position. */
export function digitCount(f: DigitFrequency, d: number, pos?: number): number {
  if (pos !== undefined) return f.counts[pos * 10 + d];
  let sum = 0;
  for (let p = 0; p < f.digits; p++) sum += f.counts[p * 10 + d];
  return sum;
}

/** Share (0-1) of the counted digits that equal `d`: of one position, or (without `pos`) of all positions together. */
export function digitShare(f: DigitFrequency, d: number, pos?: number): number {
  const slots = pos !== undefined ? f.weight : f.weight * f.digits;
  return slots > 0 ? digitCount(f, d, pos) / slots : 0;
}
