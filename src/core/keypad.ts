/** Geometry of a numeric keypad: where each digit sits, and how close two keys are. Pure functions, no DOM. */

/** Key position as (row, column); row 0 is the top. */
export type KeyPos = readonly [row: number, col: number];
export type KeypadLayout = Readonly<Record<number, KeyPos>>;

/** PC numeric keypad (7 8 9 on top); the wide 0 sits under 1 and 2, i.e. at column 0.5. */
export const NUMPAD: KeypadLayout = {
  7: [0, 0], 8: [0, 1], 9: [0, 2],
  4: [1, 0], 5: [1, 1], 6: [1, 2],
  1: [2, 0], 2: [2, 1], 3: [2, 2],
  0: [3, 0.5],
};

/** Phone keypad (1 2 3 on top); 0 sits under 8. */
export const PHONE: KeypadLayout = {
  1: [0, 0], 2: [0, 1], 3: [0, 2],
  4: [1, 0], 5: [1, 1], 6: [1, 2],
  7: [2, 0], 8: [2, 1], 9: [2, 2],
  0: [3, 1],
};

export const distinctCount = (d: number[]): number => new Set(d).size;

/** Chebyshev distance between two keys: 1 = neighbours (sideways or diagonally). */
export function keyDistance(l: KeypadLayout, a: number, b: number): number {
  return Math.max(Math.abs(l[a][0] - l[b][0]), Math.abs(l[a][1] - l[b][1]));
}

/** Size of the bounding box of the keys, in key steps: (0, 0) = one key, (1, 1) = fits in a 2 × 2 block. */
export function boxOf(l: KeypadLayout, d: number[]): { rows: number; cols: number } {
  let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
  for (const k of d) {
    const [r, c] = l[k];
    r0 = Math.min(r0, r); r1 = Math.max(r1, r);
    c0 = Math.min(c0, c); c1 = Math.max(c1, c);
  }
  return { rows: r1 - r0, cols: c1 - c0 };
}

export const fitsIn2x2 = (l: KeypadLayout, d: number[]): boolean => {
  const b = boxOf(l, d);
  return b.rows <= 1 && b.cols <= 1;
};

export type SquareKind = 'z' | 'n' | 'around' | 'cross';

/**
 * Four different keys from one 2 × 2 block, classified by the route through them:
 * z = along rows (1245), n = along columns (2536), around = round the block (1254, 6325), cross = diagonal, side, diagonal (1524).
 */
export function squareKind(l: KeypadLayout, d: number[]): SquareKind | null {
  if (distinctCount(d) !== 4 || !fitsIn2x2(l, d)) return null;
  const steps = d.slice(1).map((k, i) => {
    const [r1, c1] = l[d[i]];
    const [r2, c2] = l[k];
    return { diagonal: r1 !== r2 && c1 !== c2, horizontal: r1 === r2 };
  });
  const route = steps.map((s) => (s.diagonal ? 'd' : 's')).join('');
  if (route === 'sss') return 'around';
  if (route === 'dsd') return 'cross';
  return steps[0].horizontal ? 'z' : 'n';
}

export type EchoKind = 'turn' | 'mirror' | 'diagonal';

/** Where the key at (row, column) of the 3 x 3 block goes: turned by 180°, mirrored left-right, mirrored along the `/` diagonal. */
const ECHO_MAPS: Record<EchoKind, (row: number, col: number) => [number, number]> = {
  turn: (r, c) => [2 - r, 2 - c],
  mirror: (r, c) => [r, 2 - c],
  diagonal: (r, c) => [2 - c, 2 - r],
};

/**
 * The last two keys are the first two, turned or mirrored across the 3 x 3 block (3377, 1793, 2486, 7535).
 * Keys 1-9 only (the 0 key lies outside the block); ABAB is its own echo and does not count. Returns the first
 * transformation that fits, otherwise null.
 */
export function echoKind(l: KeypadLayout, d: number[]): EchoKind | null {
  if (d.includes(0) || (d[2] === d[0] && d[3] === d[1])) return null;
  for (const kind of Object.keys(ECHO_MAPS) as EchoKind[]) {
    const f = ECHO_MAPS[kind];
    const [r3, c3] = f(...l[d[0]]);
    const [r4, c4] = f(...l[d[1]]);
    if (l[d[2]][0] === r3 && l[d[2]][1] === c3 && l[d[3]][0] === r4 && l[d[3]][1] === c4) return kind;
  }
  return null;
}

/** Keys at the middle of a side of the 3 × 3 block (2, 4, 6, 8): the corners of a diamond round 5. */
export const isEdgeMiddle = (l: KeypadLayout, k: number): boolean => k !== 0 && (l[k][0] + l[k][1]) % 2 === 1;

/** AABB or ABAB with two different keys; returns the pair, otherwise null. */
export function repeatedPair(d: number[]): [number, number] | null {
  if (d[0] === d[1] && d[2] === d[3] && d[0] !== d[2]) return [d[0], d[2]];
  if (d[0] === d[2] && d[1] === d[3] && d[0] !== d[1]) return [d[0], d[1]];
  return null;
}
