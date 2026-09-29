// The machine API for ATS integrations. The contract is in docs/api-design.md;
// a change to a response here is a change to the published v1 schema.
import { createHash, timingSafeEqual } from 'node:crypto';
import * as z from 'zod';
import type { IntentJudge } from './judge.ts';
import { PdfError } from './pdfium.ts';
import { checkCv } from './report.ts';
import { PageTooLargeError, TooManyPagesError } from './scan.ts';

export const BearerTokenSchema = z.string().min(32, 'must be at least 32 characters').brand<'BearerToken'>();
export type BearerToken = z.infer<typeof BearerTokenSchema>;

const ErrorCodeSchema = z.enum([
    'empty-body',
    'unauthorized',
    'forbidden-host',
    'unsupported-media-type',
    'unreadable-pdf',
    'too-many-pages',
    'page-too-large',
    'internal',
]);
type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
    error: z.object({ code: ErrorCodeSchema, message: z.string().describe('For a person; branch on `code`.') }),
});
type ApiError = z.infer<typeof ApiErrorSchema>;

const STATUS = {
    'empty-body': 400,
    unauthorized: 401,
    'forbidden-host': 403,
    'unsupported-media-type': 415,
    'unreadable-pdf': 422,
    'too-many-pages': 422,
    'page-too-large': 422,
    internal: 500,
} as const satisfies Record<ErrorCode, number>;

const JSON_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

export function apiError(code: ErrorCode, message: string): Response {
    const body: ApiError = { error: { code, message } };
    const headers = code === 'unauthorized' ? { ...JSON_HEADERS, 'www-authenticate': 'Bearer' } : JSON_HEADERS;
    return Response.json(body, { status: STATUS[code], headers });
}

export function isPdf(request: Request): boolean {
    return request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === 'application/pdf';
}

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();

function isAuthorized(request: Request, token: BearerToken): boolean {
    const [scheme, presented = ''] = (request.headers.get('authorization') ?? '').split(' ');
    return scheme?.toLowerCase() === 'bearer' && timingSafeEqual(sha256(presented), sha256(token));
}

export interface ApiContext {
    readonly judge: IntentJudge | null;
    readonly token: BearerToken | null;
    readonly maxPages: number;
}

export async function handleCheckV1(request: Request, { judge, token, maxPages }: ApiContext): Promise<Response> {
    if (token !== null && !isAuthorized(request, token)) {
        return apiError('unauthorized', 'Send the API token as Authorization: Bearer <token>.');
    }
    if (!isPdf(request)) {
        return apiError('unsupported-media-type', 'Send the CV as the raw body, with Content-Type: application/pdf.');
    }
    const pdf = new Uint8Array(await request.arrayBuffer());
    if (pdf.length === 0) {
        return apiError('empty-body', 'The request body is empty.');
    }
    try {
        return Response.json(await checkCv(pdf, judge, maxPages), { headers: JSON_HEADERS });
    } catch (error) {
        if (error instanceof TooManyPagesError) {
            return apiError(
                'too-many-pages',
                `This PDF has ${error.pageCount} pages. This server checks CVs of ${error.maxPages} page(s) at most.`,
            );
        }
        if (error instanceof PageTooLargeError) {
            return apiError(
                'page-too-large',
                `Page ${error.page} is ${error.width} x ${error.height} pt. This server checks pages up to US Legal (8.5 x 14 in), in either orientation.`,
            );
        }
        if (error instanceof PdfError) {
            return apiError('unreadable-pdf', error.message);
        }
        console.error('caveats: POST /v1/check failed', error);
        return apiError('internal', 'The server could not check this file. The cause is in the server log.');
    }
}
