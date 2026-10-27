import type { Geometry } from './geometry';
import type { Panels } from './panels';
import type { Renderer } from './renderer';
import type { Elements } from './dom';
import type { Store } from './store';

/** What the pointer handling asks of the rest of the app: the effects of hovering, clicking and selecting on the map. */
export interface PointerHost {
  /** The cursor is at (px, py), in map-area coordinates: the readout, the tooltip and the guide lines follow it. */
  updateHover(px: number, py: number): void;
  /** The cursor left the map, or a gesture took over: forget the hovered cell. */
  hideHover(): void;
  /** Clicking a PIN selects it; clicking it again (or another PIN) deselects / replaces it. */
  selectPin(pin: number): void;
  /** `store.selection` was replaced: refresh its readout and the dimming of the map. */
  selectionChanged(): void;
  /** Paints the map again. */
  redraw(): void;
}

export function createPointerHost(store: Store, el: Elements, geometry: Geometry, panels: Panels, renderer: Renderer): PointerHost {
  const { hoverEl, tipEl } = el;
  const { cellAt } = geometry;
  const { idleReadout, showHover, showSelection, showPicked, showTip } = panels;
  const { buildImage, draw } = renderer;

  function updateHover(px: number, py: number) {
    store.hover = cellAt(px, py);
    if (store.hover) showHover(store.hover[0], store.hover[1]);
    else hoverEl.textContent = idleReadout();
    showTip(store.hover, px, py);
  }

  function hideHover() {
    store.hover = null;
    hoverEl.textContent = idleReadout();
    tipEl.style.display = 'none';
  }

  function selectPin(pin: number) {
    store.picked = store.picked === pin ? null : pin;
    if (store.hover === null) hoverEl.textContent = idleReadout();
    showPicked();
  }

  function selectionChanged() {
    showSelection();
    buildImage();
  }

  return { updateHover, hideHover, selectPin, selectionChanged, redraw: draw };
}
