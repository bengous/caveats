import * as z from 'zod';
import type { IntentJudge } from './judge.ts';
import { IntentJudgmentsSchema } from './judge.ts';
import type { PdfScan } from './scan.ts';
import { HiddenSpanSchema, scanPdf } from './scan.ts';

const IntentSchema = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('judged'),
        model: z.string().min(1).describe('The Jev model TypeSafe reports for the request.'),
        probabilities: IntentJudgmentsSchema,
    }),
    z.object({
        status: z.literal('not-judged'),
        reason: z
            .enum(['disabled', 'judge-failed'])
            .describe(
                '`disabled`: the server runs without TYPESAFE_API_KEY. `judge-failed`: the call to Jev failed (outage, timeout, or an answer outside its schema).',
            ),
    }),
]);
export type Intent = z.infer<typeof IntentSchema>;

export const CvReportSchema = z.discriminatedUnion('verdict', [
    z.object({ verdict: z.literal('clean') }),
    z.object({
        verdict: z.literal('human-review'),
        hiddenSpans: z.array(HiddenSpanSchema).min(1),
        intent: IntentSchema,
    }),
]);
export type CvReport = z.infer<typeof CvReportSchema>;
export type Verdict = CvReport['verdict'];

export async function checkCv(pdf: Uint8Array, judge: IntentJudge | null, maxPages: number): Promise<CvReport> {
    const scan = await scanPdf(pdf, maxPages);
    if (scan.hiddenSpans.length === 0) {
        return { verdict: 'clean' };
    }
    return { verdict: 'human-review', hiddenSpans: scan.hiddenSpans, intent: await judgeIntent(scan, judge) };
}

async function judgeIntent(scan: PdfScan, judge: IntentJudge | null): Promise<Intent> {
    if (judge === null) {
        return { status: 'not-judged', reason: 'disabled' };
    }
    try {
        const { model, probabilities } = await judge({
            hiddenText: scan.hiddenSpans.map((span) => span.text).join('\n'),
            visibleText: scan.visibleText,
        });
        return { status: 'judged', model, probabilities };
    } catch (error) {
        // The verdict never depends on Jev: an outage leaves the CV to a person, without intent.
        console.error('caveats: Jev could not judge the hidden text; the report goes out without intent.', error);
        return { status: 'not-judged', reason: 'judge-failed' };
    }
}
