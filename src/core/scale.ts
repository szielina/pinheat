export type ScaleKind = 'linear' | 'gamma' | 'log' | 'rank';
export const SCALE_KINDS: ScaleKind[] = ['linear', 'gamma', 'log', 'rank'];

export interface ScaleParams {
  kind: ScaleKind;
  gamma: number;
  /** Count at which linear / gamma saturate (a high percentile instead of the maximum). */
  clipMax: number;
}

let rankCache: { counts: Uint32Array; t: Float32Array } | null = null;

/** Equalised value in [0, 1] per PIN; ties get their mid-rank so the PIN index never decides a colour. */
function rankTransform(counts: Uint32Array): Float32Array {
  if (rankCache && rankCache.counts === counts) return rankCache.t;
  const n = counts.length;
  const order = Uint32Array.from({ length: n }, (_, i) => i).sort((a, b) => counts[a] - counts[b]);
  const t = new Float32Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && counts[order[j + 1]] === counts[order[i]]) j++;
    const mid = n > 1 ? (i + j) / 2 / (n - 1) : 0;
    for (let k = i; k <= j; k++) t[order[k]] = mid;
    i = j + 1;
  }
  rankCache = { counts, t };
  return t;
}

/** Maps a PIN to a value in [0, 1]. */
export function makeNormalizer(counts: Uint32Array, p: ScaleParams): (pin: number) => number {
  const clip = Math.max(1, p.clipMax);
  switch (p.kind) {
    case 'linear':
      return (pin) => Math.min(1, counts[pin] / clip);
    case 'gamma':
      return (pin) => Math.min(1, counts[pin] / clip) ** p.gamma;
    case 'log': {
      let max = 0;
      for (let i = 0; i < counts.length; i++) if (counts[i] > max) max = counts[i];
      const denom = Math.log1p(max) || 1;
      return (pin) => Math.log1p(counts[pin]) / denom;
    }
    case 'rank': {
      const t = rankTransform(counts);
      return (pin) => t[pin];
    }
  }
}