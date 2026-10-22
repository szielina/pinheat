export interface Projection {
  name: string;
  width: number;
  height: number;
  toXY(pin: number): [number, number];
  toPin(x: number, y: number): number;
}

/** Digits are numbered from the most significant (0 = A). y and x are built from the given positions, the first being the most significant. */
export function digitProjection(name: string, n: number, yIdx: number[], xIdx: number[]): Projection {
  const digitAt = (pin: number, i: number) => Math.floor(pin / 10 ** (n - 1 - i)) % 10;
  const pack = (pin: number, idx: number[]) => idx.reduce((acc, i) => acc * 10 + digitAt(pin, i), 0);
  const unpack = (value: number, idx: number[], digs: number[]) => {
    for (let k = idx.length - 1; k >= 0; k--) {
      digs[idx[k]] = value % 10;
      value = Math.floor(value / 10);
    }
  };
  return {
    name,
    width: 10 ** xIdx.length,
    height: 10 ** yIdx.length,
    toXY: (pin) => [pack(pin, xIdx), pack(pin, yIdx)],
    toPin: (x, y) => {
      const digs = new Array<number>(n).fill(0);
      unpack(x, xIdx, digs);
      unpack(y, yIdx, digs);
      return digs.reduce((acc, d) => acc * 10 + d, 0);
    },
  };
}

export function projectionsFor(n: number): Record<string, Projection> {
  if (n === 4) {
    return {
      'ab-cd': digitProjection('AB × CD', 4, [0, 1], [2, 3]),
      'ac-bd': digitProjection('AC × BD', 4, [0, 2], [1, 3]),
      'ad-bc': digitProjection('AD × BC', 4, [0, 3], [1, 2]),
    };
  }
  const half = Math.floor(n / 2);
  const idx = Array.from({ length: n }, (_, i) => i);
  return { split: digitProjection('first half × second half', n, idx.slice(0, half), idx.slice(half)) };
}
