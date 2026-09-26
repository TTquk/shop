# RoseShop · 云上小店

一个**纯静态**的虚拟商品商城（发卡网），用「服务端渲染风格 + jQuery 一页一控制器」的架构实现，
**零构建、零依赖安装、可直接部署到 Netlify / GitHub Pages**。

技术选型对齐了同类 PHP 发卡站的前端架构（`setVar/getVar` 变量注入、`ready()` 控制器加载、
`assets/{common,user}` 分层、`/user/api/index/*` 接口契约），
但把后端换成了**可在浏览器里运行的模拟服务**，因此不需要任何服务器就能把完整下单流程跑通。

> 本版本**不包含账号注册 / 登录 / 后台管理 / 订单查询**，下单无需登录（游客下单，只需填联系方式）。
> 原因见 [已知边界](#已知边界)。
>
> 📦 商品目录当前只有一件示例商品「mc客户端任选一」（¥2 / 库存 100）。
> 上架更多商品请看 `assets/data/catalog.js` 里的字段说明与模板。

> ⚠️ 本站是**技术演示**：商品、价格、库存、卡密均为虚构数据，且"支付"需要手动点「确认已支付」。
> 请不要把它当成真实店铺模板直接上线。

---

## 目录

- [快速开始](#快速开始)
- [部署](#部署)
- [架构说明](#架构说明)
- [数据模型与接口契约](#数据模型与接口契约)
- [切换到真实后端](#切换到真实后端)
- [关于后台与账号体系](#关于后台与账号体系)
- [与原站的对照](#与原站的对照)
- [已知边界](#已知边界)
- [进阶](#进阶)

---

## 快速开始

```bash
# 方式一：自带零依赖预览服务器（推荐，支持伪静态路由）
node dev-server.js
# -> http://127.0.0.1:5178/

# 方式二：直接双击 index.html
# 也能跑（数据与逻辑都通过 <script> 注入，file:// 下没有 fetch 跨域问题）
```

| 入口 | 地址 |
|---|---|
| 商店首页 | `/` 或 `/index.html` |
| 分类 | `/cat/3` |
| 商品详情 | `/item/2` |
| 收银台 | `/order/RS2026...` |

**完整体验路径**：首页 → 点商品 → 选规格 / 填联系方式 → 立即付款 →
收银台扫收款码付款 → 点「确认已支付」→ 订单变为 **已支付**（在线发货，等客服联系）。

---

## 部署

### GitHub Pages

```bash
git init
git add .
git commit -m "feat: static shop"
git branch -M main
git remote add origin https://github.com/<你>/<仓库>.html.git   # 换成你的仓库
git push -u origin main
```

仓库 Settings → Pages → Source 选 `Deploy from a branch` → `main` / `/ (root)` → Save。

已经包含 `.nojekyll`（防止 Jekyll 忽略下划线开头的文件）和 `404.html`（伪静态回退）。
**子目录部署（`https://<你>.github.io/<仓库>/`）无需改任何路径** —— 见下文 [架构说明](#架构说明)。

### Netlify

- **方式一（推荐）**：仓库连到 Netlify，Build command 留空，Publish directory 填 `.`。
- **方式二（拖拽）**：把整个文件夹拖到 Netlify Drop 即可。

职责划分：

| 文件 | 负责 |
|---|---|
| `_redirects` | **所有路由规则**，包括最后那条 `/* → /404.html 404` 兜底 |
| `netlify.toml` | 只放安全响应头与缓存策略 |

Netlify 会读取 `_redirects`，`/item/2` 这类地址会 **302** 到 `/item.html?id=2`。

> ⚠️ 不要在 `netlify.toml` 里再写一条 `[[redirects]] from = "/*"` 的兜底：
> netlify.toml 的 redirects **优先级高于 `_redirects`**，那条会把 `/item/2`、`/cat/1`
> 这类伪静态路径全部拦成 404。

### 其它静态托管

Vercel / Cloudflare Pages / 对象存储 + CDN 都可以，把整个目录当作静态根目录即可。
需要伪静态的话，把 `_redirects` 的规则翻译成对应平台的配置（Vercel 用 `vercel.json`，CF Pages 用 `_redirects` 同名文件）。

---

## 架构说明

```
.
├── index.html / item.html / order.html                    全部页面
├── 404.html                                                伪静态回退（GitHub Pages 用）
├── _redirects / netlify.toml                               部署配置
├── dev-server.js                                           零依赖本地预览服务器
└── assets/
    ├── data/                     ← 「后端数据」（用 <script> 注入，同步可用）
    │   ├── catalog.js              站点配置 / 分类 / 商品
    │   ├── i18n.js                 多语言字典（以简体原文为 key）
    │   └── cards.js                卡密前缀等配置
    ├── common/
    │   ├── css/_.css               设计令牌 + 全站组件 + 明暗主题
    │   ├── css/vendor/             Bootstrap / toastr
    │   └── js/
    │       ├── vendor/             jQuery / Bootstrap / layer / SweetAlert2 / toastr
    │       ├── ready.js            ★ 变量注入 + 控制器加载器 + 路径解析
    │       └── _.js                ★ 请求层 / i18n / 多货币 / 模拟后端 / 页头页脚
    ├── user/
    │   ├── css/index.css
    │   ├── js/_index.js            ★ trade（交易域）/ treasure（展示域）
    │   └── controller/             ★ 一页一控制器
    │       ├── index/{index,item}.js
    │       └── order/order.js
```

### 1. 变量注入：`setVar` / `getVar`

```html
<script src="assets/common/js/ready.js"></script>
<script src="assets/data/catalog.js"></script>   <!-- 内部就是 setVar("CONFIG", {...}) -->
<script>
  setVar("LANG", "zh-cn");
  setVar("CURRENCY", {code:"CNY", symbol:"¥", rate:1, decimals:2});
</script>
```

所有"服务端变量"都挂在 `window._data_var` 上，控制器里直接 `getVar('CONFIG')`。
用 `<script>` 而不是 `fetch('*.json')` 是刻意的：**同步可用（无首屏闪烁）+ `file://` 直接打开也能跑**。

### 2. 控制器加载器：`ready()`

```html
<script>ready("user/controller/index/item.js");</script>
```

`ready.js` 会按需注入 `<script>` 并记录已加载状态，支持数组、返回 `Promise`、带去重与错误兜底。

**路径解析是这套方案能同时部署在根目录和子目录的关键**：

```js
// ready.js 从自己 <script> 的 src 反推 assets 根
// https://user.github.io/repo/assets/common/js/ready.js
//   -> ASSETS_ROOT = https://user.github.io/repo/assets
//   -> SITE_ROOT   = https://user.github.io/repo
```

所以页面里全部用**相对路径**（`assets/...`），`asset()` / `url()` 负责拼接，子目录部署零改动。

### 3. 请求层：`util.get` / `util.post`

```js
util.get('/user/api/index/commodity', {categoryId: 3}, function (list) { /* ... */ });
util.post('/user/api/index/pay', data, done, fail);
trade.getCommodityList({categoryId: 3, done: fn});   // 语义化封装，控制器不直接写 URL
```

`request()` 是唯一出口，根据 `getVar('MOCK')` 决定走本地路由表还是真实后端：

| `MOCK` | 行为 |
|---|---|
| `true`（默认） | `Mock.handle()` 本地路由 + 180~420ms 随机延迟，模拟真实网络 |
| `false` | `jQuery.ajax(API_BASE + path)`，请求真实后端 |

### 4. 主题 / 多语言 / 多货币

- 主题：`light` / `dark` / `auto`，写入 `data-theme` 并同步 `data-bs-theme`（让 Bootstrap 5.3 一起切换）
- 多语言：`i18n('自动发货')` —— **以简体中文原文为 key**，缺词时原样返回；静态节点用 `data-i18n` 属性
- 多货币：价格以 CNY 为基准存储，`format.currency()` 按 `rate` 换算后再格式化（`¥9.9` / `$1.39` / 积分）

---

## 数据模型与接口契约

### 商品

```js
{
  id: 2, category_id: 1, name: "云盘超级会员 · 月卡",
  cover: "assets/images/cover-2.svg",
  price: 9.9, stock: 512, order_sold: 3321,
  delivery_way: 0,            // 0 = 自动发货（出卡密），1 = 在线发货（人工）
  recommend: 1,
  tags: [{ text: "热销", color: "orange" }],
  description: "官方直充，到账约 1-5 分钟……",
  config: {
    race: "套餐",             // 规格分组名
    sku: [ { name: "月卡", price: 9.9, stock: 512 }, ... ]   // 多规格，可独立定价与库存
  }
}
```

### 订单

```js
{
  no: "RS202609261531042895",
  item_id: 2, item_name: "...", sku: "季卡",
  price: 26, num: 2, amount: 52,
  contact: "demo@example.com",
  pay: "wechat",
  delivery_way: 1,
  status: 0,        // 0 待支付 / 1 已支付 / 2 已发货 / 3 已关闭
  created_at, paid_at, pay_expires_at,
  cards: []         // 仅 delivery_way = 0（自动发货）时由 Cards.issue() 生成
}
```

### 站点配置（`assets/data/catalog.js` 里的 `CONFIG`）

| 键 | 用途 |
|---|---|
| `site` | 店名 / slogan / 页脚备案信息 / 上线时间（页脚「已稳定运行」计时器） |
| `announcement.lines` | 公告内容，同时用于首页 hero 的两行文案 |
| `contacts` | 联系与售后（页脚 + 首页侧栏 + 商品页侧栏） |
| `payments` | 支付方式列表，数组顺序就是商品页的展示顺序，第一项默认选中（当前只配了微信支付） |
| `payQrcode` | **付款界面展示的固定收款码图片**，默认 `assets/images/fukuanma.png` |
| `langs` / `currencies` | 多语言与多货币（与 `assets/data/i18n.js` 对应） |

### 接口清单（`assets/common/js/_.js` 里的 `Mock.add(...)`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/user/api/index/data` | 站点配置 + 分类 + 统计 |
| GET | `/user/api/index/commodity` | 商品列表（`categoryId` / `keywords` / `page` / `limit`） |
| GET | `/user/api/index/item` | 商品详情 |
| POST | `/user/api/index/stock` | 查某规格的实时库存 |
| POST | `/user/api/index/valuation` | **服务端算价**（防前端改价） |
| POST | `/user/api/index/pay` | 下单，返回订单号 + 支付二维码内容 |
| GET | `/user/api/order/trade` | 轮询订单状态（真实环境由**支付回调**驱动） |
| POST | `/user/api/index/card` | 取卡密 |
| POST | `/user/api/order/paid` | 手工确认支付（演示按钮） |
| POST | `/user/api/order/close` | 关闭未支付订单并释放库存 |

对外响应一律经过 `publicOrder()` 脱敏，不把内部字段抛给前端。

---

## 切换到真实后端

1. 编辑 `assets/data/catalog.js`：

```js
setVar("MOCK", false);
setVar("API_BASE", "https://api.your-shop.com");
```

2. 后端按上表实现同样的路径与返回结构即可，**前端代码一行都不用改**。

3. 后端大致需要（PHP / Node 皆可）：

```
POST /user/api/index/pay        → 建单（事务扣库存）→ 调支付网关 → 返回二维码
POST /notify/wechat|alipay      → 验签 → Orders.settle(order) → 从卡密池发卡
GET  /user/api/order/trade      → 返回当前状态（前端每 2s 轮询）
```

> 关键点：**库存扣减、金额计算、卡密发放必须在服务端**。前端现有的 `valuation` / `stock`
> 接口只是"防改价 + 体验优化"，不能当作安全边界。

---

## 关于后台与账号体系

本版本**刻意没有实现**注册 / 登录 / 后台管理 / 订单查询。

原因很直接：纯静态站点没有任何办法保护前端凭据。任何写进 JS 里的"管理员账号"都等于
把门锁挂在门外——查看源码就能拿到。做成一个看着能用、实际毫无安全性的后台，
比不做更容易误导人，所以直接删掉了。

需要这些功能时，正确姿势是：

- **后台**：独立部署一个管理服务（PHP / Node 均可），由它连数据库并做 Session / JWT 鉴权，
  前端只做展示层；"后端下发列配置、前端通用渲染"的做法本身没问题，
  但**鉴权必须在服务端**。
- **账号体系**：注册 / 登录 / 密码找回都必须有服务端，密码用 bcrypt / argon2 加盐哈希，
  并且永远不要把密码回传给前端。
- **订单查询**：见 [已知边界](#已知边界) 第 5 条，真实项目**必须**补上。

---

## 与原站的对照

| 原站 | 本项目 | 说明 |
|---|---|---|
| PHP + nginx 服务端渲染 | 静态 HTML + JS 控制器 | 部署目标不同，被迫改造 |
| `assets/common/js/_.js`（1.9MB 巨石包） | 拆成 `vendor/*` + `_.js` | 少了 1.8MB 无用依赖（Ace 编辑器等） |
| `setVar/getVar` | ✅ 完全一致 | |
| `ready("模块/控制器/方法.js")` | ✅ 完全一致 | |
| `assets/{common,user}` 分层 | ✅ 完全一致（后台已下线） | |
| `<!--start::HOOK-->` 模板钩子 | ✅ 保留（首页/详情页） | 留给插件插入 |
| `trade.getCommodityList({done})` | ✅ 完全一致 | |
| `i18n()` / `CURRENCY{rate,decimals}` | ✅ 完全一致，并补了货币切换 UI | |
| `/user/api/index/*` 接口契约 | ✅ 完全一致 | 可无缝接回真实 PHP 后端 |
| `/_guard/auto.js` 反爬 | ❌ 静态站不需要 | 见「已知边界」 |
| MySQL + 服务端卡密池 | `localStorage` + 确定性发卡 | 演示用 |
| 3~6s 人工核对发货 | 手动点「确认已支付」 | |

---

## 已知边界

这是**静态站点**，有些事它天然做不到，必须清楚：

1. **没有用户体系，也没有后台**。本版本刻意下线了注册 / 登录 / 后台管理，
   因为纯静态方案无法隐藏前端凭据。真实项目必须把它们做成独立服务，不要照搬静态实现。
2. **数据只在当前浏览器**。订单、库存增量、卡密都在 `localStorage`：换浏览器 / 清缓存就没了，
   也无法在多人之间共享库存 —— 会"超卖"。
3. **没有真实支付，订单也不会自动流转**。收银台展示的是固定收款码图片，付款后需要**手动点「确认已支付」**；
   而且没有后台，订单会永远停在「已支付」，无法置为「已发货」——真实项目必须由服务端接收网关回调并配后台管理。
4. **卡密可被本地伪造**。`Cards.issue()` 由订单号确定性派生，安全性为零，仅供演示。
5. **没有订单查询入口**。订单号只出现在收银台地址栏，且只存在于本机。
   一旦关掉页面或清了缓存，买家就再也找不到自己的订单和卡密了。
   真实项目**必须**提供「凭订单号 / 邮箱自助查单」的服务端接口。
6. **内容不分语言**。商品名 / 描述目前只翻译了站点级文案；真实项目应让后端返回
   `name_zh_tw` / `name_en` 等多语言字段，或把商品名也加入 `assets/data/i18n.js`。

---

## 进阶

### 1. 真正的伪静态 URL（地址栏保持 `/item/2`）

当前用的是 302（地址栏会规范化成 `/item.html?id=2`），因为页面全部使用相对路径，
而 **200 rewrite 会让地址栏停在 `/item/2`，导致 `assets/...` 被解析成 `/item/assets/...` 而 404**。

想要真伪静态，二选一：

- **部署在域名根目录**（不要子目录），把页面里 `assets/...` 换成 `/assets/...`，
  然后 `_redirects` 把 302 改成 200（`/item/*  /item.html  200`）。
- 或者给每个路由建真实目录：`/item/index.html`，页面内用 `../assets/...`。路由深度和目录深度一致即可。

### 2. SEO

页面骨架（导航、页脚、公告、分类、商品列表）都是 JS 渲染的，搜索引擎抓取效果一般。
要 SEO 的话有两条路：

- 加 `sitemap.xml` + 每页真实 `<title>/<meta>`（已经做了）+ 在 `index.html` 里内联首屏商品（渐进增强）；
- 或者引入 **Eleventy / Astro** 做构建期预渲染 —— 把 `ready()` 这一层保留，只把 HTML 生成提前到构建时，
  架构不用重写。

### 3. 接真实支付（Netlify Functions 示例）

只有部署在 Netlify 才能用 Functions（GitHub Pages 没有服务端）。思路：

```
netlify/functions/create-order.js   建单 + 调支付网关，返回二维码
netlify/functions/pay-notify.js     接收网关回调 → 验签 → 发卡 → 写库
```

前端只需把 `setVar("MOCK", false)` 并让 `API_BASE` 指向 `/.netlify/functions`，
再把 `/user/api/index/pay` 等路径对应过去即可 —— 接口契约不变。

### 4. 数据换成真数据库

- **Plan A**：换成真实后端（PHP / Node / Go 都行），保持上表接口路径不变，前端零改动。
- **Plan B**：纯 Serverless 路线 —— Netlify Functions / Vercel Functions + Supabase / TiDB Serverless，
  把 `_.js` 里的 `Mock.add(...)` 逐个换成云端函数即可。

---

## License / 声明

本项目是**技术演示代码**，用于说明"PHP 发卡站前端架构如何搬到一个纯静态站点上"。
所有商品、价格、库存、销量、卡密均为虚构数据。

请勿将其用于展示或销售违法违规商品。虚拟商品的经营需遵守所在地区的法律法规，
涉及支付、税务、消费者权益的部分请咨询专业人士。
