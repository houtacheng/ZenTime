# ZenTime Docker（QNAP）

這個版本把主持台、參與者畫面、完整時間提醒控制及 WiiM 播放控制放進 Docker。瀏覽器不播放現場聲音；聲音由 WiiM Pro 直接讀取 QNAP 上的 HTTP 音檔。

## QNAP Container Station

1. 將 `docker-version` 資料夾放到 QNAP。
2. 在 Container Station 建立 Application，選擇 `docker-compose.yml`。
3. 啟動後開啟：
   - 主持台：`http://QNAP-IP:4747/host`
   - 參與者畫面：`http://QNAP-IP:4747/display`
   - 完整時間提醒控制：已整合在主持台同一頁
   - 四種提醒畫面：由主持台「開啟畫面」區分別開啟
   - 手機控制：`http://QNAP-IP:4747/control`
4. Companion 的 ZenTime 模組把 App 位址改為 QNAP IP，連接埠維持 `4747`。

既有 WiiM Companion 模組可以繼續使用，讓 Stream Deck 額外控制音量、輸入來源或手動播放。ZenTime Docker 自己也會控制開頭磬聲、背景音樂與結尾磬聲，因此按下 ZenTime「開始」時不需要再另外按一次 WiiM 播放。

## 預設整合

- WiiM Pro MAC：`00:22:6c:36:0f:67`
- 掃描網段：`10.43.50.0/24`
- 音樂網址：`http://10.43.50.145:8088/ZenTime/music/`
- 內建開頭及結尾磬聲：`磬聲.m4a`

若自動尋找失敗，可在主持台填入 WiiM Pro IP。設定保存在 `./data/config.json`。

已知 WiiM Pro 的固定 IP 時，建議直接在 `docker-compose.yml` 的 `WIIM_HOST` 填好，啟動時就不必掃描整個網段。

## 指令列啟動

```bash
docker compose up -d --build
```

更新程式碼之後重新部署：

```bash
docker compose up -d --build --force-recreate
```

Docker 使用 host network，讓容器可以直接搜尋及控制同一區域網路的 WiiM Pro。

## 環境變數

| 變數 | 預設值 | 說明 |
| --- | --- | --- |
| `PORT` | `4747` | 服務連接埠 |
| `DATA_DIR` | `/data` | 設定檔位置，對應 `./data` |
| `WIIM_HOST` | 空 | 指定 WiiM Pro IP，填了就跳過掃描 |
| `WIIM_MAC` | `00:22:6c:36:0f:67` | 掃描時用來認出 WiiM Pro |
| `WIIM_SCAN_PREFIX` | `10.43.50` | 掃描網段前綴 |
| `MEDIA_BASE_URL` | QNAP 音樂資料夾 | 內建磬聲的來源 |
| `AUTO_DISCOVER` | 未設定 | 設成 `false` 可停用啟動時的自動掃描 |
| `HEARTBEAT_MS` | `15000` | 閒置時推播心跳的間隔 |
| `TZ` | `Asia/Taipei` | 映像檔已裝 tzdata，時區設定才會生效 |

## 健康檢查

映像檔內建 HEALTHCHECK，每 30 秒呼叫一次 `/api/health`，Container Station 會直接顯示健康狀態。也可以手動確認：

```bash
curl http://QNAP-IP:4747/api/health
```

回傳包含版本、目前狀態、連線中的畫面數量與 WiiM 狀態。

## 權限說明

容器啟動時會先把 `./data` 的擁有者改成 `node` 使用者再降權執行，所以不需要事先調整權限。若 NAS 的資料夾權限無法變更，程式會退回以 root 執行並在 log 中說明，設定仍然存得起來。

## 與桌面版的差異

- Companion 的「參與者畫面置頂」動作在網頁版沒有作用。瀏覽器無法把視窗釘在最上層，這支 API 只保留狀態，讓 Companion 不會誤判成連線失敗。要置頂請用瀏覽器本身的全螢幕或作業系統的視窗設定。
- 聲音一律由 WiiM Pro 播放，瀏覽器不發出任何聲音。
- 字體清單是固定的常見中英文字體，不會讀取用戶端已安裝的字體。

## 安全性

服務沒有帳號密碼，任何能連到 `4747` 的人都可以控制主持台。請只在可信任的區域網路開放，不要直接轉發到公開網際網路，也不要放在反向代理後面對外提供。
