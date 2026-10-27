import { shareWhere } from './core/dataset';
import type { ScaleKind } from './core/scale';
import { describeLift, enrichment, fmtX, lift, oneIn } from './core/measure';
import { COLORMAPS, COLORMAP_IDS, type ColormapId } from './core/colormap';
import {
  selectByPopularity,
  type PopularityDirection,
} from './core/coverage';
import { fit, panBy, toCell, zoomAt } from './core/viewport';
import { createData } from './app/data';
import { getElements } from './app/dom';
import { fmtInt, fmtPct } from './app/format';
import { installHints } from './app/hints';
import { loadDataset } from './app/load';
import { writeState } from './app/state';
import { createRenderer } from './app/renderer';
import { createStore, isMoving } from './app/store';

const HOVER_HINT = 'Hover over the map.';
const CLICK_SLOP = 5; // pointer travel (CSS px) below which a mouse press counts as a click, not a pan
const TOUCH_CLICK_SLOP = 10; // fingers are less steady than a mouse
const DOUBLE_CLICK_MS = 350; // two clicks / taps this close in time and space zoom in
const DOUBLE_CLICK_PX = 10;

async function main() {
  const N = 4;
  const ds = await loadDataset(N, `${import.meta.env.BASE_URL}pins${N}.bin`);
  const data = createData(N, ds);
  const { cov, nPins, projections, projIds, tags, tagIds, mask, pad } = data;

  const el = getElements();
  const {
    canvas, stageEl, srcEl, hoverEl, tipEl, selEl, pickEl, projEl, cmapEl, gammaEl, gammaOut, clipEl, clipOut, tagsEl,
    popN, popRange, popOut, resetEl, clearEl,
    scaleRadios, dirRadios, popPresets,
  } = el;

  const store = createStore(data);
  const { buildImage, updateLegend, draw, layout } = createRenderer(data, store, el);

  srcEl.textContent =
      ds.source === 'hibp'
          ? `HIBP · ${fmtInt(ds.total)} occurrences`
          : 'DEMO – synthetic data (run `npm run data` to fetch HIBP)';

  // --- controls ---
  for (const id of projIds) projEl.add(new Option(projections[id].name, id));
  projEl.value = store.view.p;
  for (const id of COLORMAP_IDS) cmapEl.add(new Option(COLORMAPS[id].label, id));
  cmapEl.value = store.view.m;
  scaleRadios.forEach((r) => (r.checked = r.value === store.view.s));
  gammaEl.value = String(store.view.g);
  clipEl.value = String(store.view.c);
  popN.max = String(nPins);
  popRange.max = String(nPins);

  const tagShare = tags.map((_, i) => shareWhere(ds, (p) => (mask[p] & (1 << i)) !== 0));
  const restShare = shareWhere(ds, (p) => mask[p] === 0);
  /** Share of occurrences and how it compares with an average PIN: the tag's share of occurrences / its share of PINs. */
  const tagStats = (share: number, size: number) => `${fmtPct(share)} · ${size > 0 ? fmtX(enrichment(share, size, nPins)) : '–'}`;
  const tagSize = tags.map((_, i) => mask.reduce((n, m) => n + ((m >> i) & 1), 0));
  const restSize = mask.reduce((n, m) => n + (m === 0 ? 1 : 0), 0);
  tags.forEach((t, i) => {
    const row = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.bit = String(i);
    box.checked = ((store.view.t >> i) & 1) === 1;
    const stats = document.createElement('span');
    stats.className = 'muted';
    stats.textContent = tagStats(tagShare[i], tagSize[i]);
    row.append(box, ` ${t.label} `, stats); // text nodes only: a tag label never reaches innerHTML
    tagsEl.appendChild(row);
  });
  const rest = document.createElement('div');
  rest.className = 'muted';
  rest.textContent = `Remainder (no tag): ${tagStats(restShare, restSize)} · tag shares may overlap`;
  tagsEl.appendChild(rest);

  /** Enables only the sliders relevant to the chosen scale. */
  function syncControls() {
    gammaEl.disabled = store.view.s !== 'gamma';
    clipEl.disabled = store.view.s !== 'linear' && store.view.s !== 'gamma';
    gammaOut.textContent = store.view.g.toFixed(2);
    clipOut.textContent = `${store.view.c}%`;
  }

  // --- popularity filter ---
  function recomputePopularity() {
    store.view.n = Math.min(nPins, Math.max(0, Math.round(store.view.n)));
    store.pop = store.view.n > 0 ? selectByPopularity(ds, cov, store.view.n, store.view.d) : null;
  }

  /** Mirrors the state into the radios, the number field and the slider. */
  function syncPopularityControls(skipNumberField: boolean) {
    if (!skipNumberField) popN.value = String(store.view.n);
    popRange.value = String(store.view.n);
    dirRadios.forEach((r) => (r.checked = r.value === store.view.d));
  }

  function showPopularity() {
    if (!store.pop) {
      popOut.textContent = 'Pick a number of PINs to highlight them on the map.';
      return;
    }
    const label = store.view.d === 'top' ? 'Most common' : 'Least common';
    popOut.textContent = `${label}: ${fmtInt(store.pop.size)} PINs · ${fmtPct(store.pop.size / nPins)} of space · ${fmtPct(store.pop.share)} of occurrences`;
  }

  function commit() {
    writeState(store.view, tagIds);
    buildImage();
    updateLegend();
    draw();
  }

  /** Applies state.n and state.d: recomputes the set, syncs the controls, repaints. */
  function applyPopularity(fromNumberField = false) {
    recomputePopularity();
    syncPopularityControls(fromNumberField && Number(popN.value) === store.view.n);
    showPopularity();
    commit();
  }

  // --- readouts ---
  /** Relative measure of a PIN's count: "3.2× above average". */
  const liftOf = (pin: number) => lift(ds.counts[pin], ds.total, nPins);

  /** One-line description of a PIN: how it compares with an average PIN, and its rank. */
  const describePin = (pin: number) =>
      `PIN ${pad(pin)} · ${describeLift(liftOf(pin))} · rank #${fmtInt(cov.rank[pin] + 1)}`;

  /** Readout under the map while nothing is hovered: the clicked PIN stays visible (touch has no hover at all). */
  const idleReadout = () => (store.picked !== null ? `${describePin(store.picked)} · selected` : HOVER_HINT);

  function showHover(x: number, y: number) {
    hoverEl.textContent = describePin(store.proj().toPin(x, y));
  }

  function showSelection() {
    if (store.selection.size === 0) {
      selEl.textContent = 'Shift+drag a rectangle on the map.';
      return;
    }
    if (store.selection.size === 1) {
      selEl.textContent = describePin(store.selection.values().next().value as number);
      return;
    }
    const top = [...store.selection]
        .sort((a, b) => ds.counts[b] - ds.counts[a])
        .slice(0, 5)
        .map((p) => `${pad(p)} (${fmtX(liftOf(p))})`)
        .join(', ');
    const share = shareWhere(ds, (p) => store.selection.has(p));
    const avgLift = enrichment(share, store.selection.size, nPins);
    selEl.textContent =
        `${fmtInt(store.selection.size)} PINs · ${fmtPct(share)} of occurrences in ${fmtPct(store.selection.size / nPins)} of PINs ` +
        `(${describeLift(avgLift)}) · top 5: ${top}`;
  }

  /** Statistics of the clicked PIN, always visible in their own section. */
  function showPicked() {
    pickEl.textContent = '';
    const line = (text: string, big = false, muted = false) => {
      const d = document.createElement('div');
      d.textContent = text;
      if (big) d.style.cssText = 'font-size:16px;font-weight:600';
      if (muted) d.className = 'muted';
      pickEl.appendChild(d);
    };
    if (store.picked === null) {
      line('Click a PIN on the map.', false, true);
      return;
    }
    const c = ds.counts[store.picked];
    const rank = cov.rank[store.picked] + 1;
    const matched = tags.filter((_, i) => (mask[store.picked as number] & (1 << i)) !== 0).map((t) => t.label);
    const n = oneIn(c, ds.total);
    line(`PIN ${pad(store.picked)}`, true);
    line(describeLift(liftOf(store.picked)));
    line(`rank #${fmtInt(rank)} of ${fmtInt(nPins)} · top ${fmtPct(rank / nPins)} of PINs`);
    line(matched.length > 0 ? `tags: ${matched.join(', ')}` : 'tags: none');
    line(`${fmtInt(c)} occurrences${n === null ? '' : ` · 1 in ${fmtInt(Math.round(+n.toPrecision(3)))} of all`}`, false, true);
  }

  /** Clicking a PIN selects it; clicking it again (or another PIN) deselects / replaces it. */
  function selectPin(pin: number) {
    store.picked = store.picked === pin ? null : pin;
    if (store.hover === null) hoverEl.textContent = idleReadout();
    showPicked();
  }

  // --- pointer geometry ---
  const local = (e: MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left - store.plot.left, e.clientY - r.top - store.plot.top]; // relative to the map area
  };
  const rawCell = (px: number, py: number): [number, number] => {
    const [fx, fy] = toCell(store.vp, px, py);
    return [Math.floor(fx), Math.floor(fy)];
  };
  /** Cell under the point, or null when the point is outside the map area or the grid. */
  const cellAt = (px: number, py: number): [number, number] | null => {
    if (px < 0 || py < 0 || px >= store.frame.viewW || py >= store.frame.viewH) return null; // over the axes
    const [x, y] = rawCell(px, py);
    return x >= 0 && y >= 0 && x < store.frame.gridW && y < store.frame.gridH ? [x, y] : null;
  };
  /** Cell nearest to the point (for dragging a selection past the edge). */
  const clampedCellAt = (px: number, py: number): [number, number] => {
    const [x, y] = rawCell(px, py);
    return [Math.min(store.frame.gridW - 1, Math.max(0, x)), Math.min(store.frame.gridH - 1, Math.max(0, y))];
  };
  /** Small label next to the cursor: PIN and rank. Hidden while panning or dragging a rectangle. */
  function showTip(cell: [number, number] | null, px: number, py: number) {
    if (!cell || store.drag !== null || isMoving(store)) {
      tipEl.style.display = 'none';
      return;
    }
    const pin = store.proj().toPin(cell[0], cell[1]);
    tipEl.textContent = `${pad(pin)} · #${fmtInt(cov.rank[pin] + 1)}`;
    tipEl.style.display = 'block';
    const gap = 14;
    const cx = store.plot.left + px; // the canvas fills its container, so canvas and container coordinates agree
    const cy = store.plot.top + py;
    const w = tipEl.offsetWidth;
    const h = tipEl.offsetHeight;
    const x = cx + gap + w > store.plot.outerW ? cx - gap - w : cx + gap; // flip at the right and bottom edges
    const y = cy + gap + h > store.plot.outerH ? cy - gap - h : cy + gap;
    tipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  function updateHover(px: number, py: number) {
    store.hover = cellAt(px, py);
    if (store.hover) showHover(store.hover[0], store.hover[1]);
    else hoverEl.textContent = idleReadout();
    showTip(store.hover, px, py);
  }

  // --- events: controls ---
  projEl.addEventListener('change', () => {
    store.view.p = projEl.value;
    writeState(store.view, tagIds);
    buildImage();
    layout();
  });
  cmapEl.addEventListener('change', () => {
    store.view.m = cmapEl.value as ColormapId;
    commit();
  });
  scaleRadios.forEach((r) =>
      r.addEventListener('change', () => {
        store.view.s = r.value as ScaleKind;
        syncControls();
        commit();
      }),
  );
  gammaEl.addEventListener('input', () => {
    store.view.g = Number(gammaEl.value);
    syncControls();
    commit();
  });
  clipEl.addEventListener('input', () => {
    store.view.c = Number(clipEl.value);
    syncControls();
    commit();
  });
  tagsEl.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.bit === undefined) return;
    store.view.t ^= 1 << Number(input.dataset.bit);
    commit();
  });
  dirRadios.forEach((r) =>
      r.addEventListener('change', () => {
        store.view.d = r.value as PopularityDirection;
        applyPopularity();
      }),
  );
  popRange.addEventListener('input', () => {
    store.view.n = Number(popRange.value);
    applyPopularity();
  });
  popN.addEventListener('input', () => {
    const v = Number(popN.value);
    store.view.n = Number.isFinite(v) ? v : 0;
    applyPopularity(true);
  });
  popPresets.forEach((b) =>
      b.addEventListener('click', () => {
        store.view.n = Number(b.dataset.n);
        applyPopularity();
      }),
  );
  clearEl.addEventListener('click', () => {
    store.selection = new Set();
    showSelection();
    buildImage();
    draw();
  });
  resetEl.addEventListener('click', () => {
    store.vp = fit(store.frame);
    draw();
  });

  // --- events: map ---
  // mouse: click = select a PIN, drag = pan, Shift+drag = rectangle, wheel / double-click = zoom
  // touch: tap = select a PIN, drag = pan, two fingers = pinch zoom + pan, double-tap = zoom
  const isTouch = (e: PointerEvent) => e.pointerType === 'touch';

  /** Distance and centre of the first two pressed pointers. */
  function pinchGeometry() {
    const [a, b] = [...store.pointers.values()];
    return { dist: Math.hypot(b[0] - a[0], b[1] - a[1]), cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 };
  }

  function hideHover() {
    store.hover = null;
    hoverEl.textContent = idleReadout();
    tipEl.style.display = 'none';
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
    draw();
  });
  canvas.addEventListener('pointermove', (e) => {
    const [px, py] = local(e);
    if (store.pointers.has(e.pointerId)) store.pointers.set(e.pointerId, [px, py]);

    if (store.pinch && store.pointers.size >= 2) {
      const g = pinchGeometry();
      store.vp = panBy(store.vp, store.frame, g.cx - store.pinch.cx, g.cy - store.pinch.cy);
      if (store.pinch.dist > 0 && g.dist > 0) store.vp = zoomAt(store.vp, store.frame, g.cx, g.cy, g.dist / store.pinch.dist);
      store.pinch = g;
      draw();
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
    draw();
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
      draw();
      return;
    }

    if (store.drag) {
      const p = store.proj();
      store.selection = new Set();
      for (let yy = Math.min(store.drag.y0, store.drag.y1); yy <= Math.max(store.drag.y0, store.drag.y1); yy++)
        for (let xx = Math.min(store.drag.x0, store.drag.x1); xx <= Math.max(store.drag.x0, store.drag.x1); xx++)
          store.selection.add(p.toPin(xx, yy));
      store.drag = null;
      showSelection();
      buildImage();
    }
    const pressed = store.down;
    store.down = null;
    store.panning = null;
    canvas.style.cursor = '';
    if (!cancelled && pressed && !pressed.moved) onClick(pressed.cell, px, py, isTouch(e));
    draw();
  }
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('lostpointercapture', (e) => endPointer(e, true)); // no-op after a normal release
  canvas.addEventListener('pointerleave', () => {
    hideHover();
    draw();
  });
  canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const [px, py] = local(e);
        const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // Firefox reports lines, not pixels
        store.vp = zoomAt(store.vp, store.frame, px, py, Math.exp(-dy * 0.0015));
        updateHover(px, py);
        draw();
      },
      { passive: false },
  );
  recomputePopularity();
  syncPopularityControls(false);
  showPopularity();
  syncControls();
  buildImage();
  updateLegend();
  layout();
  showSelection();
  showPicked();
  new ResizeObserver(() => layout(false)).observe(stageEl);
  window.addEventListener('resize', () => layout(false)); // page zoom changes the pixel ratio without resizing the stage
}

installHints();
main().catch(console.error);