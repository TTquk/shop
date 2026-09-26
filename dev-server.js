/**
 * dev-server.js —— 零依赖本地预览服务器（Node 18+）
 *
 * 用法：node dev-server.js [端口] [挂载点]
 *   node dev-server.js                    → http://127.0.0.1:5178/
 *   node dev-server.js 5179 /shop         → http://127.0.0.1:5179/shop/
 *
 * 作用：
 *   - 静态托管当前目录
 *   - 支持与 _redirects 一致的伪静态路由（/item/2 -> item.html?id=2）
 *     这样本地就能验证生产环境的 URL 行为
 *   - 【挂载点】把站点挂在子路径下，用来模拟 GitHub Pages 项目站
 *     （https://<user>.github.io/<repo>/）—— 这是最容易出问题的部署场景
 *   - 正确设置 MIME、禁用缓存，方便调试
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 5178);

/** 可选的子路径挂载点，例如 /shop；为空则挂在根目录 */
const BASE = (function (v) {
    v = String(v == null ? '' : v).trim();
    if (!v || v === '/') return '';
    if (v.charAt(0) !== '/') v = '/' + v;
    return v.replace(/\/+$/, '');
})(process.argv[3] || process.env.BASE || '');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8'
};

/** 伪静态路由表：pattern -> 目标页面（$1 为捕获组） */
const ROUTES = [
    [/^\/$/, '/index.html'],
    [/^\/index\.php$/, '/index.html'],
    [/^\/cat\/([^/]+)$/, (m) => '/index.html?cat=' + encodeURIComponent(m[1])],
    [/^\/item\/([^/]+)$/, (m) => '/item.html?id=' + encodeURIComponent(m[1])],
    [/^\/order$/, '/order.html'],
    [/^\/order\/([^/?#]+)$/, (m) => '/order.html?no=' + encodeURIComponent(m[1])]
];

function resolveRoute(pathname) {
    for (const [pattern, target] of ROUTES) {
        const m = pathname.match(pattern);
        if (!m) continue;
        return typeof target === 'function' ? target(m) : target;
    }
    return null;
}

function send(res, status, body, headers) {
    res.writeHead(status, Object.assign({
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    }, headers || {}));
    res.end(body);
}

function serveFile(res, filePath) {
    fs.readFile(filePath, (err, buf) => {
        if (err) {
            // 兜底：真的 404 时交给 404.html
            fs.readFile(path.join(ROOT, '404.html'), (e2, page) => {
                if (e2) return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
                send(res, 404, page, { 'Content-Type': 'text/html; charset=utf-8' });
            });
            return;
        }
        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        send(res, 200, buf, { 'Content-Type': type });
    });
}

const server = http.createServer((req, res) => {
    const parsed = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(parsed.pathname || '/');

    // 可选挂载点：先剥掉前缀，后续逻辑全部按站点内路径处理
    if (BASE) {
        if (pathname === BASE) pathname = '/';
        else if (pathname.indexOf(BASE + '/') === 0) pathname = pathname.slice(BASE.length);
        else return send(res, 404, 'Not Found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }

    // 目录 -> 补 index.html
    if (pathname.endsWith('/')) pathname += 'index.html';

    // 伪静态：302 跳到真实页面（与 _redirects 行为一致）
    // 刻意不用 200 内部重写：那样地址栏会停在 /item/2，
    // 页面里的相对路径 assets/… 就会被解析成 /item/assets/… 而失效。
    const route = resolveRoute(pathname);
    if (route) {
        const sep = route.indexOf('?') >= 0 ? '&' : '?';
        const extra = parsed.search ? sep + parsed.search.replace(/^\?/, '') : '';
        return send(res, 302, '', { Location: BASE + route + extra });
    }

    // 防目录穿越
    const filePath = path.normalize(path.join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });

    serveFile(res, filePath);
});

server.listen(PORT, () => {
    const prefix = BASE;
    console.log('');
    console.log('  RoseShop static shop  ->  http://127.0.0.1:' + PORT + prefix + '/');
    console.log('  伪静态示例            ->  http://127.0.0.1:' + PORT + prefix + '/item/2');
    if (BASE) console.log('  （已挂在 ' + BASE + '/ 下，用于模拟 GitHub Pages 项目站）');
    console.log('  停止服务：Ctrl + C');
    console.log('');
});
