import { lut } from '../core/colormap';
import { valueAtPercentile } from '../core/coverage';
import { legendTicks } from '../core/legend';
import { makeScale, type Scale } from '../core/scale';
import { fit, panBy, toScreen } from '../core/viewport';
import { drawAxes, plotRect } from './axes';
import type { Data } from './data';
import type { Elements } from './dom';
import { isMoving, type Store } from './store';
import type { Visible } from './visible';

const DIM_ALPHA = 40;

/** Paints the map and the legend from the store. It owns the canvas pixel ratio, the colour scale and the colour image. */
export interface Renderer {
  /** Recolours the grid image: after a change of colours, scale, filters or selection. */
  buildImage(): void;
  /** Colour bar with ticks that say what each colour means under the current scale. */
  updateLegend(): void;
  /** Paints the grid image through the viewport, plus the hover outline and the selection rectangle. */
  draw(): void;
  /** Sizes the canvas to its container. Refits the whole grid, or (on a mere resize) keeps the current view. */
  layout(refit?: boolean): void;
}

export function createRenderer(data: Data, store: Store, el: Elements, shown: Visible): Renderer {
  const { ds, cov, nPins, avgCount } = data;
  const { minCount, maxCount } = ds;
  const { canvas, legendCanvas, legendCapEl, legendTicksEl, mkHoverEl, mkPickEl } = el;
  const ctx = canvas.getContext('2d')!;
  const legendCtx = legendCanvas.getContext('2d')!;

  let dpr = window.devicePixelRatio || 1; // pixel ratio the canvas backing store was sized for (see layout)
  let scale: Scale; // current colour scale; buildImage() creates it, the legend and its markers reuse it

  // colour image of the grid, one pixel per cell; the visible canvas draws it through the viewport
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d')!;

  const clipMax = () => Math.max(1, valueAtPercentile(ds, cov, store.view.c));

  /** Recolours the grid image: after a change of colours, scale, filters or selection. */
  function buildImage() {
    const p = store.proj();
    off.width = p.width;
    off.height = p.height;
    const img = offCtx.createImageData(p.width, p.height);
    scale = makeScale(ds.counts, { kind: store.view.s, gamma: store.view.g, clipMax: clipMax() });
    const norm = scale.norm;
    const colors = lut(store.view.m);
    const visible = shown.recompute();
    for (let pin = 0; pin < nPins; pin++) {
      const [x, y] = p.toXY(pin);
      const i = Math.min(255, Math.max(0, Math.round(norm(pin) * 255))) * 3;
      const o = (y * p.width + x) * 4;
      img.data[o] = colors[i];
      img.data[o + 1] = colors[i + 1];
      img.data[o + 2] = colors[i + 2];
      img.data[o + 3] = visible[pin] === 1 ? 255 : DIM_ALPHA;
    }
    offCtx.putImageData(img, 0, 0);
  }

  /** What the colour bar means under the current scale. */
  function legendCaption(): string {
    switch (store.view.s) {
      case 'linear':
        return 'Occurrences relative to an average PIN (1× = all PINs equally common). Linear, brightest from the clip level.';
      case 'gamma':
        return `Occurrences relative to an average PIN (1× = all PINs equally common). Gamma ${store.view.g.toFixed(2)}, brightest from the clip level.`;
      case 'log':
        return 'Occurrences relative to an average PIN (1× = all PINs equally common). Logarithmic, from the rarest to the commonest PIN.';
      case 'rank':
        return 'Place in the ranking, not the count: every shade holds the same number of PINs.';
    }
  }

  /** Colour bar with ticks that say what each colour means under the current scale. */
  function updateLegend() {
    const colors = lut(store.view.m);
    const w = legendCanvas.width;
    const h = legendCanvas.height;
    for (let x = 0; x < w; x++) {
      const i = Math.round((x / (w - 1)) * 255) * 3;
      legendCtx.fillStyle = `rgb(${colors[i]},${colors[i + 1]},${colors[i + 2]})`;
      legendCtx.fillRect(x, 0, 1, h);
    }
    legendCapEl.textContent = legendCaption();
    legendTicksEl.textContent = '';
    const ticks = legendTicks({
      kind: store.view.s,
      avg: avgCount,
      minCount,
      maxCount,
      clipMax: clipMax(),
      atCount: scale.atCount,
    });
    for (const tk of ticks) {
      const mark = document.createElement('i');
      mark.style.left = `${tk.t * 100}%`;
      const label = document.createElement('span');
      label.textContent = tk.label;
      label.style.left = `${tk.t * 100}%`;
      label.style.transform = tk.t < 0.02 ? 'none' : tk.t > 0.98 ? 'translateX(-100%)' : 'translateX(-50%)';
      legendTicksEl.append(mark, label);
    }
    refreshMarkers();
  }

  /** Puts a marker at the colour of a PIN on the legend bar (null hides it). */
  function placeMarker(el: HTMLElement, pin: number | null) {
    if (pin === null) {
      if (el.style.display !== 'none') el.style.display = 'none';
      return;
    }
    const left = `${(scale.norm(pin) * 100).toFixed(2)}%`;
    if (el.style.left !== left) el.style.left = left;
    if (el.style.display !== 'block') el.style.display = 'block';
  }

  /** Legend markers: the hovered PIN (thin line) and the clicked PIN (square). */
  function refreshMarkers() {
    placeMarker(mkHoverEl, store.hover && !isMoving(store) ? store.proj().toPin(store.hover[0], store.hover[1]) : null);
    placeMarker(mkPickEl, store.picked);
  }

  /** Paints the grid image through the viewport, plus the hover outline and the selection rectangle. */
  function draw() {
    if ((window.devicePixelRatio || 1) !== dpr) {
      layout(false); // page zoom changed the pixel ratio: resize the backing store first (layout redraws)
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, store.plot.outerW, store.plot.outerH);

    // the map, clipped to its area; coordinates inside are relative to the area's top-left corner
    ctx.save();
    ctx.beginPath();
    ctx.rect(store.plot.left, store.plot.top, store.plot.width, store.plot.height);
    ctx.clip();
    ctx.translate(store.plot.left, store.plot.top);
    ctx.imageSmoothingEnabled = false;
    const [sx, sy] = toScreen(store.vp, 0, 0);
    ctx.drawImage(off, sx, sy, store.frame.gridW * store.vp.k, store.frame.gridH * store.vp.k);

    if (store.hover && !isMoving(store)) {
      // thin guide lines through the hovered cell, pointing at both axes
      const [gx, gy] = toScreen(store.vp, store.hover[0] + 0.5, store.hover[1] + 0.5);
      const lx = Math.round(gx) + 0.5;
      const ly = Math.round(gy) + 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, store.frame.viewH);
      ctx.moveTo(0, ly);
      ctx.lineTo(store.frame.viewW, ly);
      ctx.stroke();
    }
    if (store.hover && !isMoving(store) && store.vp.k >= 4) {
      const [hx, hy] = toScreen(store.vp, store.hover[0], store.hover[1]);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(hx + 0.5, hy + 0.5, store.vp.k - 1, store.vp.k - 1);
    }
    if (store.picked !== null) {
      // square around the clicked PIN: dark outline under a light one, readable on every palette
      const [pcx, pcy] = store.proj().toXY(store.picked);
      const [mx, my] = toScreen(store.vp, pcx + 0.5, pcy + 0.5);
      const s = Math.max(store.vp.k + 2, 9);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#000';
      ctx.strokeRect(mx - s / 2, my - s / 2, s, s);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(mx - s / 2, my - s / 2, s, s);
    }
    if (store.drag) {
      const x0 = Math.min(store.drag.x0, store.drag.x1);
      const y0 = Math.min(store.drag.y0, store.drag.y1);
      const [rx, ry] = toScreen(store.vp, x0, y0);
      const w = (Math.abs(store.drag.x1 - store.drag.x0) + 1) * store.vp.k;
      const h = (Math.abs(store.drag.y1 - store.drag.y0) + 1) * store.vp.k;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(rx, ry, w, h);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + 0.5, ry + 0.5, w - 1, h - 1);
    }
    ctx.restore();

    drawAxes(ctx, store.plot, store.vp, store.proj(), isMoving(store) ? null : store.hover);
    refreshMarkers();
  }

  /** Sizes the canvas to its container. Refits the whole grid, or (on a mere resize) keeps the current view. */
  function layout(refit = true) {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    store.plot = plotRect(r.width, r.height, data.n);
    store.frame = { gridW: store.proj().width, gridH: store.proj().height, viewW: store.plot.width, viewH: store.plot.height };
    store.vp = refit ? fit(store.frame) : panBy(store.vp, store.frame, 0, 0); // panBy re-clamps the view to the new frame
    draw();
  }

  return { buildImage, updateLegend, draw, layout };
}
