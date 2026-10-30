import type { Tag } from '../core/classifier';

/**
 * Fills `root` with one checkbox per tag. `stats[i]` is the text after tag i; the checkbox of tag i carries
 * `data-bit = i`, its position in the mask. Every text goes in as a text node: a tag label never reaches innerHTML.
 */
export function buildTagList(root: HTMLElement, tags: Tag[], mask: number, stats: string[], remainder: string): void {
  tags.forEach((t, i) => {
    const row = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.bit = String(i);
    box.checked = ((mask >> i) & 1) === 1;
    const text = document.createElement('span');
    text.className = 'muted';
    text.textContent = stats[i];
    row.append(box, ` ${t.label} `, text);
    root.appendChild(row);
  });
  const rest = document.createElement('div');
  rest.className = 'muted';
  rest.textContent = remainder;
  root.appendChild(rest);
}
