import { shareWhere } from './core/dataset';
import { projectionsFor } from './core/projection';
import { classify, tagsFor } from './core/classifier';
import { makeNormalizer, type ScaleKind } from './core/scale';
import { COLORMAPS, COLORMAP_IDS, lut, type ColormapId } from './core/colormap';
import {
  buildCoverage,
  selectByPopularity,
  valueAtPercentile,
  type PopularityDirection,
  type PopularitySelection,
} from './core/coverage';
import { fit, panBy, toCell, toScreen, zoomAt, type Frame, type Viewport } from './core/viewport';
import { loadDataset } from './app/load';
import { readState, writeState, type ViewState } from './app/state';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const fmtInt = (x: number) => x.toLocaleString('en-US');
const fmtPct = (x: number) => (x * 100).toFixed(x < 0.001 ? 4 : 2) + '%';
const HOVER_HINT = 'Hover over the map.';
const DIM_ALPHA = 40;

async function main() {
  const N = 4;
  const ds = await loadDataset(N, `${import.meta.env.BASE_URL}pins${N}.bin`);
  const projections = projectionsFor(N);
  const projIds = Object.keys(projections);
  const tags = tagsFor(N);
  const mask = classify(N);
  const cov = buildCoverage(ds);
  const nPins = ds.counts.length;
  const pad = (pin: number) => String(pin).padStart(N, '0');

  let maxCount = 0;
  for (const c of ds.counts) if (c > maxCount) maxCount = c;

  const canvas = $<HTMLCanvasElement>('map');
  const ctx = canvas.getContext('2d')!;
  const legendCanvas = $<HTMLCanvasElement>('legend');
  const legendCtx = legendCanvas.getContext('2d')!;
  const hoverEl = $<HTMLDivElement>('hover');
  const selEl = $<HTMLDivElement>('sel');
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

  const defaults: ViewState = { p: projIds[0], s: 'log', g: 0.5, t: 0, m: 'viridis', c: 99, n: 0, d: 'top' };
  const state = readState(location.hash, defaults, projIds);
  const proj = () => projections[state.p];

  let selection = new Set<number>();
  let pop: PopularitySelection | null = null; // PINs highlighted by popularity (null = off)
  let drag: { x0: number; y0: number; x1: number; y1: number } | null = null; // selection rectangle (cells)
  let panning: [number, number] | null = null; // last pointer position while panning
  let hover: [number, number] | null = null; // hovered cell
  let frame: Frame = { gridW: 1, gridH: 1, viewW: 1, viewH: 1 };
  let vp: Viewport = { x: 0, y: 0, k: 1 };

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
  tags.forEach((t, i) => {
    const row = document.createElement('label');
    row.innerHTML = `<input type="checkbox" data-bit="${i}"> ${t.label} <span class="muted">${fmtPct(tagShare[i])}</span>`;
    row.querySelector('input')!.checked = ((state.t >> i) & 1) === 1;
    tagsEl.appendChild(row);
  });
  const rest = document.createElement('div');
  rest.className = 'muted';
  rest.textContent = `Remainder (no tag): ${fmtPct(restShare)} · tag shares may overlap`;
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
    const tied = pop.size > state.n ? ` (+${fmtInt(pop.size - state.n)} tied)` : '';
    popOut.textContent = `${label}: ${fmtInt(pop.size)} PINs${tied} · ${fmtPct(pop.size / nPins)} of space · ${fmtPct(pop.share)} of occurrences`;
  }

  // --- rendering ---
  /** Recolours the grid image: after a change of colours, scale, filters or selection. */
  function buildImage() {
    const p = proj();
    off.width = p.width;
    off.height = p.height;
    const img = offCtx.createImageData(p.width, p.height);
    const norm = makeNormalizer(ds.counts, { kind: state.s, gamma: state.g, clipMax: clipMax() });
    const colors = lut(state.m);
    const hasSelection = selection.size > 0;
    const popMember = pop ? pop.member : null;
    for (let pin = 0; pin < nPins; pin++) {
      const [x, y] = p.toXY(pin);
      const i = Math.min(255, Math.max(0, Math.round(norm(pin) * 255))) * 3;
      const visible =
          (state.t === 0 || (mask[pin] & state.t) !== 0) &&
          (popMember === null || popMember[pin] === 1) &&
          (!hasSelection || selection.has(pin));
      const o = (y * p.width + x) * 4;
      img.data[o] = colors[i];
      img.data[o + 1] = colors[i + 1];
      img.data[o + 2] = colors[i + 2];
      img.data[o + 3] = visible ? 255 : DIM_ALPHA;
    }
    offCtx.putImageData(img, 0, 0);
  }

  const SCALE_LABEL: Record<ScaleKind, string> = {
    linear: 'linear',
    gamma: 'gamma',
    log: 'logarithmic',
    rank: 'rank-equalised',
  };

  /** Colour bar with the value range of the current scale. */
  function updateLegend() {
    const colors = lut(state.m);
    const w = legendCanvas.width;
    const h = legendCanvas.height;
    for (let x = 0; x < w; x++) {
      const i = Math.round((x / (w - 1)) * 255) * 3;
      legendCtx.fillStyle = `rgb(${colors[i]},${colors[i + 1]},${colors[i + 2]})`;
      legendCtx.fillRect(x, 0, 1, h);
    }
    const clipped = state.s === 'linear' || state.s === 'gamma';
    $('legendLo').textContent = state.s === 'rank' ? 'least common' : '0';
    $('legendMid').textContent = state.s === 'gamma' ? `gamma ${state.g.toFixed(2)}` : SCALE_LABEL[state.s];
    $('legendHi').textContent = state.s === 'rank' ? 'most common' : clipped ? `≥ ${fmtInt(clipMax())}` : fmtInt(maxCount);
  }

  /** Paints the grid image through the viewport, plus the hover outline and the selection rectangle. */
  function draw() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, frame.viewW, frame.viewH);
    ctx.imageSmoothingEnabled = false;
    const [sx, sy] = toScreen(vp, 0, 0);
    ctx.drawImage(off, sx, sy, frame.gridW * vp.k, frame.gridH * vp.k);

    if (hover && vp.k >= 4) {
      const [hx, hy] = toScreen(vp, hover[0], hover[1]);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(hx + 0.5, hy + 0.5, vp.k - 1, vp.k - 1);
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
  }

  /** Sizes the canvas to its container and fits the whole grid into view. */
  function layout() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    frame = { gridW: proj().width, gridH: proj().height, viewW: r.width, viewH: r.height };
    vp = fit(frame);
    draw();
  }

  function commit() {
    writeState(state);
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
  function showHover(x: number, y: number) {
    const pin = proj().toPin(x, y);
    const c = ds.counts[pin];
    hoverEl.textContent = `PIN ${pad(pin)} · ${fmtInt(c)} occurrences · ${fmtPct(c / ds.total)} · rank #${fmtInt(cov.rank[pin] + 1)}`;
  }

  function showSelection() {
    if (selection.size === 0) {
      selEl.textContent = 'Shift+drag a rectangle on the map.';
      return;
    }
    const top = [...selection]
        .sort((a, b) => ds.counts[b] - ds.counts[a])
        .slice(0, 5)
        .map((p) => `${pad(p)} (${fmtInt(ds.counts[p])})`)
        .join(', ');
    selEl.textContent = `${fmtInt(selection.size)} PINs · ${fmtPct(shareWhere(ds, (p) => selection.has(p)))} of occurrences · top 5: ${top}`;
  }

  // --- pointer geometry ---
  const local = (e: MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const rawCell = (px: number, py: number): [number, number] => {
    const [fx, fy] = toCell(vp, px, py);
    return [Math.floor(fx), Math.floor(fy)];
  };
  /** Cell under the point, or null when the point is outside the grid. */
  const cellAt = (px: number, py: number): [number, number] | null => {
    const [x, y] = rawCell(px, py);
    return x >= 0 && y >= 0 && x < frame.gridW && y < frame.gridH ? [x, y] : null;
  };
  /** Cell nearest to the point (for dragging a selection past the edge). */
  const clampedCellAt = (px: number, py: number): [number, number] => {
    const [x, y] = rawCell(px, py);
    return [Math.min(frame.gridW - 1, Math.max(0, x)), Math.min(frame.gridH - 1, Math.max(0, y))];
  };
  function updateHover(px: number, py: number) {
    hover = cellAt(px, py);
    if (hover) showHover(hover[0], hover[1]);
    else hoverEl.textContent = HOVER_HINT;
  }

  // --- events: controls ---
  projEl.addEventListener('change', () => {
    state.p = projEl.value;
    writeState(state);
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

  // --- events: map (drag = pan, Shift+drag = select, wheel / double-click = zoom) ---
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const [px, py] = local(e);
    if (e.shiftKey) {
      const [x, y] = clampedCellAt(px, py);
      drag = { x0: x, y0: y, x1: x, y1: y };
    } else {
      panning = [px, py];
      canvas.style.cursor = 'grabbing';
    }
    draw();
  });
  canvas.addEventListener('pointermove', (e) => {
    const [px, py] = local(e);
    if (panning) {
      vp = panBy(vp, frame, px - panning[0], py - panning[1]);
      panning = [px, py];
    }
    if (drag) [drag.x1, drag.y1] = clampedCellAt(px, py);
    updateHover(px, py);
    draw();
  });
  function endGesture() {
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
    panning = null;
    canvas.style.cursor = '';
    draw();
  }
  canvas.addEventListener('pointerup', endGesture);
  canvas.addEventListener('pointercancel', endGesture);
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    hoverEl.textContent = HOVER_HINT;
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
  canvas.addEventListener('dblclick', (e) => {
    const [px, py] = local(e);
    vp = zoomAt(vp, frame, px, py, 2);
    updateHover(px, py);
    draw();
  });

  recomputePopularity();
  syncPopularityControls(false);
  showPopularity();
  syncControls();
  buildImage();
  updateLegend();
  layout();
  showSelection();
  new ResizeObserver(layout).observe($('stage'));
}

main().catch(console.error);