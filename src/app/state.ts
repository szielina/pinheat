import { COLORMAP_IDS, type ColormapId } from '../core/colormap';
import type { PopularityDirection } from '../core/coverage';
import { SCALE_KINDS, type ScaleKind } from '../core/scale';

export interface ViewState {
  p: string; // projection
  s: ScaleKind; // scale
  g: number; // gamma
  t: number; // bit mask of enabled tags, bit i = tags[i] (0 = no filter); the URL carries tag ids instead (see tagMask)
  m: ColormapId; // colour map
  c: number; // clip percentile for linear / gamma
  n: number; // number of PINs highlighted by popularity (0 = off)
  d: PopularityDirection; // counted from the most or the least common end
}

/**
 * Tag ids in the order of the old numeric `t=` mask. Links made before tags were stored by id still carry such a
 * number, so this list is frozen: never reorder or edit it; only the current tag list may grow.
 */
const LEGACY_TAG_IDS = [
  'date', 'year', 'repeat', 'seq', 'keypad', 'palindrome',
  'kp-z', 'kp-n', 'kp-around', 'kp-cross', 'kp-compact', 'kp-line', 'kp-diamond', 'kp-far', 'kp-near',
];
const TAG_SEPARATOR = '.'; // not used in tag ids; stays readable in a URL (a comma would be escaped)

/** Reads `t`: a list of tag ids (`date.year.kp-z`) or, for old links, the old numeric mask. Unknown ids are ignored. */
function tagMask(raw: string | null, tagIds: string[], def: number): number {
  if (raw === null) return def;
  const ids = /^\d+$/.test(raw)
    ? LEGACY_TAG_IDS.filter((_, i) => ((Number(raw) & 0xffff) >> i) & 1)
    : raw.split(TAG_SEPARATOR);
  let mask = 0;
  for (const id of ids) {
    const i = tagIds.indexOf(id);
    if (i >= 0) mask |= 1 << i;
  }
  return mask;
}

/** `tagIds` are the ids of the current tags in mask order; they make the URL independent of that order. */
export function readState(hash: string, def: ViewState, validProjections: string[], tagIds: string[]): ViewState {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const p = q.get('p');
  const s = q.get('s');
  const m = q.get('m');
  const d = q.get('d');
  const g = Number(q.get('g'));
  const c = Number(q.get('c'));
  const n = Number(q.get('n'));
  return {
    p: p !== null && validProjections.includes(p) ? p : def.p,
    s: s !== null && (SCALE_KINDS as string[]).includes(s) ? (s as ScaleKind) : def.s,
    g: g > 0 && g <= 2 ? g : def.g,
    t: tagMask(q.get('t'), tagIds, def.t),
    m: m !== null && (COLORMAP_IDS as string[]).includes(m) ? (m as ColormapId) : def.m,
    c: c >= 50 && c <= 100 ? c : def.c,
    n: Number.isInteger(n) && n >= 0 && n <= 10000000 ? n : def.n,
    d: d === 'top' || d === 'bottom' ? d : def.d,
  };
}

const WRITE_DELAY_MS = 250;
let pendingWrite = 0;

/**
 * Puts the state into the URL hash. Debounced: a slider fires dozens of events per second, and Safari throws a
 * SecurityError after ~100 `replaceState` calls in 30 s, which would abort the repaint that follows the call.
 */
export function writeState(s: ViewState, tagIds: string[]): void {
  const q = new URLSearchParams({
    p: s.p,
    s: s.s,
    g: String(s.g),
    m: s.m,
    c: String(s.c),
    n: String(s.n),
    d: s.d,
  });
  const tags = tagIds.filter((_, i) => ((s.t >> i) & 1) === 1).join(TAG_SEPARATOR);
  if (tags !== '') q.set('t', tags);
  const hash = '#' + q.toString(); // snapshot now: `s` keeps changing until the timer fires
  window.clearTimeout(pendingWrite);
  pendingWrite = window.setTimeout(() => {
    try {
      history.replaceState(null, '', hash);
    } catch {
      // the URL is a convenience; losing an update is better than breaking the page
    }
  }, WRITE_DELAY_MS);
}