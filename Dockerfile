# 构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装 yarn
RUN apk add --no-cache yarn

# 安装生产依赖并清理缓存
RUN yarn install --production && \
    yarn cache clean && \
    # 清理不必要的文件，减少镜像体积
    rm -rf node_modules/.cache && \
    rm -rf node_modules/.git && \
    rm -rf node_modules/.github && \
    rm -rf node_modules/*/test && \
    rm -rf node_modules/*/tests && \
    rm -rf node_modules/*/docs && \
    rm -rf node_modules/*/.github && \
    rm -rf node_modules/*/*.md && \
    rm -rf node_modules/*/*.ts && \
    rm -rf node_modules/*/*.map && \
    # 压缩 node_modules
    tar czf node_modules.tar.gz node_modules && \
    rm -rf node_modules

# 复制源代码
COPY . .

# 生产阶段
FROM node:18-alpine

# 安装 tini
RUN apk add --no-cache tini

# 设置工作目录
WORKDIR /app

# 从构建阶段复制需要的文件
COPY --from=builder /app/node_modules.tar.gz /app/package.json /app/index.js ./

# 解压 node_modules 并清理
RUN tar xzf node_modules.tar.gz && \
    rm node_modules.tar.gz

# 创建并使用非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# 设置环境变量
ENV NODE_ENV=production

# 暴露端口
EXPOSE 3000

# 使用 tini 作为入口点
ENTRYPOINT ["/sbin/tini", "--"]

# 启动命令
CMD ["node", "--optimize-for-size", "--max-old-space-size=256", "index.js"]