import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build, loadConfig, globToRegExp, stripNotes, ConfigError } from '../lib/build.mjs';
import { bundle } from '../lib/bundle.mjs';
import { root } from './helpers.mjs';

const hasPandoc = (() => { try { execFileSync('pandoc', ['--version'], { stdio:'ignore' }); return true; } catch { return false; } })();
const temp = () => mkdtemp(join(tmpdir(), 'reveal-classroom-build-'));

test('deck globs', () => {
  assert.ok(globToRegExp('curs/*').test('curs/01-intro'));
  assert.ok(!globToRegExp('curs/*').test('curs/a/b'));
  assert.ok(globToRegExp('**').test('a/b/c'));
  assert.ok(globToRegExp('lab/00-pregatire').test('lab/00-pregatire'));
  assert.ok(!globToRegExp('lab/0?').test('lab/0?x'));
});

test('notes are removed from audience copies', () => {
  assert.equal(stripNotes('<section>A<aside class="notes"><p>x</p></aside></section>'), '<section>A</section>');
});

test('configuration errors are explained', async t => {
  const dir = await temp();
  t.after(() => rm(dir, { recursive:true, force:true }));
  const write = async config => { const file = join(dir, 'c.json'); await writeFile(file, JSON.stringify(config)); return file; };
  await assert.rejects(loadConfig(join(dir, 'missing.json')), ConfigError);
  await assert.rejects(loadConfig(await write({ language:'xx' })), /language/);
  await assert.rejects(loadConfig(await write({ relay:{ url:'ftp://x' } })), /relay\.url/);
  await assert.rejects(loadConfig(await write({ launcher:{ preselect:'(' } })), /preselect/);
  await assert.rejects(loadConfig(await write({ decks:{ include:'curs/*' } })), /decks\.include/);
  const config = await loadConfig(await write({ pandoc:{ variables:{ logo:{ path:'logo.png' }, mode:'x' }, env:{ '*':{ A:'1' }, [process.platform]:{ B:'2' } } } }));
  assert.equal(config.pandoc.variables.logo, join(dir, 'logo.png'));
  assert.deepEqual(config.pandoc.env, { A:'1', B:'2' });
  // A template without the engine references is rejected before pandoc runs.
  await mkdir(join(dir, 'decks'));
  await writeFile(join(dir, 'decks', 'a.md'), '# A');
  await writeFile(join(dir, 'bad.html'), '<html>$body$</html>');
  await assert.rejects(build({ config:await write({ decks:{ root:'decks' }, pandoc:{ template:'bad.html' } }), log:() => {} }), /site\.js/);
  await assert.rejects(build({ config:await write({ output:'.' }), log:() => {} }), /Refusing/);
});

test('bundle layout matches what installed update scripts expect', { skip:(() => { try { execFileSync('tar', ['--version'], { stdio:'ignore' }); return false; } catch { return 'tar not available'; } })() }, async t => {
  const dir = await temp();
  t.after(() => rm(dir, { recursive:true, force:true }));
  await mkdir(join(dir, 'dist'));
  await writeFile(join(dir, 'dist', 'decks.json'), '[]');
  // The instance's deploy folder is laid over the engine's kit.
  await mkdir(join(dir, 'deploy'));
  await writeFile(join(dir, 'deploy', 'instance.env'), 'APP_NAME=test\n');
  const archive = await bundle({ dist:join(dir, 'dist'), deploy:join(dir, 'deploy'), out:join(dir, 'out', 'bundle.tar.gz'), revision:'0123456789abcdef0123456789abcdef01234567' });
  const entries = execFileSync('tar', ['-tzf', 'bundle.tar.gz'], { cwd:join(dir, 'out') }).toString().split(/\r?\n/).filter(Boolean);
  const top = new Set(entries.map(e => e.replace(/^\.\//, '').split('/')[0]));
  assert.deepEqual([...top].sort(), ['deploy', 'dist', 'package-lock.json', 'package.json', 'server.mjs']);
  for (const file of ['dist/revision.txt', 'deploy/user/install.sh', 'deploy/user/update.sh', 'deploy/docker/Dockerfile', 'deploy/instance.env']) {
    assert.ok(entries.some(e => e.replace(/^\.\//, '') === file), file);
  }
  assert.equal(execFileSync('tar', ['-xzOf', 'bundle.tar.gz', 'deploy/instance.env'], { cwd:join(dir, 'out') }).toString(), 'APP_NAME=test\n');
  await assert.rejects(bundle({ dist:join(dir, 'missing'), out:join(dir, 'x.tar.gz') }), /decks\.json/);
  assert.ok(archive.endsWith('bundle.tar.gz'));
});

test('the minimal example builds', { skip:hasPandoc ? false : 'pandoc not installed', timeout:120000 }, async t => {
  const dir = await temp();
  t.after(() => rm(dir, { recursive:true, force:true }));
  const result = await build({ config:join(root, 'examples/minimal/reveal-classroom.config.json'), output:dir, log:() => {} });
  assert.deepEqual(result.decks.map(d => d.file), ['01-welcome.html', '02-features.html']);
  const presenter = await readFile(join(dir, 'decks', '01-welcome.html'), 'utf8');
  assert.match(presenter, /<aside class="notes"/);
  assert.match(presenter, /site\.js/);
  assert.doesNotMatch(await readFile(join(dir, 'audience', '01-welcome.html'), 'utf8'), /<aside class="notes"/);
  const site = JSON.parse(await readFile(join(dir, 'site.json'), 'utf8'));
  assert.equal(site.language, 'en');
  assert.equal(site.relay.url, 'https://multiplex.up.railway.app/');
  assert.match(await readFile(join(dir, 'index.html'), 'utf8'), /<title>reveal-classroom demo<\/title>/);
  for (const file of ['presentation.js', 'launcher.js', 'relay-protocol.js', 'reveal-classroom.css', 'theme.css', 'vendor/reveal/reveal.js', 'vendor/reveal/plugin/notes.js']) {
    await readFile(join(dir, file));
  }
});
