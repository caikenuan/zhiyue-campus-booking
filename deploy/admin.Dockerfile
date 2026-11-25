# 智约管理后台生产镜像：Node 构建 + Nginx 托管
# 构建上下文为仓库根目录：docker build -f deploy/admin.Dockerfile .
FROM node:22-alpine AS build

WORKDIR /app

COPY frontend/admin/package.json frontend/admin/package-lock.json ./
RUN npm ci

COPY frontend/admin/ ./
RUN npm run build

FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
