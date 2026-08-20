# 靜心主持台跨平台版

同一套程式碼支援 macOS 與 Windows 10/11。

## 開發執行

```bash
npm install
npm start
```

## 建立安裝檔

```bash
npm run pack:mac
npm run pack:win
```

Windows 會輸出 NSIS 安裝程式與免安裝 portable EXE；macOS 會輸出 DMG。未簽署版本第一次執行時，作業系統可能顯示安全提示。

網頁控制與 Companion API 維持 `http://電腦IP:4747`，路徑與原生 macOS 版相容。

Windows 關閉主持台視窗時，App 會繼續在系統匣運行。點擊或雙擊系統匣圖示可恢復主持台；只有從系統匣選單或「檔案 → 結束」才會完全離開。

macOS 關閉主持台視窗時會切換為選單列模式並從 Dock 收起。點擊選單列的單色圖示可恢復主持台，選單中也能完整控制靜心流程。

參與者畫面是無邊框視窗：拖曳空白背景可移動整個視窗；拖曳文字、目前時間或倒數則移動個別物件。
