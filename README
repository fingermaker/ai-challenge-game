FROM node:20-alpine

# better-sqlite3 需要编译环境
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层
COPY package.json package-lock.json ./
RUN npm ci --production

# 复制项目文件
COPY . .

# 确保数据目录存在
RUN mkdir -p server/data/uploads server/data/videos server/data/faces/real server/data/faces/fake

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["node", "server/index.js"]
