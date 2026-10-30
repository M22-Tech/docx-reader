#!/usr/bin/env bash
# Finds the JDK and Android SDK for Android builds, without changing the shell's own JAVA_HOME.
# Run a command with them set:  ./android-env.sh npx expo run:android
# Or source it to use the functions (setup.sh does).

# Version of a java binary: 'openjdk version "17.0.12"' -> 17.0.12, '"1.8.0_422"' -> 1.8.0_422.
java_version() { { "$1" -version 2>&1 || true; } | sed -n 's/.* version "\([0-9][0-9._]*\).*/\1/p' | sed -n 1p; }
# Major version: 1.8.0_422 -> 8, 17.0.12 -> 17.
java_major() { java_version "$1" | awk -F. '{ print ($1 == 1) ? $2 : $1 }'; }

# A JDK 17 (React Native's recommended version) among JAVA_HOME, the JDKs installed on macOS, Android Studio's bundled JDK
# and java on PATH; otherwise the first of them that is 17 or later.
find_jdk() {
  local candidates home major fallback=""
  candidates="${JAVA_HOME:-}"
  if [ -x /usr/libexec/java_home ]; then
    candidates="$candidates
$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
  fi
  candidates="$candidates
/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  if command -v java >/dev/null; then
    candidates="$candidates
$(cd "$(dirname "$(command -v java)")/.." && pwd -P)"
  fi
  while IFS= read -r home; do
    [ -n "$home" ] && [ -x "$home/bin/java" ] || continue
    major="$(java_major "$home/bin/java")"
    if [ "${major:-0}" -eq 17 ]; then echo "$home"; return; fi
    if [ "${major:-0}" -gt 17 ] && [ -z "$fallback" ]; then fallback="$home"; fi
  done <<< "$candidates"
  echo "$fallback"
}

# ANDROID_HOME, ANDROID_SDK_ROOT, or the default Android Studio location.
find_android_sdk() {
  local sdk
  for sdk in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk"; do
    if [ -n "$sdk" ] && [ -d "$sdk" ]; then echo "$sdk"; return; fi
  done
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -euo pipefail
  [ "$#" -gt 0 ] || { echo "usage: $0 <command> [args...]" >&2; exit 2; }
  jdk="$(find_jdk)"
  [ -n "$jdk" ] || { echo "android-env: no JDK 17 or later found; install one with: brew install --cask zulu@17" >&2; exit 1; }
  sdk="$(find_android_sdk)"
  [ -n "$sdk" ] || { echo "android-env: no Android SDK found; set ANDROID_HOME" >&2; exit 1; }
  export JAVA_HOME="$jdk" ANDROID_HOME="$sdk"
  exec "$@"
fi
