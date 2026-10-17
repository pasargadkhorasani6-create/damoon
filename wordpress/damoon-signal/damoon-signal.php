<?php
/**
 * Plugin Name: Damoon Signal
 * Description: تولید ستاپ معاملاتی کریپتو (جهت، ورود، حد ضرر، هدف) با موتور قانون‌محور و کارنامهٔ شفاف. فقط آموزشی و معاملهٔ کاغذی.
 * Version: 0.4.3
 * Requires at least: 5.6
 * Requires PHP: 7.4
 * Text Domain: damoon-signal
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DAMOON_SIG_VER', '0.4.3' );
define( 'DAMOON_SIG_DIR', plugin_dir_path( __FILE__ ) );
define( 'DAMOON_SIG_URL', plugin_dir_url( __FILE__ ) );

/**
 * تنظیمات افزونه با مقادیر پیش‌فرض.
 */
function damoon_sig_defaults() {
	return array(
		// چند آدرس با کاما یا خط جدید؛ به ترتیب امتحان می‌شوند.
		'api_base'      => "https://data-api.binance.vision\nhttps://api.binance.com\nhttps://api1.binance.com\nhttps://api2.binance.com\nhttps://api.mexc.com",
		'symbols'       => 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT',
		'guest_limit'   => 3,
		'user_limit'    => 10,
		'atr_stop_mult' => 1.5,
		'rr'            => 1.8,
		'stretch_thr'   => 2.0,
		'expiry_bars'   => 48,

		// دسترسی: public = همه، members = فقط کاربران واردشده، roles = فقط نقش‌های مشخص.
		'access'        => 'public',
		'allowed_roles' => 'administrator',

		// اسکن خودکار.
		'auto_scan'     => 1,
		'scan_tfs'      => '1h,4h',

		// تلگرام.
		'tg_enabled'    => 0,
		'tg_token'      => '',
		'tg_chat'       => '',
		'tg_api_base'   => 'https://api.telegram.org',
		'tg_on_close'   => 1,

		// ارسال به سایت دامون (Next.js).
		'site_enabled'  => 0,
		'site_url'      => '',
		'site_key_id'   => '',
		'site_secret'   => '',

		// نبض بازار (نظرات شبکه‌های اجتماعی، اخبار، ترس و طمع).
		'pulse_enabled'    => 1,
		'pulse_sources'    => 'stocktwits,reddit,news,fng',
		'pulse_news_feeds' => "https://news.google.com/rss/search?q={q}+when:1d&hl=en-US&gl=US&ceid=US:en\nhttps://www.coindesk.com/arc/outboundfeeds/rss/\nhttps://cointelegraph.com/rss",
		'pulse_proxy'      => '',
		// نمایش خودکار بدون شورت‌کد: front = صفحهٔ اصلی، robot = صفحه‌هایی که شورت‌کد ربات دارند.
		'pulse_auto'       => 'front,robot',
		// اختیاری: انتخابگر CSS عنصری که نبض بازار در صفحهٔ اصلی بعد از آن قرار بگیرد (مثلاً #scan یا .hero).
		'pulse_anchor'     => '',

		'delete_data'   => 0,
	);
}

function damoon_sig_opt( $key ) {
	// مقادیر محرمانه را می‌توان در wp-config.php هم تعریف کرد تا در دیتابیس ذخیره نشوند.
	$consts = array(
		'tg_token'    => 'DAMOON_TG_TOKEN',
		'site_secret' => 'DAMOON_SITE_SECRET',
	);
	if ( isset( $consts[ $key ] ) && defined( $consts[ $key ] ) && constant( $consts[ $key ] ) ) {
		return (string) constant( $consts[ $key ] );
	}
	$opts = wp_parse_args( (array) get_option( 'damoon_sig_options', array() ), damoon_sig_defaults() );
	return isset( $opts[ $key ] ) ? $opts[ $key ] : null;
}

function damoon_sig_list( $raw, $upper = true ) {
	$raw  = $upper ? strtoupper( (string) $raw ) : (string) $raw;
	$list = array_filter( array_map( 'trim', preg_split( '/[\s,]+/', $raw ) ) );
	return array_values( array_unique( $list ) );
}

/**
 * ورودی چندگزینه‌ای تنظیمات: آرایهٔ چک‌باکس‌ها یا رشتهٔ جداشده با کاما.
 * وردپرس هنگام اولین ذخیرهٔ تنظیمات، sanitize را دو بار اجرا می‌کند و بار دوم مقدار ذخیره‌شده (رشته) را می‌دهد.
 *
 * @return string[]
 */
function damoon_sig_input_list( $v ) {
	$list = is_array( $v ) ? $v : preg_split( '/[\s,]+/', (string) $v );
	return array_values( array_filter( array_map( 'trim', array_map( 'strval', $list ) ), 'strlen' ) );
}

function damoon_sig_symbols() {
	return damoon_sig_list( damoon_sig_opt( 'symbols' ) );
}

/** تایم‌فریم‌های اسکن خودکار (فقط موارد مجاز). */
function damoon_sig_scan_tfs() {
	return array_values( array_intersect( damoon_sig_list( damoon_sig_opt( 'scan_tfs' ), false ), array_keys( Damoon_Market::TF ) ) );
}

