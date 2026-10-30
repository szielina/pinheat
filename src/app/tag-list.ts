import { TAG_GROUPS, type Tag } from '../core/classifier';

export interface TagList {
  /** Shows how many tags of each group are ticked, so a collapsed group still tells that it filters. */
  showTicked(mask: number): void;
}

/**
 * Fills `root` with the tags, one collapsible section per group. `stats[i]` is the text after tag i; the checkbox of
 * tag i carries `data-bit = i`, which is its position in the mask, whatever its position on the screen.
 * Every text goes in as a text node: a tag label never reaches innerHTML.
 */
export function buildTagList(root: HTMLElement, tags: Tag[], mask: number, stats: string[], remainder: string): TagList {
  const counters: { bits: number[]; out: HTMLElement }[] = [];
  for (const g of TAG_GROUPS) {
    const bits = tags.flatMap((t, i) => (t.group === g.id ? [i] : []));
    if (bits.length === 0) continue;
    const section = document.createElement('details');
    section.className = 'tag-group';
    section.open = true;
    const summary = document.createElement('summary');
    const out = document.createElement('span');
    out.className = 'muted';
    summary.append(g.label, out);
    section.appendChild(summary);
    for (const i of bits) {
      const row = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.dataset.bit = String(i);
      box.checked = ((mask >> i) & 1) === 1;
      const text = document.createElement('span');
      text.className = 'muted';
      text.textContent = stats[i];
      row.append(box, ` ${tags[i].label} `, text);
      section.appendChild(row);
    }
    root.appendChild(section);
    counters.push({ bits, out });
  }
  const rest = document.createElement('div');
  rest.className = 'muted';
  rest.textContent = remainder;
  root.appendChild(rest);

  const list: TagList = {
    showTicked(m) {
      for (const { bits, out } of counters) {
        const n = bits.filter((i) => ((m >> i) & 1) === 1).length;
        out.textContent = n > 0 ? ` · ${n} on` : '';
      }
    },
  };
  list.showTicked(mask);
  return list;
}
