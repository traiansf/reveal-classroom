#!/usr/bin/env node
// Command-line interface: build, serve and bundle reveal-classroom instances.
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { build, engineDir, ConfigError } from '../lib/build.mjs';
import { bundle } from '../lib/bundle.mjs';

const usage = `Usage:
  reveal-classroom build  [--config reveal-classroom.config.json] [--out DIR]
  reveal-classroom serve  [--dist DIR] [--host 127.0.0.1] [--port 3000] [--base-path /prefix]
  reveal-classroom bundle [--dist DIR] [--deploy DIR] [--revision SHA] --out FILE.tar.gz
  reveal-classroom --version

serve reads PRESENTATION_PASSWORD, HOST, PORT, BASE_PATH and SESSION_TTL_HOURS from the
environment; command-line options take precedence. Without a password on 127.0.0.1 it prints
a temporary one. See README.md and docs/ for details.`;

const [command, ...rest] = process.argv.slice(2);
const options = {
  config: { type: 'string', default: 'reveal-classroom.config.json' }, out: { type: 'string' },
  dist: { type: 'string', default: 'dist' }, host: { type: 'string' }, port: { type: 'string' },
  'base-path': { type: 'string' }, deploy: { type: 'string' }, revision: { type: 'string' }, help: { type: 'boolean' }
};
try {
  if (!command || command === '--help' || command === '-h' || command === 'help') { console.log(usage); process.exit(0); }
  if (command === '--version' || command === '-v') {
    console.log(JSON.parse(await readFile(join(engineDir, 'package.json'), 'utf8')).version);
    process.exit(0);
  }
  const { values } = parseArgs({ args: rest, options, strict: true });
  if (values.help) { console.log(usage); process.exit(0); }
  if (command === 'build') {
    const result = await build({ config: values.config, output: values.out });
    console.log(`${result.decks.length} deck(s) in ${result.output}`);
  } else if (command === 'serve') {
    const { startServer } = await import('../server.mjs');
    const env = process.env;
    await startServer({ dist: resolve(values.dist), host: values.host || env.HOST || '127.0.0.1',
      port: Number(values.port || env.PORT || 3000), basePath: values['base-path'] ?? env.BASE_PATH ?? '',
      password: env.PRESENTATION_PASSWORD, ttlHours: Number(env.SESSION_TTL_HOURS || 8) });
  } else if (command === 'bundle') {
    console.log('Bundle: ' + await bundle({ dist: values.dist, deploy: values.deploy, out: values.out, revision: values.revision }));
  } else {
    console.error(`Unknown command "${command}".\n\n${usage}`);
    process.exit(2);
  }
} catch (error) {
  console.error((error instanceof ConfigError || error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' ? '' : 'Error: ') + error.message);
  process.exit(1);
}
