/**
 * dev-server.js —— 零依赖本地预览服务器（Node 18+）
 *
 * 用法：node dev-server.js [端口]
 * 作用：
 *   - 静态托管当前目录
 *   - 支持与 _redirects 一致的伪静态路由（/item/2 -> item.html?id=2）
 *     这样本地就能验证生产环境的 URL 行为
 *   - 正确设置 MIME、禁用缓存，方便调试
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 5178);

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

    // 目录 -> 补 index.html
    if (pathname.endsWith('/')) pathname += 'index.html';

    // 伪静态：302 跳到真实页面（与 _redirects 行为一致）
    // 刻意不用 200 内部重写：那样地址栏会停在 /item/2，
    // 页面里的相对路径 assets/… 就会被解析成 /item/assets/… 而失效。
    const route = resolveRoute(pathname);
    if (route) {
        const sep = route.indexOf('?') >= 0 ? '&' : '?';
        const extra = parsed.search ? sep + parsed.search.replace(/^\?/, '') : '';
        return send(res, 302, '', { Location: route + extra });
    }

    // 防目录穿越
    const filePath = path.normalize(path.join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });

    serveFile(res, filePath);
});

server.listen(PORT, () => {
    console.log('');
    console.log('  RoseShop static shop  ->  http://127.0.0.1:' + PORT + '/');
    console.log('  伪静态示例            ->  http://127.0.0.1:' + PORT + '/item/2');
    console.log('  停止服务：Ctrl + C');
    console.log('');
});
