import {readdir, readFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
async function check(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    if (['node_modules', '.data'].includes(entry.name) || entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (entry.name.endsWith('.mjs')) {
      const r = spawnSync(process.execPath, ['--check', path], {encoding: 'utf8'});
      if (r.status !== 0) throw new Error(r.stderr || `Syntax error in ${path}`);
    }
  }
}
await check(resolve(root));
const html = await readFile(join(root, 'public/index.html'), 'utf8');
if (/https?:\/\//.test(html.replace(/placeholder="https:\/\/…"/, ''))) throw new Error('Unexpected external dependency in entrypoint');
console.log('All JavaScript modules parse; browser entrypoint has no CDN dependencies.');
