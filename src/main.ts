import { shareWhere } from './core/dataset';
import { projectionsFor } from './core/projection';
import { classify, tagsFor } from './core/classifier';
import { makeScale, type Scale, type ScaleKind } from './core/scale';
import { legendTicks } from './core/legend';
import { visibleSet } from './core/visibility';
import { describeLift, enrichment, fmtX, lift, oneIn } from './core/measure';
import { COLORMAPS, COLORMAP_IDS, lut, type ColormapId } from './core/colormap';
import {
  buildCoverage,
  selectByPopularity,
  valueAtPercentile,
  type PopularityDirection,
  type PopularitySelection,
} from './core/coverage';
import { fit, panBy, toCell, toScreen, zoomAt, type Frame, type Viewport } from './core/viewport';
import { drawAxes, plotRect, type PlotRect } from './app/axes';
import { installHints } from './app/hints';
import { loadDataset } from './app/load';
import { readState, writeState, type ViewState } from './app/state';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const fmtInt = (x: number) => x.toLocaleString('en-US');
const fmtPct = (x: number) => (x * 100).toFixed(x < 0.001 ? 4 : 2) + '%';
const HOVER_HINT = 'Hover over the map.';
const DIM_ALPHA = 40;
const CLICK_SLOP = 5; // pointer travel (CSS px) below which a mouse press counts as a click, not a pan
const TOUCH_CLICK_SLOP = 10; // fingers are less steady than a mouse
const DOUBLE_CLICK_MS = 350; // two clicks / taps this close in time and space zoom in
const DOUBLE_CLICK_PX = 10;

