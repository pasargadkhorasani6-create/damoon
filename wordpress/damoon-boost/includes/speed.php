<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * سرعت: حذف اسکریپت‌ها و درخواست‌های اضافی که بیشتر سایت‌ها لازم ندارند.
 * هر مورد در تنظیمات جدا خاموش/روشن می‌شود.
 */
class Damoon_Boost_Speed {

	public static function init() {
		if ( damoon_boost_on( 'emoji' ) ) {
			self::no_emoji();
		}
		if ( damoon_boost_on( 'embeds' ) ) {
			remove_action( 'wp_head', 'wp_oembed_add_discovery_links' );
			remove_action( 'wp_head', 'wp_oembed_add_host_js' );
			add_action(
				'wp_footer',
				function () {
					wp_dequeue_script( 'wp-embed' );
				}
			);
		}
		if ( damoon_boost_on( 'head_cleanup' ) ) {
			remove_action( 'wp_head', 'rsd_link' );
			remove_action( 'wp_head', 'wlwmanifest_link' );
			remove_action( 'wp_head', 'wp_shortlink_wp_head' );
			remove_action( 'wp_head', 'wp_generator' );
			remove_action( 'template_redirect', 'wp_shortlink_header', 11 );
			add_filter( 'the_generator', '__return_empty_string' );
			// لینک فید نظرات معمولاً بی‌استفاده است؛ فید اصلی می‌ماند.
			add_filter( 'feed_links_show_comments_feed', '__return_false' );
		}
		if ( damoon_boost_on( 'migrate' ) ) {
			add_action( 'wp_default_scripts', array( __CLASS__, 'no_migrate' ) );
		}
		if ( damoon_boost_on( 'heartbeat' ) ) {
			add_action( 'wp_enqueue_scripts', array( __CLASS__, 'no_front_heartbeat' ), 99 );
			add_filter(
				'heartbeat_settings',
				function ( $s ) {
					$s['interval'] = 60;
					return $s;
				}
			);
		}
		if ( damoon_boost_on( 'dashicons' ) ) {
			add_action(
				'wp_enqueue_scripts',
				function () {
					if ( ! is_user_logged_in() ) {
						wp_dequeue_style( 'dashicons' );
					}
				},
				99
			);
		}
		if ( damoon_boost_on( 'defer' ) ) {
			add_filter( 'script_loader_tag', array( __CLASS__, 'defer' ), 10, 2 );
		}
		$hosts = Damoon_Boost_Lib::url_lines( damoon_boost_opt( 'preconnect' ), 5 );
		if ( $hosts ) {
			add_filter(
				'wp_resource_hints',
				function ( $urls, $type ) use ( $hosts ) {
					if ( 'preconnect' === $type ) {
						foreach ( $hosts as $h ) {
							$urls[] = array(
								'href'        => $h,
								'crossorigin' => 'anonymous',
							);
						}
					}
					return $urls;
				},
				10,
				2
			);
		}
	}

	private static function no_emoji() {
		remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
		remove_action( 'admin_print_scripts', 'print_emoji_detection_script' );
		remove_action( 'wp_print_styles', 'print_emoji_styles' );
		remove_action( 'admin_print_styles', 'print_emoji_styles' );
		remove_action( 'wp_enqueue_scripts', 'wp_enqueue_emoji_styles' );
		remove_action( 'admin_enqueue_scripts', 'wp_enqueue_emoji_styles' );
		remove_filter( 'the_content_feed', 'wp_staticize_emoji' );
		remove_filter( 'comment_text_rss', 'wp_staticize_emoji' );
		remove_filter( 'wp_mail', 'wp_staticize_emoji_for_email' );
		add_filter( 'emoji_svg_url', '__return_false' );
		add_filter(
			'tiny_mce_plugins',
			function ( $p ) {
				return is_array( $p ) ? array_diff( $p, array( 'wpemoji' ) ) : array();
			}
		);
	}

	/** jquery-migrate فقط در بخش عمومی حذف می‌شود؛ پیشخوان دست‌نخورده می‌ماند. */
	public static function no_migrate( $scripts ) {
		if ( is_admin() || empty( $scripts->registered['jquery'] ) ) {
			return;
		}
		$scripts->registered['jquery']->deps = array_diff( $scripts->registered['jquery']->deps, array( 'jquery-migrate' ) );
	}

	public static function no_front_heartbeat() {
		// در صفحهٔ ویرایش پست (ذخیرهٔ خودکار) لازم است؛ در بخش عمومی نه.
		if ( ! is_admin() ) {
			wp_deregister_script( 'heartbeat' );
		}
	}

	/**
	 * defer برای اسکریپت‌های بخش عمومی، به‌جز jQuery و اسکریپت‌هایی که با inline پیش از خود اجرا می‌شوند.
	 * پیش‌فرض خاموش؛ اگر بخشی از سایت بعد از روشن‌کردن خراب شد، نامش را در «استثناها» بگذارید.
	 */
	public static function defer( $tag, $handle ) {
		if ( is_admin() || false !== strpos( $tag, ' defer' ) || false !== strpos( $tag, ' async' ) || false !== strpos( $tag, 'type="module"' ) ) {
			return $tag;
		}
		$scripts = wp_scripts();
		if ( in_array( $handle, self::defer_skip( $scripts ), true ) ) {
			return $tag;
		}
		// اسکریپتی که کد inline «بعد از» خود دارد نباید defer شود، چون آن کد زودتر اجرا می‌شود.
		if ( $scripts->get_data( $handle, 'after' ) ) {
			return $tag;
		}
		return preg_replace( '/<script(?![^>]*\bdefer\b)([^>]*\bsrc=)/', '<script defer$1', $tag, 1 );
	}

	/**
	 * استثناها به‌همراه همهٔ وابستگی‌هایشان؛ اگر اسکریپتی defer نشود، چیزی که به آن نیاز دارد هم نباید defer شود.
	 */
	private static function defer_skip( $scripts ) {
		static $memo = null;
		if ( null !== $memo ) {
			return $memo;
		}
		$queue = array_merge( array( 'jquery', 'jquery-core', 'jquery-migrate', 'wp-polyfill', 'regenerator-runtime' ), damoon_boost_list( damoon_boost_opt( 'defer_skip' ) ) );
		$memo  = array();
		while ( $queue ) {
			$h = array_shift( $queue );
			if ( isset( $memo[ $h ] ) ) {
				continue;
			}
			$memo[ $h ] = true;
			if ( isset( $scripts->registered[ $h ] ) ) {
				$queue = array_merge( $queue, (array) $scripts->registered[ $h ]->deps );
			}
		}
		$memo = array_keys( $memo );
		return $memo;
	}
}
