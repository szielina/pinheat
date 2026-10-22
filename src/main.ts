import { shareWhere } from './core/dataset';
import { projectionsFor } from './core/projection';
import { classify, tagsFor } from './core/classifier';
import { normalizer, palette, type ScaleKind } from './core/scale';
import { buildCoverage, coverageAt } from './core/coverage';
import { fit, panBy, toCell, toScreen, zoomAt, type Frame, type Viewport } from './core/viewport';
import { loadDataset } from './app/load';
import { readState, writeState, type ViewState } from './app/state';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const fmtInt = (x: number) => x.toLocaleString('en-US');
const fmtPct = (x: number) => (x * 100).toFixed(x < 0.001 ? 4 : 2) + '%';
const HOVER_HINT = 'Hover over the map.';

async function main() {
  const N = 4;
  const ds = await loadDataset(N, `${import.meta.env.BASE_URL}pins${N}.bin`);
  const projections = projectionsFor(N);
  const projIds = Object.keys(projections);
  const tags = tagsFor(N);
  const mask = classify(N);
  const cov = buildCoverage(ds);
  const pad = (pin: number) => String(pin).padStart(N, '0');

  let maxCount = 0;
  for (const c of ds.counts) if (c > maxCount) maxCount = c;

  const canvas = $<HTMLCanvasElement>('map');
  const ctx = canvas.getContext('2d')!;
  const hoverEl = $<HTMLDivElement>('hover');
  const selEl = $<HTMLDivElement>('sel');
  const projEl = $<HTMLSelectElement>('proj');
  const gammaEl = $<HTMLInputElement>('gamma');
  const tagsEl = $<HTMLDivElement>('tags');
  const triesEl = $<HTMLInputElement>('tries');
  const triesOut = $<HTMLDivElement>('triesOut');
  const resetEl = $<HTMLButtonElement>('reset');

  const defaults: ViewState = { p: projIds[0], s: 'log', g: 0.5, t: 0 };
  const state = readState(location.hash, defaults, projIds);
  const proj = () => projections[state.p];

  let selection = new Set<number>();
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
  document.querySelectorAll<HTMLInputElement>('input[name=s]').forEach((r) => (r.checked = r.value === state.s));
  gammaEl.value = String(state.g);
  triesEl.max = String(ds.counts.length);

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

  // --- rendering ---
  /** Recolours the grid image: after a change of data view (projection, scale, tags, selection). */
  function buildImage() {
    const p = proj();
    off.width = p.width;
    off.height = p.height;
    const img = offCtx.createImageData(p.width, p.height);
    const norm = normalizer(state.s, maxCount, state.g);
    for (let pin = 0; pin < ds.counts.length; pin++) {
      const [x, y] = p.toXY(pin);
      let [r, g, b] = palette(norm(ds.counts[pin]));
      let a = 255;
      if (state.t !== 0 && (mask[pin] & state.t) === 0) a = 30;
      if (selection.has(pin)) {
        r = r * 0.4;
        g = g * 0.4 + 255 * 0.6;
        b = b * 0.4 + 255 * 0.6;
      }
      const o = (y * p.width + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = a;
    }
    offCtx.putImageData(img, 0, 0);
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
      ctx.fillStyle = 'rgba(0,255,255,0.15)';
      ctx.fillRect(rx, ry, w, h);
      ctx.strokeStyle = '#0ff';
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
    draw();
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

  function showTries() {
    const k = Number(triesEl.value);
    triesOut.textContent = `${fmtInt(k)} attempts → ${fmtPct(coverageAt(cov, k))} of occurrences`;
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
  document.querySelectorAll<HTMLInputElement>('input[name=s]').forEach((r) =>
      r.addEventListener('change', () => {
        state.s = r.value as ScaleKind;
        commit();
      }),
  );
  gammaEl.addEventListener('input', () => {
    state.g = Number(gammaEl.value);
    commit();
  });
  tagsEl.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.bit === undefined) return;
    state.t ^= 1 << Number(input.dataset.bit);
    commit();
  });
  triesEl.addEventListener('input', showTries);
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

  buildImage();
  layout();
  showSelection();
  showTries();
  new ResizeObserver(layout).observe($('stage'));
}

main().catch(console.error);