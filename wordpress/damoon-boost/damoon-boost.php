<?php
/**
 * Plugin Name: Damoon Boost
 * Description: سرعت، امنیت و سئوی سایت دامون: حذف اسکریپت‌های اضافی، هدرهای امنیتی، محدودیت تلاش ورود، جلوگیری از شناسایی کاربران، توضیح متا، Open Graph و داده‌ی ساختاریافته. هر مورد جدا قابل خاموش‌کردن است.
 * Version: 1.0.0
 * Requires at least: 6.3
 * Requires PHP: 7.4
 * Text Domain: damoon-boost
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DAMOON_BOOST_VER', '1.0.0' );
define( 'DAMOON_BOOST_DIR', plugin_dir_path( __FILE__ ) );

function damoon_boost_defaults() {
	return array(
		// سرعت
		'emoji'           => 1,
		'embeds'          => 1,
		'head_cleanup'    => 1,
		'migrate'         => 1,
		'heartbeat'       => 1,
		'dashicons'       => 1,
		'defer'           => 0,
		'defer_skip'      => '',
		'preconnect'      => '',
		// امنیت
		'headers'         => 1,
		'hsts'            => 1,
		'xmlrpc'          => 1,
		'users'           => 1,
		'author_archives' => 1,
		'login_limit'     => 1,
		'login_errors'    => 1,
		'app_passwords'   => 1,
		// سئو
		'seo'             => 1,
		'home_desc_fa'    => '',
		'home_desc_en'    => '',
		'home_desc_ru'    => '',
		'og_image'        => '',
		'twitter'         => '',
		'same_as'         => '',
	);
}

function damoon_boost_opt( $key ) {
	static $opts = null;
	if ( null === $opts ) {
		$opts = wp_parse_args( (array) get_option( 'damoon_boost', array() ), damoon_boost_defaults() );
	}
	return $opts[ $key ] ?? null;
}

function damoon_boost_on( $key ) {
	return (bool) damoon_boost_opt( $key );
}

/** فهرست جداشده با کاما یا فاصله. */
function damoon_boost_list( $raw ) {
	return array_values( array_filter( array_map( 'trim', preg_split( '/[\s,]+/', (string) $raw ) ) ) );
}

require_once DAMOON_BOOST_DIR . 'includes/lib.php';
require_once DAMOON_BOOST_DIR . 'includes/speed.php';
require_once DAMOON_BOOST_DIR . 'includes/security.php';
require_once DAMOON_BOOST_DIR . 'includes/seo.php';
require_once DAMOON_BOOST_DIR . 'includes/admin.php';

Damoon_Boost_Speed::init();
Damoon_Boost_Security::init();
add_action( 'plugins_loaded', array( 'Damoon_Boost_SEO', 'init' ), 20 );
add_action( 'admin_menu', array( 'Damoon_Boost_Admin', 'menu' ) );
add_action( 'admin_init', array( 'Damoon_Boost_Admin', 'settings' ) );
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), array( 'Damoon_Boost_Admin', 'links' ) );