async function main() {
  const N = 4;
  const ds = await loadDataset(N, `${import.meta.env.BASE_URL}pins${N}.bin`);
  const projections = projectionsFor(N);
  const projIds = Object.keys(projections);
  const tags = tagsFor(N);
  const tagIds = tags.map((t) => t.id); // the URL stores tags by id, not by position
  const mask = classify(N);
  const cov = buildCoverage(ds);
  const nPins = ds.counts.length;
  const pad = (pin: number) => String(pin).padStart(N, '0');

  const { minCount, maxCount } = ds;
  const avgCount = ds.total / nPins; // occurrences of an average PIN: the reference (1×) of every relative measure

  const canvas = $<HTMLCanvasElement>('map');
  const ctx = canvas.getContext('2d')!;
  const legendCanvas = $<HTMLCanvasElement>('legend');
  const legendCtx = legendCanvas.getContext('2d')!;
  const hoverEl = $<HTMLDivElement>('hover');
  const tipEl = $<HTMLDivElement>('tip');
  const selEl = $<HTMLDivElement>('sel');
  const pickEl = $<HTMLDivElement>('pick');
  const projEl = $<HTMLSelectElement>('proj');
  const cmapEl = $<HTMLSelectElement>('cmap');
  const gammaEl = $<HTMLInputElement>('gamma');
  const gammaOut = $<HTMLSpanElement>('gammaOut');
  const clipEl = $<HTMLInputElement>('clip');
  const clipOut = $<HTMLSpanElement>('clipOut');
  const tagsEl = $<HTMLDivElement>('tags');
  const popN = $<HTMLInputElement>('popN');
  const popRange = $<HTMLInputElement>('popRange');
  const popOut = $<HTMLDivElement>('popOut');
  const resetEl = $<HTMLButtonElement>('reset');
  const legendCapEl = $<HTMLDivElement>('legendCap');
  const legendTicksEl = $<HTMLDivElement>('legendTicks');
  const mkHoverEl = $<HTMLDivElement>('mkHover');
  const mkPickEl = $<HTMLDivElement>('mkPick');

  const defaults: ViewState = { p: projIds[0], s: 'log', g: 0.5, t: 0, m: 'viridis', c: 99, n: 0, d: 'top' };
  const state = readState(location.hash, defaults, projIds, tagIds);
  const proj = () => projections[state.p];

  let selection = new Set<number>();
  let pop: PopularitySelection | null = null; // PINs highlighted by popularity (null = off)
  let drag: { x0: number; y0: number; x1: number; y1: number } | null = null; // selection rectangle (cells)
  let panning: [number, number] | null = null; // last pointer position while panning
  // a pressed pointer: where it went down, the cell under it, and whether it has travelled far enough to be a pan
  let down: { px: number; py: number; cell: [number, number] | null; moved: boolean; slop: number } | null = null;
  const pointers = new Map<number, [number, number]>(); // pressed pointers (map-area coordinates), in press order
  let pinch: { dist: number; cx: number; cy: number } | null = null; // two-finger gesture in progress
  let lastClick: { t: number; px: number; py: number } | null = null; // for double-click / double-tap zoom
  let picked: number | null = null; // PIN selected by clicking; it has its own section and does not dim the map
  let hover: [number, number] | null = null; // hovered cell
  let frame: Frame = { gridW: 1, gridH: 1, viewW: 1, viewH: 1 };
  let vp: Viewport = { x: 0, y: 0, k: 1 };
  /** True while the map itself is being moved (pan or pinch): guide lines and the tooltip stay out of the way. */
  const moving = () => (down !== null && down.moved) || pinch !== null;
  let dpr = window.devicePixelRatio || 1; // pixel ratio the canvas backing store was sized for (see layout)
  let scale: Scale; // current colour scale; buildImage() creates it, the legend and its markers reuse it
  let plot: PlotRect = plotRect(1, 1, N); // map area inside the canvas; the rest is reserved for the axes

  // colour image of the grid, one pixel per cell; the visible canvas draws it through the viewport
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d')!;

  $('src').textContent =
      ds.source === 'hibp'
          ? `HIBP · ${fmtInt(ds.total)} occurrences`
          : 'DEMO – synthetic data (run `npm run data` to fetch HIBP)';

  // --- controls ---
  for (const id of projIds) projEl.add(new Option(projections[id].name, id));
  projEl.value = state.p;
  for (const id of COLORMAP_IDS) cmapEl.add(new Option(COLORMAPS[id].label, id));
  cmapEl.value = state.m;
  document.querySelectorAll<HTMLInputElement>('input[name=s]').forEach((r) => (r.checked = r.value === state.s));
  gammaEl.value = String(state.g);
  clipEl.value = String(state.c);
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
    row.innerHTML = `<input type="checkbox" data-bit="${i}"> ${t.label} <span class="muted">${tagStats(tagShare[i], tagSize[i])}</span>`;
    row.querySelector('input')!.checked = ((state.t >> i) & 1) === 1;
    tagsEl.appendChild(row);
  });
  const rest = document.createElement('div');
  rest.className = 'muted';
  rest.textContent = `Remainder (no tag): ${tagStats(restShare, restSize)} · tag shares may overlap`;
  tagsEl.appendChild(rest);

  /** Enables only the sliders relevant to the chosen scale. */
  function syncControls() {
    gammaEl.disabled = state.s !== 'gamma';
    clipEl.disabled = state.s !== 'linear' && state.s !== 'gamma';
    gammaOut.textContent = state.g.toFixed(2);
    clipOut.textContent = `${state.c}%`;
  }

  const clipMax = () => Math.max(1, valueAtPercentile(ds, cov, state.c));

  // --- popularity filter ---
  function recomputePopularity() {
    state.n = Math.min(nPins, Math.max(0, Math.round(state.n)));
    pop = state.n > 0 ? selectByPopularity(ds, cov, state.n, state.d) : null;
  }

  /** Mirrors the state into the radios, the number field and the slider. */
  function syncPopularityControls(skipNumberField: boolean) {
    if (!skipNumberField) popN.value = String(state.n);
    popRange.value = String(state.n);
    document.querySelectorAll<HTMLInputElement>('input[name=d]').forEach((r) => (r.checked = r.value === state.d));
  }

  function showPopularity() {
    if (!pop) {
      popOut.textContent = 'Pick a number of PINs to highlight them on the map.';
      return;
    }
    const label = state.d === 'top' ? 'Most common' : 'Least common';
    popOut.textContent = `${label}: ${fmtInt(pop.size)} PINs · ${fmtPct(pop.size / nPins)} of space · ${fmtPct(pop.share)} of occurrences`;
  }

  // --- rendering ---
  /** Recolours the grid image: after a change of colours, scale, filters or selection. */
  function buildImage() {
    const p = proj();
    off.width = p.width;
    off.height = p.height;
    const img = offCtx.createImageData(p.width, p.height);
    scale = makeScale(ds.counts, { kind: state.s, gamma: state.g, clipMax: clipMax() });
    const norm = scale.norm;
    const colors = lut(state.m);
    const visible = visibleSet(nPins, {
      tagMask: mask,
      enabledTags: state.t,
      popularity: pop ? pop.member : null,
      selection,
    });
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
    switch (state.s) {
      case 'linear':
        return 'Occurrences relative to an average PIN (1× = all PINs equally common). Linear, brightest from the clip level.';
      case 'gamma':
        return `Occurrences relative to an average PIN (1× = all PINs equally common). Gamma ${state.g.toFixed(2)}, brightest from the clip level.`;
      case 'log':
        return 'Occurrences relative to an average PIN (1× = all PINs equally common). Logarithmic, from the rarest to the commonest PIN.';
      case 'rank':
        return 'Place in the ranking, not the count: every shade holds the same number of PINs.';
    }
  }

  /** Colour bar with ticks that say what each colour means under the current scale. */
  function updateLegend() {
    const colors = lut(state.m);
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
      kind: state.s,
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
    placeMarker(mkHoverEl, hover && !moving() ? proj().toPin(hover[0], hover[1]) : null);
    placeMarker(mkPickEl, picked);
  }

  /** Paints the grid image through the viewport, plus the hover outline and the selection rectangle. */
  function draw() {
    if ((window.devicePixelRatio || 1) !== dpr) {
      layout(false); // page zoom changed the pixel ratio: resize the backing store first (layout redraws)
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, plot.outerW, plot.outerH);

    // the map, clipped to its area; coordinates inside are relative to the area's top-left corner
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.left, plot.top, plot.width, plot.height);
    ctx.clip();
    ctx.translate(plot.left, plot.top);
    ctx.imageSmoothingEnabled = false;
    const [sx, sy] = toScreen(vp, 0, 0);
    ctx.drawImage(off, sx, sy, frame.gridW * vp.k, frame.gridH * vp.k);

    if (hover && !moving()) {
      // thin guide lines through the hovered cell, pointing at both axes
      const [gx, gy] = toScreen(vp, hover[0] + 0.5, hover[1] + 0.5);
      const lx = Math.round(gx) + 0.5;
      const ly = Math.round(gy) + 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, frame.viewH);
      ctx.moveTo(0, ly);
      ctx.lineTo(frame.viewW, ly);
      ctx.stroke();
    }
    if (hover && !moving() && vp.k >= 4) {
      const [hx, hy] = toScreen(vp, hover[0], hover[1]);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(hx + 0.5, hy + 0.5, vp.k - 1, vp.k - 1);
    }
    if (picked !== null) {
      // square around the clicked PIN: dark outline under a light one, readable on every palette
      const [pcx, pcy] = proj().toXY(picked);
      const [mx, my] = toScreen(vp, pcx + 0.5, pcy + 0.5);
      const s = Math.max(vp.k + 2, 9);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#000';
      ctx.strokeRect(mx - s / 2, my - s / 2, s, s);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(mx - s / 2, my - s / 2, s, s);
    }
    if (drag) {
      const x0 = Math.min(drag.x0, drag.x1);
      const y0 = Math.min(drag.y0, drag.y1);
      const [rx, ry] = toScreen(vp, x0, y0);
      const w = (Math.abs(drag.x1 - drag.x0) + 1) * vp.k;
      const h = (Math.abs(drag.y1 - drag.y0) + 1) * vp.k;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(rx, ry, w, h);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + 0.5, ry + 0.5, w - 1, h - 1);
    }
    ctx.restore();

    drawAxes(ctx, plot, vp, proj(), moving() ? null : hover);
    refreshMarkers();
  }

  /** Sizes the canvas to its container. Refits the whole grid, or (on a mere resize) keeps the current view. */
  function layout(refit = true) {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    plot = plotRect(r.width, r.height, N);
    frame = { gridW: proj().width, gridH: proj().height, viewW: plot.width, viewH: plot.height };
    vp = refit ? fit(frame) : panBy(vp, frame, 0, 0); // panBy re-clamps the view to the new frame
    draw();
  }

  function commit() {
    writeState(state, tagIds);
    buildImage();
    updateLegend();
    draw();
  }

  /** Applies state.n and state.d: recomputes the set, syncs the controls, repaints. */
  function applyPopularity(fromNumberField = false) {
    recomputePopularity();
    syncPopularityControls(fromNumberField && Number(popN.value) === state.n);
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
  const idleReadout = () => (picked !== null ? `${describePin(picked)} · selected` : HOVER_HINT);

  function showHover(x: number, y: number) {
    hoverEl.textContent = describePin(proj().toPin(x, y));
  }

  function showSelection() {
    if (selection.size === 0) {
      selEl.textContent = 'Shift+drag a rectangle on the map.';
      return;
    }
    if (selection.size === 1) {
      selEl.textContent = describePin(selection.values().next().value as number);
      return;
    }
    const top = [...selection]
        .sort((a, b) => ds.counts[b] - ds.counts[a])
        .slice(0, 5)
        .map((p) => `${pad(p)} (${fmtX(liftOf(p))})`)
        .join(', ');
    const share = shareWhere(ds, (p) => selection.has(p));
    const avgLift = enrichment(share, selection.size, nPins);
    selEl.textContent =
        `${fmtInt(selection.size)} PINs · ${fmtPct(share)} of occurrences in ${fmtPct(selection.size / nPins)} of PINs ` +
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
    if (picked === null) {
      line('Click a PIN on the map.', false, true);
      return;
    }
    const c = ds.counts[picked];
    const rank = cov.rank[picked] + 1;
    const matched = tags.filter((_, i) => (mask[picked as number] & (1 << i)) !== 0).map((t) => t.label);
    const n = oneIn(c, ds.total);
    line(`PIN ${pad(picked)}`, true);
    line(describeLift(liftOf(picked)));
    line(`rank #${fmtInt(rank)} of ${fmtInt(nPins)} · top ${fmtPct(rank / nPins)} of PINs`);
    line(matched.length > 0 ? `tags: ${matched.join(', ')}` : 'tags: none');
    line(`${fmtInt(c)} occurrences${n === null ? '' : ` · 1 in ${fmtInt(Math.round(+n.toPrecision(3)))} of all`}`, false, true);
  }

  /** Clicking a PIN selects it; clicking it again (or another PIN) deselects / replaces it. */
  function selectPin(pin: number) {
    picked = picked === pin ? null : pin;
    if (hover === null) hoverEl.textContent = idleReadout();
    showPicked();
  }

  // --- pointer geometry ---
  const local = (e: MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left - plot.left, e.clientY - r.top - plot.top]; // relative to the map area
  };
  const rawCell = (px: number, py: number): [number, number] => {
    const [fx, fy] = toCell(vp, px, py);
    return [Math.floor(fx), Math.floor(fy)];
  };
  /** Cell under the point, or null when the point is outside the map area or the grid. */
  const cellAt = (px: number, py: number): [number, number] | null => {
    if (px < 0 || py < 0 || px >= frame.viewW || py >= frame.viewH) return null; // over the axes
    const [x, y] = rawCell(px, py);
    return x >= 0 && y >= 0 && x < frame.gridW && y < frame.gridH ? [x, y] : null;
  };
  /** Cell nearest to the point (for dragging a selection past the edge). */
  const clampedCellAt = (px: number, py: number): [number, number] => {
    const [x, y] = rawCell(px, py);
    return [Math.min(frame.gridW - 1, Math.max(0, x)), Math.min(frame.gridH - 1, Math.max(0, y))];
  };
  /** Small label next to the cursor: PIN and rank. Hidden while panning or dragging a rectangle. */
  function showTip(cell: [number, number] | null, px: number, py: number) {
    if (!cell || drag !== null || moving()) {
      tipEl.style.display = 'none';
      return;
    }
    const pin = proj().toPin(cell[0], cell[1]);
    tipEl.textContent = `${pad(pin)} · #${fmtInt(cov.rank[pin] + 1)}`;
    tipEl.style.display = 'block';
    const gap = 14;
    const cx = plot.left + px; // the canvas fills its container, so canvas and container coordinates agree
    const cy = plot.top + py;
    const w = tipEl.offsetWidth;
    const h = tipEl.offsetHeight;
    const x = cx + gap + w > plot.outerW ? cx - gap - w : cx + gap; // flip at the right and bottom edges
    const y = cy + gap + h > plot.outerH ? cy - gap - h : cy + gap;
    tipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  function updateHover(px: number, py: number) {
    hover = cellAt(px, py);
    if (hover) showHover(hover[0], hover[1]);
    else hoverEl.textContent = idleReadout();
    showTip(hover, px, py);
  }

  // --- events: controls ---
  projEl.addEventListener('change', () => {
    state.p = projEl.value;
    writeState(state, tagIds);
    buildImage();
    layout();
  });
  cmapEl.addEventListener('change', () => {
    state.m = cmapEl.value as ColormapId;
    commit();
  });
  document.querySelectorAll<HTMLInputElement>('input[name=s]').forEach((r) =>
      r.addEventListener('change', () => {
        state.s = r.value as ScaleKind;
        syncControls();
        commit();
      }),
  );
  gammaEl.addEventListener('input', () => {
    state.g = Number(gammaEl.value);
    syncControls();
    commit();
  });
  clipEl.addEventListener('input', () => {
    state.c = Number(clipEl.value);
    syncControls();
    commit();
  });
  tagsEl.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.bit === undefined) return;
    state.t ^= 1 << Number(input.dataset.bit);
    commit();
  });
  document.querySelectorAll<HTMLInputElement>('input[name=d]').forEach((r) =>
      r.addEventListener('change', () => {
        state.d = r.value as PopularityDirection;
        applyPopularity();
      }),
  );
  popRange.addEventListener('input', () => {
    state.n = Number(popRange.value);
    applyPopularity();
  });
  popN.addEventListener('input', () => {
    const v = Number(popN.value);
    state.n = Number.isFinite(v) ? v : 0;
    applyPopularity(true);
  });
  document.querySelectorAll<HTMLButtonElement>('button[data-n]').forEach((b) =>
      b.addEventListener('click', () => {
        state.n = Number(b.dataset.n);
        applyPopularity();
      }),
  );
  $('clear').addEventListener('click', () => {
    selection = new Set();
    showSelection();
    buildImage();
    draw();
  });
  resetEl.addEventListener('click', () => {
    vp = fit(frame);
    draw();
  });

  // --- events: map ---
  // mouse: click = select a PIN, drag = pan, Shift+drag = rectangle, wheel / double-click = zoom
  // touch: tap = select a PIN, drag = pan, two fingers = pinch zoom + pan, double-tap = zoom
  const isTouch = (e: PointerEvent) => e.pointerType === 'touch';

  /** Distance and centre of the first two pressed pointers. */
  function pinchGeometry() {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(b[0] - a[0], b[1] - a[1]), cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 };
  }

  function hideHover() {
    hover = null;
    hoverEl.textContent = idleReadout();
    tipEl.style.display = 'none';
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const [px, py] = local(e);
    pointers.set(e.pointerId, [px, py]);
    if (pointers.size >= 2) {
      // a second finger turns the gesture into a pinch: forget the click, pan or rectangle in progress
      down = null;
      panning = null;
      drag = null;
      hideHover();
      pinch = pinchGeometry();
    } else if (e.shiftKey && !isTouch(e)) {
      const [x, y] = clampedCellAt(px, py);
      drag = { x0: x, y0: y, x1: x, y1: y };
    } else {
      // click or pan is decided once the pointer has travelled `slop` pixels
      down = { px, py, cell: cellAt(px, py), moved: false, slop: isTouch(e) ? TOUCH_CLICK_SLOP : CLICK_SLOP };
      panning = [px, py];
    }
    draw();
  });
  canvas.addEventListener('pointermove', (e) => {
    const [px, py] = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [px, py]);

    if (pinch && pointers.size >= 2) {
      const g = pinchGeometry();
      vp = panBy(vp, frame, g.cx - pinch.cx, g.cy - pinch.cy);
      if (pinch.dist > 0 && g.dist > 0) vp = zoomAt(vp, frame, g.cx, g.cy, g.dist / pinch.dist);
      pinch = g;
      draw();
      return;
    }
    if (down && !down.moved && Math.hypot(px - down.px, py - down.py) >= down.slop) {
      down.moved = true;
      canvas.style.cursor = 'grabbing'; // the hand only appears while the map is really being dragged
    }
    if (panning && down && down.moved) {
      vp = panBy(vp, frame, px - panning[0], py - panning[1]);
      panning = [px, py];
    }
    if (drag) [drag.x1, drag.y1] = clampedCellAt(px, py);
    if (isTouch(e)) hideHover(); // a finger covers the cell anyway; guide lines under it would only get in the way
    else updateHover(px, py);
    draw();
  });

  /** A press that did not travel: the second one in quick succession zooms in, otherwise it selects the PIN under it. */
  function onClick(cell: [number, number] | null, px: number, py: number, touch: boolean) {
    const now = performance.now();
    if (
        lastClick !== null &&
        now - lastClick.t < DOUBLE_CLICK_MS &&
        Math.hypot(px - lastClick.px, py - lastClick.py) < DOUBLE_CLICK_PX
    ) {
      lastClick = null;
      vp = zoomAt(vp, frame, px, py, 2); // the first click of the pair has already selected the PIN
      if (!touch) updateHover(px, py);
      return;
    }
    lastClick = { t: now, px, py };
    if (cell) selectPin(proj().toPin(cell[0], cell[1]));
  }

  function endPointer(e: PointerEvent, cancelled: boolean) {
    if (!pointers.delete(e.pointerId)) return; // not a press we tracked (e.g. right button, or already finished)
    const [px, py] = local(e);

    if (pinch) {
      if (pointers.size >= 2) {
        pinch = pinchGeometry(); // a third finger left: carry on with the first two
        return;
      }
      pinch = null;
      const rest = [...pointers.values()][0];
      // the finger that stays keeps panning, and its release is never a click
      down = rest ? { px: rest[0], py: rest[1], cell: null, moved: true, slop: 0 } : null;
      panning = rest ? [rest[0], rest[1]] : null;
      canvas.style.cursor = '';
      draw();
      return;
    }

    if (drag) {
      const p = proj();
      selection = new Set();
      for (let yy = Math.min(drag.y0, drag.y1); yy <= Math.max(drag.y0, drag.y1); yy++)
        for (let xx = Math.min(drag.x0, drag.x1); xx <= Math.max(drag.x0, drag.x1); xx++)
          selection.add(p.toPin(xx, yy));
      drag = null;
      showSelection();
      buildImage();
    }
    const pressed = down;
    down = null;
    panning = null;
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
        vp = zoomAt(vp, frame, px, py, Math.exp(-dy * 0.0015));
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
  new ResizeObserver(() => layout(false)).observe($('stage'));
  window.addEventListener('resize', () => layout(false)); // page zoom changes the pixel ratio without resizing the stage
}

installHints();
main().catch(console.error);