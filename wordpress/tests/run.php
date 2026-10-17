<?php
/**
 * تست‌های مستقل افزونه (بدون نیاز به وردپرس):  php wordpress/tests/run.php
 */
define( 'ABSPATH', __DIR__ . '/' );
define( 'DAY_IN_SECONDS', 86400 );

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
require $dir . 'pulse.php';

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
check( '24h change computed', abs( $a['change_24h'] - ( $rally[299]['close'] / $rally[275]['close'] - 1 ) * 100 ) < 0.01 );
check( 'scan snapshot', 'short' === Damoon_Scanner::snapshot( $a )['direction'] && null === Damoon_Scanner::snapshot( $a )['reason'] );
check( 'short levels ordered', $a['setup']['stop'] > $a['setup']['entry'] && $a['setup']['target'] < $a['setup']['entry'] );

$flat = series( 300, function ( $i ) { return 100 * ( 1 + 0.01 * sin( $i / 3 ) ); } );
$a    = Damoon_Engine::from_candles( $flat, 'X', '1h' );
check( 'range market without stretch gives no setup', null === $a['setup'] && 'no_setup' === $a['reason']['code'] );

/* ---------- اسکنر ---------- */

check( 'last closed bar', 3600 === Damoon_Scanner::last_closed_bar( '1h', 7300 ) );


/* ---------- نبض بازار ---------- */

check( 'classify bullish en', 'bull' === Damoon_Pulse::classify( 'BTC breakout, going long here 🚀' ) );
check( 'classify bearish en', 'bear' === Damoon_Pulse::classify( 'This will dump hard, shorting now' ) );
check( 'classify persian', 'bull' === Damoon_Pulse::classify( 'بیت‌کوین صعودی است، وقت خرید' ) && 'bear' === Damoon_Pulse::classify( 'ریزش سنگین در راه است' ) );
check( 'classify tie is neutral', null === Damoon_Pulse::classify( 'buy or sell? no idea' ) );
check( 'classify respects word boundaries', null === Damoon_Pulse::classify( 'longevity and shortly after, the bulletin' ) );
check( 'clean strips html and truncates', 'a & b' === Damoon_Pulse::clean( '<b>a</b> &amp; b' ) && 10 === mb_strlen( Damoon_Pulse::clean( str_repeat( 'x', 50 ), 10 ) ) );
check( 'base asset', 'BTC' === Damoon_Pulse::base_asset( 'BTCUSDT' ) && array( 'solana' ) === Damoon_Pulse::keywords( 'SOL' ) && array( 'pepe' ) === Damoon_Pulse::keywords( 'PEPE' ) );

$now = 1791800000;
$st  = Damoon_Pulse::parse_stocktwits(
	array(
		'messages' => array(
			array( 'id' => 11, 'body' => 'Loading up <b>$BTC.X</b>', 'created_at' => gmdate( 'c', $now - 600 ), 'user' => array( 'username' => 'alice' ), 'entities' => array( 'sentiment' => array( 'basic' => 'Bullish' ) ) ),
			array( 'id' => 12, 'body' => 'dump incoming', 'created_at' => gmdate( 'c', $now - 1200 ), 'user' => array( 'username' => 'bob' ), 'entities' => array( 'sentiment' => array( 'basic' => 'Bearish' ) ) ),
			array( 'id' => 13, 'body' => 'moon moon moon', 'created_at' => gmdate( 'c', $now - 1800 ), 'user' => array( 'username' => 'carl' ), 'entities' => array( 'sentiment' => null ) ),
			array( 'body' => 'no id' ),
		),
	)
);
check( 'stocktwits uses author tags only', 3 === count( $st ) && 'bull' === $st[0]['sentiment'] && 'bear' === $st[1]['sentiment'] && null === $st[2]['sentiment'] && $st[0]['tagged'] );
check( 'stocktwits url and time', 'https://stocktwits.com/alice/message/11' === $st[0]['url'] && $now - 600 === $st[0]['time'] && 'Loading up $BTC.X' === $st[0]['text'] );

$rd = Damoon_Pulse::parse_reddit(
	array(
		'data' => array(
			'children' => array(
				array( 'data' => array( 'id' => 'a1', 'title' => 'Bitcoin rally to new ATH?', 'selftext' => '', 'author' => 'r1', 'permalink' => '/r/CryptoCurrency/comments/a1/x/', 'created_utc' => $now - 300, 'score' => 10 ) ),
				array( 'data' => array( 'id' => 'a2', 'title' => 'nsfw', 'over_18' => true, 'created_utc' => $now ) ),
			),
		),
	)
);
check( 'reddit parsed, estimated, nsfw skipped', 1 === count( $rd ) && 'bull' === $rd[0]['sentiment'] && false === $rd[0]['tagged'] && 'https://www.reddit.com/r/CryptoCurrency/comments/a1/x/' === $rd[0]['url'] );

