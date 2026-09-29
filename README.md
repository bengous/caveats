# caveATS

Find the text in a CV that a person cannot see, judge what it is for, and hand the CV to a person. It never rejects a candidate.

https://github.com/user-attachments/assets/d4b3a9c5-58a8-4ed6-9606-b76e9090b09d

## Why

AI screeners read text that people do not see: white text, 1 pt text, text outside the page. A study of about 200,000 real resumes found hidden text in about 1% of them, and more than 90% of it was hidden keywords rather than instructions ([Measuring Real-World Prompt Injection Attacks in LLM-based Resume Screening](https://www.usenix.org/system/files/usenixsecurity26-zhang-mohan.pdf), USENIX Security 2026).

Detecting hidden text is the easy part. The failure is what comes next: a flag that rejects the CV with no person looking at it. A hidden keyword list, an instruction to the screener and a leftover template line all trip the same detector, and they do not deserve the same answer. caveATS makes the flag explainable and gives the decision back to a person.

## How it works

1. **Rules.** [PDFium](https://pdfium.googlesource.com/pdfium/) reads every character of the PDF and flags it when it uses the invisible text render mode, when its font is under 2 pt, when it sits outside the page, or when it has no contrast on the page as rendered. The page is rendered like a person sees it, so white text on a dark header is not flagged.
2. **Jev.** When hidden text is found and a TypeSafe API key is set, [Jev](https://docs.typesafe.ai/) answers five yes/no questions about it, as calibrated probabilities: does it tell an AI what to do, is it keyword stuffing, does it claim skills the visible CV does not mention, is it an open joke, is it leftover template content.
3. **Verdict.** `clean` or `human-review`. The verdict depends on the rules only: Jev adds context for the person who decides, and a Jev outage never changes the verdict.

## Quick start

Requires [Bun](https://bun.com) (tested with 1.4.2).

```sh
bun install
bun run build
./dist/caveats cv.pdf
```

`bun run build` makes one self-contained binary, `dist/caveats`, with PDFium and the web UI inside.

```text
cv.pdf: HUMAN REVIEW REQUIRED
1 hidden text span(s). This tool never rejects a candidate: a person decides.

[page 1] no contrast with the background
  "Kubernetes, Rust, AWS, machine learning, 10 years of Python"

Intent, probability of yes (jev-1.13.0):
   36%  tells an AI what to do or conclude
   95%  keyword stuffing
   99%  claims skills the visible CV does not mention
   22%  an open joke rather than an attempt to deceive
   22%  leftover template content
```

Exit codes: `0` clean, `1` human review required, `2` usage or read error. Add `--json` for the same report as the API returns.

To add Jev's judgments, set `TYPESAFE_API_KEY` in the environment or in a `.env` file in the current directory. Without it, the rules still run and the report says the intent was not judged.

## Web UI

```sh
./dist/caveats serve
```

Open <http://127.0.0.1:4321> and drop a PDF. The page first shows the CV as a person sees it, then a lamp sweeps it and the hidden passages light up in place. The UI is in English and French and listens on 127.0.0.1 only.

## API for ATS pipelines

```sh
export CAVEATS_API_TOKEN="$(openssl rand -hex 32)"
./dist/caveats serve --host 0.0.0.0 --port 4321

curl -X POST http://localhost:4321/v1/check \
  -H "Authorization: Bearer $CAVEATS_API_TOKEN" \
  -H "Content-Type: application/pdf" \
  --data-binary @cv.pdf
```

```json
{
    "verdict": "human-review",
    "hiddenSpans": [
        {
            "page": 1,
            "text": "Kubernetes, Rust, AWS, machine learning, 10 years of Python",
            "reasons": ["no-contrast"],
            "boxes": [{ "left": 56.8, "right": 332.6, "bottom": 605.3, "top": 615.7 }]
        }
    ],
    "intent": {
        "status": "judged",
        "model": "jev-1.13.0",
        "probabilities": {
            "instructsAi": 0.36,
            "keywordStuffing": 0.95,
            "claimsAbsentFromVisible": 0.99,
            "selfAwareWink": 0.22,
            "templateArtifact": 0.22
        }
    }
}
```

- A clean CV returns `{"verdict":"clean"}`.
- `intent` is `{"status":"not-judged","reason":"disabled"}` without an API key, and `"reason":"judge-failed"` when Jev cannot be reached.
- Boxes are in PDF points, origin at the bottom left of the page.
- Outside 127.0.0.1 the server refuses to start without `CAVEATS_API_TOKEN` (32 characters or more) and serves the API alone, without the web UI.
- `GET /healthz` answers `{"status":"ok"}`.

The response schema is published as JSON Schema in [`schema/cv-report.v1.json`](schema/cv-report.v1.json) and [`schema/api-error.v1.json`](schema/api-error.v1.json), and as the Zod schemas `CvReportSchema` and `ApiErrorSchema`. The full contract, errors and versioning rules are in [`docs/api-design.md`](docs/api-design.md).

## Docker

```sh
docker build -t caveats .
docker run -d --name caveats \
  --env TYPESAFE_API_KEY --env CAVEATS_API_TOKEN \
  -p 127.0.0.1:4321:4321 caveats
```

The image runs the API as a non-root user, with a health check on `/healthz`. Keys are passed at run time and never baked into the image.

## Privacy

- The PDF is read on the machine that runs caveATS.
- When hidden text is found and Jev is on, the hidden text and the visible text of the CV are sent to TypeSafe to be judged. Nothing else leaves the machine.
- The web UI answers requests addressed to 127.0.0.1 or localhost only, which blocks DNS rebinding from a web page.

## Limits

- One page per CV by default. `--max-pages <n>` raises the limit, for the CLI and for `serve`. A longer PDF gets a 422.
- Pages up to US Legal (8.5 x 14 in), portrait or landscape: A4 and US Letter fit. A larger page gets a 422.
- PDF only. Zero-width characters, PDF metadata and DOCX files are not checked yet.
- The rules are tested on synthetic CVs. There is no measured false-positive rate on real CVs yet.
- Jev's probabilities are judgments to help a person, not proof.
- Jev reads the first 10,000 characters of the hidden text and of the visible text, and gets 15 s. Past that, the intent is not judged and the CV still goes to a person.
- A server checks one CV at a time, and the API has no rate limit.

## Development

```sh
bun run dev        # web UI with hot reload
bun run check      # typecheck, lint, format, tests, accessibility tests
bun run fixtures   # rebuild the synthetic test CVs from test/fixtures/*.typ (needs typst)
bun run schema     # regenerate schema/*.json from the Zod schemas
```

`bun run check` also runs the accessibility checks (WCAG 2.2 AA): html-validate on the page and the result fragments, contrast ratios of the design tokens, and axe with behaviour tests in headless Chromium. On a new machine, install that browser once with `bunx playwright-core install chromium`.

## License

MIT

## Third-party software

`bun run build` embeds these in the binary; `bun install` puts their license files in `node_modules`.

- [PDFium](https://pdfium.googlesource.com/pdfium/), BSD-3-Clause and Apache-2.0: `node_modules/@embedpdf/pdfium/LICENSE.pdfium`
- [@embedpdf/pdfium](https://github.com/embedpdf/embed-pdf-viewer), MIT: `node_modules/@embedpdf/pdfium/LICENSE`
- [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next) and [Atkinson Hyperlegible Mono](https://github.com/googlefonts/atkinson-hyperlegible-next-mono), SIL Open Font License 1.1: `node_modules/@fontsource-variable/atkinson-hyperlegible-*/LICENSE`
