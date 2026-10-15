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
			return self::reject( $out, 'no_data', 'دادهٔ کافی برای تحلیل این نماد در دسترس نیست.' );
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
			return self::reject( $out, 'no_data', 'محاسبهٔ اندیکاتورها ممکن نشد.' );
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
			return self::reject(
				$out,
				'no_setup',
				sprintf(
					'در حال حاضر هیچ‌کدام از الگوها برقرار نیست. فاصله از EMA20 برابر %s ATR و RSI روی %s است.',
					number_format( $stretch, 2 ),
					number_format( $r, 1 )
				)
			);
		}

		// Playbook: بازگشت به میانگین خلاف روند اصلی در نوسان بالا مجاز نیست.
		// روند اصلی فقط وقتی معتبر است که EMA50 بیش از ۲ برابر ATR از EMA200 فاصله داشته باشد.
		$gap   = $ema50[ $i ] - $ema200[ $i ];
		$major = abs( $gap ) > 2 * $a ? ( $gap > 0 ? 'up' : 'down' ) : 'range';
		$counter = ( 'long' === $dir && 'down' === $major ) || ( 'short' === $dir && 'up' === $major );
		if ( 'mean_reversion' === $strategy && 'high_vol' === $regime && $counter ) {
			return self::reject(
				$out,
				'wrong_playbook',
				'قیمت از میانگین فاصله گرفته، اما معاملهٔ خلاف روند اصلی در نوسان بالا طبق قواعد مجاز نیست.'
			);
		}

		$risk   = $a * (float) damoon_sig_opt( 'atr_stop_mult' );
		$rr     = (float) damoon_sig_opt( 'rr' );
		$sign   = 'long' === $dir ? 1 : -1;
		$stop   = $price - $sign * $risk;
		$target = $price + $sign * $risk * $rr;
		$rpct   = $risk / $price * 100;

		if ( $stop <= 0 || $target <= 0 || $rpct < 0.1 || $rpct > 8 ) {
			return self::reject( $out, 'risk_out_of_range', 'فاصلهٔ حد ضرر خارج از محدودهٔ مجاز است؛ ستاپ صادر نشد.' );
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
		$out['thesis'] = self::thesis( $strategy, $dir, $out );
		return $out;
	}

	private static function reject( array $out, $code, $text ) {
		$out['reason'] = array(
			'code' => $code,
			'text' => $text,
		);
		return $out;
	}

	private static function thesis( $strategy, $dir, array $o ) {
		$regimes = array(
			'high_vol' => 'بالا',
			'normal'   => 'عادی',
			'low_vol'  => 'پایین',
		);
		$ind     = $o['indicators'];
		$tail    = sprintf( ' نوسان بازار: %s (ATR برابر %s٪ قیمت).', $regimes[ $o['regime'] ], number_format( $ind['atr_pct'], 2 ) );

		if ( 'mean_reversion' === $strategy ) {
			return sprintf(
				'بازگشت به میانگین: قیمت به اندازهٔ %s برابر ATR %s از EMA20 قرار گرفته و RSI روی %s است. انتظار می‌رود قیمت به سمت میانگین برگردد.',
				number_format( abs( $ind['stretch'] ), 2 ),
				'short' === $dir ? 'بالاتر' : 'پایین‌تر',
				number_format( $ind['rsi'], 1 )
			) . $tail;
		}
		return sprintf(
			'ادامهٔ روند: روند %s است (EMA20 %s EMA50) و قیمت به نزدیکی EMA20 برگشته است. RSI روی %s قرار دارد.',
			'long' === $dir ? 'صعودی' : 'نزولی',
			'long' === $dir ? 'بالای' : 'زیر',
			number_format( $ind['rsi'], 1 )
		) . $tail;
	}
}
