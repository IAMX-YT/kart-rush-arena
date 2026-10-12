#!/bin/bash
set -euo pipefail
RUSH_ROOT=/home/master/rushroom
export PATH="$RUSH_ROOT/runtime/bin:$PATH"
export XDG_RUNTIME_DIR=/run/user/$(id -u)
mkdir -p "$RUSH_ROOT/releases"
exec 9>"$RUSH_ROOT/deploy.lock"
flock -n 9 || { echo 'Another Rushroom deployment is active'; exit 75; }
RUSH_RELEASE=$(mktemp -d "$RUSH_ROOT/releases/release.XXXXXXXX")
trap 'rm -f "$RUSH_RELEASE/artifact.tar.gz"' EXIT
cat > "$RUSH_RELEASE/artifact.tar.gz"
tar -xzf "$RUSH_RELEASE/artifact.tar.gz" -C "$RUSH_RELEASE"
test -f "$RUSH_RELEASE/build/server.mjs"
test -f "$RUSH_RELEASE/dist/index.html"
printf '%s\n' '{"type":"module","private":true,"dependencies":{"ws":"8.18.3","zod":"4.1.12"}}' > "$RUSH_RELEASE/package.json"
npm install --prefix "$RUSH_RELEASE" --omit=dev --ignore-scripts --no-audit --no-fund
RUSH_ACTIVE=$(curl -fsS --max-time 3 http://127.0.0.1:3210/health 2>/dev/null || true)
if [ -n "$RUSH_ACTIVE" ] && ! printf '%s' "$RUSH_ACTIVE" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.exit(JSON.parse(s).rooms===0?0:1));'; then
  echo 'Active rooms exist; deployment deferred to preserve matches.'
  exit 75
fi
RUSH_PREVIOUS=$(readlink "$RUSH_ROOT/current" || true)
ln -sfn "$RUSH_RELEASE" "$RUSH_ROOT/next"
mv -Tf "$RUSH_ROOT/next" "$RUSH_ROOT/current"
systemctl --user restart rushroom.service
for RUSH_CHECK in $(seq 1 20); do
  if curl -fsS --max-time 2 http://127.0.0.1:3210/health; then echo; exit 0; fi
  sleep 1
done
if [ -n "$RUSH_PREVIOUS" ]; then
  ln -sfn "$RUSH_PREVIOUS" "$RUSH_ROOT/next"
  mv -Tf "$RUSH_ROOT/next" "$RUSH_ROOT/current"
  systemctl --user restart rushroom.service
fi
echo 'Backend health failed; previous release restored when available.'
exit 1
