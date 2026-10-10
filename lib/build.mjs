// Builds dist/: reveal.js decks from Pandoc Markdown plus the launcher, client and instance settings.
// Everything instance-specific comes from a JSON configuration file; see docs/configuration.md.
import { readFile, writeFile, mkdir, cp, rm, readdir, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, basename, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

export const engineDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const LANGUAGES = ['en', 'ro'];
// References every deck template must keep (see client/template.html).
const REQUIRED_IN_TEMPLATE = ['vendor/reveal/reveal.js', 'reveal-classroom.css', 'site.js', 'presentation.js'];
const PLATFORMS = ['*', 'win32', 'linux', 'darwin'];

class ConfigError extends Error {}
const fail = message => { throw new ConfigError(message); };
const exists = path => access(path).then(() => true, () => false);
// reveal.js does not export its package.json, so look the package up along Node's search paths.
function packageDir(name) {
  for (const base of require.resolve.paths(name) || []) {
    if (existsSync(join(base, name, 'package.json'))) return join(base, name);
  }
  throw new Error(`Cannot find the "${name}" package; run "npm install" in ${engineDir}.`);
}
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

function merge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra || {})) out[key] = isObject(value) && isObject(base[key]) ? merge(base[key], value) : value;
  return out;
}

// Glob on deck keys: * matches within one path segment, ** across segments.
export function globToRegExp(glob) {
  const source = glob.split('**').map(part => part.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
  return new RegExp('^' + source + '$');
}

export async function loadConfig(configPath) {
  const file = resolve(configPath);
  let raw;
  try { raw = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { fail(error.code === 'ENOENT' ? `Configuration not found: ${file}` : `Invalid JSON in ${file}: ${error.message}`); }
  if (!isObject(raw)) fail('The configuration must be a JSON object.');
  const dir = dirname(file);
  const path = (value, name) => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !value) fail(`"${name}" must be a non-empty path string.`);
    return resolve(dir, value);
  };
  const decks = raw.decks || {};
  const pandoc = raw.pandoc || {};
  for (const [name, value] of [['decks.include', decks.include], ['decks.exclude', decks.exclude], ['pandoc.filters', pandoc.filters],
    ['pandoc.metadataFiles', pandoc.metadataFiles], ['pandoc.args', pandoc.args]]) {
    if (value !== undefined && !(Array.isArray(value) && value.every(v => typeof v === 'string'))) fail(`"${name}" must be an array of strings.`);
  }
  const language = raw.language || 'en';
  if (!LANGUAGES.includes(language) && !raw.strings) fail(`"language" must be one of ${LANGUAGES.join(', ')}, or provide "strings" with all texts.`);
  if (raw.launcher?.preselect !== undefined) {
    try { new RegExp(raw.launcher.preselect); } catch { fail('"launcher.preselect" must be a valid regular expression.'); }
  }
  if (raw.relay !== undefined) {
    try { if (!/^https?:$/.test(new URL(raw.relay.url).protocol)) throw 0; } catch { fail('"relay.url" must be an http(s) URL, e.g. "https://multiplex.up.railway.app/".'); }
  }
  const style = pandoc.highlightStyle;
  const variables = {};
  for (const [name, value] of Object.entries(pandoc.variables || {})) {
    if (typeof value === 'string') variables[name] = value;
    else if (isObject(value) && typeof value.path === 'string') variables[name] = path(value.path, `pandoc.variables.${name}.path`);
    else fail(`"pandoc.variables.${name}" must be a string or { "path": "..." }.`);
  }
  let env = pandoc.env || {};
  if (!isObject(env)) fail('"pandoc.env" must be an object.');
  if (Object.keys(env).some(k => PLATFORMS.includes(k))) env = { ...env['*'], ...env[process.platform] };
  return {
    file, dir,
    title: raw.title,
    language,
    strings: path(raw.strings, 'strings'),
    output: path(raw.output || 'dist', 'output'),
    theme: path(raw.theme, 'theme') || resolve(engineDir, 'client/theme.css'),
    decks: {
      root: path(decks.root || '.', 'decks.root'),
      list: path(decks.list, 'decks.list'),
      include: decks.include || ['**'],
      exclude: decks.exclude || []
    },
    pandoc: {
      command: pandoc.command || 'pandoc',
      template: path(pandoc.template, 'pandoc.template') || resolve(engineDir, 'client/template.html'),
      slideLevel: pandoc.slideLevel ?? 1,
      filters: (pandoc.filters || []).map((f, i) => path(f, `pandoc.filters[${i}]`)),
      metadataFiles: (pandoc.metadataFiles || []).map((f, i) => path(f, `pandoc.metadataFiles[${i}]`)),
      // A style name (e.g. "pygments") or a path to a .theme file.
      highlightStyle: style && (/[\\/]|\.theme$/.test(style) ? path(style, 'pandoc.highlightStyle') : style),
      variables,
      args: pandoc.args || [],
      env
    },
    site: {
      title: raw.title, language,
      relay: raw.relay ? { url: raw.relay.url, heartbeatSeconds: raw.relay.heartbeatSeconds } : undefined,
      launcher: raw.launcher, reveal: raw.reveal, slideBackgrounds: raw.slideBackgrounds,
      fitText: raw.fitText
    }
  };
}

