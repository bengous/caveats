import { expect, test } from 'bun:test';

interface Color {
    readonly red: number;
    readonly green: number;
    readonly blue: number;
    readonly alpha: number;
}

const WHITE: Color = { red: 255, green: 255, blue: 255, alpha: 1 };
const TEXT_RATIO = 4.5;
const COMPONENT_RATIO = 3;

const css = await Bun.file(`${import.meta.dir}/../ui/style.css`).text();

function parseColor(value: string): Color {
    const hex = /^#(?<red>[0-9a-f]{2})(?<green>[0-9a-f]{2})(?<blue>[0-9a-f]{2})$/v.exec(value)?.groups;
    if (hex !== undefined) {
        return {
            red: Number.parseInt(hex['red'] ?? '', 16),
            green: Number.parseInt(hex['green'] ?? '', 16),
            blue: Number.parseInt(hex['blue'] ?? '', 16),
            alpha: 1,
        };
    }
    const rgb = /^rgb\(\s*(?<red>\d+)\s+(?<green>\d+)\s+(?<blue>\d+)\s*(?:\/\s*(?<alpha>[\d.]+))?\s*\)$/v.exec(
        value,
    )?.groups;
    if (rgb === undefined) {
        throw new Error(`cannot read the colour ${value}`);
    }
    return {
        red: Number(rgb['red']),
        green: Number(rgb['green']),
        blue: Number(rgb['blue']),
        alpha: Number(rgb['alpha'] ?? 1),
    };
}

function token(name: string): Color {
    const value = new RegExp(`--${name}:\\s*([^;]+);`, 'v').exec(css)?.[1];
    if (value === undefined) {
        throw new Error(`ui/style.css has no --${name}`);
    }
    return parseColor(value.trim());
}

function multiplyOver(front: Color, back: Color): Color {
    const mix = (top: number, bottom: number): number =>
        bottom * (1 - front.alpha) + ((top * bottom) / 255) * front.alpha;
    return {
        red: mix(front.red, back.red),
        green: mix(front.green, back.green),
        blue: mix(front.blue, back.blue),
        alpha: 1,
    };
}

function channel(value: number): number {
    const unit = value / 255;
    return unit <= 0.039_28 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(color: Color): number {
    return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue);
}

function contrast(first: Color, second: Color): number {
    const [light, dark] = [luminance(first), luminance(second)].toSorted((a, b) => b - a);
    return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const room = token('room');
const raised = token('room-raised');
const ink = token('ink');
const muted = token('ink-muted');
const fluorescence = token('fluorescence');
const amber = token('amber');
const litPage = multiplyOver(token('uv-tint'), WHITE);

interface Pair {
    readonly name: string;
    readonly front: Color;
    readonly back: Color;
    readonly ratio: number;
}

const pairs: readonly Pair[] = [
    { name: 'body text on the room', front: ink, back: room, ratio: TEXT_RATIO },
    { name: 'muted text on the room', front: muted, back: room, ratio: TEXT_RATIO },
    { name: 'muted text on a raised surface', front: muted, back: raised, ratio: TEXT_RATIO },
    { name: 'body text on a raised surface', front: ink, back: raised, ratio: TEXT_RATIO },
    { name: 'status text on the room', front: fluorescence, back: room, ratio: TEXT_RATIO },
    { name: 'verdict text on the room', front: amber, back: room, ratio: TEXT_RATIO },
    { name: 'button label on a button', front: room, back: ink, ratio: TEXT_RATIO },
    { name: 'passage number on its badge', front: room, back: fluorescence, ratio: TEXT_RATIO },
    { name: 'focus ring on the room', front: fluorescence, back: room, ratio: COMPONENT_RATIO },
    { name: 'focus ring on a raised surface', front: fluorescence, back: raised, ratio: COMPONENT_RATIO },
    { name: 'marker ring on the lit page', front: room, back: litPage, ratio: COMPONENT_RATIO },
];

test('the lit marker is set off from the page by a ring in the room colour', () => {
    expect(css).toMatch(/\.glow\s*\{[^\}]*box-shadow:\s*0 0 0 \d+px var\(--room\)/v);
});

for (const pair of pairs) {
    test(`${pair.name} reaches ${pair.ratio}:1`, () => {
        expect(contrast(pair.front, pair.back)).toBeGreaterThanOrEqual(pair.ratio);
    });
}
