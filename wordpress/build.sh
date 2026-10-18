#!/usr/bin/env sh
# ساخت فایل‌های zip قابل نصب در وردپرس: wordpress/dist/<افزونه>-<version>.zip
set -eu
cd "$(dirname "$0")"
mkdir -p dist
build() {
	VER=$(sed -n "s/^define( '$2', '\([^']*\)' );/\1/p" "$1/$1.php")
	rm -f "dist/$1-$VER.zip"
	zip -qr "dist/$1-$VER.zip" "$1" -x '*.DS_Store'
	echo "dist/$1-$VER.zip"
}
build damoon-signal DAMOON_SIG_VER
build damoon-boost DAMOON_BOOST_VER
