#!/usr/bin/env bash
# Sign + notarize the DeepSeek Forge macOS app bundle.
# Prerequisites (one-time):
#   1. Apple Developer ID Application certificate in your keychain
#   2. Notarytool keychain profile:
#        xcrun notarytool store-credentials forge-notary \
#          --apple-id <your-apple-id> --team-id <TEAM-ID> \
#          --password <app-specific-password>
# Usage:
#   APPLE_IDENTITY="Developer ID Application: Your Name (TEAMID)" ./scripts/sign-macos.sh
set -euo pipefail

APP="src-tauri/target/release/bundle/macos/DeepSeek Forge.app"
DMG="src-tauri/target/release/bundle/dmg/DeepSeek Forge_0.5.0_aarch64.dmg"
IDENTITY="${APPLE_IDENTITY:-}"
PROFILE="${NOTARY_PROFILE:-forge-notary}"

if [[ ! -d "$APP" ]]; then
  echo "error: $APP not found — run 'npm run tauri build' first." >&2
  exit 1
fi
if [[ -z "$IDENTITY" ]]; then
  echo "error: APPLE_IDENTITY not set (example: 'Developer ID Application: Your Name (TEAMID)')" >&2
  exit 1
fi

echo "== codesign (hardened runtime + timestamp) =="
codesign --deep --force --options runtime --timestamp --sign "$IDENTITY" "$APP"

echo "== verify signature =="
codesign --verify --deep --strict --verbose=2 "$APP"

echo "== notarize =="
rm -f /tmp/forge-notarize.zip
ditto -c -k --keepParent "$APP" /tmp/forge-notarize.zip
xcrun notarytool submit /tmp/forge-notarize.zip --keychain-profile "$PROFILE" --wait

echo "== staple =="
xcrun stapler staple "$APP"

echo "== gatekeeper assessment =="
spctl -a -vv "$APP" || true
echo "done: $APP is signed, notarized and stapled."
