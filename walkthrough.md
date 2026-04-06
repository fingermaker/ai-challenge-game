# AI竞赛平台 — 修复 Walkthrough（第二轮）

## 本轮修改总览

修复了 3 个反馈问题，涉及 **6 个文件**。

---

### 1. ✅ 人脸大比拼 — 后台显示图片 + 公布答案

**问题**：之前错误地在学生端提交后立即显示结果。正确需求是——后台能看到人脸图片，老师点击"公布答案"后后台也显示和前台一样的答案（但不加分）。

#### 修改内容：

**[game2.html](file:///e:/网站开发/AI赛游戏/public/game2.html)** — 学生端（回退）
- 移除了提交后立即显示结果的逻辑
- 恢复为原始行为：提交后等老师公布答案再显示

**[dashboard.html](file:///e:/网站开发/AI赛游戏/public/admin/dashboard.html)** — 后台管理
- 新增「🖼️ 当前题目人脸」区域，显示当前题目的两张人脸图片（A / B）
- 点击"下一题"后自动加载新图片
- 点击"🔍 公布答案"后，图片下方显示 `✅ 真人` / `🤖 AI` 标签，带绿色/红色边框
- 添加 socket 事件监听，自动刷新状态

#### 照片数量调整
**[seed.js](file:///e:/网站开发/AI赛游戏/server/seed.js)**
- 调整为 **8 组**（real_1~8 配 fake_1~8，完全不重复）
- 原因：只有 8 张 fake 图片，之前的第 9 组使用了重复图片

> [!IMPORTANT]
> 部署后需要运行 `node server/seed.js` 重新初始化人脸数据为 8 组。

---

### 2. ✅ 你画我猜 — 画笔修复

**问题**：上一轮修改给 canvas 添加了 `height: 100%; flex: 1;` CSS 属性，导致 `getBoundingClientRect()` 返回值与实际坐标不匹配，画笔失效。

**[game3.html](file:///e:/网站开发/AI赛游戏/public/game3.html)**
render_diffs(file:///e:/网站开发/AI赛游戏/public/game3.html)

- 移除 canvas 的 `height: 100%; flex: 1; min-height: 450px` 样式
- 移除 `.canvas-area` 的 `display: flex; flex-direction: column; min-height: 500px`
- 改为简单的 `width: 100%; display: block`，canvas HTML 属性 `height="500"` 保证画布高度
- 浏览器自动根据宽高比 (600:500 = 6:5) 计算显示高度，`resizeCanvas()` 的 DPR 缩放逻辑正常工作

---

### 3. ✅ 线稿变大片 — AI评分标准调整

**问题**：原评分标准是评价手绘线稿的创意程度。用户要求改为评价 AI 生成后的画面有没有特别的地方。

**[game4.js](file:///e:/网站开发/AI赛游戏/server/routes/game4.js)**
render_diffs(file:///e:/网站开发/AI赛游戏/server/routes/game4.js)

- 评分对象从「手绘线稿」改为「AI生成的图片」（优先评价生成图，无生成图时回退到线稿）
- 评分标准改为：画面中特别的地方（独特元素、创意细节、有趣组合），越多分值越高

---

## 部署步骤

1. 更新代码到服务器
2. 运行 `node server/seed.js` 重新初始化人脸数据
3. 重启服务 (`pm2 restart` 或重新 `node server/index.js`)
