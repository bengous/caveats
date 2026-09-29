import * as z from 'zod';
import { MAX_PAGE_LONG_SIDE_POINTS, MAX_PAGE_SHORT_SIDE_POINTS } from './limits.ts';
import type { PageBitmap, Pdfium, Rect } from './pdfium.ts';
import { PdfError, RectSchema, withDocument, withPage, withPageBitmap } from './pdfium.ts';

const HiddenReasonSchema = z.enum(['invisible-render-mode', 'tiny-font', 'off-page', 'no-contrast']);
export type HiddenReason = z.infer<typeof HiddenReasonSchema>;

const PageNumberSchema = z.int().min(1).brand<'PageNumber'>().describe('1-based page number.');
export type PageNumber = z.infer<typeof PageNumberSchema>;

export const HiddenSpanSchema = z.object({
    page: PageNumberSchema,
    text: z.string().describe('The hidden text as the candidate wrote it. Escape it before putting it in HTML.'),
    reasons: z.array(HiddenReasonSchema).min(1),
    boxes: z.array(RectSchema).describe('One rectangle per line of the span.'),
});
export type HiddenSpan = z.infer<typeof HiddenSpanSchema>;

export interface PdfScan {
    readonly pageCount: number;
    readonly visibleText: string;
    readonly hiddenSpans: HiddenSpan[];
}

interface ScannedChar {
    readonly char: string;
    readonly reasons: readonly HiddenReason[];
    readonly box: Rect | null;
}

interface PageScan {
    readonly visibleText: string;
    readonly hiddenSpans: readonly HiddenSpan[];
}

interface PageContext {
    readonly pdfium: Pdfium;
    readonly textPage: number;
    readonly bitmap: PageBitmap;
    readonly outParams: number;
}

const TEXT_RENDER_MODE_INVISIBLE = 3;
const TINY_FONT_POINTS = 2;
const MIN_VISIBLE_LUMA_RANGE = 24;
const RENDER_SCALE = 2;
const BYTES_PER_PIXEL = 4;
const DOUBLE_BYTES = 8;
const OUT_PARAM_BYTES = 4 * DOUBLE_BYTES;

/** Scanning is synchronous: a long PDF, or a large page, would hold the server's event loop. */
export class TooManyPagesError extends Error {
    override readonly name = 'TooManyPagesError';
    readonly pageCount: number;
    readonly maxPages: number;

    constructor(pageCount: number, maxPages: number) {
        super(`this PDF has ${pageCount} pages, the limit is ${maxPages}`);
        this.pageCount = pageCount;
        this.maxPages = maxPages;
    }
}

export class PageTooLargeError extends Error {
    override readonly name = 'PageTooLargeError';
    readonly page: PageNumber;
    readonly width: number;
    readonly height: number;

    constructor(page: PageNumber, width: number, height: number) {
        super(`page ${page} is ${width} x ${height} pt, larger than US Legal`);
        this.page = page;
        this.width = width;
        this.height = height;
    }
}

function assertPaperSize(pdfium: Pdfium, page: number, pageIndex: number): void {
    const width = Math.round(pdfium.FPDF_GetPageWidthF(page));
    const height = Math.round(pdfium.FPDF_GetPageHeightF(page));
    if (Math.min(width, height) > MAX_PAGE_SHORT_SIDE_POINTS || Math.max(width, height) > MAX_PAGE_LONG_SIDE_POINTS) {
        throw new PageTooLargeError(PageNumberSchema.parse(pageIndex + 1), width, height);
    }
}

export function scanPdf(pdf: Uint8Array, maxPages: number): Promise<PdfScan> {
    return withDocument(pdf, (pdfium, doc) => {
        const pageCount = pdfium.FPDF_GetPageCount(doc);
        if (pageCount > maxPages) {
            throw new TooManyPagesError(pageCount, maxPages);
        }
        const outParams = pdfium.pdfium.wasmExports.malloc(OUT_PARAM_BYTES);
        try {
            const pages = Array.from({ length: pageCount }, (_, index) =>
                withPage(pdfium, doc, index, (page) => scanPage(pdfium, page, index, outParams)),
            );
            return {
                pageCount,
                visibleText: pages.map((page) => page.visibleText).join('\n'),
                hiddenSpans: pages.flatMap((page) => page.hiddenSpans),
            };
        } finally {
            pdfium.pdfium.wasmExports.free(outParams);
        }
    });
}

function scanPage(pdfium: Pdfium, page: number, pageIndex: number, outParams: number): PageScan {
    assertPaperSize(pdfium, page, pageIndex);
    const textPage = pdfium.FPDFText_LoadPage(page);
    if (textPage === 0) {
        throw new PdfError(`PDFium cannot read the text of page ${pageIndex + 1}`);
    }
    try {
        return withPageBitmap(pdfium, page, RENDER_SCALE, (bitmap) => {
            const context: PageContext = { pdfium, textPage, bitmap, outParams };
            const chars = Array.from({ length: pdfium.FPDFText_CountChars(textPage) }, (_, index) =>
                classifyChar(context, index),
            );
            return groupHiddenSpans(chars, PageNumberSchema.parse(pageIndex + 1));
        });
    } finally {
        pdfium.FPDFText_ClosePage(textPage);
    }
}

