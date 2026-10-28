import { digitFrequency, digitShare, type DigitFrequency } from '../core/composition';
import type { Data } from './data';
import type { Elements } from './dom';
import { fmtInt, fmtPct } from './format';
import type { Store } from './store';
import { svgEl } from './svg';
import type { Visible } from './visible';

const BAR_COLOR = '#56b4e9';
const HEIGHT = 200;
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
 * The "Digits" chart under the map: how often each digit 0-9 occurs in the PINs of the shown set (the selection when
 * there is one, else whatever the filters leave; see `Visible`), counted over all occurrences in the data and wherever
 * in the PIN the digit stands.
 */
export function installDigitChart({ data, store, el, visible }: DigitChartDeps): void {
  const { digitsCapEl, digitsLegendEl, digitsChartEl } = el;
  let frequency: DigitFrequency | null = null;

  buildLegend();

  /** Says which PINs the chart is about. */
  function scope(): string {
    const filtered = store.view.t !== 0 || store.pop !== null;
    if (store.selection.size > 0) return filtered ? 'Selection within the filters' : 'Selection';
    return filtered ? 'Filtered PINs' : 'All PINs';
  }

  function buildLegend() {
    digitsLegendEl.textContent = '';
    const dash = document.createElement('i');
    dash.className = 'dash';
    const ref = document.createElement('span');
    ref.append(dash, `${UNIFORM_PCT}% = all digits equally common`);
    digitsLegendEl.append(ref);
  }

  function draw() {
    const width = digitsChartEl.clientWidth;
    digitsChartEl.textContent = '';
    if (!frequency || width <= 0) return;
    const f = frequency;
    digitsCapEl.textContent = `${scope()}: ${fmtInt(f.pins)} of ${fmtInt(data.nPins)} PINs · ${fmtInt(f.total / data.n)} occurrences`;
    if (f.total === 0) {
      digitsChartEl.textContent = 'No PINs to show: the filters leave nothing.';
      return;
    }

    const plotW = width - MARGIN.left - MARGIN.right;
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    let maxShare = 0;
    for (let d = 0; d < 10; d++) maxShare = Math.max(maxShare, digitShare(f, d));
    const topPct = Math.max(15, Math.ceil((maxShare * 100) / 5) * 5); // axis top: a multiple of 5%, never below 15%
    const stepPct = topPct <= 25 ? 5 : topPct <= 50 ? 10 : 25;
    const y = (pct: number) => MARGIN.top + plotH * (1 - pct / topPct);

    const svg = svgEl('svg', {
      width,
      height: HEIGHT,
      viewBox: `0 0 ${width} ${HEIGHT}`,
      role: 'group',
      'aria-label': 'How often each digit occurs. Hover a column for the numbers.',
    });

    for (let pct = 0; pct <= topPct; pct += stepPct) {
      svg.append(
        svgEl('line', { class: 'grid', x1: MARGIN.left, x2: MARGIN.left + plotW, y1: y(pct), y2: y(pct) }),
        svgEl('text', { class: 'tick', x: MARGIN.left - 6, y: y(pct) + 4, 'text-anchor': 'end' }, `${pct}%`),
      );
    }

    const colW = plotW / 10;
    const barW = colW * 0.7;
    for (let d = 0; d < 10; d++) {
      const share = digitShare(f, d);
      const h = (plotH * share * 100) / topPct;
      const x = MARGIN.left + d * colW + (colW - barW) / 2;
      svg.append(
        svgEl('rect', { x, y: MARGIN.top + plotH - h, width: barW, height: h, fill: BAR_COLOR }),
        svgEl('text', { class: 'tick', x: MARGIN.left + (d + 0.5) * colW, y: HEIGHT - 6, 'text-anchor': 'middle' }, String(d)),
      );
    }

    svg.append(svgEl('line', { class: 'uniform', x1: MARGIN.left, x2: MARGIN.left + plotW, y1: y(UNIFORM_PCT), y2: y(UNIFORM_PCT) }));

    // transparent full-height columns on top: the whole column answers the hover, however short the bar is
    for (let d = 0; d < 10; d++) {
      const title = svgEl('title', {}, `Digit ${d}: ${fmtPct(digitShare(f, d))} of all ${fmtInt(f.total)} digits (${fmtInt(f.counts[d])} times)`);
      svg.append(svgEl('rect', { x: MARGIN.left + d * colW, y: MARGIN.top, width: colW, height: plotH, fill: 'transparent' }, title));
    }
    digitsChartEl.append(svg);
  }

  visible.onChange((set) => {
    frequency = digitFrequency(data.n, set, data.ds.counts);
    draw();
  });
  new ResizeObserver(draw).observe(digitsChartEl); // the chart is drawn in real pixels, so it follows the width of its column
}
