import { COLORMAP_IDS, type ColormapId } from '../core/colormap';
import type { PopularityDirection } from '../core/coverage';
import { SCALE_KINDS, type ScaleKind } from '../core/scale';

export interface ViewState {
  p: string; // projection
  s: ScaleKind; // scale
  g: number; // gamma
  t: number; // bit mask of enabled tags (0 = no filter)
  m: ColormapId; // colour map
  c: number; // clip percentile for linear / gamma
  n: number; // number of PINs highlighted by popularity (0 = off)
  d: PopularityDirection; // counted from the most or the least common end
}

export function readState(hash: string, def: ViewState, validProjections: string[]): ViewState {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const p = q.get('p');
  const s = q.get('s');
  const m = q.get('m');
  const d = q.get('d');
  const g = Number(q.get('g'));
  const t = Number(q.get('t'));
  const c = Number(q.get('c'));
  const n = Number(q.get('n'));
  return {
    p: p !== null && validProjections.includes(p) ? p : def.p,
    s: s !== null && (SCALE_KINDS as string[]).includes(s) ? (s as ScaleKind) : def.s,
    g: g > 0 && g <= 2 ? g : def.g,
    t: Number.isInteger(t) && t >= 0 ? t : def.t,
    m: m !== null && (COLORMAP_IDS as string[]).includes(m) ? (m as ColormapId) : def.m,
    c: c >= 50 && c <= 100 ? c : def.c,
    n: Number.isInteger(n) && n >= 0 && n <= 10000000 ? n : def.n,
    d: d === 'top' || d === 'bottom' ? d : def.d,
  };
}

export function writeState(s: ViewState): void {
  const q = new URLSearchParams({
    p: s.p,
    s: s.s,
    g: String(s.g),
    t: String(s.t),
    m: s.m,
    c: String(s.c),
    n: String(s.n),
    d: s.d,
  });
  history.replaceState(null, '', '#' + q.toString());
}