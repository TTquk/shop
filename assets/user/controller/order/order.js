/*!
 * user/controller/order/order.js —— 收银台：支付二维码 / 轮询回调 / 取卡密
 * 订单状态由 /user/api/order/trade 轮询获得，真实环境里它的数据来源是支付网关的异步回调
 */
!function () {
    'use strict';

    const $Panel = $('[data-role="order-panel"]');

    const orderNo = util.query('no') || util.query('order_no') || '';
    let timer = null;      // 轮询定时器
    let expireTimer = null;
    let _order = null;
    let _cards = [];

    /* ---------------- 渲染 ---------------- */

    function _Render(order) {
        _order = order;
        const paid = order.status === 1 || order.status === 2;

        const head = '' +
            '<div class="order-status ' + (order.status === 0 ? 'order-status--wait' : 'order-status--ok') + '">' +
            '<span>' + (order.status === 0 ? '⏳' : '✅') + '</span>' +
            '<span>' + util.escapeHtml(order.status_text || '') + '</span>' +
            '<span class="ms-auto order-no">' + util.escapeHtml(order.order_no) + '</span>' +
            '<button class="rs-secret__copy" type="button" data-role="copy" data-text="' + util.escapeHtml(order.order_no) + '" title="' + i18n('复制') + '">📋</button>' +
            '</div>';

        const info = '' +
            '<div class="rs-kv"><span>' + i18n('商品') + '</span><span>' + util.escapeHtml(i18n(order.item_name || '')) +
            (order.sku ? ' · ' + util.escapeHtml(order.sku) : '') + '</span></div>' +
            '<div class="rs-kv"><span>' + i18n('单价') + '</span><span>' + format.currency(order.price) + '</span></div>' +
            '<div class="rs-kv"><span>' + i18n('购买数量') + '</span><span>×' + order.num + '</span></div>' +
            '<div class="rs-kv"><span>' + i18n('支付方式') + '</span><span>' + util.escapeHtml(order.pay || '-') + '</span></div>' +
            '<div class="rs-kv"><span>' + i18n('联系方式') + '</span><span>' + util.escapeHtml(order.contact || '-') + '</span></div>' +
            '<div class="rs-kv"><span>' + i18n('时间') + '</span><span>' + format.date(order.created_at) + '</span></div>' +
            '<div class="rs-kv"><span>' + i18n('总计') + '</span><span class="checkout-bar__amount" style="font-size:1.2rem">' + format.currency(order.amount) + '</span></div>';

        let body = '';
        if (order.status === 0) {
            body = '' +
                '<div class="rs-alert rs-alert--warning mb-3">请在 <b class="rs-timer" data-role="countdown">--:--</b> 内完成支付。</div>' +
                '<div class="rs-paybox">' +
                '<div class="rs-qr" id="rs-qrcode"></div>' +
                '<div class="text-muted-2" style="font-size:.84rem">请使用 ' + util.escapeHtml(order.pay) + ' 扫码支付 ' + format.currency(order.amount) + '</div>' +
                '<div class="d-flex gap-2 flex-wrap justify-content-center">' +
                '<button class="rs-btn rs-btn--success" data-role="paid">' + i18n('确认已支付') + '</button>' +
                '<button class="rs-btn rs-btn--ghost" data-role="close">关闭订单</button>' +
                '</div>' +
                '<div class="text-muted-2 text-center" style="font-size:.8rem">扫码付款后，请点下方「确认已支付」。</div>' +
                '</div>';
        } else if (order.status === 1) {
            body = '<div class="rs-alert rs-alert--info">' + i18n('该商品为在线发货，支付后请留意联系方式') +
                '。客服会通过 ' + util.escapeHtml(order.contact || '') + ' 与你联系。</div>';
        } else if (order.status === 2) {
            body = '<div class="card-box" data-role="cards-slot">' +
                treasure.secrets(_cards) +
                '<button class="rs-btn rs-btn--ghost rs-btn--block mt-2" data-role="copy-all">' + i18n('复制') + ' 全部卡密</button>' +
                '</div>';
        } else {
            body = '<div class="rs-empty"><span class="rs-empty__icon">🚫</span>' + util.escapeHtml(order.status_text || '') + '</div>';
        }

        $Panel.html(
            '<div class="rs-panel__head"><span class="rs-panel__icon">🧾</span><h6>' + i18n('订单信息') + '</h6>' +
            '<a class="ms-auto text-muted-2" style="font-size:.82rem" href="index.html">' + i18n('返回店铺') + ' →</a></div>' +
            '<div class="rs-panel__body">' + head + '<div class="mt-3">' + info + '</div>' +
            '<div class="mt-3">' + body + '</div></div>'
        );

        if (order.status === 0) {
            _PayQrcode();
            _Countdown(order.pay_expires_at);
        }
    }

    /**
     * 付款码：展示固定收款码图片，不再动态生成二维码。
     * 图片路径来自 assets/data/catalog.js 的 CONFIG.payQrcode；
     * 文件缺失时降级为一段提示，避免出现破图。
     */
    function _PayQrcode() {
        const el = document.getElementById('rs-qrcode');
        if (!el) return;

        const src = asset(((getVar('CONFIG') || {}).payQrcode) || 'assets/images/fukuanma.png');
        el.innerHTML =
            '<img src="' + util.escapeHtml(src) + '" alt="收款码" class="rs-qr__img">' +
            '<div class="rs-qr__missing" data-role="qr-missing">尚未放置收款码<br>' +
            '<code class="rs-mono">' + util.escapeHtml(src) + '</code></div>';

        const img = el.querySelector('img');
        const missing = el.querySelector('[data-role="qr-missing"]');
        img.addEventListener('error', function () {
            img.style.display = 'none';
            missing.style.display = 'block';
        });
    }

    function _Countdown(deadline) {
        if (expireTimer) clearInterval(expireTimer);
        const render = function () {
            const left = Number(deadline || 0) - Date.now();
            const $el = $('[data-role="countdown"]');
            if (!$el.length) return void (expireTimer && clearInterval(expireTimer));
            if (left <= 0) {
                $el.text('已超时');
                $('[data-role="paid"]').prop('disabled', true).addClass('is-disabled');
                clearInterval(expireTimer);
                return;
            }
            const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
            $el.text(String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'));
        };
        render();
        expireTimer = setInterval(render, 1000);
    }

    /* ---------------- 数据 ---------------- */

    function _Load(showLoading) {
        if (!orderNo) {
            $Panel.html('<div class="rs-empty"><span class="rs-empty__icon">🧾</span>缺少订单号</div>');
            return;
        }

        if (showLoading) $Panel.html('<div class="rs-panel__body">' + ui.skeleton(4, 'col-12 mb-3') + '</div>');

        trade.trade(orderNo, function (order) {
            if (!order) return;

            // 状态没变就不重绘：轮询每 2 秒一次，反复重建 DOM 会重复请求收款码图片
            const changed = !_order || Number(_order.status) !== Number(order.status);

            if (changed) {
                if (Number(order.status) >= 2 && (!_cards || !_cards.length)) {
                    trade.cards(orderNo, function (res) {
                        _cards = (res && res.cards) || [];
                        _Render(order);
                    }, function () { _Render(order); });
                } else {
                    _Render(order);
                }
            }

            // 未支付 -> 继续轮询；已支付 -> 停止
            if (Number(order.status) === 0) _StartPolling();
            else _StopPolling();
        });
    }

    function _StartPolling() {
        if (timer) return;
        timer = setInterval(function () { _Load(false); }, 2000);
    }

    function _StopPolling() {
        if (timer) { clearInterval(timer); timer = null; }
    }

    /* ---------------- 事件 ---------------- */

    $(document).on('click', '[data-role="paid"]', function () {
        const $btn = $(this);
        $btn.prop('disabled', true).addClass('is-disabled');
        trade.paidManually(orderNo, function (res) {
            if (Number(res.status) >= 2) {
                _StopPolling();
                ui.success(i18n('支付成功'));
                setTimeout(function () { location.href = 'order.html?no=' + encodeURIComponent(orderNo); }, 500);
            } else {
                ui.info('已标记为支付成功，等待人工发货');
                _Load(false);
            }
        }, function (err) {
            $btn.prop('disabled', false).removeClass('is-disabled');
            ui.error(err && err.message ? err.message : '操作失败');
        });
    });

    $(document).on('click', '[data-role="close"]', function () {
        ui.confirm('确定关闭订单？', '关闭后库存将释放，订单不可恢复。', '关闭订单').then(function (ok) {
            if (!ok) return;
            util.post('/user/api/order/close', { order_no: orderNo }, function () {
                ui.success('订单已关闭');
                _StopPolling();
                _Load(false);
            });
        });
    });

    $(document).on('click', '[data-role="copy-all"]', function () {
        if (!_cards.length) return;
        ui.copy(_cards.join('\n'));
    });

    /* ---------------- 启动 ---------------- */

    _Load(true);
    window.addEventListener('beforeunload', _StopPolling);
}();
