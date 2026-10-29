import { axisLabel, axisTitle, tickStep } from '../core/axis';
import { barScale } from '../core/barscale';
import { fmtX } from '../core/measure';
import { axisProfile, median, type Profile } from '../core/profile';
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

/** What a bar shows: occurrences summed, PINs counted, or the median occurrences of a PIN. */
type Measure = 'occ' | 'pin' | 'typ';

export interface ProfileChartDeps {
  data: Data;
  store: Store;
  el: Elements;
  visible: Visible;
}

/**
 * Two bar charts under the digit chart: the shown set by column (x) and by row (y) of the current projection,
 * one bar per axis value (00-99 for AB x CD). Show: occurrences summed, PINs counted, or the typical PIN (the median
 * occurrences of a PIN in that row or column, so one giant such as 1234 does not take over the scale); scale: linear
 * or logarithmic. The shown set is the selection when there is one, else whatever the filters leave (see `Visible`).
 */
export function installProfileCharts({ data, store, el, visible }: ProfileChartDeps): void {
  const { profOptsEl, profNoteEl, profLegendEl, profChartsEl } = el;
  let measure: Measure = 'occ';
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
          'Show',
          [
            ['occ', 'occurrences', 'Every PIN counts as often as it occurs in the data: where the people go.'],
            ['pin', 'PINs', 'Every PIN counts once: how many of the shown PINs fall in each row and column.'],
            ['typ', 'typical PIN (median)', 'The middle PIN of each row and column, by occurrences: one very common PIN does not make a tall bar, only many raised PINs do.'],
          ],
          'occ',
          (v) => {
            measure = v as Measure;
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
  profLegendEl.append(ref);

  function note(): string {
    const what =
        measure === 'occ'
            ? 'Total occurrences of the shown PINs in each column and row of the map.'
            : measure === 'pin'
                ? 'How many of the shown PINs fall in each column and row of the map.'
                : 'Occurrences of the middle PIN among the shown PINs in each column and row of the map.';
    const flat =
        measure === 'pin' && pinsInSet === data.nPins
            ? ' The full set has the same number of PINs in every one: narrow it with tags, popularity or a selection.'
            : '';
    return `${what} It follows the projection chosen above.${flat}`;
  }

  function draw() {
    const width = profChartsEl.clientWidth;
    for (const b of blocks) b.chart.textContent = '';
    if (!profile || width <= 0) return;
    profNoteEl.textContent = note();
    const refName = measure === 'typ' ? 'median' : 'average';
    ref.replaceChildren(dash, measure === 'typ' ? 'median of the bars' : 'average of a row or column');
    const projection = store.proj();
    const unit = measure === 'occ' ? 'occurrences' : measure === 'pin' ? 'PINs' : 'occurrences of a typical PIN';
    const geometry = {
      x: { positions: projection.xDigits, name: 'Columns (x)' },
      y: { positions: projection.yDigits, name: 'Rows (y)' },
    };
    for (const { axis, caption, chart } of blocks) {
      const { positions, name } = geometry[axis];
      caption.textContent = `${name} · ${axisTitle(positions, data.n)}`;
      const along = profile[axis];
      const values = measure === 'occ' ? along.occurrences : measure === 'pin' ? along.pins : along.typical;
      let max = 0;
      let sum = 0;
      let pins = 0;
      for (let i = 0; i < values.length; i++) {
        max = Math.max(max, values[i]);
        sum += values[i];
        pins += along.pins[i];
      }
      if (pins === 0) {
        chart.textContent = 'No PINs to show: the filters leave nothing.';
        continue;
      }
      // the dashed line: the mean of the bars, or for the typical PIN their median (rows and columns without PINs left out)
      const reference =
          measure === 'typ' ? median(Array.from(values).filter((_, i) => along.pins[i] > 0)) : sum / values.length;
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

      svg.append(svgEl('line', { class: 'uniform', x1: MARGIN.left, x2: MARGIN.left + plotW, y1: y(reference), y2: y(reference) }));

      // transparent full-height columns on top: the whole column answers the hover, however short the bar is
      for (let i = 0; i < values.length; i++) {
        const relative = reference > 0 ? ` · ${fmtX(values[i] / reference)} the ${refName}` : '';
        const title = svgEl('title', {}, `${axisLabel(i, positions, data.n)}: ${fmtInt(values[i])} ${unit}${relative}`);
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