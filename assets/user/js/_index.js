/*!
 * assets/user/js/_index.js —— 前台业务对象（对应原站的 trade / treasure）
 * 这一层只做「接口 -> 语义化方法」的封装，控制器里不直接写 URL
 */

/* eslint-disable no-unused-vars */

/**
 * trade —— 交易域
 */
let trade = new class {
    constructor() { }

    /** 站点数据：公告 / 联系方式 / 分类 / 支付方式 */
    getCategoryList(done) {
        util.get('/user/api/index/data', function (res) {
            typeof done === 'function' && done(res);
        });
    }

    /**
     * 商品列表
     * @param {{keywords?:string, categoryId?:number|string, page?:number, limit?:number, done?:Function}} o
     */
    getCommodityList(o) {
        o = o || {};
        const params = {};
        if (o.keywords) params.keywords = o.keywords;
        if (o.limit && o.page) { params.limit = o.limit; params.page = o.page; }
        if (o.categoryId !== undefined && o.categoryId !== null && o.categoryId !== '') params.categoryId = o.categoryId;

        const qs = util.isEmptyOrNotJson(params) ? '' : '?' + util.objectToQueryString(params);
        util.get('/user/api/index/commodity' + qs, function (list) {
            typeof o.done === 'function' && o.done(list);
        });
    }

    /** 商品详情 */
    getItem(itemId, done) {
        util.get('/user/api/index/item?itemId=' + encodeURIComponent(itemId), function (item) {
            typeof done === 'function' && done(item);
        });
    }

    /** 查库存（切 SKU 时调用） */
    checkStock(data, done) {
        util.post('/user/api/index/stock', data, function (res) {
            typeof done === 'function' && done(res);
        });
    }

    /** 算价（金额永远由服务端算，前端只负责展示） */
    valuation(data, done) {
        util.post('/user/api/index/valuation', data, function (res) {
            typeof done === 'function' && done(res);
        });
    }

    /** 下单并拿到支付信息 */
    pay(data, done, fail) {
        util.post('/user/api/index/pay?itemId=' + encodeURIComponent(data.item_id), data, function (res) {
            typeof done === 'function' && done(res);
        }, fail);
    }

    /** 轮询订单状态（等价于等待支付回调） */
    trade(orderNo, done) {
        util.get('/user/api/order/trade?order_no=' + encodeURIComponent(orderNo), function (res) {
            typeof done === 'function' && done(res);
        });
    }

    /** 取卡密 */
    cards(orderNo, done, fail) {
        util.post('/user/api/index/card', { order_no: orderNo }, function (res) {
            typeof done === 'function' && done(res);
        }, fail);
    }

    /** 手动确认支付（演示按钮，真实场景由支付回调触发） */
    paidManually(orderNo, done, fail) {
        util.post('/user/api/order/paid', { order_no: orderNo }, function (res) {
            typeof done === 'function' && done(res);
        }, fail);
    }
};

/**
 * treasure —— 展示域的小工具集合
 */
let treasure = new class {
    constructor() { }

    /** 商品封面（用背景图占位，避免图片加载失败时出现破图） */
    thumb(cover) {
        return 'background: url(\'' + util.escapeHtml(cover) + '\') center/cover no-repeat;';
    }

    /** 后台配置的彩色标签 */
    tags(item) {
        const tags = Array.isArray(item && item.tags) ? item.tags : [];
        if (!tags.length) return '';
        return tags.map(function (t) {
            const text = String((t && t.text) || '').trim();
            if (!text) return '';
            const color = util.escapeHtml(String((t && t.color) || 'red'));
            return '<span class="acg-tag acg-tag--' + color + '">' + util.escapeHtml(text) + '</span>';
        }).join('');
    }

    /** 发货方式徽章 */
    delivery(item) {
        return item.delivery_way === 0
            ? '<span class="badge-soft badge-soft-success">' + i18n('自动发货') + '</span>'
            : '<span class="badge-soft badge-soft-info">' + i18n('在线发货') + '</span>';
    }

    /** 推荐徽章 */
    recommend(item) {
        return Number(item.recommend) === 1
            ? '<span class="badge-soft badge-soft-primary">' + i18n('推荐') + '</span>'
            : '';
    }

    /** 价格 */
    price(value) {
        return '<span class="unit">' + util.escapeHtml(format.currencySymbol()) + '</span>' + format.raw(value);
    }

    /** 订单状态徽章 */
    status(status) {
        const map = { 0: 'badge-soft-warning', 1: 'badge-soft-info', 2: 'badge-soft-success', 3: 'badge-soft-muted' };
        return '<span class="badge-soft ' + (map[status] || 'badge-soft-muted') + '">' + i18n(window.ORDER_STATUS_TEXT[status] || '') + '</span>';
    }

    /** 卡密列表（带复制按钮） */
    secrets(list) {
        return (list || []).map(function (s, i) {
            return '<div class="rs-secret mb-2">' +
                '<span>' + util.escapeHtml(s) + '</span>' +
                '<button class="rs-secret__copy" type="button" data-role="copy" data-text="' + util.escapeHtml(s) + '" title="' + i18n('复制') + '">📋</button>' +
                '</div>';
        }, this).join('');
    }

    /**
     * 渲染各页面共用的侧栏块（公告 / 联系与售后）
     * 页面里只需放 [data-role="announcement"] 之类的容器
     * @param {object} [res] 可选的 /user/api/index/data 返回值，不传则自己拉一次
     */
    renderSidebar(res) {
        const apply = function (data) {
            const cfg = (data && data.config) || {};

            const lines = (cfg.announcement && cfg.announcement.lines) || [];
            fill('[data-role="announcement"]', lines.map(function (t) {
                return '<p class="rs-footer__desc">' + util.escapeHtml(i18n(t)) + '</p>';
            }).join(''));

            fill('[data-role="contacts"]', (cfg.contacts || []).map(function (c) {
                return '<a class="rs-contact-line" target="_blank" rel="noopener" href="' + util.escapeHtml(c.url) + '">' +
                    '<span class="name">' + util.escapeHtml(i18n(c.name)) + '</span>' +
                    '<span class="badge-soft badge-soft-primary">' + util.escapeHtml(c.badge) + '</span></a>';
            }).join(''));
        };

        if (res) return apply(res);
        return trade.getCategoryList(apply);
    }
};

/** 把 html 写进容器；容器不存在时静默跳过，空内容补一个占位符 */
function fill(selector, html) {
    const $el = document.querySelectorAll(selector);
    for (let i = 0; i < $el.length; i++) {
        $el[i].innerHTML = html || '<p class="rs-footer__desc">—</p>';
    }
}
