/** Everything that can hide a PIN on the map. A PIN is visible when it passes every filter that is switched on. */
export interface VisibilityFilters {
  /** Tag bit mask of every PIN (see classifier). */
  tagMask: ArrayLike<number>;
  /** Enabled tags as a bit mask; 0 = tags do not filter. */
  enabledTags: number;
  /** 1 = the PIN belongs to the popularity set; null = popularity does not filter. */
  popularity: ArrayLike<number> | null;
  /** PINs of the rectangle selection; empty = the selection does not filter. */
  selection: ReadonlySet<number>;
}

/**
 * The set of PINs that pass all active filters (tags AND popularity AND selection), 1 = visible.
 * One definition of "what is currently shown" for the map and for anything that analyses the shown set.
 */
export function visibleSet(nPins: number, f: VisibilityFilters): Uint8Array {
  const visible = new Uint8Array(nPins);
  const hasSelection = f.selection.size > 0;
  for (let pin = 0; pin < nPins; pin++) {
    if (f.enabledTags !== 0 && (f.tagMask[pin] & f.enabledTags) === 0) continue;
    if (f.popularity !== null && f.popularity[pin] !== 1) continue;
    if (hasSelection && !f.selection.has(pin)) continue;
    visible[pin] = 1;
  }
  return visible;
}
