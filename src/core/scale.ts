export type ScaleKind = 'linear' | 'gamma' | 'log' | 'rank';
export const SCALE_KINDS: ScaleKind[] = ['linear', 'gamma', 'log', 'rank'];

export interface ScaleParams {
  kind: ScaleKind;
  gamma: number;
  /** Count at which linear / gamma saturate (a high percentile instead of the maximum). */
  clipMax: number;
}

export interface Scale {
  /** PIN -> value in [0, 1] (the colour position). */
  norm: (pin: number) => number;
  /** Count -> value in [0, 1] by the same rule, for legend ticks. */
  atCount: (count: number) => number;
}

interface RankData {
  counts: Uint32Array;
  /** Equalised value in [0, 1] per PIN. */
  t: Float32Array;
  /** All counts, ascending. */
  sorted: Uint32Array;
}

let rankCache: RankData | null = null;

/** Equalised value in [0, 1] per PIN; ties get their mid-rank so the PIN index never decides a colour. */
function rankData(counts: Uint32Array): RankData {
  if (rankCache && rankCache.counts === counts) return rankCache;
  const n = counts.length;
  const order = Uint32Array.from({ length: n }, (_, i) => i).sort((a, b) => counts[a] - counts[b]);
  const t = new Float32Array(n);
  const sorted = new Uint32Array(n);
  for (let k = 0; k < n; k++) sorted[k] = counts[order[k]];
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && counts[order[j + 1]] === counts[order[i]]) j++;
    const mid = n > 1 ? (i + j) / 2 / (n - 1) : 0;
    for (let k = i; k <= j; k++) t[order[k]] = mid;
    i = j + 1;
  }
  rankCache = { counts, t, sorted };
  return rankCache;
}

/** Number of elements of the ascending array that are < v (strict) or <= v (not strict). */
function bound(sorted: Uint32Array, v: number, strict: boolean): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (strict ? sorted[m] < v : sorted[m] <= v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function makeScale(counts: Uint32Array, p: ScaleParams): Scale {
  const clip = Math.max(1, p.clipMax);
  const byCount = (f: (c: number) => number): Scale => ({ norm: (pin) => f(counts[pin]), atCount: f });
  switch (p.kind) {
    case 'linear':
      return byCount((c) => Math.min(1, c / clip));
    case 'gamma':
      return byCount((c) => Math.min(1, c / clip) ** p.gamma);
    case 'log': {
      // from the rarest to the commonest PIN, so the whole palette is used (not only its upper part)
      let min = Infinity;
      let max = 0;
      for (let i = 0; i < counts.length; i++) {
        if (counts[i] < min) min = counts[i];
        if (counts[i] > max) max = counts[i];
      }
      if (!isFinite(min)) min = 0;
      const lo = Math.log1p(min);
      const span = Math.log1p(max) - lo || 1;
      return byCount((c) => clamp01((Math.log1p(c) - lo) / span));
    }
    case 'rank': {
      const { t, sorted } = rankData(counts);
      const n = sorted.length;
      return {
        norm: (pin) => t[pin],
        atCount: (c) => {
          if (n < 2) return 0;
          const lo = bound(sorted, c, true);
          const hi = bound(sorted, c, false);
          const mid = hi > lo ? (lo + hi - 1) / 2 : lo - 0.5; // tied block: its mid-rank; absent value: between neighbours
          return clamp01(mid / (n - 1));
        },
      };
    }
  }
}

/** Maps a PIN to a value in [0, 1]. */
export function makeNormalizer(counts: Uint32Array, p: ScaleParams): (pin: number) => number {
  return makeScale(counts, p).norm;
}
