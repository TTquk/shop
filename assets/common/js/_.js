/*!
 * _.js —— 公共运行时（对应原站 assets/common/js/_.js 里的 jQuery 全家桶 + 业务工具层）
 *
 * 分层：
 *   1. LS           本地持久化（替代服务端数据库）
 *   2. Lang / Cur / Theme   多语言 · 多货币 · 明暗主题
 *   3. util         请求层 + 通用工具（util.get / util.post 与原站调用签名一致）
 *   4. format       金额 / 数字 / 时间格式化
 *   5. Stock / Cards / Orders   库存 · 卡密 · 订单（浏览器本地的「服务端」）
 *   6. Mock         模拟后端路由表，与真实后端接口一一对应
 *   7. Chrome       全站页头页脚渲染
 *   8. ui           toast / layer / Swal 封装
 *
 * 切换真实后端：setVar("MOCK", false); setVar("API_BASE", "https://your-api.com")
 */
(function () {
    'use strict';

    var CONFIG = getVar('CONFIG') || {};
    var SITE = CONFIG.site || {};

    /* ============================================================
     * 1. 本地持久化
     * ============================================================ */
    var LS = {
        get: function (key, def) {
            try {
                var raw = localStorage.getItem(key);
                return raw === null ? def : JSON.parse(raw);
            } catch (e) { return def; }
        },
        set: function (key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 隐私模式 */ }
            return value;
        },
        del: function (key) { try { localStorage.removeItem(key); } catch (e) { } }
    };
    window.LS = LS;

    var K = {
        lang: 'rs.lang', cur: 'rs.cur', theme: 'rs.theme',
        orders: 'rs.orders', sold: 'rs.sold', logs: 'rs.logs'
    };

    /* ============================================================
     * 2. 多语言 / 多货币 / 主题
     * ============================================================ */
    var I18N = getVar('I18N') || {};

    window.Lang = {
        list: CONFIG.langs || [{ code: 'zh-cn', name: '简体中文', short: '简' }],
        current: function () { return LS.get(K.lang, 'zh-cn'); },
        set: function (code) {
            LS.set(K.lang, code);
            location.reload();
        },
        /** 翻译带 data-i18n / data-i18n-placeholder / data-i18n-title 的静态节点 */
        apply: function (root) {
            root = root || document;
            var nodes = root.querySelectorAll('[data-i18n],[data-i18n-placeholder],[data-i18n-title]');
            for (var i = 0; i < nodes.length; i++) {
                var el = nodes[i];
                if (el.hasAttribute('data-i18n')) el.textContent = i18n(el.getAttribute('data-i18n'));
                if (el.hasAttribute('data-i18n-placeholder')) el.setAttribute('placeholder', i18n(el.getAttribute('data-i18n-placeholder')));
                if (el.hasAttribute('data-i18n-title')) el.setAttribute('title', i18n(el.getAttribute('data-i18n-title')));
            }
        }
    };

    /** i18n('自动发货') —— 以简体原文为 key，缺失时原样返回 */
    window.i18n = function (text) {
        if (text === null || text === undefined || text === '') return text;
        var lang = Lang.current();
        if (lang === 'zh-cn') return text;
        var dict = I18N[lang];
        if (!dict) return text;
        return Object.prototype.hasOwnProperty.call(dict, text) ? dict[text] : text;
    };

    setVar('LANG', Lang.current());

    window.Cur = {
        list: CONFIG.currencies || [{ code: 'CNY', symbol: '¥', rate: 1, decimals: 2 }],
        current: function () {
            var code = LS.get(K.cur, 'CNY');
            var list = Cur.list, found = null;
            for (var i = 0; i < list.length; i++) if (list[i].code === code) found = list[i];
            return found || list[0];
        },
        set: function (code) { LS.set(K.cur, code); location.reload(); },
        /** 基准货币（人民币）换算到当前货币 */
        convert: function (base) { return Number(base || 0) * Number(Cur.current().rate || 1); }
    };
    setVar('CURRENCY', Cur.current());

    window.Theme = {
        current: function () { return LS.get(K.theme, 'auto'); },
        resolved: function () {
            var pref = Theme.current();
            if (pref !== 'auto') return pref;
            return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        },
        apply: function () {
            var mode = Theme.resolved();
            document.documentElement.setAttribute('data-theme', mode);
            document.documentElement.setAttribute('data-theme-pref', Theme.current());
            // 同步 Bootstrap 5.3 的暗色模式变量，避免出现「半亮半暗」
            document.documentElement.setAttribute('data-bs-theme', mode);
        },
        set: function (pref) { LS.set(K.theme, pref); Theme.apply(); Theme.sync(); },
        sync: function () {
            var nodes = document.querySelectorAll('[data-theme-choice]');
            for (var i = 0; i < nodes.length; i++) {
                nodes[i].classList.toggle('is-primary', nodes[i].getAttribute('data-theme-choice') === Theme.current());
            }
        },
        init: function () {
            Theme.apply();
            if (window.matchMedia) {
                try {
                    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
                        if (Theme.current() === 'auto') Theme.apply();
                    });
                } catch (e) { }
            }
        }
    };
    Theme.init();

    /* ============================================================
     * 3. util —— 请求层与通用工具
     * ============================================================ */
    var util = {
        /* ---------- 字符串 / 对象 ---------- */

        isBlank: function (v) {
            return v === null || v === undefined || String(v).trim() === '';
        },

        /** 判断对象为空或不属于可序列化的 JSON 值（原站 util.isEmptyOrNotJson） */
        isEmptyOrNotJson: function (obj) {
            if (obj === null || obj === undefined) return true;
            if (typeof obj !== 'object') return util.isBlank(obj);
            for (var k in obj) {
                if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
                if (!util.isBlank(obj[k])) return false;
            }
            return true;
        },

        /** [{name,value}] -> {name: value} */
        arrayToObject: function (arr) {
            var out = {};
            (arr || []).forEach(function (it) { out[it.name] = it.value; });
            return out;
        },

        objectToQueryString: function (obj) {
            var parts = [];
            Object.keys(obj || {}).forEach(function (k) {
                var v = obj[k];
                if (v === null || v === undefined) return;
                parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
            });
            return parts.join('&');
        },

        /** 读取当前地址栏参数；util.query('id') */
        query: function (name, url) {
            var qs = String(url || location.search || '').replace(/^[?#]/, '');
            var pairs = qs.split('&'), out = {};
            pairs.forEach(function (pair) {
                if (!pair) return;
                var idx = pair.indexOf('=');
                var k = idx < 0 ? pair : pair.slice(0, idx);
                var v = idx < 0 ? '' : pair.slice(idx + 1);
                try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); }
                catch (e) { out[k] = v; }
            });
            return name === undefined ? out : out[name];
        },

        escapeHtml: function (s) {
            return String(s === null || s === undefined ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        },

        /* ---------- 杂项 ---------- */

        uuid: function () {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        randomInt: function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },

        /** 订单号：RS + yyyyMMddHHmmss + 4 位随机 */
        orderNo: function () {
            var d = new Date(), p = function (n, len) { return String(n).padStart(len || 2, '0'); };
            return 'RS' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
                + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
                + p(util.randomInt(0, 9999), 4);
        },

        sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },

        debounce: function (fn, wait) {
            var t = null;
            return function () {
                var args = arguments, ctx = this;
                clearTimeout(t);
                t = setTimeout(function () { fn.apply(ctx, args); }, wait || 300);
            };
        },

        copy: function (text) {
            var value = String(text == null ? '' : text);
            if (navigator.clipboard && window.isSecureContext) {
                return navigator.clipboard.writeText(value).then(function () { return true; }).catch(function () { return fallback(); });
            }
            return Promise.resolve(fallback());

            function fallback() {
                var ta = document.createElement('textarea');
                ta.value = value;
                ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
                document.body.appendChild(ta);
                ta.select();
                var ok = false;
                try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
                document.body.removeChild(ta);
                return ok;
            }
        },

        /* ---------- 请求层 ---------- */

        /** 真实后端地址 = API_BASE + path */
        api: function (path) {
            return String(getVar('API_BASE') || '') + path;
        },

        get: function (path, data, done, fail) {
            // 支持 util.get(path, done) 的简写形式
            if (typeof data === 'function') { fail = done; done = data; data = {}; }
            return request('GET', path, data, done, fail);
        },

        post: function (path, data, done, fail) {
            if (typeof data === 'function') { fail = done; done = data; data = {}; }
            return request('POST', path, data, done, fail);
        },

        /** Promise 风格，控制器里更好写 */
        fetch: function (method, path, data) {
            return request(method, path, data);
        }
    };
    window.util = util;

    /**
     * 统一请求出口。
     * MOCK = true  -> 走本地路由表，模拟 200~400ms 网络延迟
     * MOCK = false -> 走 jQuery AJAX 请求真实后端（与静态站点完全解耦）
     */
    function request(method, path, data, done, fail) {
        data = data || {};
        var promise;

        if (getVar('MOCK') !== false) {
            promise = util.sleep(util.randomInt(180, 420)).then(function () {
                return Mock.handle(method, path, data);
            });
        } else {
            promise = new Promise(function (resolve, reject) {
                if (!window.jQuery) return reject(new Error('未加载 jQuery，无法请求真实后端'));
                jQuery.ajax({ url: util.api(path), method: method, data: data, dataType: 'json' })
                    .done(resolve)
                    .fail(function (xhr) {
                        reject(new Error('接口异常（HTTP ' + xhr.status + '）: ' + path));
                    });
            });
        }

        promise.then(function (res) {
            if (typeof done === 'function') done(res);
        }, function (err) {
            if (typeof fail === 'function') { fail(err); return; }
            console.error('[api] ' + path, err);
            ui.error(err && err.message ? err.message : '请求失败，请稍后重试');
        });

        return promise;
    }

    /* ============================================================
     * 4. format —— 金额 / 时间 / 数字
     * ============================================================ */
    window.format = {
        /**
         * 基准货币金额 -> 当前货币的数字串（带千分位，去掉多余的 0）
         * 与原站一致：¥9.9 而不是 ¥9.90，¥15 而不是 ¥15.00
         */
        raw: function (base) {
            var c = Cur.current();
            var v = Cur.convert(base);
            var s = Number(v).toFixed(Number(c.decimals || 2));
            if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');

            var seg = s.split('.');
            seg[0] = seg[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return seg.join('.');
        },

        /** 基准货币金额 -> 带货币符号的展示串 */
        currency: function (base, withSymbol) {
            return (withSymbol === false ? '' : format.currencySymbol()) + format.raw(base);
        },

        currencySymbol: function () { return Cur.current().symbol; },

        number: function (n) {
            return String(Number(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        },

        date: function (ts, withTime) {
            if (!ts) return '-';
            var d = new Date(ts);
            var p = function (n) { return String(n).padStart(2, '0'); };
            var s = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
            if (withTime !== false) s += ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
            return s;
        },

        /** 运行时长：「811天21小时22分35秒」 */
        duration: function (ms) {
            if (ms < 0) ms = 0;
            var sec = Math.floor(ms / 1000);
            var d = Math.floor(sec / 86400); sec -= d * 86400;
            var h = Math.floor(sec / 3600); sec -= h * 3600;
            var m = Math.floor(sec / 60); sec -= m * 60;
            return d + '天' + h + '小时' + m + '分' + sec + '秒';
        }
    };

    /* ============================================================
     * 5. 本地「服务端」：库存 / 卡密 / 订单
     * ============================================================ */
    function skuKey(itemId, sku) { return itemId + '|' + (sku || '__base__'); }

    var BASE_SKU = '__base__';

    window.Stock = {
        /** 单个商品（或 SKU）的基准库存 */
        baseOf: function (item, sku) {
            var skuList = (item.config && item.config.sku) || [];
            if (sku && skuList.length) {
                for (var i = 0; i < skuList.length; i++) if (skuList[i].name === sku) return Number(skuList[i].stock || 0);
                return 0;
            }
            if (!sku && skuList.length) {
                return skuList.reduce(function (a, b) { return a + Number(b.stock || 0); }, 0);
            }
            return Number(item.stock || 0);
        },

        /** 本地已售增量 */
        soldDelta: function (item, sku) {
            var sold = LS.get(K.sold, {});
            if (sku) return Number(sold[skuKey(item.id, sku)] || 0);
            var skuList = (item.config && item.config.sku) || [];
            if (skuList.length) {
                return skuList.reduce(function (a, s) { return a + Number(sold[skuKey(item.id, s.name)] || 0); }, 0);
            }
            return Number(sold[skuKey(item.id, BASE_SKU)] || 0);
        },

        remaining: function (item, sku) {
            var skuList = (item.config && item.config.sku) || [];
            if (sku) return Math.max(0, Stock.baseOf(item, sku) - Stock.soldDelta(item, sku));
            if (skuList.length) {
                return skuList.reduce(function (a, s) { return a + Stock.remaining(item, s.name); }, 0);
            }
            return Math.max(0, Stock.baseOf(item) - Stock.soldDelta(item));
        },

        /** 列表页展示用的 { stock, sold } */
        summary: function (item) {
            return {
                stock: Stock.remaining(item),
                sold: Number(item.order_sold || 0) + Stock.soldDelta(item)
            };
        },

        /** 下单成功后扣减（本地记账，真实系统请用数据库行锁/乐观锁） */
        consume: function (item, sku, num) {
            var sold = LS.get(K.sold, {});
            var key = skuKey(item.id, sku);      // sku 为空时自动落到 __base__
            sold[key] = Number(sold[key] || 0) + Number(num || 0);
            LS.set(K.sold, sold);
        },

        /** 演示用：恢复所有本地库存改动 */
        reset: function () { LS.del(K.sold); }
    };

    /* ---------------- 卡密 ---------------- */

    function fnv1a(str) {
        var h = 2166136261;
        for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    function mulberry32(seed) {
        var a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function randomBlock(rnd, len) {
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
        for (var i = 0; i < len; i++) out += chars.charAt(Math.floor(rnd() * chars.length));
        return out;
    }

    window.Cards = {
        /**
         * 发卡：由订单号派生，保证同一订单每次查询结果一致。
         * 真实系统里这里是「从数据库卡密池取出并置为已用」。
         */
        issue: function (order) {
            var prefix = getVar('CARD_PREFIX') || 'ROSE';
            var rnd = mulberry32(fnv1a(order.no + '|' + (order.sku || '') + '|' + order.item_id));
            var list = [];
            for (var i = 0; i < Number(order.num || 1); i++) {
                if (order.delivery_way === 0) {
                    list.push(prefix + '-' + randomBlock(rnd, 4) + '-' + randomBlock(rnd, 4) + '-' + randomBlock(rnd, 4));
                } else {
                    list.push(i18n('在线发货') + ' #' + order.no + '-' + (i + 1));
                }
            }
            return list;
        }
    };

    /* ---------------- 订单 ---------------- */

    var ORDER_STATUS = { unpaid: 0, paid: 1, delivered: 2, closed: 3 };
    window.ORDER_STATUS = ORDER_STATUS;
    window.ORDER_STATUS_TEXT = { 0: '待支付', 1: '已支付', 2: '已发货', 3: '已关闭' };

    window.Orders = {
        all: function () {
            var list = LS.get(K.orders, []);
            return Array.isArray(list) ? list : [];
        },
        find: function (no) {
            var list = Orders.all();
            for (var i = 0; i < list.length; i++) if (list[i].no === no) return list[i];
            return null;
        },
        save: function (order) {
            var list = Orders.all(), hit = false;
            for (var i = 0; i < list.length; i++) {
                if (list[i].no === order.no) { list[i] = order; hit = true; break; }
            }
            if (!hit) list.unshift(order);
            LS.set(K.orders, list.slice(0, 500));
            bus.emit('order:change', order);
            return order;
        },
        remove: function (no) {
            LS.set(K.orders, Orders.all().filter(function (o) { return o.no !== no; }));
        },
        /** 标记支付成功 -> 自动发货 / 等待人工 */
        settle: function (order) {
            if (!order || order.status !== ORDER_STATUS.unpaid) return order;
            order.paid_at = Date.now();
            if (order.delivery_way === 0) {
                order.status = ORDER_STATUS.delivered;
                order.cards = Cards.issue(order);
                order.delivered_at = Date.now();
            } else {
                order.status = ORDER_STATUS.paid;
            }
            return Orders.save(order);
        },
        close: function (order) {
            if (!order || order.status !== ORDER_STATUS.unpaid) return order;
            order.status = ORDER_STATUS.closed;
            order.closed_at = Date.now();
            // 关闭订单回滚库存
            var item = API.findItem(order.item_id);
            if (item) {
                var sold = LS.get(K.sold, {});
                var key = skuKey(item.id, order.sku || (item.config && item.config.sku && item.config.sku.length ? order.sku : BASE_SKU));
                sold[key] = Math.max(0, Number(sold[key] || 0) - Number(order.num || 0));
                LS.set(K.sold, sold);
            }
            return Orders.save(order);
        },
        reset: function () { LS.del(K.orders); }
    };

    /* ============================================================
     * 6. Mock —— 模拟后端路由表
     *    路径与真实后端完全一致，MOCK=false 时可直接无缝切换
     * ============================================================ */
    var API = (function () {

        function allItems() { return (getVar('COMMODITIES') || []).slice(); }

        function findItem(id) {
            if (id === null || id === undefined) return null;
            var list = allItems();
            for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
            return null;
        }

        /** 把「原始商品」+ 本地库存增量 组装成前端要用的商品对象 */
        function project(item) {
            var s = Stock.summary(item);
            var copy = JSON.parse(JSON.stringify(item));
            copy.stock = s.stock;
            copy.order_sold = s.sold;
            copy.cover = asset(item.cover);
            if (copy.config && copy.config.sku) {
                copy.config.sku.forEach(function (sk) { sk.stock = Stock.remaining(item, sk.name); });
            }
            return copy;
        }

        function priceOf(item, sku) {
            var skuList = (item.config && item.config.sku) || [];
            if (sku && skuList.length) {
                for (var i = 0; i < skuList.length; i++) if (skuList[i].name === sku) return Number(skuList[i].price);
            }
            return Number(item.price);
        }

        function log(action, detail) {
            var logs = LS.get(K.logs, []);
            logs.unshift({ at: Date.now(), action: action, detail: detail });
            LS.set(K.logs, logs.slice(0, 60));
        }

        return {
            allItems: allItems,
            findItem: findItem,
            project: project,
            priceOf: priceOf,
            log: log
        };
    })();
    window.API = API;

    var Mock = (function () {
        var routes = Object.create(null);

        /**
         * 对外输出白名单：只下发前端真正需要的字段。
         * 内部字段（新加的定时/验签字段等）一律不出口。
         */
        function publicOrder(order) {
            var payName = order.pay;
            (CONFIG.payments || []).forEach(function (x) { if (x.id === order.pay) payName = x.name; });

            return {
                order_no: order.no,
                item_id: order.item_id,
                item_name: order.item_name,
                cover: order.cover,
                sku: order.sku,
                price: order.price,
                num: order.num,
                amount: order.amount,
                contact: order.contact,
                pay: payName,
                pay_id: order.pay,
                delivery_way: order.delivery_way,
                status: order.status,
                status_text: i18n(window.ORDER_STATUS_TEXT[order.status]),
                created_at: order.created_at,
                paid_at: order.paid_at,
                pay_expires_at: order.pay_expires_at,
                cards: order.cards || [],
                message: order.status === ORDER_STATUS.paid ? i18n('该商品为在线发货，支付后请留意联系方式') : ''
            };
        }

        function add(method, path, handler) {
            routes[method.toUpperCase() + ' ' + path] = handler;
        }

        /**
         * 路由分发。会把路径里的 querystring 与显式 params 合并
         * （显式 params 优先级更高），这样 util.get('/x?y=1') 也能正常工作。
         */
        function handle(method, path, params) {
            var raw = String(path || '');
            var qIndex = raw.indexOf('?');
            var routePath = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
            var fromQuery = qIndex >= 0 ? util.query(undefined, raw.slice(qIndex + 1)) : {};

            var merged = Object.assign({}, fromQuery, params || {});
            var key = String(method || 'GET').toUpperCase() + ' ' + routePath;

            var handler = routes[key];
            if (!handler) return Promise.reject(new Error('接口不存在: ' + key));
            try {
                return Promise.resolve(handler(merged));
            } catch (e) {
                return Promise.reject(e);
            }
        }

        /* -------- 前台：数据 -------- */

        add('GET', '/user/api/index/data', function () {
            return {
                config: {
                    site: CONFIG.site,
                    announcement: CONFIG.announcement,
                    notice: CONFIG.notice,
                    // 页脚的「免责声明」栏已下线，但接口继续下发，前端需要时可自行渲染
                    disclaimer: CONFIG.disclaimer,
                    contacts: CONFIG.contacts,
                    payments: (CONFIG.payments || []).filter(function (p) { return p.enabled !== false; })
                        .map(function (p) { return Object.assign({}, p, { icon: asset(p.icon) }); })
                },
                categories: (getVar('CATEGORIES') || []).map(function (c) {
                    return Object.assign({}, c, { icon: asset(c.icon) });
                }),
                stats: API.allItems().reduce(function (acc, it) {
                    var s = Stock.summary(it);
                    acc.stock += s.stock; acc.sold += s.sold;
                    return acc;
                }, { stock: 0, sold: 0 })
            };
        });

        /* -------- 前台：商品列表 -------- */

        add('GET', '/user/api/index/commodity', function (p) {
            var list = API.allItems();

            if (!util.isBlank(p.categoryId) && String(p.categoryId) !== '0') {
                list = list.filter(function (it) { return String(it.category_id) === String(p.categoryId); });
            }
            if (!util.isBlank(p.keywords)) {
                var kw = String(p.keywords).toLowerCase();
                list = list.filter(function (it) {
                    return String(it.name).toLowerCase().indexOf(kw) >= 0
                        || String(it.description || '').toLowerCase().indexOf(kw) >= 0;
                });
            }

            // 推荐优先，其次销量
            list.sort(function (a, b) {
                if (Number(b.recommend || 0) !== Number(a.recommend || 0)) return Number(b.recommend || 0) - Number(a.recommend || 0);
                return Number(b.order_sold || 0) - Number(a.order_sold || 0);
            });

            var page = Number(p.page || 0), limit = Number(p.limit || 0);
            if (page > 0 && limit > 0) list = list.slice((page - 1) * limit, page * limit);

            return list.map(API.project);
        });

        /* -------- 前台：单个商品 -------- */

        add('GET', '/user/api/index/item', function (p) {
            var item = API.findItem(p.itemId || p.id);
            if (!item) throw new Error('商品不存在或已下架');
            return API.project(item);
        });

        /* -------- 前台：查库存 -------- */

        add('POST', '/user/api/index/stock', function (p) {
            var item = API.findItem(p.item_id);
            if (!item) throw new Error('商品不存在');
            var stock = Stock.remaining(item, p.race);
            return {
                item_id: item.id,
                race: p.race || null,
                stock: stock,
                sold: Stock.soldDelta(item, p.race),
                price: API.priceOf(item, p.race),
                available: stock > 0
            };
        });

        /* -------- 前台：算价（防止前端改价） -------- */

        add('POST', '/user/api/index/valuation', function (p) {
            var item = API.findItem(p.item_id);
            if (!item) throw new Error('商品不存在');

            var num = Math.max(1, Number(p.num || 1));
            var stock = Stock.remaining(item, p.race);
            var price = API.priceOf(item, p.race);

            if (num > stock) return { ok: false, message: i18n('购买数量不能超过库存'), stock: stock, price: price, num: num };

            return {
                ok: true,
                item_id: item.id,
                item_name: item.name,
                race: p.race || null,
                price: price,
                num: num,
                amount: Number((price * num).toFixed(2)),
                stock: stock,
                delivery_way: item.delivery_way
            };
        });

        /* -------- 前台：下单 + 取支付二维码 -------- */

        add('POST', '/user/api/index/pay', function (p) {
            var item = API.findItem(p.item_id);
            if (!item) throw new Error('商品不存在');

            var valuation = routes['POST /user/api/index/valuation'](p);
            if (!valuation.ok) throw new Error(valuation.message);

            if (util.isBlank(p.contact)) throw new Error(i18n('请填写您的联系方式'));

            var order = {
                no: util.orderNo(),
                item_id: item.id,
                item_name: item.name,
                cover: asset(item.cover),
                sku: p.race || null,
                price: valuation.price,
                num: valuation.num,
                amount: valuation.amount,
                contact: String(p.contact),
                pay: p.pay || 'wechat',
                delivery_way: item.delivery_way,
                status: ORDER_STATUS.unpaid,
                created_at: Date.now(),
                pay_expires_at: Date.now() + 15 * 60 * 1000,
                paid_at: null,
                cards: []
            };

            // 扣库存占位（真实系统此处会开启事务并在超时未支付时释放）
            Stock.consume(item, order.sku, order.num);
            Orders.save(order);
            API.log('create_order', order.no + ' ' + order.item_name + ' ×' + order.num);

            return {
                order_no: order.no,
                status: order.status,
                amount: order.amount,
                pay: order.pay,
                expires_in: 900      // 与 order.pay_expires_at 对应，收银台据此做倒计时
            };
        });

        /* -------- 前台：订单轮询（等价于支付回调） -------- */

        add('GET', '/user/api/order/trade', function (p) {
            var order = Orders.find(p.order_no || p.no);
            if (!order) throw new Error('订单不存在');

            /*
             * 这里刻意不做任何「到点自动置为已支付」。
             * 演示环境下，订单只能通过收银台的「确认已支付」按钮
             * （POST /user/api/order/paid）流转；
             * 真实环境则应由服务端在收到支付网关的异步回调后调用 Orders.settle()。
             */
            return publicOrder(order);
        });

        /* -------- 前台：关闭未支付订单（释放库存） -------- */

        add('POST', '/user/api/order/close', function (p) {
            var order = Orders.find(p.order_no || p.no);
            if (!order) throw new Error('订单不存在');
            Orders.close(order);
            API.log('close_order', order.no);
            return publicOrder(order);
        });

        /* -------- 前台：取卡密 -------- */

        add('POST', '/user/api/index/card', function (p) {
            var order = Orders.find(p.order_no || p.no);
            if (!order) throw new Error('订单不存在');
            if (order.status !== ORDER_STATUS.delivered) throw new Error('订单尚未发货');
            return { order_no: order.no, cards: order.cards || [] };
        });

        /* -------- 前台：手动确认支付（演示按钮） -------- */

        add('POST', '/user/api/order/paid', function (p) {
            var order = Orders.find(p.order_no || p.no);
            if (!order) throw new Error('订单不存在');
            Orders.settle(order);
            API.log('paid_manual', order.no);
            return { order_no: order.no, status: order.status, cards: order.cards || [] };
        });

        /* -------- 说明 --------
         * 本站已下线「账号注册 / 登录 / 后台管理 / 订单查询」，因此不再提供
         * /user/authentication/*、/admin/api/* 与 /user/api/order/query 这组接口。
         * 需要恢复时，从 git 历史里找回对应实现即可。
         */

        return { add: add, handle: handle };
    })();
    window.Mock = Mock;

    /** 供外部注册自定义接口：Mock.add('GET','/your/api', p => data) */
    window.Mock.add = Mock.add;

    /* ============================================================
     * 7. ui —— 提示 / 弹窗 / 复制
     * ============================================================ */
    var ui = {
        toast: function (message, type) {
            type = type || 'info';
            try {
                if (window.toastr) {
                    toastr.options = {
                        closeButton: true, progressBar: true, positionClass: 'toast-bottom-right',
                        timeOut: 2600, newestOnTop: true
                    };
                    (toastr[type] || toastr.info)(message);
                    return;
                }
            } catch (e) { }
            console.log('[' + type + '] ' + message);
        },
        success: function (m) { ui.toast(m, 'success'); },
        error: function (m) { ui.toast(m, 'error'); },
        info: function (m) { ui.toast(m, 'info'); },

        loading: function (text) {
            try { if (window.layer) return layer.load(2, { shade: 0.2 }); } catch (e) { }
            return null;
        },
        loadingClose: function (index) {
            try { if (window.layer && index !== null && index !== undefined) layer.close(index); } catch (e) { }
        },

        /** 统一确认框：Promise<boolean> */
        confirm: function (title, text, confirmText) {
            if (window.Swal) {
                return Swal.fire({
                    title: title || '请确认',
                    text: text || '',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: confirmText || i18n('确定'),
                    cancelButtonText: i18n('取消'),
                    reverseButtons: true
                }).then(function (r) { return !!r.isConfirmed; });
            }
            return Promise.resolve(window.confirm((title || '') + '\n' + (text || '')));
        },

        alert: function (title, text, icon) {
            if (window.Swal) return Swal.fire({ title: title || '', text: text || '', icon: icon || 'info' });
            window.alert((title || '') + '\n' + (text || ''));
            return Promise.resolve();
        },

        /** 复制并提示 */
        copy: function (text) {
            return util.copy(text).then(function (ok) {
                if (ok) ui.success(i18n('已复制到剪贴板'));
                else ui.error('复制失败，请手动选择文本复制');
                return ok;
            });
        },

        /** 骨架屏（列表加载中） */
        skeleton: function (count, cls) {
            var out = '';
            for (var i = 0; i < (count || 8); i++) {
                out += '<div class="' + (cls || 'col-12 col-md-6 col-lg-3 mb-3') + '">' +
                    '<div class="acg-card acg-card--skeleton h-100"><div class="acg-thumb"></div>' +
                    '<div class="p-3"><span class="sk sk-70"></span><span class="sk sk-40"></span><span class="sk sk-55"></span></div></div></div>';
            }
            return out;
        }
    };
    window.ui = ui;

    /* ============================================================
     * 8. Chrome —— 全站页头 / 页脚
     * ============================================================ */
    window.Chrome = (function () {

        function navItem(key, href, icon, text) {
            return '<li class="rs-nav__item"><a class="rs-nav__link" data-nav="' + key + '" href="' + href + '">' +
                '<span class="rs-nav__icon">' + icon + '</span><span>' + i18n(text) + '</span></a></li>';
        }

        function header() {
            var langs = Lang.list.map(function (l) {
                return '<button class="rs-menu__item' + (l.code === Lang.current() ? ' is-primary' : '') + '" data-lang="' + l.code + '">' +
                    l.name + ' <em>' + l.short + '</em></button>';
            }).join('');
            var curs = Cur.list.map(function (c) {
                return '<button class="rs-menu__item' + (c.code === Cur.current().code ? ' is-primary' : '') + '" data-cur="' + c.code + '">' +
                    c.symbol + ' ' + c.code + '</button>';
            }).join('');

            return '' +
                '<nav class="rs-navbar"><div class="container rs-navbar__inner">' +
                '<a class="rs-brand" href="index.html">' +
                '<img class="rs-brand__logo" src="' + asset('images/logo.svg') + '" alt="logo">' +
                '<span class="rs-brand__name">' + util.escapeHtml(SITE.name || 'RoseShop') + '</span>' +
                '</a>' +

                '<ul class="rs-nav">' +
                navItem('shop', 'index.html', '🛍', '购物') +
                '</ul>' +

                '<form class="rs-search" data-role="search">' +
                '<span class="rs-search__icon">🔍</span>' +
                '<input type="search" name="q" data-i18n-placeholder="搜索" placeholder="搜索" autocomplete="off">' +
                '</form>' +

                '<div class="rs-navbar__actions">' +
                '<div class="rs-menu">' +
                '<button class="rs-chip" type="button" data-menu-toggle="lang">' +
                '<span>🌐</span><b>' + (function () {
                    var cur = Lang.current(), out = '简';
                    Lang.list.forEach(function (l) { if (l.code === cur) out = l.short; });
                    return out;
                })() + '</b></button>' +
                '<div class="rs-menu__panel" data-menu="lang">' + langs + '</div>' +
                '</div>' +
                '<div class="rs-menu">' +
                '<button class="rs-chip" type="button" data-menu-toggle="cur">' + Cur.current().symbol + '</button>' +
                '<div class="rs-menu__panel" data-menu="cur">' + curs + '</div>' +
                '</div>' +
                '<div class="rs-menu">' +
                '<button class="rs-chip" type="button" data-menu-toggle="theme" title="主题">' + (Theme.resolved() === 'dark' ? '🌙' : '☀️') + '</button>' +
                '<div class="rs-menu__panel" data-menu="theme">' +
                '<button class="rs-menu__item" data-theme-choice="light">☀️ ' + i18n('明') + '</button>' +
                '<button class="rs-menu__item" data-theme-choice="dark">🌙 ' + i18n('暗') + '</button>' +
                '<button class="rs-menu__item" data-theme-choice="auto">🌗 ' + i18n('自动') + '</button>' +
                '</div>' +
                '</div>' +

                '</div></div></nav>';
        }

        function footer() {
            var contacts = (CONFIG.contacts || []).map(function (c) {
                return '<a class="rs-footer__link" target="_blank" rel="noopener" href="' + util.escapeHtml(c.url) + '">' +
                    '<span>' + util.escapeHtml(i18n(c.name)) + '</span><em class="badge-soft badge-soft-primary">' + util.escapeHtml(c.badge) + '</em></a>';
            }).join('');

            return '' +
                '<footer class="rs-footer"><div class="container">' +
                '<div class="rs-footer__grid">' +
                '<div class="rs-footer__col">' +
                '<div class="rs-footer__brand"><img src="' + asset('images/logo.svg') + '" alt="logo">' +
                '<span>' + util.escapeHtml(SITE.name || '') + '</span></div>' +
                '<p class="rs-footer__desc">' + i18n(SITE.slogan || '') + '</p>' +
                '<p class="rs-footer__desc rs-footer__desc--dim">' + i18n(SITE.sub || '') + '</p>' +
                '</div>' +
                '<div class="rs-footer__col"><h6>' + i18n('联系与售后') + '</h6>' + (contacts || '<p class="rs-footer__desc">—</p>') + '</div>' +
                '</div>' +
                '<div class="rs-footer__bottom">' +
                '<span>© ' + new Date().getFullYear() + ' ' + util.escapeHtml(SITE.name || '') + '</span>' +
                '<span>v' + util.escapeHtml(getVar('ASSET_VERSION') || '1.0.0') + ' · ' + util.escapeHtml(SITE.icp || '') + '</span>' +
                '</div></div></footer>';
        }

        /** 运行时长（对应原站页脚那个 iframe 计时器） */
        function uptime(tick) {
            var since = Date.parse(SITE.uptimeSince || '');
            if (!since || isNaN(since)) return '';
            var render = function () {
                var nodes = document.querySelectorAll('[data-role="uptime"]');
                for (var i = 0; i < nodes.length; i++) nodes[i].textContent = format.duration(Date.now() - since);
            };
            render();
            if (tick !== false) setInterval(render, 1000);
            return '';
        }

        function render() {
            var heads = document.querySelectorAll('[data-chrome="header"]');
            for (var i = 0; i < heads.length; i++) heads[i].innerHTML = header();

            var foots = document.querySelectorAll('[data-chrome="footer"]');
            for (var j = 0; j < foots.length; j++) foots[j].innerHTML = footer();

            var notice = document.querySelectorAll('[data-role="notice"]');
            for (var k = 0; k < notice.length; k++) notice[k].textContent = i18n(CONFIG.notice || '');

            uptime(true);
            bind();
            Lang.apply(document);
            highlightNav();
            Theme.sync();
        }

        function highlightNav() {
            var path = location.pathname.split('/').pop() || 'index.html';
            var map = { 'index.html': 'shop', 'item.html': 'shop', 'order.html': 'shop' };
            var key = map[path] || '';
            var links = document.querySelectorAll('[data-nav]');
            for (var i = 0; i < links.length; i++) {
                links[i].classList.toggle('is-primary', links[i].getAttribute('data-nav') === key);
            }
        }

        var bound = false;
        function bind() {
            if (bound) return;
            bound = true;

            // 下拉菜单
            document.addEventListener('click', function (e) {
                // 全局复制按钮（卡密 / 订单号等）
                var copyBtn = e.target.closest ? e.target.closest('[data-role="copy"]') : null;
                if (copyBtn) {
                    e.preventDefault();
                    ui.copy(copyBtn.getAttribute('data-text') || '');
                    return;
                }

                var toggle = e.target.closest ? e.target.closest('[data-menu-toggle]') : null;
                var panels = document.querySelectorAll('.rs-menu__panel');
                var name = toggle ? toggle.getAttribute('data-menu-toggle') : null;

                for (var i = 0; i < panels.length; i++) {
                    panels[i].classList.toggle('is-open', !!name && panels[i].getAttribute('data-menu') === name
                        && !panels[i].classList.contains('is-open'));
                }

                var langBtn = e.target.closest ? e.target.closest('[data-lang]') : null;
                if (langBtn) return Lang.set(langBtn.getAttribute('data-lang'));

                var curBtn = e.target.closest ? e.target.closest('[data-cur]') : null;
                if (curBtn) return Cur.set(curBtn.getAttribute('data-cur'));

                var themeBtn = e.target.closest ? e.target.closest('[data-theme-choice]') : null;
                if (themeBtn) {
                    Theme.set(themeBtn.getAttribute('data-theme-choice'));
                    var icon = document.querySelector('[data-menu-toggle="theme"]');
                    if (icon) icon.textContent = Theme.resolved() === 'dark' ? '🌙' : '☀️';
                    return;
                }
            });

            // 搜索：跳转到首页并带上关键词
            document.addEventListener('submit', function (e) {
                var form = e.target.closest ? e.target.closest('[data-role="search"]') : null;
                if (!form) return;
                e.preventDefault();
                var kw = form.querySelector('input[name=q]').value.trim();
                location.href = 'index.html' + (kw ? '?q=' + encodeURIComponent(kw) : '');
            });
        }

        return { render: render, header: header, footer: footer, uptime: uptime };
    })();

    /* ============================================================
     * 9. 启动：页头页脚 + 静态文案
     * ============================================================ */
    documentReady(function () {
        Chrome.render();
        bus.emit('chrome:ready');
    });

    window.ui = ui;
})();
