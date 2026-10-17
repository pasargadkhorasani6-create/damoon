<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * شورت‌کدها.
 *
 * [damoon_signal]  فرم ساخت ستاپ + نمودار
 * [damoon_record]  کارنامهٔ همهٔ سیگنال‌ها
 * [damoon_scan]    آخرین وضعیت اسکن خودکار هر نماد (خرید، فروش، خنثی)
 * [damoon_pulse]   نبض بازار: نظرات شبکه‌های اجتماعی، اخبار و هم‌سویی با ربات
 */
class Damoon_UI {

	const TF_LABELS = array(
		'15m' => '۱۵ دقیقه',
		'1h'  => '۱ ساعت',
		'4h'  => '۴ ساعت',
		'1d'  => 'روزانه',
	);

	public static function init() {
		add_shortcode( 'damoon_signal', array( __CLASS__, 'sc_signal' ) );
		add_shortcode( 'damoon_record', array( __CLASS__, 'sc_record' ) );
		add_shortcode( 'damoon_scan', array( __CLASS__, 'sc_scan' ) );
		add_shortcode( 'damoon_pulse', array( __CLASS__, 'sc_pulse' ) );
		add_filter( 'the_content', array( __CLASS__, 'auto_content' ), 20 );
		add_action( 'wp_footer', array( __CLASS__, 'auto_front' ), 5 );
	}

	/** آیا نبض بازار در این درخواست قبلاً نمایش داده شده؟ (جلوگیری از نمایش دوباره) */
	private static $pulse_shown = false;

	private static function auto_on( $where ) {
		return damoon_sig_opt( 'pulse_enabled' ) && in_array( $where, damoon_sig_list( damoon_sig_opt( 'pulse_auto' ), false ), true );
	}

	/** زیر صفحه‌هایی که ستاپ‌ساز یا اسکن ربات دارند، نبض بازار خودکار اضافه می‌شود. */
	public static function auto_content( $content ) {
		if ( self::$pulse_shown || is_admin() || ! is_singular() || ! in_the_loop() || ! is_main_query() || ! self::auto_on( 'robot' ) ) {
			return $content;
		}
		$raw = (string) get_post_field( 'post_content', get_the_ID() );
		if ( has_shortcode( $raw, 'damoon_pulse' ) || ( ! has_shortcode( $raw, 'damoon_scan' ) && ! has_shortcode( $raw, 'damoon_signal' ) ) ) {
			return $content;
		}
		return $content . self::sc_pulse( array( 'theme' => false !== strpos( $raw, 'theme="dark"' ) ? 'dark' : '' ) );
	}

	/**
	 * صفحهٔ اصلی: قالب‌ها معمولاً the_content را صدا نمی‌زنند، پس بخش در فوتر چاپ می‌شود
	 * و با اسکریپت کوچک بعد از عنصر انتخابی (pulse_anchor) یا قبل از فوتر سایت جابه‌جا می‌شود.
	 */
	public static function auto_front() {
		if ( self::$pulse_shown || is_admin() || ! is_front_page() || ! self::auto_on( 'front' ) ) {
			return;
		}
		$html = self::sc_pulse( array( 'theme' => 'dark' ) );
		if ( '' === $html ) {
			return;
		}
		$anchor = (string) damoon_sig_opt( 'pulse_anchor' );
		echo '<div id="dmn-pulse-auto" class="dmn-auto">' . $html . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- خروجی شورت‌کد escape شده است
		?>
		<script>
		(function () {
			var box = document.getElementById('dmn-pulse-auto');
			if (!box) { return; }
			var anchor = null;
			try { anchor = <?php echo wp_json_encode( $anchor ); ?> ? document.querySelector(<?php echo wp_json_encode( $anchor ); ?>) : null; } catch (e) { anchor = null; }
			if (anchor && anchor.parentNode) { anchor.parentNode.insertBefore(box, anchor.nextSibling); return; }
			var footer = document.querySelector('body > footer, .site-footer, footer#colophon, #footer, footer');
			if (footer && footer.parentNode) { footer.parentNode.insertBefore(box, footer); }
		})();
		</script>
		<?php
	}

