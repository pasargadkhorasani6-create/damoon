<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * موتور قانون‌محور تولید ستاپ.
 *
 * همهٔ اعداد را کد حساب می‌کند. اگر هر شرطی برقرار نباشد یا داده ناقص باشد،
 * ستاپی صادر نمی‌شود و دلیل رد برگردانده می‌شود (fail-closed).
 */
class Damoon_Engine {

	const MIN_BARS = 220;

	public static function analyze( $symbol, $tf ) {
		$candles = Damoon_Market::klines( $symbol, $tf, 300 );
		if ( is_wp_error( $candles ) ) {
			return $candles;
		}
		return self::from_candles( $candles, $symbol, $tf );
	}

	/**
	 * تحلیل خالص روی آرایهٔ کندل‌ها (بدون وابستگی به شبکه، قابل تست).
	 */
	public static function from_candles( array $candles, $symbol, $tf ) {
		$bars = array_values(
			array_filter(
				$candles,
				function ( $c ) {
					return ! empty( $c['closed'] );
				}
			)
		);
		$n    = count( $bars );

		$out = array(
			'symbol'     => $symbol,
			'tf'         => $tf,
			'bar_time'   => $n ? $bars[ $n - 1 ]['time'] : 0,
			'price'      => $n ? $bars[ $n - 1 ]['close'] : 0,
			'decimals'   => $n ? Damoon_Market::decimals( $bars[ $n - 1 ]['close'] ) : 2,
			'indicators' => null,
			'regime'     => null,
			'trend'      => null,
			'setup'      => null,
			'reason'     => null,
			'thesis'     => '',
			'change_24h' => null,
		);

		if ( $n < self::MIN_BARS ) {
			return self::reject( $out, 'no_data' );
		}

		// تغییر ۲۴ ساعته روی کندل‌های بسته‌شده.
		$back = (int) round( DAY_IN_SECONDS / ( Damoon_Market::TF[ $tf ] ?? DAY_IN_SECONDS ) );
		if ( $n > $back && $bars[ $n - 1 - $back ]['close'] > 0 ) {
			$out['change_24h'] = round( ( $bars[ $n - 1 ]['close'] / $bars[ $n - 1 - $back ]['close'] - 1 ) * 100, 2 );
		}

		$h = array_column( $bars, 'high' );
		$l = array_column( $bars, 'low' );
		$c = array_column( $bars, 'close' );
		$i = $n - 1;

		$ema20 = Damoon_Market::ema( $c, 20 );
		$ema50 = Damoon_Market::ema( $c, 50 );
		$ema200 = Damoon_Market::ema( $c, 200 );
		$atr   = Damoon_Market::atr( $h, $l, $c, 14 );
		$rsi   = Damoon_Market::rsi( $c, 14 );

		$price = $c[ $i ];
		$a     = $atr[ $i ];
		if ( ! $a || $a <= 0 || $price <= 0 || null === $ema50[ $i - 10 ] ) {
			return self::reject( $out, 'no_indicators' );
		}

		// رژیم نوسان: ATR٪ فعلی نسبت به میانهٔ ۱۰۰ کندل اخیر.
		$hist = array();
		for ( $j = max( 15, $i - 99 ); $j <= $i; $j++ ) {
			if ( $atr[ $j ] ) {
				$hist[] = $atr[ $j ] / $c[ $j ];
			}
		}
		$med    = Damoon_Market::median( $hist );
		$ratio  = $med > 0 ? ( $a / $price ) / $med : 1.0;
		$regime = $ratio >= 1.25 ? 'high_vol' : ( $ratio <= 0.8 ? 'low_vol' : 'normal' );

		// روند: ترتیب میانگین‌ها و شیب EMA50 در ۱۰ کندل.
		$trend = 'range';
		if ( $ema20[ $i ] > $ema50[ $i ] && $ema50[ $i ] > $ema50[ $i - 10 ] ) {
			$trend = 'up';
		} elseif ( $ema20[ $i ] < $ema50[ $i ] && $ema50[ $i ] < $ema50[ $i - 10 ] ) {
			$trend = 'down';
		}

		$stretch = ( $price - $ema20[ $i ] ) / $a;
		$r       = $rsi[ $i ];
		$thr     = (float) damoon_sig_opt( 'stretch_thr' );

		$out['indicators'] = array(
			'ema20'     => $ema20[ $i ],
			'ema50'     => $ema50[ $i ],
			'atr'       => $a,
			'atr_pct'   => round( $a / $price * 100, 2 ),
			'rsi'       => round( $r, 1 ),
			'stretch'   => round( $stretch, 2 ),
			'vol_ratio' => round( $ratio, 2 ),
		);
		$out['regime']     = $regime;
		$out['trend']      = $trend;

		$dir      = null;
		$strategy = null;

		if ( $stretch >= $thr && $r >= 65 ) {
			$dir      = 'short';
			$strategy = 'mean_reversion';
		} elseif ( $stretch <= -$thr && $r <= 35 ) {
			$dir      = 'long';
			$strategy = 'mean_reversion';
		} elseif ( 'up' === $trend && abs( $stretch ) <= 0.5 && $r >= 45 && $r <= 65 ) {
			$dir      = 'long';
			$strategy = 'trend_pullback';
		} elseif ( 'down' === $trend && abs( $stretch ) <= 0.5 && $r >= 35 && $r <= 55 ) {
			$dir      = 'short';
			$strategy = 'trend_pullback';
		}

		if ( null === $dir ) {
			return self::reject( $out, 'no_setup', array( number_format( $stretch, 2 ), number_format( $r, 1 ) ) );
		}

		// Playbook: بازگشت به میانگین خلاف روند اصلی در نوسان بالا مجاز نیست.
		// روند اصلی فقط وقتی معتبر است که EMA50 بیش از ۲ برابر ATR از EMA200 فاصله داشته باشد.
		$gap   = $ema50[ $i ] - $ema200[ $i ];
		$major = abs( $gap ) > 2 * $a ? ( $gap > 0 ? 'up' : 'down' ) : 'range';
		$counter = ( 'long' === $dir && 'down' === $major ) || ( 'short' === $dir && 'up' === $major );
		if ( 'mean_reversion' === $strategy && 'high_vol' === $regime && $counter ) {
			return self::reject( $out, 'wrong_playbook' );
		}

		$risk   = $a * (float) damoon_sig_opt( 'atr_stop_mult' );
		$rr     = (float) damoon_sig_opt( 'rr' );
		$sign   = 'long' === $dir ? 1 : -1;
		$stop   = $price - $sign * $risk;
		$target = $price + $sign * $risk * $rr;
		$rpct   = $risk / $price * 100;

		if ( $stop <= 0 || $target <= 0 || $rpct < 0.1 || $rpct > 8 ) {
			return self::reject( $out, 'risk_out_of_range' );
		}

		$out['setup'] = array(
			'direction' => $dir,
			'strategy'  => $strategy,
			'entry'     => $price,
			'stop'      => $stop,
			'target'    => $target,
			'rr'        => $rr,
			'risk_pct'  => round( $rpct, 2 ),
		);
		$out['thesis'] = self::thesis( $out, 'fa' );
		return $out;
	}

