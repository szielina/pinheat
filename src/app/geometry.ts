import { toCell } from '../core/viewport';
import type { Store } from './store';

/** Pointer coordinates against the current view. Both are in map-area coordinates, not canvas coordinates. */
export interface Geometry {
  /** Position of a mouse or pointer event relative to the map area (the axes take the margins of the canvas). */
  local(e: MouseEvent): [number, number];
  /** Cell under the point, or null when the point is outside the map area or the grid. */
  cellAt(px: number, py: number): [number, number] | null;
  /** Cell nearest to the point (for dragging a selection past the edge). */
  clampedCellAt(px: number, py: number): [number, number];
}

export function createGeometry(canvas: HTMLCanvasElement, store: Store): Geometry {
  const local = (e: MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left - store.plot.left, e.clientY - r.top - store.plot.top]; // relative to the map area
  };
  const rawCell = (px: number, py: number): [number, number] => {
    const [fx, fy] = toCell(store.vp, px, py);
    return [Math.floor(fx), Math.floor(fy)];
  };
  const cellAt = (px: number, py: number): [number, number] | null => {
    if (px < 0 || py < 0 || px >= store.frame.viewW || py >= store.frame.viewH) return null; // over the axes
    const [x, y] = rawCell(px, py);
    return x >= 0 && y >= 0 && x < store.frame.gridW && y < store.frame.gridH ? [x, y] : null;
  };
  const clampedCellAt = (px: number, py: number): [number, number] => {
    const [x, y] = rawCell(px, py);
    return [Math.min(store.frame.gridW - 1, Math.max(0, x)), Math.min(store.frame.gridH - 1, Math.max(0, y))];
  };

  return { local, cellAt, clampedCellAt };
}
