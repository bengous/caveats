import type { PageBitmap } from './pdfium.ts';
import { withDocument, withPage, withPageBitmap } from './pdfium.ts';

export interface RenderedPage {
    /** Page size in PDF points. */
    readonly width: number;
    readonly height: number;
    /** The page as a person sees it, as a 24-bit BMP image. */
    readonly bmp: Uint8Array;
}

const BMP_HEADER_BYTES = 54;
const DIB_HEADER_BYTES = 40;
const PIXELS_PER_METER_AT_72_DPI = 2835;

export function renderPages(pdf: Uint8Array, scale: number): Promise<RenderedPage[]> {
    return withDocument(pdf, (pdfium, doc) =>
        Array.from({ length: pdfium.FPDF_GetPageCount(doc) }, (_, index) =>
            withPage(pdfium, doc, index, (page) =>
                withPageBitmap(pdfium, page, scale, (bitmap) => ({
                    width: bitmap.pageWidth,
                    height: bitmap.pageHeight,
                    bmp: encodeBmp(bitmap),
                })),
            ),
        ),
    );
}

function encodeBmp(bitmap: PageBitmap): Uint8Array {
    const rowBytes = Math.ceil((bitmap.width * 3) / 4) * 4;
    const imageBytes = rowBytes * bitmap.height;
    const bytes = new Uint8Array(BMP_HEADER_BYTES + imageBytes);
    const header = new DataView(bytes.buffer);
    header.setUint8(0, 0x42);
    header.setUint8(1, 0x4d);
    header.setUint32(2, bytes.length, true);
    header.setUint32(10, BMP_HEADER_BYTES, true);
    header.setUint32(14, DIB_HEADER_BYTES, true);
    header.setInt32(18, bitmap.width, true);
    // A negative height stores rows top-down, the order PDFium renders them.
    header.setInt32(22, -bitmap.height, true);
    header.setUint16(26, 1, true);
    header.setUint16(28, 24, true);
    header.setUint32(34, imageBytes, true);
    header.setUint32(38, PIXELS_PER_METER_AT_72_DPI, true);
    header.setUint32(42, PIXELS_PER_METER_AT_72_DPI, true);
    for (let y = 0; y < bitmap.height; y++) {
        for (let x = 0; x < bitmap.width; x++) {
            const source = y * bitmap.stride + x * 4;
            const target = BMP_HEADER_BYTES + y * rowBytes + x * 3;
            bytes[target] = bitmap.pixels.getUint8(source);
            bytes[target + 1] = bitmap.pixels.getUint8(source + 1);
            bytes[target + 2] = bitmap.pixels.getUint8(source + 2);
        }
    }
    return bytes;
}
