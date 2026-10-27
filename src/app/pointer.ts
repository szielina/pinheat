import { panBy, zoomAt } from '../core/viewport';
import type { Geometry } from './geometry';
import type { PointerHost } from './map-host';
import type { Store } from './store';

const CLICK_SLOP = 5; // pointer travel (CSS px) below which a mouse press counts as a click, not a pan
const TOUCH_CLICK_SLOP = 10; // fingers are less steady than a mouse
const DOUBLE_CLICK_MS = 350; // two clicks / taps this close in time and space zoom in
const DOUBLE_CLICK_PX = 10;

/**
 * Mouse and touch on the map. The gesture lives in the store (down, panning, drag, pinch, lastClick); what a gesture
 * means for the rest of the app goes through the host.
 */
export function installPointer(canvas: HTMLCanvasElement, store: Store, geometry: Geometry, host: PointerHost): void {
  const { local, cellAt, clampedCellAt } = geometry;
  const { updateHover, hideHover, selectPin, selectionChanged, redraw } = host;

  // mouse: click = select a PIN, drag = pan, Shift+drag = rectangle, wheel / double-click = zoom
  // touch: tap = select a PIN, drag = pan, two fingers = pinch zoom + pan, double-tap = zoom
  const isTouch = (e: PointerEvent) => e.pointerType === 'touch';

  /** Distance and centre of the first two pressed pointers. */
  function pinchGeometry() {
    const [a, b] = [...store.pointers.values()];
    return { dist: Math.hypot(b[0] - a[0], b[1] - a[1]), cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const [px, py] = local(e);
    store.pointers.set(e.pointerId, [px, py]);
    if (store.pointers.size >= 2) {
      // a second finger turns the gesture into a pinch: forget the click, pan or rectangle in progress
      store.down = null;
      store.panning = null;
      store.drag = null;
      hideHover();
      store.pinch = pinchGeometry();
    } else if (e.shiftKey && !isTouch(e)) {
      const [x, y] = clampedCellAt(px, py);
      store.drag = { x0: x, y0: y, x1: x, y1: y };
    } else {
      // click or pan is decided once the pointer has travelled `slop` pixels
      store.down = { px, py, cell: cellAt(px, py), moved: false, slop: isTouch(e) ? TOUCH_CLICK_SLOP : CLICK_SLOP };
      store.panning = [px, py];
    }
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    const [px, py] = local(e);
    if (store.pointers.has(e.pointerId)) store.pointers.set(e.pointerId, [px, py]);

    if (store.pinch && store.pointers.size >= 2) {
      const g = pinchGeometry();
      store.vp = panBy(store.vp, store.frame, g.cx - store.pinch.cx, g.cy - store.pinch.cy);
      if (store.pinch.dist > 0 && g.dist > 0) store.vp = zoomAt(store.vp, store.frame, g.cx, g.cy, g.dist / store.pinch.dist);
      store.pinch = g;
      redraw();
      return;
    }
    if (store.down && !store.down.moved && Math.hypot(px - store.down.px, py - store.down.py) >= store.down.slop) {
      store.down.moved = true;
      canvas.style.cursor = 'grabbing'; // the hand only appears while the map is really being dragged
    }
    if (store.panning && store.down && store.down.moved) {
      store.vp = panBy(store.vp, store.frame, px - store.panning[0], py - store.panning[1]);
      store.panning = [px, py];
    }
    if (store.drag) [store.drag.x1, store.drag.y1] = clampedCellAt(px, py);
    if (isTouch(e)) hideHover(); // a finger covers the cell anyway; guide lines under it would only get in the way
    else updateHover(px, py);
    redraw();
  });

  /** A press that did not travel: the second one in quick succession zooms in, otherwise it selects the PIN under it. */
  function onClick(cell: [number, number] | null, px: number, py: number, touch: boolean) {
    const now = performance.now();
    if (
        store.lastClick !== null &&
        now - store.lastClick.t < DOUBLE_CLICK_MS &&
        Math.hypot(px - store.lastClick.px, py - store.lastClick.py) < DOUBLE_CLICK_PX
    ) {
      store.lastClick = null;
      store.vp = zoomAt(store.vp, store.frame, px, py, 2); // the first click of the pair has already selected the PIN
      if (!touch) updateHover(px, py);
      return;
    }
    store.lastClick = { t: now, px, py };
    if (cell) selectPin(store.proj().toPin(cell[0], cell[1]));
  }

  function endPointer(e: PointerEvent, cancelled: boolean) {
    if (!store.pointers.delete(e.pointerId)) return; // not a press we tracked (e.g. right button, or already finished)
    const [px, py] = local(e);

    if (store.pinch) {
      if (store.pointers.size >= 2) {
        store.pinch = pinchGeometry(); // a third finger left: carry on with the first two
        return;
      }
      store.pinch = null;
      const rest = [...store.pointers.values()][0];
      // the finger that stays keeps panning, and its release is never a click
      store.down = rest ? { px: rest[0], py: rest[1], cell: null, moved: true, slop: 0 } : null;
      store.panning = rest ? [rest[0], rest[1]] : null;
      canvas.style.cursor = '';
      redraw();
      return;
    }

    if (store.drag) {
      const p = store.proj();
      store.selection = new Set();
      for (let yy = Math.min(store.drag.y0, store.drag.y1); yy <= Math.max(store.drag.y0, store.drag.y1); yy++)
        for (let xx = Math.min(store.drag.x0, store.drag.x1); xx <= Math.max(store.drag.x0, store.drag.x1); xx++)
          store.selection.add(p.toPin(xx, yy));
      store.drag = null;
      selectionChanged();
    }
    const pressed = store.down;
    store.down = null;
    store.panning = null;
    canvas.style.cursor = '';
    if (!cancelled && pressed && !pressed.moved) onClick(pressed.cell, px, py, isTouch(e));
    redraw();
  }
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('lostpointercapture', (e) => endPointer(e, true)); // no-op after a normal release
  canvas.addEventListener('pointerleave', () => {
    hideHover();
    redraw();
  });
  canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const [px, py] = local(e);
        const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // Firefox reports lines, not pixels
        store.vp = zoomAt(store.vp, store.frame, px, py, Math.exp(-dy * 0.0015));
        updateHover(px, py);
        redraw();
      },
      { passive: false },
  );
}
