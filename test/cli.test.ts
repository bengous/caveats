import { expect, spyOn, test } from 'bun:test';
import { main } from '../src/cli.ts';
import { CvReportSchema } from '../src/report.ts';

const WITHOUT_JEV = {};

const fixture = (name: string): string => `${import.meta.dir}/fixtures/${name}.pdf`;

const run = async (args: string[]): Promise<{ readonly exitCode: number | null; readonly output: string }> => {
    const log = spyOn(console, 'log').mockImplementation(() => {});
    try {
        const exitCode = await main(args, WITHOUT_JEV);
        return { exitCode, output: log.mock.calls.map(([line]) => String(line)).join('\n') };
    } finally {
        log.mockRestore();
    }
};

const refusal = async (args: string[]): Promise<string> => {
    try {
        await main(args, WITHOUT_JEV);
        return 'accepted';
    } catch (error) {
        return String(error);
    }
};

test('a clean CV exits 0', async () => {
    const { exitCode, output } = await run([fixture('clean')]);

    expect(exitCode).toBe(0);
    expect(output).toContain('clean, no hidden text found');
});

test('a CV with hidden text exits 1, and --json prints a report that parses with the published schema', async () => {
    const { exitCode, output } = await run([fixture('white-text'), '--json']);

    expect(exitCode).toBe(1);
    expect(CvReportSchema.parse(JSON.parse(output))).toMatchObject({
        verdict: 'human-review',
        intent: { status: 'not-judged', reason: 'disabled' },
    });
});

test('--help prints the usage and exits 0', async () => {
    const { exitCode, output } = await run(['--help']);

    expect(exitCode).toBe(0);
    expect(output).toContain('Usage:');
});

test('without a file the usage goes to stderr and the exit code is 2', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {});
    try {
        const exitCode = await main([], WITHOUT_JEV);

        expect(exitCode).toBe(2);
        expect(String(error.mock.calls[0]?.[0])).toContain('Usage:');
    } finally {
        error.mockRestore();
    }
});

test('a PDF over --max-pages is refused, and --max-pages raises the limit', async () => {
    expect(await refusal([fixture('two-pages')])).toContain('this PDF has 2 pages, the limit is 1');
    expect((await run([fixture('two-pages'), '--max-pages', '2'])).exitCode).toBe(0);
    expect(await refusal([fixture('two-pages'), '--max-pages', '0'])).toContain('must be a number from 1 to 9999');
});

test('serve opens the network only with a token, and --dev only on this machine', async () => {
    expect(await refusal(['serve', '--host', '0.0.0.0'])).toContain('set CAVEATS_API_TOKEN');
    expect(await refusal(['serve', '--host', '0.0.0.0', '--dev'])).toContain('--dev runs on this machine only');
});
