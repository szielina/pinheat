import { shareWhere } from './core/dataset';
import type { ScaleKind } from './core/scale';
import { enrichment, fmtX } from './core/measure';
import { COLORMAPS, COLORMAP_IDS, type ColormapId } from './core/colormap';
import {
  selectByPopularity,
  type PopularityDirection,
} from './core/coverage';
import { fit } from './core/viewport';
import { createData } from './app/data';
import { getElements } from './app/dom';
import { fmtPct } from './app/format';
import { createGeometry } from './app/geometry';
import { createPointerHost } from './app/map-host';
import { installPointer } from './app/pointer';
import { installHints } from './app/hints';
import { loadDataset } from './app/load';
import { writeState } from './app/state';
import { createPanels } from './app/panels';
import { createRenderer } from './app/renderer';
import { createStore } from './app/store';

async function main() {
  const N = 4;
  const ds = await loadDataset(N, `${import.meta.env.BASE_URL}pins${N}.bin`);
  const data = createData(N, ds);
  const { cov, nPins, projections, projIds, tags, tagIds, mask } = data;

  const el = getElements();
  const {
    canvas, stageEl, projEl, cmapEl, gammaEl, gammaOut, clipEl, clipOut, tagsEl,
    popN, popRange, resetEl, clearEl,
    scaleRadios, dirRadios, popPresets,
  } = el;

  const store = createStore(data);
  const renderer = createRenderer(data, store, el);
  const { buildImage, updateLegend, draw, layout } = renderer;
  const panels = createPanels(data, store, el);
  const { showSource, showSelection, showPicked, showPopularity } = panels;

  showSource();

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

  // --- pointer geometry ---
  const geometry = createGeometry(canvas, store);
  const host = createPointerHost(store, el, geometry, panels, renderer);
  const { selectionChanged } = host;
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
    selectionChanged();
    draw();
  });
  resetEl.addEventListener('click', () => {
    store.vp = fit(store.frame);
    draw();
  });

  installPointer(canvas, store, geometry, host);

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