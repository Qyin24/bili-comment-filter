# bili-comment-filter

**清塘 · B站评论区过滤器**

把评论区这口塘清干净。

一个专门过滤 B站评论区里 AI agent 刷屏评论（俗称「大肥鱼」）的浏览器扩展，附带单文件油猴脚本版。

纯本地运行：只在你自己的浏览器里改写评论数据 —— **不上传任何数据，不碰登录态，不发外部请求**。

> **名字说明**：`bili-comment-filter` 是仓库名（便于搜索），插件本身叫 **清塘** —— 塘就是评论区，清塘就是把塘里的 AI 刷屏清出去。设置页、弹窗、扩展图标上显示的都是「清塘」。

![manifest](https://img.shields.io/badge/manifest-v3-35c0b0)
![license](https://img.shields.io/badge/license-MIT-35c0b0)
![platform](https://img.shields.io/badge/platform-Edge%20%7C%20Chrome-35c0b0)

---

## 截图

设置页（深色）：

![设置页 深色](https://cdn.jsdelivr.net/gh/Qyin24/bili-comment-filter@main/docs/screenshots/options-dark.png)

设置页（浅色）：

![设置页 浅色](https://cdn.jsdelivr.net/gh/Qyin24/bili-comment-filter@main/docs/screenshots/options-light.png)

工具栏弹窗：

<p>
  <img src="https://cdn.jsdelivr.net/gh/Qyin24/bili-comment-filter@main/docs/screenshots/popup-dark.png" alt="弹窗 深色" width="300" />
  <img src="https://cdn.jsdelivr.net/gh/Qyin24/bili-comment-filter@main/docs/screenshots/popup-light.png" alt="弹窗 浅色" width="300" />
</p>

---

## 它到底过滤什么

两条规则，互相独立，都能单独开关。

### 规则一：开头是 @ 的一级评论

B站评论区的「鱼」有个非常固定的形态 —— **正文以 @ 某人开头**，后面跟一大段 AI 腔总结：

```
@_口口漫画_ 试过并失败的路才值得成卡，踩过一次的先别写。作者三轮实测…
@逍遥不准骂散人 @这个宇宙最豪之人 @宋东泽h @没活fw桃 三轮实测我早押中了…
```

判定依据：接口返回的 `content.message` 以 `@` 开头，**且** `content.members` 里确实有人。

> **楼中楼永远不受这条规则影响。** 真人回复别人时全靠 @，把那条也砍掉评论区就废了。

### 规则二：关键词屏蔽

内置一套从真实样本提炼的「鱼味关键词」，全部**可见、可停用、可删除**，也能自己加词。

| 档位 | 说明 | 默认 |
|---|---|---|
| **A 档** | 鱼的专属自称，真人几乎不说。`本鱼`、`我只是一条鱼`、`我们鱼类`、`尾巴一摆`、`笑到尾巴` | 开启 |
| **B 档** | AI 模板腔总结句式。`最打动我`、`最值钱`、`讲得清楚`、`评论区比视频`、`主人，`、`鱼脑子`、`鲸鲸` | 开启 |
| **C 档** | 泛化的「鱼」相关词。`肥鱼`、`大肥鱼`、`小肥鱼` | **关闭** |

**为什么 C 档默认关闭？** 这条很关键。

在「专门讨论鱼」的视频里，**真人也会大量使用「肥鱼」**。真实样本：

```
好歹能知道这些肥鱼后面都有一个喂白饭的用户，比那些真的污染社区的数字乱码id水军号好得多   ← 真人，179 赞
贵，肥鱼有一个很大的优点就是便宜                                                    ← 真人
```

对这类视频开 C 档，会把最想看的那种真人评论一起灭掉。

### 关键组合：关键词只作用于「带 @ 的评论」

默认开启。因为鱼的标配是「**开头 @ + 鱼腔正文**」—— 两个条件同时满足时误判率趋近于零。

**A 档例外**：A 档词是鱼的专属自称，即使正文没有 @ 也能安全判定，所以不受这条限制。这样能抓到那些没 @ 人的鱼（比如「听不懂，我只是一条鱼 🐟」）。

---

## 安装

### 方式 1：浏览器扩展（推荐，功能完整）

适用于 Edge / Chrome。

1. 下载本仓库（`Code` → `Download ZIP`）或从 [Releases](https://github.com/Qyin24/bili-comment-filter/releases) 下载打包好的 `bili-comment-filter-vX.Y.Z.zip`
2. 解压，把得到的 `bili-comment-filter` 文件夹放到一个**固定位置**（例：`D:\Tools\bili-comment-filter`）

   > ⚠️ 别放「下载」或「桌面」然后清理掉，文件夹一旦挪动扩展就会失效。

3. 地址栏输入 `edge://extensions`（Chrome 用 `chrome://extensions`）
4. 打开「开发人员模式」
5. 点「加载解压缩的扩展」，选**包含 `manifest.json` 的那一层文件夹**
6. 工具栏出现青色小鱼图标即成功

点图标是快速开关，点「管理关键词与设置」进完整设置页。

### 方式 2：油猴脚本（分享给别人最省事）

1. 先装 [Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey
2. 打开脚本管理器 → 新建脚本 → 把 [`userscript/bili-comment-filter.user.js`](userscript/bili-comment-filter.user.js) 全文粘进去 → 保存
3. 打开任意 B站视频页即可生效

功能和扩展版等价，配置存在浏览器 localStorage 里，点右下角浮标的 ⚙ 打开设置面板。

---

## 怎么验证它有没有误伤

**先用预览模式，别急着开杀。**

1. 设置里打开「预览模式（只统计不隐藏）」
2. 刷新 B站视频页，滚到评论区
3. 右下角浮标会显示「可屏蔽 N 条（@ X · 关键词 Y）」
4. 评论照常显示，你自己判断这些该不该屏蔽
5. 确认无误后关掉预览模式，刷新，鱼就消失了

被屏蔽了多少条，浮标和扩展图标上的数字都会实时显示。

---

## 外观

设置页与弹窗都支持 **深色 / 浅色 / 跟随系统** 三态切换，选择会记在本地。

- 设置页：左下角「外观」分段控件
- 弹窗：右上角 ☀ / ☾ / ◐ 按钮，点一下循环切换
- 页面浮标也会跟着变（浅色下是白底深字）

---

## 工作原理

B站新版评论区是 Lit Web Components（`bili-comments`），正文位于 **shadow DOM** 内。这带来一个硬约束：

- **纯 CSS / uBlock 隐藏规则没用** —— CSS 打不进 shadow DOM
- 评论数据来自 `GET https://api.bilibili.com/x/v2/reply/wbi/main`（带 WBI 签名）

所以本方案在**数据层**动手：

```
页面发起请求
    ↓
main-world.js 钩住 fetch / XHR
    ↓
拿到响应 JSON，在 data.replies[] 里逐条判定
    ↓
把命中的评论从数组里摘掉
    ↓
返回改写后的响应 → 页面渲染 → 鱼从来没出现过
```

好处：

- **零闪动**：评论在渲染前就没了，不会有「先出现再消失」的抖动
- **无布局跳动**
- **不用重算签名**：只读改响应体，请求参数（含 `w_rid`/`wts`）原封不动，WBI 签名始终有效

配套文件：

| 文件 | 世界 | 职责 |
|---|---|---|
| `src/main-world.js` | MAIN | 钩 fetch/XHR、过滤评论数组、回传计数 |
| `src/content-bridge.js` | ISOLATED | 读写 chrome.storage、下发配置、渲染浮标 |
| `src/background.js` | service worker | 默认设置、工具栏徽标 |
| `src/filter.js` | 通用 | **纯函数**判定逻辑，零依赖 |
| `src/keywords.js` | 通用 | 三档词库 + 默认设置 + 主题解析 |

`filter.js` 刻意不依赖任何浏览器 API，所以扩展和油猴版能共用同一套判定。

---

## 已知局限

- **不可能 100% 抓全。** 有些鱼既不以 @ 开头、也不含任何内置关键词（例如「原来已经这么多鱼了，我还以为自己来早了」）。这类靠自定义关键词补。
- **评论总数不会变。** B站标题上的「评论 817」是服务端数字，过滤后不变。浮标会明确告诉你屏蔽了多少条。
- **B站改版会失效。** 如果某天 B站换了接口或字段，过滤会静默停止，届时需要更新。
- **只覆盖 `www.bilibili.com`。** 动态页 `t.bilibili.com`、专栏、番剧页暂未覆盖。

---

## 词库怎么来的

不是拍脑袋想的，是从三个 DSH 相关视频评论区抽样提炼的：

| 视频 | 评论数 |
|---|---|
| `BV1vgpm6nEbn` — dsh-agent-procedures 让你的DSH聚沙成塔 | 415 |
| `BV1qgnA6REhD` — 这两天b站评论区belike·DSH大肥鱼大型交流现场 | 817 |
| `BV18Ubv6tEWN` — 给 DSH 装上记忆：开源记忆插件 dsh-meow-memory | 1440 |

共 40+ 条鱼评论样本，覆盖自称、口吻、模板句、动作描写四类特征。设置页里每个内置词都标注了它对应的**原文样本**和**误判风险**，方便自己判断该不该留。

---

## 开发

无依赖、无构建步骤，纯静态 JS。

```bash
npm test          # 判定逻辑 25 条 + 响应体管线 13 条用例
npm run preview   # 启动本地预览服务器
```

预览（不用装扩展就能看界面，`?preview=1` 会注入 `chrome.*` 桩，预览的就是真实文件）：

```
http://127.0.0.1:8787/src/options.html?preview=1&theme=dark
http://127.0.0.1:8787/src/options.html?preview=1&theme=light
http://127.0.0.1:8787/src/popup.html?preview=1&theme=light
```

打包分享用的 zip（要求 PowerShell 7）：

```bash
pwsh -File build.ps1   # 产出 dist/bili-comment-filter-v<version>.zip
```

### 目录结构

```
bili-comment-filter/
├─ manifest.json                扩展清单
├─ src/
│  ├─ main-world.js             钩 fetch/XHR、数据层过滤
│  ├─ content-bridge.js         配置下发 + 统计浮标
│  ├─ background.js             service worker
│  ├─ filter.js                 判定逻辑（纯函数）
│  ├─ keywords.js               三档词库 + 默认设置 + 主题
│  ├─ popup.html/.css/.js       工具栏弹窗
│  └─ options.html/.css/.js     设置页（侧栏导航）
├─ assets/                      图标
├─ userscript/                  油猴单文件版
├─ test/                        测试用例
├─ preview/                     界面离线预览（开发用）
├─ docs/screenshots/            README 截图
└─ build.ps1                    打包脚本
```

---

## 免责声明

- 本项目仅供个人学习与自用，用于改善自己的浏览体验。
- 仅在**本地浏览器**内对本机收到的评论数据做过滤，不修改服务端任何数据，不发送任何请求，不涉及账号操作。
- 请自行遵守 [哔哩哔哩用户协议](https://www.bilibili.com/protocol/) 及所在地法律法规。
- 若权利方认为本项目不妥，可提 issue 联系，会及时处理或下架。

---

## 许可证

[MIT](LICENSE)
