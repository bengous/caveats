import { AxeBuilder } from '@axe-core/playwright';
import { afterAll, expect, setDefaultTimeout, spyOn, test } from 'bun:test';
import type { Page } from 'playwright-core';
import { LANGS } from '../../src/messages.ts';
import { chooseOversizedFile, openLab, openPage, showResult } from './lab.ts';
import { RESULT_STATES } from './pages.ts';

setDefaultTimeout(30_000);
const consoleError = spyOn(console, 'error').mockImplementation(() => {});

const lab = await openLab();
const labWithoutJudge = await openLab('off');
const labWithFailingJudge = await openLab('failing');

afterAll(async () => {
    consoleError.mockRestore();
    await Promise.all([lab.close(), labWithoutJudge.close(), labWithFailingJudge.close()]);
});

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function violations(page: Page): Promise<string[]> {
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    return results.violations.flatMap((violation) =>
        violation.nodes.map((node) => `${violation.id} (${violation.impact ?? 'unrated'}): ${String(node.target)}`),
    );
}

for (const lang of LANGS) {
    test(`the intake page has no axe violation in ${lang}`, async () => {
        const page = await openPage(lab, { lang });

        expect(await violations(page)).toEqual([]);
    });

    test(`the intake page after a file over the size limit has no axe violation in ${lang}`, async () => {
        const page = await openPage(lab, { lang });
        await chooseOversizedFile(page);
        await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent !== '');

        expect(await violations(page)).toEqual([]);
    });

    for (const state of RESULT_STATES) {
        test(`the ${state} result has no axe violation in ${lang}`, async () => {
            const page = await openPage(lab, { lang });
            await showResult(page, state);

            expect(await violations(page)).toEqual([]);
        });
    }

    test(`the flagged result with the judge off has no axe violation in ${lang}`, async () => {
        const page = await openPage(labWithoutJudge, { lang });
        await showResult(page, 'flagged');

        expect(await violations(page)).toEqual([]);
    });

    test(`the flagged result with the judge failing has no axe violation in ${lang}`, async () => {
        const page = await openPage(labWithFailingJudge, { lang });
        await showResult(page, 'flagged');

        expect(await violations(page)).toEqual([]);
    });

    test(`the flagged result in the person view has no axe violation in ${lang}`, async () => {
        const page = await openPage(lab, { lang });
        await showResult(page, 'flagged');
        await page.locator('.view-switch label').first().click();
        await page.waitForFunction(() => document.querySelector<HTMLElement>('.sheets')?.dataset['view'] === 'person');

        expect(await violations(page)).toEqual([]);
    });
}
