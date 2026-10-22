export interface Tag {
  id: string;
  label: string;
  test(d: number[]): boolean;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const validDayMonth = (day: number, month: number) =>
  month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1];
const pair = (a: number, b: number) => a * 10 + b;

export const TAGS4: Tag[] = [
  {
    id: 'date',
    label: 'Date (DDMM / MMDD)',
    test: (d) =>
      validDayMonth(pair(d[0], d[1]), pair(d[2], d[3])) || validDayMonth(pair(d[2], d[3]), pair(d[0], d[1])),
  },
  {
    id: 'year',
    label: 'Year 1900–2029',
    test: (d) => {
      const y = d[0] * 1000 + d[1] * 100 + d[2] * 10 + d[3];
      return y >= 1900 && y <= 2029;
    },
  },
  {
    id: 'repeat',
    label: 'Repeats (AAAA, ABAB, AABB)',
    test: (d) =>
      (d[0] === d[1] && d[1] === d[2] && d[2] === d[3]) ||
      (d[0] === d[2] && d[1] === d[3]) ||
      (d[0] === d[1] && d[2] === d[3]),
  },
  {
    id: 'seq',
    label: 'Sequence (1234, 4321, 7890)',
    test: (d) => [1, 9].some((step) => d.every((v, i) => i === 0 || (v - d[i - 1] + 10) % 10 === step)),
  },
  {
    id: 'keypad',
    label: 'Keypad line (2580)',
    test: (d) => {
      const s = d.join('');
      return s === '2580' || s === '0852';
    },
  },
  {
    id: 'palindrome',
    label: 'Palindrome (ABBA)',
    test: (d) => d[0] === d[3] && d[1] === d[2],
  },
];

export const tagsFor = (n: number): Tag[] => (n === 4 ? TAGS4 : []);

/** Bit mask of tags for every PIN; computed once. 4 digits only. */
export function classify(n: number): Uint16Array {
  const mask = new Uint16Array(10 ** n);
  if (n !== 4) return mask;
  const d = [0, 0, 0, 0];
  for (let pin = 0; pin < mask.length; pin++) {
    d[0] = Math.floor(pin / 1000);
    d[1] = Math.floor(pin / 100) % 10;
    d[2] = Math.floor(pin / 10) % 10;
    d[3] = pin % 10;
    let m = 0;
    TAGS4.forEach((t, i) => {
      if (t.test(d)) m |= 1 << i;
    });
    mask[pin] = m;
  }
  return mask;
}
