#!/usr/bin/env bash
# Pull-based update, run by the $UPDATE_UNIT timer: no inbound SSH and no credentials on the server.
# Reads $RELEASE_URL/latest.json ({"revision": "<40 hex>", "sha256": "<64 hex>"}), downloads
# $RELEASE_URL/$BUNDLE_NAME when the revision differs from the installed one, verifies the checksum,
# the revision recorded in the bundle and the archive layout, then runs the bundle's install.sh.
set -euo pipefail
umask 077
: "${APP_NAME:?}" "${RELEASE_URL:?}" "${BUNDLE_NAME:?}"
app_root="$HOME/.local/share/$APP_NAME"
exec 8>"$app_root/update.lock"
flock -n 8 || exit 0
work=$(mktemp -d "$app_root/update.XXXXXX")
trap 'rm -rf "$work"' EXIT
curl -fsSL --retry 2 --connect-timeout 15 --max-time 90 "$RELEASE_URL/latest.json?check=$(date +%s)" -o "$work/latest.json"
read -r revision digest < <(python3 - "$work/latest.json" <<'PY'
import json, re, sys
data = json.load(open(sys.argv[1]))
if not re.fullmatch(r'[0-9a-f]{40}', data['revision']): raise SystemExit('Invalid revision')
if not re.fullmatch(r'[0-9a-f]{64}', data['sha256']): raise SystemExit('Invalid checksum')
print(data['revision'], data['sha256'])
PY
)
if [ "$(cat "$app_root/installed-revision" 2>/dev/null || true)" = "$revision" ]; then exit 0; fi
curl -fsSL --retry 2 --connect-timeout 15 --max-time 300 "$RELEASE_URL/$BUNDLE_NAME?revision=$revision" -o "$work/bundle.tar.gz"
printf '%s  %s\n' "$digest" "$work/bundle.tar.gz" | sha256sum -c -
test "$(tar -xOzf "$work/bundle.tar.gz" dist/revision.txt)" = "$revision"
# Refuse unexpected paths, links and special files before extracting anything.
python3 - "$work/bundle.tar.gz" <<'PY'
import sys, tarfile
from pathlib import PurePosixPath
allowed = {'dist', 'deploy', 'server.mjs', 'package.json', 'package-lock.json'}
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    names = set()
    for member in archive:
        path = PurePosixPath(member.name)
        if path.parts and path.parts[0] == '.': path = PurePosixPath(*path.parts[1:])
        if not path.parts: continue
        if path.is_absolute() or '..' in path.parts or path.parts[0] not in allowed or not (member.isfile() or member.isdir()):
            raise SystemExit('Invalid bundle entry: ' + member.name)
        names.add(str(path))
    required = {'dist/decks.json', 'server.mjs', 'package.json', 'package-lock.json', 'deploy/user/install.sh'}
    if not required <= names: raise SystemExit('Incomplete bundle: ' + ', '.join(sorted(required - names)))
PY
mkdir "$work/new"
tar -xzf "$work/bundle.tar.gz" -C "$work/new" deploy/user/install.sh
bash "$work/new/deploy/user/install.sh" "$work/bundle.tar.gz"
printf '%s\n' "$revision" > "$app_root/installed-revision"
