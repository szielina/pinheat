import type { Projection } from './projection';

/** What a set of PINs adds up to along one axis of a projection: one entry per row (or column) of the map. */
export interface AxisProfile {
  /** PINs of the set in each row or column. */
  pins: Float64Array;
  /** Occurrences of those PINs in each row or column. */
  occurrences: Float64Array;
}

/** The profile along both axes: `x` has one entry per column of the map, `y` one per row. */
export interface Profile {
  x: AxisProfile;
  y: AxisProfile;
}

/**
 * Sums the PINs flagged in `member` (1 = in the set; index = the PIN) by the column and the row they fall in under
 * `projection`; `counts[pin]` is the number of occurrences of a PIN.
 */
export function axisProfile(projection: Projection, member: ArrayLike<number>, counts: ArrayLike<number>): Profile {
  const x: AxisProfile = { pins: new Float64Array(projection.width), occurrences: new Float64Array(projection.width) };
  const y: AxisProfile = { pins: new Float64Array(projection.height), occurrences: new Float64Array(projection.height) };
  for (let pin = 0; pin < member.length; pin++) {
    if (member[pin] !== 1) continue;
    const [cx, cy] = projection.toXY(pin);
    x.pins[cx]++;
    x.occurrences[cx] += counts[pin];
    y.pins[cy]++;
    y.occurrences[cy] += counts[pin];
  }
  return { x, y };
}
