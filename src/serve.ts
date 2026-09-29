import type { Server } from 'bun';
import * as z from 'zod';
import page from '../ui/index.html';
import type { ApiContext, BearerToken } from './api.ts';
import { apiError, handleCheckV1, isPdf } from './api.ts';
import type { IntentJudge } from './judge.ts';
import { MAX_PDF_BYTES } from './limits.ts';
import { PdfError } from './pdfium.ts';
import { renderPages } from './render.ts';
import { LANGS, MESSAGES } from './messages.ts';
import { renderErrorHtml, renderReportHtml } from './report-html.ts';
import { checkCv } from './report.ts';
import { PageTooLargeError, TooManyPagesError } from './scan.ts';

const PAGE_IMAGE_SCALE = 1.5;
const HTML = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
};
const LangSchema = z.enum(LANGS);
const HEALTHY = Response.json({ status: 'ok' });

/**
 * `loopback` serves the web UI and the API to this machine. `network` serves the
 * API only, behind the token: the page cannot hold a secret, and without one
 * anyone who reaches the port spends the TypeSafe key.
 */
export type Exposure =
    | { readonly kind: 'loopback'; readonly token: BearerToken | null; readonly development: boolean }
    | { readonly kind: 'network'; readonly hostname: string; readonly token: BearerToken };

export interface ServerOptions {
    readonly port: number;
    readonly judge: IntentJudge | null;
    readonly exposure: Exposure;
    readonly maxPages: number;
}

async function handleCheck(request: Request, judge: IntentJudge | null, maxPages: number): Promise<Response> {
    const parsed = LangSchema.safeParse(new URL(request.url).searchParams.get('lang'));
    if (!parsed.success) {
        return new Response(`lang must be one of: ${LANGS.join(', ')}`, { status: 400 });
    }
    const lang = parsed.data;
    if (!isPdf(request)) {
        return new Response('Content-Type must be application/pdf', { status: 415 });
    }
    const pdf = new Uint8Array(await request.arrayBuffer());
    if (pdf.length === 0) {
        return new Response(renderErrorHtml(MESSAGES[lang].emptyFile, lang), { status: 400, headers: HTML });
    }
    try {
        const report = await checkCv(pdf, judge, maxPages);
        const pages = await renderPages(pdf, PAGE_IMAGE_SCALE);
        return new Response(renderReportHtml(report, pages, { lang }), { headers: HTML });
    } catch (error) {
        const messages = MESSAGES[lang];
        if (error instanceof TooManyPagesError) {
            return new Response(renderErrorHtml(messages.tooManyPages(error.pageCount, error.maxPages), lang), {
                status: 422,
                headers: HTML,
            });
        }
        if (error instanceof PageTooLargeError) {
            return new Response(renderErrorHtml(messages.pageTooLarge(error.page), lang), {
                status: 422,
                headers: HTML,
            });
        }
        if (error instanceof PdfError) {
            return new Response(renderErrorHtml(messages.pdfProblems[error.problem], lang), {
                status: 422,
                headers: HTML,
            });
        }
        console.error('caveats: POST /api/check failed', error);
        return new Response(renderErrorHtml(messages.checkFailed, lang), { status: 500, headers: HTML });
    }
}

/** Refuses a request addressed to another host name: a DNS rebinding page in the browser. */
function onThisMachine(handler: (request: Request) => Promise<Response>) {
    return (request: Request, server: Server<undefined>): Promise<Response> | Response => {
        const host = request.headers.get('host');
        return host === server.url.host || host === `localhost:${server.url.port}`
            ? handler(request)
            : apiError('forbidden-host', 'This server answers requests addressed to 127.0.0.1 or localhost only.');
    };
}

/**
 * `development` bundles the UI on each request and pushes changes to the browser;
 * run it under `bun --hot` so server code reloads too.
 */
export function startServer({ port, judge, exposure, maxPages }: ServerOptions): Server<undefined> {
    const api: ApiContext = { judge, token: exposure.token, maxPages };
    if (exposure.kind === 'network') {
        return Bun.serve({
            hostname: exposure.hostname,
            port,
            maxRequestBodySize: MAX_PDF_BYTES,
            development: false,
            routes: {
                '/healthz': HEALTHY,
                '/v1/check': { POST: (request) => handleCheckV1(request, api) },
            },
        });
    }
    return Bun.serve({
        hostname: '127.0.0.1',
        port,
        maxRequestBodySize: MAX_PDF_BYTES,
        development: exposure.development ? { hmr: true, console: true } : false,
        routes: {
            '/': page,
            '/healthz': HEALTHY,
            '/api/check': { POST: onThisMachine((request) => handleCheck(request, judge, maxPages)) },
            '/v1/check': { POST: onThisMachine((request) => handleCheckV1(request, api)) },
        },
    });
}
