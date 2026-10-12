<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * دریافت کندل از Binance و محاسبهٔ اندیکاتورها.
 */
class Damoon_Market {

	/** تایم‌فریم‌های مجاز و طول هر کندل به ثانیه. */
	const TF = array(
		'15m' => 900,
		'1h'  => 3600,
		'4h'  => 14400,
		'1d'  => 86400,
	);

	/**
	 * @return array|WP_Error فهرست کندل‌ها: time (ثانیه)، open، high، low، close، volume، closed
	 */
	public static function klines( $symbol, $tf, $limit = 300, $start_ms = null ) {
		$args = array(
			'symbol'   => $symbol,
			'interval' => $tf,
			'limit'    => min( 1000, max( 1, (int) $limit ) ),
		);
		if ( $start_ms ) {
			$args['startTime'] = (int) $start_ms;
		}
		$url = rtrim( (string) damoon_sig_opt( 'api_base' ), '/' ) . '/api/v3/klines?' . http_build_query( $args );
		$res = wp_remote_get( $url, array( 'timeout' => 12 ) );

		if ( is_wp_error( $res ) ) {
			return new WP_Error( 'damoon_data', 'اتصال به منبع داده برقرار نشد.', array( 'status' => 502 ) );
		}
		if ( 200 !== (int) wp_remote_retrieve_response_code( $res ) ) {
			return new WP_Error( 'damoon_data', 'منبع داده پاسخ معتبر نداد.', array( 'status' => 502 ) );
		}
		$rows = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! is_array( $rows ) ) {
			return new WP_Error( 'damoon_data', 'دادهٔ دریافتی قابل خواندن نیست.', array( 'status' => 502 ) );
		}

		$now_ms = (int) round( microtime( true ) * 1000 );
		$out    = array();
		foreach ( $rows as $r ) {
			if ( ! is_array( $r ) || count( $r ) < 7 ) {
				continue;
			}
			$out[] = array(
				'time'   => (int) ( $r[0] / 1000 ),
				'open'   => (float) $r[1],
				'high'   => (float) $r[2],
				'low'    => (float) $r[3],
				'close'  => (float) $r[4],
				'volume' => (float) $r[5],
				'closed' => ( (int) $r[6] ) < $now_ms,
			);
		}
		return $out;
	}

	public static function ema( array $v, $p ) {
		$n   = count( $v );
		$out = array_fill( 0, $n, null );
		if ( $n < $p ) {
			return $out;
		}
		$k           = 2 / ( $p + 1 );
		$out[ $p - 1 ] = array_sum( array_slice( $v, 0, $p ) ) / $p;
		for ( $i = $p; $i < $n; $i++ ) {
			$out[ $i ] = $v[ $i ] * $k + $out[ $i - 1 ] * ( 1 - $k );
		}
		return $out;
	}

	/** ATR به روش Wilder. */
	public static function atr( array $h, array $l, array $c, $p = 14 ) {
		$n   = count( $c );
		$out = array_fill( 0, $n, null );
		if ( $n <= $p ) {
			return $out;
		}
		$tr = array( 0 => 0.0 );
		for ( $i = 1; $i < $n; $i++ ) {
			$tr[ $i ] = max( $h[ $i ] - $l[ $i ], abs( $h[ $i ] - $c[ $i - 1 ] ), abs( $l[ $i ] - $c[ $i - 1 ] ) );
		}
		$sum = 0.0;
		for ( $i = 1; $i <= $p; $i++ ) {
			$sum += $tr[ $i ];
		}
		$out[ $p ] = $sum / $p;
		for ( $i = $p + 1; $i < $n; $i++ ) {
			$out[ $i ] = ( $out[ $i - 1 ] * ( $p - 1 ) + $tr[ $i ] ) / $p;
		}
		return $out;
	}

	/** RSI به روش Wilder. */
	public static function rsi( array $c, $p = 14 ) {
		$n   = count( $c );
		$out = array_fill( 0, $n, null );
		if ( $n <= $p ) {
			return $out;
		}
		$g = 0.0;
		$l = 0.0;
		for ( $i = 1; $i <= $p; $i++ ) {
			$d = $c[ $i ] - $c[ $i - 1 ];
			if ( $d > 0 ) {
				$g += $d;
			} else {
				$l -= $d;
			}
		}
		$ag        = $g / $p;
		$al        = $l / $p;
		$out[ $p ] = ( 0.0 === $al ) ? 100.0 : 100 - 100 / ( 1 + $ag / $al );
		for ( $i = $p + 1; $i < $n; $i++ ) {
			$d  = $c[ $i ] - $c[ $i - 1 ];
			$ag = ( $ag * ( $p - 1 ) + max( $d, 0 ) ) / $p;
			$al = ( $al * ( $p - 1 ) + max( -$d, 0 ) ) / $p;
			$out[ $i ] = ( 0.0 === $al ) ? 100.0 : 100 - 100 / ( 1 + $ag / $al );
		}
		return $out;
	}

	public static function median( array $v ) {
		sort( $v );
		$n = count( $v );
		if ( 0 === $n ) {
			return 0.0;
		}
		$m = intdiv( $n, 2 );
		return ( $n % 2 ) ? $v[ $m ] : ( $v[ $m - 1 ] + $v[ $m ] ) / 2;
	}

	/** تعداد اعشار مناسب برای نمایش قیمت. */
	public static function decimals( $price ) {
		if ( $price >= 100 ) {
			return 2;
		}
		if ( $price >= 1 ) {
			return 4;
		}
		return 6;
	}
}
