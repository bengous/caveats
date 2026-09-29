// Regenerates the published JSON Schema from the Zod schemas: `bun run schema`.
// `io: 'input'` describes what a client parses, and leaves out
// `additionalProperties: false`, so v1 can add fields without breaking clients.
import * as z from 'zod';
import { ApiErrorSchema } from '../src/api.ts';
import { CvReportSchema } from '../src/report.ts';

export const JSON_SCHEMAS = new Map<string, z.core.JSONSchema.BaseSchema>([
    ['cv-report.v1.json', z.toJSONSchema(CvReportSchema, { io: 'input' })],
    ['api-error.v1.json', z.toJSONSchema(ApiErrorSchema, { io: 'input' })],
]);

if (import.meta.main) {
    await Promise.all(
        [...JSON_SCHEMAS].map(([name, schema]) => Bun.write(`${import.meta.dir}/${name}`, JSON.stringify(schema))),
    );
}
