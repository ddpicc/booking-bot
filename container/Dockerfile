# 使用官方 Node.js 镜像作为基础镜像
FROM node:16-slim

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install --production

# 复制源代码
COPY src ./src

# 暴露端口（微信云托管默认使用 80 端口）
EXPOSE 80

# 启动命令
CMD [ "node", "src/index.js" ]
