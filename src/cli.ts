#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import * as z from 'zod';
import type { BearerToken } from './api.ts';
import { BearerTokenSchema } from './api.ts';
import { formatReport } from './format.ts';
import type { IntentJudge } from './judge.ts';
import { createJevJudge } from './judge.ts';
import { DEFAULT_MAX_PAGES } from './limits.ts';
import { checkCv } from './report.ts';
import type { Exposure } from './serve.ts';
import { startServer } from './serve.ts';

const USAGE = `Usage:
  caveats <file.pdf> [--json]                 check one CV
  caveats serve [--port 4321]                 open the web UI and the API on this machine
  caveats serve --host 0.0.0.0 [--port 4321]  serve the API alone to the network
  bun run dev                                     the web UI with hot reload, from the repo

Options:
  --max-pages <n>  refuse a PDF of more than n pages (default ${DEFAULT_MAX_PAGES})

Finds text hidden from human readers in a CV. With TYPESAFE_API_KEY set, Jev
judges its intent. It never rejects a candidate: a flagged CV goes to a person.

The API is POST /v1/check (docs/api-design.md). Outside 127.0.0.1 it needs
CAVEATS_API_TOKEN, 32 characters or more, sent as a bearer token.

Exit codes: 0 clean, 1 human review required, 2 usage or read error.`;

const EXIT_CLEAN = 0;
const EXIT_HUMAN_REVIEW = 1;
const EXIT_ERROR = 2;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const PORT_RULE = 'must be a number from 0 to 65535';
const MAX_PAGES_RULE = 'must be a number from 1 to 9999';

const EnvSchema = z.object({
    TYPESAFE_API_KEY: z.string().optional(),
    CAVEATS_API_TOKEN: BearerTokenSchema.optional(),
});

const ServeArgsSchema = z.object({
    port: z
        .string()
        .regex(/^\d{1,5}$/v, PORT_RULE)
        .transform(Number)
        .pipe(z.int().max(65_535, PORT_RULE)),
    host: z.string().min(1),
    dev: z.boolean(),
});

const MaxPagesSchema = z
    .string()
    .regex(/^[1-9]\d{0,3}$/v, MAX_PAGES_RULE)
    .transform(Number);

function parseInput<S extends z.ZodType>(schema: S, input: z.input<S>, label: string): z.output<S> {
    const result = schema.safeParse(input);
    if (!result.success) {
        throw new Error(`invalid ${label}:\n${z.prettifyError(result.error)}`);
    }
    return result.data;
}

function jevJudge(apiKey: string | undefined): IntentJudge | null {
    return apiKey === undefined || apiKey === '' ? null : createJevJudge(new TypeSafeClient({ apiKey }));
}

function exposureOf(host: string, development: boolean, token: BearerToken | undefined): Exposure {
    if (LOOPBACK_HOSTS.has(host)) {
        return { kind: 'loopback', token: token ?? null, development };
    }
    if (development) {
        throw new Error(`--dev runs on this machine only: drop --host ${host} or --dev`);
    }
    if (token === undefined) {
        throw new Error(
            `--host ${host} opens the API to the network: set CAVEATS_API_TOKEN (32 characters or more) first`,
        );
    }
    return { kind: 'network', hostname: host, token };
}

export async function main(
    args: string[],
    environment: Readonly<Record<string, string | undefined>>,
): Promise<number | null> {
    const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        options: {
            json: { type: 'boolean', default: false },
            port: { type: 'string', default: '4321' },
            host: { type: 'string', default: '127.0.0.1' },
            dev: { type: 'boolean', default: false },
            'max-pages': { type: 'string', default: String(DEFAULT_MAX_PAGES) },
            help: { type: 'boolean', short: 'h', default: false },
        },
    });
    if (values.help) {
        console.log(USAGE);
        return EXIT_CLEAN;
    }
    const [first] = positionals;
    if (first === undefined || positionals.length > 1) {
        console.error(USAGE);
        return EXIT_ERROR;
    }
    const env = parseInput(
        EnvSchema,
        {
            TYPESAFE_API_KEY: environment['TYPESAFE_API_KEY'],
            CAVEATS_API_TOKEN: environment['CAVEATS_API_TOKEN'],
        },
        'environment',
    );
    const judge = jevJudge(env.TYPESAFE_API_KEY);
    const maxPages = parseInput(MaxPagesSchema, values['max-pages'], '--max-pages');
    if (first === 'serve') {
        const { port, host, dev } = parseInput(ServeArgsSchema, values, 'arguments');
        const exposure = exposureOf(host, dev, env.CAVEATS_API_TOKEN);
        const server = startServer({ port, judge, exposure, maxPages });
        const scope = exposure.kind === 'network' ? ' (API only: POST /v1/check)' : '';
        console.log(`caveats is running at ${server.url.href}${scope}`);
        return null;
    }
    const report = await checkCv(await Bun.file(first).bytes(), judge, maxPages);
    console.log(values.json ? JSON.stringify(report, null, 2) : formatReport(report, first));
    return report.verdict === 'clean' ? EXIT_CLEAN : EXIT_HUMAN_REVIEW;
}

if (import.meta.main) {
    try {
        const exitCode = await main(process.argv.slice(2), Bun.env);
        if (exitCode !== null) {
            process.exitCode = exitCode;
        }
    } catch (error) {
        console.error(`caveats: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = EXIT_ERROR;
    }
}
