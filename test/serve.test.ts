import { afterAll, expect, spyOn, test } from 'bun:test';
import { startServer } from '../src/serve.ts';
import { DEFAULT_MAX_PAGES } from '../src/limits.ts';

const LOOPBACK = { kind: 'loopback', token: null, development: false } as const;

const server = startServer({ port: 0, maxPages: DEFAULT_MAX_PAGES, judge: null, exposure: LOOPBACK });

afterAll(async () => {
    await server.stop(true);
});

const check = (body: Uint8Array<ArrayBuffer>, lang = 'en'): Promise<Response> =>
    fetch(new URL(`/api/check?lang=${lang}`, server.url), {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/pdf' },
    });

const fixture = (name: string): Promise<Uint8Array<ArrayBuffer>> =>
    Bun.file(`${import.meta.dir}/fixtures/${name}.pdf`).bytes();

test('serves the web UI on the loopback interface', async () => {
    const response = await fetch(server.url);

    expect(server.hostname).toBe('127.0.0.1');
    expect(await response.text()).toContain('data-i18n="headline"');
});

test('the page is revalidated on every load', async () => {
    const response = await fetch(server.url);

    expect(response.headers.get('cache-control')).toBe('no-cache');
});

test('the page allows scripts, styles and fonts from this server only', async () => {
    const html = await (await fetch(server.url)).text();

    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'self'");
});

test('a result is never cached nor sniffed', async () => {
    const response = await check(await fixture('white-text'));

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
});

test('a CV with hidden text comes back in English only, with one numbered glow per passage', async () => {
    const response = await check(await fixture('white-text'));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('A person should look at this');
    expect(html).toContain('id="passage-1"');
    expect(html).toContain('href="#passage-1"');
    expect(html.match(/class="number"/gv)).toHaveLength(1);
    expect(html).toContain('Kubernetes, Rust, AWS, machine learning, 10 years of Python');
    expect(html).toContain('Jev is off');
    expect(html).not.toContain('Une personne doit regarder ce CV');
    expect(html).not.toContain('data-lang');
});

test('a CV with hidden text comes back in French only', async () => {
    const response = await check(await fixture('white-text'), 'fr');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Une personne doit regarder ce CV');
    expect(html).toContain('Jev est désactivé');
    expect(html).toContain('Personne');
    expect(html).not.toContain('Page ');
    expect(html).not.toContain('A person should look at this');
    expect(html).not.toContain('Jev is off');
});

test('the page number shows only when the CV has several pages', async () => {
    const html = await (await check(await fixture('white-text'))).text();

    expect(html).not.toContain('Page 1');
});

test('an unknown or missing language is a 400', async () => {
    const pdf = await fixture('clean');
    const unknown = await check(pdf, 'de');
    const missing = await fetch(new URL('/api/check', server.url), { method: 'POST', body: pdf });

    expect(unknown.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(await unknown.text()).toContain('en, fr');
});

test('an empty file gets a readable error in the chosen language', async () => {
    const response = await check(new Uint8Array(0), 'fr');

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Le fichier est vide.');
});

test('hidden text is escaped before it reaches the page', async () => {
    const response = await check(await fixture('markup-text'));
    const html = await response.text();

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
});

test('a file that is not a PDF gets a readable error', async () => {
    const response = await check(new TextEncoder().encode('not a pdf'));

    expect(response.status).toBe(422);
    expect(await response.text()).toContain('Reason: the file is not a PDF, or it is corrupted');
});

test('the reason an unreadable file gets is in the chosen language', async () => {
    const response = await check(new TextEncoder().encode('not a PDF'), 'fr');
    const html = await response.text();

    expect(response.status).toBe(422);
    expect(html).toContain('Raison\u00A0: le fichier n’est pas un PDF, ou il est corrompu');
    expect(html).not.toContain('not a PDF');
});

test('a CV over the page limit gets a readable error in the chosen language', async () => {
    const pdf = await fixture('two-pages');
    const english = await check(pdf);
    const french = await check(pdf, 'fr');

    expect(english.status).toBe(422);
    expect(await english.text()).toContain('Reason: the PDF has 2 pages, and this server checks 1 at most');
    expect(await french.text()).toContain('Raison : le PDF a 2 pages, et ce serveur en vérifie 1 au plus');
});

test('a page larger than CV paper gets a readable error in the chosen language', async () => {
    const pdf = await fixture('a3-page');
    const english = await check(pdf);
    const french = await check(pdf, 'fr');

    expect(english.status).toBe(422);
    expect(await english.text()).toContain(
        'Reason: page 1 is larger than the paper a CV uses (A4, US Letter, US Legal)',
    );
    expect(await french.text()).toContain('Raison : la page 1 dépasse le papier d’un CV (A4, US Letter, US Legal)');
});

test('a judge that fails still shows the passages and says Jev could not be reached', async () => {
    const log = spyOn(console, 'error').mockImplementation(() => {});
    const failing = startServer({
        port: 0,
        maxPages: DEFAULT_MAX_PAGES,
        judge: () => Promise.reject(new Error('TypeSafe is down')),
        exposure: LOOPBACK,
    });
    try {
        const response = await fetch(new URL('/api/check?lang=en', failing.url), {
            method: 'POST',
            body: await fixture('white-text'),
            headers: { 'content-type': 'application/pdf' },
        });
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(html).toContain('A person should look at this');
        expect(html).toContain('Jev could not be reached');
        expect(html).not.toContain('Jev is off');
    } finally {
        log.mockRestore();
        await failing.stop(true);
    }
});

test('a cross-site form post without the PDF content type gets no check', async () => {
    const response = await fetch(new URL('/api/check?lang=en', server.url), {
        method: 'POST',
        body: await fixture('white-text'),
        headers: { 'content-type': 'text/plain' },
    });

    expect(response.status).toBe(415);
});

test('a request addressed to another host name is refused: DNS rebinding', async () => {
    const pdf = await fixture('white-text');
    const rebound = (path: string): Promise<Response> =>
        fetch(new URL(path, server.url), {
            method: 'POST',
            body: pdf,
            headers: { 'content-type': 'application/pdf', host: `attacker.example:${server.url.port}` },
        });

    expect((await rebound('/api/check?lang=en')).status).toBe(403);
    expect((await rebound('/v1/check')).status).toBe(403);
});

test('the page image says how many hidden passages the page holds, in both languages', async () => {
    const english = await (await check(await fixture('white-text'))).text();
    const french = await (await check(await fixture('white-text'), 'fr')).text();
    const clean = await (await check(await fixture('clean'))).text();

    expect(english).toContain('alt="CV, page 1, 1 hidden passage"');
    expect(french).toContain('alt="CV, page 1, 1 passage caché"');
    expect(clean).toContain('alt="CV, page 1"');
});

test('the passage list keeps its list role for screen readers that drop it with list-style none', async () => {
    const html = await (await check(await fixture('white-text'))).text();

    expect(html).toContain('<ol class="passages" role="list">');
});
