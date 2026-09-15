FROM node:22-alpine

# alpine 基底沒有時區資料，少了 tzdata 的話 compose 裡的 TZ=Asia/Taipei 不會生效；
# su-exec 用來在修好 /data 權限之後把程式降權成 node 使用者執行。
RUN apk add --no-cache tzdata su-exec

WORKDIR /app
ENV NODE_ENV=production PORT=4747 DATA_DIR=/data TZ=Asia/Taipei

COPY package.json package-lock.json server.js ./
COPY public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data && chown -R node:node /data /app

EXPOSE 4747
VOLUME ["/data"]

# 每 30 秒確認伺服器還活著，Container Station 會顯示健康狀態
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
