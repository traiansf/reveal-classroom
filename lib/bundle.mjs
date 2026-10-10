// Packs a deploy bundle: dist/, deploy/, server.mjs, package.json and package-lock.json at the top
// level. Servers install it with `npm ci --omit=dev` and run `node server.mjs`; the layout is fixed
// because already-installed update scripts validate it before replacing themselves.
import { mkdtemp, cp, writeFile, rm, access, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { engineDir } from './build.mjs';

// deploy: the instance's folder (deploy/instance.env, custom scripts), copied over the engine's
// deploy kit, so that an instance only keeps what differs and engine upgrades refresh the rest.
export async function bundle({ dist, deploy, out, revision }) {
  if (!out) throw new Error('Specify the archive to create, e.g. --out reveal-classroom.tar.gz');
  dist = resolve(dist);
  await access(join(dist, 'decks.json')).catch(() => { throw new Error(`${dist} is not a built dist directory (decks.json missing); run "reveal-classroom build" first.`); });
  if (revision !== undefined && !/^[0-9a-f]{7,64}$/.test(revision)) throw new Error('The revision must be a hexadecimal commit id.');
  const staging = await mkdtemp(join(tmpdir(), 'reveal-classroom-bundle-'));
  try {
    await cp(dist, join(staging, 'dist'), { recursive: true });
    if (revision) await writeFile(join(staging, 'dist', 'revision.txt'), revision + '\n');
    await cp(join(engineDir, 'deploy'), join(staging, 'deploy'), { recursive: true });
    if (deploy) await cp(resolve(deploy), join(staging, 'deploy'), { recursive: true, force: true });
    for (const file of ['server.mjs', 'package.json']) await cp(join(engineDir, file), join(staging, file));
    // The engine's lock is npm-shrinkwrap.json, which npm keeps in packed and git-installed copies
    // (package-lock.json is never published); servers expect it as package-lock.json.
    await cp(join(engineDir, 'npm-shrinkwrap.json'), join(staging, 'package-lock.json'));
    const archive = resolve(out);
    await mkdir(dirname(archive), { recursive: true });
    // Relative archive name and -C: GNU tar would read a Windows drive letter as a remote host.
    execFileSync('tar', ['-czf', basename(archive), '-C', staging, 'dist', 'deploy', 'server.mjs', 'package.json', 'package-lock.json'],
      { cwd: dirname(archive), stdio: 'inherit' });
    return archive;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
