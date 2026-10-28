/** Typed lookups of the elements of index.html, done once at start-up. */

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html has no element #${id}`);
  return el as T;
};

export interface Elements {
  canvas: HTMLCanvasElement;
  legendCanvas: HTMLCanvasElement;
  stageEl: HTMLDivElement;
  srcEl: HTMLDivElement;
  hoverEl: HTMLDivElement;
  tipEl: HTMLDivElement;
  selEl: HTMLDivElement;
  pickEl: HTMLDivElement;
  projEl: HTMLSelectElement;
  cmapEl: HTMLSelectElement;
  gammaEl: HTMLInputElement;
  gammaOut: HTMLSpanElement;
  clipEl: HTMLInputElement;
  clipOut: HTMLSpanElement;
  tagsEl: HTMLDivElement;
  popN: HTMLInputElement;
  popRange: HTMLInputElement;
  popOut: HTMLDivElement;
  resetEl: HTMLButtonElement;
  clearEl: HTMLButtonElement;
  legendCapEl: HTMLDivElement;
  legendTicksEl: HTMLDivElement;
  mkHoverEl: HTMLDivElement;
  mkPickEl: HTMLDivElement;
  digitsCapEl: HTMLDivElement;
  digitsOptsEl: HTMLDivElement;
  digitsNoteEl: HTMLDivElement;
  digitsLegendEl: HTMLDivElement;
  digitsChartEl: HTMLDivElement;
  /** Radio buttons of the colour scale and of the popularity direction, and the preset buttons of the popularity filter. */
  scaleRadios: NodeListOf<HTMLInputElement>;
  dirRadios: NodeListOf<HTMLInputElement>;
  popPresets: NodeListOf<HTMLButtonElement>;
}

export function getElements(): Elements {
  return {
    canvas: byId('map'),
    legendCanvas: byId('legend'),
    stageEl: byId('stage'),
    srcEl: byId('src'),
    hoverEl: byId('hover'),
    tipEl: byId('tip'),
    selEl: byId('sel'),
    pickEl: byId('pick'),
    projEl: byId('proj'),
    cmapEl: byId('cmap'),
    gammaEl: byId('gamma'),
    gammaOut: byId('gammaOut'),
    clipEl: byId('clip'),
    clipOut: byId('clipOut'),
    tagsEl: byId('tags'),
    popN: byId('popN'),
    popRange: byId('popRange'),
    popOut: byId('popOut'),
    resetEl: byId('reset'),
    clearEl: byId('clear'),
    legendCapEl: byId('legendCap'),
    legendTicksEl: byId('legendTicks'),
    mkHoverEl: byId('mkHover'),
    mkPickEl: byId('mkPick'),
    digitsCapEl: byId('digitsCap'),
    digitsOptsEl: byId('digitsOpts'),
    digitsNoteEl: byId('digitsNote'),
    digitsLegendEl: byId('digitsLegend'),
    digitsChartEl: byId('digitsChart'),
    scaleRadios: document.querySelectorAll<HTMLInputElement>('input[name=s]'),
    dirRadios: document.querySelectorAll<HTMLInputElement>('input[name=d]'),
    popPresets: document.querySelectorAll<HTMLButtonElement>('button[data-n]'),
  };
}
