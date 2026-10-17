<?php
/**
 * تست تنظیمات: sanitize دو بار پشت سر هم (مثل اولین ذخیرهٔ وردپرس) نباید چک‌باکس‌ها را پاک کند.
 *   php wordpress/tests/settings.php
 */
define( 'ABSPATH', __DIR__ . '/' );
foreach ( array( 'MINUTE_IN_SECONDS' => 60, 'HOUR_IN_SECONDS' => 3600, 'DAY_IN_SECONDS' => 86400, 'MB_IN_BYTES' => 1048576 ) as $k => $v ) {
	define( $k, $v );
}
$GLOBALS['saved']  = array();
$GLOBALS['errors'] = array();
function plugin_dir_path( $f ) { return dirname( $f ) . '/'; }
function plugin_dir_url( $f ) { return '/'; }
function add_action() {}
function add_filter() {}
function register_activation_hook() {}
function register_deactivation_hook() {}
function apply_filters( $t, $v ) { return $v; }
function wp_parse_args( $a, $d ) { return array_merge( $d, (array) $a ); }
function get_option( $k, $d = false ) { return 'damoon_sig_options' === $k ? $GLOBALS['saved'] : $d; }
function esc_url_raw( $u, $p = null ) { return preg_match( '#^https://[^\s]+$#', $u ) ? $u : ''; }
function untrailingslashit( $s ) { return rtrim( $s, '/\\' ); }
function sanitize_text_field( $s ) { return trim( strip_tags( (string) $s ) ); }
function sanitize_key( $s ) { return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $s ) ); }
function wp_strip_all_tags( $s ) { return strip_tags( (string) $s ); }
function add_settings_error( $a, $code, $msg ) { $GLOBALS['errors'][] = $code; }
function wp_schedule_single_event() {}
class Roles { function get_names() { return array( 'administrator' => 'Administrator', 'editor' => 'Editor' ); } }
function wp_roles() { return new Roles(); }

require dirname( __DIR__ ) . '/damoon-signal/damoon-signal.php';

$fails = 0;
function check( $name, $cond ) {
	global $fails;
	echo ( $cond ? 'ok   ' : 'FAIL ' ) . $name . "\n";
	$fails += $cond ? 0 : 1;
}

// فرم: چک‌باکس‌ها به‌صورت آرایه ارسال می‌شوند.
$form = array(
	'symbols'        => 'BTCUSDT,ETHUSDT',
	'access'         => 'roles',
	'allowed_roles'  => array( 'administrator', 'editor' ),
	'auto_scan'      => '1',
	'scan_tfs'       => array( '1h', '4h' ),
	'pulse_enabled'  => '1',
	'pulse_sources'  => array( 'stocktwits', 'reddit', 'news', 'fng' ),
	'pulse_auto'     => array( 'front', 'robot' ),
	'pulse_proxy'    => 'https://damoon-proxy.me.workers.dev/',
	'pulse_news_feeds' => "https://news.google.com/rss/search?q={q}+when:1d\nhttps://cointelegraph.com/rss",
);
$first  = Damoon_Admin::sanitize( $form );
$second = Damoon_Admin::sanitize( $first ); // پاس دوم وردپرس با مقدار ذخیره‌شده

check( 'first pass keeps sources', 'stocktwits,reddit,news,fng' === $first['pulse_sources'] );
check( 'second pass keeps sources', 'stocktwits,reddit,news,fng' === $second['pulse_sources'] );
check( 'second pass keeps auto placement', 'front,robot' === $second['pulse_auto'] );
check( 'second pass keeps scan timeframes', '1h,4h' === $second['scan_tfs'] );
check( 'second pass keeps roles', 'administrator,editor' === $second['allowed_roles'] );
check( 'proxy kept, trailing slash removed', 'https://damoon-proxy.me.workers.dev' === $second['pulse_proxy'] );
check( 'news feed template keeps {q}', false !== strpos( $second['pulse_news_feeds'], 'q={q}+when' ) );

$GLOBALS['errors'] = array();
$bad = Damoon_Admin::sanitize( array_merge( $form, array( 'pulse_proxy' => 'https://docs/cloudflare-worker.js' ) ) );
check( 'file name as proxy is rejected with a message', '' === $bad['pulse_proxy'] && in_array( 'pulse_proxy', $GLOBALS['errors'], true ) );

$none = Damoon_Admin::sanitize( array_merge( $form, array( 'pulse_sources' => array(), 'pulse_auto' => array() ) ) );
check( 'unchecking everything is respected', '' === $none['pulse_sources'] && '' === $none['pulse_auto'] );

check( 'input list helper', array( 'a', 'b' ) === damoon_sig_input_list( 'a, b,' ) && array( 'x' ) === damoon_sig_input_list( array( 'x', '' ) ) );

echo $fails ? "\n{$fails} test(s) failed\n" : "\nall passed\n";
exit( $fails ? 1 : 0 );
