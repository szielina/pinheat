import { makeDataset, syntheticCounts, type Dataset } from '../core/dataset';

export async function loadDataset(digits: number, url: string): Promise<Dataset> {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        // the Vite dev server returns index.html (200) for a missing file
        if (buf.byteLength !== 4 * 10 ** digits) throw new Error(`wrong size: ${buf.byteLength}`);
        return makeDataset(digits, new Uint32Array(buf), 'hibp');
    } catch (e) {
        console.warn('HIBP data not available, using demo data:', e);
        return makeDataset(digits, syntheticCounts(digits), 'demo');
    }
}
