#!/usr/bin/env sh
# ساخت فایل zip قابل نصب در وردپرس: wordpress/dist/damoon-signal-<version>.zip
set -eu
cd "$(dirname "$0")"
VER=$(sed -n "s/^define( 'DAMOON_SIG_VER', '\([^']*\)' );/\1/p" damoon-signal/damoon-signal.php)
mkdir -p dist
rm -f "dist/damoon-signal-$VER.zip"
zip -qr "dist/damoon-signal-$VER.zip" damoon-signal -x '*.DS_Store'
echo "dist/damoon-signal-$VER.zip"
