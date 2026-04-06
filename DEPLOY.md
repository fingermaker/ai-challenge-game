# 🚀 AI 挑战赛 - 部署指南

## 📋 目录
- [快速概览](#快速概览)
- [方式一：云服务器部署（推荐）](#方式一云服务器部署推荐)
- [方式二：宝塔面板部署（新手推荐）](#方式二宝塔面板部署新手推荐)
- [方式三：Docker 部署](#方式三docker-部署)
- [域名与HTTPS配置](#域名与https配置)
- [比赛前检查清单](#比赛前检查清单)
- [常见问题](#常见问题)

---

## 快速概览

| 项目 | 说明 |
|------|------|
| 运行环境 | Node.js 18+ |
| 端口 | 默认 3000（可在 .env 修改） |
| 数据库 | SQLite（内嵌，无需安装） |
| 依赖服务 | Gemini API（用于游戏3/4的AI识别和图像生成） |
| 后台密码 | 在 .env 中的 `ADMIN_PASSWORD` |
| 后台地址 | `http://你的IP:3000/admin/` |
| 学生入口 | `http://你的IP:3000/` |

---

## 方式一：云服务器部署（推荐）

### 1. 准备云服务器

推荐配置：
- **系统**：Ubuntu 22.04 / CentOS 8+
- **配置**：2核4G 及以上（10组学生足够）
- **带宽**：5Mbps+
- **供应商**：阿里云、腾讯云、华为云均可

### 2. 安装 Node.js

```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# CentOS / RHEL
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node -v   # 应显示 v20.x.x
npm -v    # 应显示 10.x.x
```

### 3. 上传项目

**方式A：使用 scp 上传 zip 包**
```bash
# 在本地电脑执行（将 zip 上传到服务器）
scp ai-challenge-deploy.zip root@你的服务器IP:/opt/

# 在服务器上执行
cd /opt
unzip ai-challenge-deploy.zip -d ai-challenge
cd ai-challenge
```

**方式B：使用 Git（如果有仓库）**
```bash
cd /opt
git clone 你的仓库地址 ai-challenge
cd ai-challenge
```

### 4. 配置环境变量

```bash
# 复制配置模板
cp .env.example .env

# 编辑配置（必须修改 API_KEY！）
nano .env
```

`.env` 文件关键配置：
```env
PORT=3000
ADMIN_PASSWORD=你的后台密码
API_BASE_URL=https://api.kegeai.top
API_KEY=你的真实API密钥
AI_MODEL=gemini-2.5-flash-image-preview
GROUP_COUNT=10
```

### 5. 安装依赖并初始化

```bash
# 安装 npm 依赖
npm install

# 初始化数据库（种入人脸素材）
npm run seed

# 创建必要目录
mkdir -p server/data/uploads server/data/videos
```

### 6. 测试运行

```bash
# 前台运行测试
node server/index.js

# 看到以下输出表示成功：
# Database initialized successfully
# ╔═══════════════════════════════╗
# ║   AI 挑战赛服务器已启动       ║
# ╚═══════════════════════════════╝
```

访问 `http://你的IP:3000` 测试。

### 7. 使用 PM2 守护进程（正式部署）

```bash
# 安装 PM2
sudo npm install -g pm2

# 启动应用
pm2 start server/index.js --name ai-challenge

# 设置开机自启
pm2 save
pm2 startup

# 常用 PM2 命令
pm2 status          # 查看运行状态
pm2 logs ai-challenge   # 查看日志
pm2 restart ai-challenge # 重启
pm2 stop ai-challenge    # 停止
```

### 8. 开放防火墙端口

```bash
# Ubuntu (ufw)
sudo ufw allow 3000

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

# 如果使用云服务商，还需要在控制台的【安全组】中开放 3000 端口
```

---

## 方式二：宝塔面板部署（新手推荐）

如果你的服务器安装了宝塔面板：

### 1. 安装 Node.js 管理器
- 登录宝塔面板 → 软件商店 → 搜索「PM2管理器」→ 安装

### 2. 上传项目
- 文件管理 → 进入 `/www/wwwroot/` → 上传 `ai-challenge-deploy.zip` → 解压

### 3. 配置项目
```bash
cd /www/wwwroot/ai-challenge
cp .env.example .env
nano .env  # 编辑配置
npm install
npm run seed
```

### 4. 在 PM2 管理器中添加项目
- PM2管理器 → 添加项目
- **项目目录**：`/www/wwwroot/ai-challenge`
- **启动文件**：`server/index.js`
- **项目名称**：`ai-challenge`

### 5. Nginx 反向代理（可选）
如果想用 80 端口或域名访问：

在宝塔面板 → 网站 → 添加站点 → 设置 → 反向代理：
- **代理名称**：ai-challenge
- **目标URL**：`http://127.0.0.1:3000`
- **开启 WebSocket 支持**：✅（非常重要！Socket.IO 需要）

---

## 方式三：Docker 部署

### 1. 创建 Dockerfile

在项目根目录创建 `Dockerfile`：

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN npm run seed
EXPOSE 3000
CMD ["node", "server/index.js"]
```

### 2. 构建并运行

```bash
# 构建镜像
docker build -t ai-challenge .

# 运行容器
docker run -d \
  --name ai-challenge \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/server/data:/app/server/data \
  --restart unless-stopped \
  ai-challenge

# 查看日志
docker logs -f ai-challenge
```

---

## 域名与HTTPS配置

如果你有域名，推荐使用 Nginx 反向代理 + Let's Encrypt 免费证书：

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # WebSocket 支持（Socket.IO 必须）
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 100M;  # 允许上传大视频
    }
}
```

> ⚠️ **重要**：必须配置 WebSocket 代理（`/socket.io/` 部分），否则实时通信功能将不可用！

---

## 比赛前检查清单

### 部署后首次使用
- [ ] 访问 `http://IP:3000` 确认页面正常加载
- [ ] 访问 `http://IP:3000/admin/` 输入密码登录后台
- [ ] 在后台 → 系统设置 → 设置参赛组数
- [ ] 在后台 → 视频侦查员 → 上传比赛视频（MP4格式）
- [ ] 开启一个游戏，用手机登录学生端测试实时通信

### 每次比赛前
- [ ] 后台 → 系统设置 → 🔄 清除比赛数据（输入 RESET 确认）
- [ ] 确认所有游戏状态为"未开始"
- [ ] 打开计分大屏（后台侧栏 → 计分大屏）投影到大屏
- [ ] 让所有学生扫码/输入网址进入

### 比赛流程
1. 教师在后台依次开启各游戏
2. 学生在各自设备上参与
3. 计分大屏实时显示排名变化
4. 比赛结束后可在后台查看详细成绩

---

## 常见问题

### Q: 端口 3000 被占用？
```bash
# 修改 .env 中的 PORT 为其他端口，如 8080
PORT=8080
```

### Q: 学生设备无法连接？
1. 确认服务器防火墙/安全组已开放端口
2. 确认学生设备与服务器在同一网络，或服务器有公网IP
3. 如果使用 Nginx 反向代理，确认已配置 WebSocket 支持

### Q: AI 生成功能不可用？
1. 检查 `.env` 中的 `API_KEY` 是否正确
2. 检查服务器是否能访问 `https://api.kegeai.top`
3. 用命令测试：
```bash
curl https://api.kegeai.top/v1/models \
  -H "Authorization: Bearer 你的API_KEY"
```

### Q: 如何完全重置一切？
```bash
# 方法1：在后台界面操作
# 后台 → 系统设置 → 清除全部数据

# 方法2：命令行
rm server/data/game.db
npm run seed
pm2 restart ai-challenge
```

### Q: 如何备份比赛数据？
```bash
cp server/data/game.db server/data/game_backup_$(date +%Y%m%d).db
```

### Q: 数据库文件在哪里？
```
server/data/game.db      # SQLite 数据库
server/data/uploads/     # 线稿/生成图片
server/data/videos/      # 上传的比赛视频
server/data/faces/       # 人脸素材图片
```

---

## 技术支持

如遇到问题，请检查 PM2 日志：
```bash
pm2 logs ai-challenge --lines 100
```

祝比赛顺利！🎉
