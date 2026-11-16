#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
device_id=$(xcrun simctl list devices available -j | python3 -c '
import json,sys,os
devices=json.load(sys.stdin)["devices"]
version=os.environ.get("MIRA_TEST_IOS_VERSION", "26.2")
runtime_suffix="iOS-"+version.replace(".", "-")
candidates=[d for runtime, rows in devices.items() if runtime.endswith(runtime_suffix) for d in rows if "iPhone" in d["name"] and d.get("isAvailable")]
if not candidates: raise SystemExit("No available iPhone simulator for iOS "+version)
candidates.sort(key=lambda d: (d["name"] != "iPhone 16 Pro", d["name"]))
print(candidates[0]["udid"])
')
python3 - "$device_id" <<'PY'
import subprocess,sys
subprocess.run(["xcrun", "simctl", "bootstatus", sys.argv[1], "-b"], check=True, timeout=240)
PY
xcodebuild -project Companion.xcodeproj -scheme Companion \
  -destination "platform=iOS Simulator,id=$device_id" \
  -parallel-testing-enabled NO -maximum-concurrent-test-simulator-destinations 1 \
  -test-timeouts-enabled YES -default-test-execution-time-allowance 600 \
  -maximum-test-execution-time-allowance 600 \
  -resultBundlePath build/Tests.xcresult CODE_SIGNING_ALLOWED=NO test