$rss = '<?xml version="1.0"?><rss><channel><title>CoinDesk</title>'
	. '<item><title>Bitcoin surges past resistance</title><link>https://coindesk.com/a</link><pubDate>' . gmdate( DATE_RSS, $now - 3600 ) . '</pubDate></item>'
	. '<item><title>Ethereum upgrade delayed</title><link>https://coindesk.com/b</link><pubDate>' . gmdate( DATE_RSS, $now - 3600 ) . '</pubDate></item>'
	. '<item><title><![CDATA[BTC miners sell as price falls]]></title><link>javascript:alert(1)</link><pubDate>' . gmdate( DATE_RSS, $now - 7200 ) . '</pubDate></item>'
	. '</channel></rss>';
$nw = Damoon_Pulse::parse_rss( $rss, array( 'bitcoin', 'btc' ) );
check( 'rss filtered by coin keywords', 2 === count( $nw ) && 'CoinDesk' === $nw[0]['author'] );
check( 'rss tone and unsafe links dropped', 'bull' === $nw[0]['sentiment'] && 'bear' === $nw[1]['sentiment'] && '' === $nw[1]['url'] );
check( 'rss invalid xml', array() === Damoon_Pulse::parse_rss( '<rss><broken' ) && array() === Damoon_Pulse::parse_rss( '' ) );

$fng = Damoon_Pulse::parse_fng( array( 'data' => array( array( 'value' => '72', 'timestamp' => '1791800000' ) ) ) );
check( 'fear & greed label', 72 === $fng['value'] && 'طمع' === $fng['label'] && null === Damoon_Pulse::parse_fng( array() ) );

/* تجمیع */
$mk = function ( $id, $sent, $age, $src = 'stocktwits' ) use ( $now ) {
	return array( 'source' => $src, 'id' => $id, 'text' => 'post ' . $id, 'author' => 'u', 'url' => '', 'time' => $now - $age, 'sentiment' => $sent, 'tagged' => 'stocktwits' === $src );
};
$social = array( $mk( 'a', 'bull', 60 ), $mk( 'b', 'bull', 120 ), $mk( 'c', 'bull', 180 ), $mk( 'd', 'bull', 240, 'reddit' ), $mk( 'e', 'bear', 300 ), $mk( 'f', null, 360 ), $mk( 'a', 'bull', 60 ), $mk( 'old', 'bear', 90000 ) );
$p = Damoon_Pulse::aggregate( 'BTCUSDT', $social, $nw, $fng, array( 'direction' => 'long', 'tf' => '4h' ), array(), $now );
check( 'pulse counts only last 24h, deduplicated', 6 === $p['social']['total'] && 4 === $p['social']['bull'] && 1 === $p['social']['bear'] && 1 === $p['social']['neutral'] );
check( 'pulse percentages', 80.0 === $p['social']['bull_pct'] && 20.0 === $p['social']['bear_pct'] && 'bull' === $p['crowd'] );
check( 'pulse agrees with damoon long', 'agree' === $p['versus'] && 4 === count( $p['aligned'] ) && 'a' === $p['feed'][0]['id'] );
check( 'pulse per-source breakdown', 4 === $p['social']['by_source']['stocktwits']['bull'] + $p['social']['by_source']['stocktwits']['bear'] && 1 === $p['social']['by_source']['reddit']['total'] );
check( 'pulse per hour floors span at 1h', 6.0 === $p['social']['per_hour'] );

$p = Damoon_Pulse::aggregate( 'BTCUSDT', $social, array(), null, array( 'direction' => 'short' ), array(), $now );
check( 'pulse disagrees with damoon short', 'disagree' === $p['versus'] && 1 === count( $p['aligned'] ) );

$few = Damoon_Pulse::aggregate( 'BTCUSDT', array( $mk( 'x', 'bull', 10 ), $mk( 'y', 'bear', 20 ) ), array(), null, array( 'direction' => 'long' ), array( 'reddit' => 'HTTP 403' ), $now );
check( 'too few votes: no percentage, no verdict', null === $few['social']['bull_pct'] && null === $few['crowd'] && null === $few['versus'] && ! isset( $few['social']['by_source']['reddit'] ) && 'HTTP 403' === $few['errors']['reddit'] );

$none = Damoon_Pulse::aggregate( 'BTCUSDT', $social, array(), null, null, array(), $now );
check( 'no damoon setup: no aligned list', null === $none['damoon'] && array() === $none['aligned'] && null === $none['versus'] );

// تست‌های تنظیمات جداگانه: php wordpress/tests/settings.php
echo $fails ? "\n{$fails} test(s) failed\n" : "\nall passed\n";
exit( $fails ? 1 : 0 );
