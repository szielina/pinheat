import { fmtX } from './measure';
import type { ScaleKind } from './scale';

export interface LegendTick {
  /** Position along the colour bar, 0..1. */
  t: number;
  label: string;
}

export interface LegendInput {
  kind: ScaleKind;
  /** Occurrences of an average PIN (total / number of PINs). */
  avg: number;
  minCount: number;
  maxCount: number;
  /** Count at which linear / gamma saturate. */
  clipMax: number;
  /** The scale's own count -> [0, 1] mapping, so ticks always agree with the map colours. */
  atCount: (count: number) => number;
}

const MIN_GAP = 0.08; // closest allowed distance between two ticks (fraction of the bar)

function niceStep(x: number): number {
  if (!(x > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(x));
  const f = x / pow;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
}

/** Drops ticks that would overlap; the last (rightmost) one is always kept. */
function prune(ticks: LegendTick[]): LegendTick[] {
  const sorted = [...ticks].sort((a, b) => a.t - b.t);
  const kept: LegendTick[] = [];
  for (const tk of sorted) if (kept.length === 0 || tk.t - kept[kept.length - 1].t >= MIN_GAP) kept.push(tk);
  const last = sorted[sorted.length - 1];
  if (last && kept[kept.length - 1] !== last) {
    while (kept.length > 0 && last.t - kept[kept.length - 1].t < MIN_GAP) kept.pop();
    kept.push(last);
  }
  return kept;
}

const logLabel = (v: number) => (Math.abs(v - 1) < 1e-9 ? '1× avg' : fmtX(v));

/** Ticks of the colour bar, labelled in multiples of the average PIN (or in ranking places for the rank scale). */
export function legendTicks(i: LegendInput): LegendTick[] {
  if (i.kind === 'rank') {
    return [
      { t: 0, label: 'rarest' },
      { t: 0.2, label: 'bottom 20%' },
      { t: 0.5, label: 'median' },
      { t: 0.8, label: 'top 20%' },
      { t: 1, label: 'commonest' },
    ];
  }
  const avg = i.avg > 0 ? i.avg : 1;

  if (i.kind === 'log') {
    const lo = Math.max(i.minCount / avg, 1e-6);
    const hi = Math.max(i.maxCount / avg, lo);
    const within = (v: number) => v >= lo * 0.999 && v <= hi * 1.001;
    let values: number[] = [];
    for (let k = Math.floor(Math.log10(lo)); k <= Math.ceil(Math.log10(hi)); k++) {
      if (within(10 ** k)) values.push(10 ** k);
    }
    if (values.length < 3) {
      values = [];
      for (let k = Math.floor(Math.log10(lo)); k <= Math.ceil(Math.log10(hi)); k++) {
        for (const m of [1, 2, 5]) if (within(m * 10 ** k)) values.push(m * 10 ** k);
      }
    }
    return prune(values.map((v) => ({ t: i.atCount(v * avg), label: logLabel(v) })));
  }

  // linear / gamma: 0 .. clip level
  const clipLift = Math.max(i.clipMax / avg, 1e-9);
  const step = niceStep(clipLift / 4);
  const ticks: LegendTick[] = [];
  for (let k = 0; k < 20 && k * step < clipLift * 0.95; k++) {
    ticks.push({ t: i.atCount(k * step * avg), label: k === 0 ? '0' : fmtX(k * step) });
  }
  ticks.push({ t: 1, label: `≥ ${fmtX(clipLift)}` });
  return prune(ticks);
}
