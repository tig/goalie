#!/usr/bin/env bash
# Publish server/ to the host in GOALIE_DEPLOY_HOST.
# The account, the installer, and the public name live in excaliwire/operations.
# This file must not name the machine or the public hostname.
set -euo pipefail
umask 077

installer=/usr/local/sbin/excaliwire-goalie-install

need() {
  if [[ -z "${!1:-}" ]]; then
    printf 'missing %s\n' "$1" >&2
    exit 1
  fi
}

need GOALIE_DEPLOY_HOST
need GOALIE_DEPLOY_USER
need GOALIE_DEPLOY_SSH_KEY
if [[ "${GOALIE_INSTALLER:-}" != "$installer" ]]; then
  printf 'GOALIE_INSTALLER must be %s\n' "$installer" >&2
  exit 1
fi

root=$(cd "$(dirname "$0")/../.." && pwd)
server="$root/server"
for name in package.json package-lock.json src/server.ts; do
  if [[ ! -s "$server/$name" ]]; then
    printf 'missing server/%s\n' "$name" >&2
    exit 1
  fi
done

key=$(mktemp)
stage=$(mktemp -d)
trap 'rm -f "$key"; rm -rf "$stage"' EXIT
printf '%s\n' "$GOALIE_DEPLOY_SSH_KEY" | tr -d '\r' > "$key"
chmod 600 "$key"

cp "$server/package.json" "$server/package-lock.json" "$stage/"
mkdir -p "$stage/src"
cp -a "$server/src/." "$stage/src/"
if [[ -d "$stage/node_modules" || -d "$stage/src/node_modules" ]]; then
  printf 'refusing to publish node_modules\n' >&2
  exit 1
fi

ssh_opts=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)
remote="${GOALIE_DEPLOY_USER}@${GOALIE_DEPLOY_HOST}"
ssh "${ssh_opts[@]}" "$remote" 'mkdir -p ~/goalie-deploy && find ~/goalie-deploy -mindepth 1 -delete'
# RSYNC_RSH keeps the key path out of a second quoted command string.
RSYNC_RSH="ssh -i ${key} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20"
export RSYNC_RSH
rsync -az --delete "$stage/" "${remote}:goalie-deploy/"
# The installer path is a local constant. The remote shell must receive that path.
# shellcheck disable=SC2029
ssh "${ssh_opts[@]}" "$remote" sudo "$installer"
