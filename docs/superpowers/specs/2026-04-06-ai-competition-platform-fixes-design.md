# AI 竞赛平台修复与增强设计文档

**日期**: 2026-04-06
**项目**: AI Challenge Competition Platform
**背景**: 昨日12组比赛暴露三类问题，本文档描述修复与增强方案。

---

## 一、问题列表

| # | 问题 | 类型 | 优先级 |
|---|------|------|--------|
| P1 | Game1 选择答案后一闪而过显示加分内容 | Bug | 高 |
| P2 | Game3/Game4 高并发时5000端口后台崩溃 | 稳定性 | 高 |
| P3 | Game4 后台缺少实时线稿+生成图展示 | 新功能 | 中 |

---

## 二、核心约束

- **不影响学生答题体验**：任何改动不能让学生页面出现错误、卡死或丢失作答
- **改动最小化**：优先修改最少文件，不重构整体架构
- **数据安全**：迁移数据库不丢失现有数据
- **云服务器规格**：4核 8GB，必须在此资源范围内稳定运行

---

## 三、P1 — Game1 "一闪而过加分" Bug

### 根因分析

`game1.html` 中 `loadCurrentState()` 在以下四个 socket 事件触发时均会被调用：
- `game-state-update`
- `next-question`
- `show-answer`
- `game-reset`

当老师点击"下一题"时，服务端执行：
```sql
UPDATE game_state SET current_question = N+1, is_answer_shown = 0
```
随即 `io.emit('next-question', ...)` 触发客户端的多个并发 `loadCurrentState()` 调用。

**真实根因是竞态条件（Race Condition）**：
- API 端点 `/api/game1/current/:groupId` 是实时读库，无缓存
- 但 socket 事件会触发多次 `loadCurrentState()` 并发执行（如 `game-state-update` + `next-question` 同时触发）
- 后发出的 fetch 请求若更快返回（网络抖动），会覆盖先发出请求的结果
- 极端情况：旧题 `is_answer_shown=1` 的响应在切题后才返回，导致上一题答案短暂渲染

### 修复方案

**双重保护**：

1. **收到 `next-question` 事件时立即清空结果区域**（同步 DOM 操作，无延迟）：
   ```javascript
   socket.on('next-question', ({ gameId }) => {
     if (gameId === 'game1') {
       // 立即隐藏所有结果区域，防止旧状态闪现
       document.getElementById('answerRevealArea').classList.add('hidden');
       document.getElementById('resultBanner').textContent = '';
       hasPlayedOnce = false;
       loadCurrentState();
     }
   });
   ```

2. **`loadCurrentState()` 中增加 question 版本号校验**：
   - 请求开始时记录当前 `currentQuestion` 版本号
   - 响应返回后，若版本号已变（说明又切了题），则丢弃该响应，不渲染 UI

   ```javascript
   let renderVersion = 0;
   async function loadCurrentState() {
     const thisVersion = ++renderVersion;
     const res = await fetch(...);
     const data = await res.json();
     if (thisVersion !== renderVersion) return; // 丢弃过期响应
     // 正常渲染...
   }
   ```

### 改动文件
- `public/game1.html`（仅 `<script>` 内逻辑，约 +15 行）

---

## 四、P2 — 后台崩溃：两层修复

### 层1：将 `sql.js` 迁移到 `better-sqlite3`

#### 现状问题
`sql.js` 是纯 WebAssembly 内存型 SQLite：
- 整个数据库常驻内存（随数据增长）
- 每次 `saveDB()` 调用都将全量数据库序列化后写磁盘（I/O 阻塞 + CPU 峰值）
- 12组高并发写入时，`saveDB()` 被频繁调用，内存+CPU 双双飙升

#### 目标
`better-sqlite3` 是原生 Node.js SQLite 绑定：
- 直接操作文件，无全量序列化
- 同步 API，与现有代码风格完全兼容
- 内存占用从 ~200MB 降至 ~10MB
- 写入速度提升 10x+

#### 迁移策略（零数据损失）

现有 `server/data/game.db` 文件由 `sql.js` 生成，**与标准 SQLite 格式完全兼容**，`better-sqlite3` 可直接读取，无需任何格式转换。

#### `db.js` 改动对照

| 变化点 | sql.js（现在） | better-sqlite3（改后） |
|--------|---------------|----------------------|
| 初始化 | `await initSqlJs()` + 手动加载文件 | `new Database(DB_PATH)` 一行 |
| 执行查询 | `db.exec(sql)` → 手动映射列名 | `db.prepare(sql).all()` 直接返回对象 |
| 写操作 | `db.run()` + 手动 `saveDB()` | `db.prepare(sql).run()` 自动持久化 |
| 事务 | 无 | 可用 `db.transaction()` 包裹批量操作 |
| `saveDB()` | 必须手动调用 | 删除，不再需要 |
| `initDB()` | async | sync（可保留 async 包装兼容现有调用） |

#### 对上层路由的影响
路由文件（`game1.js`、`game2.js` 等）调用的是 `getAll()`、`getOne()`、`runQuery()` 三个封装函数，只需在 `db.js` 内重新实现这三个函数，**路由文件零改动**。

### 层2：AI 请求并发限流

#### 现状问题
Game3/Game4 每个请求向外部 AI API 发送含大图 base64 的请求（1-5MB/个）。
并发峰值拆分来源：
- **Game3**（你画我猜）：12组 × 1次识别 = **最多12个并发**
- **Game4**（线稿变大片）：12组 × 每次 **串行2次**（先生成图，再评分）= **最多24个并发**
- 两游戏同时进行：理论峰值 **36个并发 AI 请求**

