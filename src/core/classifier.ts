import {
  boxOf,
  distinctCount,
  fitsIn2x2,
  isEdgeMiddle,
  keyDistance,
  NUMPAD,
  repeatedPair,
  squareKind,
  type KeypadLayout,
  type SquareKind,
} from './keypad';

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

const SQUARE_LABEL: Record<SquareKind, string> = {
  z: 'Keypad square: Z, along rows (1245)',
  n: 'Keypad square: N, along columns (2536)',
  around: 'Keypad square: round the block (6325)',
  cross: 'Keypad square: cross (1524)',
};

/**
 * Tags built on the geometry of a keypad. The layout is a parameter, so a phone keypad can be swapped in later.
 * Four-key squares need a 2 × 2 block, so the 0 key never takes part in them; it can in the three-key tags.
 */
export function keypadTags(l: KeypadLayout): Tag[] {
  const squares = (Object.keys(SQUARE_LABEL) as SquareKind[]).map<Tag>((kind) => ({
    id: `kp-${kind}`,
    label: SQUARE_LABEL[kind],
    test: (d) => squareKind(l, d) === kind,
  }));
  const pairDistance = (d: number[]) => {
    const p = repeatedPair(d);
    return p === null ? null : keyDistance(l, p[0], p[1]);
  };
  return [
    ...squares,
    {
      id: 'kp-compact',
      label: 'Keypad: 3 keys in a 2×2 block (8985)',
      test: (d) => distinctCount(d) === 3 && fitsIn2x2(l, d),
    },
    {
      id: 'kp-line',
      label: 'Keypad: 3 keys in a row or column (8789)',
      test: (d) => {
        const b = boxOf(l, d);
        return distinctCount(d) === 3 && (b.rows === 0 || b.cols === 0);
      },
    },
    {
      id: 'kp-diamond',
      label: 'Keypad: 3–4 of the keys 2, 4, 6, 8 (4268)',
      test: (d) => distinctCount(d) >= 3 && d.every((k) => isEdgeMiddle(l, k)),
    },
    {
      // AABB / ABAB; keys two or more steps apart. Pairs 1.5 apart (only 0 and 3 on a PC keypad) belong to neither tag.
      id: 'kp-far',
      label: 'Keypad: AABB / ABAB with far keys (1199)',
      test: (d) => (pairDistance(d) ?? 0) >= 2,
    },
    {
      id: 'kp-near',
      label: 'Keypad: AABB / ABAB with neighbouring keys (1122)',
      test: (d) => {
        const dist = pairDistance(d);
        return dist !== null && dist <= 1;
      },
    },
  ];
}

/** 6 pattern tags + 9 keypad tags = 15 of the 16 bits of the mask (Uint16Array). Widen the mask before adding two more. */
export const TAGS4_ALL: Tag[] = [...TAGS4, ...keypadTags(NUMPAD)];

export const tagsFor = (n: number): Tag[] => (n === 4 ? TAGS4_ALL : []);

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
    TAGS4_ALL.forEach((t, i) => {
      if (t.test(d)) m |= 1 << i;
    });
    mask[pin] = m;
  }
  return mask;
}
