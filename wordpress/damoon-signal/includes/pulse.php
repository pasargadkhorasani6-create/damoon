<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * نبض بازار: نظرات شبکه‌های اجتماعی، اخبار و شاخص ترس و طمع، کنار جهت فعلی ربات دامون.
 *
 * منابع (بدون کلید API):
 *  - StockTwits: هر پیام را خود نویسنده «Bullish/Bearish» برچسب می‌زند ← تعداد خرید/فروش واقعی.
 *  - Reddit: برچسب ندارد؛ جهت با فهرست واژه‌ها تخمین زده می‌شود (در خروجی tagged=false).
 *  - اخبار (RSS): لحن تیتر با فهرست واژه‌ها تخمین زده می‌شود.
 *  - شاخص ترس و طمع کریپتو (alternative.me).
 *
 * هیچ عددی ساخته نمی‌شود: اگر منبعی در دسترس نباشد، بخشش خالی می‌ماند و خطا گزارش می‌شود.
 */
class Damoon_Pulse {

	const TTL       = 600;  // اعتبار کش هر نماد (ثانیه)؛ کرون هر ۵ دقیقه تازه‌اش می‌کند.
	const WINDOW    = 86400; // فقط نظرات ۲۴ ساعت اخیر شمرده می‌شوند.
	const MIN_VOTES = 5;     // کمتر از این تعداد نظر جهت‌دار، درصد خرید/فروش نمایش داده نمی‌شود.
	const MAX_SYMS  = 10;

	const SOURCES = array(
		'stocktwits' => 'StockTwits',
		'reddit'     => 'Reddit',
		'news'       => 'اخبار',
		'fng'        => 'شاخص ترس و طمع',
	);

	/** واژه‌های نشان‌دهندهٔ دید خرید/فروش (انگلیسی و فارسی). */
	const BULL = array( 'bull', 'bullish', 'moon', 'mooning', 'buy', 'buying', 'bought', 'long', 'longs', 'pump', 'pumping', 'breakout', 'rally', 'rallies', 'surge', 'surges', 'soar', 'soars', 'jump', 'jumps', 'gain', 'gains', 'rise', 'rises', 'rising', 'ath', 'record high', 'accumulate', 'accumulating', 'undervalued', 'uptrend', 'higher', 'approval', 'approves', 'inflows', 'adoption', 'صعود', 'صعودی', 'خرید', 'رشد', 'افزایش', 'جهش', 'لانگ' );
	const BEAR = array( 'bear', 'bearish', 'sell', 'selling', 'sold', 'short', 'shorts', 'dump', 'dumping', 'crash', 'crashes', 'drop', 'drops', 'plunge', 'plunges', 'fall', 'falls', 'falling', 'slide', 'slides', 'slump', 'tumble', 'tumbles', 'rekt', 'liquidated', 'liquidation', 'downtrend', 'lower', 'overvalued', 'hack', 'hacked', 'exploit', 'lawsuit', 'ban', 'outflows', 'fear', 'نزول', 'نزولی', 'فروش', 'ریزش', 'سقوط', 'کاهش', 'شورت' );

	/** واژه‌های جست‌وجو برای هر رمزارز (برای فیلتر اخبار و ردیت). تیکرهای مبهم (SOL، DOT، LINK…) عمداً حذف شده‌اند. */
	const KEYWORDS = array(
		'BTC'  => array( 'bitcoin', 'btc' ),
		'ETH'  => array( 'ethereum', 'eth', 'ether' ),
		'SOL'  => array( 'solana' ),
		'BNB'  => array( 'bnb', 'binance coin' ),
		'XRP'  => array( 'xrp', 'ripple' ),
		'ADA'  => array( 'cardano' ),
		'DOGE' => array( 'dogecoin', 'doge' ),
		'TRX'  => array( 'tron', 'trx' ),
		'TON'  => array( 'toncoin' ),
		'AVAX' => array( 'avalanche', 'avax' ),
		'LINK' => array( 'chainlink' ),
		'DOT'  => array( 'polkadot' ),
		'LTC'  => array( 'litecoin', 'ltc' ),
	);

