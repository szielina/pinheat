export type RGB = [number, number, number];
export type ColormapId = 'viridis' | 'cividis' | 'plasma' | 'grayscale';

interface Colormap {
    label: string;
    stops: RGB[];
}

const hex = (list: string[]): RGB[] =>
    list.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as RGB);

export const COLORMAPS: Record<ColormapId, Colormap> = {
    viridis: {
        label: 'Viridis (colour-blind friendly)',
        stops: hex(['#440154', '#482878', '#3e4a89', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6dcd59', '#b4de2c', '#fde725']),
    },
    cividis: {
        label: 'Cividis (optimised for colour-vision deficiency)',
        stops: hex(['#00224e', '#123570', '#3b496c', '#575d6d', '#707173', '#8a8678', '#a69d75', '#c4b56e', '#e4cf5b', '#fee838']),
    },
    plasma: {
        label: 'Plasma',
        stops: hex(['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921']),
    },
    grayscale: {
        label: 'Grayscale',
        stops: hex(['#101010', '#f4f4f4']),
    },
};

export const COLORMAP_IDS = Object.keys(COLORMAPS) as ColormapId[];

function sample(stops: RGB[], t: number): RGB {
    const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    const f = x - i;
    const a = stops[i];
    const b = stops[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

const luts = new Map<ColormapId, Uint8ClampedArray>();

/** 256-entry lookup table of RGB triplets: index = round(t * 255) * 3. */
export function lut(id: ColormapId): Uint8ClampedArray {
    let table = luts.get(id);
    if (!table) {
        table = new Uint8ClampedArray(256 * 3);
        for (let i = 0; i < 256; i++) {
            const [r, g, b] = sample(COLORMAPS[id].stops, i / 255);
            table[i * 3] = r;
            table[i * 3 + 1] = g;
            table[i * 3 + 2] = b;
        }
        luts.set(id, table);
    }
    return table;
}