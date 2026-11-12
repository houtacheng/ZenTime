#!/bin/bash
set -u

URL="http://127.0.0.1:4747/display"
for _ in $(seq 1 60); do
  if curl --silent --fail --max-time 1 http://127.0.0.1:4747/api/health >/dev/null; then
    break
  fi
  sleep 1
done

# 專用 HDMI 顯示不需要桌面面板；關閉面板可避免系統更新通知覆蓋活動畫面。
pkill lxpanel-pi 2>/dev/null || true

# 活動現場必須持續輸出：停用 X11 螢幕保護、畫面空白與 DPMS 自動關閉。
xset s off
xset s noblank
xset -dpms

# Raspberry Pi 的 /usr/bin/chromium 包裝器會自動載入桌面擴充功能，
# 其中的翻譯提示會覆蓋 HDMI 畫面；直接啟動 Chromium 主程式可保持 kiosk 乾淨。
exec /usr/lib/chromium/chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-extensions \
  --disable-component-extensions-with-background-pages \
  --disable-translate \
  --disable-features=Translate,TranslateUI \
  --password-store=basic \
  --autoplay-policy=no-user-gesture-required \
  --overscroll-history-navigation=0 \
  --user-data-dir=/home/pi/.config/zentime-kiosk \
  "$URL"