	private static function assets() {
		wp_enqueue_style( 'damoon-signal', DAMOON_SIG_URL . 'assets/app.css', array(), DAMOON_SIG_VER );
		wp_enqueue_script( 'damoon-signal', DAMOON_SIG_URL . 'assets/app.js', array(), DAMOON_SIG_VER, true );
		wp_localize_script(
			'damoon-signal',
			'DamoonSig',
			array(
				'root'    => esc_url_raw( rest_url( 'damoon/v1/' ) ),
				'nonce'   => is_user_logged_in() ? wp_create_nonce( 'wp_rest' ) : '',
				'symbols' => damoon_sig_symbols(),
				'tfs'     => self::TF_LABELS,
			)
		);
	}

	const DISCLAIMER = 'این تحلیل‌ها قطعی نیستند و ممکن است اشتباه باشند. فقط برای آموزش و معاملهٔ کاغذی است و توصیهٔ مالی نیست.';

	public static function sc_signal() {
		if ( ! damoon_sig_can_use() ) {
			return self::denied();
		}
		self::assets();
		ob_start();
		?>
		<section class="dmn" dir="rtl" data-dmn="signal">
			<header class="dmn-head">
				<h2 class="dmn-title">ستاپ‌ساز</h2>
				<p class="dmn-sub">یک نماد انتخاب کنید. موتور قانون‌محور، جهت، ورود، حد ضرر و هدف را از روی کندل‌های بسته‌شده حساب می‌کند.</p>
			</header>

			<div class="dmn-controls">
				<div class="dmn-chips" data-dmn="symbols" role="group" aria-label="نماد"></div>
				<div class="dmn-seg" data-dmn="tfs" role="group" aria-label="تایم‌فریم"></div>
				<button type="button" class="dmn-btn" data-dmn="go">ساخت ستاپ</button>
			</div>

			<div class="dmn-body">
				<div class="dmn-chart">
					<canvas data-dmn="chart" aria-label="نمودار قیمت"></canvas>
					<p class="dmn-chart-msg" data-dmn="chart-msg" hidden></p>
				</div>
				<div class="dmn-result" data-dmn="result" aria-live="polite">
					<p class="dmn-empty">برای دیدن ستاپ، روی «ساخت ستاپ» بزنید.</p>
				</div>
			</div>

			<footer class="dmn-foot">
				<span data-dmn="quota"></span>
				<span class="dmn-warn"><?php echo esc_html( self::DISCLAIMER ); ?></span>
			</footer>
		</section>
		<?php
		return ob_get_clean();
	}

	const NAMES = array(
		'BTC'  => 'بیت‌کوین',
		'ETH'  => 'اتریوم',
		'SOL'  => 'سولانا',
		'BNB'  => 'بایننس‌کوین',
		'XRP'  => 'ریپل',
		'ADA'  => 'کاردانو',
		'DOGE' => 'دوج‌کوین',
		'TRX'  => 'ترون',
		'TON'  => 'تون‌کوین',
		'AVAX' => 'آوالانچ',
		'LINK' => 'چین‌لینک',
		'DOT'  => 'پولکادات',
		'LTC'  => 'لایت‌کوین',
	);

	public static function fa_digits( $s ) {
		return strtr( (string) $s, array( '0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴', '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹', '.' => '٫', ',' => '٬' ) );
	}

