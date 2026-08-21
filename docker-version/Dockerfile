FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
RUN mkdir -p /data
ENV PORT=4747 DATA_DIR=/data
EXPOSE 4747
VOLUME ["/data"]
CMD ["node", "server.js"]
