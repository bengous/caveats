import type { IntentJudge, Judgment } from '../../src/judge.ts';
import { IntentJudgmentsSchema } from '../../src/judge.ts';
import { startServer } from '../../src/serve.ts';
import { DEFAULT_MAX_PAGES } from '../../src/limits.ts';

const JUDGMENT: Judgment = {
    model: 'stub',
    probabilities: IntentJudgmentsSchema.parse({
        instructsAi: 0.4,
        keywordStuffing: 0.95,
        claimsAbsentFromVisible: 0.99,
        selfAwareWink: 0.2,
        templateArtifact: 0.3,
    }),
};

export type JudgeKind = 'answering' | 'off' | 'failing';

const JUDGES = {
    answering: () => Promise.resolve(JUDGMENT),
    off: null,
    failing: () => Promise.reject(new Error('the judge is down')),
} as const satisfies Record<JudgeKind, IntentJudge | null>;

const LOOPBACK = { kind: 'loopback', token: null, development: false } as const;

/** The answering judge makes the result page show the probability bars, the others show its two notes. */
export const startTestServer = (kind: JudgeKind = 'answering'): ReturnType<typeof startServer> =>
    startServer({ port: 0, maxPages: DEFAULT_MAX_PAGES, judge: JUDGES[kind], exposure: LOOPBACK });

export type ResultState = 'flagged' | 'clean' | 'error';

export interface CvUpload {
    readonly name: string;
    readonly bytes: Uint8Array<ArrayBuffer>;
}

const fixture = async (name: string): Promise<CvUpload> => ({
    name: `${name}.pdf`,
    bytes: await Bun.file(`${import.meta.dir}/../fixtures/${name}.pdf`).bytes(),
});

const NOT_A_PDF: CvUpload = { name: 'notes.pdf', bytes: new TextEncoder().encode('not a pdf') };

export const uploadFor = (state: ResultState): Promise<CvUpload> =>
    state === 'error' ? Promise.resolve(NOT_A_PDF) : fixture(state === 'flagged' ? 'white-text' : 'clean');

export const RESULT_STATES: readonly ResultState[] = ['flagged', 'clean', 'error'];
