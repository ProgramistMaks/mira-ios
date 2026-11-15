#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
device_id=$(xcrun simctl list devices available -j | python3 -c '
import json,sys
devices=json.load(sys.stdin)["devices"]
candidates=[d for runtime, rows in devices.items() if "iOS" in runtime for d in rows if "iPhone" in d["name"] and d.get("isAvailable")]
if not candidates: raise SystemExit("No available iPhone simulator installed")
print(candidates[0]["udid"])
')
xcodebuild -project Companion.xcodeproj -scheme Companion \
  -destination "platform=iOS Simulator,id=$device_id" \
  -resultBundlePath build/Tests.xcresult CODE_SIGNING_ALLOWED=NO test
