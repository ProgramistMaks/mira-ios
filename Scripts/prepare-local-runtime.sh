#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
artifact="$root/Packages/LocalLLM/Artifacts/llama.xcframework"
if [[ -f "$artifact/Info.plist" && -f "$artifact/.mira-b12430-v1" ]]; then exit 0; fi
[[ "$(uname -s)" == Darwin ]] || { echo 'Apple runtime preparation requires macOS.' >&2; exit 1; }
work="$(mktemp -d "${TMPDIR:-/tmp}/mira-llama.XXXXXX")"
trap 'rm -rf "$work"' EXIT
curl --fail --location --silent --show-error --retry 3 \
  https://github.com/ggml-org/llama.cpp/releases/download/b12430/llama-b12430-xcframework.zip -o "$work/apple.zip"
printf '%s  %s\n' 8a37cd2d49ba7f8f1415edc37b69a850459208657e6806ebc1e6e58cf9acfa5a "$work/apple.zip" | shasum -a 256 --check
unzip -q "$work/apple.zip" -d "$work/apple"
curl --fail --location --silent --show-error --retry 3 \
  https://github.com/ggml-org/llama.cpp/archive/refs/tags/b12430.tar.gz -o "$work/source.tar.gz"
printf '%s  %s\n' 3263425dc60e0ffa02aa794d73d84b4f9984a5dabf7d7b911d6665c875237d21 "$work/source.tar.gz" | shasum -a 256 --check
mkdir "$work/source"
tar -xzf "$work/source.tar.gz" --strip-components=1 -C "$work/source"
(
  cd "$work/source"
  # Simulator tests run the same inference engine on CPU; device Metal stays enabled.
  sed 's/^GGML_METAL=ON$/GGML_METAL=OFF/' build-xcframework.sh > build-mira-simulator.sh
  bash build-mira-simulator.sh ios-sim
)
official="$work/apple/build-apple/llama.xcframework"
xcodebuild -create-xcframework \
  -framework "$official/ios-arm64/llama.framework" \
  -framework "$official/macos-arm64_x86_64/llama.framework" \
  -framework "$work/source/build-ios-sim/framework/llama.framework" \
  -output "$work/llama.xcframework"
mkdir -p "$(dirname "$artifact")"
rm -rf "$artifact"
mv "$work/llama.xcframework" "$artifact"
touch "$artifact/.mira-b12430-v1"
