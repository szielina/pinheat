import { digitComposition, digitShare, type DigitComposition } from '../core/composition';
import type { Data } from './data';
import type { Elements } from './dom';
import { fmtInt, fmtPct } from './format';
import type { Store } from './store';
import { svgEl } from './svg';
import type { Visible } from './visible';

/** One colour per PIN position (Okabe-Ito: distinguishable for colour-blind people, readable on the dark page). */
const POSITION_COLORS = ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#cc79a7', '#d55e00'];
const HEIGHT = 220;
const MARGIN = { top: 8, right: 6, bottom: 22, left: 38 };
/** What every digit would score if all ten were equally common. */
const UNIFORM_PCT = 10;

export interface DigitChartDeps {
  data: Data;
  store: Store;
  el: Elements;
  visible: Visible;
}

/**
 * The "Digits" chart under the map: for every position of the PIN, the share of PINs in the shown set that have
 * digit 0-9 there. The shown set is the selection when there is one, else whatever the filters leave (see `Visible`).
 */
export function installDigitChart({ data, store, el, visible }: DigitChartDeps): void {
  const { digitsCapEl, digitsLegendEl, digitsChartEl } = el;
  const color = (pos: number) => POSITION_COLORS[pos % POSITION_COLORS.length];
  let composition: DigitComposition | null = null;

  buildLegend();

  /** Says which PINs the chart is about. */
  function scope(): string {
    const filtered = store.view.t !== 0 || store.pop !== null;
    if (store.selection.size > 0) return filtered ? 'Selection within the filters' : 'Selection';
    return filtered ? 'Filtered PINs' : 'All PINs';
  }

  function buildLegend() {
    digitsLegendEl.textContent = '';
    for (let pos = 0; pos < data.n; pos++) {
      const swatch = document.createElement('i');
      swatch.style.background = color(pos);
      const item = document.createElement('span');
      item.append(swatch, `position ${pos + 1}`);
      digitsLegendEl.append(item);
    }
    const dash = document.createElement('i');
    dash.className = 'dash';
    const ref = document.createElement('span');
    ref.append(dash, `${UNIFORM_PCT}% = all digits equally common`);
    digitsLegendEl.append(ref);
  }

  function draw() {
    const width = digitsChartEl.clientWidth;
    digitsChartEl.textContent = '';
    if (!composition || width <= 0) return;
    const c = composition;
    digitsCapEl.textContent = `${scope()}: ${fmtInt(c.size)} of ${fmtInt(data.nPins)} PINs`;
    if (c.size === 0) {
      digitsChartEl.textContent = 'No PINs to show: the filters leave nothing.';
      return;
    }

    const plotW = width - MARGIN.left - MARGIN.right;
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    let maxShare = 0;
    for (let pos = 0; pos < c.digits; pos++) for (let d = 0; d < 10; d++) maxShare = Math.max(maxShare, digitShare(c, pos, d));
    const topPct = Math.max(15, Math.ceil((maxShare * 100) / 5) * 5); // axis top: a multiple of 5%, never below 15%
    const stepPct = topPct <= 25 ? 5 : topPct <= 50 ? 10 : 25;
    const y = (pct: number) => MARGIN.top + plotH * (1 - pct / topPct);

    const svg = svgEl('svg', {
      width,
      height: HEIGHT,
      viewBox: `0 0 ${width} ${HEIGHT}`,
      role: 'group',
      'aria-label': 'Share of PINs by digit and position. Hover a column for the numbers.',
    });

    for (let pct = 0; pct <= topPct; pct += stepPct) {
      svg.append(
        svgEl('line', { class: 'grid', x1: MARGIN.left, x2: MARGIN.left + plotW, y1: y(pct), y2: y(pct) }),
        svgEl('text', { class: 'tick', x: MARGIN.left - 6, y: y(pct) + 4, 'text-anchor': 'end' }, `${pct}%`),
      );
    }

    const groupW = plotW / 10;
    const inner = groupW * 0.84;
    const barW = inner / c.digits;
    for (let d = 0; d < 10; d++) {
      const left = MARGIN.left + d * groupW + (groupW - inner) / 2;
      for (let pos = 0; pos < c.digits; pos++) {
        const share = digitShare(c, pos, d);
        const h = (plotH * share * 100) / topPct;
        const x = left + pos * barW;
        svg.append(svgEl('rect', { x, y: MARGIN.top + plotH - h, width: Math.max(1, barW - 1), height: h, fill: color(pos) }));
      }
      svg.append(svgEl('text', { class: 'tick', x: MARGIN.left + (d + 0.5) * groupW, y: HEIGHT - 6, 'text-anchor': 'middle' }, String(d)));
    }

    svg.append(svgEl('line', { class: 'uniform', x1: MARGIN.left, x2: MARGIN.left + plotW, y1: y(UNIFORM_PCT), y2: y(UNIFORM_PCT) }));

    // transparent full-height columns on top: the whole column answers the hover, however short the bar is
    for (let d = 0; d < 10; d++) {
      const left = MARGIN.left + d * groupW + (groupW - inner) / 2;
      for (let pos = 0; pos < c.digits; pos++) {
        const title = svgEl(
          'title',
          {},
          `Digit ${d} at position ${pos + 1}: ${fmtInt(c.counts[pos * 10 + d])} of ${fmtInt(c.size)} PINs (${fmtPct(digitShare(c, pos, d))})`,
        );
        svg.append(svgEl('rect', { x: left + pos * barW, y: MARGIN.top, width: barW, height: plotH, fill: 'transparent' }, title));
      }
    }
    digitsChartEl.append(svg);
  }

  visible.onChange((set) => {
    composition = digitComposition(data.n, set);
    draw();
  });
  new ResizeObserver(draw).observe(digitsChartEl); // the chart is drawn in real pixels, so it follows the width of its column
}
