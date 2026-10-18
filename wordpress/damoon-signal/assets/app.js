(function () {
	'use strict';
	var cfg = window.DamoonSig;
	if (!cfg) { return; }

	var LANG = cfg.lang || 'fa', LOCALE = cfg.locale || 'fa-IR', DICT = cfg.t || {};

	/* متن ترجمه‌شده با جای‌گذاری {0}، {1}… */
	function T(key) {
		var args = Array.prototype.slice.call(arguments, 1);
		var s = DICT[key] !== undefined ? DICT[key] : key;
		return s.replace(/\{(\d+)\}/g, function (m, i) { return args[i] !== undefined ? args[i] : m; });
	}
	function prefixed(prefix, key) { var k = prefix + key; return DICT[k] !== undefined ? DICT[k] : key; }

	function api(path, opts) {
		opts = opts || {};
		opts.headers = opts.headers || {};
		if (cfg.nonce) { opts.headers['X-WP-Nonce'] = cfg.nonce; }
		opts.credentials = 'same-origin';
		path += (path.indexOf('?') < 0 ? '?' : '&') + 'lang=' + encodeURIComponent(LANG);
		return fetch(cfg.root + path, opts).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (j) {
				if (!r.ok) { throw new Error(j.message || T('net_error')); }
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
	/* عدد به خط زبان صفحه (ارقام فارسی فقط در فارسی). */
	function fa(n) { return Number(n).toLocaleString(LOCALE); }

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
			msg.hidden = false; msg.textContent = T('loading_chart');
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
				s ? T(s.direction === 'long' ? 'buy' : 'sell') : T('no_setup')));
			result.appendChild(head);

			var d = a.decimals, ul = el('ul', 'dmn-levels');
			if (s) {
				ul.appendChild(row(T('entry'), fmt(s.entry, d)));
				ul.appendChild(row(T('stop'), fmt(s.stop, d), 'is-down'));
				ul.appendChild(row(T('target'), fmt(s.target, d), 'is-up'));
				ul.appendChild(row(T('risk'), fmt(s.risk_pct, 2) + '%'));
				ul.appendChild(row(T('rr'), fmt(s.rr, 1)));
			} else {
				ul.appendChild(row(T('current_price'), fmt(a.price, d)));
			}
			result.appendChild(ul);
			result.appendChild(el('p', 'dmn-thesis', s ? a.thesis : a.reason.text));

			var tags = el('ul', 'dmn-tags');
			if (s) { tags.appendChild(el('li', '', prefixed('strategy_', s.strategy))); }
			if (a.regime) { tags.appendChild(el('li', '', prefixed('regime_', a.regime))); }
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
				quota.textContent = T('quota', fa(a.quota.used), fa(a.quota.limit));
			}
		}

		go.addEventListener('click', function () {
			go.disabled = true; go.textContent = T('analyzing');
			api('setup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ symbol: state.symbol, tf: state.tf })
			}).then(render).catch(function (e) {
				result.textContent = '';
				result.appendChild(el('p', 'dmn-error', e.message));
			}).then(function () { go.disabled = false; go.textContent = T('build_setup'); });
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
			tile(fa(s.total), T('total_setups'));
			tile(fa(s.open), T('open'));
			tile(fa(s.wins), T('hit_target'));
			tile(fa(s.losses), T('hit_stop'));
			tile(fa(s.expired), T('expired'));
			tile((s.sum_r > 0 ? '+' : '') + fmt(s.sum_r, 2) + ' R', T('sum_r'));
			if (s.win_rate !== null) {
				tile(fmt(s.win_rate, 1) + '%', T('win_rate'));
				tile((s.avg_r > 0 ? '+' : '') + fmt(s.avg_r, 2) + ' R', T('avg_r'));
			} else {
				stats.appendChild(el('p', 'dmn-note', T('min_n_note', fa(s.min_n), fa(s.closed))));
			}
			if (!r.rows.length) {
				var tr0 = el('tr'), td = el('td', '', T('no_setups_yet'));
				td.colSpan = 8; tr0.appendChild(td); rows.appendChild(tr0);
				return;
			}
			r.rows.forEach(function (x) {
				var tr = el('tr'), d = x.decimals;
				cell(tr, new Date(x.time * 1000).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' }));
				cell(tr, pair(x.symbol) + ' · ' + x.tf, 'dmn-num');
				cell(tr, T(x.direction === 'long' ? 'buy' : 'sell'));
				cell(tr, fmt(x.entry, d), 'dmn-num');
				cell(tr, fmt(x.stop, d), 'dmn-num');
				cell(tr, fmt(x.target, d), 'dmn-num');
				cell(tr, prefixed('status_', x.status));
				cell(tr, x.r === null ? '—' : (x.r > 0 ? '+' : '') + fmt(x.r, 2),
					'dmn-num' + (x.r > 0 ? ' is-up' : (x.r < 0 ? ' is-down' : '')));
				rows.appendChild(tr);
			});
		}).catch(function (e) {
			stats.appendChild(el('p', 'dmn-error', e.message));
		});
	}


	/* ---------- نبض بازار ---------- */

	var SRC = { stocktwits: 'StockTwits', reddit: 'Reddit', news: T('src_news'), fng: T('src_fng'), config: T('src_config') };
	var SENT = { bull: T('buy'), bear: T('sell') };
	var DIR = { long: T('buy'), short: T('sell') };
	/* برچسب ترس و طمع از روی عدد (همان مرزهای سمت سرور)، تا به زبان صفحه باشد. */
	function fngLabel(v) { return T('fng_' + (v < 25 ? 0 : v < 45 ? 1 : v < 55 ? 2 : v < 75 ? 3 : 4)); }

	function ago(t) {
		var s = Math.max(0, Math.round(Date.now() / 1000 - t));
		if (s < 60) { return T('just_now'); }
		if (s < 3600) { return T('min_ago', fa(Math.floor(s / 60))); }
		if (s < 86400) { return T('hr_ago', fa(Math.floor(s / 3600))); }
		return T('day_ago', fa(Math.floor(s / 86400)));
	}
	function pct(v) { return T('pct', fa(Math.round(v))); }

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
					body.textContent = ''; body.appendChild(el('p', 'dmn-empty', T('loading')));
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
			wrap.setAttribute('aria-label', T('buy') + ' ' + pct(bullPct) + T('list_sep') + T('sell') + ' ' + pct(bearPct));
			var b = el('span', 'is-bull'); b.style.width = bullPct + '%';
			var s = el('span', 'is-bear'); s.style.width = bearPct + '%';
			wrap.appendChild(b); wrap.appendChild(s);
			var labels = el('div', 'dmn-meter-labels');
			labels.appendChild(el('span', 'is-up', T('buy') + ' ' + pct(bullPct)));
			labels.appendChild(el('span', 'is-down', T('sell') + ' ' + pct(bearPct)));
			var box = el('div');
			box.appendChild(wrap); box.appendChild(labels);
			return box;
		}

		function item(it, isNew) {
			var li = el('li', 'dmn-post' + (isNew ? ' dmn-new' : ''));
			var meta = el('div', 'dmn-post-meta');
			meta.appendChild(el('span', 'dmn-src is-' + it.source, it.source === 'news' && it.author ? it.author : SRC[it.source]));
			if (it.sentiment) {
				meta.appendChild(el('span', 'dmn-sent is-' + it.sentiment, SENT[it.sentiment] + (it.tagged ? '' : ' ' + T('estimated'))));
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
			grid.appendChild(card(T('damoon_bot') + (dm && dm.tf ? ' (' + (cfg.tfs[dm.tf] || dm.tf) + ')' : ''),
				dm && dm.direction ? DIR[dm.direction] : T('neutral'), dm && dm.direction ? 'is-' + dm.direction : 'is-none'));

			var crowd = card(T('crowd'), s.bull_pct === null ? T('unknown') : (s.bull_pct >= s.bear_pct ? T('buy') + ' ' + pct(s.bull_pct) : T('sell') + ' ' + pct(s.bear_pct)), '',
				s.bull_pct === null ? T('few_votes', fa(s.bull + s.bear)) : T('from_votes', fa(s.bull + s.bear)));
			if (s.bull_pct !== null) { crowd.appendChild(bar(s.bull_pct, s.bear_pct)); }
			grid.appendChild(crowd);

			var VS = { agree: [T('vs_agree'), 'is-up'], disagree: [T('vs_disagree'), 'is-down'], mixed: [T('vs_mixed'), ''] };
			var vs = d.versus && VS[d.versus];
			grid.appendChild(card(T('vs_title'), vs ? vs[0] : '—', vs ? vs[1] : '',
				vs ? '' : (dm && dm.direction ? T('no_data') : T('bot_no_setup'))));

			if (d.fng) {
				grid.appendChild(card(T('fng_title'), fngLabel(d.fng.value), d.fng.value >= 55 ? 'is-up' : (d.fng.value <= 45 ? 'is-down' : ''), T('fng_index', fa(d.fng.value))));
			}
			body.appendChild(grid);

			/* حجم نظرات */
			var vol = el('div', 'dmn-stats');
			vol.appendChild(card(T('vol_24h'), fa(s.total)));
			vol.appendChild(card(T('per_hour'), s.per_hour === null ? '—' : fa(s.per_hour)));
			vol.appendChild(card(T('buy'), fa(s.bull), 'is-long'));
			vol.appendChild(card(T('sell'), fa(s.bear), 'is-short'));
			vol.appendChild(card(T('neutral'), fa(s.neutral)));
			body.appendChild(vol);

			var srcs = el('ul', 'dmn-tags');
			Object.keys(s.by_source || {}).forEach(function (k) {
				var t = s.by_source[k];
				srcs.appendChild(el('li', '', T('by_source', SRC[k] || k, fa(t.total), fa(t.bull), fa(t.bear)) + ' ' + T(t.tagged ? 'user_tagged' : 'estimated')));
			});
			body.appendChild(srcs);

			/* نظرات هم‌سو */
			if (dm && dm.direction) {
				var al = section(T('aligned_title'), '(' + DIR[dm.direction] + ')');
				al.appendChild(list(d.aligned, T('aligned_empty')));
				body.appendChild(al);
			}

			/* جریان زنده و اخبار */
			var cols = el('div', 'dmn-pulse-cols');
			var feed = section(T('feed_title'));
			feed.appendChild(list(d.feed, T('feed_empty')));
			cols.appendChild(feed);

			var news = section(T('news_title'), d.news.total ? T('news_tone', fa(d.news.bull), fa(d.news.bear), fa(d.news.neutral)) : '');
			news.appendChild(list(d.news.items, T('news_empty')));
			cols.appendChild(news);
			body.appendChild(cols);

			var errs = Object.keys(d.errors || {});
			if (errs.length) {
				body.appendChild(el('p', 'dmn-note', T('unavailable', errs.map(function (k) { return SRC[k] || k; }).join(T('list_sep')))));
			}

			d.feed.concat(d.news.items).forEach(function (it) { state.seen[it.id] = true; });
			state.primed = true;
			stamp();
		}

		function stamp() {
			if (state.data) { updated.textContent = T('updated', ago(state.data.updated)); }
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
