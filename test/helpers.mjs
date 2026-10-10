import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// A minimal built dist/ without pandoc: two decks with speaker notes and the instance settings.
export async function makeDist({ language = 'en' } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'reveal-classroom-test-'));
  const strings = JSON.parse(await readFile(join(root, 'i18n', language + '.json'), 'utf8'));
  const deck = title => `<!doctype html><title>${title}</title><div class="reveal"><div class="slides">
<section><h1>${title}</h1><aside class="notes"><p>secret notes</p></aside></section></div></div>`;
  await mkdir(join(dir, 'decks'), { recursive: true });
  await mkdir(join(dir, 'audience'), { recursive: true });
  await writeFile(join(dir, 'decks.json'), JSON.stringify([{ file:'one.html', title:'One' }, { file:'two.html', title:'Two' }]));
  for (const name of ['one', 'two']) {
    await writeFile(join(dir, 'decks', name + '.html'), deck(name));
    await writeFile(join(dir, 'audience', name + '.html'), deck(name).replace(/<aside[\s\S]*?<\/aside>/, ''));
  }
  const site = { title:'Test', language, strings };
  await writeFile(join(dir, 'site.json'), JSON.stringify(site));
  await writeFile(join(dir, 'site.js'), 'window.REVEAL_CLASSROOM = ' + JSON.stringify(site) + ';');
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>launcher</title>');
  await writeFile(join(dir, 'relay-protocol.js'), await readFile(join(root, 'client', 'relay-protocol.js')));
  return { dir, strings, cleanup: () => rm(dir, { recursive:true, force:true }) };
}
