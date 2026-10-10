#!/usr/bin/env bash
# Installs or updates a reveal-classroom bundle for the current user, without root:
#   bash install.sh /path/to/bundle.tar.gz
# - extracts the bundle into ~/.local/share/$APP_NAME/app (the previous version is kept as app.old);
# - installs a private Node.js runtime unless USE_SYSTEM_NODE=1;
# - creates ~/.config/$APP_NAME/environment once, with a random presenter password;
# - installs and (re)starts the systemd user service, plus the update timer when RELEASE_URL is set.
# Settings come from deploy/instance.env inside the bundle (see deploy/instance.env.example).
# Needs: bash, tar, curl, sha256sum, python3, systemd user services (loginctl enable-linger for servers).
set -euo pipefail
bundle=$(realpath "${1:?Usage: install.sh BUNDLE.tar.gz}")
umask 077

APP_NAME=reveal-classroom UPDATE_UNIT= PORT=3000 BASE_PATH= RELEASE_URL= BUNDLE_NAME=reveal-classroom.tar.gz
NODE_VERSION=24.21.0 NODE_SHA256_LINUX_X64=fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6
NODE_SHA256_LINUX_ARM64= USE_SYSTEM_NODE=0
settings=$(mktemp)
trap 'rm -f "$settings"' EXIT
if tar -xzOf "$bundle" deploy/instance.env 2>/dev/null | tr -d '\r' > "$settings" && [ -s "$settings" ]; then
  # shellcheck disable=SC1090
  . "$settings"
fi
UPDATE_UNIT=${UPDATE_UNIT:-$APP_NAME-update}
[[ $APP_NAME =~ ^[A-Za-z0-9_.-]+$ && $UPDATE_UNIT =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "Invalid APP_NAME or UPDATE_UNIT." >&2; exit 1; }
[[ $PORT =~ ^[0-9]+$ ]] || { echo "Invalid PORT." >&2; exit 1; }
[[ -z $BASE_PATH || $BASE_PATH =~ ^/[A-Za-z0-9_~/-]+$ ]] || { echo "Invalid BASE_PATH." >&2; exit 1; }

app_root="$HOME/.local/share/$APP_NAME"
config_dir="$HOME/.config/$APP_NAME"
unit_dir="$HOME/.config/systemd/user"
mkdir -p "$app_root/runtime" "$config_dir" "$unit_dir"
exec 9>"$app_root/install.lock"
flock -w 300 9

# Node.js: private, pinned and verified runtime, or the system one.
if [ "$USE_SYSTEM_NODE" = 1 ]; then
  node_bin=$(dirname "$(command -v node)")
else
  case "$(uname -m)" in
    x86_64) arch=x64; sum=$NODE_SHA256_LINUX_X64 ;;
    aarch64|arm64) arch=arm64; sum=$NODE_SHA256_LINUX_ARM64 ;;
    *) echo "Unsupported architecture $(uname -m); set USE_SYSTEM_NODE=1." >&2; exit 1 ;;
  esac
  release=node-v$NODE_VERSION-linux-$arch
  if [ ! -x "$app_root/runtime/$release/bin/node" ]; then
    curl -fsS --max-time 300 "https://nodejs.org/dist/v$NODE_VERSION/$release.tar.xz" -o "$app_root/runtime/$release.tar.xz"
    if [ -z "$sum" ]; then
      # No pinned checksum for this architecture: use the published list (HTTPS from nodejs.org).
      sum=$(curl -fsS --max-time 60 "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" | awk -v f="$release.tar.xz" '$2 == f { print $1 }')
    fi
    (cd "$app_root/runtime" && printf '%s  %s\n' "$sum" "$release.tar.xz" | sha256sum -c -)
    tar -xJf "$app_root/runtime/$release.tar.xz" -C "$app_root/runtime"
    rm -f "$app_root/runtime/$release.tar.xz"
  fi
  ln -sfn "$release" "$app_root/runtime/node"
  node_bin="$app_root/runtime/node/bin"
fi
export PATH="$node_bin:$PATH"
node -e 'if (+process.versions.node.split(".")[0] < 22) process.exit(1)' || { echo "Node.js 22 or later is required." >&2; exit 1; }

# New version next to the current one; swap only after its dependencies are installed.
rm -rf "$app_root/app.new"
mkdir -p "$app_root/app.new"
tar -xzf "$bundle" -C "$app_root/app.new"
(cd "$app_root/app.new" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --no-update-notifier)
rm -rf "$app_root/app.old"
if [ -d "$app_root/app" ]; then mv "$app_root/app" "$app_root/app.old"; fi
mv "$app_root/app.new" "$app_root/app"
install -m 700 "$app_root/app/deploy/user/update.sh" "$app_root/update.sh"
# Lets update.sh skip a release that is already installed.
if [ -f "$app_root/app/dist/revision.txt" ]; then cp "$app_root/app/dist/revision.txt" "$app_root/installed-revision"; fi

# The password is generated once and kept across updates; edit the file to change it.
if [ ! -f "$config_dir/environment" ]; then
  printf 'PRESENTATION_PASSWORD=%s\n' "$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')" > "$config_dir/environment"
  chmod 600 "$config_dir/environment"
fi

render() {
  sed -e "s|@APP_NAME@|$APP_NAME|g" -e "s|@UPDATE_UNIT@|$UPDATE_UNIT|g" -e "s|@NODE@|$node_bin/node|g" \
      -e "s|@PORT@|$PORT|g" -e "s|@BASE_PATH@|$BASE_PATH|g" -e "s|@RELEASE_URL@|$RELEASE_URL|g" \
      -e "s|@BUNDLE_NAME@|$BUNDLE_NAME|g" "$1"
}
render "$app_root/app/deploy/user/reveal-classroom.service.in" > "$unit_dir/$APP_NAME.service"
systemctl --user daemon-reload
systemctl --user enable "$APP_NAME.service"
if [ -n "$RELEASE_URL" ]; then
  render "$app_root/app/deploy/user/update.service.in" > "$unit_dir/$UPDATE_UNIT.service"
  render "$app_root/app/deploy/user/update.timer.in" > "$unit_dir/$UPDATE_UNIT.timer"
  systemctl --user daemon-reload
  systemctl --user enable --now "$UPDATE_UNIT.timer"
fi
systemctl --user restart "$APP_NAME.service"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$PORT$BASE_PATH/health" > /dev/null 2>&1; then
    echo "$APP_NAME is running on http://127.0.0.1:$PORT$BASE_PATH/ ($(cat "$app_root/app/dist/revision.txt" 2>/dev/null || echo 'no revision'))."
    exit 0
  fi
  sleep 1
done
echo "$APP_NAME did not answer on its health check; see: journalctl --user -u $APP_NAME -n 50" >&2
exit 1
