import { expect, spyOn, test } from 'bun:test';
import { formatReport } from '../src/format.ts';
import type { IntentEvidence, IntentJudge, Judgment } from '../src/judge.ts';
import { IntentJudgmentsSchema } from '../src/judge.ts';
import { checkCv } from '../src/report.ts';
import { DEFAULT_MAX_PAGES } from '../src/limits.ts';

const fixture = (name: string): Promise<Uint8Array> => Bun.file(`${import.meta.dir}/fixtures/${name}.pdf`).bytes();

const JUDGMENT: Judgment = {
    model: 'jev-test',
    probabilities: IntentJudgmentsSchema.parse({
        instructsAi: 0.02,
        keywordStuffing: 0.97,
        claimsAbsentFromVisible: 0.91,
        selfAwareWink: 0.03,
        templateArtifact: 0.04,
    }),
};

const failingJudge: IntentJudge = () => Promise.reject(new Error('TypeSafe is down'));

function recordingJudge() {
    const calls: IntentEvidence[] = [];
    const judge: IntentJudge = (evidence) => {
        calls.push(evidence);
        return Promise.resolve(JUDGMENT);
    };
    return { judge, calls };
}

test('a clean CV is not sent to the judge', async () => {
    const { judge, calls } = recordingJudge();

    const report = await checkCv(await fixture('clean'), judge, DEFAULT_MAX_PAGES);

    expect(report).toEqual({ verdict: 'clean' });
    expect(calls).toEqual([]);
});

test('hidden text goes to human review with the judge seeing hidden and visible text apart', async () => {
    const { judge, calls } = recordingJudge();

    const report = await checkCv(await fixture('white-text'), judge, DEFAULT_MAX_PAGES);

    expect(report).toMatchObject({ verdict: 'human-review', intent: { status: 'judged', ...JUDGMENT } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.hiddenText).toBe('Kubernetes, Rust, AWS, machine learning, 10 years of Python');
    expect(calls[0]?.visibleText).toContain('TypeScript, Node.js');
    expect(calls[0]?.visibleText).not.toContain('Kubernetes');
});

test('without a judge the report still asks for human review', async () => {
    const report = await checkCv(await fixture('tiny-text'), null, DEFAULT_MAX_PAGES);

    expect(report).toMatchObject({ verdict: 'human-review', intent: { status: 'not-judged', reason: 'disabled' } });
    expect(formatReport(report, 'cv.pdf')).toContain('Intent not judged: set TYPESAFE_API_KEY');
});

test('a judge that fails leaves the verdict to the hidden text and logs why', async () => {
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
        const report = await checkCv(await fixture('white-text'), failingJudge, DEFAULT_MAX_PAGES);

        expect(report).toMatchObject({
            verdict: 'human-review',
            intent: { status: 'not-judged', reason: 'judge-failed' },
        });
        expect(formatReport(report, 'cv.pdf')).toContain('Intent not judged: Jev could not be reached.');
        expect(log).toHaveBeenCalledTimes(1);
        expect(String(log.mock.calls[0]?.[1])).toContain('TypeSafe is down');
    } finally {
        log.mockRestore();
    }
});

test('the text report states the verdict, the model and each judgment', async () => {
    const { judge } = recordingJudge();

    const text = formatReport(await checkCv(await fixture('white-text'), judge, DEFAULT_MAX_PAGES), 'cv.pdf');

    expect(text).toContain('cv.pdf: HUMAN REVIEW REQUIRED');
    expect(text).toContain('no contrast with the background');
    expect(text).toContain('probability of yes (jev-test)');
    expect(text).toContain(' 97%  keyword stuffing');
});
