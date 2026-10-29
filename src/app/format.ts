/** Number formatting for the readouts. */

export const fmtInt = (x: number) => x.toLocaleString('en-US');
export const fmtPct = (x: number) => (x * 100).toFixed(x < 0.001 ? 4 : 2) + '%';

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
/** "1.2K", "34M": short axis labels. */
export const fmtCompact = (x: number) => compact.format(x);
