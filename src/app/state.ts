import type { ScaleKind } from '../core/scale';

export interface ViewState {
  p: string; // projection
  s: ScaleKind; // scale
  g: number; // gamma
  t: number; // bit mask of enabled tags (0 = no filter)
}

export function readState(hash: string, def: ViewState, validProjections: string[]): ViewState {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const p = q.get('p');
  const s = q.get('s');
  const g = Number(q.get('g'));
  const t = Number(q.get('t'));
  return {
    p: p !== null && validProjections.includes(p) ? p : def.p,
    s: s === 'linear' || s === 'log' || s === 'gamma' ? s : def.s,
    g: g > 0 && g <= 2 ? g : def.g,
    t: Number.isInteger(t) && t >= 0 ? t : def.t,
  };
}

export function writeState(s: ViewState): void {
  const q = new URLSearchParams({ p: s.p, s: s.s, g: String(s.g), t: String(s.t) });
  history.replaceState(null, '', '#' + q.toString());
}
