import { afterAll, expect, spyOn, test } from 'bun:test';
import type { RuleConfig } from 'html-validate/node';
import { HtmlValidate } from 'html-validate/node';
import type { Lang } from '../src/messages.ts';
import { LANGS } from '../src/messages.ts';
import type { JudgeKind, ResultState } from './a11y/pages.ts';
import { RESULT_STATES, startTestServer, uploadFor } from './a11y/pages.ts';

const consoleError = spyOn(console, 'error').mockImplementation(() => {});

const servers = {
    answering: startTestServer('answering'),
    off: startTestServer('off'),
    failing: startTestServer('failing'),
} as const satisfies Record<JudgeKind, ReturnType<typeof startTestServer>>;

afterAll(async () => {
    consoleError.mockRestore();
    await Promise.all(Object.values(servers).map((server) => server.stop(true)));
});

const STRUCTURE_RULES = {
    'heading-level': 'error',
    'input-missing-label': 'error',
    'no-missing-references': 'error',
    'attribute-allowed-values': 'error',
    'element-permitted-content': 'error',
    'element-required-content': 'error',
    'element-permitted-parent': 'error',
    'element-required-attributes': 'error',
    'no-dup-attr': 'error',
    'valid-id': 'error',
} as const;

const EXPLICIT_LIST_ROLE = {
    'no-redundant-role': ['error', { exclude: ['list'] }],
    'prefer-native-element': ['error', { exclude: ['list'] }],
} satisfies RuleConfig;

const FILLED_BY_SCRIPT = { 'empty-heading': 'off', 'input-missing-label': 'off' } as const;

const validator = new HtmlValidate({
    extends: ['html-validate:a11y'],
    rules: { ...STRUCTURE_RULES, ...EXPLICIT_LIST_ROLE },
});
const shell = new HtmlValidate({
    extends: ['html-validate:a11y'],
    rules: { ...STRUCTURE_RULES, ...FILLED_BY_SCRIPT },
});

async function problems(checker: HtmlValidate, html: string): Promise<string[]> {
    const report = await checker.validateString(html);
    return report.results.flatMap((result) =>
        result.messages.map((message) => `${message.ruleId} line ${message.line}: ${message.message}`),
    );
}

async function resultFragment(judge: JudgeKind, state: ResultState, lang: Lang): Promise<string> {
    const { bytes } = await uploadFor(state);
    const response = await fetch(new URL(`/api/check?lang=${lang}`, servers[judge].url), {
        method: 'POST',
        body: bytes,
        headers: { 'content-type': 'application/pdf' },
    });
    return response.text();
}

test('the page shell has no accessibility problem a linter can see', async () => {
    const html = await Bun.file(`${import.meta.dir}/../ui/index.html`).text();

    expect(await problems(shell, html)).toEqual([]);
});

for (const lang of LANGS) {
    for (const state of RESULT_STATES) {
        test(`the ${state} result in ${lang} has no accessibility problem a linter can see`, async () => {
            expect(await problems(validator, await resultFragment('answering', state, lang))).toEqual([]);
        });
    }

    for (const judge of ['off', 'failing'] as const) {
        test(`the flagged result in ${lang} with the judge ${judge} has no accessibility problem a linter can see`, async () => {
            expect(await problems(validator, await resultFragment(judge, 'flagged', lang))).toEqual([]);
        });
    }
}
