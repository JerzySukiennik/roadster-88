#!/bin/bash
# Roadster 88 (Godot): export the game pack and wrap it with the Godot 4.6.2 runtime into an unsigned build/Roadster88.app (no macOS export template is installed on this Mac).
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
GODOT_APP="${GODOT_APP:-/Applications/Godot.app}"
OUT="$HERE/build/Roadster88.app"
cd "$HERE"
mkdir -p build
nice -n 10 "$GODOT_APP/Contents/MacOS/Godot" --headless --path "$HERE" --export-pack "macOS" "$HERE/build/Roadster88.pck"
rm -rf "$OUT"
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources"
lipo -thin x86_64 "$GODOT_APP/Contents/MacOS/Godot" -output "$OUT/Contents/MacOS/godot_runtime" 2>/dev/null || cp "$GODOT_APP/Contents/MacOS/Godot" "$OUT/Contents/MacOS/godot_runtime"
chmod +x "$OUT/Contents/MacOS/godot_runtime"
cat > "$OUT/Contents/MacOS/Roadster88" <<'SH'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/godot_runtime" --main-pack "$DIR/../Resources/Roadster88.pck" "$@"
SH
chmod +x "$OUT/Contents/MacOS/Roadster88"
mv "$HERE/build/Roadster88.pck" "$OUT/Contents/Resources/Roadster88.pck"
cp "$HERE/tools/AppIcon.icns" "$OUT/Contents/Resources/AppIcon.icns" 2>/dev/null || true
cat > "$OUT/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key><string>en</string>
	<key>CFBundleExecutable</key><string>Roadster88</string>
	<key>CFBundleIconFile</key><string>AppIcon</string>
	<key>CFBundleIdentifier</key><string>fun.gzowo.roadster88</string>
	<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
	<key>CFBundleName</key><string>Roadster 88</string>
	<key>CFBundleDisplayName</key><string>Roadster 88</string>
	<key>CFBundlePackageType</key><string>APPL</string>
	<key>CFBundleShortVersionString</key><string>1.0</string>
	<key>CFBundleVersion</key><string>1</string>
	<key>LSApplicationCategoryType</key><string>public.app-category.racing-games</string>
	<key>LSMinimumSystemVersion</key><string>10.15</string>
	<key>NSHighResolutionCapable</key><true/>
	<key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
PLIST
codesign --remove-signature "$OUT/Contents/MacOS/godot_runtime" 2>/dev/null || true
du -sh "$OUT"
