import { classify, tagsFor, type Tag } from '../core/classifier';
import { buildCoverage, type Coverage } from '../core/coverage';
import type { Dataset } from '../core/dataset';
import { projectionsFor, type Projection } from '../core/projection';

/** Everything derived once from the data set; none of it changes while the page is open. */
export interface Data {
  /** Digits per PIN. */
  n: number;
  ds: Dataset;
  cov: Coverage;
  nPins: number;
  /** Occurrences of an average PIN: the reference (1×) of every relative measure. */
  avgCount: number;
  projections: Record<string, Projection>;
  projIds: string[];
  tags: Tag[];
  /** The URL stores tags by id, not by position. */
  tagIds: string[];
  /** Bit mask of tags per PIN (see classifier). */
  mask: Uint32Array;
  /** The PIN as a string with leading zeros. */
  pad(pin: number): string;
}

export function createData(n: number, ds: Dataset): Data {
  const projections = projectionsFor(n);
  const tags = tagsFor(n);
  const nPins = ds.counts.length;
  return {
    n,
    ds,
    cov: buildCoverage(ds),
    nPins,
    avgCount: ds.total / nPins,
    projections,
    projIds: Object.keys(projections),
    tags,
    tagIds: tags.map((t) => t.id),
    mask: classify(n),
    pad: (pin) => String(pin).padStart(n, '0'),
  };
}
