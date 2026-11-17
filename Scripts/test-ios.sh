#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build
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
python3 - "$device_id" <<'PY' 2>&1 | tee build/simulator-boot.log
import subprocess,sys
subprocess.run(["xcrun", "simctl", "bootstatus", sys.argv[1], "-b"], check=True, timeout=420)
PY
# Positional arguments handle an empty selection under macOS Bash 3.2 + nounset.
set --
case "${MIRA_NATIVE_TEST_SCOPE:-full}" in
  full) ;;
  voice_and_routes)
    set -- -only-testing:CompanionUITests/VoiceConversationTests -only-testing:CompanionUITests/WidgetRouteTests
    ;;
  *) echo 'Unknown native test scope' >&2; exit 2 ;;
esac
echo "Native test scope: ${MIRA_NATIVE_TEST_SCOPE:-full}"
source Scripts/duo-build-settings.sh
xcodebuild -project Companion.xcodeproj -scheme Companion \
  -destination "platform=iOS Simulator,id=$device_id" \
  -parallel-testing-enabled NO -maximum-concurrent-test-simulator-destinations 1 \
  -test-timeouts-enabled YES -default-test-execution-time-allowance 1200 \
  -maximum-test-execution-time-allowance 1200 \
  -resultBundlePath build/Tests.xcresult "$@" "SWIFT_ACTIVE_COMPILATION_CONDITIONS=\$(inherited) $mira_duo_conditions" CODE_SIGNING_ALLOWED=NO test 2>&1 | tee build/native-tests.log
