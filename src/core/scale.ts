export type ScaleKind = 'linear' | 'log' | 'gamma';

export function normalizer(kind: ScaleKind, max: number, gamma: number): (count: number) => number {
  if (max <= 0) return () => 0;
  switch (kind) {
    case 'linear':
      return (c) => c / max;
    case 'log': {
      const denom = Math.log1p(max);
      return (c) => Math.log1p(c) / denom;
    }
    case 'gamma':
      return (c) => (c / max) ** gamma;
  }
}

type RGB = [number, number, number];

// plasma, 10 stops
const STOPS: RGB[] = [
  '#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786',
  '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921',
].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as RGB);

export function palette(t: number): RGB {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