function classifyChar(context: PageContext, index: number): ScannedChar {
    const { pdfium, textPage } = context;
    const char = String.fromCodePoint(pdfium.FPDFText_GetUnicode(textPage, index));
    const reasons: HiddenReason[] = [];
    const textObject = pdfium.FPDFText_GetTextObject(textPage, index);
    if (textObject !== 0 && pdfium.FPDFTextObj_GetTextRenderMode(textObject) === TEXT_RENDER_MODE_INVISIBLE) {
        reasons.push('invisible-render-mode');
    }
    const fontSize = pdfium.FPDFText_GetFontSize(textPage, index);
    if (fontSize > 0 && fontSize < TINY_FONT_POINTS) {
        reasons.push('tiny-font');
    }
    const box = char.trim() === '' ? null : readCharBox(context, index);
    if (box !== null) {
        if (isOffPage(context.bitmap, box)) {
            reasons.push('off-page');
        } else if (lumaRange(context.bitmap, box) < MIN_VISIBLE_LUMA_RANGE) {
            reasons.push('no-contrast');
        }
    }
    return { char, reasons, box };
}

function readCharBox(context: PageContext, index: number): Rect | null {
    const { pdfium, textPage, outParams } = context;
    const left = outParams;
    const right = outParams + DOUBLE_BYTES;
    const bottom = outParams + 2 * DOUBLE_BYTES;
    const top = outParams + 3 * DOUBLE_BYTES;
    if (!pdfium.FPDFText_GetCharBox(textPage, index, left, right, bottom, top)) {
        return null;
    }
    const read = (pointer: number): number => pdfium.pdfium.getValue(pointer, 'double');
    return { left: read(left), right: read(right), bottom: read(bottom), top: read(top) };
}

function isOffPage(bitmap: PageBitmap, box: Rect): boolean {
    return box.right < 0 || box.left > bitmap.pageWidth || box.top < 0 || box.bottom > bitmap.pageHeight;
}

function lumaRange(bitmap: PageBitmap, box: Rect): number {
    const { pixels, stride, scale, pageHeight } = bitmap;
    const x0 = Math.max(0, Math.floor(box.left * scale));
    const x1 = Math.min(bitmap.width - 1, Math.ceil(box.right * scale));
    const y0 = Math.max(0, Math.floor((pageHeight - box.top) * scale));
    const y1 = Math.min(bitmap.height - 1, Math.ceil((pageHeight - box.bottom) * scale));
    let min = 255;
    let max = 0;
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            const offset = y * stride + x * BYTES_PER_PIXEL;
            const blue = pixels.getUint8(offset);
            const green = pixels.getUint8(offset + 1);
            const red = pixels.getUint8(offset + 2);
            const luma = 0.114 * blue + 0.587 * green + 0.299 * red;
            min = Math.min(min, luma);
            max = Math.max(max, luma);
        }
    }
    return max - min;
}

/** A char starts a new line when it shares no height with the last line, or wraps back to its left. */
function addToLines(lines: Rect[], box: Rect): void {
    const last = lines.at(-1);
    const sharesHeight = last !== undefined && Math.min(last.top, box.top) > Math.max(last.bottom, box.bottom);
    if (last === undefined || !sharesHeight || box.right < last.left) {
        lines.push(box);
        return;
    }
    lines[lines.length - 1] = {
        left: Math.min(last.left, box.left),
        right: Math.max(last.right, box.right),
        bottom: Math.min(last.bottom, box.bottom),
        top: Math.max(last.top, box.top),
    };
}

function groupHiddenSpans(chars: readonly ScannedChar[], page: PageNumber): PageScan {
    let visibleText = '';
    const hiddenSpans: HiddenSpan[] = [];
    let open: { text: string; reasons: Set<HiddenReason>; boxes: Rect[] } | null = null;
    const close = (): void => {
        const text = open?.text.trim() ?? '';
        if (open !== null && text !== '') {
            hiddenSpans.push({ page, text, reasons: [...open.reasons], boxes: open.boxes });
        }
        open = null;
    };
    for (const { char, reasons, box } of chars) {
        const isBlank = char.trim() === '';
        const hidden = isBlank ? open !== null : reasons.length > 0;
        if (hidden) {
            open ??= { text: '', reasons: new Set(), boxes: [] };
            open.text += char;
            for (const reason of reasons) {
                open.reasons.add(reason);
            }
            if (box !== null) {
                addToLines(open.boxes, box);
            }
        } else {
            close();
            visibleText += char;
        }
    }
    close();
    return { visibleText, hiddenSpans };
}
