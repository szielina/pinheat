import { shareWhere } from './core/dataset';
import { projectionsFor } from './core/projection';
import { classify, tagsFor } from './core/classifier';
import { normalizer, palette, type ScaleKind } from './core/scale';
import { buildCoverage, coverageAt } from './core/coverage';
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
  const rectEl = $<HTMLDivElement>('rect');
  const hoverEl = $<HTMLDivElement>('hover');
  const selEl = $<HTMLDivElement>('sel');
  const projEl = $<HTMLSelectElement>('proj');
  const gammaEl = $<HTMLInputElement>('gamma');
  const tagsEl = $<HTMLDivElement>('tags');
  const triesEl = $<HTMLInputElement>('tries');
  const triesOut = $<HTMLDivElement>('triesOut');

  const defaults: ViewState = { p: projIds[0], s: 'log', g: 0.5, t: 0 };
  const state = readState(location.hash, defaults, projIds);
  let selection = new Set<number>();
  let drag: { x0: number; y0: number; x1: number; y1: number } | null = null;

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

  // --- render ---
  function render() {
    const proj = projections[state.p];
    canvas.width = proj.width;
    canvas.height = proj.height;
    const img = ctx.createImageData(proj.width, proj.height);
    const norm = normalizer(state.s, maxCount, state.g);
    for (let pin = 0; pin < ds.counts.length; pin++) {
      const [x, y] = proj.toXY(pin);
      let [r, g, b] = palette(norm(ds.counts[pin]));
      let a = 255;
      if (state.t !== 0 && (mask[pin] & state.t) === 0) a = 30;
      if (selection.has(pin)) {
        r = r * 0.4;
        g = g * 0.4 + 255 * 0.6;
        b = b * 0.4 + 255 * 0.6;
      }
      const o = (y * proj.width + x) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
  }

  function commit() {
    writeState(state);
    render();
  }

  function showHover(x: number, y: number) {
    const pin = projections[state.p].toPin(x, y);
    const c = ds.counts[pin];
    hoverEl.textContent = `PIN ${pad(pin)} · ${fmtInt(c)} occurrences · ${fmtPct(c / ds.total)} · rank #${fmtInt(cov.rank[pin] + 1)}`;
  }

  function showSelection() {
    if (selection.size === 0) {
      selEl.textContent = 'Drag a rectangle on the map.';
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

  function drawRect() {
    if (!drag) {
      rectEl.style.display = 'none';
      return;
    }
    const p = projections[state.p];
    const x0 = Math.min(drag.x0, drag.x1);
    const y0 = Math.min(drag.y0, drag.y1);
    const x1 = Math.max(drag.x0, drag.x1) + 1;
    const y1 = Math.max(drag.y0, drag.y1) + 1;
    rectEl.style.display = 'block';
    rectEl.style.left = `${(x0 / p.width) * 100}%`;
    rectEl.style.top = `${(y0 / p.height) * 100}%`;
    rectEl.style.width = `${((x1 - x0) / p.width) * 100}%`;
    rectEl.style.height = `${((y1 - y0) / p.height) * 100}%`;
  }

  function cellAt(e: MouseEvent): [number, number] {
    const r = canvas.getBoundingClientRect();
    const p = projections[state.p];
    const x = Math.min(p.width - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * p.width)));
    const y = Math.min(p.height - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * p.height)));
    return [x, y];
  }

  // --- events ---
  projEl.addEventListener('change', () => {
    state.p = projEl.value;
    commit();
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
    render();
  });

  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const [x, y] = cellAt(e);
    drag = { x0: x, y0: y, x1: x, y1: y };
    drawRect();
  });
  canvas.addEventListener('mousemove', (e) => {
    const [x, y] = cellAt(e);
    showHover(x, y);
    if (drag) {
      drag.x1 = x;
      drag.y1 = y;
      drawRect();
    }
  });
  canvas.addEventListener('mouseleave', () => (hoverEl.textContent = HOVER_HINT));
  window.addEventListener('mouseup', (e) => {
    if (!drag) return;
    const [x, y] = cellAt(e);
    drag.x1 = x;
    drag.y1 = y;
    const proj = projections[state.p];
    selection = new Set();
    for (let yy = Math.min(drag.y0, drag.y1); yy <= Math.max(drag.y0, drag.y1); yy++)
      for (let xx = Math.min(drag.x0, drag.x1); xx <= Math.max(drag.x0, drag.x1); xx++)
        selection.add(proj.toPin(xx, yy));
    drag = null;
    drawRect();
    showSelection();
    render();
  });

  render();
  showSelection();
  showTries();
}

main().catch(console.error);
