import type { PopularitySelection } from '../core/coverage';
import type { Projection } from '../core/projection';
import type { Frame, Viewport } from '../core/viewport';
import type { PlotRect } from './axes';
import { plotRect } from './axes';
import type { Data } from './data';
import { readState, type ViewState } from './state';

/** Selection rectangle in cells while Shift+drag is in progress. */
export interface DragRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A pressed pointer: where it went down, the cell under it, and whether it has travelled far enough to be a pan. */
export interface Press {
  px: number;
  py: number;
  cell: [number, number] | null;
  moved: boolean;
  slop: number;
}

/** Two-finger gesture in progress: distance and centre of the two fingers. */
export interface Pinch {
  dist: number;
  cx: number;
  cy: number;
}

/** The previous click or tap, for double-click / double-tap zoom. */
export interface LastClick {
  t: number;
  px: number;
  py: number;
}

/** Everything that changes while the page is open, in one place. Plain data: the modules read and write it directly. */
export interface Store {
  /** The part of the state that lives in the URL. */
  view: ViewState;
  selection: Set<number>;
  /** PINs highlighted by popularity (null = off). */
  pop: PopularitySelection | null;
  /** PIN selected by clicking; it has its own section and does not dim the map. */
  picked: number | null;
  /** Hovered cell. */
  hover: [number, number] | null;
  frame: Frame;
  vp: Viewport;
  /** Map area inside the canvas; the rest is reserved for the axes. */
  plot: PlotRect;

  // --- pointer gesture ---
  drag: DragRect | null;
  /** Last pointer position while panning. */
  panning: [number, number] | null;
  down: Press | null;
  /** Pressed pointers (map-area coordinates), in press order. */
  pointers: Map<number, [number, number]>;
  pinch: Pinch | null;
  lastClick: LastClick | null;

  /** The projection chosen in `view`. */
  proj(): Projection;
}

export function createStore(data: Data): Store {
  const defaults: ViewState = { p: data.projIds[0], s: 'log', g: 0.5, t: 0, m: 'viridis', c: 99, n: 0, d: 'top' };
  const store: Store = {
    view: readState(location.hash, defaults, data.projIds, data.tagIds),
    selection: new Set<number>(),
    pop: null,
    picked: null,
    hover: null,
    frame: { gridW: 1, gridH: 1, viewW: 1, viewH: 1 },
    vp: { x: 0, y: 0, k: 1 },
    plot: plotRect(1, 1, data.n),
    drag: null,
    panning: null,
    down: null,
    pointers: new Map(),
    pinch: null,
    lastClick: null,
    proj: () => data.projections[store.view.p],
  };
  return store;
}

/** True while the map itself is being moved (pan or pinch): guide lines and the tooltip stay out of the way. */
export const isMoving = (s: Store): boolean => (s.down !== null && s.down.moved) || s.pinch !== null;