	/** متن دلیل رد به فارسی ذخیره می‌شود (تلگرام و مدیریت)؛ localize() آن را به زبان بازدیدکننده برمی‌گرداند. */
	private static function reject( array $out, $code, array $args = array() ) {
		$out['reason'] = array(
			'code' => $code,
			'args' => $args,
			'text' => Damoon_Lang::tl( 'fa', 'reason_' . $code, ...$args ),
		);
		return $out;
	}

	/** متن‌های تحلیل را به زبان داده‌شده بازنویسی می‌کند (پاسخ REST). */
	public static function localize( array $a, $lang ) {
		if ( ! empty( $a['reason']['code'] ) ) {
			$a['reason']['text'] = Damoon_Lang::tl( $lang, 'reason_' . $a['reason']['code'], ...( $a['reason']['args'] ?? array() ) );
		}
		if ( ! empty( $a['setup'] ) ) {
			$a['thesis'] = self::thesis( $a, $lang );
		}
		return $a;
	}

	private static function thesis( array $o, $lang ) {
		$s    = $o['setup'];
		$dir  = $s['direction'];
		$ind  = $o['indicators'];
		$tail = Damoon_Lang::tl( $lang, 'thesis_tail', Damoon_Lang::tl( $lang, 'vol_' . $o['regime'] ), number_format( $ind['atr_pct'], 2 ) );

		if ( 'mean_reversion' === $s['strategy'] ) {
			return Damoon_Lang::tl(
				$lang,
				'thesis_mr',
				number_format( abs( $ind['stretch'] ), 2 ),
				Damoon_Lang::tl( $lang, 'short' === $dir ? 'mr_above' : 'mr_below' ),
				number_format( $ind['rsi'], 1 )
			) . $tail;
		}
		return Damoon_Lang::tl(
			$lang,
			'thesis_tp',
			Damoon_Lang::tl( $lang, 'long' === $dir ? 'trend_up' : 'trend_down' ),
			Damoon_Lang::tl( $lang, 'long' === $dir ? 'ema_above' : 'ema_below' ),
			number_format( $ind['rsi'], 1 )
		) . $tail;
	}
}
