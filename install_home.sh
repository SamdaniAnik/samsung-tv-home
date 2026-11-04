#!/bin/bash
# Build, sign and install the "My Home" launcher on the Samsung TV.
# Usage: ./install_home.sh [TV_IP]
set -euo pipefail
TV_IP="${1:-192.168.0.198}"
TV_SERIAL="${TV_IP}:26101"
PROFILE="SamsungIPTV"
PROJECT="$(cd "$(dirname "$0")" && pwd)"
IPTV_PROJECT="$PROJECT/../samsung-tv-iptv"
APP_ID="$(sed -n 's/.*tizen:application id="\([^"]*\)".*/\1/p' "$PROJECT/config.xml")"

export PATH="$HOME/tizen-studio/tools/ide/bin:$HOME/tizen-studio/tools:$PATH"
export TIZEN_SDK_DATA="$HOME/tizen-studio-data"

cd "$PROJECT"
cp -f "$IPTV_PROJECT/channels.js" channels.js

if [[ -x "$IPTV_PROJECT/verify_tv_certs.sh" ]]; then
  "$IPTV_PROJECT/verify_tv_certs.sh" || exit 1
fi

rm -rf .buildResult
mkdir -p .buildResult
cp -r config.xml index.html icon.png channels.js js css .buildResult/
# Do not use build-web here — it can pull extra files into the .wgt and break TV install.
tizen package -t wgt -s "$PROFILE" -o . -- .buildResult
mv -f "My Home.wgt" MyHome.wgt

sdb kill-server 2>/dev/null || true
sdb connect "$TV_IP"
sleep 2
tizen install -n MyHome.wgt -s "$TV_SERIAL"
tizen run -s "$TV_SERIAL" -p "$APP_ID"

echo "Installed. TV: Apps → Downloaded → My Home"
