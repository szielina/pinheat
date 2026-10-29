import './style.css';
import { installControls } from './app/controls';
import { createData } from './app/data';
import { installDigitChart } from './app/digit-chart';
import { installProfileCharts } from './app/profile-chart';
import { getElements } from './app/dom';
import { createGeometry } from './app/geometry';
import { installHints } from './app/hints';
import { loadDataset } from './app/load';
import { createPointerHost } from './app/map-host';
import { createPanels } from './app/panels';
import { installPointer } from './app/pointer';
import { createRenderer } from './app/renderer';
import { createStore } from './app/store';
import { createVisible } from './app/visible';

async function main() {
  const N = 4;
  const ds = await loadDataset(N, `${import.meta.env.BASE_URL}pins${N}.bin`);
  const data = createData(N, ds);
  const el = getElements();
  const store = createStore(data);

  const visible = createVisible(data, store);
  const renderer = createRenderer(data, store, el, visible);
  const panels = createPanels(data, store, el);
  const geometry = createGeometry(el.canvas, store);
  const host = createPointerHost(store, el, geometry, panels, renderer);

  panels.showSource();
  const controls = installControls({ data, store, el, panels, renderer, selectionChanged: host.selectionChanged });
  installPointer(el.canvas, store, geometry, host);
  installDigitChart({ data, store, el, visible });
  installProfileCharts({ data, store, el, visible });

  controls.refresh();
  renderer.buildImage();
  renderer.updateLegend();
  renderer.layout();
  panels.showSelection();
  panels.showPicked();
  new ResizeObserver(() => renderer.layout(false)).observe(el.stageEl);
  window.addEventListener('resize', () => renderer.layout(false)); // page zoom changes the pixel ratio without resizing the stage
}

installHints();
main().catch(console.error);
