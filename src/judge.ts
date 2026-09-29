import type { TypeSafeClient } from '@typesafe-ai/sdk';
import { noul } from '@typesafe-ai/sdk';
import * as z from 'zod';

const ProbabilitySchema = z.number().min(0).max(1).brand<'Probability'>();
export type Probability = z.infer<typeof ProbabilitySchema>;

export interface IntentEvidence {
    readonly hiddenText: string;
    readonly visibleText: string;
}

const QUESTIONS = {
    instructsAi:
        'Does `hidden_text` address an AI or automated screening system and tell it what to do or conclude about the candidate?',
    keywordStuffing:
        'Is `hidden_text` a list of skills, keywords or qualifications placed there to be matched by a screening system?',
    claimsAbsentFromVisible:
        'Does `hidden_text` claim skills, experience or qualifications that `visible_resume_text` does not mention?',
    selfAwareWink:
        'Does `hidden_text` read as an openly playful or self-aware joke aimed at AI readers, rather than a serious attempt to deceive?',
    templateArtifact: 'Is `hidden_text` leftover template, layout or placeholder content with no persuasive purpose?',
} as const;

type IntentKey = keyof typeof QUESTIONS;

function perQuestion<T>(make: (question: string, key: IntentKey) => T) {
    const ask = (key: IntentKey): T => make(QUESTIONS[key], key);
    return {
        instructsAi: ask('instructsAi'),
        keywordStuffing: ask('keywordStuffing'),
        claimsAbsentFromVisible: ask('claimsAbsentFromVisible'),
        selfAwareWink: ask('selfAwareWink'),
        templateArtifact: ask('templateArtifact'),
    };
}

export const IntentJudgmentsSchema = z
    .object(perQuestion((question) => ProbabilitySchema.describe(question)))
    .describe('Probability of yes for each question Jev answers about the hidden text.');
export type IntentJudgments = z.infer<typeof IntentJudgmentsSchema>;

export interface Judgment {
    readonly model: string;
    readonly probabilities: IntentJudgments;
}

export type IntentJudge = (evidence: IntentEvidence) => Promise<Judgment>;

const INTENT_QUESTIONS = perQuestion((question) => noul(question));

const NoulAnswer = z.object({ type: z.literal('noul'), noul: ProbabilitySchema });

const JevResult = z.object({
    model: z.string().min(1),
    answers: z.object(perQuestion(() => NoulAnswer)),
});

// The SDK times out each attempt, but its retries and a server Retry-After have no total bound.
const JEV_BUDGET_MS = 15_000;
// A full A4 page of 10 pt text holds about 7,500 characters: past that, text adds cost, not evidence.
export const MAX_JEV_TEXT_CHARS = 10_000;

export function createJevJudge(client: TypeSafeClient, budgetMs = JEV_BUDGET_MS): IntentJudge {
    return async ({ hiddenText, visibleText }) => {
        const result = JevResult.safeParse(
            await client.systemOne(
                {
                    state: {
                        hidden_text: hiddenText.slice(0, MAX_JEV_TEXT_CHARS),
                        visible_resume_text: visibleText.slice(0, MAX_JEV_TEXT_CHARS),
                    },
                    questions: INTENT_QUESTIONS,
                },
                { signal: AbortSignal.timeout(budgetMs) },
            ),
        );
        if (!result.success) {
            throw new Error(`Jev answered outside the expected schema: ${z.prettifyError(result.error)}`);
        }
        const { model, answers } = result.data;
        return { model, probabilities: perQuestion((_, key) => answers[key].noul) };
    };
}
