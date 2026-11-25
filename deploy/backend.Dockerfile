# 智约后端生产镜像
# 构建上下文为仓库根目录：docker build -f deploy/backend.Dockerfile .
FROM node:24-alpine

WORKDIR /app

# 只安装生产依赖；package-lock 由 npm ci 保证可复现
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/src ./src

ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Asia/Shanghai

EXPOSE 3000

# 以非 root 用户运行
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
