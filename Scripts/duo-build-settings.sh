#!/bin/bash
# Source this file; generate one setting for device and simulator builds.
# Do not enable API references just because the phone runs a newer iOS.
mira_sdk_version="$(xcrun --sdk iphoneos --show-sdk-version)"
mira_duo_conditions="$(python3 - "$mira_sdk_version" <<'PY'
import sys
version=tuple(int(x) for x in sys.argv[1].split('.')[:2])
print('MIRA_DUO_SDK' if version >= (27,1) else '')
PY
)"
echo "Duo reserved-region API: ${mira_duo_conditions:-size-based fallback (SDK $mira_sdk_version)}"