加上响应体（含 base64 图片数据）的内存占用，瞬间内存峰值超过 8GB 上限。

#### 限流设计

创建共享限流模块 `server/utils/aiQueue.js`：

```
请求进入 → 检查并发数
  ├─ < MAX_CONCURRENT(4) → 立即执行
  └─ >= MAX_CONCURRENT  → 进入等待队列
                            └─ 前序请求完成后自动出队执行
```

参数设计：
- `MAX_CONCURRENT = 4`（匹配4核CPU，避免单核过载）
- `QUEUE_MAX_SIZE = 20`（超过20个队列请求返回错误，防止内存无限堆积）
- 请求超时：`60s`（AI生成图片较慢，给足时间）

#### 学生侧体验影响
- **正常情况**（< 4组同时提交）：无任何感知，立即响应
- **高峰期**（12组同时提交）：最慢的请求多等待 `3-15秒`
- Game3 和 Game4 前端均已有 loading 状态（按钮禁用+文字变化），无需前端改动
- 超出队列时返回 `{ error: 'AI服务繁忙，请稍后重试' }`，按钮重新可点击
  - **前端兼容性确认**：Game3 和 Game4 路由在 `catch` 块均返回 `res.status(500).json({ error: ... })`；前端在 `try/catch` 后需确保按钮恢复可用状态，**需在 game3.html 和 game4.html 的 catch 分支中补充按钮恢复逻辑**（当前代码已有 catch 但未重置按钮状态）
  - 此为额外的前端小改动，改动量约各 3 行

#### 改动文件
- 新建 `server/utils/aiQueue.js`
- `server/routes/game3.js`（在 AI fetch 调用处包裹限流）
- `server/routes/game4.js`（同上，共用同一个限流器实例）

---

## 五、P3 — Game4 后台增强（线稿变大片）

### 现状
`loadGame4()` 现有实现（dashboard.html 第611-642行）：
- ✅ 展示各组线稿图
- ✅ 展示 AI 生成图（无图时显示文字占位）
- ✅ 标注组号 + 尝试次数 + 得分
- ✅ 点击图片触发 lightbox 放大
- ❌ **平铺所有记录，不按组聚合**（12组×3次=最多36条记录混排，难以找到某组的作品）
- ❌ 缺少实时刷新（需手动切标签页才能看到新提交）
- ❌ 无生成图时的占位样式不够直观

### 增强方案

#### 1. 实时刷新
在 dashboard.html 的 socket 事件监听区加一条：

```javascript
socket.on('submission-update', ({ gameId }) => {
  // 如果当前显示的是 game4 控制面板，则自动刷新
  if (gameId === 'game4' &&
      !document.getElementById('section-game4-ctrl').classList.contains('hidden')) {
    loadGame4();
  }
});
```

`submission-update` 事件在每次学生提交后由 `game4.js` 服务端发出，已存在，只需监听。

#### 2. 展示布局优化

按组号分组显示（同一组的多次尝试聚合在一个卡片内），卡片内部按时间顺序排列：

```
┌─────────────────────────────────────┐
│  第 3 组                    共2次尝试 │
├──────────────┬──────────────────────┤
│  尝试 #1  6分 │  尝试 #2  9分        │
│  [线稿] [生成图] │  [线稿] [生成图]   │
└──────────────┴──────────────────────┘
```

#### 3. 图片放大（确认正确绑定）
现有 `openLightbox()` 函数已正确实现，确认 `loadGame4()` 中每张图片的 `onclick` 均正确调用即可。

### 改动文件
- `public/admin/dashboard.html`（`loadGame4()` 函数重写 + socket 监听补充，约 +80 行，含按组聚合逻辑）
- `public/game3.html`（catch 分支补充按钮恢复逻辑，约 +3 行）
- `public/game4.html`（catch 分支补充按钮恢复逻辑，约 +3 行）

---

## 六、改动文件汇总

| 文件 | 改动类型 | 改动量 |
|------|---------|--------|
| `server/db.js` | 核心重写（替换数据库驱动） | ~100行 |
| `server/utils/aiQueue.js` | 新建（限流队列模块） | ~60行 |
| `server/routes/game3.js` | 包裹限流调用 | ~10行 |
| `server/routes/game4.js` | 包裹限流调用 | ~10行 |
| `public/game1.html` | Bug修复（script区） | ~15行 |
| `public/admin/dashboard.html` | loadGame4重写(按组聚合)+socket监听 | ~80行 |
| `public/game3.html` | catch 分支补充按钮恢复逻辑 | ~3行 |
| `public/game4.html` | catch 分支补充按钮恢复逻辑 | ~3行 |
| `package.json` | 新增依赖 `better-sqlite3` | 1行 |

**不改动文件**：`game1.js`、`game2.js`、`admin.js`、`auth.js`、`socket/handler.js`、所有其他前端页面

---

## 七、部署注意事项

1. **安装依赖前备份数据库**：`cp server/data/game.db server/data/game.db.bak`
2. `better-sqlite3` 需要在服务器上编译原生模块：`npm install better-sqlite3`（需要 build-essential）
3. 如云服务器没有 build-essential：使用预编译版本 `better-sqlite3-sqlcipher` 或通过 Docker
4. 部署顺序：先停服务 → 备份数据库 → 安装依赖 → 替换代码 → 重启

---

## 八、回滚方案

若 `better-sqlite3` 安装失败：
- 恢复 `server/db.js` 到原版
- 回退 `package.json`
- **执行 `npm install`** 重新安装原有依赖（必须，否则 node_modules 状态不一致导致服务无法启动）
- 仅保留限流模块（P2层2）和 Bug 修复（P1、P3），同样能显著提升稳定性

---

*文档生成时间：2026-04-06*
