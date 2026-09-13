/* ============================================================
   EXA — Subsea Systems map (bản tối giản)
   Dựng theo Figma node 96:8225. Không dùng CMS.

   Dùng chung map.svg + map-manifest.json với bản đầy đủ,
   nhưng CSS/JS hoàn toàn tách riêng — sửa bản này không đụng bản kia.

   Nhúng:
     <div class="exalite" data-exalite data-src="https://<host>/"></div>
   Host phải trả header  Access-Control-Allow-Origin: *
   ============================================================ */
(function () {
  'use strict';

  var ART_W = 1765, ART_H = 996;
  /* Figma: Map Artwork rộng đúng bằng khung map (1312) → cửa sổ nhìn = trọn
     bề ngang artwork, canh mép trên. Khác bản đầy đủ (crop 1032 ở giữa). */
  var DESIGN_WINDOW_W = ART_W;
  var ZOOM_STEPS = [1, 1.6, 2.4, 3.4];
  var PANEL_W = 444, PANEL_INSET = 32;

  var I = {
    plus: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    minus: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    prev: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    swap: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 7h10l-2.5-2.5M17 13H7l2.5 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrow: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ============================================================ */

  function LiteMap(root) {
    this.root = root;
    this.src = (root.getAttribute('data-src') || '').replace(/\/?$/, '/');
    this.state = { selected: null, step: 0, tx: 0, ty: 0 };
    this.boot();
  }

  LiteMap.prototype.boot = function () {
    var self = this;
    this.root.classList.add('exalite');
    this.root.appendChild(el('div', 'exalite_loading', 'Loading map…'));

    var inline = window.EXA_LITE_INLINE;
    var load = inline
      ? Promise.resolve([inline.svg, inline.manifest, inline.data])
      : Promise.all([
        fetch(this.src + 'map.svg').then(function (r) { return r.text(); }),
        fetch(this.src + 'map-manifest.json').then(function (r) { return r.json(); }),
        fetch(this.src + 'map-data-lite.json').then(function (r) { return r.json(); })
      ]);

    load.then(function (res) {
      self.svgText = res[0];
      self.manifest = res[1];
      self.data = res[2];
      self.items = res[2].items.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      self.byslug = {};
      self.items.forEach(function (it) { self.byslug[it.slug] = it; });
      self.render();
    }).catch(function (e) {
      self.root.querySelector('.exalite_loading').textContent = 'Could not load the map: ' + e.message;
      if (window.console) console.error('[exalite]', e);
    });
  };

  /* ---------- DOM ---------- */

  LiteMap.prototype.render = function () {
    var self = this;
    var r = this.root;
    r.innerHTML = '';

    /* --- tab strip --- */
    var tabs = el('div', 'exalite_tabs');
    var inner = el('div', 'exalite_tabs-inner');

    var all = this.data.showAll || { label: 'Show All', sub: '' };
    inner.appendChild(this.buildTab({ slug: null, label: all.label, sub: all.sub }));
    this.items.forEach(function (it) { inner.appendChild(self.buildTab(it)); });

    tabs.appendChild(inner);
    this.tabsEl = inner;
    r.appendChild(tabs);

    /* --- map --- */
    var map = el('div', 'exalite_map');
    this.map = map;
    this.canvas = el('div', 'exalite_canvas');
    this.canvas.innerHTML = this.svgText;
    map.appendChild(this.canvas);

    var zoom = el('div', 'exalite_zoom');
    this.zIn = el('button', '', I.plus); this.zIn.type = 'button'; this.zIn.setAttribute('aria-label', 'Zoom in');
    this.zOut = el('button', '', I.minus); this.zOut.type = 'button'; this.zOut.setAttribute('aria-label', 'Zoom out');
    this.zIn.addEventListener('click', function () { self.zoom(1); });
    this.zOut.addEventListener('click', function () { self.zoom(-1); });
    zoom.appendChild(this.zIn); zoom.appendChild(this.zOut);
    map.appendChild(zoom);

    var pag = el('div', 'exalite_pagination');
    var prev = el('button', '', I.prev); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous');
    var next = el('button', '', I.next); next.type = 'button'; next.setAttribute('aria-label', 'Next');
    this.pagCount = el('span', 'exalite_pagination-count', '– / –');
    prev.addEventListener('click', function () { self.page(-1); });
    next.addEventListener('click', function () { self.page(1); });
    pag.appendChild(prev); pag.appendChild(this.pagCount); pag.appendChild(next);
    map.appendChild(pag);

    map.appendChild(this.buildPanel());
    r.appendChild(map);

    this.svg = this.canvas.querySelector('svg');
    this.wireMap();
    this.wirePan();
    this.setActiveTab(null);
    this.resize();

    window.addEventListener('resize', function () { self.resize(); });
    r.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && self.state.selected) self.select(null);
    });

    r.classList.add('is-ready');
  };

  LiteMap.prototype.buildTab = function (it) {
    var self = this;
    var b = el('button', 'exalite_tab');
    b.type = 'button';
    b.setAttribute('data-tab', it.slug || 'all');
    var body = '<span class="exalite_tab-label">' + esc(it.label) + '</span>';
    if (it.tag) body += '<span class="exalite_tag">' + esc(it.tag) + '</span>';
    else body += '<span class="exalite_tab-sub">' + esc(it.sub || '') + '</span>';
    b.innerHTML = body;
    b.addEventListener('click', function () {
      self.select(it.slug && self.state.selected !== it.slug ? it.slug : null);
    });
    return b;
  };

  LiteMap.prototype.buildPanel = function () {
    var self = this;
    var p = el('div', 'exalite_panel');
    var close = el('button', 'exalite_close', I.close);
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', function () { self.select(null); });
    p.appendChild(close);
    p.appendChild(el('div', 'exalite_panel-scroll'));
    this.panel = p;
    this.panelBody = p.querySelector('.exalite_panel-scroll');
    return p;
  };

  LiteMap.prototype.fillPanel = function (it) {
    var meta = this.manifest.items[it.slug];
    var hasGeometry = !!(meta && meta.bbox && meta.bbox.w > 40);

    var rows = [
      ['Length', esc(it.length)],
      ['Landing countries', esc(it.countries)],
      ['Status', '<span class="exalite_status' + (it.statusTone === 'pending' ? ' is-pending' : '') + '">' + esc(it.status) + '</span>']
    ];

    this.panelBody.innerHTML =
      '<div class="exalite_kicker">' + esc(it.kicker) + '</div>' +
      '<h3 class="exalite_title">' + esc(it.name) + '</h3>' +
      '<div class="exalite_route"><span>' + esc(it.from) + '</span>' + I.swap + '<span>' + esc(it.to) + '</span></div>' +
      '<p class="exalite_desc">' + esc(it.description) + '</p>' +
      '<dl class="exalite_specs">' + rows.map(function (r) {
        return '<div class="exalite_spec"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
      }).join('') + '</dl>' +
      (it.link ? '<a class="exalite_link" href="' + esc(it.link) + '" target="_top">View on our network' + I.arrow + '</a>' : '') +
      (hasGeometry ? '' : '<div class="exalite_note">Route geometry not exported yet — nothing to highlight on the map for this system.</div>');

    this.panelBody.scrollTop = 0;
  };

  /* ---------- chọn ---------- */

  LiteMap.prototype.select = function (slug) {
    var it = slug ? this.byslug[slug] : null;
    this.state.selected = it ? slug : null;

    /* Tuyến chưa có geometry: mở panel nhưng KHÔNG bật is-selected,
       nếu không map sẽ trắng trơn vì ẩn hết mà chẳng có gì để chừa lại. */
    var meta = it ? this.manifest.items[slug] : null;
    var hasGeometry = !!(meta && meta.bbox && meta.bbox.w > 40);

    this.root.classList.toggle('is-selected', !!it && hasGeometry);
    this.root.classList.toggle('is-panel-open', !!it);

    this.svg.querySelectorAll('[data-item]').forEach(function (g) {
      g.classList.toggle('is-active', g.getAttribute('data-item') === slug);
    });

    var keep = {};
    if (it && this.manifest.items[slug]) {
      (this.manifest.items[slug].dots || []).forEach(function (d) { keep[d] = true; });
    }
    this.svg.querySelectorAll('.mdot').forEach(function (g) {
      g.classList.toggle('is-shown', !!keep[g.getAttribute('data-dot')]);
    });

    this.setActiveTab(this.state.selected);
    if (it) this.fillPanel(it);
    this.updatePagination();

    if (it && hasGeometry) this.flyTo(slug); else this.resetView();
  };

  LiteMap.prototype.setActiveTab = function (slug) {
    var key = slug || 'all';
    this.tabsEl.querySelectorAll('.exalite_tab').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-tab') === key);
    });
  };

  LiteMap.prototype.updatePagination = function () {
    var i = -1;
    for (var k = 0; k < this.items.length; k++) if (this.items[k].slug === this.state.selected) i = k;
    this.pagCount.textContent = (i < 0 ? '–' : i + 1) + ' / ' + this.items.length;
  };

  LiteMap.prototype.page = function (dir) {
    if (!this.items.length) return;
    var i = -1;
    for (var k = 0; k < this.items.length; k++) if (this.items[k].slug === this.state.selected) i = k;
    if (i < 0) i = dir > 0 ? -1 : 0;
    i = (i + dir + this.items.length) % this.items.length;
    this.select(this.items[i].slug);
  };

  LiteMap.prototype.wireMap = function () {
    var self = this;
    this.svg.querySelectorAll('.mroute[data-item]').forEach(function (g) {
      g.addEventListener('click', function (e) {
        e.stopPropagation();
        var slug = g.getAttribute('data-item');
        if (self.byslug[slug]) self.select(self.state.selected === slug ? null : slug);
      });
    });
  };

  /* ---------- zoom / pan ---------- */

  LiteMap.prototype.metrics = function () {
    var w = this.map.clientWidth, h = this.map.clientHeight;
    /* lấy max để artwork luôn phủ kín khung, không hở mép */
    return { w: w, h: h, s0: Math.max(w / DESIGN_WINDOW_W, h / ART_H) };
  };

  LiteMap.prototype.apply = function (animate) {
    var m = this.metrics();
    var s = m.s0 * ZOOM_STEPS[this.state.step];
    this.state.tx = clamp(this.state.tx, m.w - ART_W * s, 0);
    this.state.ty = clamp(this.state.ty, m.h - ART_H * s, 0);

    this.map.classList.toggle('is-animating', !!animate);
    this.canvas.style.transform =
      'translate(' + this.state.tx.toFixed(2) + 'px,' + this.state.ty.toFixed(2) + 'px) scale(' + s.toFixed(4) + ')';

    this.zIn.classList.toggle('is-disabled', this.state.step === ZOOM_STEPS.length - 1);
    this.zOut.classList.toggle('is-disabled', this.state.step === 0);
    this.map.classList.toggle('is-pannable', this.state.step > 0);

    if (animate) {
      var self = this;
      clearTimeout(this._t);
      this._t = setTimeout(function () { self.map.classList.remove('is-animating'); }, 600);
    }
  };

  LiteMap.prototype.resetView = function () {
    this.state.step = 0;
    this.state.tx = 0;
    this.state.ty = 0;   /* Figma canh mép trên, phần dưới bị cắt */
    this.apply(true);
  };

  LiteMap.prototype.resize = function () {
    if (this.state.step === 0 && !this.state.selected) { this.state.tx = 0; this.state.ty = 0; }
    this.apply(false);
  };

  LiteMap.prototype.flyTo = function (slug) {
    var meta = this.manifest.items[slug];
    if (!meta || !meta.bbox || meta.bbox.w < 40) { this.resetView(); return; }

    var m = this.metrics();
    var bb = meta.bbox;
    var narrow = m.w < 992;
    var usableW = narrow ? m.w : Math.max(240, m.w - (PANEL_W + PANEL_INSET * 2));

    var target = Math.min(usableW / (bb.w * 1.06), m.h / (bb.h * 1.6));
    target = clamp(target, m.s0, m.s0 * ZOOM_STEPS[ZOOM_STEPS.length - 1]);

    var ratio = target / m.s0, best = 0;
    for (var i = 0; i < ZOOM_STEPS.length; i++) {
      if (Math.abs(ZOOM_STEPS[i] - ratio) < Math.abs(ZOOM_STEPS[best] - ratio)) best = i;
    }
    this.state.step = best;
    var s = m.s0 * ZOOM_STEPS[best];

    var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    this.state.tx = usableW / 2 - s * cx;
    this.state.ty = m.h / 2 - s * cy;
    this.apply(true);
  };

  LiteMap.prototype.zoom = function (dir) {
    var m = this.metrics();
    var a = ZOOM_STEPS[this.state.step];
    this.state.step = clamp(this.state.step + dir, 0, ZOOM_STEPS.length - 1);
    var b = ZOOM_STEPS[this.state.step];
    this.state.tx = (this.state.tx - m.w / 2) * (b / a) + m.w / 2;
    this.state.ty = (this.state.ty - m.h / 2) * (b / a) + m.h / 2;
    this.apply(true);
  };

  LiteMap.prototype.wirePan = function () {
    var self = this, dragging = false, sx = 0, sy = 0, moved = 0;
    this.map.addEventListener('pointerdown', function (e) {
      if (self.state.step === 0) return;
      if (e.target.closest('.exalite_panel, .exalite_zoom, .exalite_pagination')) return;
      dragging = true; moved = 0;
      sx = e.clientX - self.state.tx;
      sy = e.clientY - self.state.ty;
      self.map.classList.add('is-dragging');
      self.map.setPointerCapture(e.pointerId);
    });
    this.map.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      self.state.tx = e.clientX - sx;
      self.state.ty = e.clientY - sy;
      self.apply(false);
    });
    ['pointerup', 'pointercancel'].forEach(function (t) {
      self.map.addEventListener(t, function () {
        dragging = false;
        self.map.classList.remove('is-dragging');
      });
    });
    this.map.addEventListener('click', function (e) {
      if (moved > 6) { e.stopPropagation(); moved = 0; }
    }, true);
  };

  /* ---------- init ---------- */
  function init() {
    document.querySelectorAll('[data-exalite]').forEach(function (n) {
      if (!n.__exalite) n.__exalite = new LiteMap(n);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.EXALiteMap = LiteMap;
})();
