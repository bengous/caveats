# Machine API

`POST /v1/check` takes a CV as a PDF and returns the report as JSON, for ATS pipelines. The web UI endpoint
`POST /api/check?lang=en|fr` returns HTML fragments for the local page and makes no stability promise.

## Contract

### `POST /v1/check`

Request:

- `Content-Type: application/pdf`. Parameters after `;` are ignored. Anything else is a 415.
- `Authorization: Bearer <token>` when the server has `CAVEATS_API_TOKEN`, which is always the case outside
  loopback (see [Guard](#guard)).
- Body: the raw PDF, 1 byte to 20 MiB (20,971,520 bytes, `src/limits.ts`).

Response `200`, `Content-Type: application/json`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.

A CV with nothing hidden:

```json
{ "verdict": "clean" }
```

A CV with hidden text (spans from `test/fixtures/white-text.pdf`; probabilities illustrative):

```json
{
    "verdict": "human-review",
    "hiddenSpans": [
        {
            "page": 1,
            "text": "Kubernetes, Rust, AWS, machine learning, 10 years of Python",
            "reasons": ["no-contrast"],
            "boxes": [
                {
                    "left": 56.835914611816406,
                    "right": 332.6169128417969,
                    "bottom": 605.2738647460938,
                    "top": 615.6688842773438
                }
            ]
        }
    ],
    "intent": {
        "status": "judged",
        "model": "jev-1.13.0",
        "probabilities": {
            "instructsAi": 0.02,
            "keywordStuffing": 0.97,
            "claimsAbsentFromVisible": 0.91,
            "selfAwareWink": 0.03,
            "templateArtifact": 0.04
        }
    }
}
```

When Jev does not judge, `intent` is `{ "status": "not-judged", "reason": "<reason>" }`:

- `disabled`: the server runs without `TYPESAFE_API_KEY`.
- `judge-failed`: the call to Jev failed (outage, timeout, or an answer outside its schema). The server logs the cause.
  The verdict does not change: hidden spans alone set `human-review`, and Jev only annotates them. Send the CV again
  later for a judgment.

Field rules:

- `verdict` is `clean` or `human-review`. The tool never rejects: `human-review` hands the CV to a person.
- `hiddenSpans` exists only on `human-review` and holds at least one span.
- `page` is 1-based.
- `reasons` holds one or more of `invisible-render-mode`, `tiny-font`, `off-page`, `no-contrast`.
- `boxes` holds one rectangle per line of the span, in PDF points, origin at the bottom left of the page. Off-page
  text has coordinates outside the page, negative ones included.
- `text` is the hidden text as the candidate wrote it. JSON escaping makes it safe inside the body; a client that puts
  it in HTML must escape it.
- Each probability is the probability of yes, in [0, 1], for one Noul question. The question text is the field
  description in the JSON Schema.
- `model` is the model name TypeSafe reports for the request.

### Errors

Body: `{ "error": { "code": "<code>", "message": "<English sentence>" } }`. Branch on `code`; `message` is for a person.

| Status | `code`                   | When                                                                  |
| ------ | ------------------------ | --------------------------------------------------------------------- |
| 400    | `empty-body`             | the body has 0 bytes                                                  |
| 401    | `unauthorized`           | bearer token missing or wrong; `WWW-Authenticate: Bearer` is set      |
| 403    | `forbidden-host`         | loopback mode only: the `Host` header is not 127.0.0.1 or localhost   |
| 413    | none (empty body)        | body over 20 MiB; Bun rejects it before any handler runs              |
| 415    | `unsupported-media-type` | `Content-Type` is not `application/pdf`                               |
| 422    | `unreadable-pdf`         | PDFium cannot open or read the file (corrupted, password protected)   |
| 422    | `too-many-pages`         | the PDF has more pages than `--max-pages` (default 1)                 |
| 422    | `page-too-large`         | a page is larger than US Legal (8.5 x 14 in), in either orientation   |
| 500    | `internal`               | any other failure; the cause goes to the server log only              |
| 404    | none (empty body)        | any other path or method; Bun routing answers before any handler runs |

A Jev failure is not an error: see `judge-failed` above.

### `GET /healthz`

`200 {"status":"ok"}`. No token, no data. The container healthcheck calls it.

### Versioning

The version is in the path. Within `/v1`, fields may be added, and clients ignore unknown fields. A removal, a rename
or a type change goes to `/v2`.

### Published schema

- `src/index.ts` exports the Zod schemas `CvReportSchema` and `ApiErrorSchema` with their types.
  `CvReportSchema.parse(body)` validates a response.
- `schema/cv-report.v1.json` and `schema/api-error.v1.json` are JSON Schema (draft 2020-12), generated with Zod's
  `z.toJSONSchema` by `bun run schema`. Edit the Zod schemas, then regenerate: a test fails when a committed file
  differs from the generated one.
- The files are generated with `io: "input"`: they describe what a client parses, and Zod leaves out
  `additionalProperties: false` in that mode, so a field added within v1 does not break a validating client.

## Guard

`serve` binds `127.0.0.1` unless `--host` says otherwise. The CV text goes to TypeSafe with the server's API key, so
the CLI turns host, `--dev` and environment into one `Exposure` value before anything binds:

```ts
type Exposure =
    | { kind: 'loopback'; token: BearerToken | null; development: boolean } // web UI and API, this machine only
    | { kind: 'network'; hostname: string; token: BearerToken }; // API only
```

- `127.0.0.1` and `localhost` are `loopback` and bind `127.0.0.1`. Any other host is `network`: without
  `CAVEATS_API_TOKEN` of 32 characters or more, the CLI exits with code 2 before it binds. `startServer` takes an
  `Exposure`, so a library caller cannot bind the network without a token either.
- `network` serves `/v1/check` and `/healthz` only. The web UI cannot hold a secret, so it is not served.
- `--dev` (hot reload) exists only in `loopback`; `--dev` with a network host exits with code 2.
- When a token is set, in both modes, `/v1/check` requires `Authorization: Bearer <token>`. The compare hashes both
  sides with SHA-256, then uses `crypto.timingSafeEqual`.
- In `loopback` mode, `/v1/check` and `/api/check` answer 403 when `Host` is not `127.0.0.1:<port>` or
  `localhost:<port>`: a page in the browser cannot read results through DNS rebinding.
- `/api/check` requires `Content-Type: application/pdf` too (415 otherwise). A cross-site form post cannot set that
  header, and a cross-site `fetch` that sets it needs a CORS preflight that the server never grants.
- The token comes from the environment only: flags show in `ps`.
- The web UI sets its Content-Security-Policy in a `<meta>` tag, because Bun serves an HTML import without custom
  headers. A `<meta>` policy cannot carry `frame-ancestors`, so another site can still frame the loopback page.
  `/api/check` answers with `no-store` and `nosniff`, and the page inserts its answer only when it is `text/html`.
- The server speaks plain HTTP. TLS ends at the ATS ingress or a reverse proxy in front of the container.
- No rate limit: whoever holds the token can spend TypeSafe credit.

## Types

Types come from the Zod schemas with `z.infer`, one source per value. The schemas carry no `.readonly()`: Zod writes it
as `readOnly: true` in JSON Schema, which means "server-managed" there.

Branded types, each parsed once at its boundary:

| Brand         | Rule                | Parsed at                                  | Why a brand                                                                       |
| ------------- | ------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| `Probability` | number in [0, 1]    | `src/judge.ts`, on the Jev response        | the TypeSafe SDK casts the JSON body without a runtime check                      |
| `PageNumber`  | integer >= 1        | `src/scan.ts`, from the 0-based page index | `scan.ts` and `pdfium.ts` carry a 0-based index and a 1-based number side by side |
| `BearerToken` | string, >= 32 chars | `src/cli.ts`, from `CAVEATS_API_TOKEN`     | a network `Exposure` cannot hold an empty or short token                          |

Not branded:

- `Lang` is already the closed union `'en' | 'fr'`. The server parses the query with `z.enum(LANGS)`; the browser keeps
  `isLang`, so Zod stays out of the UI bundle.
- PDF bytes: the only rule is "not empty", and PDFium already rejects empty input. The 20 MiB cap is a transport limit
  that Bun enforces.
- Model name, rectangle coordinates (negative when off-page), port: no rule a constructor would add.

Other boundaries: the CLI parses `--port`, `--host`, `--dev`, `--max-pages` and the environment with Zod (`src/cli.ts`).
`/v1/check` checks one header and a byte length by hand (`src/api.ts`).

`PdfError` (`src/pdfium.ts`) marks a file PDFium cannot read, so `/v1/check` and `/api/check` answer 422 for it and 500
for anything else. Its `problem` picks the sentence the web UI shows, in the language of the page.
`TooManyPagesError` and `PageTooLargeError` (`src/scan.ts`) refuse a PDF over `--max-pages`, or a page larger than US
Legal, before the page is rendered: the scan runs synchronously, so a long PDF or a poster-sized page would hold every
other request.

## CLI

- `caveats <file.pdf> --json` prints the same JSON document as the `/v1/check` body.
- `caveats serve --host <address>` opens the API to the network, with the token.
- Exit codes: 0 clean, 1 human review, 2 usage or read error. A Jev failure gives 1 with a note, not 2.

## Container

The `Dockerfile` runs `caveats serve --host 0.0.0.0 --port 4321`: the API alone, behind the token.

```sh
docker build -t caveats .
docker run --env TYPESAFE_API_KEY --env CAVEATS_API_TOKEN -p 4321:4321 caveats
```

`--env NAME` without a value copies the variable from the caller's environment, so no secret goes into the image or
the shell history. Without `CAVEATS_API_TOKEN` the container exits with code 2. Without `TYPESAFE_API_KEY` it runs,
and every report says `not-judged` with the reason `disabled`.

- Runtime base: `oven/bun:1.4.2-distroless`, pinned by digest: no shell, no package manager. It runs `src/cli.ts`
  with production dependencies only.
- Build stage: `oven/bun:1.4.2-slim`, `bun install --frozen-lockfile --production`.
- User `65532:65532`, the distroless `nonroot`. The application files stay owned by root.
- `.dockerignore` is an allowlist: `package.json`, `bun.lock`, `src/`, `ui/`. `.env`, `spike/`, `test/`, `dist/` and
  `.git` never enter the build context.
- Healthcheck: the image's own Bun fetches `http://127.0.0.1:4321/healthz`, because distroless has no curl.
- Not chosen: `bun build --compile`. The binary needs a glibc base and a healthcheck subcommand, because distroless
  has no shell to set `BUN_BE_BUN=1` for the probe alone.

## Open

- Page sizes are not in the response. A client that draws the boxes reads them from the PDF it sent.
- Coordinates keep PDFium's float noise (`56.835914611816406`).
- PDFium runs synchronously in one WASM instance, so one server checks one CV at a time. Scale with replicas.
