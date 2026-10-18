<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * امنیت: هدرهای امنیتی، بستن XML-RPC، جلوگیری از شناسایی نام کاربری‌ها، محدودیت تلاش ورود.
 */
class Damoon_Boost_Security {

	const MAX_FAILS = 5;
	const WINDOW    = 900;  // ۱۵ دقیقه
	const LOCK      = 1800; // ۳۰ دقیقه

	public static function init() {
		if ( damoon_boost_on( 'headers' ) ) {
			add_action( 'send_headers', array( __CLASS__, 'headers' ) );
			add_action( 'login_init', array( __CLASS__, 'headers' ) );
			add_action( 'admin_init', array( __CLASS__, 'headers' ) );
		}
		if ( damoon_boost_on( 'xmlrpc' ) && ! self::needs_xmlrpc() ) {
			// متدهای system.* (از جمله multicall) حتی با xmlrpc_enabled=false جواب می‌دهند؛ کل مسیر بسته می‌شود.
			if ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) {
				add_action(
					'init',
					function () {
						status_header( 403 );
						header( 'Content-Type: text/plain; charset=utf-8' );
						echo 'XML-RPC is disabled.';
						exit;
					},
					0
				);
			}
			add_filter( 'xmlrpc_enabled', '__return_false' );
			add_filter( 'xmlrpc_methods', '__return_empty_array' );
			add_filter(
				'wp_headers',
				function ( $h ) {
					unset( $h['X-Pingback'] );
					return $h;
				}
			);
			add_filter( 'pings_open', '__return_false', 99 );
		}
		if ( damoon_boost_on( 'users' ) ) {
			add_filter( 'rest_endpoints', array( __CLASS__, 'hide_user_endpoints' ) );
			add_action( 'template_redirect', array( __CLASS__, 'block_author_scan' ), 1 );
			add_filter(
				'wp_sitemaps_add_provider',
				function ( $provider, $name ) {
					return 'users' === $name ? false : $provider;
				},
				10,
				2
			);
			// oEmbed نام نویسنده را لو می‌دهد.
			add_filter(
				'oembed_response_data',
				function ( $d ) {
					unset( $d['author_name'], $d['author_url'] );
					return $d;
				}
			);
		}
		if ( damoon_boost_on( 'login_limit' ) ) {
			add_filter( 'authenticate', array( __CLASS__, 'check_lock' ), 30, 3 );
			add_action( 'wp_login_failed', array( __CLASS__, 'on_fail' ) );
			add_action( 'wp_login', array( __CLASS__, 'on_success' ), 10, 1 );
		}
		if ( damoon_boost_on( 'login_errors' ) ) {
			add_filter( 'login_errors', array( __CLASS__, 'generic_error' ) );
		}
		if ( damoon_boost_on( 'app_passwords' ) ) {
			add_filter( 'wp_is_application_passwords_available', '__return_false' );
		}
	}

	public static function headers() {
		if ( headers_sent() ) {
			return;
		}
		foreach ( Damoon_Boost_Lib::security_headers( is_ssl(), damoon_boost_on( 'hsts' ) ) as $k => $v ) {
			header( $k . ': ' . $v );
		}
	}

	/** Jetpack و اپ موبایل وردپرس به XML-RPC نیاز دارند. */
	private static function needs_xmlrpc() {
		return defined( 'JETPACK__VERSION' );
	}

	/** فهرست کاربران در REST برای بازدیدکنندهٔ واردنشده بسته است (ویرایشگر بلوکی برای اعضا به آن نیاز دارد). */
	public static function hide_user_endpoints( $endpoints ) {
		if ( is_user_logged_in() ) {
			return $endpoints;
		}
		foreach ( array_keys( $endpoints ) as $route ) {
			if ( preg_match( '#^/wp/v2/users(/\(\?P<id>[^)]+\)\+?)?$#', $route ) ) {
				unset( $endpoints[ $route ] );
			}
		}
		return $endpoints;
	}

	/** ?author=1 برای پیدا کردن نام کاربری مدیر استفاده می‌شود. */
	public static function block_author_scan() {
		// phpcs:ignore WordPress.Security.NonceVerification -- فقط خواندن.
		if ( ! is_admin() && isset( $_GET['author'] ) && ! current_user_can( 'list_users' ) ) {
			wp_safe_redirect( home_url( '/' ), 301 );
			exit;
		}
		if ( is_author() && ! current_user_can( 'list_users' ) && damoon_boost_on( 'author_archives' ) ) {
			wp_safe_redirect( home_url( '/' ), 301 );
			exit;
		}
	}

	/* ---------- محدودیت تلاش ورود ---------- */

	/**
	 * IP بازدیدکننده. پشت Cloudflare باید در nginx با real_ip تنظیم شود (فایل deploy)،
	 * چون هدرهای فورواردشده قابل جعل‌اند و اینجا به آن‌ها اعتماد نمی‌شود.
	 */
	private static function ip() {
		return isset( $_SERVER['REMOTE_ADDR'] ) ? preg_replace( '/[^0-9a-f:.]/i', '', (string) wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '0';
	}

	private static function key( $ip ) {
		return 'dmnb_login_' . md5( $ip . '|' . wp_salt( 'auth' ) );
	}

	public static function check_lock( $user, $username, $password ) {
		if ( '' === (string) $username && '' === (string) $password ) {
			return $user;
		}
		$rec  = (array) get_transient( self::key( self::ip() ) );
		$left = Damoon_Boost_Lib::locked_for( $rec, time() );
		if ( $left > 0 ) {
			return new WP_Error(
				'dmnb_locked',
				sprintf( 'به دلیل تلاش‌های ناموفق زیاد، ورود از این اتصال تا %d دقیقهٔ دیگر بسته است.', (int) ceil( $left / 60 ) )
			);
		}
		return $user;
	}

	public static function on_fail() {
		$key = self::key( self::ip() );
		$rec = Damoon_Boost_Lib::login_fail( (array) get_transient( $key ), time(), self::MAX_FAILS, self::WINDOW, self::LOCK );
		set_transient( $key, $rec, self::LOCK + self::WINDOW );
	}

	public static function on_success() {
		delete_transient( self::key( self::ip() ) );
	}

	/** پیام یکسان برای «کاربر وجود ندارد» و «رمز اشتباه است»؛ پیام قفل حفظ می‌شود. */
	public static function generic_error( $msg ) {
		global $errors;
		if ( $errors instanceof WP_Error && in_array( 'dmnb_locked', $errors->get_error_codes(), true ) ) {
			return $msg;
		}
		return '<strong>خطا:</strong> نام کاربری یا رمز عبور درست نیست.';
	}
}
