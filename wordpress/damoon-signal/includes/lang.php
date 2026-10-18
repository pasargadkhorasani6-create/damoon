<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * چندزبانه: فارسی، انگلیسی، روسی.
 *
 * - زبان صفحه از Polylang / WPML / زبان وردپرس خوانده می‌شود.
 * - تشخیص زبان بازدیدکننده: کشور (هدر Cloudflare و مشابه) ← زبان مرورگر ← پیش‌فرض.
 * - هدایت خودکار در مرورگر انجام می‌شود تا با کش صفحه هم کار کند (پایین همین فایل).
 */
class Damoon_Lang {

	const LANGS  = array( 'fa', 'en', 'ru' );
	const LOCALE = array(
		'fa' => 'fa-IR',
		'en' => 'en-US',
		'ru' => 'ru-RU',
	);
	const NAMES  = array(
		'fa' => 'فارسی',
		'en' => 'English',
		'ru' => 'Русский',
	);

	/** زبان اجباری (مثلاً درخواست REST با ?lang=en). */
	public static $override = null;

	private static $strings = null;

	public static function valid( $lang ) {
		return in_array( $lang, self::LANGS, true );
	}

	/** زبان صفحهٔ فعلی. کرون و تلگرام (بدون درخواست بازدیدکننده) فارسی می‌مانند. */
	public static function current() {
		if ( self::$override && self::valid( self::$override ) ) {
			return self::$override;
		}
		$lang = '';
		if ( function_exists( 'pll_current_language' ) ) {
			$lang = (string) pll_current_language( 'slug' );
		} elseif ( defined( 'ICL_LANGUAGE_CODE' ) ) {
			$lang = (string) ICL_LANGUAGE_CODE;
		} elseif ( function_exists( 'determine_locale' ) ) {
			$lang = substr( (string) determine_locale(), 0, 2 );
		}
		$lang = strtolower( substr( $lang, 0, 2 ) );
		return self::valid( $lang ) ? $lang : 'fa';
	}

	public static function dir( $lang = null ) {
		return 'fa' === ( $lang ?: self::current() ) ? 'rtl' : 'ltr';
	}

	public static function locale( $lang = null ) {
		return self::LOCALE[ $lang ?: self::current() ];
	}

	private static function strings() {
		if ( null === self::$strings ) {
			self::$strings = require __DIR__ . '/strings.php';
		}
		return self::$strings;
	}

	/**
	 * متن ترجمه‌شده. جای‌گذاری با sprintf: t( 'key', $a, $b ).
	 * اگر ترجمه‌ای نباشد انگلیسی، و اگر کلید نباشد خود کلید برمی‌گردد.
	 */
	public static function t( $key, ...$args ) {
		return self::tl( self::current(), $key, ...$args );
	}

	/** مثل t() ولی با زبان مشخص (مثلاً متن فارسی برای ذخیره و تلگرام). */
	public static function tl( $lang, $key, ...$args ) {
		$all  = self::strings();
		$row  = $all['php'][ $key ] ?? null;
		$s    = $row ? ( $row[ $lang ] ?? $row['en'] ) : $key;
		return $args ? vsprintf( $s, $args ) : $s;
	}

	/** متن‌های لازم در مرورگر (کلیدهای بخش js) به زبان فعلی. */
	public static function js_strings( $lang = null ) {
		$lang = $lang ?: self::current();
		$out  = array();
		foreach ( self::strings()['js'] as $k => $row ) {
			$out[ $k ] = $row[ $lang ] ?? $row['en'];
		}
		return $out;
	}

	/** همهٔ کلیدها برای تست کامل‌بودن ترجمه. */
	public static function all_strings() {
		return self::strings();
	}

	/** ارقام فارسی فقط برای زبان فارسی. */
	public static function digits( $s, $lang = null ) {
		if ( 'fa' !== ( $lang ?: self::current() ) ) {
			return (string) $s;
		}
		return strtr( (string) $s, array( '0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴', '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹', '.' => '٫', ',' => '٬' ) );
	}

	/* ------------------------------------------------------------------ تشخیص زبان بازدیدکننده */

	/**
	 * نقشهٔ کشور ← زبان از متن تنظیمات. هر خط: «زبان: کد کشورها»، مثل «ru: RU, BY, KZ».
	 *
	 * @return array<string,string> کد کشور (بزرگ) ← زبان
	 */
	public static function parse_map( $raw ) {
		$map = array();
		foreach ( preg_split( '/\r?\n/', (string) $raw ) as $line ) {
			if ( ! preg_match( '/^\s*([a-z]{2})\s*[:=]\s*(.+)$/i', $line, $m ) ) {
				continue;
			}
			$lang = strtolower( $m[1] );
			if ( ! self::valid( $lang ) ) {
				continue;
			}
			foreach ( preg_split( '/[\s,]+/', strtoupper( $m[2] ) ) as $cc ) {
				if ( preg_match( '/^[A-Z]{2}$/', $cc ) && ! isset( $map[ $cc ] ) ) {
					$map[ $cc ] = $lang;
				}
			}
		}
		return $map;
	}

