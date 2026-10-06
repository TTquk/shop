/*
 * 站点配置 + 分类 + 商品数据
 * 纯静态部署时由 <script> 同步注入 window._data_var，保证 file:// 直接打开也能跑
 * 接入真实后端时把 setVar("MOCK", false) 并配置 setVar("API_BASE", "https://api.example.com") 即可
 */

setVar("MOCK", true);
setVar("API_BASE", "");            // 真实后端地址，例如 "https://shop-api.example.com"
setVar("ASSET_VERSION", "1.0.0");  // 静态资源版本号（对应原站的 ?v=3.6.4）

setVar("CONFIG", {
    site: {
        name: "RoseShop · 云上小店",
        slogan: "只卖最真实，最管用，最时尚的数字商品",
        sub: "稳定运营 / 在线发货 / 售后明确 / 商品实用",
        keywords: "数字商品,卡密,虚拟商品商城,静态站点",
        description: "一个纯静态、可部署到 Netlify / GitHub Pages 的虚拟商品商城",
        logo: "assets/images/logo.svg",
        uptimeSince: "2024-03-01T00:00:00+08:00",
        icp: "本站为技术演示站点，无任何备案信息"
    },
    announcement: {
        title: "公告",
        lines: [
            "欢迎光临 RoseShop 云上小店，祝各位天天开心"
        ]
    },
    // 「特别说明」面板已下线；这段文案先留着，需要时在任意页面放一个 <p data-role="notice"></p> 即可自动填充
    notice: "本站为纯前端静态站点，订单、库存、卡密均在浏览器本地生成与保存，仅用于展示业务流程。",
    // 付款界面展示的固定收款码图片：把自己的收款码命名为 fukuanma.png 丢进 assets/images/ 即可
    // （也可以直接写成 https 外链）
    payQrcode: "assets/images/fukuanma.png",
    // 页脚的「免责声明」栏已下线；这段文案先留着，需要时直接渲染 CONFIG.disclaimer 即可
    disclaimer: [
        "本站为技术演示，所有商品、价格、库存、销量均为虚构数据。",
        "虚拟商品一经售出概不退换，真实经营请以经营者公示规则为准。",
        "如需商业化，请接入合规后端服务与正规支付通道。"
    ],
    // 联系与售后（页脚 + 首页侧栏 + 商品页侧栏共用）
    contacts: [
        { type: "qq", name: "在线客服 QQ 3950769322", url: "https://wpa.qq.com/msgrd?v=1&uin=3950769322", badge: "QQ" }
    ],
    // 多语言：与 assets/data/i18n.js 中的字典一一对应
    langs: [
        { code: "zh-cn", name: "简体中文", short: "简" },
        { code: "zh-tw", name: "繁體中文", short: "繁" },
        { code: "en-us", name: "English", short: "EN" }
    ],
    // 多货币：rate 为相对基准货币的换算系数
    currencies: [
        { code: "CNY", symbol: "¥", rate: 1, decimals: 2 },
        { code: "USD", symbol: "$", rate: 0.14, decimals: 2 },
        { code: "POINT", symbol: "积分", rate: 10, decimals: 0 }
    ],
    // 付款界面只挂了一张微信收款码（CONFIG.payQrcode），所以这里也只留微信支付。
    // 以后要支持多种支付方式时，给每种方式各配一张收款码即可。
    payments: [
        { id: "wechat", name: "微信支付", icon: "assets/images/pay-wechat.svg", channel: "native", enabled: true }
    ]
});

/*
 * 分类：id 与商品 category_id 对应，0 号为「全部」
 * 下面是占位分类，按自己的业务改名即可；商品为空时分类栏不会有可选内容。
 */
setVar("CATEGORIES", [
    { id: 0, name: "全部商品", icon: "assets/images/cover-1.svg" },
    { id: 1, name: "分类一", icon: "assets/images/cover-2.svg" },
    { id: 2, name: "分类二", icon: "assets/images/cover-3.svg" },
    { id: 3, name: "分类三", icon: "assets/images/cover-4.svg" }
]);

/*
 * 商品数据
 *
 * 按下面的模板往数组里加对象即可上架。
 * 字段说明（名对齐主流发卡系统）：
 *   id           必填，唯一正整数
 *   category_id  所属分类，对应上面 CATEGORIES 的 id
 *   name         商品名
 *   cover        封面图（assets 相对路径；也可用 https 外链）
 *                建议用正方形图 —— 列表缩略图和详情页封面都是 background-size: cover，非正方图会被裁切
 *   price        基准货币（人民币）单价
 *   stock        库存数量
 *   order_sold   已售数量（仅用于展示，实际已售 = 它 + 本机下单量）
 *   delivery_way 0 = 自动发货（付款后立即出卡密），1 = 在线发货（人工联系）
 *   recommend    1 = 推荐（列表里优先排前面）
 *   tags         [{ text: "标签文字", color: "red|blue|green|purple|orange|cyan|gray" }]
 *   description  商品详情（纯文本，前台按段落渲染）
 *   config       多规格可选配置：
 *                  race 规格分组名（下单参数名固定为 race）
 *                  sku  [{ name, price, stock }]
 *
 * 模板：
 *   {
 *       id: 1, category_id: 1, name: "商品名称", cover: "assets/images/cover-1.svg",
 *       price: 9.9, stock: 100, order_sold: 0, delivery_way: 0, recommend: 1,
 *       tags: [{ text: "新品", color: "red" }],
 *       description: "这里写商品描述。",
 *       config: {
 *           race: "规格",
 *           sku: [
 *               { name: "月卡", price: 9.9, stock: 100 },
 *               { name: "年卡", price: 88, stock: 50 }
 *           ]
 *       }
 *   }
 */
setVar("COMMODITIES", [
    {
        id: 1, category_id: 1, name: "openzen client", cover: "assets/images/cover-mc.svg",
        price: 2, stock: 100, order_sold: 0, delivery_way: 1, recommend: 1,
        tags: [{ text: "热销", color: "orange" }],
        // 描述支持换行：一行 = 一个段落；其中的 http(s) 链接会自动变成可点击链接
        description: "购买后客服一对一服务，几十种游戏端随便选\n预览视频：https://www.bilibili.com/video/BV12yVE6wE5P?t=2.2",
        config: {}
    },
    {
        id: 2, category_id: 1, name: "kiss（zen升级）", cover: "assets/images/cover-kiss.svg",
        price: 3, stock: 100, order_sold: 0, delivery_way: 1, recommend: 1,
        tags: [{ text: "新品", color: "red" }],
        description: "预览视频：https://www.bilibili.com/video/BV1xeeM6QEjt?t=0",
        config: {}
    },
    {
        id: 3, category_id: 1, name: "lf21", cover: "assets/images/cover-lf21.svg",
        price: 5, stock: 100, order_sold: 0, delivery_way: 1, recommend: 1,
        tags: [{ text: "新品", color: "red" }],
        description: "预览视频：https://www.bilibili.com/video/BV1pKHf6fE4K?t=0",
        config: {}
    },
    {
        id: 4, category_id: 1, name: "脱盒", cover: "assets/images/cover-tuohe.svg",
        price: 3, stock: 100, order_sold: 0, delivery_way: 1, recommend: 1,
        tags: [{ text: "新品", color: "red" }],
        description: "使用启动器直接进入布吉岛",
        config: {}
    }
]);