	/* ------------------------------------------------------------------ توابع خالص (قابل تست بدون وردپرس) */

	public static function base_asset( $symbol ) {
		return preg_replace( '/(USDT|USDC|BUSD|FDUSD|USD)$/', '', strtoupper( (string) $symbol ) );
	}

	public static function keywords( $base ) {
		$base = strtoupper( (string) $base );
		return self::KEYWORDS[ $base ] ?? array( strtolower( $base ) );
	}

	/** متن ساده، بدون HTML، کوتاه‌شده. */
	public static function clean( $text, $max = 280 ) {
		$t = html_entity_decode( strip_tags( (string) $text ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		$t = trim( preg_replace( '/\s+/u', ' ', $t ) );
		if ( function_exists( 'mb_strlen' ) && mb_strlen( $t, 'UTF-8' ) > $max ) {
			$t = rtrim( mb_substr( $t, 0, $max - 1, 'UTF-8' ) ) . '…';
		}
		return $t;
	}

	private static function count_terms( $text, array $terms ) {
		$n = 0;
		foreach ( $terms as $w ) {
			// مرز کلمه برای انگلیسی؛ برای فارسی \b کار نمی‌کند پس جداکنندهٔ غیرحرفی بررسی می‌شود.
			$re = '/(?<![\p{L}\p{N}])' . preg_quote( $w, '/' ) . '(?![\p{L}\p{N}])/iu';
			$n += preg_match_all( $re, $text );
		}
		return $n;
	}

	/**
	 * تخمین جهت متن با شمارش واژه‌ها.
	 *
	 * @return string|null bull | bear | null (خنثی یا نامشخص)
	 */
	public static function classify( $text ) {
		$text = (string) $text;
		$b    = self::count_terms( $text, self::BULL );
		$s    = self::count_terms( $text, self::BEAR );
		if ( $b === $s ) {
			return null;
		}
		return $b > $s ? 'bull' : 'bear';
	}

	private static function https( $url ) {
		$url = (string) $url;
		return preg_match( '#^https://[^\s"<>]+$#i', $url ) ? $url : '';
	}

	/** پاسخ GET /api/2/streams/symbol/{SYM}.json */
	public static function parse_stocktwits( $json ) {
		$out = array();
		foreach ( (array) ( $json['messages'] ?? array() ) as $m ) {
			if ( ! is_array( $m ) || empty( $m['id'] ) ) {
				continue;
			}
			$basic = $m['entities']['sentiment']['basic'] ?? null;
			$user  = (string) ( $m['user']['username'] ?? '' );
			$out[] = array(
				'source'    => 'stocktwits',
				'id'        => 'st' . (int) $m['id'],
				'text'      => self::clean( $m['body'] ?? '' ),
				'author'    => $user,
				'url'       => $user ? 'https://stocktwits.com/' . rawurlencode( $user ) . '/message/' . (int) $m['id'] : '',
				'time'      => (int) strtotime( (string) ( $m['created_at'] ?? '' ) ),
				// برچسب خود نویسنده؛ اگر نزده باشد خنثی شمرده می‌شود (حدس زده نمی‌شود).
				'sentiment' => 'Bullish' === $basic ? 'bull' : ( 'Bearish' === $basic ? 'bear' : null ),
				'tagged'    => true,
			);
		}
		return $out;
	}

	/** پاسخ GET reddit.com/search.json */
	public static function parse_reddit( $json ) {
		$out = array();
		foreach ( (array) ( $json['data']['children'] ?? array() ) as $c ) {
			$d = $c['data'] ?? null;
			if ( ! is_array( $d ) || empty( $d['id'] ) || ! empty( $d['over_18'] ) ) {
				continue;
			}
			$text  = self::clean( trim( ( $d['title'] ?? '' ) . ' — ' . ( $d['selftext'] ?? '' ), ' —' ) );
			$out[] = array(
				'source'    => 'reddit',
				'id'        => 'rd' . preg_replace( '/[^a-z0-9]/i', '', (string) $d['id'] ),
				'text'      => $text,
				'author'    => (string) ( $d['author'] ?? '' ),
				'url'       => isset( $d['permalink'] ) ? self::https( 'https://www.reddit.com' . $d['permalink'] ) : '',
				'time'      => (int) ( $d['created_utc'] ?? 0 ),
				'sentiment' => self::classify( $text ),
				'tagged'    => false,
				'score'     => (int) ( $d['score'] ?? 0 ),
			);
		}
		return $out;
	}

	/**
	 * فید RSS اخبار.
	 *
	 * @param string[] $keywords اگر داده شود فقط تیترهای شامل یکی از این واژه‌ها برگردانده می‌شوند.
	 */
	public static function parse_rss( $xml, array $keywords = array() ) {
		if ( ! is_string( $xml ) || '' === trim( $xml ) ) {
			return array();
		}
		$prev = libxml_use_internal_errors( true );
		$doc  = simplexml_load_string( $xml, 'SimpleXMLElement', LIBXML_NOCDATA | LIBXML_NONET );
		libxml_clear_errors();
		libxml_use_internal_errors( $prev );
		if ( ! $doc || ! isset( $doc->channel->item ) ) {
			return array();
		}
		$feed = self::clean( (string) $doc->channel->title, 60 );
		$out  = array();
		foreach ( $doc->channel->item as $it ) {
			$title = self::clean( (string) $it->title, 200 );
			if ( '' === $title ) {
				continue;
			}
			if ( $keywords && ! self::count_terms( $title . ' ' . strip_tags( (string) $it->description ), $keywords ) ) {
				continue;
			}
			$src   = isset( $it->source ) ? self::clean( (string) $it->source, 60 ) : $feed;
			$link  = self::https( trim( (string) $it->link ) );
			$out[] = array(
				'source'    => 'news',
				'id'        => 'nw' . substr( md5( $link ?: $title ), 0, 12 ),
				'text'      => $title,
				'author'    => $src,
				'url'       => $link,
				'time'      => (int) strtotime( (string) $it->pubDate ),
				'sentiment' => self::classify( $title ),
				'tagged'    => false,
			);
		}
		return $out;
	}

	/** پاسخ GET api.alternative.me/fng/ */
	public static function parse_fng( $json ) {
		$d = $json['data'][0] ?? null;
		if ( ! is_array( $d ) || ! isset( $d['value'] ) || ! is_numeric( $d['value'] ) ) {
			return null;
		}
		$v      = max( 0, min( 100, (int) $d['value'] ) );
		$labels = array(
			array( 25, 'ترس شدید' ),
			array( 45, 'ترس' ),
			array( 55, 'خنثی' ),
			array( 75, 'طمع' ),
			array( 101, 'طمع شدید' ),
		);
		foreach ( $labels as $l ) {
			if ( $v < $l[0] ) {
				return array(
					'value' => $v,
					'label' => $l[1],
					'time'  => (int) ( $d['timestamp'] ?? 0 ),
				);
			}
		}
		return null;
	}

	/** شمارش خرید/فروش یک دسته پیام. */
	private static function tally( array $items ) {
		$bull = 0;
		$bear = 0;
		foreach ( $items as $i ) {
			if ( 'bull' === $i['sentiment'] ) {
				$bull++;
			} elseif ( 'bear' === $i['sentiment'] ) {
				$bear++;
			}
		}
		$dir = $bull + $bear;
		return array(
			'total'    => count( $items ),
			'bull'     => $bull,
			'bear'     => $bear,
			'neutral'  => count( $items ) - $dir,
			// درصد فقط وقتی معنادار است که نظر جهت‌دار کافی باشد.
			'bull_pct' => $dir >= self::MIN_VOTES ? round( $bull / $dir * 100, 1 ) : null,
			'bear_pct' => $dir >= self::MIN_VOTES ? round( $bear / $dir * 100, 1 ) : null,
		);
	}

	/**
	 * ساخت خلاصهٔ نهایی از داده‌های خام.
	 *
	 * @param array      $social    پیام‌های StockTwits و Reddit
	 * @param array      $news      تیترهای خبری
	 * @param array|null $fng       شاخص ترس و طمع
	 * @param array|null $damoon    آخرین اسکن ربات برای این نماد (direction: long|short|null)
	 * @param array      $errors    خطای هر منبع
	 */
	public static function aggregate( $symbol, array $social, array $news, $fng, $damoon, array $errors, $now ) {
		$now  = (int) $now;
		$keep = function ( $i ) use ( $now ) {
			return $i['time'] > 0 && $i['time'] <= $now + 300 && $now - $i['time'] <= self::WINDOW;
		};
		$byt = function ( $a, $b ) {
			return $b['time'] <=> $a['time'];
		};

		// حذف تکراری‌ها و پیام‌های قدیمی‌تر از ۲۴ ساعت.
		$uniq = array();
		foreach ( $social as $i ) {
			if ( $keep( $i ) ) {
				$uniq[ $i['id'] ] = $i;
			}
		}
		$social = array_values( $uniq );
		usort( $social, $byt );
		$news = array_values( array_filter( $news, $keep ) );
		usort( $news, $byt );

		$by_source = array();
		foreach ( array( 'stocktwits', 'reddit' ) as $src ) {
			$items = array_values(
				array_filter(
					$social,
					function ( $i ) use ( $src ) {
						return $i['source'] === $src;
					}
				)
			);
			if ( $items || ! isset( $errors[ $src ] ) ) {
				$by_source[ $src ] = self::tally( $items ) + array( 'tagged' => 'stocktwits' === $src );
			}
		}

		$all  = self::tally( $social );
		$span = $social ? max( 3600, $now - min( array_column( $social, 'time' ) ) ) : 0;
		$all['per_hour'] = $span ? round( count( $social ) / ( $span / 3600 ), 1 ) : null;

		$crowd = null;
		if ( null !== $all['bull_pct'] ) {
			$crowd = $all['bull_pct'] >= 60 ? 'bull' : ( $all['bull_pct'] <= 40 ? 'bear' : 'mixed' );
		}
		$dir    = is_array( $damoon ) ? ( $damoon['direction'] ?? null ) : null;
		$want   = 'long' === $dir ? 'bull' : ( 'short' === $dir ? 'bear' : null );
		$versus = null;
		if ( $want && $crowd ) {
			$versus = 'mixed' === $crowd ? 'mixed' : ( $crowd === $want ? 'agree' : 'disagree' );
		}

		$aligned = $want ? array_values(
			array_filter(
				$social,
				function ( $i ) use ( $want ) {
					return $i['sentiment'] === $want && '' !== $i['text'];
				}
			)
		) : array();

		$news_tally = self::tally( $news );

		return array(
			'symbol'    => $symbol,
			'base'      => self::base_asset( $symbol ),
			'updated'   => $now,
			'damoon'    => is_array( $damoon ) ? array(
				'direction' => $dir,
				'tf'        => $damoon['tf'] ?? null,
				'strategy'  => $damoon['strategy'] ?? null,
				'price'     => $damoon['price'] ?? null,
				'decimals'  => $damoon['decimals'] ?? 2,
				'time'      => $damoon['updated'] ?? null,
			) : null,
			'social'    => $all + array( 'by_source' => $by_source ),
			'crowd'     => $crowd,
			'versus'    => $versus,
			'aligned'   => array_slice( $aligned, 0, 8 ),
			'feed'      => array_slice( $social, 0, 25 ),
			'news'      => array(
				'total'    => $news_tally['total'],
				'bull'     => $news_tally['bull'],
				'bear'     => $news_tally['bear'],
				'neutral'  => $news_tally['neutral'],
				'items'    => array_slice( $news, 0, 12 ),
			),
			'fng'       => $fng,
			'errors'    => $errors,
		);
	}

	/* ------------------------------------------------------------------ دریافت از اینترنت */

	public static function news_feeds() {
		return damoon_sig_list( damoon_sig_opt( 'pulse_news_feeds' ), false );
	}

	public static function sources() {
		return array_values( array_intersect( damoon_sig_list( damoon_sig_opt( 'pulse_sources' ), false ), array_keys( self::SOURCES ) ) );
	}

	/** آدرس واقعی یا آدرس از مسیر پراکسی (برای سرور ایران). */
	public static function route( $url ) {
		$proxy = untrailingslashit( (string) damoon_sig_opt( 'pulse_proxy' ) );
		return $proxy ? $proxy . '/fetch?url=' . rawurlencode( $url ) : $url;
	}

	/** @return string|WP_Error */
	private static function http( $url, $json = true ) {
		$res = wp_remote_get(
			self::route( $url ),
			array(
				'timeout'             => 10,
				'redirection'         => 2,
				'limit_response_size' => 2 * MB_IN_BYTES,
				'headers'             => array(
					'User-Agent' => 'DamoonSignal/' . DAMOON_SIG_VER . ' (+' . home_url( '/' ) . ')',
					'Accept'     => $json ? 'application/json' : 'application/rss+xml, application/xml, text/xml',
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		if ( 200 !== $code ) {
			return new WP_Error( 'damoon_pulse_http', 'HTTP ' . $code );
		}
		return (string) wp_remote_retrieve_body( $res );
	}

	private static function json( $url ) {
		$body = self::http( $url );
		if ( is_wp_error( $body ) ) {
			return $body;
		}
		$j = json_decode( $body, true );
		return is_array( $j ) ? $j : new WP_Error( 'damoon_pulse_json', 'پاسخ قابل خواندن نیست' );
	}

	/** شاخص ترس و طمع برای کل بازار است؛ یک بار در هر اجرا خوانده می‌شود. */
	private static function fetch_fng( array &$errors ) {
		$cached = get_transient( 'damoon_pulse_fng' );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		$j = self::json( 'https://api.alternative.me/fng/?limit=1' );
		if ( is_wp_error( $j ) ) {
			$errors['fng'] = $j->get_error_message();
			return null;
		}
		$f = self::parse_fng( $j );
		if ( $f ) {
			set_transient( 'damoon_pulse_fng', $f, HOUR_IN_SECONDS );
		}
		return $f;
	}

	/** داده‌های تازهٔ یک نماد را از همهٔ منابع فعال می‌گیرد. */
	public static function collect( $symbol ) {
		$base    = self::base_asset( $symbol );
		$kw      = self::keywords( $base );
		$enabled = self::sources();
		$social  = array();
		$news    = array();
		$errors  = array();
		$fetched = array();

		if ( ! $enabled ) {
			$errors['config'] = 'هیچ منبعی در «تنظیمات ← نبض بازار ← منابع» انتخاب نشده است.';
		}

		if ( in_array( 'stocktwits', $enabled, true ) ) {
			$j = self::json( 'https://api.stocktwits.com/api/2/streams/symbol/' . rawurlencode( $base . '.X' ) . '.json' );
			if ( is_wp_error( $j ) ) {
				$errors['stocktwits'] = $j->get_error_message();
			} else {
				$got                   = self::parse_stocktwits( $j );
				$fetched['stocktwits'] = count( $got );
				$social                = array_merge( $social, $got );
			}
		}

		if ( in_array( 'reddit', $enabled, true ) ) {
			$q = '"' . $kw[0] . '"' . ( isset( $kw[1] ) ? ' OR ' . $kw[1] : '' );
			$j = self::json( 'https://www.reddit.com/search.json?' . http_build_query( array( 'q' => $q, 'sort' => 'new', 't' => 'day', 'limit' => 50, 'raw_json' => 1 ) ) );
			if ( is_wp_error( $j ) ) {
				$errors['reddit'] = $j->get_error_message();
			} else {
				$got               = self::parse_reddit( $j );
				$fetched['reddit'] = count( $got );
				$social            = array_merge( $social, $got );
			}
		}

		if ( in_array( 'news', $enabled, true ) ) {
			$fails = array();
			foreach ( array_slice( self::news_feeds(), 0, 5 ) as $feed ) {
				$templ = false !== strpos( $feed, '{q}' );
				$url   = str_replace( '{q}', rawurlencode( $kw[0] ), $feed );
				$xml   = self::http( $url, false );
				if ( is_wp_error( $xml ) ) {
					$fails[] = wp_parse_url( $url, PHP_URL_HOST ) . ': ' . $xml->get_error_message();
					continue;
				}
				// فیدهای عمومی بر اساس نام رمزارز فیلتر می‌شوند؛ فیدهای جست‌وجو خودشان مرتبط‌اند.
				$news = array_merge( $news, self::parse_rss( $xml, $templ ? array() : $kw ) );
			}
			$fetched['news'] = count( $news );
			if ( $fails && ! $news ) {
				$errors['news'] = implode( ' | ', $fails );
			}
		}

		$fng = in_array( 'fng', $enabled, true ) ? self::fetch_fng( $errors ) : null;

		$damoon = null;
		foreach ( damoon_sig_scan_items() as $it ) {
			if ( $it['symbol'] === $symbol ) {
				$damoon = $it;
				break;
			}
		}

		$data            = self::aggregate( $symbol, $social, $news, $fng, $damoon, $errors, time() );
		$data['enabled'] = $enabled;
		// تعداد خام دریافتی از هر منبع (پیش از فیلتر ۲۴ ساعت) برای عیب‌یابی در پیشخوان.
		$data['fetched'] = $fetched + ( $fng ? array( 'fng' => 1 ) : array() );
		return $data;
	}

	/** خلاصهٔ کش‌شده؛ اگر نبود (و $fetch=true) همان لحظه گرفته می‌شود. */
	public static function get( $symbol, $fetch = true ) {
		$data = get_transient( 'damoon_pulse_' . $symbol );
		if ( is_array( $data ) ) {
			return $data;
		}
		if ( ! $fetch || get_transient( 'damoon_pulse_lock_' . $symbol ) ) {
			$stale = get_option( 'damoon_sig_pulse_last', array() );
			return isset( $stale[ $symbol ] ) ? $stale[ $symbol ] : null;
		}
		return self::refresh( $symbol );
	}

	public static function refresh( $symbol ) {
		set_transient( 'damoon_pulse_lock_' . $symbol, 1, MINUTE_IN_SECONDS );
		$data = self::collect( $symbol );
		set_transient( 'damoon_pulse_' . $symbol, $data, self::TTL );
		// آخرین دادهٔ سالم برای وقتی که همهٔ منابع موقتاً قطع‌اند.
		if ( $data['feed'] || $data['news']['items'] ) {
			$last            = (array) get_option( 'damoon_sig_pulse_last', array() );
			$last[ $symbol ] = $data;
			update_option( 'damoon_sig_pulse_last', array_slice( $last, -self::MAX_SYMS, null, true ), false );
		}
		delete_transient( 'damoon_pulse_lock_' . $symbol );
		return $data;
	}

	/** کرون ۵ دقیقه‌ای. */
	public static function run() {
		if ( ! damoon_sig_opt( 'pulse_enabled' ) ) {
			return;
		}
		foreach ( array_slice( damoon_sig_symbols(), 0, self::MAX_SYMS ) as $symbol ) {
			self::refresh( $symbol );
		}
	}
}
