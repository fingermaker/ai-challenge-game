# 🚀 AI 挑战赛 - 部署指南

## 📋 目录
- [快速概览](#快速概览)
- [方式一：本地运行（Windows）](#方式一本地运行windows)
- [方式二：云服务器部署](#方式二云服务器部署)
- [方式三：Docker 部署（推荐）](#方式三docker-部署推荐)
- [首次配置](#首次配置)
- [比赛前检查清单](#比赛前检查清单)
- [常见问题](#常见问题)

---

## 快速概览

| 项目 | 说明 |
|------|------|
| 运行环境 | Node.js 18+ |
| 端口 | 默认 3000（可在 .env 修改） |
| 数据库 | SQLite（内嵌，无需安装） |
| AI 服务 | 阿里百炼 DashScope API |
| 默认后台密码 | `admin1234`（首次登录强制修改） |
| 后台地址 | `http://你的IP:3000/admin/` |
| 学生入口 | `http://你的IP:3000/` |

---

## 方式一：本地运行（Windows）

适合在教室里用自己的电脑运行。

### 1. 安装 Node.js

从 [Node.js 官网](https://nodejs.org/zh-cn) 下载 **LTS 版本**（v18+），安装时保持默认设置。

安装完成后，打开 **命令提示符** 或 **PowerShell** 验证：
```powershell
node -v   # 应显示 v18.x.x 或更高
npm -v    # 应显示 9.x.x 或更高
```

### 2. 下载项目

**方式A：Git 克隆**
```powershell
git clone 你的仓库地址 ai-challenge
cd ai-challenge
```

**方式B：下载 ZIP 包**
- 从 GitHub/Gitee 下载 ZIP → 解压到任意目录

### 3. 安装依赖
```powershell
npm install
```

> ⚠️ `better-sqlite3` 需要编译环境。如果安装报错，请先安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)，或运行：
> ```powershell
> npm install --global windows-build-tools
> ```

### 4. 配置环境变量
```powershell
copy .env.example .env
```

编辑 `.env` 文件（用记事本即可）：
```env
PORT=3000
ADMIN_PASSWORD=admin1234
GROUP_COUNT=10
```

### 5. 初始化并启动
```powershell
# 初始化数据库
npm run seed

# 启动服务
node server/index.js
```

看到以下输出即启动成功：
```
╔══════════════════════════════════════════╗
║   AI Challenge Competition Server        ║
║   Running on http://localhost:3000       ║
╚══════════════════════════════════════════╝
```

### 6. 局域网访问

学生设备需与教师电脑在同一 WiFi 网络下：

1. 查看教师电脑 IP：在 PowerShell 输入 `ipconfig`，找到 **IPv4 地址**（如 `192.168.1.100`）
2. 确保 Windows 防火墙允许 3000 端口（首次运行 Node.js 时通常会自动弹出提示，选择"允许"）
3. 学生在浏览器访问：`http://192.168.1.100:3000`

---

## 方式二：云服务器部署

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

### 3. 上传并运行项目

```bash
cd /opt
git clone 你的仓库地址 ai-challenge
cd ai-challenge

cp .env.example .env
nano .env  # 编辑配置

npm install
npm run seed
node server/index.js  # 测试运行
```

### 4. 使用 PM2 守护进程

```bash
sudo npm install -g pm2

pm2 start server/index.js --name ai-challenge
pm2 save
pm2 startup

# 常用命令
pm2 status              # 查看状态
pm2 logs ai-challenge   # 查看日志
pm2 restart ai-challenge # 重启
```

### 5. 开放防火墙

```bash
# Ubuntu (ufw)
sudo ufw allow 3000

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

# 云服务商控制台的【安全组】也需要开放 3000 端口
```

---

## 方式三：Docker 部署（推荐）

Docker 部署最省心，适合 Windows 本地运行和云服务器部署。

### Windows 本地 Docker 部署

#### 1. 安装 Docker Desktop

从 [Docker Desktop 官网](https://www.docker.com/products/docker-desktop/) 下载安装。

安装完成后重启电脑，确保 Docker Desktop 正在运行（系统托盘可看到鲸鱼图标）。

验证安装：
```powershell
docker --version   # 应显示 Docker version 2x.x.x
docker compose version   # 应显示 Docker Compose version v2.x.x
```

#### 2. 准备项目

```powershell
git clone 你的仓库地址 ai-challenge
cd ai-challenge

copy .env.example .env
# 编辑 .env，设置你的后台密码
```

#### 3. 构建并运行

```powershell
# 构建镜像
docker build -t ai-challenge .

# 运行容器
docker run -d ^
  --name ai-challenge ^
  -p 3000:3000 ^
  --env-file .env ^
  -v %cd%\server\data:/app/server/data ^
  --restart unless-stopped ^
  ai-challenge

# 查看日志
docker logs -f ai-challenge
```

#### 4. 常用 Docker 命令

```powershell
docker ps                        # 查看运行中的容器
docker stop ai-challenge          # 停止
docker start ai-challenge         # 启动
docker restart ai-challenge       # 重启
docker logs -f --tail 100 ai-challenge  # 查看最后100行日志
docker rm -f ai-challenge         # 删除容器（数据保留在 server/data 目录）
```

### 云服务器 Docker 部署

#### 1. 安装 Docker

```bash
# Ubuntu
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker
sudo systemctl start docker

# 验证
docker --version
```

#### 2. 上传项目并构建

```bash
cd /opt
git clone 你的仓库地址 ai-challenge
cd ai-challenge

cp .env.example .env
nano .env  # 编辑配置
```

#### 3. 构建并运行

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

# 查看日志确认启动
docker logs -f ai-challenge
```

#### 4. 使用 Docker Compose（可选，更方便管理）

在项目根目录创建 `docker-compose.yml`：

```yaml
version: '3.8'
services:
  ai-challenge:
    build: .
    container_name: ai-challenge
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - ./server/data:/app/server/data
    restart: unless-stopped
```

然后：
```bash
docker compose up -d        # 启动
docker compose logs -f      # 查看日志
docker compose restart      # 重启
docker compose down         # 停止并删除容器
docker compose up -d --build # 重新构建并启动（代码更新后）
```

### Nginx 反向代理（可选）

如果想用 80 端口或域名访问：

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
        client_max_body_size 100M;
    }
}
```

> ⚠️ **重要**：必须配置 WebSocket 代理（`/socket.io/` 部分），否则实时通信功能将不可用！

---

## 首次配置

部署启动后的必须步骤：

### 1. 登录后台
- 访问 `http://你的IP:3000/admin/`
- 输入默认密码 `admin123`
- **系统会强制要求修改密码**，设置一个你自己的新密码

### 2. 配置 AI 接口
- 登录后台 → 系统设置 → **AI 接口配置**
- 填入你的阿里百炼 API Key
- 点击 **🧪 测试连接** 确认通过
- 点击 **💾 保存配置**

> 💡 获取 API Key：访问 [阿里云百炼控制台](https://bailian.console.aliyun.com/)
> 注册账号 → 开通百炼服务 → 创建 API Key

### 3. 准备比赛素材
- 后台 → 视频侦查员 → 上传比赛视频（MP4格式）
- 后台 → 系统设置 → 设置参赛组数

---

## 比赛前检查清单

### 部署后首次使用
- [ ] 访问网站确认页面正常加载
- [ ] 登录后台并修改默认密码
- [ ] 配置 AI 接口并测试连接成功
- [ ] 设置参赛组数
- [ ] 上传比赛视频
- [ ] 用手机测试学生端实时通信

### 每次比赛前
- [ ] 后台 → 系统设置 → 🔄 清除比赛数据（输入 RESET 确认）
- [ ] 确认所有游戏状态为"未开始"
- [ ] 打开计分大屏投影到大屏
- [ ] 让所有学生扫码/输入网址进入

### 比赛流程
1. 教师在后台依次开启各游戏
2. 学生在各自设备上参与
3. 计分大屏实时显示排名变化
4. 比赛结束后可在后台查看详细成绩

---

## 常见问题

### Q: 端口 3000 被占用？
```env
# 修改 .env 中的 PORT
PORT=8080
```

### Q: 学生设备无法连接？
1. 确认服务器防火墙/安全组已开放端口
2. 确认学生设备与服务器在同一网络，或服务器有公网IP
3. Windows 用户检查防火墙是否拦截了 Node.js
4. 如果使用 Nginx 反向代理，确认已配置 WebSocket 支持

### Q: AI 功能不可用？
1. 登录后台 → 系统设置 → AI接口配置 → 点击"测试连接"排查
2. 确认 API Key 正确（从 https://bailian.console.aliyun.com/ 获取）
3. 确认服务器能访问 `https://dashscope.aliyuncs.com`
4. 用命令测试：
```bash
curl https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions \
  -H "Authorization: Bearer 你的API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3.6-plus","messages":[{"role":"user","content":"hello"}]}'
```

### Q: Docker 构建报错 `failed to fetch anonymous token` 或网络连接超时？
这是因为国内网络无法直接访问 Docker Hub 官方镜像库。解决方法有两种：
**方法一：使用代理（推荐，如果你有科学上网工具）**
1. 打开 Docker Desktop，点击右上角齿轮 ⚙️ (Settings)
2. 左侧选择 **Resources** -> **Proxies**
3. 开启 manual proxy configuration
4. 填入你的本地代理地址（例如：`http://127.0.0.1:7890`）
5. 点击 Apply & restart，然后再试

**方法二：配置镜像加速器**
1. 打开 Docker Desktop，点击右上角齿轮 ⚙️ (Settings)
2. 左侧选择 **Docker Engine**
3. 在右侧 JSON 配置中加入 `registry-mirrors`：
```json
{
  "registry-mirrors": [
    "https://dockerhub.icu",
    "https://docker.m.daocloud.io"
  ]
}
```
4. 点击 Apply & restart，然后再试（注意：国内公共镜像站经常失效，如果不行建议尝试方法一或自行获取阿里云个人专属加速器地址）。

### Q: Docker 构建失败（better-sqlite3）？
`better-sqlite3` 需要编译环境，Dockerfile 已包含必要的构建工具。如果仍有问题：
```bash
# 清除缓存重新构建
docker build --no-cache -t ai-challenge .
```

### Q: 忘记后台密码？
```bash
# 删除数据库重新初始化（会清除所有数据！）
rm server/data/game.db
npm run seed
# 默认密码将重置为 admin1234
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

如遇到问题，请检查日志：
```bash
# PM2
pm2 logs ai-challenge --lines 100

# Docker
docker logs --tail 100 ai-challenge
```

祝比赛顺利！🎉
