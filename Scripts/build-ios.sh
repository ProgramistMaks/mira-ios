#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'iOS compilation requires macOS with Xcode.' >&2
  exit 1
fi
command -v xcodebuild >/dev/null
command -v xcodegen >/dev/null
npm ci --no-audit --no-fund
npm run check
npm test
npm run build
xcodegen generate
xcodebuild -version
xcodebuild -project Companion.xcodeproj -scheme Companion -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Companion.xcarchive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO archive
mkdir -p build/unsigned/Payload
ditto build/Companion.xcarchive/Products/Applications/Companion.app build/unsigned/Payload/Companion.app
(
  cd build/unsigned
  /usr/bin/zip -qry ../Mira-unsigned.ipa Payload
)
echo 'Compiled archive: build/Companion.xcarchive'
echo 'Unsigned package for re-signing: build/Mira-unsigned.ipa'
echo 'This package is not installable until correctly signed. It has not passed device QA.'
