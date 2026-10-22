// Usage: node scripts/fetch-hibp.mjs [digits=4]   (Node 18+)
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const DIGITS = Number(process.argv[2] ?? 4);
const N = 10 ** DIGITS;
const CONCURRENCY = 8;
const RETRIES = 5;

const sha1 = (s) => createHash('sha1').update(s).digest('hex').toUpperCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRange(prefix) {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const map = new Map();
      for (const line of (await res.text()).split('\n')) {
        const [suffix, count] = line.trim().split(':');
        if (suffix) map.set(suffix, Number(count));
      }
      return map;
    } catch (e) {
      if (attempt === RETRIES - 1) throw e;
      await sleep(500 * 2 ** attempt);
    }
  }
}

const out = Buffer.alloc(4 * N);
let next = 0;
let done = 0;

async function worker() {
  for (;;) {
    const i = next++;
    if (i >= N) return;
    const hash = sha1(String(i).padStart(DIGITS, '0'));
    const range = await fetchRange(hash.slice(0, 5));
    out.writeUInt32LE(Math.min(range.get(hash.slice(5)) ?? 0, 0xffffffff), 4 * i);
    if (++done % 500 === 0) console.log(`${done}/${N}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await mkdir('public', { recursive: true });
await writeFile(`public/pins${DIGITS}.bin`, out);
console.log(`written public/pins${DIGITS}.bin (${out.length} B)`);
