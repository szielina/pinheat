import { digitCount, digitFrequency, digitShare, type DigitFrequency } from '../core/composition';
import type { Data } from './data';
import type { Elements } from './dom';
import { fmtInt, fmtPct } from './format';
import type { Store } from './store';
import { svgEl } from './svg';
import type { Visible } from './visible';

const BAR_COLOR = '#56b4e9';
/** One colour per PIN position (Okabe-Ito: distinguishable for colour-blind people, readable on the dark page). */
const POSITION_COLORS = ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#cc79a7', '#d55e00'];
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
 * there is one, else whatever the filters leave; see `Visible`). Two switches: count every occurrence in the data or
 * every PIN once, and pool the positions or show them side by side.
 */
export function installDigitChart({ data, store, el, visible }: DigitChartDeps): void {
  const { digitsCapEl, digitsOptsEl, digitsNoteEl, digitsLegendEl, digitsChartEl } = el;
  let byOccurrences = true;
  let perPosition = false;
  let frequency: DigitFrequency | null = null;
  const color = (pos: number) => POSITION_COLORS[pos % POSITION_COLORS.length];

  buildOptions();
  buildLegend();

  /** Says which PINs the chart is about. */
  function scope(f: DigitFrequency): string {
    const filtered = store.view.t !== 0 || store.pop !== null;
    if (store.selection.size > 0) return filtered ? 'Selection within the filters' : 'Selection';
    return filtered && f.pins < data.nPins ? 'Filtered PINs' : 'All PINs'; // a filter that leaves every PIN is no filter
  }

  /** One sentence on what the bars mean under the current switches. */
  function note(f: DigitFrequency): string {
    const count = byOccurrences
      ? 'Every PIN counts as often as it occurs in the data, so the bars show which digits people actually pick.'
      : 'Every PIN counts once, so the bars show what the set is made of.';
    const where = perPosition ? ' One bar per position of the PIN.' : ' A digit counts wherever it stands in the PIN.';
    const flat =
      !byOccurrences && f.pins === data.nPins
        ? ' The full set is flat at 10% by construction: narrow it with tags, popularity or a selection to see what is typical of it.'
        : '';
    return count + where + flat;
  }

  function recount() {
    frequency = digitFrequency(data.n, visible.current(), byOccurrences ? data.ds.counts : undefined);
    draw();
  }

  function radioGroup(name: string, label: string, options: Array<[value: string, text: string, hint: string]>, checked: string, onPick: (value: string) => void) {
    const group = document.createElement('div');
    group.append(`${label} `);
    for (const [value, text, hint] of options) {
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = value === checked;
      input.addEventListener('change', () => onPick(value));
      const row = document.createElement('label');
      row.title = hint;
      row.append(input, ` ${text}`);
      group.append(row);
    }
    return group;
  }

  function buildOptions() {
    digitsOptsEl.textContent = '';
    digitsOptsEl.append(
      radioGroup(
        'digitsCount',
        'Count',
        [
          ['occ', 'by occurrences', 'Every PIN counts as often as it occurs in the data: which digits people actually pick.'],
          ['pin', 'by PIN', 'Every PIN counts once: what the set is made of, whatever its popularity.'],
        ],
        'occ',
        (v) => {
          byOccurrences = v === 'occ';
          recount();
        },
      ),
      radioGroup(
        'digitsPos',
        'Positions',
        [
          ['all', 'together', 'A digit counts wherever it stands in the PIN.'],
          ['each', 'separate', 'One bar per position of the PIN: the first digit, the second, and so on.'],
        ],
        'all',
        (v) => {
          perPosition = v === 'each';
          buildLegend();
          draw();
        },
      ),
    );
  }

  function buildLegend() {
    digitsLegendEl.textContent = '';
    if (perPosition) {
      for (let pos = 0; pos < data.n; pos++) {
        const swatch = document.createElement('i');
        swatch.style.background = color(pos);
        const item = document.createElement('span');
        item.append(swatch, `position ${pos + 1}`);
        digitsLegendEl.append(item);
      }
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
    if (!frequency || width <= 0) return;
    const f = frequency;
    digitsCapEl.textContent =
      `${scope(f)}: ${fmtInt(f.pins)} of ${fmtInt(data.nPins)} PINs` + (byOccurrences ? ` · ${fmtInt(f.weight)} occurrences` : '');
    digitsNoteEl.textContent = note(f);
    if (f.pins === 0 || f.weight === 0) {
      digitsChartEl.textContent = 'No PINs to show: the filters leave nothing.';
      return;
    }

    const series = perPosition ? data.n : 1; // bars per digit
    const share = (d: number, s: number) => digitShare(f, d, perPosition ? s : undefined);
    const plotW = width - MARGIN.left - MARGIN.right;
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    let maxShare = 0;
    for (let d = 0; d < 10; d++) for (let s = 0; s < series; s++) maxShare = Math.max(maxShare, share(d, s));
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
    const inner = colW * (perPosition ? 0.84 : 0.7);
    const barW = inner / series;
    const barX = (d: number, s: number) => MARGIN.left + d * colW + (colW - inner) / 2 + s * barW;
    for (let d = 0; d < 10; d++) {
      for (let s = 0; s < series; s++) {
        const h = (plotH * share(d, s) * 100) / topPct;
        const gap = series > 1 ? 1 : 0;
        svg.append(
          svgEl('rect', { x: barX(d, s), y: MARGIN.top + plotH - h, width: Math.max(1, barW - gap), height: h, fill: perPosition ? color(s) : BAR_COLOR }),
        );
      }
      svg.append(svgEl('text', { class: 'tick', x: MARGIN.left + (d + 0.5) * colW, y: HEIGHT - 6, 'text-anchor': 'middle' }, String(d)));
    }

    svg.append(svgEl('line', { class: 'uniform', x1: MARGIN.left, x2: MARGIN.left + plotW, y1: y(UNIFORM_PCT), y2: y(UNIFORM_PCT) }));

    // transparent full-height columns on top: the whole column answers the hover, however short the bar is
    const unit = byOccurrences ? 'occurrences' : 'PINs';
    for (let d = 0; d < 10; d++) {
      for (let s = 0; s < series; s++) {
        const where = perPosition ? ` at position ${s + 1}` : '';
        const of = perPosition ? `${fmtInt(f.weight)} ${unit}` : `all ${fmtInt(f.weight * f.digits)} digits`;
        const count = digitCount(f, d, perPosition ? s : undefined);
        const title = svgEl('title', {}, `Digit ${d}${where}: ${fmtPct(share(d, s))} of ${of} (${fmtInt(count)})`);
        svg.append(svgEl('rect', { x: barX(d, s), y: MARGIN.top, width: barW, height: plotH, fill: 'transparent' }, title));
      }
    }
    digitsChartEl.append(svg);
  }

  visible.onChange(recount);
  new ResizeObserver(draw).observe(digitsChartEl); // the chart is drawn in real pixels, so it follows the width of its column
}
