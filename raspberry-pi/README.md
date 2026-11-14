# ZenTime Raspberry Pi

此版本在 Raspberry Pi 本機執行 ZenTime 伺服器，HDMI 桌面登入後由 Chromium kiosk 自動開啟參與者畫面。

- 控制台：`http://樹莓派IP:4747/`
- 參與者畫面：`http://樹莓派IP:4747/display`
- 本機設定與背景影片：`/var/lib/zentime`
- 伺服器服務：`zentime.service`
- HDMI 自動啟動：`~/.config/autostart/zentime-kiosk.desktop`
- HDMI 預設使用 1920×1080／60 Hz，降低 4K 合成負載；可在 kiosk 啟動環境設定 `ZENTIME_HDMI_MODE=auto` 保留原輸出模式。

需要 Raspberry Pi OS／Debian 圖形桌面、Chromium 與 Node.js 20 以上版本。背景影片支援 MP4、WebM、MOV、M4V，會靜音自動循環播放。
