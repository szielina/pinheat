import { describeLift, enrichment, fmtX, lift, oneIn } from '../core/measure';
import { shareWhere } from '../core/dataset';
import type { Data } from './data';
import type { Elements } from './dom';
import { fmtInt, fmtPct } from './format';
import { isMoving, type Store } from './store';

const HOVER_HINT = 'Hover over the map.';

/** The text readouts around the map: source line, hovered PIN, selection, clicked PIN, popularity, cursor tooltip. */
export interface Panels {
  /** Where the data comes from (HIBP or the demo data). */
  showSource(): void;
  /** Readout under the map while nothing is hovered: the clicked PIN stays visible (touch has no hover at all). */
  idleReadout(): string;
  /** Readout of the hovered cell. */
  showHover(x: number, y: number): void;
  showSelection(): void;
  /** Statistics of the clicked PIN, always visible in their own section. */
  showPicked(): void;
  showPopularity(): void;
  /** Small label next to the cursor: PIN and rank. Hidden while panning or dragging a rectangle. */
  showTip(cell: [number, number] | null, px: number, py: number): void;
}

export function createPanels(data: Data, store: Store, el: Elements): Panels {
  const { ds, cov, mask, nPins, tags, pad } = data;
  const { srcEl, hoverEl, tipEl, selEl, pickEl, popOut } = el;

  function showSource() {
    srcEl.textContent =
        ds.source === 'hibp'
            ? `HIBP · ${fmtInt(ds.total)} occurrences`
            : 'DEMO – synthetic data (run `npm run data` to fetch HIBP)';
  }

  function showPopularity() {
    if (!store.pop) {
      popOut.textContent = 'Pick a number of PINs to highlight them on the map.';
      return;
    }
    const label = store.view.d === 'top' ? 'Most common' : 'Least common';
    popOut.textContent = `${label}: ${fmtInt(store.pop.size)} PINs · ${fmtPct(store.pop.size / nPins)} of space · ${fmtPct(store.pop.share)} of occurrences`;
  }

  /** Relative measure of a PIN's count: "3.2× above average". */
  const liftOf = (pin: number) => lift(ds.counts[pin], ds.total, nPins);

  /** One-line description of a PIN: how it compares with an average PIN, and its rank. */
  const describePin = (pin: number) =>
      `PIN ${pad(pin)} · ${describeLift(liftOf(pin))} · rank #${fmtInt(cov.rank[pin] + 1)}`;

  /** Readout under the map while nothing is hovered: the clicked PIN stays visible (touch has no hover at all). */
  const idleReadout = () => (store.picked !== null ? `${describePin(store.picked)} · selected` : HOVER_HINT);

  function showHover(x: number, y: number) {
    hoverEl.textContent = describePin(store.proj().toPin(x, y));
  }

  function showSelection() {
    if (store.selection.size === 0) {
      selEl.textContent = 'Shift+drag a rectangle on the map.';
      return;
    }
    if (store.selection.size === 1) {
      selEl.textContent = describePin(store.selection.values().next().value as number);
      return;
    }
    const top = [...store.selection]
        .sort((a, b) => ds.counts[b] - ds.counts[a])
        .slice(0, 5)
        .map((p) => `${pad(p)} (${fmtX(liftOf(p))})`)
        .join(', ');
    const share = shareWhere(ds, (p) => store.selection.has(p));
    const avgLift = enrichment(share, store.selection.size, nPins);
    selEl.textContent =
        `${fmtInt(store.selection.size)} PINs · ${fmtPct(share)} of occurrences in ${fmtPct(store.selection.size / nPins)} of PINs ` +
        `(${describeLift(avgLift)}) · top 5: ${top}`;
  }

  /** Statistics of the clicked PIN, always visible in their own section. */
  function showPicked() {
    pickEl.textContent = '';
    const line = (text: string, big = false, muted = false) => {
      const d = document.createElement('div');
      d.textContent = text;
      if (big) d.style.cssText = 'font-size:16px;font-weight:600';
      if (muted) d.className = 'muted';
      pickEl.appendChild(d);
    };
    if (store.picked === null) {
      line('Click a PIN on the map.', false, true);
      return;
    }
    const c = ds.counts[store.picked];
    const rank = cov.rank[store.picked] + 1;
    const matched = tags.filter((_, i) => (mask[store.picked as number] & (1 << i)) !== 0).map((t) => t.label);
    const n = oneIn(c, ds.total);
    line(`PIN ${pad(store.picked)}`, true);
    line(describeLift(liftOf(store.picked)));
    line(`rank #${fmtInt(rank)} of ${fmtInt(nPins)} · top ${fmtPct(rank / nPins)} of PINs`);
    line(matched.length > 0 ? `tags: ${matched.join(', ')}` : 'tags: none');
    line(`${fmtInt(c)} occurrences${n === null ? '' : ` · 1 in ${fmtInt(Math.round(+n.toPrecision(3)))} of all`}`, false, true);
  }

  /** Small label next to the cursor: PIN and rank. Hidden while panning or dragging a rectangle. */
  function showTip(cell: [number, number] | null, px: number, py: number) {
    if (!cell || store.drag !== null || isMoving(store)) {
      tipEl.style.display = 'none';
      return;
    }
    const pin = store.proj().toPin(cell[0], cell[1]);
    tipEl.textContent = `${pad(pin)} · #${fmtInt(cov.rank[pin] + 1)}`;
    tipEl.style.display = 'block';
    const gap = 14;
    const cx = store.plot.left + px; // the canvas fills its container, so canvas and container coordinates agree
    const cy = store.plot.top + py;
    const w = tipEl.offsetWidth;
    const h = tipEl.offsetHeight;
    const x = cx + gap + w > store.plot.outerW ? cx - gap - w : cx + gap; // flip at the right and bottom edges
    const y = cy + gap + h > store.plot.outerH ? cy - gap - h : cy + gap;
    tipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  return { showSource, idleReadout, showHover, showSelection, showPicked, showPopularity, showTip };
}
