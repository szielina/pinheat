/** One option of a radio group: its value, the visible text and the tooltip. */
export type RadioOption = [value: string, text: string, hint: string];

/** A label followed by radio buttons; `onPick` gets the value of the one the user picks. Text goes in as text nodes only. */
export function radioGroup(name: string, label: string, options: RadioOption[], checked: string, onPick: (value: string) => void): HTMLDivElement {
  const group = document.createElement('div');
  group.append(`${label} `);
  for (const [value, text, hint] of options) {
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = value === checked;
    input.addEventListener('change', () => onPick(value));
    const row = document.createElement('label');
    row.title = hint;
    row.append(input, ` ${text}`);
    group.append(row);
  }
  return group;
}
