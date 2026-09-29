import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import { MAX_PDF_BYTES } from '../../src/limits.ts';
import type { Lang } from '../../src/messages.ts';
import type { JudgeKind, ResultState } from './pages.ts';
import { startTestServer, uploadFor } from './pages.ts';

export interface Lab {
    readonly url: string;
    readonly browser: Browser;
    readonly close: () => Promise<void>;
}

export async function openLab(judge: JudgeKind = 'answering'): Promise<Lab> {
    const server = startTestServer(judge);
    const browser = await chromium.launch();
    return {
        url: server.url.href,
        browser,
        close: async () => {
            await browser.close();
            await server.stop(true);
        },
    };
}

export interface Viewport {
    readonly width: number;
    readonly height: number;
}

export const DESKTOP: Viewport = { width: 1280, height: 720 };
export const PHONE: Viewport = { width: 320, height: 640 };

export interface Setup {
    readonly lang: Lang;
    readonly reducedMotion: boolean;
    readonly forcedColors: boolean;
    readonly viewport: Viewport;
    /** The test adds a user stylesheet: the page's Content-Security-Policy does not govern those. */
    readonly userStyles: boolean;
}

const DEFAULT_SETUP: Setup = {
    lang: 'en',
    reducedMotion: true,
    forcedColors: false,
    viewport: DESKTOP,
    userStyles: false,
};

export async function openPage(lab: Lab, overrides: Partial<Setup> = {}): Promise<Page> {
    const setup = { ...DEFAULT_SETUP, ...overrides };
    const context = await lab.browser.newContext({
        locale: setup.lang === 'fr' ? 'fr-FR' : 'en-US',
        reducedMotion: setup.reducedMotion ? 'reduce' : 'no-preference',
        forcedColors: setup.forcedColors ? 'active' : 'none',
        viewport: setup.viewport,
        bypassCSP: setup.userStyles,
    });
    const page = await context.newPage();
    await page.goto(lab.url);
    return page;
}

export async function chooseFile(page: Page, state: ResultState): Promise<void> {
    const { name, bytes } = await uploadFor(state);
    await page
        .locator('.dropzone input')
        .setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
}

export async function alertAfterChoosing(page: Page, state: ResultState): Promise<string | null> {
    await chooseFile(page, state);
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent !== '');
    return page.locator('[role="alert"]').textContent();
}

export async function chooseOversizedFile(page: Page): Promise<void> {
    await page
        .locator('.dropzone input')
        .setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(MAX_PDF_BYTES + 1) });
}

export async function showResult(page: Page, state: ResultState): Promise<void> {
    await chooseFile(page, state);
    await page.waitForFunction(() => document.body.dataset['state'] === 'result');
    await page.waitForFunction(() => {
        const sheets = document.querySelector<HTMLElement>('.sheets');
        return document.querySelector('.view-switch') === null || sheets?.dataset['view'] === 'machine';
    });
}
