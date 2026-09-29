# caveATS

CV integrity check: `src/scan.ts` finds hidden text with PDFium rules, `src/judge.ts`
asks Jev (TypeSafe) five Noul questions about its intent, `src/report.ts` sets the
verdict. The verdict is `clean` or `human-review`: the tool never rejects.
`src/serve.ts` serves the web UI (`ui/`) and renders the result server-side in
`src/report-html.ts`: hidden text is attacker-controlled, escape every dynamic string.
`src/pdfium.ts` owns every PDFium allocation.
`src/api.ts` serves `POST /v1/check`, the JSON contract for ATS pipelines (`docs/api-design.md`):
a change to its responses changes the published v1 schema.

- Outside loopback, `serve` needs `CAVEATS_API_TOKEN` and serves the API alone; on loopback it
  refuses a foreign `Host`. A new route goes through the same `Exposure` guard in `src/serve.ts`.
- `schema/*.json` is generated from the Zod schemas: edit those, then `bun run schema`.
- `bun run check` runs typecheck, lint, format check, tests and `check:a11y`. It must pass before a commit.
- Accessibility (WCAG 2.2 AA) is checked three ways: `test/a11y-html.test.ts` (html-validate on the page and on the result fragments), `test/a11y-contrast.test.ts` (ratios of the `ui/style.css` tokens), and `bun run check:a11y` (axe and behaviour tests in Chromium, `test/a11y/*.a11y.ts`; `bun test` skips them). `check:a11y` needs Chromium once: `bunx playwright-core install chromium`.
- `test/jev.test.ts` calls the live TypeSafe API when `TYPESAFE_API_KEY` is set (Bun loads `.env`).
- Fixtures are synthetic CVs in typst: edit `test/fixtures/*.typ`, then `bun run fixtures` (needs `typst`).
- `spike/` holds a real person's CV: git-ignored, never commit or publish it.
- `.dockerignore` is an allowlist: never add `.env` (live API key) or `spike/` to it.
- Lint policy lives in `oxlint.config.ts`; `tools/oxlint/anti-slop/` is vendored from dmmulroy/anti-slop.
- TypeSafe docs are the source of truth for the Jev API: https://docs.typesafe.ai/llms.txt
- The phase plan lives in `TODO.md`, local and git-ignored: never commit it.
