export interface Dataset {
  digits: number;
  counts: Uint32Array;
  total: number;
  source: 'hibp' | 'demo';
}

export function makeDataset(digits: number, counts: Uint32Array, source: Dataset['source']): Dataset {
  let total = 0;
  for (let i = 0; i < counts.length; i++) total += counts[i];
  return { digits, counts, total, source };
}

export function shareWhere(ds: Dataset, pred: (pin: number) => boolean): number {
  let sum = 0;
  for (let i = 0; i < ds.counts.length; i++) if (pred(i)) sum += ds.counts[i];
  return ds.total > 0 ? sum / ds.total : 0;
}

/** Demo data: exponential noise plus a few artificial peaks. For UI preview only. */
export function syntheticCounts(digits: number): Uint32Array {
  const n = 10 ** digits;
  const counts = new Uint32Array(n);
  let seed = 12345;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let i = 0; i < n; i++) counts[i] = Math.floor(-Math.log(1 - rnd()) * 40);
  if (digits === 4) {
    for (let y = 1950; y <= 2005; y++) counts[y] += 600;
    for (let d = 0; d < 10; d++) counts[d * 1111] += 3000;
    counts[1234] += 40000;
    counts[2580] += 8000;
  }
  return counts;
}