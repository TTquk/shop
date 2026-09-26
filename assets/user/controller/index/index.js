/*!
 * user/controller/index/index.js —— 首页（分类切换 / 搜索 / 商品列表 / 侧栏）
 * 与原站同名同路径，仅依赖 trade / treasure / util / format 这些全局对象
 */
!function () {
    'use strict';

    const $SwitchCategory = $('.switch-category');
    const $ItemList = $('.item-list');
    const $Search = $('.rs-search input[name=q]');

    let keyword = util.query('q') || '';
    let categoryId = util.query('cat') || 0;

    /* ---------------- 商品列表 ---------------- */

    function _PushCommodityList(data) {
        $ItemList.html('');

        if (!data || !data.length) {
            $ItemList.html('<div class="item-message">' +
                '<span class="rs-empty__icon">🗂</span>' + i18n('没有商品') +
                '<div class="mt-2"><button class="rs-btn rs-btn--ghost" data-role="reset-filter">' + i18n('全部商品') + '</button></div>' +
                '</div>');
            return;
        }

        data.forEach(function (item) {
            const isSoldOut = Number(item.stock) <= 0;
            $ItemList.append(
                '<a href="' + (!isSoldOut ? 'item.html?id=' + item.id : 'javascript:void(0);') + '"' +
                ' class="col-12 col-md-6 col-lg-4 col-xl-3 mb-3" data-id="' + item.id + '">' +
                '<div class="acg-card' + (isSoldOut ? ' soldout' : '') + ' h-100">' +
                '<div class="acg-thumb" style="' + treasure.thumb(item.cover) + '"></div>' +
                '<div class="p-3 d-flex flex-column flex-grow-1">' +
                '<div class="tags">' + treasure.tags(item) + treasure.delivery(item) + treasure.recommend(item) + '</div>' +
                '<p class="goods-title">' + util.escapeHtml(i18n(item.name)) + '</p>' +
                '<div class="stat-row mt-auto mb-1"><div class="price">' + treasure.price(item.price) + '</div></div>' +
                '<div class="stat-bottom">' +
                '<span>' + i18n('库存：') + format.number(item.stock) + '</span>' +
                '<span>' + i18n('已售：') + format.number(item.order_sold) + '</span>' +
                '</div></div>' +
                (isSoldOut ? '<div class="soldout-ribbon">' + i18n('售罄') + '</div>' : '') +
                '</div></a>'
            );
        });
    }

    function _LoadList() {
        $ItemList.html(ui.skeleton(8));
        trade.getCommodityList({
            keywords: keyword,
            categoryId: categoryId,
            done: function (data) {
                _PushCommodityList(data);
                _SyncUrl();
            }
        });
    }

    /* ---------------- 分类 ---------------- */

    function _PushCategories(list) {
        $SwitchCategory.html('');

        list.forEach(function (cat) {
            $SwitchCategory.append(
                '<a data-id="' + cat.id + '" class="switch-category chip' + (String(cat.id) === String(categoryId) ? ' is-primary' : '') + '"' +
                ' href="javascript:void(0);">' +
                '<span class="chip-icon" style="' + treasure.thumb(cat.icon || 'assets/images/favicon.svg') + '"></span>' +
                util.escapeHtml(cat.name) +
                '</a>'
            );
        });
    }

    function _SwitchCategory(id, push) {
        categoryId = id;
        $SwitchCategory.find('a').removeClass('is-primary');
        $SwitchCategory.find('a[data-id="' + id + '"]').addClass('is-primary');
        _LoadList();
        if (push) _SyncUrl();
    }

    /** 地址栏保持可分享的 URL（原站是 /cat/12，静态托管下配合 404.html 回退） */
    function _SyncUrl() {
        if (!window.history || !history.pushState) return;
        const root = window.SITE_ROOT || '';
        let target;
        if (keyword) target = root + '/index.html?q=' + encodeURIComponent(keyword);
        else if (String(categoryId) !== '0') target = root + '/cat/' + categoryId;
        else target = root + '/';

        try { history.replaceState(null, '', target); } catch (e) { /* file:// 下忽略 */ }
    }

    /* ---------------- 侧栏 ---------------- */

    function _PushSidebar(res) {
        const cfg = res.config || {};

        // 公告 / 联系与售后：由公共层统一渲染，避免多页重复
        treasure.renderSidebar(res);

        // 站点统计
        if (res.stats) {
            $('[data-role="shop-stats"]').html(
                '<span>' + i18n('库存：') + format.number(res.stats.stock) + '</span>' +
                '<span>' + i18n('已售：') + format.number(res.stats.sold) + '</span>'
            );
        }

        // 顶部 hero 文案（公告行是可选的，没有就隐藏，避免留下空段落）
        const announcementLines = (cfg.announcement && cfg.announcement.lines) || [];
        $('[data-role="hero-line-1"]').text(i18n(announcementLines[0] || '')).toggle(!!announcementLines[0]);
        $('[data-role="hero-line-2"]').text(i18n(announcementLines[1] || '')).toggle(!!announcementLines[1]);
        $('[data-role="hero-slogan"]').text(i18n((cfg.site && cfg.site.slogan) || ''));
        $('[data-role="hero-sub"]').text(i18n((cfg.site && cfg.site.sub) || ''));
    }

    /* ---------------- 事件 ---------------- */

    function _Bind() {
        // 分类切换（含 future 加载出来的节点）
        $(document).on('click', '.switch-category[data-id]', function () {
            const id = $(this).data('id');
            keyword = '';
            if ($Search.length) $Search.val('');
            _SwitchCategory(id, true);
        });

        // 搜索
        $(document).on('submit', '.rs-search', function (e) {
            e.preventDefault();
            const kw = String($(this).find('input[name=q]').val() || '').trim();
            keyword = kw;
            if (kw) { categoryId = 0; $SwitchCategory.find('a').removeClass('is-primary'); }
            _LoadList();
            ui.toast(kw ? '搜索：' + kw : i18n('全部商品'), 'info');
        });

        // 顶部搜索框实时回填
        if ($Search.length && keyword) $Search.val(keyword);

        // 清空筛选
        $(document).on('click', '[data-role="reset-filter"]', function () {
            keyword = '';
            categoryId = 0;
            if ($Search.length) $Search.val('');
            _SwitchCategory(0, true);
        });
    }

    /* ---------------- 启动 ---------------- */

    trade.getCategoryList(function (res) {
        _PushCategories(res.categories || []);
        _PushSidebar(res);
    });

    _Bind();
    _LoadList();
    Chrome.uptime();
}();
