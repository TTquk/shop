/*!
 * ready.js —— 页面控制器加载器 / 变量注入层
 *
 * 复刻自同类 PHP 发卡站的 assets/common/js/ready.js：
 *   1) setVar / getVar 把「服务端变量」注入前端（window._data_var）
 *   2) ready("模块/控制器/方法.js") 按需加载「一页一控制器」脚本
 *   3) 保持多页应用结构，不引入打包器 —— 任何静态托管都能直接跑
 *
 * 与原站的区别（为了适配 GitHub Pages / Netlify 的纯静态环境）：
 *   - 资源根路径由 ready.js 自身 URL 反推，天然支持子目录部署（/repo/ 这种）
 *   - 提供 asset() / url() 统一拼接路径，避免写死以 / 开头的绝对路径
 */
(function () {
    'use strict';

    /* ============ 1. 变量注入：setVar / getVar ============ */

    window._data_var = window._data_var || {};

    window.setVar = function (key, value) {
        window._data_var[key] = value;
        return value;
    };

    window.getVar = function (key) {
        return window._data_var[key];
    };

    /* ============ 2. 路径解析（子目录部署的关键） ============ */

    // 优先用 document.currentScript，动态注入时退化为扫描 <script src="*/ready.js">
    var selfSrc = (document.currentScript && document.currentScript.src) || '';
    if (!selfSrc) {
        var all = document.getElementsByTagName('script');
        for (var i = all.length - 1; i >= 0; i--) {
            if (/\/ready\.js(\?|$)/.test(all[i].src || '')) { selfSrc = all[i].src; break; }
        }
    }

    var assetsRoot = '.';
    var matched = selfSrc.match(/^(.*?)\/?common\/js\/ready\.js/i);
    if (matched && matched[1]) {
        assetsRoot = matched[1].replace(/\/+$/, '');
    } else if (selfSrc) {
        // 兜底：去掉文件名与上一级目录
        assetsRoot = selfSrc.replace(/\/[^/]*$/, '').replace(/\/[^/]*$/, '');
    }

    window.ASSETS_ROOT = assetsRoot;                                   // …/assets
    window.SITE_ROOT = assetsRoot.replace(/\/assets$/, '');            // …（站点根）

    /**
     * 拼接资源地址。为了让模板作者少踩坑，三种写法都支持：
     *   asset('images/logo.svg')          -> …/assets/images/logo.svg
     *   asset('assets/images/logo.svg')   -> …/assets/images/logo.svg
     *   asset('/assets/images/logo.svg')  -> …/assets/images/logo.svg
     * 其中「站点根相对」的写法会自动带上部署前缀（GitHub Pages 子目录也能用）
     */
    window.asset = function (path) {
        path = String(path == null ? '' : path);
        if (/^(https?:)?\/\//i.test(path) || /^(data|blob):/i.test(path)) return path;

        var siteRoot = assetsRoot.replace(/\/assets$/, '');

        // 站点根绝对路径：/assets/xxx
        if (path.charAt(0) === '/') return siteRoot + path;

        // 站点根相对路径：assets/xxx
        if (/^assets\//.test(path)) return siteRoot + '/' + path;

        // assets 相对路径：images/xxx
        return assetsRoot + '/' + path.replace(/^\.?\//, '');
    };

    /** 拼接站点内的页面地址，例如 url('item.html?id=2') */
    window.url = function (path) {
        path = String(path == null ? '' : path).replace(/^\/+/, '');
        return (window.SITE_ROOT || '') + '/' + path;
    };

    /* ============ 3. 文档就绪工具 ============ */

    window.documentReady = function (callback) {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            callback();
        } else {
            document.addEventListener('DOMContentLoaded', callback, false);
        }
    };

    /* ============ 4. 控制器加载器 ============ */

    var loaderState = {
        generation: 0,
        loaded: Object.create(null),   // 已发起加载的控制器 -> Promise
        queue: []
    };

    /**
     * ready("user/controller/index/index.js")
     * ready(["a.js", "b.js"])
     * ready("a.js", { itemId: 2 })   // 参数会并入 _data_var._args
     * @returns {Promise} 便于 .then() 串联
     */
    window.ready = function (controllers, args) {
        var list = Array.isArray(controllers) ? controllers : [controllers];
        var gen = loaderState.generation;

        if (args && typeof args === 'object') {
            window._data_var._args = Object.assign({}, window._data_var._args, args);
        }

        var chain = Promise.resolve();
        list.forEach(function (controller) {
            chain = chain.then(function () {
                if (gen !== loaderState.generation) return null;   // 已被新一轮导航取消
                return loadController(controller);
            });
        });
        return chain;
    };

    /** 页面卸载/重载前取消旧的控制器（多页应用里主要用于热调试） */
    window.ready.reset = function () {
        loaderState.generation++;
        loaderState.loaded = Object.create(null);
        var nodes = document.querySelectorAll('script[data-controller]');
        for (var i = 0; i < nodes.length; i++) nodes[i].parentNode.removeChild(nodes[i]);
    };

    function loadController(controller) {
        var src = String(controller || '');
        if (!src) return Promise.resolve(null);

        // 允许传入完整地址；否则视为 assets 相对路径
        if (!/^(https?:)?\/\//i.test(src) && src.charAt(0) !== '/') {
            src = window.ASSETS_ROOT + '/' + src.replace(/^\.?\//, '');
        }

        if (loaderState.loaded[src]) return loaderState.loaded[src];

        loaderState.loaded[src] = new Promise(function (resolve) {
            var el = document.createElement('script');
            el.src = src;
            el.async = false;                      // 保持控制器执行顺序
            el.setAttribute('data-controller', src);
            el.onload = function () {
                el.setAttribute('data-controller-loaded', '1');
                resolve(src);
            };
            el.onerror = function () {
                console.error('[ready] 控制器加载失败: ' + src);
                resolve(null);
            };
            (document.body || document.head).appendChild(el);
        });

        return loaderState.loaded[src];
    }

    /* ============ 5. 极简事件总线（多控制器 / 多标签页同步用） ============ */

    window.bus = (function () {
        var map = Object.create(null);
        return {
            on: function (name, fn) { (map[name] = map[name] || []).push(fn); return fn; },
            off: function (name, fn) {
                if (!map[name]) return;
                map[name] = map[name].filter(function (f) { return f !== fn; });
            },
            emit: function (name, payload) {
                (map[name] || []).forEach(function (fn) {
                    try { fn(payload); } catch (e) { console.error(e); }
                });
            }
        };
    })();
})();
