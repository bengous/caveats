// Regenerates the PDF fixtures from their typst sources. Needs `typst` on PATH.
import { $ } from 'bun';

const dir = import.meta.dir;
const sources = [...new Bun.Glob('[!_]*.typ').scanSync(dir)];
await Promise.all(sources.map((source) => $`typst compile ${source} ${source.replace(/\.typ$/v, '.pdf')}`.cwd(dir)));
console.log(`Built ${sources.length} fixtures in ${dir}`);
