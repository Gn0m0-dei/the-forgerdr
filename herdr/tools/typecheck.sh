#!/usr/bin/env bash
# Type-checks the forgerdr mod's JavaScript against the type files the herdr app writes on every start: herdr.d.ts and
# gpui-kit.d.ts in its home (HERDR_APP_HOME, ~/.config/herdr-app by default). Strict but for implicit any: every call
# into herdr and gpui-kit is checked, the mod's own parameters stay untyped. The files match the app installed here, so
# the check runs where the app is, and says so and passes where it is not (CI).
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
grep -qs "export const ROOT" "$mod/name.js" ||
  printf '// Written by herdr/tools/typecheck.sh for the check.\nexport const ROOT = "";\nexport const MOD = "forgerdr";\n' > "$mod/name.js"

config="$(mktemp -d)/tsconfig.json"
trap 'rm -rf "$(dirname "$config")"' EXIT
# lib is what herdr's QuickJS runs, probed on herdr-app 0.1.16: ES2025 and the ESNext pieces it ships. Temporal and
# decorators stay out because it has neither. Keep it in step with the mod's jsconfig.json.
jq -n --arg home "$home" --arg mod "$mod" '{
  compilerOptions: {
    target: "ES2025", module: "ES2022", moduleResolution: "bundler",
    lib: ["ES2025", "ESNext.Array", "ESNext.Collection", "ESNext.Disposable", "ESNext.Error", "ESNext.TypedArrays"],
    allowJs: true, checkJs: true, strict: true, noImplicitAny: false, strictNullChecks: false, noEmit: true, skipLibCheck: true,
    types: [],
    paths: {herdr: [($home + "/herdr.d.ts")]}
  },
  files: [($home + "/gpui-kit.d.ts")],
  include: [($mod + "/**/*.js")]
}' > "$config"
"$root/node_modules/.bin/tsc" -p "$config"
printf 'typecheck: %s passes against the herdr app in %s\n' "${mod#"$root"/}" "$home"
