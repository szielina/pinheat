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