	/**
	 * [damoon_scan tf="4h" theme="dark" title="…" limit="10"]
	 * از دادهٔ ذخیره‌شدهٔ اسکن خودکار ساخته می‌شود و هیچ درخواست بیرونی نمی‌زند.
	 */
	public static function sc_scan( $atts ) {
		$atts  = shortcode_atts(
			array(
				'tf'    => '',
				'theme' => '',
				'title' => 'اسکن زندهٔ ربات',
				'limit' => 30,
			),
			$atts,
			'damoon_scan'
		);
		$items = array_slice( damoon_sig_scan_items( $atts['tf'] ), 0, max( 1, (int) $atts['limit'] ) );
		$last  = get_option( 'damoon_sig_scan_last' );
		wp_enqueue_style( 'damoon-signal', DAMOON_SIG_URL . 'assets/app.css', array(), DAMOON_SIG_VER );

		ob_start();
		?>
		<section class="dmn dmn-scan<?php echo 'dark' === $atts['theme'] ? ' dmn-dark' : ''; ?>" dir="rtl">
			<header class="dmn-scan-head">
				<h3 class="dmn-title"><?php echo esc_html( $atts['title'] ); ?></h3>
				<span class="dmn-sub">
					<?php
					echo esc_html(
						is_array( $last ) ? 'به‌روزرسانی: ' . self::fa_digits( wp_date( 'H:i', (int) $last['time'] ) ) : 'به‌روزرسانی هر ۱۵ دقیقه'
					);
					?>
				</span>
			</header>
			<?php if ( ! $items ) : ?>
				<p class="dmn-empty">
					<?php
					$err = get_transient( 'damoon_api_error' );
					echo esc_html( $err ? 'منبع داده در دسترس نیست؛ اسکن بعدی دوباره تلاش می‌کند.' : 'اولین اسکن هنوز انجام نشده است.' );
					?>
				</p>
			<?php endif; ?>
			<ul class="dmn-scan-list">
				<?php
				foreach ( $items as $it ) :
					$base  = preg_replace( '/(USDT|USDC|BUSD|FDUSD)$/', '', $it['symbol'] );
					$name  = self::NAMES[ $base ] ?? $base;
					$dir   = $it['direction'];
					$label = 'long' === $dir ? 'خرید' : ( 'short' === $dir ? 'فروش' : 'خنثی' );
					$chg   = $it['change_24h'];
					?>
					<li class="dmn-scan-item">
						<div class="dmn-scan-name">
							<b dir="ltr"><?php echo esc_html( Damoon_Telegram::pair( $it['symbol'] ) ); ?></b>
							<span><?php echo esc_html( $name . ' – ' . ( self::TF_LABELS[ $it['tf'] ] ?? $it['tf'] ) ); ?></span>
						</div>
						<div class="dmn-scan-price">
							<b><?php echo esc_html( self::fa_digits( number_format( (float) $it['price'], (int) $it['decimals'] ) ) ); ?></b>
							<?php if ( null !== $chg ) : ?>
								<span class="<?php echo $chg >= 0 ? 'is-up' : 'is-down'; ?>" dir="ltr"><?php echo esc_html( self::fa_digits( ( $chg > 0 ? '+' : '' ) . number_format( (float) $chg, 2 ) ) . '٪' ); ?></span>
							<?php endif; ?>
						</div>
						<span class="dmn-scan-badge <?php echo esc_attr( $dir ? 'is-' . $dir : 'is-none' ); ?>"><?php echo esc_html( $label ); ?></span>
					</li>
				<?php endforeach; ?>
			</ul>
		</section>
		<?php
		return ob_get_clean();
	}