	/** کد کشور بازدیدکننده از هدرهای CDN/سرور (Cloudflare، CloudFront، mod_geoip و…). */
	public static function country( array $server ) {
		foreach ( array( 'HTTP_CF_IPCOUNTRY', 'HTTP_CLOUDFRONT_VIEWER_COUNTRY', 'HTTP_X_COUNTRY_CODE', 'HTTP_X_GEO_COUNTRY', 'GEOIP_COUNTRY_CODE', 'HTTP_GEOIP_COUNTRY_CODE' ) as $h ) {
			$v = strtoupper( trim( (string) ( $server[ $h ] ?? '' ) ) );
			// XX = نامشخص، T1 = Tor در Cloudflare
			if ( preg_match( '/^[A-Z]{2}$/', $v ) && 'XX' !== $v && 'T1' !== $v ) {
				return $v;
			}
		}
		return '';
	}

	/** اولین زبان پشتیبانی‌شده در Accept-Language با رعایت اولویت (q). */
	public static function browser_lang( $header ) {
		$best = array();
		foreach ( explode( ',', (string) $header ) as $i => $part ) {
			$bits = explode( ';', trim( $part ) );
			$code = strtolower( substr( trim( $bits[0] ), 0, 2 ) );
			$q    = 1.0;
			foreach ( array_slice( $bits, 1 ) as $p ) {
				if ( preg_match( '/^\s*q=([0-9.]+)/', $p, $m ) ) {
					$q = (float) $m[1];
				}
			}
			if ( self::valid( $code ) && $q > 0 && ( ! isset( $best[ $code ] ) || $best[ $code ][0] < $q ) ) {
				$best[ $code ] = array( $q, -$i );
			}
		}
		if ( ! $best ) {
			return '';
		}
		uasort(
			$best,
			function ( $a, $b ) {
				return $b <=> $a;
			}
		);
		return (string) array_key_first( $best );
	}

	/**
	 * تصمیم نهایی (تابع خالص).
	 *
	 * @return array { lang, source: country|browser|default, country }
	 */
	public static function detect( array $server, array $map, $default = 'en' ) {
		$country = self::country( $server );
		if ( $country && isset( $map[ $country ] ) ) {
			return array( 'lang' => $map[ $country ], 'source' => 'country', 'country' => $country );
		}
		$b = self::browser_lang( $server['HTTP_ACCEPT_LANGUAGE'] ?? '' );
		if ( $b ) {
			return array( 'lang' => $b, 'source' => 'browser', 'country' => $country );
		}
		return array( 'lang' => self::valid( $default ) ? $default : 'en', 'source' => 'default', 'country' => $country );
	}

	/* ------------------------------------------------------------------ وردپرس */

	public static function init() {
		add_action( 'wp_head', array( __CLASS__, 'redirect_script' ), 1 );
		// درخواست‌های REST افزونه با ?lang=xx به همان زبان پاسخ می‌دهند.
		add_filter(
			'rest_pre_dispatch',
			function ( $result, $server, $request ) {
				if ( 0 === strpos( $request->get_route(), '/damoon/v1/' ) ) {
					$l = strtolower( (string) $request->get_param( 'lang' ) );
					if ( self::valid( $l ) ) {
						self::$override = $l;
					}
				}
				return $result;
			},
			10,
			3
		);
	}

	public static function geo_on() {
		return (bool) damoon_sig_opt( 'geo_enabled' );
	}

	/** نتیجهٔ تشخیص برای درخواست فعلی (REST /geo-lang). */
	public static function detect_request() {
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- فقط خوانده و با regex اعتبارسنجی می‌شود.
		return self::detect( $_SERVER, self::parse_map( damoon_sig_opt( 'geo_map' ) ), (string) damoon_sig_opt( 'geo_default' ) );
	}

	/**
	 * اسکریپت کوچک هدایت خودکار در <head>:
	 * فقط بار اول (بدون کوکی damoon_lang)، نه برای ربات‌های جست‌وجو، و فقط اگر نسخهٔ همان صفحه
	 * در زبان مقصد وجود داشته باشد (لینک hreflang که Polylang/WPML می‌سازند). انتخاب دستی زبان هرگز بازنویسی نمی‌شود.
	 */
	public static function redirect_script() {
		if ( is_admin() || ! self::geo_on() || is_customize_preview() ) {
			return;
		}
		$homes = array();
		if ( function_exists( 'pll_home_url' ) ) {
			foreach ( self::LANGS as $l ) {
				$u = pll_home_url( $l );
				if ( $u ) {
					$homes[ $l ] = $u;
				}
			}
		}
		$cfg = array(
			'api'   => esc_url_raw( rest_url( 'damoon/v1/geo-lang' ) ),
			'cur'   => self::current(),
			'front' => is_front_page(),
			'homes' => $homes,
		);
		?>
<script id="damoon-geo-lang">
(function (c) {
	try {
		if (/(?:^|;\s*)damoon_lang=/.test(document.cookie)) { return; }
		if (/bot|crawl|spider|slurp|lighthouse|headless|preview/i.test(navigator.userAgent) || navigator.webdriver) { return; }
		var remember = function (l) { document.cookie = 'damoon_lang=' + l + ';path=/;max-age=31536000;SameSite=Lax'; };
		fetch(c.api, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
			if (!d || !d.lang) { return; }
			remember(d.lang);
			if (d.lang === c.cur) { return; }
			var alt = document.querySelector('link[rel="alternate"][hreflang="' + d.lang + '"], link[rel="alternate"][hreflang^="' + d.lang + '-"]');
			var to = alt ? alt.href : (c.front && c.homes[d.lang] ? c.homes[d.lang] : '');
			if (to && to !== location.href) { location.replace(to); }
		}).catch(function () {});
	} catch (e) {}
})(<?php echo wp_json_encode( $cfg ); ?>);
</script>
		<?php
	}
}
