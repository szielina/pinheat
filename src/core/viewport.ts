/** View onto a grid: top-left corner in grid cells and screen pixels per cell. */
export interface Viewport {
    x: number;
    y: number;
    k: number;
}

/** Grid size and visible area size (screen pixels). */
export interface Frame {
    gridW: number;
    gridH: number;
    viewW: number;
    viewH: number;
}

const MAX_CELL_PX = 80;

const minK = (f: Frame) => Math.min(f.viewW / f.gridW, f.viewH / f.gridH);

/** Keeps the zoom in range and the grid from drifting out of view (centres it when smaller than the view). */
function clamp(v: Viewport, f: Frame): Viewport {
    const k = Math.min(MAX_CELL_PX, Math.max(minK(f), v.k));
    const visW = f.viewW / k;
    const visH = f.viewH / k;
    const x = visW >= f.gridW ? (f.gridW - visW) / 2 : Math.min(f.gridW - visW, Math.max(0, v.x));
    const y = visH >= f.gridH ? (f.gridH - visH) / 2 : Math.min(f.gridH - visH, Math.max(0, v.y));
    return { x, y, k };
}

/** The whole grid fitted into the view. */
export const fit = (f: Frame): Viewport => clamp({ x: 0, y: 0, k: minK(f) }, f);

export function panBy(v: Viewport, f: Frame, dxPx: number, dyPx: number): Viewport {
    return clamp({ x: v.x - dxPx / v.k, y: v.y - dyPx / v.k, k: v.k }, f);
}

/** Zooms so that the cell under the screen point (px, py) stays under it. */
export function zoomAt(v: Viewport, f: Frame, px: number, py: number, factor: number): Viewport {
    const k = Math.min(MAX_CELL_PX, Math.max(minK(f), v.k * factor));
    const cx = v.x + px / v.k;
    const cy = v.y + py / v.k;
    return clamp({ x: cx - px / k, y: cy - py / k, k }, f);
}

export const toCell = (v: Viewport, px: number, py: number): [number, number] => [v.x + px / v.k, v.y + py / v.k];

export const toScreen = (v: Viewport, cx: number, cy: number): [number, number] => [(cx - v.x) * v.k, (cy - v.y) * v.k];