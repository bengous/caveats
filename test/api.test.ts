import { afterAll, expect, spyOn, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { JSON_SCHEMAS } from '../schema/build.ts';
import { ApiErrorSchema, BearerTokenSchema } from '../src/api.ts';
import type { IntentJudge } from '../src/judge.ts';
import { IntentJudgmentsSchema } from '../src/judge.ts';
import { CvReportSchema } from '../src/report.ts';
import { startServer } from '../src/serve.ts';
import { DEFAULT_MAX_PAGES } from '../src/limits.ts';

const TOKEN = BearerTokenSchema.parse('test-token-0123456789abcdef0123456789');

const fakeJudge: IntentJudge = () =>
    Promise.resolve({
        model: 'jev-test',
        probabilities: IntentJudgmentsSchema.parse({
            instructsAi: 0.1,
            keywordStuffing: 0.9,
            claimsAbsentFromVisible: 0.8,
            selfAwareWink: 0.05,
            templateArtifact: 0.02,
        }),
    });

const local = startServer({
    port: 0,
    maxPages: DEFAULT_MAX_PAGES,
    judge: null,
    exposure: { kind: 'loopback', token: null, development: false },
});
const networked = startServer({
    port: 0,
    maxPages: 2,
    judge: fakeJudge,
    exposure: { kind: 'network', hostname: '127.0.0.1', token: TOKEN },
});

afterAll(async () => {
    await Promise.all([local.stop(true), networked.stop(true)]);
});

const fixture = (name: string): Promise<Uint8Array<ArrayBuffer>> =>
    Bun.file(`${import.meta.dir}/fixtures/${name}.pdf`).bytes();

const post = (server: URL, body: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}): Promise<Response> =>
    fetch(new URL('/v1/check', server), {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/pdf', ...headers },
    });

const errorCode = async (response: Response): Promise<string> => ApiErrorSchema.parse(await response.json()).error.code;

