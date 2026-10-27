#!/usr/bin/env bash
set -euo pipefail

# Run the production AVQueuePlayer engine with local PCM files on an iOS
# simulator. The Expo module is a separate shim, so no React runtime is needed.
simulator_id=$(xcrun simctl list devices available --json | python3 -c '
import json, sys
devices = [device for runtime in json.load(sys.stdin)["devices"].values()
           for device in runtime if "iPhone" in device["name"]]
if not devices:
    raise SystemExit("No available iPhone simulator runtime")
print(next((device for device in devices if device["state"] == "Booted"), devices[0])["udid"])
')
if ! xcrun simctl list devices booted | grep -Fq "$simulator_id"; then
  xcrun simctl boot "$simulator_id"
fi
xcrun simctl bootstatus "$simulator_id" -b
test_binary="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/mavrixfy-ios-engine-tests"
xcrun swiftc -parse-as-library \
  -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  -target "$(uname -m)-apple-ios17.0-simulator" \
  modules/mavrixfy-playback/ios/PlaybackCommandValues.swift \
  modules/mavrixfy-playback/ios/PlaybackTimeline.swift \
  modules/mavrixfy-playback/ios/NativePlayback.swift \
  scripts/ios-playback-engine.test.swift \
  -o "$test_binary"
codesign --force --sign - "$test_binary"
xcrun simctl spawn "$simulator_id" "$test_binary"
