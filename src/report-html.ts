// Server-rendered result fragment for the web UI, in one language. Hidden text
// is written by the candidate: every dynamic string goes through Bun.escapeHTML.
import type { IntentJudgments } from './judge.ts';
import type { Lang, Messages } from './messages.ts';
import { INTENT_KEYS, MESSAGES } from './messages.ts';
import type { Rect } from './pdfium.ts';
import type { RenderedPage } from './render.ts';
import type { CvReport } from './report.ts';
import type { HiddenSpan } from './scan.ts';

const escape = Bun.escapeHTML;

const percent = (value: number): string => `${(value * 100).toFixed(3)}%`;

export interface ReportContext {
    readonly lang: Lang;
}

type ReviewReport = Extract<CvReport, { verdict: 'human-review' }>;

export function renderReportHtml(report: CvReport, pages: readonly RenderedPage[], context: ReportContext): string {
    const messages = MESSAGES[context.lang];
    const hidden = report.verdict === 'human-review';
    const spans = hidden ? report.hiddenSpans : [];
    const verdict = hidden
        ? `<h1 class="verdict" tabindex="-1">${messages.reviewTitle}</h1>
    <p class="verdict-note">${messages.reviewNote(report.hiddenSpans.length)}</p>`
        : `<h1 class="verdict" tabindex="-1">${messages.cleanTitle}</h1>
    <p class="verdict-note">${messages.cleanNote}</p>`;
    return `<section class="result" data-verdict="${report.verdict}">
  <div class="verdict-block">
    ${verdict}
  </div>
  <div class="viewer">
    ${hidden ? renderViewSwitch(messages) : ''}
    <div class="sheets" data-view="person">
      ${pages.map((page, index) => renderSheet(page, index + 1, { spans, messages })).join('\n')}
    </div>
  </div>
  ${hidden ? renderDetails(report, messages, { multiPage: pages.length > 1 }) : ''}
</section>`;
}

function renderViewSwitch(messages: Messages): string {
    return `<fieldset class="view-switch">
      <legend class="visually-hidden">${messages.viewLabel}</legend>
      <label><input type="radio" name="view" value="person" checked> ${messages.viewPerson}</label>
      <label><input type="radio" name="view" value="machine"> ${messages.viewMachine}</label>
    </fieldset>`;
}

interface SheetContext {
    readonly spans: readonly HiddenSpan[];
    readonly messages: Messages;
}

function renderSheet(page: RenderedPage, pageNumber: number, { spans, messages }: SheetContext): string {
    const marks = spans.flatMap((span, spanIndex) =>
        span.page === pageNumber
            ? span.boxes
                  .filter((box) => isOnPage(page, box))
                  .map((box, line) => renderMark(page, box, { passage: spanIndex + 1, numbered: line === 0 }))
            : [],
    );
    const image = `data:image/bmp;base64,${Buffer.from(page.bmp).toString('base64')}`;
    const alt = messages.pageAlt(pageNumber, spans.filter((span) => span.page === pageNumber).length);
    return `<figure class="sheet" style="--ratio: ${page.width} / ${page.height}">
        <img src="${image}" alt="${alt}">
        <div class="uv-layer" aria-hidden="true">${marks.join('')}</div>
        <div class="lamp" aria-hidden="true"></div>
      </figure>`;
}

function isOnPage(page: RenderedPage, box: Rect): boolean {
    return box.right > 0 && box.left < page.width && box.top > 0 && box.bottom < page.height;
}

interface MarkLabel {
    readonly passage: number;
    /** Only the first line of a passage carries its number. */
    readonly numbered: boolean;
}

function renderMark(page: RenderedPage, box: Rect, { passage, numbered }: MarkLabel): string {
    const left = Math.max(0, box.left) / page.width;
    const top = (page.height - Math.min(page.height, box.top)) / page.height;
    const width = (Math.min(page.width, box.right) - Math.max(0, box.left)) / page.width;
    const height = (box.top - box.bottom) / page.height;
    const style = `left:${percent(left)};top:${percent(top)};width:${percent(width)};height:${percent(height)}`;
    const number = numbered ? `<span class="number">${passage}</span>` : '';
    return `<a class="glow" href="#passage-${passage}" tabindex="-1" style="${style}">${number}</a>`;
}

interface DetailsContext {
    readonly multiPage: boolean;
}

function renderDetails(report: ReviewReport, messages: Messages, { multiPage }: DetailsContext): string {
    const passages = report.hiddenSpans.map((span, index) => {
        const reasons = span.reasons.map((reason) => messages.reasons[reason]).join(', ');
        return `<li id="passage-${index + 1}">
        <p class="where">${escape(messages.where(multiPage ? span.page : null, reasons))}</p>
        <blockquote class="machine-text" lang="">${escape(span.text)}</blockquote>
      </li>`;
    });
    const intent =
        report.intent.status === 'judged'
            ? renderIntent(report.intent.probabilities, messages)
            : `<p class="intent-note">${report.intent.reason === 'disabled' ? messages.jevOff('<code>TYPESAFE_API_KEY</code>') : messages.jevFailed}</p>`;
    return `<div class="details">
    <h2 class="visually-hidden">${messages.passagesTitle}</h2>
    <ol class="passages" role="list">${passages.join('\n')}</ol>
    ${intent}
  </div>`;
}

function renderIntent(intent: IntentJudgments, messages: Messages): string {
    const rows = INTENT_KEYS.map((key) => {
        const value = intent[key];
        return `<div class="intent-row">
        <dt>${messages.intent[key]}</dt>
        <dd><span class="bar"><span style="width:${percent(value)}"></span></span><span class="value">${Math.round(value * 100)}%</span></dd>
      </div>`;
    });
    return `<h2 class="intent-title">${messages.intentTitle}</h2>
    <p class="intent-note">${messages.intentNote}</p>
    <dl class="intent">${rows.join('\n')}</dl>`;
}

export function renderErrorHtml(message: string, lang: Lang): string {
    const messages = MESSAGES[lang];
    return `<section class="result" data-verdict="error">
  <div class="verdict-block">
    <h1 class="verdict" tabindex="-1">${messages.errorTitle}</h1>
    <p class="verdict-note">${escape(messages.errorReason(message))}</p>
    <p class="verdict-note">${messages.errorNext}</p>
  </div>
</section>`;
}
