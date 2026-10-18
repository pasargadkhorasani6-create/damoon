<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * منطق خالص (بدون وابستگی به وردپرس) تا قابل تست باشد: tests/boost.php
 */
class Damoon_Boost_Lib {

	const OG_LOCALE = array(
		'fa' => 'fa_IR',
		'en' => 'en_US',
		'ru' => 'ru_RU',
	);

	/** هدرهای امنیتی پاسخ‌های HTML. HSTS فقط روی HTTPS. */
	public static function security_headers( $is_ssl, $hsts ) {
		$h = array(
			'X-Content-Type-Options'  => 'nosniff',
			'X-Frame-Options'         => 'SAMEORIGIN',
			'Referrer-Policy'         => 'strict-origin-when-cross-origin',
			'Permissions-Policy'      => 'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()',
			'Content-Security-Policy' => "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests",
			'Cross-Origin-Opener-Policy' => 'same-origin-allow-popups',
		);
		if ( ! $is_ssl ) {
			// روی http (سایت لوکال) ارتقای اجباری به https صفحه را خراب می‌کند.
			$h['Content-Security-Policy'] = "frame-ancestors 'self'; base-uri 'self'; object-src 'none'";
		}
		if ( $is_ssl && $hsts ) {
			$h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
		}
		return $h;
	}

	/**
	 * محدودیت تلاش ورود. $rec = { n: تعداد خطا, t: شروع پنجره, until: پایان قفل }.
	 *
	 * @return array رکورد تازه
	 */
	public static function login_fail( array $rec, $now, $max, $window, $lock ) {
		$n = (int) ( $rec['n'] ?? 0 );
		$t = (int) ( $rec['t'] ?? 0 );
		if ( ! $t || $now - $t > $window ) {
			$n = 0;
			$t = $now;
		}
		$n++;
		$until = (int) ( $rec['until'] ?? 0 );
		if ( $n >= $max ) {
			$until = $now + $lock;
			$n     = 0;
			$t     = $now;
		}
		return array(
			'n'     => $n,
			't'     => $t,
			'until' => $until,
		);
	}

	/** ثانیه‌های باقی‌ماندهٔ قفل (۰ = آزاد). */
	public static function locked_for( array $rec, $now ) {
		return max( 0, (int) ( $rec['until'] ?? 0 ) - $now );
	}

	/** توضیح متا از متن: بدون HTML و شورت‌کد، حداکثر $max نویسه، بریده‌شده روی مرز کلمه. */
	public static function description( $text, $max = 160 ) {
		$text = preg_replace( '/\[[^\]]*\]/u', ' ', (string) $text );
		$text = preg_replace( '#<(script|style)\b[^>]*>.*?</\1>#is', ' ', $text );
		$text = html_entity_decode( strip_tags( $text ), ENT_QUOTES, 'UTF-8' );
		$text = trim( preg_replace( '/\s+/u', ' ', $text ) );
		if ( mb_strlen( $text, 'UTF-8' ) <= $max ) {
			return $text;
		}
		$cut   = mb_substr( $text, 0, $max - 1, 'UTF-8' );
		$space = mb_strrpos( $cut, ' ', 0, 'UTF-8' );
		if ( false !== $space && $space > $max * 0.6 ) {
			$cut = mb_substr( $cut, 0, $space, 'UTF-8' );
		}
		return rtrim( $cut, " ,.;:،؛" ) . '…';
	}

	/** داده‌ی ساختاریافتهٔ صفحهٔ اصلی (WebSite + Organization). */
	public static function jsonld_home( $name, $url, $logo, array $same_as, $lang, $search ) {
		$org = array(
			'@type' => 'Organization',
			'@id'   => $url . '#organization',
			'name'  => $name,
			'url'   => $url,
		);
		if ( $logo ) {
			$org['logo'] = $logo;
		}
		$same_as = array_values( array_filter( $same_as ) );
		if ( $same_as ) {
			$org['sameAs'] = $same_as;
		}
		$site = array(
			'@type'      => 'WebSite',
			'@id'        => $url . '#website',
			'name'       => $name,
			'url'        => $url,
			'inLanguage' => $lang,
			'publisher'  => array( '@id' => $url . '#organization' ),
		);
		if ( $search ) {
			$site['potentialAction'] = array(
				'@type'       => 'SearchAction',
				'target'      => $search,
				'query-input' => 'required name=search_term_string',
			);
		}
		return array(
			'@context' => 'https://schema.org',
			'@graph'   => array( $site, $org ),
		);
	}

	/**
	 * خط‌های افزوده به robots.txt مجازی وردپرس، داخل گروه «User-agent: *» و پیش از خط Sitemap
	 * (wp-admin و نقشهٔ سایت را خود وردپرس می‌نویسد). REST بسته نمی‌شود چون گوگل برای رندر بخش‌های زنده به آن نیاز دارد.
	 */
	public static function robots_merge( $out ) {
		$extra = array( 'Disallow: /?s=', 'Disallow: /search/', 'Disallow: /*?replytocom=' );
		$lines = preg_split( '/\r?\n/', rtrim( (string) $out ) );
		$extra = array_values( array_diff( $extra, $lines ) );
		if ( ! $extra ) {
			return rtrim( (string) $out ) . "\n";
		}
		$at = count( $lines );
		foreach ( $lines as $i => $l ) {
			if ( 0 === stripos( $l, 'Sitemap:' ) ) {
				$at = $i;
				break;
			}
		}
		while ( $at > 0 && '' === trim( $lines[ $at - 1 ] ) ) {
			$at--;
		}
		if ( ! preg_grep( '/^User-agent:/i', array_slice( $lines, 0, $at ) ) ) {
			array_unshift( $extra, 'User-agent: *' );
		}
		array_splice( $lines, $at, 0, $extra );
		return implode( "\n", $lines ) . "\n";
	}

	/** آدرس‌های معتبر http(s)، هر خط یکی. */
	public static function url_lines( $raw, $max = 10 ) {
		$out = array();
		foreach ( preg_split( '/\s+/', (string) $raw ) as $u ) {
			if ( preg_match( '#^https?://[^\s<>"\']+$#i', $u ) ) {
				$out[] = $u;
			}
		}
		return array_slice( array_values( array_unique( $out ) ), 0, $max );
	}
}
