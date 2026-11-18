#!/usr/bin/env bash
# Type-checks the forgerdr mod's JavaScript (checkJs, strict, as the herdr app's own jsconfig sets it) against the type
# files the herdr app writes on every start: herdr.d.ts and gpui-kit.d.ts in its home (HERDR_APP_HOME,
# ~/.config/herdr-app by default). They match the app installed here, so the check runs where the app is, and says so
# and passes where it is not (CI).
# Usage: herdr/tools/typecheck.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd -P)"
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
mod="$root/herdr/mods/forgerdr"
if [ ! -f "$home/herdr.d.ts" ] || [ ! -f "$home/gpui-kit.d.ts" ]; then
  printf 'typecheck: no herdr.d.ts and gpui-kit.d.ts in %s (open the herdr app once); skipped\n' "$home"
  exit 0
fi
# name.js is written by bin/forge-herdr-install.sh into each installed copy, never into the checkout: one is made here.
[ -f "$mod/name.js" ] || printf '// Written by herdr/tools/typecheck.sh for the check.\nexport const MOD = "forgerdr";\n' > "$mod/name.js"

config="$(mktemp -d)/tsconfig.json"
trap 'rm -rf "$(dirname "$config")"' EXIT
jq -n --arg home "$home" --arg mod "$mod" '{
  compilerOptions: {
    target: "ES2022", module: "ES2022", moduleResolution: "bundler", lib: ["ES2022"],
    allowJs: true, checkJs: true, strict: true, strictNullChecks: false, noEmit: true, skipLibCheck: true, types: [],
    paths: {herdr: [($home + "/herdr.d.ts")]}
  },
  files: [($home + "/gpui-kit.d.ts")],
  include: [($mod + "/**/*.js")]
}' > "$config"
"$root/node_modules/.bin/tsc" -p "$config"
printf 'typecheck: %s passes against the herdr app in %s\n' "${mod#"$root"/}" "$home"
