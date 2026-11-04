#!/bin/bash
# Builds Bytepet.app (its own name, icon and permissions) into dist/.
# Run on your Mac:  npm run build:mac
set -e
cd "$(dirname "$0")/.."

if [ ! -d node_modules/electron ] || [ ! -d node_modules/@electron/packager ]; then
  echo "📥 Installing packages first (npm install)..."
  npm install
fi

echo "🎨 Making the icon..."
ICONSET=dist/icon.iconset
rm -rf "$ICONSET" && mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s assets/icon.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z $d $d assets/icon.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o dist/Bytepet.icns

echo "📦 Packaging..."
ARCH=$(uname -m); [ "$ARCH" = "x86_64" ] && ARCH=x64
npx --no-install @electron/packager . Bytepet \
  --platform=darwin --arch="$ARCH" --overwrite --out=dist \
  --icon=dist/Bytepet.icns \
  --app-bundle-id=com.bytepet.desktop \
  --extend-info=assets/Info.extra.plist \
  --ignore='^/dist' --ignore='^/test' --ignore='^/scripts' --ignore='^/\.kiro'

APP="dist/Bytepet-darwin-$ARCH/Bytepet.app"
echo "✍️  Signing (ad-hoc, so macOS remembers its permissions)..."
codesign --force --deep --sign - "$APP"

echo ""
echo "✅ Built $APP"
echo "   Drag it into your Applications folder, then open it from there."
echo "   (First time: right-click → Open, because it isn't from the App Store.)"
open -R "$APP" 2>/dev/null || true