/**
 * آخرین وضعیت اسکن هر نماد، به ترتیب فهرست نمادها.
 * قالب‌ها می‌توانند مستقیم از این تابع استفاده کنند.
 *
 * @param string $tf تایم‌فریم؛ خالی = اولین تایم‌فریم اسکن.
 * @return array[] هر آیتم: symbol, tf, price, decimals, change_24h, direction (long|short|null), strategy, entry, stop, target, bar_time, updated
 */
function damoon_sig_scan_items( $tf = '' ) {
	$tfs = damoon_sig_scan_tfs();
	if ( ! $tf || ! isset( Damoon_Market::TF[ $tf ] ) ) {
		$tf = $tfs ? $tfs[0] : '1h';
	}
	$latest = (array) get_option( 'damoon_sig_scan_latest', array() );
	$out    = array();
	foreach ( damoon_sig_symbols() as $symbol ) {
		if ( isset( $latest[ $symbol . '|' . $tf ] ) ) {
			$out[] = $latest[ $symbol . '|' . $tf ];
		}
	}
	return $out;
}

/**
 * آیا کاربر فعلی اجازهٔ ساخت ستاپ دارد؟
 * افزونه‌های عضویت می‌توانند با فیلتر damoon_sig_can_use نتیجه را تغییر دهند.
 */
function damoon_sig_can_use( $user_id = null ) {
	$user_id = null === $user_id ? get_current_user_id() : (int) $user_id;
	$access  = damoon_sig_opt( 'access' );
	$ok      = true;

	if ( 'members' === $access ) {
		$ok = $user_id > 0;
	} elseif ( 'roles' === $access ) {
		$ok = false;
		if ( $user_id > 0 ) {
			$user  = get_userdata( $user_id );
			$roles = damoon_sig_list( damoon_sig_opt( 'allowed_roles' ), false );
			$ok    = $user && ( array_intersect( (array) $user->roles, $roles ) || user_can( $user, 'manage_options' ) );
		}
	}
	return (bool) apply_filters( 'damoon_sig_can_use', $ok, $user_id );
}

require_once DAMOON_SIG_DIR . 'includes/market.php';
require_once DAMOON_SIG_DIR . 'includes/engine.php';
require_once DAMOON_SIG_DIR . 'includes/store.php';
require_once DAMOON_SIG_DIR . 'includes/outbox.php';
require_once DAMOON_SIG_DIR . 'includes/telegram.php';
require_once DAMOON_SIG_DIR . 'includes/bridge.php';
require_once DAMOON_SIG_DIR . 'includes/scanner.php';
require_once DAMOON_SIG_DIR . 'includes/pulse.php';
require_once DAMOON_SIG_DIR . 'includes/rest.php';
require_once DAMOON_SIG_DIR . 'includes/ui.php';
require_once DAMOON_SIG_DIR . 'includes/admin.php';

register_activation_hook( __FILE__, 'damoon_sig_activate' );
register_deactivation_hook( __FILE__, 'damoon_sig_deactivate' );

/** بازه‌های کرون اختصاصی. */
add_filter(
	'cron_schedules',
	function ( $s ) {
		$s['damoon_5m']  = array(
			'interval' => 5 * MINUTE_IN_SECONDS,
			'display'  => 'Damoon: هر ۵ دقیقه',
		);
		$s['damoon_15m'] = array(
			'interval' => 15 * MINUTE_IN_SECONDS,
			'display'  => 'Damoon: هر ۱۵ دقیقه',
		);
		return $s;
	}
);

function damoon_sig_cron_events() {
	return array(
		'damoon_sig_evaluate' => 'hourly',
		'damoon_sig_scan'     => 'damoon_15m',
		'damoon_sig_outbox'   => 'damoon_5m',
		'damoon_sig_pulse'    => 'damoon_5m',
	);
}

function damoon_sig_schedule() {
	foreach ( damoon_sig_cron_events() as $hook => $recurrence ) {
		if ( ! wp_next_scheduled( $hook ) ) {
			wp_schedule_event( time() + 60, $recurrence, $hook );
		}
	}
}

function damoon_sig_activate() {
	Damoon_Store::install();
	damoon_sig_schedule();
}

function damoon_sig_deactivate() {
	foreach ( array_keys( damoon_sig_cron_events() ) as $hook ) {
		wp_clear_scheduled_hook( $hook );
	}
}

add_action( 'damoon_sig_evaluate', array( 'Damoon_Store', 'evaluate_open' ) );
add_action( 'damoon_sig_scan', array( 'Damoon_Scanner', 'run' ) );
add_action( 'damoon_sig_outbox', array( 'Damoon_Outbox', 'run' ) );
add_action( 'damoon_sig_pulse', array( 'Damoon_Pulse', 'run' ) );
add_action( 'damoon_sig_created', array( 'Damoon_Outbox', 'on_created' ) );
add_action( 'damoon_sig_closed', array( 'Damoon_Outbox', 'on_closed' ) );
add_action( 'rest_api_init', array( 'Damoon_Rest', 'register' ) );
add_action( 'plugins_loaded', array( 'Damoon_Store', 'maybe_install' ) );
add_action( 'init', array( 'Damoon_UI', 'init' ) );
add_action( 'init', array( 'Damoon_Admin', 'init' ) );
