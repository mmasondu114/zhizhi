#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo 'Build this installer on an Apple Silicon Mac (GitHub Actions macos-15 is supported).' >&2; exit 1
fi
VERSION="$(node -p 'require("./package.json").version')"
case "$VERSION" in *[!0-9.]*|'') echo 'Invalid release version' >&2; exit 1;; esac
NODE_VERSION=24.16.0
WORK="$(mktemp -d "${TMPDIR:-/tmp}/zhizhi-build.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
APP="$WORK/payload/Applications/Zhizhi.app"
RES="$APP/Contents/Resources"
mkdir -p "$RES/app" "$RES/runtime/bin" "$APP/Contents/MacOS" release
curl --fail --location --retry 3 "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-arm64.tar.gz" -o "$WORK/node.tar.gz"
curl --fail --location --retry 3 "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o "$WORK/SHASUMS256.txt"
EXPECTED="$(awk '$2 == "node-v24.16.0-darwin-arm64.tar.gz" {print $1}' "$WORK/SHASUMS256.txt")"
[ "${#EXPECTED}" -eq 64 ] || { echo 'Missing official Node checksum' >&2; exit 1; }
printf '%s  %s\n' "$EXPECTED" "$WORK/node.tar.gz" | shasum -a 256 -c -
tar -xzf "$WORK/node.tar.gz" -C "$WORK"
cp "$WORK/node-v${NODE_VERSION}-darwin-arm64/bin/node" "$RES/runtime/bin/node"
cp "$WORK/node-v${NODE_VERSION}-darwin-arm64/LICENSE" "$RES/runtime/LICENSE"
npm run build
cp package.json package-lock.json "$RES/app/"
cp -R server shared platform dist "$RES/app/"
# Install production dependencies for this ARM Mac, never reuse Windows node_modules.
(cd "$RES/app" && npm ci --omit=dev --no-audit --no-fund)
xcrun swiftc -target arm64-apple-macos14.0 -O -framework Security platform/macos/Keychain.swift -o "$RES/zhizhi-keychain"
xcrun swiftc -target arm64-apple-macos14.0 -O -framework AppKit platform/macos/Launcher.swift -o "$APP/Contents/MacOS/Zhizhi"
xcrun swift scripts/macos-icon.swift "$WORK/icon.png"
mkdir -p "$WORK/AppIcon.iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$WORK/icon.png" --out "$WORK/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$WORK/icon.png" --out "$WORK/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$WORK/AppIcon.iconset" -o "$RES/AppIcon.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>io.github.mmasondu114.zhizhi</string>
<key>CFBundleName</key><string>Zhizhi</string>
<key>CFBundleDisplayName</key><string>知枝</string>
<key>CFBundleExecutable</key><string>Zhizhi</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>$VERSION</string>
<key>CFBundleShortVersionString</key><string>$VERSION</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSMultipleInstancesProhibited</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
plutil -lint "$APP/Contents/Info.plist"
IDENTITY="${MAC_APP_SIGN_IDENTITY:--}"
SIGN_ARGS=(--force --sign "$IDENTITY")
if [ "$IDENTITY" != '-' ]; then SIGN_ARGS+=(--options runtime --timestamp); fi
while IFS= read -r -d '' binary; do codesign "${SIGN_ARGS[@]}" "$binary"; done < <(find "$RES/app/node_modules" -type f \( -name '*.node' -o -name '*.dylib' \) -print0)
codesign "${SIGN_ARGS[@]}" --entitlements platform/macos/entitlements.plist "$RES/runtime/bin/node"
codesign "${SIGN_ARGS[@]}" "$RES/zhizhi-keychain"
codesign "${SIGN_ARGS[@]}" "$APP/Contents/MacOS/Zhizhi"
codesign "${SIGN_ARGS[@]}" "$APP"
codesign --verify --deep --strict "$APP"
# Test the actual bundled runtime before packaging.
[ "$("$RES/runtime/bin/node" -p 'process.platform+"/"+process.arch')" = 'darwin/arm64' ]
if ! "$APP/Contents/MacOS/Zhizhi" --smoke-test; then
  if [ "${CI:-}" = true ]; then tail -60 "$HOME/Library/Application Support/Zhizhi/server.log" || true; fi
  exit 1
fi
pkgbuild --analyze --root "$WORK/payload" "$WORK/components.plist"
/usr/libexec/PlistBuddy -c 'Set :0:BundleIsRelocatable false' "$WORK/components.plist"
mkdir -p "$WORK/installer-scripts"
cp platform/macos/installer-scripts/preinstall "$WORK/installer-scripts/preinstall"
chmod 755 "$WORK/installer-scripts/preinstall"
pkgbuild --root "$WORK/payload" --scripts "$WORK/installer-scripts" --component-plist "$WORK/components.plist" --install-location / --identifier io.github.mmasondu114.zhizhi --version "$VERSION" "$WORK/component.pkg"
productbuild --synthesize --package "$WORK/component.pkg" "$WORK/distribution.xml"
python3 - "$WORK/distribution.xml" <<'PY'
import sys, xml.etree.ElementTree as ET
p=sys.argv[1]; tree=ET.parse(p); root=tree.getroot()
ET.SubElement(root,'title').text='知枝 · 交互式知识树'
options=root.find('options')
if options is None: options=ET.SubElement(root,'options')
options.set('hostArchitectures','arm64'); options.set('customize','never')
volume=ET.SubElement(root,'volume-check'); versions=ET.SubElement(volume,'allowed-os-versions'); ET.SubElement(versions,'os-version',{'min':'14.0'})
tree.write(p,encoding='utf-8',xml_declaration=True)
PY
OUTPUT="$(pwd)/release/Zhizhi-${VERSION}-macos-arm64.pkg"
PKG_SIGN=()
if [ -n "${MAC_INSTALLER_SIGN_IDENTITY:-}" ]; then PKG_SIGN=(--sign "$MAC_INSTALLER_SIGN_IDENTITY" --timestamp); fi
productbuild --distribution "$WORK/distribution.xml" --package-path "$WORK" "${PKG_SIGN[@]}" "$OUTPUT"
if [ -n "${MAC_NOTARY_PROFILE:-}" ]; then
  [ "$IDENTITY" != '-' ] && [ -n "${MAC_INSTALLER_SIGN_IDENTITY:-}" ] || { echo 'Notarization requires both Developer ID identities' >&2; exit 1; }
  xcrun notarytool submit "$OUTPUT" --keychain-profile "$MAC_NOTARY_PROFILE" --wait
  xcrun stapler staple "$OUTPUT"
  spctl --assess --type install --verbose "$OUTPUT"
fi
(cd release && shasum -a 256 "Zhizhi-${VERSION}-macos-arm64.pkg" > SHA256SUMS.txt)
echo "Built: $OUTPUT"
