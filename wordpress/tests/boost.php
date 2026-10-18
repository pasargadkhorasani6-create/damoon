<?php
/**
 * تست‌های افزونهٔ Damoon Boost (بدون وردپرس):  php wordpress/tests/boost.php
 */
define( 'ABSPATH', __DIR__ . '/' );
require dirname( __DIR__ ) . '/damoon-boost/includes/lib.php';

$fails = 0;
function check( $name, $cond ) {
	global $fails;
	echo ( $cond ? 'ok   ' : 'FAIL ' ) . $name . "\n";
	$fails += $cond ? 0 : 1;
}

/* ---------- هدرها ---------- */

$h = Damoon_Boost_Lib::security_headers( true, true );
check( 'https: HSTS and upgrade-insecure-requests', isset( $h['Strict-Transport-Security'] ) && false !== strpos( $h['Content-Security-Policy'], 'upgrade-insecure-requests' ) );
check( 'clickjacking protection', 'SAMEORIGIN' === $h['X-Frame-Options'] && false !== strpos( $h['Content-Security-Policy'], "frame-ancestors 'self'" ) );
$h = Damoon_Boost_Lib::security_headers( false, true );
check( 'http (local): no HSTS, no forced upgrade', ! isset( $h['Strict-Transport-Security'] ) && false === strpos( $h['Content-Security-Policy'], 'upgrade' ) );
check( 'HSTS can be turned off', ! isset( Damoon_Boost_Lib::security_headers( true, false )['Strict-Transport-Security'] ) );

/* ---------- محدودیت ورود ---------- */

$r = array();
for ( $i = 0; $i < 4; $i++ ) {
	$r = Damoon_Boost_Lib::login_fail( $r, 1000 + $i, 5, 900, 1800 );
}
check( '4 fails: not locked', 0 === Damoon_Boost_Lib::locked_for( $r, 1004 ) && 4 === $r['n'] );
$r = Damoon_Boost_Lib::login_fail( $r, 1005, 5, 900, 1800 );
check( '5th fail locks for 30 minutes', 1800 === Damoon_Boost_Lib::locked_for( $r, 1005 ) && 0 === $r['n'] );
check( 'lock expires', 0 === Damoon_Boost_Lib::locked_for( $r, 1005 + 1800 ) );
$r = Damoon_Boost_Lib::login_fail( array( 'n' => 4, 't' => 1000, 'until' => 0 ), 1000 + 901, 5, 900, 1800 );
check( 'window resets after 15 minutes', 1 === $r['n'] && 0 === Damoon_Boost_Lib::locked_for( $r, 1901 ) );

/* ---------- توضیح متا ---------- */

check( 'description strips html, shortcodes, scripts', 'سلام دنیا' === Damoon_Boost_Lib::description( '<p>سلام</p>[damoon_scan tf="4h"]<script>x()</script> <b>دنیا</b>' ) );
check( 'description decodes entities', 'A & B' === Damoon_Boost_Lib::description( 'A &amp; B' ) );
$long = str_repeat( 'کلمه ', 60 );
$d    = Damoon_Boost_Lib::description( $long, 160 );
check( 'description truncated on word boundary', mb_strlen( $d, 'UTF-8' ) <= 160 && '…' === mb_substr( $d, -1, 1, 'UTF-8' ) && 'کلمه…' === mb_substr( $d, -5, 5, 'UTF-8' ) );
check( 'short description untouched', 'Short.' === Damoon_Boost_Lib::description( 'Short.' ) );

/* ---------- داده‌ی ساختاریافته ---------- */

$j = Damoon_Boost_Lib::jsonld_home( 'Damoon', 'https://x.com/', 'https://x.com/logo.png', array( 'https://t.me/d', '' ), 'fa', 'https://x.com/?s={search_term_string}' );
check( 'jsonld website + organization', 'WebSite' === $j['@graph'][0]['@type'] && 'Organization' === $j['@graph'][1]['@type'] && array( 'https://t.me/d' ) === $j['@graph'][1]['sameAs'] && 'fa' === $j['@graph'][0]['inLanguage'] );
$j = Damoon_Boost_Lib::jsonld_home( 'D', 'https://x.com/', '', array(), 'en', '' );
check( 'jsonld omits empty logo, sameAs, search', ! isset( $j['@graph'][1]['logo'] ) && ! isset( $j['@graph'][1]['sameAs'] ) && ! isset( $j['@graph'][0]['potentialAction'] ) );

/* ---------- robots.txt ---------- */

$core = "User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\n\nSitemap: https://x.com/wp-sitemap.xml\n";
$out  = Damoon_Boost_Lib::robots_merge( $core );
check( 'robots lines go inside the group, before Sitemap', "User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\nDisallow: /?s=\nDisallow: /search/\nDisallow: /*?replytocom=\n\nSitemap: https://x.com/wp-sitemap.xml\n" === $out );
check( 'robots merge is idempotent', $out === Damoon_Boost_Lib::robots_merge( $out ) );
check( 'robots without group gets one', 0 === strpos( Damoon_Boost_Lib::robots_merge( '' ), "User-agent: *\nDisallow: /?s=" ) );
check( 'REST is not blocked (Google renders live sections)', false === strpos( $out, 'wp-json' ) );

/* ---------- آدرس‌ها ---------- */

check( 'url_lines keeps only http(s), unique, limited', array( 'https://a.com', 'http://b.com/x' ) === Damoon_Boost_Lib::url_lines( "https://a.com\nfoo\njavascript:alert(1)\nhttp://b.com/x https://a.com\nhttps://\"x", 5 ) );

echo $fails ? "\n{$fails} test(s) failed\n" : "\nall passed\n";
exit( $fails ? 1 : 0 );
