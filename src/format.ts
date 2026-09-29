import { INTENT_KEYS, MESSAGES } from './messages.ts';
import type { CvReport } from './report.ts';

const PREVIEW_CHARS = 200;
const { reasons: REASON_LABELS, intent: INTENT_LABELS } = MESSAGES.en;

export function formatReport(report: CvReport, source: string): string {
    if (report.verdict === 'clean') {
        return `${source}: clean, no hidden text found.`;
    }
    const lines = [
        `${source}: HUMAN REVIEW REQUIRED`,
        `${report.hiddenSpans.length} hidden text span(s). This tool never rejects a candidate: a person decides.`,
        '',
    ];
    for (const span of report.hiddenSpans) {
        const reasons = span.reasons.map((reason) => REASON_LABELS[reason]).join(', ');
        const preview = span.text.length > PREVIEW_CHARS ? `${span.text.slice(0, PREVIEW_CHARS)}…` : span.text;
        lines.push(`[page ${span.page}] ${reasons}`, `  "${preview}"`, '');
    }
    const { intent } = report;
    if (intent.status === 'judged') {
        lines.push(`Intent, probability of yes (${intent.model}):`);
        for (const key of INTENT_KEYS) {
            const percent = `${Math.round(intent.probabilities[key] * 100)}%`.padStart(4);
            lines.push(`  ${percent}  ${INTENT_LABELS[key]}`);
        }
    } else if (intent.reason === 'disabled') {
        lines.push('Intent not judged: set TYPESAFE_API_KEY to add Jev judgments.');
    } else {
        lines.push('Intent not judged: Jev could not be reached.');
    }
    return lines.join('\n');
}
