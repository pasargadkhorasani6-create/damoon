<?php
/**
 * تست‌های مستقل افزونه (بدون نیاز به وردپرس):  php wordpress/tests/run.php
 */
define( 'ABSPATH', __DIR__ . '/' );

$GLOBALS['dmn_opts'] = array(
	'stretch_thr'   => 2.0,
	'atr_stop_mult' => 1.5,
	'rr'            => 1.8,
);
function damoon_sig_opt( $k ) {
	return $GLOBALS['dmn_opts'][ $k ] ?? null;
}
function is_wp_error( $v ) {
	return false;
}
function get_option( $k ) {
	return 'testuid1';
}

$dir = dirname( __DIR__ ) . '/damoon-signal/includes/';
require $dir . 'market.php';
require $dir . 'engine.php';
require $dir . 'store.php';
require $dir . 'telegram.php';
require $dir . 'bridge.php';
require $dir . 'scanner.php';

$fails = 0;
function check( $name, $cond ) {
	global $fails;
	echo ( $cond ? 'ok   ' : 'FAIL ' ) . $name . "\n";
	$fails += $cond ? 0 : 1;
}
function bar( $t, $o, $h, $l, $c ) {
	return array( 'time' => $t, 'open' => $o, 'high' => $h, 'low' => $l, 'close' => $c, 'closed' => true );
}

/* ---------- resolve ---------- */

$long = array(
	'direction'    => 'long',
	'tf'           => '1h',
	'entry_price'  => 100,
	'stop_price'   => 98,
	'target_price' => 103.6,
	'rr'           => 1.8,
);
$r = Damoon_Store::resolve( $long, array( bar( 0, 100, 101, 99, 100.5 ), bar( 3600, 100.5, 104, 100, 103 ) ), 48 );
check( 'long hits target', 'win' === $r[0] && 103.6 == $r[1] && 1.8 == $r[2] && 7200 === $r[3] );

$r = Damoon_Store::resolve( $long, array( bar( 0, 100, 101, 97.5, 98 ) ), 48 );
check( 'long hits stop', 'loss' === $r[0] && -1.0 === $r[2] );

$r = Damoon_Store::resolve( $long, array( bar( 0, 100, 104, 97, 100 ) ), 48 );
check( 'stop and target in same bar counts as loss', 'loss' === $r[0] );

$r = Damoon_Store::resolve( $long, array( bar( 0, 100, 101, 99, 100.5 ), bar( 3600, 100.5, 101.5, 99.5, 101 ) ), 2 );
check( 'expiry uses close and R', 'expired' === $r[0] && 0.5 == $r[2] );

$open = bar( 0, 100, 110, 90, 100 );
$open['closed'] = false;
check( 'unclosed bar ignored', null === Damoon_Store::resolve( $long, array( $open ), 48 ) );

$short = array_merge( $long, array( 'direction' => 'short', 'stop_price' => 102, 'target_price' => 96.4 ) );
$r     = Damoon_Store::resolve( $short, array( bar( 0, 100, 100.5, 96, 96.5 ) ), 48 );
check( 'short hits target', 'win' === $r[0] );

/* ---------- امضای سازگار با web/src/lib/bot/hmac.ts ---------- */

$sig = Damoon_Bridge::sign( str_repeat( 's', 32 ), '1791790000', 'abcdef0123456789abcd', 'post', '/api/bot/events', '{"a":1}' );
check( 'HMAC matches Node implementation', 'd90e4ea93f3705dd55691a483d69c050581eed567e4dd395226809b999854bff' === $sig );

/* ---------- بدنهٔ رویدادها ---------- */

$row = array(
	'id'           => 7,
	'symbol'       => 'BTCUSDT',
	'tf'           => '4h',
	'bar_time'     => 1791763200,
	'direction'    => 'short',
	'strategy'     => 'trend_pullback',
	'entry_price'  => '60000',
	'stop_price'   => '61000',
	'target_price' => '58200',
	'status'       => 'expired',
	'exit_price'   => '59500',
	'closed_at'    => 1791900000,
);
$p   = Damoon_Bridge::payload( $row, 'new' );
check( 'new payload', 'signal.new' === $p['type'] && 'SELL' === $p['direction'] && 'MARKET' === $p['orderType'] && 'wp:testuid1:7' === $p['externalId'] && 1791763200 + 14400 === $p['signalAt'] );
$p = Damoon_Bridge::payload( $row, 'closed' );
check( 'closed payload maps expired to MANUAL', 'signal.closed' === $p['type'] && 'MANUAL' === $p['reason'] && 59500.0 === $p['exitPrice'] );

/* ---------- موتور ---------- */

function series( $n, $fn ) {
	$out  = array();
	$prev = $fn( 0 );
	for ( $i = 0; $i < $n; $i++ ) {
		$c     = $fn( $i );
		$out[] = bar( $i * 3600, $prev, max( $prev, $c ) * 1.002, min( $prev, $c ) * 0.998, $c );
		$prev  = $c;
	}
	return $out;
}
$a = Damoon_Engine::from_candles( series( 100, function ( $i ) { return 100; } ), 'X', '1h' );
check( 'too few bars rejected', 'no_data' === $a['reason']['code'] && null === $a['setup'] );

$rally = series(
	300,
	function ( $i ) {
		return $i < 292 ? 100 * ( 1 + 0.01 * sin( $i / 3 ) ) : 100 * pow( 1.012, $i - 291 );
	}
);
$a = Damoon_Engine::from_candles( $rally, 'X', '1h' );
check( 'stretched rally gives short mean reversion', $a['setup'] && 'short' === $a['setup']['direction'] && 'mean_reversion' === $a['setup']['strategy'] );
check( 'short levels ordered', $a['setup']['stop'] > $a['setup']['entry'] && $a['setup']['target'] < $a['setup']['entry'] );

$flat = series( 300, function ( $i ) { return 100 * ( 1 + 0.01 * sin( $i / 3 ) ); } );
$a    = Damoon_Engine::from_candles( $flat, 'X', '1h' );
check( 'range market without stretch gives no setup', null === $a['setup'] && 'no_setup' === $a['reason']['code'] );

/* ---------- اسکنر ---------- */

check( 'last closed bar', 3600 === Damoon_Scanner::last_closed_bar( '1h', 7300 ) );

echo $fails ? "\n{$fails} test(s) failed\n" : "\nall passed\n";
exit( $fails ? 1 : 0 );
