import { expect, test } from 'bun:test';
import type { Fetch } from '@typesafe-ai/sdk';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import * as z from 'zod';
import { createJevJudge, MAX_JEV_TEXT_CHARS } from '../src/judge.ts';

const NO_RETRY = { maxRetries: 0 };

const JevRequestSchema = z.object({ state: z.object({ hidden_text: z.string(), visible_resume_text: z.string() }) });
type JevRequest = z.infer<typeof JevRequestSchema>;

const hangingFetch: Fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted', { cause: init.signal?.reason })));
    });

test('a Jev call that never answers fails within the budget', async () => {
    const judge = createJevJudge(new TypeSafeClient({ apiKey: 'test', fetch: hangingFetch, retry: NO_RETRY }), 50);
    const started = performance.now();

    const outcome = await judge({ hiddenText: 'hidden', visibleText: 'visible' }).then(
        () => 'answered',
        () => 'failed',
    );

    expect(outcome).toBe('failed');
    expect(performance.now() - started).toBeLessThan(1000);
});

test('Jev receives at most MAX_JEV_TEXT_CHARS of each text', async () => {
    const requests: JevRequest[] = [];
    const capturingFetch: Fetch = async (_url, init) => {
        requests.push(JevRequestSchema.parse(await new Response(init?.body).json()));
        throw new Error('captured');
    };
    const judge = createJevJudge(new TypeSafeClient({ apiKey: 'test', fetch: capturingFetch, retry: NO_RETRY }));

    await judge({
        hiddenText: 'h'.repeat(MAX_JEV_TEXT_CHARS * 3),
        visibleText: 'v'.repeat(MAX_JEV_TEXT_CHARS * 2),
    }).catch(() => null);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.state.hidden_text).toHaveLength(MAX_JEV_TEXT_CHARS);
    expect(requests[0]?.state.visible_resume_text).toHaveLength(MAX_JEV_TEXT_CHARS);
});
