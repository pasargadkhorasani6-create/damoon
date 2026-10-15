(function () {
	'use strict';
	var cfg = window.DamoonSig;
	if (!cfg) { return; }

	var STRATEGY = { mean_reversion: 'بازگشت به میانگین', trend_pullback: 'ادامهٔ روند' };
	var REGIME = { high_vol: 'نوسان بالا', normal: 'نوسان عادی', low_vol: 'نوسان پایین' };
	var STATUS = { open: 'باز', win: 'هدف', loss: 'حد ضرر', expired: 'منقضی' };

	function api(path, opts) {
		opts = opts || {};
		opts.headers = opts.headers || {};
		if (cfg.nonce) { opts.headers['X-WP-Nonce'] = cfg.nonce; }
		opts.credentials = 'same-origin';
		return fetch(cfg.root + path, opts).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (j) {
				if (!r.ok) { throw new Error(j.message || 'خطا در ارتباط با سرور.'); }
				return j;
			});
		});
	}

	function el(tag, cls, text) {
		var n = document.createElement(tag);
		if (cls) { n.className = cls; }
		if (text !== undefined) { n.textContent = text; }
		return n;
	}
	function fmt(v, d) {
		return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
	}
	function pair(s) { return s.replace(/(USDT|USDC|BUSD)$/, '/$1'); }
	function fa(n) { return Number(n).toLocaleString('fa-IR'); }

	/* ---------- نمودار کندلی روی canvas ---------- */

	function drawChart(canvas, data, levels) {
		var css = getComputedStyle(canvas.closest('.dmn'));
		var col = function (n) { return css.getPropertyValue(n).trim(); };
		var dpr = window.devicePixelRatio || 1;
		var W = canvas.clientWidth, H = canvas.clientHeight;
		if (!W || !H) { return; }
		canvas.width = W * dpr; canvas.height = H * dpr;
		var g = canvas.getContext('2d');
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, W, H);

		var padR = 74, padT = 12, padB = 22;
		var plotW = W - padR, plotH = H - padT - padB;
		var count = Math.max(30, Math.min(data.candles.length, Math.floor(plotW / 7)));
		var bars = data.candles.slice(-count);
		if (!bars.length) { return; }
		var t0 = bars[0].time;
		var ema = data.ema20.filter(function (p) { return p.time >= t0; });

		var lo = Infinity, hi = -Infinity;
		bars.forEach(function (b) { lo = Math.min(lo, b.low); hi = Math.max(hi, b.high); });
		(levels || []).forEach(function (l) { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); });
		var pad = (hi - lo) * 0.06 || hi * 0.01;
		lo -= pad; hi += pad;

		var step = plotW / bars.length;
		var x = function (i) { return i * step + step / 2; };
		var y = function (p) { return padT + (hi - p) / (hi - lo) * plotH; };

		g.font = '11px ui-monospace, Menlo, Consolas, monospace';
		g.textBaseline = 'middle';
		g.lineWidth = 1;
		for (var k = 0; k <= 4; k++) {
			var p = lo + (hi - lo) * k / 4, yy = Math.round(y(p)) + 0.5;
			g.strokeStyle = col('--dmn-line');
			g.beginPath(); g.moveTo(0, yy); g.lineTo(plotW, yy); g.stroke();
			g.fillStyle = col('--dmn-muted');
			g.fillText(fmt(p, data.decimals), plotW + 6, yy);
		}

		var bw = Math.max(1, Math.floor(step * 0.65));
		bars.forEach(function (b, i) {
			var c = b.close >= b.open ? col('--dmn-up') : col('--dmn-down');
			var cx = Math.round(x(i));
			g.strokeStyle = c; g.fillStyle = c;
			g.beginPath(); g.moveTo(cx + 0.5, y(b.high)); g.lineTo(cx + 0.5, y(b.low)); g.stroke();
			var top = y(Math.max(b.open, b.close)), h = Math.max(1, Math.abs(y(b.open) - y(b.close)));
			g.fillRect(cx - Math.floor(bw / 2), top, bw, h);
		});

		if (ema.length > 1) {
			var idx = {};
			bars.forEach(function (b, i) { idx[b.time] = i; });
			g.strokeStyle = col('--dmn-ema'); g.lineWidth = 1.5;
			g.beginPath();
			var started = false;
			ema.forEach(function (pt) {
				if (idx[pt.time] === undefined) { return; }
				var px = x(idx[pt.time]), py = y(pt.value);
				if (started) { g.lineTo(px, py); } else { g.moveTo(px, py); started = true; }
			});
			g.stroke();
		}

		(levels || []).forEach(function (l) {
			var yy = Math.round(y(l.price)) + 0.5;
			g.strokeStyle = l.color; g.lineWidth = 1; g.setLineDash([5, 4]);
			g.beginPath(); g.moveTo(0, yy); g.lineTo(plotW, yy); g.stroke();
			g.setLineDash([]);
			g.fillStyle = l.color;
			g.fillRect(plotW, yy - 9, padR, 18);
			g.fillStyle = '#fff';
			g.fillText(fmt(l.price, data.decimals), plotW + 6, yy);
		});

		g.fillStyle = col('--dmn-muted');
		g.textBaseline = 'alphabetic';
		g.fillText('EMA20', 6, H - 7);
	}

	/* ---------- ستاپ‌ساز ---------- */

	function initSignal(root) {
		var q = function (n) { return root.querySelector('[data-dmn="' + n + '"]'); };
		var canvas = q('chart'), msg = q('chart-msg'), result = q('result'), go = q('go'), quota = q('quota');
		var state = { symbol: cfg.symbols[0], tf: '1h', data: null, levels: null };

		function chips(box, items, key, label) {
			items.forEach(function (v) {
				var b = el('button', '', label(v));
				b.type = 'button';
				b.setAttribute('aria-pressed', String(state[key] === v));
				b.addEventListener('click', function () {
					state[key] = v; state.levels = null;
					box.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
					loadChart();
				});
				box.appendChild(b);
			});
		}
		chips(q('symbols'), cfg.symbols, 'symbol', pair);
		chips(q('tfs'), Object.keys(cfg.tfs), 'tf', function (t) { return cfg.tfs[t]; });

		function redraw() { if (state.data) { drawChart(canvas, state.data, state.levels); } }
		if (window.ResizeObserver) { new ResizeObserver(redraw).observe(canvas); } else { window.addEventListener('resize', redraw); }

		function loadChart() {
			var s = state.symbol, t = state.tf;
			msg.hidden = false; msg.textContent = 'در حال دریافت نمودار…';
			return api('candles?symbol=' + encodeURIComponent(s) + '&tf=' + encodeURIComponent(t)).then(function (d) {
				if (s !== state.symbol || t !== state.tf) { return; }
				state.data = d; msg.hidden = true; redraw();
			}).catch(function (e) {
				if (s !== state.symbol || t !== state.tf) { return; }
				state.data = null; msg.hidden = false; msg.textContent = e.message;
				canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
			});
		}

		function row(label, value, cls) {
			var li = el('li');
			li.appendChild(el('span', '', label));
			li.appendChild(el('span', 'dmn-num' + (cls ? ' ' + cls : ''), value));
			return li;
		}

		function render(a) {
			result.textContent = '';
			var head = el('div', 'dmn-res-head');
			head.appendChild(el('span', 'dmn-sym', pair(a.symbol) + ' · ' + a.tf));
			var s = a.setup;
			head.appendChild(el('span', 'dmn-badge ' + (s ? 'is-' + s.direction : 'is-none'),
				s ? (s.direction === 'long' ? 'خرید' : 'فروش') : 'بدون ستاپ'));
			result.appendChild(head);

			var d = a.decimals, ul = el('ul', 'dmn-levels');
			if (s) {
				ul.appendChild(row('ورود', fmt(s.entry, d)));
				ul.appendChild(row('حد ضرر', fmt(s.stop, d), 'is-down'));
				ul.appendChild(row('هدف', fmt(s.target, d), 'is-up'));
				ul.appendChild(row('ریسک', fmt(s.risk_pct, 2) + '%'));
				ul.appendChild(row('سود به ریسک', fmt(s.rr, 1)));
			} else {
				ul.appendChild(row('قیمت فعلی', fmt(a.price, d)));
			}
			result.appendChild(ul);
			result.appendChild(el('p', 'dmn-thesis', s ? a.thesis : a.reason.text));

			var tags = el('ul', 'dmn-tags');
			if (s) { tags.appendChild(el('li', '', STRATEGY[s.strategy] || s.strategy)); }
			if (a.regime) { tags.appendChild(el('li', '', REGIME[a.regime])); }
			if (a.indicators) { tags.appendChild(el('li', '', 'RSI ' + fmt(a.indicators.rsi, 1))); }
			result.appendChild(tags);

			var css = getComputedStyle(root);
			state.levels = s ? [
				{ price: s.entry, color: css.getPropertyValue('--dmn-ink').trim() },
				{ price: s.stop, color: css.getPropertyValue('--dmn-down').trim() },
				{ price: s.target, color: css.getPropertyValue('--dmn-up').trim() }
			] : null;
			redraw();
			if (a.quota) {
				quota.textContent = 'سهمیهٔ امروز: ' + fa(a.quota.used) + ' از ' + fa(a.quota.limit);
			}
		}

		go.addEventListener('click', function () {
			go.disabled = true; go.textContent = 'در حال تحلیل…';
			api('setup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ symbol: state.symbol, tf: state.tf })
			}).then(render).catch(function (e) {
				result.textContent = '';
				result.appendChild(el('p', 'dmn-error', e.message));
			}).then(function () { go.disabled = false; go.textContent = 'ساخت ستاپ'; });
		});

		loadChart();
	}

	/* ---------- منحنی تجمعی R ---------- */

	function drawCurve(canvas, pts) {
		var css = getComputedStyle(canvas.closest('.dmn'));
		var col = function (n) { return css.getPropertyValue(n).trim(); };
		var dpr = window.devicePixelRatio || 1;
		var W = canvas.clientWidth, H = canvas.clientHeight;
		if (!W || !H || pts.length < 1) { return; }
		canvas.width = W * dpr; canvas.height = H * dpr;
		var g = canvas.getContext('2d');
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, W, H);

		var padR = 56, padT = 10, padB = 10;
		var plotW = W - padR, plotH = H - padT - padB;
		var series = [0].concat(pts.map(function (p) { return p.r; }));
		var lo = Math.min.apply(null, series), hi = Math.max.apply(null, series);
		if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
		var x = function (i) { return series.length > 1 ? i / (series.length - 1) * plotW : plotW / 2; };
		var y = function (v) { return padT + (hi - v) / (hi - lo) * plotH; };

		g.font = '11px ui-monospace, Menlo, Consolas, monospace';
		g.textBaseline = 'middle';
		[hi, 0, lo].forEach(function (v) {
			var yy = Math.round(y(v)) + 0.5;
			g.strokeStyle = col('--dmn-line'); g.lineWidth = 1;
			g.setLineDash(v === 0 ? [] : [3, 4]);
			g.beginPath(); g.moveTo(0, yy); g.lineTo(plotW, yy); g.stroke();
			g.setLineDash([]);
			g.fillStyle = col('--dmn-muted');
			g.fillText((v > 0 ? '+' : '') + fmt(v, 1) + 'R', plotW + 6, yy);
		});

		var last = series[series.length - 1];
		var c = last >= 0 ? col('--dmn-up') : col('--dmn-down');
		g.beginPath();
		series.forEach(function (v, i) { if (i) { g.lineTo(x(i), y(v)); } else { g.moveTo(x(i), y(v)); } });
		g.strokeStyle = c; g.lineWidth = 2; g.lineJoin = 'round';
		g.stroke();
		g.lineTo(x(series.length - 1), y(0)); g.lineTo(x(0), y(0)); g.closePath();
		g.globalAlpha = 0.08; g.fillStyle = c; g.fill(); g.globalAlpha = 1;
	}

	/* ---------- کارنامه ---------- */

	function initRecord(root) {
		var stats = root.querySelector('[data-dmn="stats"]'), rows = root.querySelector('[data-dmn="rows"]');
		function tile(value, label) {
			var t = el('div', 'dmn-stat');
			t.appendChild(el('b', 'dmn-num', value));
			t.appendChild(el('span', '', label));
			stats.appendChild(t);
		}
		function cell(tr, text, cls) { tr.appendChild(el('td', cls || '', text)); }

		var curveWrap = root.querySelector('[data-dmn="curve-wrap"]'), curve = root.querySelector('[data-dmn="curve"]');

		api('record').then(function (r) {
			var s = r.stats;
			if (curveWrap && r.curve && r.curve.length) {
				var lastR = r.curve[r.curve.length - 1].r;
				curveWrap.hidden = false;
				var tag = root.querySelector('[data-dmn="curve-last"]');
				tag.textContent = (lastR > 0 ? '+' : '') + fmt(lastR, 2) + ' R';
				tag.className = 'dmn-num ' + (lastR > 0 ? 'is-up' : (lastR < 0 ? 'is-down' : ''));
				var redraw = function () { drawCurve(curve, r.curve); };
				if (window.ResizeObserver) { new ResizeObserver(redraw).observe(curve); } else { window.addEventListener('resize', redraw); }
				redraw();
			}
			tile(fa(s.total), 'کل ستاپ‌ها');
			tile(fa(s.open), 'باز');
			tile(fa(s.wins), 'به هدف رسیده');
			tile(fa(s.losses), 'حد ضرر خورده');
			tile(fa(s.expired), 'منقضی‌شده');
			tile((s.sum_r > 0 ? '+' : '') + fmt(s.sum_r, 2) + ' R', 'جمع نتیجه');
			if (s.win_rate !== null) {
				tile(fmt(s.win_rate, 1) + '%', 'نرخ برد');
				tile((s.avg_r > 0 ? '+' : '') + fmt(s.avg_r, 2) + ' R', 'میانگین هر معامله');
			} else {
				stats.appendChild(el('p', 'dmn-note',
					'نرخ برد و میانگین پس از ' + fa(s.min_n) + ' معاملهٔ بسته نمایش داده می‌شود. فعلاً ' + fa(s.closed) + ' معامله بسته شده است.'));
			}
			if (!r.rows.length) {
				var tr0 = el('tr'), td = el('td', '', 'هنوز ستاپی ثبت نشده است.');
				td.colSpan = 8; tr0.appendChild(td); rows.appendChild(tr0);
				return;
			}
			r.rows.forEach(function (x) {
				var tr = el('tr'), d = x.decimals;
				cell(tr, new Date(x.time * 1000).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' }));
				cell(tr, pair(x.symbol) + ' · ' + x.tf, 'dmn-num');
				cell(tr, x.direction === 'long' ? 'خرید' : 'فروش');
				cell(tr, fmt(x.entry, d), 'dmn-num');
				cell(tr, fmt(x.stop, d), 'dmn-num');
				cell(tr, fmt(x.target, d), 'dmn-num');
				cell(tr, STATUS[x.status] || x.status);
				cell(tr, x.r === null ? '—' : (x.r > 0 ? '+' : '') + fmt(x.r, 2),
					'dmn-num' + (x.r > 0 ? ' is-up' : (x.r < 0 ? ' is-down' : '')));
				rows.appendChild(tr);
			});
		}).catch(function (e) {
			stats.appendChild(el('p', 'dmn-error', e.message));
		});
	}


	/* ---------- نبض بازار ---------- */

	var SRC = { stocktwits: 'StockTwits', reddit: 'Reddit', news: 'اخبار', fng: 'ترس و طمع' };
	var SENT = { bull: 'خرید', bear: 'فروش' };
	var DIR = { long: 'خرید', short: 'فروش' };

	function ago(t) {
		var s = Math.max(0, Math.round(Date.now() / 1000 - t));
		if (s < 60) { return 'لحظاتی پیش'; }
		if (s < 3600) { return fa(Math.floor(s / 60)) + ' دقیقه پیش'; }
		if (s < 86400) { return fa(Math.floor(s / 3600)) + ' ساعت پیش'; }
		return fa(Math.floor(s / 86400)) + ' روز پیش';
	}
	function pct(v) { return fa(Math.round(v)) + '٪'; }

	function initPulse(root) {
		var q = function (n) { return root.querySelector('[data-dmn="' + n + '"]'); };
		var body = q('body'), updated = q('updated'), live = q('live');
		var state = { symbol: root.getAttribute('data-symbol'), data: null, seen: {}, timer: null };

		var chipsBox = q('symbols');
		if (chipsBox) {
			cfg.symbols.forEach(function (s) {
				var b = el('button', '', pair(s));
				b.type = 'button';
				b.setAttribute('aria-pressed', String(s === state.symbol));
				b.addEventListener('click', function () {
					if (s === state.symbol) { return; }
					state.symbol = s; state.seen = {}; state.primed = false; state.data = null;
					chipsBox.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
					body.textContent = ''; body.appendChild(el('p', 'dmn-empty', 'در حال دریافت…'));
					load();
				});
				chipsBox.appendChild(b);
			});
		}

		function section(title, sub) {
			var sec = el('section', 'dmn-pulse-sec');
			var h = el('h4', '', title);
			if (sub) { h.appendChild(el('small', '', ' ' + sub)); }
			sec.appendChild(h);
			return sec;
		}

		function card(label, value, cls, note) {
			var c = el('div', 'dmn-stat' + (cls ? ' ' + cls : ''));
			c.appendChild(el('span', '', label));
			c.appendChild(el('b', '', value));
			if (note) { c.appendChild(el('small', '', note)); }
			return c;
		}

		function bar(bullPct, bearPct) {
			var wrap = el('div', 'dmn-meter');
			wrap.setAttribute('role', 'img');
			wrap.setAttribute('aria-label', 'خرید ' + pct(bullPct) + '، فروش ' + pct(bearPct));
			var b = el('span', 'is-bull'); b.style.width = bullPct + '%';
			var s = el('span', 'is-bear'); s.style.width = bearPct + '%';
			wrap.appendChild(b); wrap.appendChild(s);
			var labels = el('div', 'dmn-meter-labels');
			labels.appendChild(el('span', 'is-up', 'خرید ' + pct(bullPct)));
			labels.appendChild(el('span', 'is-down', 'فروش ' + pct(bearPct)));
			var box = el('div');
			box.appendChild(wrap); box.appendChild(labels);
			return box;
		}

		function item(it, isNew) {
			var li = el('li', 'dmn-post' + (isNew ? ' dmn-new' : ''));
			var meta = el('div', 'dmn-post-meta');
			meta.appendChild(el('span', 'dmn-src is-' + it.source, it.source === 'news' && it.author ? it.author : SRC[it.source]));
			if (it.sentiment) {
				meta.appendChild(el('span', 'dmn-sent is-' + it.sentiment, SENT[it.sentiment] + (it.tagged ? '' : ' (تخمینی)')));
			}
			if (it.author && it.source !== 'news') { meta.appendChild(el('span', 'dmn-author', '@' + it.author)); }
			meta.appendChild(el('time', '', ago(it.time)));
			li.appendChild(meta);
			var text = it.url ? el('a', 'dmn-post-text', it.text) : el('p', 'dmn-post-text', it.text);
			if (it.url) { text.href = it.url; text.target = '_blank'; text.rel = 'noopener nofollow ugc'; }
			text.dir = 'auto';
			li.appendChild(text);
			return li;
		}

		function list(items, empty) {
			if (!items.length) { return el('p', 'dmn-empty', empty); }
			var ul = el('ul', 'dmn-posts');
			items.forEach(function (it) {
				ul.appendChild(item(it, state.primed && !state.seen[it.id]));
			});
			return ul;
		}

		function render(d) {
			state.data = d;
			body.textContent = '';
			var s = d.social;

			/* خلاصه */
			var grid = el('div', 'dmn-pulse-grid');
			var dm = d.damoon;
			grid.appendChild(card('ربات دامون' + (dm && dm.tf ? ' (' + (cfg.tfs[dm.tf] || dm.tf) + ')' : ''),
				dm && dm.direction ? DIR[dm.direction] : 'خنثی', dm && dm.direction ? 'is-' + dm.direction : 'is-none'));

			var crowd = card('نظر جمع', s.bull_pct === null ? 'نامشخص' : (s.bull_pct >= s.bear_pct ? 'خرید ' + pct(s.bull_pct) : 'فروش ' + pct(s.bear_pct)), '',
				s.bull_pct === null ? 'نظر جهت‌دار کافی نیست (' + fa(s.bull + s.bear) + ')' : 'از ' + fa(s.bull + s.bear) + ' نظر جهت‌دار');
			if (s.bull_pct !== null) { crowd.appendChild(bar(s.bull_pct, s.bear_pct)); }
			grid.appendChild(crowd);

			var VS = { agree: ['هم‌سو با ربات', 'is-up'], disagree: ['مخالف ربات', 'is-down'], mixed: ['نظرات دوگانه', ''] };
			var vs = d.versus && VS[d.versus];
			grid.appendChild(card('هم‌سویی جمع با دامون', vs ? vs[0] : '—', vs ? vs[1] : '',
				vs ? '' : (dm && dm.direction ? 'دادهٔ کافی نیست' : 'ربات فعلاً ستاپی ندارد')));

			if (d.fng) {
				grid.appendChild(card('ترس و طمع (کل بازار کریپتو)', d.fng.label, d.fng.value >= 55 ? 'is-up' : (d.fng.value <= 45 ? 'is-down' : ''), 'شاخص ' + fa(d.fng.value) + ' از ۱۰۰'));
			}
			body.appendChild(grid);

			/* حجم نظرات */
			var vol = el('div', 'dmn-stats');
			vol.appendChild(card('حجم نظرات ۲۴ ساعت', fa(s.total)));
			vol.appendChild(card('نظر در ساعت', s.per_hour === null ? '—' : fa(s.per_hour)));
			vol.appendChild(card('خرید', fa(s.bull), 'is-long'));
			vol.appendChild(card('فروش', fa(s.bear), 'is-short'));
			vol.appendChild(card('خنثی', fa(s.neutral)));
			body.appendChild(vol);

			var srcs = el('ul', 'dmn-tags');
			Object.keys(s.by_source || {}).forEach(function (k) {
				var t = s.by_source[k];
				srcs.appendChild(el('li', '', SRC[k] + ': ' + fa(t.total) + ' نظر، خرید ' + fa(t.bull) + '، فروش ' + fa(t.bear) + (t.tagged ? ' (برچسب کاربران)' : ' (تخمینی)')));
			});
			body.appendChild(srcs);

			/* نظرات هم‌سو */
			if (dm && dm.direction) {
				var al = section('نظرات هم‌سو با استراتژی دامون', '(' + DIR[dm.direction] + ')');
				al.appendChild(list(d.aligned, 'در ۲۴ ساعت اخیر نظری هم‌سو با ربات ثبت نشده است.'));
				body.appendChild(al);
			}

			/* جریان زنده و اخبار */
			var cols = el('div', 'dmn-pulse-cols');
			var feed = section('جریان زندهٔ نظرات');
			feed.appendChild(list(d.feed, 'نظری در ۲۴ ساعت اخیر پیدا نشد.'));
			cols.appendChild(feed);

			var news = section('اخبار و فاندامنتال', d.news.total ? '(لحن تیترها: ' + fa(d.news.bull) + ' مثبت، ' + fa(d.news.bear) + ' منفی، ' + fa(d.news.neutral) + ' خنثی)' : '');
			news.appendChild(list(d.news.items, 'خبری در ۲۴ ساعت اخیر پیدا نشد.'));
			cols.appendChild(news);
			body.appendChild(cols);

			var errs = Object.keys(d.errors || {});
			if (errs.length) {
				body.appendChild(el('p', 'dmn-note', 'در دسترس نبود: ' + errs.map(function (k) { return SRC[k] || k; }).join('، ') + '. دادهٔ این منابع در به‌روزرسانی بعدی دوباره گرفته می‌شود.'));
			}

			d.feed.concat(d.news.items).forEach(function (it) { state.seen[it.id] = true; });
			state.primed = true;
			stamp();
		}

		function stamp() {
			if (state.data) { updated.textContent = 'به‌روزرسانی: ' + ago(state.data.updated); }
		}

		function load() {
			var sym = state.symbol;
			live.classList.add('is-loading');
			return api('pulse?symbol=' + encodeURIComponent(sym)).then(function (d) {
				if (sym !== state.symbol) { return; }
				live.classList.remove('is-off');
				render(d);
			}).catch(function (e) {
				if (sym !== state.symbol) { return; }
				live.classList.add('is-off');
				if (!state.data) { body.textContent = ''; body.appendChild(el('p', 'dmn-empty', e.message)); }
			}).then(function () { live.classList.remove('is-loading'); });
		}

		var init = q('initial');
		if (init) {
			try { render(JSON.parse(init.textContent)); } catch (e) { /* داده‌ی اولیه نامعتبر؛ از API گرفته می‌شود */ }
		}
		load();
		setInterval(function () { if (!document.hidden) { load(); } }, 60000);
		setInterval(stamp, 15000);
		document.addEventListener('visibilitychange', function () { if (!document.hidden) { load(); } });
	}

	function boot() {
		document.querySelectorAll('.dmn[data-dmn="signal"]').forEach(initSignal);
		document.querySelectorAll('.dmn[data-dmn="record"]').forEach(initRecord);
		document.querySelectorAll('.dmn[data-dmn="pulse"]').forEach(initPulse);
	}
	if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
})();
