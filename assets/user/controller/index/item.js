/*!
 * user/controller/index/item.js —— 商品详情 / 下单
 * 对应原站 assets/user/controller/index/item.js
 */
!function () {
    'use strict';

    const $Panel = $('[data-role="item-panel"]');
    const $Detail = $('[data-role="item-detail"]');

    let _item = null;          // 当前商品
    let _stock = 0;            // 当前 SKU 的实时库存
    let _available = false;    // 是否可下单
    let _loading = false;      // 防止重复提交

    /* ---------------- 取参数 ---------------- */

    function _ItemId() {
        // 支持 item.html?id=2 与伪静态 /item/2（由 404.html 回退重写）
        const direct = util.query('id') || util.query('itemId');
        if (direct) return direct;
        const m = location.pathname.match(/\/item\/([^/?#]+)/);
        return m ? m[1] : '';
    }

    /* ---------------- 渲染 ---------------- */

    function _Render(item) {
        _item = item;

        const skuList = (item.config && item.config.sku) || [];
        const raceName = (item.config && item.config.race) || i18n('宝贝类型');

        const stock = Stock.remaining(item, null);
        const sold = Number(item.order_sold || 0);

        // 默认选中第一个有货的 SKU
        let currentSku = null;
        for (let i = 0; i < skuList.length; i++) {
            if (Number(skuList[i].stock) > 0) { currentSku = skuList[i].name; break; }
        }

        const racesHtml = skuList.map(function (sk) {
            const disabled = Number(sk.stock) <= 0;
            return '<a href="javascript:void(0);" class="rs-race' + (disabled ? ' is-disabled' : '') +
                (sk.name === currentSku ? ' is-primary' : '') + '"' +
                (disabled ? '' : ' data-sku="' + util.escapeHtml(sk.name) + '"') + '>' +
                '<span>' + util.escapeHtml(sk.name) + '</span>' +
                '<small>' + treasure.price(sk.price) + (disabled ? ' · ' + i18n('售罄') : '') + '</small>' +
                '</a>';
        }).join('');

        const payHtml = ((getVar('CONFIG') || {}).payments || []).filter(function (p) { return p.enabled !== false; })
            .map(function (p, i) {
                return '<label class="rs-radio' + (i === 0 ? ' is-primary' : '') + '" data-pay="' + util.escapeHtml(p.id) + '">' +
                    '<img src="' + asset(p.icon) + '" alt="' + util.escapeHtml(p.name) + '">' +
                    '<span>' + util.escapeHtml(p.name) + '</span></label>';
            }).join('');

        const contact = LS.get('rs.contact', '');

        $Panel.html(
            '<div class="rs-panel__body">' +
            '<div class="item-head">' +
            '<div class="item-head__cover" style="' + treasure.thumb(item.cover) + '" title="' + util.escapeHtml(item.name) + '"></div>' +
            '<div class="item-head__main">' +
            '<h4 class="item-head__title">' + util.escapeHtml(i18n(item.name)) + '</h4>' +
            '<div class="item-head__meta">' +
            treasure.delivery(item) + treasure.tags(item) + treasure.recommend(item) +
            '<span class="badge-soft">' + i18n('已售') + ' ' + format.number(sold) + '</span>' +
            '<span class="badge-soft" data-role="stock">' + i18n('库存') + ' ' + format.number(Number(currentSku ? _SkuStock(skuList, currentSku) : stock)) + '</span>' +
            '</div>' +

            '<div class="item-price" data-role="price">' + treasure.price(currentSku ? _SkuPrice(skuList, currentSku) : item.price) + '</div>' +

            '<form class="vstack" autocomplete="off" data-role="order-form">' +
            (skuList.length ? '<div class="vstack__row">' +
                '<div class="vstack__label">' + util.escapeHtml(i18n(raceName)) + '</div>' +
                '<div class="vstack__ctrl"><div class="rs-switch-race" data-role="races">' + racesHtml + '</div></div>' +
                '</div>' : '') +

            '<div class="vstack__row">' +
            '<div class="vstack__label">' + i18n('联系方式') + '</div>' +
            '<div class="vstack__ctrl"><input class="rs-input" name="contact" autocomplete="off" value="' + util.escapeHtml(contact) + '" placeholder="' + i18n('请输入您的联系方式') + '"></div>' +
            '</div>' +

            '<div class="vstack__row">' +
            '<div class="vstack__label">' + i18n('购买数量') + '</div>' +
            '<div class="vstack__ctrl"><div class="rs-stepper">' +
            '<button type="button" data-step="-1">−</button>' +
            '<input name="num" value="1" inputmode="numeric" autocomplete="off">' +
            '<button type="button" data-step="1">+</button>' +
            '</div></div>' +
            '</div>' +

            '<div class="vstack__row">' +
            '<div class="vstack__label">' + i18n('付款') + '</div>' +
            '<div class="vstack__ctrl"><div class="rs-radio-group" data-role="payments">' + payHtml + '</div></div>' +
            '</div>' +
            '</form>' +

            '<div class="checkout-bar mt-3">' +
            '<div>' +
            '<div class="checkout-bar__sum" data-role="sum"></div>' +
            '<div class="checkout-bar__amount" data-role="amount">—</div>' +
            '</div>' +
            '<button class="rs-btn rs-btn--lg" data-role="submit">' + i18n('立即付款') + '</button>' +
            '</div>' +
            '</div>' +
            '</div>'
        );

        // 商品详情只渲染描述文本（原来的「商品 ID / 分类 ID」是调试信息，已去掉）
        const description = String(item.description || '').trim();
        $Detail.html(description ? '<p>' + util.escapeHtml(description) + '</p>' : '<p class="text-muted-2">—</p>');

        document.title = i18n(item.name) + ' - ' + ((getVar('CONFIG') || {}).site || {}).name;
        _Valuation();
    }

    function _SkuStock(skuList, name) {
        for (let i = 0; i < skuList.length; i++) if (skuList[i].name === name) return Number(skuList[i].stock);
        return 0;
    }
    function _SkuPrice(skuList, name) {
        for (let i = 0; i < skuList.length; i++) if (skuList[i].name === name) return Number(skuList[i].price);
        return 0;
    }

    /* ---------------- 采集下单参数 ---------------- */

    function _GetPostData() {
        const post = util.arrayToObject($('.vstack').serializeArray());
        post['item_id'] = _item.id;

        const $picked = $('.rs-race.is-primary');
        if ($picked.length) post['race'] = $picked.data('sku');

        post['num'] = Math.max(1, parseInt(post['num'], 10) || 1);
        post['pay'] = $('[data-role="payments"] .rs-radio.is-primary').data('pay') || 'wechat';
        return post;
    }

    /* ---------------- 算价 + 查库存 ---------------- */

    function _Valuation() {
        if (!_item) return;
        const post = _GetPostData();

        trade.valuation(post, function (res) {
            if (!res) return;

            _stock = Number(res.stock || 0);
            _available = !!res.ok && _stock > 0;

            $('[data-role="amount"]').html(treasure.price(res.amount));
            $('[data-role="sum"]').text('共 ' + res.num + ' 件 · 单价 ' + format.currency(res.price));

            if (post.race) {
                $('[data-role="price"]').html(treasure.price(res.price));
                $('[data-role="stock"]').text(i18n('库存') + ' ' + format.number(_stock));
            }

            const $btn = $('[data-role="submit"]');
            $btn.prop('disabled', !_available).toggleClass('is-disabled', !_available);
            $btn.text(_available ? i18n('立即付款') : (res.message || i18n('售罄')));

            if (!res.ok && res.message) ui.error(res.message);
        });
    }

    /* ---------------- 事件 ---------------- */

    $(document).on('click', '.rs-race[data-sku]', function () {
        $('.rs-race').removeClass('is-primary');
        $(this).addClass('is-primary');
        const sku = $(this).data('sku');
        const skuList = (_item.config && _item.config.sku) || [];
        $('[data-role="price"]').html(treasure.price(_SkuPrice(skuList, sku)));
        _Valuation();
    });

    $(document).on('click', '.rs-stepper button[data-step]', function () {
        const $input = $(this).siblings('input[name=num]');
        let num = (parseInt($input.val(), 10) || 1) + Number($(this).data('step'));
        if (num < 1) num = 1;
        if (_stock > 0 && num > _stock) { num = _stock; ui.error(i18n('购买数量不能超过库存')); }
        if (num > 999) num = 999;
        $input.val(num);
        _Valuation();
    });

    $(document).on('change input', 'input[name=num]', function () {
        let num = parseInt($(this).val(), 10) || 1;
        if (num < 1) num = 1;
        if (_stock > 0 && num > _stock) num = _stock;
        $(this).val(num);
        _Valuation();
    });

    $(document).on('click', '[data-role="payments"] .rs-radio', function () {
        $('[data-role="payments"] .rs-radio').removeClass('is-primary');
        $(this).addClass('is-primary');
    });

    $(document).on('click', '.item-head__cover', function () {
        if (!_item) return;
        ui.alert(i18n(_item.name), _item.description || '');
    });

    /* ---------------- 提交订单 ---------------- */

    function _Pay($btn) {
        if (_loading || !_available) return;
        _loading = true;

        $btn = $btn && $btn.length ? $btn : $('[data-role="submit"]');
        const idx = ui.loading();
        $btn.prop('disabled', true).text(i18n('提交') + '...');

        const post = _GetPostData();
        LS.set('rs.contact', post.contact || '');

        trade.pay(post, function (res) {
            ui.loadingClose(idx);
            ui.success('下单成功，正在跳转收银台');
            setTimeout(function () {
                location.href = 'order.html?no=' + encodeURIComponent(res.order_no);
            }, 400);
        }, function (err) {
            ui.loadingClose(idx);
            _loading = false;
            $btn.prop('disabled', false).text(i18n('立即付款'));
            ui.error(err && err.message ? err.message : '下单失败，请稍后重试');
        });
    }

    // 表单回车 => 等同于点击「立即付款」
    $(document).on('submit', '[data-role="order-form"]', function (e) {
        e.preventDefault();
        _Pay($('[data-role="submit"]'));
    });

    $(document).on('click', '[data-role="submit"]', function () {
        _Pay($(this));
    });

    /* ---------------- 启动 ---------------- */

    const itemId = _ItemId();
    if (!itemId) {
        $Panel.html('<div class="rs-empty"><span class="rs-empty__icon">🔍</span>缺少商品参数' +
            '<div class="mt-3"><a class="rs-btn" href="index.html">' + i18n('全部商品') + '</a></div></div>');
    } else {
        $Panel.html('<div class="rs-panel__body"><div class="row">' + ui.skeleton(3, 'col-12 col-md-4 mb-3') + '</div></div>');
        trade.getItem(itemId, function (item) {
            _Render(item);
        });
    }
}();