async function deckKeys({ root, list, include, exclude }, output) {
  let keys;
  if (list) {
    keys = (await readFile(list, 'utf8')).split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  } else {
    keys = [];
    const skip = new Set(['node_modules', '.git']);
    const walk = async dir => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { if (!skip.has(entry.name) && full !== output) await walk(full); }
        else if (entry.name.endsWith('.md')) keys.push(relative(root, full).split(sep).join('/').slice(0, -3));
      }
    };
    await walk(root);
    keys.sort();
  }
  const included = include.map(globToRegExp), excluded = exclude.map(globToRegExp);
  return keys.filter(k => included.some(r => r.test(k)) && !excluded.some(r => r.test(k)));
}

function titleOf(markdown, fallback) {
  const front = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/.exec(markdown);
  const line = front && /^title:\s*(.+?)\s*$/m.exec(front[1]);
  if (!line) return fallback;
  const value = line[1];
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1).replace(/\\"/g, '"') : value;
}

function render(template, values) {
  const escape = value => String(value).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
  const lookup = key => key.split('.').reduce((object, part) => object?.[part], values) ?? '';
  return template.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, key) => lookup(key))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => escape(lookup(key)));
}

// Removes speaker notes; used for the audience copies served to followers on static hosts.
export const stripNotes = html => html.replace(/<aside\b[^>]*class="notes"[^>]*>[\s\S]*?<\/aside>/g, '');

export async function build({ config: configPath, output, log = console.log } = {}) {
  const config = await loadConfig(configPath);
  const out = output ? resolve(output) : config.output;
  if (out === config.dir || config.dir.startsWith(out + sep) || out === dirname(out)) fail(`Refusing to build into ${out}: choose a dedicated output directory.`);
  const keys = await deckKeys(config.decks, out);
  if (!keys.length) log('Warning: no decks matched decks.include/exclude.');
  const template = await readFile(config.pandoc.template, 'utf8').catch(() => fail(`Template not found: ${config.pandoc.template}`));
  const missing = REQUIRED_IN_TEMPLATE.filter(ref => !template.includes(ref));
  if (missing.length) fail(`The template ${config.pandoc.template} lacks required references: ${missing.join(', ')}. Compare with client/template.html.`);

  // Interface strings: built-in language, then the instance's overrides.
  const base = JSON.parse(await readFile(resolve(engineDir, 'i18n', (LANGUAGES.includes(config.language) ? config.language : 'en') + '.json'), 'utf8'));
  const strings = config.strings ? merge(base, JSON.parse(await readFile(config.strings, 'utf8'))) : base;
  const site = JSON.parse(JSON.stringify({ ...config.site, title: config.site.title || strings.launcher.pageTitle, strings }));

  // Only generated paths are replaced, so an output directory shared with other files stays safe.
  for (const entry of ['decks', 'audience', 'vendor']) await rm(join(out, entry), { recursive: true, force: true });
  await mkdir(join(out, 'decks'), { recursive: true });
  await mkdir(join(out, 'audience'), { recursive: true });
  const revealDir = packageDir('reveal.js');
  await cp(join(revealDir, 'dist'), join(out, 'vendor/reveal'), { recursive: true });
  await cp(join(revealDir, 'LICENSE'), join(out, 'vendor/reveal/LICENSE'));
  for (const file of ['presentation.js', 'launcher.js', 'relay-protocol.js', 'reveal-classroom.css']) await cp(join(engineDir, 'client', file), join(out, file));
  await cp(config.theme, join(out, 'theme.css'));
  await writeFile(join(out, 'site.json'), JSON.stringify(site, null, 2) + '\n');
  await writeFile(join(out, 'site.js'), 'window.REVEAL_CLASSROOM = ' + JSON.stringify(site).replace(/</g, '\\u003c') + ';\n');
  const launcher = await readFile(join(engineDir, 'client/launcher.html'), 'utf8');
  await writeFile(join(out, 'index.html'), render(launcher, { ...strings, title: site.title, lang: site.language }));

  const p = config.pandoc;
  const options = ['--standalone', '--embed-resources', '-t', 'revealjs', `--slide-level=${p.slideLevel}`, '--wrap=none',
    ...p.filters.map(f => (f.endsWith('.lua') ? '--lua-filter=' : '--filter=') + f),
    ...p.metadataFiles.map(f => '--metadata-file=' + f),
    ...(p.highlightStyle ? ['--highlight-style=' + p.highlightStyle] : []),
    '--template=' + p.template,
    ...Object.entries(p.variables).flatMap(([name, value]) => ['-V', `${name}=${value}`]),
    ...p.args];
  const manifest = [];
  for (const key of keys) {
    const source = join(config.decks.root, ...key.split('/')) + '.md';
    if (!(await exists(source))) fail(`Deck "${key}" not found: ${source}`);
    const file = key.split('/').join('-') + '.html';
    const target = join(out, 'decks', file);
    try {
      execFileSync(p.command, [basename(source), ...options, '-o', target], {
        cwd: dirname(source), stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, ...p.env } });
    } catch (error) {
      if (error.code === 'ENOENT') fail(`"${p.command}" was not found. Install pandoc 3.5 or later (https://pandoc.org/installing.html) or set "pandoc.command".`);
      fail(`pandoc failed for ${source} (exit code ${error.status}).`);
    }
    await writeFile(join(out, 'audience', file), stripNotes(await readFile(target, 'utf8')));
    manifest.push({ file, title: titleOf(await readFile(source, 'utf8'), key) });
    log('Built: ' + key);
  }
  // The server serves only this manifest; stale outputs cannot expose decks that are no longer listed.
  await writeFile(join(out, 'decks.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { output: out, decks: manifest, site };
}

export { ConfigError };
