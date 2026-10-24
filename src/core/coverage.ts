import type { Dataset } from './dataset';

export interface Coverage {
  order: Uint32Array; // PINs sorted by descending count
  rank: Uint32Array; // rank[pin] = position in order (0 = most popular)
  cum: Float64Array; // cum[k] = share covered by the top (k+1) PINs
}

export function buildCoverage(ds: Dataset): Coverage {
  const n = ds.counts.length;
  const order = Uint32Array.from({ length: n }, (_, i) => i).sort((a, b) => ds.counts[b] - ds.counts[a] || a - b);
  const rank = new Uint32Array(n);
  const cum = new Float64Array(n);
  let acc = 0;
  for (let k = 0; k < n; k++) {
    rank[order[k]] = k;
    acc += ds.counts[order[k]];
    cum[k] = ds.total > 0 ? acc / ds.total : 0;
  }
  return { order, rank, cum };
}

/** Share of occurrences covered by the k most popular PINs. */
export function coverageAt(c: Coverage, k: number): number {
  if (k <= 0) return 0;
  return c.cum[Math.min(k, c.cum.length) - 1];
}

/** Count at the given percentile of PINs (100 = the maximum, 99 = the value of the top 1% boundary). */
export function valueAtPercentile(ds: Dataset, c: Coverage, percentile: number): number {
  const n = ds.counts.length;
  const idx = Math.min(n - 1, Math.max(0, Math.floor((1 - percentile / 100) * (n - 1))));
  return ds.counts[c.order[idx]];
}

export type PopularityDirection = 'top' | 'bottom';

export interface PopularitySelection {
  member: Uint8Array; // 1 when the PIN belongs to the set
  size: number; // PINs in the set; may exceed the requested n because of ties
  share: number; // share of all occurrences held by the set
}

/**
 * The n most (top) or least (bottom) common PINs. Every PIN tied with the boundary count is included,
 * so the set never depends on the arbitrary order of equal counts.
 */
export function selectByPopularity(ds: Dataset, c: Coverage, n: number, dir: PopularityDirection): PopularitySelection {
  const total = ds.counts.length;
  const member = new Uint8Array(total);
  const k = Math.min(total, Math.max(0, Math.round(n)));
  if (k === 0) return { member, size: 0, share: 0 };

  let from: number;
  let to: number; // the set is c.order[from .. to)
  if (dir === 'top') {
    const boundary = ds.counts[c.order[k - 1]];
    from = 0;
    to = k;
    while (to < total && ds.counts[c.order[to]] === boundary) to++;
  } else {
    const boundary = ds.counts[c.order[total - k]];
    from = total - k;
    to = total;
    while (from > 0 && ds.counts[c.order[from - 1]] === boundary) from--;
  }

  let sum = 0;
  for (let i = from; i < to; i++) {
    const pin = c.order[i];
    member[pin] = 1;
    sum += ds.counts[pin];
  }
  return { member, size: to - from, share: ds.total > 0 ? sum / ds.total : 0 };
}