import type { WrappedPdfiumModule } from '@embedpdf/pdfium';
import { init } from '@embedpdf/pdfium';
import wasmPath from '@embedpdf/pdfium/pdfium.wasm' with { type: 'file' };
import * as z from 'zod';

export type Pdfium = WrappedPdfiumModule;

export const RectSchema = z
    .object({ left: z.number(), right: z.number(), bottom: z.number(), top: z.number() })
    .describe('Rectangle in PDF points, origin at the bottom left of the page.');
export type Rect = z.infer<typeof RectSchema>;

export type PdfProblem = 'unreadable' | 'corrupted' | 'password' | 'security' | 'other';

export class PdfError extends Error {
    override readonly name = 'PdfError';
    readonly problem: PdfProblem;

    constructor(message: string, problem: PdfProblem = 'other') {
        super(message);
        this.problem = problem;
    }
}

export interface PageBitmap {
    readonly pageWidth: number;
    readonly pageHeight: number;
    readonly scale: number;
    readonly width: number;
    readonly height: number;
    readonly stride: number;
    /** BGRx pixels, 4 bytes each, rows `stride` bytes apart. */
    readonly pixels: DataView;
}

const RENDER_WITH_ANNOTATIONS = 0x01;
const OPAQUE_WHITE = 0xff_ff_ff_ff;
// Indexed by the FPDF_ERR_* codes of PDFium's fpdfview.h.
const PDFIUM_LOAD_ERRORS = [
    { text: 'no error', problem: 'other' },
    { text: 'unknown error', problem: 'other' },
    { text: 'file not found or unreadable', problem: 'unreadable' },
    { text: 'not a PDF, or corrupted', problem: 'corrupted' },
    { text: 'password protected', problem: 'password' },
    { text: 'unsupported security scheme', problem: 'security' },
    { text: 'page not found', problem: 'other' },
] as const satisfies readonly { readonly text: string; readonly problem: PdfProblem }[];

let pdfiumReady: Promise<Pdfium> | undefined;

function loadPdfium(): Promise<Pdfium> {
    pdfiumReady ??= Bun.file(wasmPath)
        .arrayBuffer()
        .then(async (wasmBinary) => {
            const pdfium = await init({ wasmBinary });
            pdfium.PDFiumExt_Init();
            return pdfium;
        });
    return pdfiumReady;
}

export async function withDocument<T>(pdf: Uint8Array, use: (pdfium: Pdfium, doc: number) => T): Promise<T> {
    const pdfium = await loadPdfium();
    const { wasmExports, HEAPU8 } = pdfium.pdfium;
    const filePtr = wasmExports.malloc(pdf.length);
    try {
        HEAPU8.set(pdf, filePtr);
        const doc = pdfium.FPDF_LoadMemDocument(filePtr, pdf.length, '');
        if (doc === 0) {
            const { text, problem } = loadError(pdfium);
            throw new PdfError(`cannot open this PDF: ${text}`, problem);
        }
        try {
            return use(pdfium, doc);
        } finally {
            pdfium.FPDF_CloseDocument(doc);
        }
    } finally {
        wasmExports.free(filePtr);
    }
}

function loadError(pdfium: Pdfium): { readonly text: string; readonly problem: PdfProblem } {
    const { FPDF_GetLastError: lastErrorCode } = pdfium;
    const code = lastErrorCode();
    return PDFIUM_LOAD_ERRORS[code] ?? { text: `PDFium error ${code}`, problem: 'other' };
}

export function withPage<T>(pdfium: Pdfium, doc: number, pageIndex: number, use: (page: number) => T): T {
    const page = pdfium.FPDF_LoadPage(doc, pageIndex);
    if (page === 0) {
        throw new PdfError(`PDFium cannot load page ${pageIndex + 1}`);
    }
    try {
        return use(page);
    } finally {
        pdfium.FPDF_ClosePage(page);
    }
}

/**
 * Renders the page as a person sees it, annotations included. `use` must not
 * allocate in PDFium: a WASM memory growth detaches the buffer behind `pixels`.
 */
export function withPageBitmap<T>(pdfium: Pdfium, page: number, scale: number, use: (bitmap: PageBitmap) => T): T {
    const pageWidth = pdfium.FPDF_GetPageWidthF(page);
    const pageHeight = pdfium.FPDF_GetPageHeightF(page);
    const width = Math.ceil(pageWidth * scale);
    const height = Math.ceil(pageHeight * scale);
    const bitmap = pdfium.FPDFBitmap_Create(width, height, 0);
    if (bitmap === 0) {
        throw new PdfError(`PDFium cannot allocate a ${width}x${height} bitmap`);
    }
    try {
        pdfium.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, OPAQUE_WHITE);
        pdfium.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, RENDER_WITH_ANNOTATIONS);
        const stride = pdfium.FPDFBitmap_GetStride(bitmap);
        const pixels = new DataView(pdfium.pdfium.HEAPU8.buffer, pdfium.FPDFBitmap_GetBuffer(bitmap), stride * height);
        return use({ pageWidth, pageHeight, scale, width, height, stride, pixels });
    } finally {
        pdfium.FPDFBitmap_Destroy(bitmap);
    }
}
