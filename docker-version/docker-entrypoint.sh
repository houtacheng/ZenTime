#!/bin/sh
set -e

# /data 可能是 QNAP 上由 root 建立的 bind mount。先把權限補好，再降權執行，
# 這樣設定檔一定寫得進去，程式本身也不會用 root 跑。
DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR" 2>/dev/null || echo "提醒：無法變更 $DATA_DIR 權限，改用目前使用者執行"
  if su-exec node test -w "$DATA_DIR"; then
    exec su-exec node "$@"
  fi
  echo "提醒：$DATA_DIR 對 node 使用者唯讀，本次以 root 執行以保留設定儲存功能"
fi

exec "$@"
