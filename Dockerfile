FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# yt-dlp 用于解析抖音/B站之外的其他站点（YouTube、小红书等）；没有时自动跳过
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip \
 && python3 -m pip install --no-cache-dir --break-system-packages yt-dlp \
 && rm -rf /var/lib/apt/lists/* /root/.cache/pip
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
EXPOSE 3000
CMD ["node", "dist-server/index.js"]
