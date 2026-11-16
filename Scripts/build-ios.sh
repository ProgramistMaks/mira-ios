#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'iOS compilation requires macOS with Xcode.' >&2
  exit 1
fi
command -v xcodebuild >/dev/null
command -v xcodegen >/dev/null
bash Scripts/prepare-local-runtime.sh
npm ci --no-audit --no-fund
npm run check
npm test
npm run build
xcodegen generate
xcodebuild -version
xcodebuild -project Companion.xcodeproj -scheme Companion -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Companion.xcarchive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO archive
python3 Scripts/check-widget-bundle.py build/Companion.xcarchive/Products/Applications/Companion.app
package_root="$(mktemp -d "${TMPDIR:-/tmp}/mira-package.XXXXXX")"
trap 'rm -rf "$package_root"' EXIT
mkdir -p "$package_root/Payload"
ditto build/Companion.xcarchive/Products/Applications/Companion.app "$package_root/Payload/Companion.app"
(
  cd "$package_root"
  /usr/bin/zip -qry Mira-unsigned.ipa Payload
)
python3 Scripts/check-ipa.py "$package_root/Mira-unsigned.ipa" --report build/Mira-package-report.json
mv -f "$package_root/Mira-unsigned.ipa" build/Mira-unsigned.ipa
echo 'Compiled archive: build/Companion.xcarchive'
echo 'Unsigned package for re-signing: build/Mira-unsigned.ipa'
echo 'This package is not installable until correctly signed. It has not passed device QA.'
