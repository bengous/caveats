import { afterAll, expect, setDefaultTimeout, test } from 'bun:test';
import type { Page } from 'playwright-core';
import { LANGS } from '../../src/messages.ts';
import {
    alertAfterChoosing,
    chooseFile,
    chooseOversizedFile,
    DESKTOP,
    openLab,
    openPage,
    PHONE,
    showResult,
} from './lab.ts';
import { RESULT_STATES } from './pages.ts';

setDefaultTimeout(30_000);

const lab = await openLab();

afterAll(async () => {
    await lab.close();
});

const view = (page: Page): Promise<string | undefined> =>
    page.evaluate(() => document.querySelector<HTMLElement>('.sheets')?.dataset['view']);

const statusIsShown = (page: Page): Promise<boolean> =>
    page.locator('[role="status"]').evaluate((element) => element.checkVisibility());

for (const lang of LANGS) {
    for (const state of RESULT_STATES) {
        test(`focus lands on the verdict once the ${state} result is in, in ${lang}`, async () => {
            const page = await openPage(lab, { lang });
            await showResult(page, state);

            expect(await page.evaluate(() => document.activeElement?.matches('.verdict'))).toBe(true);
        });
    }
}

test('the status region is visible on the intake page', async () => {
    expect(await statusIsShown(await openPage(lab))).toBe(true);
});

for (const state of RESULT_STATES) {
    test(`the status region is visible on the ${state} result`, async () => {
        const page = await openPage(lab);
        await showResult(page, state);

        expect(await statusIsShown(page)).toBe(true);
    });
}

test('switching language on a result says that the check runs again', async () => {
    const page = await openPage(lab);
    await showResult(page, 'flagged');
    const release = Promise.withResolvers<void>();
    await page.route('**/api/check*', async (route) => {
        await release.promise;
        await route.continue();
    });
    await page.getByRole('button', { name: 'Français' }).click();
    const announced = await page
        .locator('[role="status"]')
        .evaluate((element) => element.checkVisibility() && element.textContent.trim() !== '');
    release.resolve();

    expect(announced).toBe(true);
});

test('the selected view stands out from the page under forced colors', async () => {
    const page = await openPage(lab, { forcedColors: true });
    await showResult(page, 'flagged');
    const standsOut = await page.locator('.view-switch label:has(input:checked)').evaluate((element) => {
        const canvas = getComputedStyle(document.body).backgroundColor;
        return getComputedStyle(element).backgroundColor !== canvas;
    });

    expect(standsOut).toBe(true);
});

test('the lit layer does not veil the page under forced colors', async () => {
    const page = await openPage(lab, { forcedColors: true });
    await showResult(page, 'flagged');
    const veiled = await page.evaluate(() => {
        const style = getComputedStyle(document.querySelector('.uv-layer') ?? document.body, '::before');
        return style.display !== 'none' && style.backgroundColor !== 'rgba(0, 0, 0, 0)';
    });

    expect(veiled).toBe(false);
});

for (const forcedColors of [false, true]) {
    test(`the drop zone shows keyboard focus with forced colors ${forcedColors ? 'on' : 'off'}`, async () => {
        const page = await openPage(lab, { forcedColors });
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        const outline = await page.evaluate(() => {
            const style = getComputedStyle(document.querySelector('.dropzone') ?? document.body);
            return {
                onInput: document.activeElement?.matches('.dropzone input') ?? false,
                shown: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2,
            };
        });

        expect(outline).toEqual({ onInput: true, shown: true });
    });
}

const TEXT_SPACING = `
    * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
    p { margin-bottom: 2em !important; }
`;

for (const lang of LANGS) {
    for (const state of ['intake', ...RESULT_STATES] as const) {
        test(`the ${state} page does not scroll sideways at 320 px with text spacing, in ${lang}`, async () => {
            const page = await openPage(lab, { lang, viewport: PHONE, userStyles: true });
            if (state !== 'intake') {
                await showResult(page, state);
            }
            await page.addStyleTag({ content: TEXT_SPACING });
            const overflow = await page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            );

            expect(overflow).toBeLessThanOrEqual(0);
        });
    }
}

test('a view chosen before the first-look timer fires is kept', async () => {
    const page = await openPage(lab, { reducedMotion: false });
    await chooseFile(page, 'flagged');
    await page.locator('.view-switch label').first().click();
    await page.waitForTimeout(1200);

    expect(await view(page)).toBe('person');
});

for (const viewport of [DESKTOP, { width: 1440, height: 900 }]) {
    test(`the CV page is at least 480 px wide at ${viewport.width}x${viewport.height}`, async () => {
        const page = await openPage(lab, { viewport });
        await showResult(page, 'flagged');
        const box = await page.locator('.sheet').boundingBox();

        expect(box?.width ?? 0).toBeGreaterThanOrEqual(480);
    });
}

test('the lit markers are out of the tab order', async () => {
    const page = await openPage(lab);
    await showResult(page, 'flagged');
    const tabIndexes = await page.locator('a.glow').evaluateAll((marks) => marks.map((mark) => mark.tabIndex));

    expect(tabIndexes).toEqual([-1]);
});

test('a file over the size limit is announced as an alert and dropped from the input', async () => {
    const page = await openPage(lab);
    await chooseOversizedFile(page);
    const message = await page.locator('[role="alert"]').textContent();
    const chosen = await page.evaluate(
        () => document.querySelector<HTMLInputElement>('.dropzone input')?.files?.length,
    );

    expect(message).toContain('20 MB');
    expect(chosen).toBe(0);
});

test('an unreachable server is announced as an alert', async () => {
    const page = await openPage(lab);
    await page.route('**/api/check*', (route) => route.abort());

    expect(await alertAfterChoosing(page, 'flagged')).toContain('did not answer');
});

test('the drop zone states the size limit', async () => {
    const page = await openPage(lab);

    expect(await page.locator('.dropzone').textContent()).toContain('20 MB');
});

test('the page and a result load without a Content-Security-Policy violation', async () => {
    const page = await openPage(lab);
    const violations: string[] = [];
    page.on('console', (message) => {
        if (message.text().includes('Content Security Policy')) {
            violations.push(message.text());
        }
    });
    await page.reload();
    await showResult(page, 'flagged');

    expect(violations).toEqual([]);
});

test('an answer that is not a result fragment shows as a problem, never as markup', async () => {
    const page = await openPage(lab);
    await page.route('**/api/check*', (route) =>
        route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":{"code":"forbidden-host"}}' }),
    );

    expect(await alertAfterChoosing(page, 'flagged')).toContain('The server refused the request');
    expect(await page.locator('.result-slot').innerHTML()).toBe('');
});
