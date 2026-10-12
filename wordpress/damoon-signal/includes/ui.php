<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * شورت‌کدها و صفحهٔ تنظیمات.
 *
 * [damoon_signal]  فرم ساخت ستاپ + نمودار
 * [damoon_record]  کارنامهٔ همهٔ سیگنال‌ها
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
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'settings' ) );
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

	/* ---------- تنظیمات ---------- */

	public static function menu() {
		add_options_page( 'Damoon Signal', 'Damoon Signal', 'manage_options', 'damoon-signal', array( __CLASS__, 'page' ) );
	}

	public static function settings() {
		register_setting(
			'damoon_sig',
			'damoon_sig_options',
			array( 'sanitize_callback' => array( __CLASS__, 'sanitize' ) )
		);
	}

	public static function sanitize( $in ) {
		$d   = damoon_sig_defaults();
		$in  = (array) $in;
		$out = array();

		$base            = esc_url_raw( trim( (string) ( $in['api_base'] ?? '' ) ), array( 'https' ) );
		$out['api_base'] = $base ? untrailingslashit( $base ) : $d['api_base'];

		$syms = array();
		foreach ( explode( ',', strtoupper( (string) ( $in['symbols'] ?? '' ) ) ) as $s ) {
			$s = trim( $s );
			if ( preg_match( '/^[A-Z0-9]{5,20}$/', $s ) ) {
				$syms[] = $s;
			}
		}
		$out['symbols'] = $syms ? implode( ',', array_slice( array_unique( $syms ), 0, 30 ) ) : $d['symbols'];

		$clamp = function ( $key, $min, $max, $int = false ) use ( $in, $d ) {
			$v = isset( $in[ $key ] ) && is_numeric( $in[ $key ] ) ? (float) $in[ $key ] : $d[ $key ];
			$v = min( $max, max( $min, $v ) );
			return $int ? (int) $v : $v;
		};
		$out['guest_limit']   = $clamp( 'guest_limit', 0, 1000, true );
		$out['user_limit']    = $clamp( 'user_limit', 0, 10000, true );
		$out['atr_stop_mult'] = $clamp( 'atr_stop_mult', 0.5, 5 );
		$out['rr']            = $clamp( 'rr', 0.5, 10 );
		$out['stretch_thr']   = $clamp( 'stretch_thr', 0.5, 6 );
		$out['expiry_bars']   = $clamp( 'expiry_bars', 4, 500, true );
		return $out;
	}

	public static function page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$fields = array(
			'api_base'      => array( 'آدرس API داده', 'سازگار با Binance Spot. اگر سرور به Binance دسترسی ندارد، آدرس پراکسی خودتان را بگذارید.' ),
			'symbols'       => array( 'نمادها', 'با کاما جدا کنید، مثل BTCUSDT,ETHUSDT' ),
			'guest_limit'   => array( 'سهمیهٔ روزانهٔ مهمان', '' ),
			'user_limit'    => array( 'سهمیهٔ روزانهٔ کاربر', '' ),
			'atr_stop_mult' => array( 'ضریب ATR برای حد ضرر', '' ),
			'rr'            => array( 'نسبت سود به ریسک', '' ),
			'stretch_thr'   => array( 'آستانهٔ فاصله از EMA20 (بر حسب ATR)', 'برای الگوی بازگشت به میانگین.' ),
			'expiry_bars'   => array( 'انقضای سیگنال (تعداد کندل)', '' ),
		);
		?>
		<div class="wrap">
			<h1>Damoon Signal</h1>
			<p>شورت‌کدها: <code>[damoon_signal]</code> و <code>[damoon_record]</code></p>
			<form method="post" action="options.php">
				<?php settings_fields( 'damoon_sig' ); ?>
				<table class="form-table" role="presentation">
					<?php foreach ( $fields as $key => $f ) : ?>
						<tr>
							<th scope="row"><label for="dmn-<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $f[0] ); ?></label></th>
							<td>
								<input class="regular-text" dir="ltr" type="text"
									id="dmn-<?php echo esc_attr( $key ); ?>"
									name="damoon_sig_options[<?php echo esc_attr( $key ); ?>]"
									value="<?php echo esc_attr( (string) damoon_sig_opt( $key ) ); ?>">
								<?php if ( $f[1] ) : ?>
									<p class="description"><?php echo esc_html( $f[1] ); ?></p>
								<?php endif; ?>
							</td>
						</tr>
					<?php endforeach; ?>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}
