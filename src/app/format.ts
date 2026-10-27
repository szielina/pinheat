/** Number formatting for the readouts. */

export const fmtInt = (x: number) => x.toLocaleString('en-US');
export const fmtPct = (x: number) => (x * 100).toFixed(x < 0.001 ? 4 : 2) + '%';
