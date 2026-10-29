import { axisLabel, axisTitle, tickStep } from '../core/axis';
import { barScale } from '../core/barscale';
import { fmtX } from '../core/measure';
import { axisProfile, type Profile } from '../core/profile';
import type { Data } from './data';
import type { Elements } from './dom';
import { fmtCompact, fmtInt } from './format';
import { radioGroup } from './radio-group';
import type { Store } from './store';
import { svgEl } from './svg';
import type { Visible } from './visible';

const BAR_COLOR = '#56b4e9';
const HEIGHT = 170;
const MARGIN = { top: 8, right: 6, bottom: 22, left: 46 };
const MIN_TICK_PX = 14; // closest two y labels may be
const MIN_LABEL_PX = 38; // closest two x labels may be

export interface ProfileChartDeps {
  data: Data;
  store: Store;
  el: Elements;
  visible: Visible;
}

/**
 * Two bar charts under the digit chart: the shown set summed by column (x) and by row (y) of the current projection,
 * one bar per axis value (00-99 for AB x CD). Count: PINs or occurrences; scale: linear or logarithmic. The shown
 * set is the selection when there is one, else whatever the filters leave (see `Visible`).
 */
export function installProfileCharts({ data, store, el, visible }: ProfileChartDeps): void {
  const { profOptsEl, profNoteEl, profLegendEl, profChartsEl } = el;
  let byOccurrences = true;
  let logScale = false;
  let profile: Profile | null = null;
  let pinsInSet = 0;

  const blocks = (['x', 'y'] as const).map((axis) => {
    const caption = document.createElement('div');
    caption.className = 'muted';
    const chart = document.createElement('div');
    const block = document.createElement('div');
    block.append(caption, chart);
    profChartsEl.append(block);
    return { axis, caption, chart };
  });

  profOptsEl.append(
    radioGroup(
      'profCount',
      'Count',
      [
        ['occ', 'occurrences', 'Every PIN counts as often as it occurs in the data: where the people go.'],
        ['pin', 'PINs', 'Every PIN counts once: how many of the shown PINs fall in each row and column.'],
      ],
      'occ',
      (v) => {
        byOccurrences = v === 'occ';
        draw();
      },
    ),
    radioGroup(
      'profScale',
      'Scale',
      [
        ['lin', 'linear', 'Bar height proportional to the value.'],
        ['log', 'logarithmic', 'Bar height follows the logarithm of the value: small rows and columns stay visible next to the big ones.'],
      ],
      'lin',
      (v) => {
        logScale = v === 'log';
        draw();
      },
    ),
  );
  const dash = document.createElement('i');
  dash.className = 'dash';
  const ref = document.createElement('span');
  ref.append(dash, 'average of a row or column');
  profLegendEl.append(ref);

  function note(): string {
    const what = byOccurrences
      ? 'Total occurrences of the shown PINs in each column and row of the map.'
      : 'How many of the shown PINs fall in each column and row of the map.';
    const flat =
      !byOccurrences && pinsInSet === data.nPins
        ? ' The full set has the same number of PINs in every one: narrow it with tags, popularity or a selection.'
        : '';
    return `${what} It follows the projection chosen above.${flat}`;
  }

  function draw() {
    const width = profChartsEl.clientWidth;
    for (const b of blocks) b.chart.textContent = '';
    if (!profile || width <= 0) return;
    profNoteEl.textContent = note();
    const projection = store.proj();
    const unit = byOccurrences ? 'occurrences' : 'PINs';
    const geometry = {
      x: { positions: projection.xDigits, name: 'Columns (x)' },
      y: { positions: projection.yDigits, name: 'Rows (y)' },
    };
    for (const { axis, caption, chart } of blocks) {
      const { positions, name } = geometry[axis];
      caption.textContent = `${name} · ${axisTitle(positions, data.n)}`;
      const values = byOccurrences ? profile[axis].occurrences : profile[axis].pins;
      let max = 0;
      let sum = 0;
      for (const v of values) {
        max = Math.max(max, v);
        sum += v;
      }
      if (sum === 0) {
        chart.textContent = 'No PINs to show: the filters leave nothing.';
        continue;
      }
      const mean = sum / values.length;
      const scale = barScale(max, logScale);
      const plotW = width - MARGIN.left - MARGIN.right;
      const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
      const y = (v: number) => MARGIN.top + plotH * (1 - scale.at(v));
      const svg = svgEl('svg', {
        width,
        height: HEIGHT,
        viewBox: `0 0 ${width} ${HEIGHT}`,
        role: 'group',
        'aria-label': `${name}: ${unit} per value of the axis. Hover a bar for the numbers.`,
      });

      let lastY = Number.POSITIVE_INFINITY;
      for (const tick of scale.ticks) {
        const ty = y(tick);
        if (lastY - ty < MIN_TICK_PX) continue;
        lastY = ty;
        svg.append(
          svgEl('line', { class: 'grid', x1: MARGIN.left, x2: MARGIN.left + plotW, y1: ty, y2: ty }),
          svgEl('text', { class: 'tick', x: MARGIN.left - 6, y: ty + 4, 'text-anchor': 'end' }, fmtCompact(tick)),
        );
      }

      const colW = plotW / values.length;
      const barW = Math.max(1, colW * 0.8);
      const step = tickStep(colW, MIN_LABEL_PX);
      for (let i = 0; i < values.length; i++) {
        const h = plotH * scale.at(values[i]);
        svg.append(svgEl('rect', { x: MARGIN.left + i * colW + (colW - barW) / 2, y: MARGIN.top + plotH - h, width: barW, height: h, fill: BAR_COLOR }));
        if (i % step === 0) {
          svg.append(svgEl('text', { class: 'tick', x: MARGIN.left + (i + 0.5) * colW, y: HEIGHT - 6, 'text-anchor': 'middle' }, axisLabel(i, positions, data.n)));
        }
      }

      svg.append(svgEl('line', { class: 'uniform', x1: MARGIN.left, x2: MARGIN.left + plotW, y1: y(mean), y2: y(mean) }));

      // transparent full-height columns on top: the whole column answers the hover, however short the bar is
      for (let i = 0; i < values.length; i++) {
        const title = svgEl('title', {}, `${axisLabel(i, positions, data.n)}: ${fmtInt(values[i])} ${unit} · ${fmtX(values[i] / mean)} the average`);
        svg.append(svgEl('rect', { x: MARGIN.left + i * colW, y: MARGIN.top, width: colW, height: plotH, fill: 'transparent' }, title));
      }
      chart.append(svg);
    }
  }

  visible.onChange((set) => {
    profile = axisProfile(store.proj(), set, data.ds.counts);
    pinsInSet = profile.x.pins.reduce((a, b) => a + b, 0);
    draw();
  });
  new ResizeObserver(draw).observe(profChartsEl); // drawn in real pixels, so it follows the width of its column
}
