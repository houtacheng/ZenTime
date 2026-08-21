# ZenTime Docker（QNAP）

這個版本把主持台、參與者畫面、倒數狀態及 WiiM 播放控制放進 Docker。瀏覽器不播放現場聲音；聲音由 WiiM Pro 直接讀取 QNAP 上的 HTTP 音檔。

## QNAP Container Station

1. 將 `docker-version` 資料夾放到 QNAP。
2. 在 Container Station 建立 Application，選擇 `docker-compose.yml`。
3. 啟動後開啟：
   - 主持台：`http://QNAP-IP:4747/host`
   - 參與者畫面：`http://QNAP-IP:4747/display`
   - 手機控制：`http://QNAP-IP:4747/control`
4. Companion 的 ZenTime 模組把 App 位址改為 QNAP IP，連接埠維持 `4747`。

既有 WiiM Companion 模組可以繼續使用，讓 Stream Deck 額外控制音量、輸入來源或手動播放。ZenTime Docker 自己也會控制開頭磬聲、背景音樂與結尾磬聲，因此按下 ZenTime「開始」時不需要再另外按一次 WiiM 播放。

## 預設整合

- WiiM Pro MAC：`00:22:6c:36:0f:67`
- 掃描網段：`10.43.50.0/24`
- 音樂網址：`http://10.43.50.145:8088/ZenTime/music/`
- 內建開頭及結尾磬聲：`磬聲.m4a`

若自動尋找失敗，可在主持台填入 WiiM Pro IP。設定保存在 `./data/config.json`。

## 指令列啟動

```bash
docker compose up -d --build
```

Docker 使用 host network，讓容器可以直接搜尋及控制同一區域網路的 WiiM Pro。

請只在可信任的區域網路開放 `4747`，不要直接轉發到公開網際網路。
