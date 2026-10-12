<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * شورت‌کدها.
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
