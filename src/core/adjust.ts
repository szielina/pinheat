import type { Projection } from './projection';

const ITERATIONS = 10;

function median(values: Float64Array): number {
  const sorted = Float64Array.from(values).sort();
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const cache = new WeakMap<Projection, { counts: ArrayLike<number>; levels: Float32Array }>();

/**
 * Per PIN, the natural logarithm of how much its count exceeds what its row and column of `projection` predict
 * (so `exp(level)` is a factor, 1 = as expected). Rows and columns are taken out by median polish of log(count + 1):
 * the median of every row, then of every column, taken off repeatedly. Whatever is left is not explained by the
 * row or the column alone: a diagonal, a block, a single PIN that stands out. Computed once per projection.
 */
export function adjustedLevels(counts: ArrayLike<number>, projection: Projection): Float32Array {
  const hit = cache.get(projection);
  if (hit && hit.counts === counts) return hit.levels;

  const { width, height } = projection;
  const grid = new Float64Array(width * height);
  const cells = new Uint32Array(counts.length); // PIN -> index in the grid
  for (let pin = 0; pin < counts.length; pin++) {
    const [x, y] = projection.toXY(pin);
    cells[pin] = y * width + x;
    grid[cells[pin]] = Math.log1p(counts[pin]);
  }

  const row = new Float64Array(width);
  const column = new Float64Array(height);
  for (let it = 0; it < ITERATIONS; it++) {
    for (let y = 0; y < height; y++) {
      row.set(grid.subarray(y * width, (y + 1) * width));
      const m = median(row);
      for (let x = 0; x < width; x++) grid[y * width + x] -= m;
    }
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) column[y] = grid[y * width + x];
      const m = median(column);
      for (let y = 0; y < height; y++) grid[y * width + x] -= m;
    }
  }
  const overall = median(grid); // so that 1x means the typical PIN, not just a typical row
  const levels = new Float32Array(counts.length);
  for (let pin = 0; pin < counts.length; pin++) levels[pin] = grid[cells[pin]] - overall;

  cache.set(projection, { counts, levels });
  return levels;
}
