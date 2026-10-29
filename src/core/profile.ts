import type { Projection } from './projection';

/** What a set of PINs adds up to along one axis of a projection: one entry per row (or column) of the map. */
export interface AxisProfile {
  /** PINs of the set in each row or column. */
  pins: Float64Array;
  /** Occurrences of those PINs in each row or column. */
  occurrences: Float64Array;
  /** Median occurrences of a PIN of the set in each row or column (0 where the set has no PIN): the typical PIN, immune to a single giant like 1234. */
  typical: Float64Array;
}

/** The profile along both axes: `x` has one entry per column of the map, `y` one per row. */
export interface Profile {
  x: AxisProfile;
  y: AxisProfile;
}

/** Median of `values` (the mean of the two middle ones for an even count); 0 for an empty list. The input is not changed. */
export function median(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;
  const sorted = Float64Array.from(values as ArrayLike<number>).sort();
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Sums the PINs flagged in `member` (1 = in the set; index = the PIN) by the column and the row they fall in under
 * `projection`; `counts[pin]` is the number of occurrences of a PIN.
 */
export function axisProfile(projection: Projection, member: ArrayLike<number>, counts: ArrayLike<number>): Profile {
  const x: AxisProfile = {
    pins: new Float64Array(projection.width),
    occurrences: new Float64Array(projection.width),
    typical: new Float64Array(projection.width),
  };
  const y: AxisProfile = {
    pins: new Float64Array(projection.height),
    occurrences: new Float64Array(projection.height),
    typical: new Float64Array(projection.height),
  };
  const inColumn: number[][] = Array.from({ length: projection.width }, () => []);
  const inRow: number[][] = Array.from({ length: projection.height }, () => []);
  for (let pin = 0; pin < member.length; pin++) {
    if (member[pin] !== 1) continue;
    const [cx, cy] = projection.toXY(pin);
    x.pins[cx]++;
    x.occurrences[cx] += counts[pin];
    inColumn[cx].push(counts[pin]);
    y.pins[cy]++;
    y.occurrences[cy] += counts[pin];
    inRow[cy].push(counts[pin]);
  }
  for (let i = 0; i < inColumn.length; i++) x.typical[i] = median(inColumn[i]);
  for (let i = 0; i < inRow.length; i++) y.typical[i] = median(inRow[i]);
  return { x, y };
}
