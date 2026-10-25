import { axisLabel, axisTicks, axisTitle, tickStep } from '../core/axis';
import type { Projection } from '../core/projection';
import { toScreen, type Viewport } from '../core/viewport';

const MARGIN_TOP = 6;
const MARGIN_RIGHT = 14;
const MARGIN_BOTTOM = 40;
const TITLE_W = 18; // room for the rotated y title
const FONT = '11px system-ui, sans-serif';
const TICK_COLOR = '#8b93a1';
const LINE_COLOR = '#4a515e';
const TITLE_COLOR = '#e6e6e6';
const HOVER_COLOR = '#ffffff';
const CHAR_PX = 7; // approximate width of one character at FONT
const TICK_LEN = 4;
const HOVER_TICK_LEN = 8;
const MIN_ROW_PX = 18; // minimum spacing between y labels

/** The map area inside the canvas (CSS pixels), plus the full canvas size. */
export interface PlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
  outerW: number;
  outerH: number;
}

/** `chars` is the number of characters in an axis label (the PIN length); it sizes the left margin. */
export function plotRect(outerW: number, outerH: number, chars: number): PlotRect {
  const left = TITLE_W + chars * CHAR_PX + TICK_LEN + 8;
  return {
    left,
    top: MARGIN_TOP,
    width: Math.max(1, outerW - left - MARGIN_RIGHT),
    height: Math.max(1, outerH - MARGIN_TOP - MARGIN_BOTTOM),
    outerW,
    outerH,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Draws tick labels and axis titles around the map, as PIN patterns that follow the chosen projection
 * (e.g. "47nn" / "nn12" for AB × CD). Expects a context already scaled by devicePixelRatio and not translated.
 * Ticks follow pan and zoom; the hovered cell gets a bright tick on both axes.
 */
export function drawAxes(
  ctx: CanvasRenderingContext2D,
  plot: PlotRect,
  vp: Viewport,
  proj: Projection,
  hover: [number, number] | null,
): void {
  const n = proj.xDigits.length + proj.yDigits.length; // the two axes together cover all digits
  const visW = plot.width / vp.k;
  const visH = plot.height / vp.k;

  // the axes hug the grid edges (the grid can be smaller than the view and centred in it)
  const axisX = plot.left + Math.round(clamp(toScreen(vp, 0, 0)[0], 0, plot.width));
  const axisY = plot.top + Math.round(clamp(toScreen(vp, 0, proj.height)[1], 0, plot.height));

  ctx.save();
  ctx.font = FONT;
  ctx.lineWidth = 1;
  ctx.strokeStyle = LINE_COLOR;
  ctx.fillStyle = TICK_COLOR;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xLabel = (c: number) => axisLabel(c, proj.xDigits, n);
  for (const t of axisTicks(proj.width, vp.x, vp.x + visW, tickStep(vp.k, n * CHAR_PX + 16), xLabel)) {
    const px = plot.left + Math.round(toScreen(vp, t.cell + 0.5, 0)[0]) + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, axisY);
    ctx.lineTo(px, axisY + TICK_LEN);
    ctx.stroke();
    ctx.fillText(t.label, px, axisY + TICK_LEN + 2);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const yLabel = (c: number) => axisLabel(c, proj.yDigits, n);
  for (const t of axisTicks(proj.height, vp.y, vp.y + visH, tickStep(vp.k, MIN_ROW_PX), yLabel)) {
    const py = plot.top + Math.round(toScreen(vp, 0, t.cell + 0.5)[1]) + 0.5;
    ctx.beginPath();
    ctx.moveTo(axisX - TICK_LEN, py);
    ctx.lineTo(axisX, py);
    ctx.stroke();
    ctx.fillText(t.label, axisX - TICK_LEN - 2, py);
  }

  if (hover) {
    ctx.strokeStyle = HOVER_COLOR;
    const [hx, hy] = toScreen(vp, hover[0] + 0.5, hover[1] + 0.5);
    const px = plot.left + Math.round(hx) + 0.5;
    const py = plot.top + Math.round(hy) + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, axisY);
    ctx.lineTo(px, axisY + HOVER_TICK_LEN);
    ctx.moveTo(axisX - HOVER_TICK_LEN, py);
    ctx.lineTo(axisX, py);
    ctx.stroke();
  }

  // titles: arrows show the direction in which the value grows
  ctx.fillStyle = TITLE_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`x: ${axisTitle(proj.xDigits, n)} →`, plot.left + plot.width / 2, plot.outerH - 3);

  ctx.save();
  ctx.translate(14, plot.top + plot.height / 2);
  ctx.rotate(Math.PI / 2); // text reads top to bottom, so "→" points down
  ctx.textBaseline = 'top';
  ctx.fillText(`y: ${axisTitle(proj.yDigits, n)} →`, 0, 0);
  ctx.restore();

  ctx.restore();
}