test('a CV with hidden text comes back as JSON that parses with the published schema', async () => {
    const response = await post(local.url, await fixture('white-text'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toStartWith('application/json');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const report = CvReportSchema.parse(await response.json());
    expect(report).toMatchObject({
        verdict: 'human-review',
        hiddenSpans: [
            { page: 1, text: 'Kubernetes, Rust, AWS, machine learning, 10 years of Python', reasons: ['no-contrast'] },
        ],
        intent: { status: 'not-judged', reason: 'disabled' },
    });
});

test('a clean CV is its verdict alone', async () => {
    const response = await post(local.url, await fixture('clean'));

    expect(CvReportSchema.parse(await response.json())).toEqual({ verdict: 'clean' });
});

test('hidden markup stays a plain string inside the JSON body', async () => {
    const response = await post(local.url, await fixture('markup-text'));
    const report = CvReportSchema.parse(await response.json());

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(report.verdict === 'human-review' ? report.hiddenSpans[0]?.text : null).toBe('<img src=x onerror=alert(1)>');
});

test('a judge that fails still returns the verdict, marked as not judged', async () => {
    const log = spyOn(console, 'error').mockImplementation(() => {});
    const failing = startServer({
        port: 0,
        maxPages: DEFAULT_MAX_PAGES,
        judge: () => Promise.reject(new Error('TypeSafe is down')),
        exposure: { kind: 'loopback', token: null, development: false },
    });
    try {
        const response = await post(failing.url, await fixture('white-text'));

        expect(response.status).toBe(200);
        expect(CvReportSchema.parse(await response.json())).toMatchObject({
            verdict: 'human-review',
            intent: { status: 'not-judged', reason: 'judge-failed' },
        });
    } finally {
        log.mockRestore();
        await failing.stop(true);
    }
});

test.each([
    { name: 'an empty body', body: new Uint8Array(0), contentType: 'application/pdf', status: 400, code: 'empty-body' },
    {
        name: 'a body that is not a PDF',
        body: new TextEncoder().encode('not a pdf'),
        contentType: 'application/pdf',
        status: 422,
        code: 'unreadable-pdf',
    },
    {
        name: 'a form post',
        body: new TextEncoder().encode('a=1'),
        contentType: 'application/x-www-form-urlencoded',
        status: 415,
        code: 'unsupported-media-type',
    },
])('$name gets a JSON error', async ({ body, contentType, status, code }) => {
    const response = await post(local.url, body, { 'content-type': contentType });

    expect(response.status).toBe(status);
    expect(await errorCode(response)).toBe(code);
});

test('a CV over the page limit of the server gets too-many-pages', async () => {
    const pdf = await fixture('two-pages');
    const refused = await post(local.url, pdf);
    const accepted = await post(networked.url, pdf, { authorization: `Bearer ${TOKEN}` });

    expect(refused.status).toBe(422);
    expect(await errorCode(refused)).toBe('too-many-pages');
    expect(accepted.status).toBe(200);
});

test('a page larger than US Legal gets page-too-large, in either orientation', async () => {
    const refused = await post(local.url, await fixture('a3-page'));
    const accepted = await post(local.url, await fixture('us-legal-landscape'));

    expect(refused.status).toBe(422);
    expect(await errorCode(refused)).toBe('page-too-large');
    expect(accepted.status).toBe(200);
});

test('on the network the API needs the bearer token', async () => {
    const pdf = await fixture('white-text');
    const missing = await post(networked.url, pdf);
    const wrong = await post(networked.url, pdf, { authorization: `Bearer ${TOKEN}x` });
    const right = await post(networked.url, pdf, { authorization: `Bearer ${TOKEN}` });

    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toBe('Bearer');
    expect(await errorCode(missing)).toBe('unauthorized');
    expect(wrong.status).toBe(401);
    expect(right.status).toBe(200);
    expect(CvReportSchema.parse(await right.json())).toMatchObject({
        intent: { status: 'judged', model: 'jev-test', probabilities: { keywordStuffing: 0.9 } },
    });
});

test('on the network there is no web UI, and the health check needs no token', async () => {
    const page = await fetch(networked.url);
    const uiCheck = await fetch(new URL('/api/check?lang=en', networked.url), { method: 'POST' });
    const health = await fetch(new URL('/healthz', networked.url));

    expect(page.status).toBe(404);
    expect(uiCheck.status).toBe(404);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
});

const serveCli = async (args: readonly string[], env: Record<string, string>) => {
    const child = Bun.spawn([process.execPath, `${import.meta.dir}/../src/cli.ts`, 'serve', ...args], {
        cwd: tmpdir(),
        env,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 10_000,
    });
    return { exitCode: await child.exited, stderr: await new Response(child.stderr).text() };
};

test('serve refuses to open the network without a token', async () => {
    const { exitCode, stderr } = await serveCli(['--host', '0.0.0.0', '--port', '4361'], {});

    expect(exitCode).toBe(2);
    expect(stderr).toContain('set CAVEATS_API_TOKEN');
});

test('serve refuses a short token and does not print it', async () => {
    const { exitCode, stderr } = await serveCli(['--host', '0.0.0.0', '--port', '4361'], {
        CAVEATS_API_TOKEN: 'short-secret',
    });

    expect(exitCode).toBe(2);
    expect(stderr).toContain('at least 32 characters');
    expect(stderr).not.toContain('short-secret');
});

test('serve keeps hot reload on this machine', async () => {
    const { exitCode, stderr } = await serveCli(['--host', '0.0.0.0', '--port', '4361', '--dev'], {
        CAVEATS_API_TOKEN: TOKEN,
    });

    expect(exitCode).toBe(2);
    expect(stderr).toContain('--dev runs on this machine only');
});

test('the committed JSON Schema files match the Zod schemas', async () => {
    const committed = await Promise.all(
        [...JSON_SCHEMAS.keys()].map((name) => Bun.file(`${import.meta.dir}/../schema/${name}`).json()),
    );

    expect(committed).toEqual([...JSON_SCHEMAS.values()]);
});
