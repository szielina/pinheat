import { COLORMAPS, COLORMAP_IDS, type ColormapId } from '../core/colormap';
import { selectByPopularity, type PopularityDirection } from '../core/coverage';
import { shareWhere } from '../core/dataset';
import { enrichment, fmtX } from '../core/measure';
import type { ScaleKind } from '../core/scale';
import { fit } from '../core/viewport';
import type { Data } from './data';
import type { Elements } from './dom';
import { fmtPct } from './format';
import type { Panels } from './panels';
import type { Renderer } from './renderer';
import { writeState } from './state';
import type { Store } from './store';
import { buildTagList } from './tag-list';

export interface ControlsDeps {
  data: Data;
  store: Store;
  el: Elements;
  panels: Panels;
  renderer: Renderer;
  /** `store.selection` was replaced: refresh its readout and the dimming of the map. */
  selectionChanged(): void;
}

export interface Controls {
  /** Brings the popularity set and every control in line with `store.view`; call once the page is set up. */
  refresh(): void;
}

/** The settings panel: fills the controls from `store.view`, and turns their events into changes of it. */
export function installControls({ data, store, el, panels, renderer, selectionChanged }: ControlsDeps): Controls {
  const { ds, cov, nPins, projections, projIds, tags, tagIds, mask } = data;
  const {
    projEl, cmapEl, gammaEl, gammaOut, clipEl, clipOut, tagsEl, popN, popRange, resetEl, clearEl,
    scaleRadios, dirRadios, popPresets,
  } = el;
  const { showPopularity } = panels;
  const { buildImage, updateLegend, draw, layout } = renderer;

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
  buildTagList(
      tagsEl,
      tags,
      store.view.t,
      tags.map((_, i) => tagStats(tagShare[i], tagSize[i])),
      `Remainder (no tag): ${tagStats(restShare, restSize)} · tag shares may overlap`,
  );

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

  /** Applies view.n and view.d: recomputes the set, syncs the controls, repaints. */
  function applyPopularity(fromNumberField = false) {
    recomputePopularity();
    syncPopularityControls(fromNumberField && Number(popN.value) === store.view.n);
    showPopularity();
    commit();
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
    selectionChanged();
    draw();
  });
  resetEl.addEventListener('click', () => {
    store.vp = fit(store.frame);
    draw();
  });

  return {
    refresh() {
      recomputePopularity();
      syncPopularityControls(false);
      showPopularity();
      syncControls();
    },
  };
}