	/**
	 * [damoon_pulse symbol="BTCUSDT" theme="dark" title="…"]
	 * بدون symbol، همهٔ نمادها به‌صورت دکمه نمایش داده می‌شوند. داده هر ۶۰ ثانیه در مرورگر تازه می‌شود.
	 */
	public static function sc_pulse( $atts ) {
		$atts    = shortcode_atts(
			array(
				'symbol' => '',
				'theme'  => '',
				'title'  => 'نبض بازار',
			),
			$atts,
			'damoon_pulse'
		);
		if ( ! damoon_sig_opt( 'pulse_enabled' ) ) {
			return '';
		}
		self::$pulse_shown = true;
		$symbols = damoon_sig_symbols();
		$symbol  = strtoupper( (string) $atts['symbol'] );
		$fixed   = in_array( $symbol, $symbols, true );
		if ( ! $fixed ) {
			$symbol = $symbols ? $symbols[0] : '';
		}
		self::assets();
		$initial = $symbol ? Damoon_Pulse::get( $symbol, false ) : null;

		ob_start();
		?>
		<section class="dmn dmn-pulse<?php echo 'dark' === $atts['theme'] ? ' dmn-dark' : ''; ?>" dir="rtl" data-dmn="pulse"
			data-symbol="<?php echo esc_attr( $symbol ); ?>" data-fixed="<?php echo $fixed ? '1' : '0'; ?>">
			<header class="dmn-pulse-head">
				<h3 class="dmn-title"><?php echo esc_html( $atts['title'] ); ?></h3>
				<span class="dmn-live" data-dmn="live"><i aria-hidden="true"></i><span>زنده</span></span>
				<span class="dmn-sub" data-dmn="updated"></span>
			</header>
			<?php if ( ! $fixed && count( $symbols ) > 1 ) : ?>
				<div class="dmn-chips" data-dmn="symbols" role="group" aria-label="نماد"></div>
			<?php endif; ?>
			<div data-dmn="body" aria-live="polite">
				<p class="dmn-empty">در حال دریافت نظرات و اخبار…</p>
			</div>
			<footer class="dmn-foot">
				<span>منابع: StockTwits (برچسب خرید/فروش توسط خود کاربران)، Reddit و اخبار (جهت تخمینی با واژه‌ها)، شاخص ترس و طمع alternative.me. فقط نظرات ۲۴ ساعت اخیر شمرده می‌شود.</span>
				<span class="dmn-warn"><?php echo esc_html( 'نظر کاربران شبکه‌های اجتماعی سیگنال معاملاتی نیست. ' . self::DISCLAIMER ); ?></span>
			</footer>
			<?php if ( $initial ) : ?>
				<script type="application/json" data-dmn="initial"><?php echo wp_json_encode( $initial, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE ); ?></script>
			<?php endif; ?>
		</section>
		<?php
		return ob_get_clean();
	}

	/** پیام عدم دسترسی؛ افزونه‌های عضویت می‌توانند با فیلتر damoon_sig_denied_html متن را عوض کنند. */
	private static function denied() {
		wp_enqueue_style( 'damoon-signal', DAMOON_SIG_URL . 'assets/app.css', array(), DAMOON_SIG_VER );
		if ( is_user_logged_in() ) {
			$body = '<p>حساب کاربری شما به ستاپ‌ساز دسترسی ندارد.</p>';
		} else {
			$url  = wp_login_url( get_permalink() ?: home_url( '/' ) );
			$body = '<p>ستاپ‌ساز فقط برای اعضا فعال است.</p><p><a class="dmn-btn" href="' . esc_url( $url ) . '">ورود به حساب</a></p>';
		}
		$html = '<section class="dmn dmn-denied" dir="rtl"><header class="dmn-head"><h2 class="dmn-title">ستاپ‌ساز</h2></header>' . $body . '</section>';
		return (string) apply_filters( 'damoon_sig_denied_html', $html, is_user_logged_in() );
	}

	public static function sc_record() {
		self::assets();
		ob_start();
		?>
		<section class="dmn" dir="rtl" data-dmn="record">
			<header class="dmn-head">
				<h2 class="dmn-title">کارنامه</h2>
				<p class="dmn-sub">همهٔ ستاپ‌های صادرشده، برنده و بازنده، بدون حذف. ورود با قیمت بسته‌شدن کندل سیگنال و بدون کارمزد محاسبه می‌شود.</p>
			</header>
			<div class="dmn-stats" data-dmn="stats"></div>
			<div class="dmn-curve" data-dmn="curve-wrap" hidden>
				<div class="dmn-curve-head">
					<span>منحنی تجمعی نتیجه (R)</span>
					<span class="dmn-num" data-dmn="curve-last"></span>
				</div>
				<canvas data-dmn="curve" aria-label="منحنی تجمعی نتیجهٔ سیگنال‌های بسته‌شده"></canvas>
			</div>
			<div class="dmn-table-wrap">
				<table class="dmn-table">
					<thead>
						<tr><th>زمان</th><th>نماد</th><th>جهت</th><th>ورود</th><th>حد ضرر</th><th>هدف</th><th>وضعیت</th><th>نتیجه (R)</th></tr>
					</thead>
					<tbody data-dmn="rows"></tbody>
				</table>
			</div>
			<footer class="dmn-foot"><span class="dmn-warn"><?php echo esc_html( self::DISCLAIMER ); ?></span></footer>
		</section>
		<?php
		return ob_get_clean();
	}
}
