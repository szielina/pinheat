/** What a set of PINs is made of: how many of its PINs have digit d at position p. Counts PINs, not occurrences. */
export interface DigitComposition {
  /** Digits per PIN. */
  digits: number;
  /** PINs in the set. */
  size: number;
  /** `counts[pos * 10 + d]` = PINs of the set with digit `d` at position `pos` (0 = leftmost). Every position sums to `size`. */
  counts: Uint32Array;
}

/** Composition of the PINs flagged in `member` (1 = in the set; index = the PIN, as in `Dataset.counts`). */
export function digitComposition(digits: number, member: ArrayLike<number>): DigitComposition {
  const counts = new Uint32Array(digits * 10);
  let size = 0;
  for (let pin = 0; pin < member.length; pin++) {
    if (member[pin] !== 1) continue;
    size++;
    let rest = pin;
    for (let pos = digits - 1; pos >= 0; pos--) {
      const d = rest % 10;
      counts[pos * 10 + d]++;
      rest = (rest - d) / 10;
    }
  }
  return { digits, size, counts };
}

/** Share of the set (0–1) with digit `d` at position `pos`; 0 for an empty set. */
export function digitShare(c: DigitComposition, pos: number, d: number): number {
  return c.size > 0 ? c.counts[pos * 10 + d] / c.size : 0;
}
