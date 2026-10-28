import { visibleSet } from '../core/visibility';
import type { Data } from './data';
import type { Store } from './store';

/** The set of PINs that pass every active filter, kept in one place for everything that shows or analyses it. */
export interface Visible {
  /** The set as of the last `recompute()`; 1 = visible. */
  current(): Uint8Array;
  /** Derives the set again from the store (tags, popularity, selection), tells the listeners and returns it. */
  recompute(): Uint8Array;
  /** Called after every `recompute()`, in the order of registration. */
  onChange(listener: (set: Uint8Array) => void): void;
}

export function createVisible(data: Data, store: Store): Visible {
  const listeners: Array<(set: Uint8Array) => void> = [];
  const compute = () =>
    visibleSet(data.nPins, {
      tagMask: data.mask,
      enabledTags: store.view.t,
      popularity: store.pop ? store.pop.member : null,
      selection: store.selection,
    });
  let set = compute();

  return {
    current: () => set,
    recompute() {
      set = compute();
      for (const listener of listeners) listener(set);
      return set;
    },
    onChange: (listener) => void listeners.push(listener),
  };
}
