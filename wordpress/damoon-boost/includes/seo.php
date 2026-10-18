<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * سئو: توضیح متا، Open Graph و کارت توییتر، داده‌ی ساختاریافته، robots و نقشهٔ سایت.
 * اگر Yoast، Rank Math یا افزونهٔ سئوی دیگری فعال باشد، این بخش کاری نمی‌کند تا تگ تکراری ساخته نشود.
 */
class Damoon_Boost_SEO {

	public static function other_plugin() {
		foreach ( array( 'WPSEO_VERSION', 'RANK_MATH_VERSION', 'AIOSEO_VERSION', 'SEOPRESS_VERSION', 'THE_SEO_FRAMEWORK_VERSION', 'SLIM_SEO_VER' ) as $c ) {
			if ( defined( $c ) ) {
				return $c;
			}
		}
		return '';
	}

	public static function init() {
		if ( ! damoon_boost_on( 'seo' ) || self::other_plugin() ) {
			return;
		}
		add_action( 'wp_head', array( __CLASS__, 'head' ), 1 );
		add_filter( 'wp_robots', array( __CLASS__, 'robots' ) );
		add_filter( 'robots_txt', array( __CLASS__, 'robots_txt' ), 20, 2 );
		// پیوست‌ها صفحهٔ جدا و کم‌ارزش نسازند.
		add_filter( 'pre_option_wp_attachment_pages_enabled', '__return_zero' );
	}

	public static function lang() {
		$l = function_exists( 'pll_current_language' ) ? (string) pll_current_language( 'slug' ) : '';
		if ( ! $l ) {
			$l = substr( determine_locale(), 0, 2 );
		}
		return isset( Damoon_Boost_Lib::OG_LOCALE[ $l ] ) ? $l : 'fa';
	}

	public static function description() {
		$lang = self::lang();
		if ( is_front_page() ) {
			$d = (string) damoon_boost_opt( 'home_desc_' . $lang );
			if ( '' !== $d ) {
				return Damoon_Boost_Lib::description( $d );
			}
		}
		if ( is_singular() ) {
			$post = get_queried_object();
			if ( $post instanceof WP_Post && ! post_password_required( $post ) ) {
				$src = has_excerpt( $post ) ? $post->post_excerpt : $post->post_content;
				$d   = Damoon_Boost_Lib::description( strip_shortcodes( $src ) );
				if ( '' !== $d ) {
					return $d;
				}
			}
		} elseif ( is_category() || is_tag() || is_tax() ) {
			$d = Damoon_Boost_Lib::description( term_description() );
			if ( '' !== $d ) {
				return $d;
			}
		}
		return is_front_page() || is_home() ? Damoon_Boost_Lib::description( get_bloginfo( 'description' ) ) : '';
	}

	private static function image() {
		if ( is_singular() && has_post_thumbnail() ) {
			$img = wp_get_attachment_image_src( get_post_thumbnail_id(), 'large' );
			if ( $img ) {
				return $img;
			}
		}
		$opt = (string) damoon_boost_opt( 'og_image' );
		if ( $opt ) {
			return array( $opt, 0, 0 );
		}
		$logo = get_theme_mod( 'custom_logo' );
		if ( $logo ) {
			$img = wp_get_attachment_image_src( $logo, 'full' );
			if ( $img ) {
				return $img;
			}
		}
		$icon = get_site_icon_url( 512 );
		return $icon ? array( $icon, 512, 512 ) : null;
	}

	private static function url() {
		if ( is_singular() ) {
			return (string) wp_get_canonical_url();
		}
		if ( is_front_page() || is_home() ) {
			return function_exists( 'pll_home_url' ) ? (string) pll_home_url() : home_url( '/' );
		}
		$obj = get_queried_object();
		if ( $obj instanceof WP_Term ) {
			$l = get_term_link( $obj );
			return is_wp_error( $l ) ? '' : $l;
		}
		return '';
	}

	public static function head() {
		if ( is_404() || is_search() ) {
			return;
		}
		$lang  = self::lang();
		$desc  = self::description();
		$url   = self::url();
		$title = wp_get_document_title();
		$img   = self::image();

		$meta = function ( $attr, $key, $value ) {
			if ( '' !== (string) $value ) {
				printf( '<meta %s="%s" content="%s">' . "\n", esc_attr( $attr ), esc_attr( $key ), esc_attr( $value ) );
			}
		};

		echo "<!-- Damoon Boost SEO -->\n";
		$meta( 'name', 'description', $desc );
		$meta( 'property', 'og:type', is_singular( 'post' ) ? 'article' : 'website' );
		$meta( 'property', 'og:site_name', get_bloginfo( 'name' ) );
		$meta( 'property', 'og:title', $title );
		$meta( 'property', 'og:description', $desc );
		$meta( 'property', 'og:url', $url );
		$meta( 'property', 'og:locale', Damoon_Boost_Lib::OG_LOCALE[ $lang ] );
		if ( function_exists( 'pll_languages_list' ) ) {
			foreach ( (array) pll_languages_list( array( 'fields' => 'slug' ) ) as $l ) {
				if ( $l !== $lang && isset( Damoon_Boost_Lib::OG_LOCALE[ $l ] ) ) {
					$meta( 'property', 'og:locale:alternate', Damoon_Boost_Lib::OG_LOCALE[ $l ] );
				}
			}
		}
		if ( $img ) {
			$meta( 'property', 'og:image', $img[0] );
			if ( ! empty( $img[1] ) ) {
				$meta( 'property', 'og:image:width', $img[1] );
				$meta( 'property', 'og:image:height', $img[2] );
			}
		}
		if ( is_singular( 'post' ) ) {
			$meta( 'property', 'article:published_time', get_the_date( 'c' ) );
			$meta( 'property', 'article:modified_time', get_the_modified_date( 'c' ) );
		}
		$meta( 'name', 'twitter:card', $img ? 'summary_large_image' : 'summary' );
		$handle = ltrim( (string) damoon_boost_opt( 'twitter' ), '@' );
		if ( $handle ) {
			$meta( 'name', 'twitter:site', '@' . $handle );
		}

		if ( is_front_page() ) {
			$home = function_exists( 'pll_home_url' ) ? (string) pll_home_url() : home_url( '/' );
			$logo = get_theme_mod( 'custom_logo' ) ? wp_get_attachment_image_url( get_theme_mod( 'custom_logo' ), 'full' ) : get_site_icon_url( 512 );
			$data = Damoon_Boost_Lib::jsonld_home(
				get_bloginfo( 'name' ),
				$home,
				(string) $logo,
				Damoon_Boost_Lib::url_lines( damoon_boost_opt( 'same_as' ) ),
				$lang,
				add_query_arg( 's', '{search_term_string}', $home )
			);
			echo '<script type="application/ld+json">' . wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG ) . "</script>\n";
		}
		echo "<!-- /Damoon Boost SEO -->\n";
	}

	/** نتایج جست‌وجو و صفحه‌های بی‌محتوا در گوگل ایندکس نشوند. */
	public static function robots( array $r ) {
		if ( is_search() || is_404() || ( damoon_boost_on( 'author_archives' ) && is_author() ) ) {
			$r['noindex'] = true;
			$r['follow']  = true;
		}
		if ( ! empty( $r['noindex'] ) ) {
			unset( $r['max-image-preview'] );
		} else {
			$r['max-image-preview'] = 'large';
		}
		return $r;
	}

	public static function robots_txt( $out, $public ) {
		if ( ! $public ) {
			return $out;
		}
		return Damoon_Boost_Lib::robots_merge( $out );
	}
}
