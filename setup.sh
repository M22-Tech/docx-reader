#!/usr/bin/env bash
# Prepares a fresh clone for local development. Safe to run again.
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
set -euo pipefail
cd "$(dirname "$0")"

fail() { echo "setup: $1" >&2; exit 1; }
step() { echo; echo "==> $1"; }
row() { printf '  %-12s %s\n' "$1" "$2"; }

# Runs a command quietly; prints its output only if it fails.
quiet() {
  local out
  if ! out="$("$@" 2>&1)"; then echo "$out" >&2; fail "'$*' failed"; fi
}

# shellcheck source=android-env.sh
. ./android-env.sh

install_deps() {
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
}

has_app=false
[ -f app/package.json ] && has_app=true

# With nub, make sure the Node pinned in .nvmrc is downloaded.
if command -v nub >/dev/null; then quiet nub node install; fi

step "Checking prerequisites"

command -v node >/dev/null || fail "Node 24 is required (https://nodejs.org)."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 24 ] || fail "Node 24 or later is required; found $(node -v)."
if command -v nub >/dev/null; then
  row "nub" "$(nub --version)"
fi
row "Node" "$(node -v)"
row "npm" "$(npm -v)"

jdk="$(find_jdk)"
if [ -n "$jdk" ]; then
  if [ "$(java_major "$jdk/bin/java")" -eq 17 ]; then
    row "JDK" "$(java_version "$jdk/bin/java") ($jdk)"
  else
    row "JDK" "$(java_version "$jdk/bin/java") ($jdk); React Native recommends 17, so if Android builds fail: brew install --cask zulu@17"
  fi
  export JAVA_HOME="$jdk"
else
  found="$(command -v java >/dev/null && echo "JDK $(java_major "$(command -v java)")" || echo "none")"
  if $has_app; then fail "JDK 17 is required to build the Android app; found $found. Install it with: brew install --cask zulu@17"; fi
  row "JDK" "17 not found (found $found); needed once the app exists: brew install --cask zulu@17"
fi

android_sdk="$(find_android_sdk)"
if [ -n "$android_sdk" ]; then
  export ANDROID_HOME="$android_sdk"
  platform="$( { ls "$android_sdk/platforms" 2>/dev/null || true; } | sort -t- -k2 -n | tail -1)"
  build_tools="$( { ls "$android_sdk/build-tools" 2>/dev/null || true; } | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)"
  row "Android SDK" "${platform:-no platform yet}, build-tools ${build_tools:-none yet} ($android_sdk)"
  if [ -x "$android_sdk/platform-tools/adb" ]; then
    row "adb" "$("$android_sdk/platform-tools/adb" version 2>/dev/null | sed -n 's/^Version //p' | sed -n 1p)"
  else
    if $has_app; then fail "adb is missing; install it with: sdkmanager \"platform-tools\""; fi
    row "adb" "not installed; needed once the app exists: sdkmanager \"platform-tools\""
  fi
else
  if $has_app; then fail "The Android SDK is required: brew install --cask android-commandlinetools (or Android Studio), then set ANDROID_HOME."; fi
  row "Android SDK" "not found; needed once the app exists: brew install --cask android-commandlinetools"
fi

if [ -f engine/package.json ]; then
  step "Engine: installing dependencies"
  (cd engine && install_deps)
  if grep -q '"@playwright/test"' engine/package.json; then
    step "Engine: installing Chromium for rendering tests"
    (cd engine && npx playwright install chromium)
  fi
fi

if $has_app; then
  step "App: installing dependencies"
  (cd app && install_deps)
  if grep -q '"engine:sync"' app/package.json; then
    step "App: copying the viewer into the app"
    (cd app && npm run engine:sync)
  fi
  if grep -q '"licences"' app/package.json; then
    step "App: collecting the open-source licences"
    (cd app && npm run licences)
  fi
fi

step "Done"
if $has_app; then
  echo "Start the app on a connected phone: cd app && npm run android"
else
  echo "The app doesn't exist yet; only the parts that do were set up."
fi
