<?php
/**
 * Plugin Name: Damoon Signal
 * Description: تولید ستاپ معاملاتی کریپتو (جهت، ورود، حد ضرر، هدف) با موتور قانون‌محور و کارنامهٔ شفاف. فقط آموزشی و معاملهٔ کاغذی.
 * Version: 0.1.0
 * Requires PHP: 7.4
 * Text Domain: damoon-signal
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DAMOON_SIG_VER', '0.1.0' );
define( 'DAMOON_SIG_DIR', plugin_dir_path( __FILE__ ) );
define( 'DAMOON_SIG_URL', plugin_dir_url( __FILE__ ) );

/**
 * تنظیمات افزونه با مقادیر پیش‌فرض.
 */
function damoon_sig_defaults() {
	return array(
		'api_base'      => 'https://data-api.binance.vision',
		'symbols'       => 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT',
		'guest_limit'   => 3,
		'user_limit'    => 10,
		'atr_stop_mult' => 1.5,
		'rr'            => 1.8,
		'stretch_thr'   => 2.0,
		'expiry_bars'   => 48,
	);
}

function damoon_sig_opt( $key ) {
	$opts = wp_parse_args( (array) get_option( 'damoon_sig_options', array() ), damoon_sig_defaults() );
	return isset( $opts[ $key ] ) ? $opts[ $key ] : null;
}

function damoon_sig_symbols() {
	$list = array_filter( array_map( 'trim', explode( ',', strtoupper( (string) damoon_sig_opt( 'symbols' ) ) ) ) );
	return array_values( array_unique( $list ) );
}

require_once DAMOON_SIG_DIR . 'includes/market.php';
require_once DAMOON_SIG_DIR . 'includes/engine.php';
require_once DAMOON_SIG_DIR . 'includes/store.php';
require_once DAMOON_SIG_DIR . 'includes/rest.php';
require_once DAMOON_SIG_DIR . 'includes/ui.php';

register_activation_hook( __FILE__, 'damoon_sig_activate' );
register_deactivation_hook( __FILE__, 'damoon_sig_deactivate' );

function damoon_sig_activate() {
	Damoon_Store::install();
	if ( ! wp_next_scheduled( 'damoon_sig_evaluate' ) ) {
		wp_schedule_event( time() + 300, 'hourly', 'damoon_sig_evaluate' );
	}
}

function damoon_sig_deactivate() {
	wp_clear_scheduled_hook( 'damoon_sig_evaluate' );
}

add_action( 'damoon_sig_evaluate', array( 'Damoon_Store', 'evaluate_open' ) );
add_action( 'rest_api_init', array( 'Damoon_Rest', 'register' ) );
add_action( 'plugins_loaded', array( 'Damoon_Store', 'maybe_install' ) );
add_action( 'init', array( 'Damoon_UI', 'init' ) );
