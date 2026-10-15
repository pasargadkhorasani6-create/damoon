<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * ذخیرهٔ سیگنال‌ها و ثبت خودکار نتیجه (کارنامه).
 *
 * هر ترکیب نماد + تایم‌فریم + کندل فقط یک بار ثبت می‌شود، و تا وقتی سیگنالِ بازی
 * برای همان نماد و تایم‌فریم وجود دارد سیگنال تازه‌ای ثبت نمی‌شود؛ پس درخواست‌های
 * تکراری کاربران و اسکن خودکار کارنامه را باد نمی‌کنند. هیچ سیگنالی از کارنامه حذف نمی‌شود.
 */
class Damoon_Store {

	const DB_VER = '2';

	const STATUSES = array( 'open', 'win', 'loss', 'expired' );

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'damoon_signals';
	}

	public static function maybe_install() {
		if ( get_option( 'damoon_sig_db' ) !== self::DB_VER ) {
			self::install();
		}
		damoon_sig_schedule();
		if ( get_option( 'damoon_sig_ver' ) !== DAMOON_SIG_VER ) {
			update_option( 'damoon_sig_ver', DAMOON_SIG_VER );
			// بعد از نصب یا به‌روزرسانی، اولین اسکن بلافاصله انجام شود تا صفحه‌ها خالی نمانند.
			wp_schedule_single_event( time(), 'damoon_sig_scan' );
			wp_schedule_single_event( time() + 30, 'damoon_sig_pulse' );
		}
	}

	public static function install() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$t       = self::table();
		$charset = $wpdb->get_charset_collate();
		dbDelta(
			"CREATE TABLE {$t} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			symbol varchar(20) NOT NULL,
			tf varchar(4) NOT NULL,
			bar_time int(10) unsigned NOT NULL,
			direction varchar(5) NOT NULL,
			strategy varchar(30) NOT NULL,
			regime varchar(12) NOT NULL,
			entry_price double NOT NULL,
			stop_price double NOT NULL,
			target_price double NOT NULL,
			rr float NOT NULL,
			risk_pct float DEFAULT NULL,
			thesis text,
			source varchar(8) NOT NULL DEFAULT 'user',
			status varchar(8) NOT NULL DEFAULT 'open',
			exit_price double DEFAULT NULL,
			r_result float DEFAULT NULL,
			closed_at int(10) unsigned DEFAULT NULL,
			created_at int(10) unsigned NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY sig (symbol,tf,bar_time),
			KEY status (status)
			) {$charset};"
		);
		Damoon_Outbox::install();
		update_option( 'damoon_sig_db', self::DB_VER );
	}

	/**
	 * ثبت ستاپ.
	 *
	 * @return int شناسهٔ سیگنال تازه، یا ۰ اگر ثبت نشد (بدون ستاپ، تکراری، یا سیگنال باز موجود).
	 */
	public static function save( array $a, $source = 'user' ) {
		global $wpdb;
		if ( empty( $a['setup'] ) ) {
			return 0;
		}
		$s = $a['setup'];
		$t = self::table();

		$open = $wpdb->get_var(
			$wpdb->prepare( "SELECT id FROM {$t} WHERE symbol = %s AND tf = %s AND status = 'open' LIMIT 1", $a['symbol'], $a['tf'] )
		);
		if ( $open ) {
			return 0;
		}

		$inserted = $wpdb->query(
			$wpdb->prepare(
				"INSERT IGNORE INTO {$t}
				(symbol, tf, bar_time, direction, strategy, regime, entry_price, stop_price, target_price, rr, risk_pct, thesis, source, status, created_at)
				VALUES (%s, %s, %d, %s, %s, %s, %f, %f, %f, %f, %f, %s, %s, 'open', %d)",
				$a['symbol'],
				$a['tf'],
				$a['bar_time'],
				$s['direction'],
				$s['strategy'],
				$a['regime'],
				$s['entry'],
				$s['stop'],
				$s['target'],
				$s['rr'],
				$s['risk_pct'],
				(string) $a['thesis'],
				'scan' === $source ? 'scan' : 'user',
				time()
			)
		);
		if ( 1 !== (int) $inserted || ! $wpdb->insert_id ) {
			return 0;
		}
		$id = (int) $wpdb->insert_id;
		do_action( 'damoon_sig_created', $id );
		return $id;
	}

	public static function get( $id ) {
		global $wpdb;
		$t = self::table();
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE id = %d", $id ), ARRAY_A );
	}

	/**
	 * نتیجهٔ یک سیگنال روی کندل‌های بعد از آن.
	 * اگر در یک کندل هم حد ضرر و هم هدف لمس شود، محافظه‌کارانه ضرر حساب می‌شود.
	 * زمان برگشتی، زمان بسته‌شدن کندلی است که نتیجه در آن مشخص شد.
	 *
	 * @return array|null [status, exit_price, r, time] یا null اگر هنوز باز است.
	 */
	public static function resolve( array $sig, array $candles, $expiry ) {
		$long  = 'long' === $sig['direction'];
		$entry = (float) $sig['entry_price'];
		$stop  = (float) $sig['stop_price'];
		$tgt   = (float) $sig['target_price'];
		$risk  = abs( $entry - $stop );
		$len   = Damoon_Market::TF[ $sig['tf'] ] ?? 0;
		$seen  = 0;

		foreach ( $candles as $c ) {
			if ( empty( $c['closed'] ) ) {
				continue;
			}
			$seen++;
			$end      = $c['time'] + $len;
			$hit_stop = $long ? $c['low'] <= $stop : $c['high'] >= $stop;
			$hit_tgt  = $long ? $c['high'] >= $tgt : $c['low'] <= $tgt;
			if ( $hit_stop ) {
				return array( 'loss', $stop, -1.0, $end );
			}
			if ( $hit_tgt ) {
				return array( 'win', $tgt, (float) $sig['rr'], $end );
			}
			if ( $seen >= $expiry ) {
				$r = $risk > 0 ? ( $long ? 1 : -1 ) * ( $c['close'] - $entry ) / $risk : 0.0;
				return array( 'expired', $c['close'], round( $r, 2 ), $end );
			}
		}
		return null;
	}

	/** کرون ساعتی: بستن سیگنال‌های باز. تعداد سیگنال‌های بسته‌شده را برمی‌گرداند. */
	public static function evaluate_open() {
		global $wpdb;
		$t      = self::table();
		$expiry = max( 1, (int) damoon_sig_opt( 'expiry_bars' ) );
		$rows   = $wpdb->get_results( "SELECT * FROM {$t} WHERE status = 'open' ORDER BY id ASC LIMIT 100", ARRAY_A );
		$closed = 0;

		foreach ( (array) $rows as $sig ) {
			if ( ! isset( Damoon_Market::TF[ $sig['tf'] ] ) ) {
				continue;
			}
			$start   = ( (int) $sig['bar_time'] + Damoon_Market::TF[ $sig['tf'] ] ) * 1000;
			$candles = Damoon_Market::klines( $sig['symbol'], $sig['tf'], min( 1000, $expiry + 5 ), $start );
			if ( is_wp_error( $candles ) ) {
				continue; // داده نرسید؛ دفعهٔ بعد دوباره تلاش می‌شود.
			}
			$res = self::resolve( $sig, $candles, $expiry );
			if ( null === $res ) {
				continue;
			}
			// شرط status در WHERE: اگر دو اجرای کرون هم‌زمان باشند، فقط یکی سیگنال را می‌بندد.
			$done = $wpdb->query(
				$wpdb->prepare(
					"UPDATE {$t} SET status = %s, exit_price = %f, r_result = %f, closed_at = %d WHERE id = %d AND status = 'open'",
					$res[0],
					$res[1],
					$res[2],
					$res[3],
					(int) $sig['id']
				)
			);
			if ( 1 === (int) $done ) {
				$closed++;
				do_action( 'damoon_sig_closed', (int) $sig['id'] );
			}
		}
		return $closed;
	}

	public static function record( $limit = 50 ) {
		global $wpdb;
		$t     = self::table();
		$stats = $wpdb->get_row(
			"SELECT
				COUNT(*) AS total,
				SUM(status = 'open') AS open_n,
				SUM(status = 'win') AS wins,
				SUM(status = 'loss') AS losses,
				SUM(status = 'expired') AS expired,
				SUM(CASE WHEN status <> 'open' THEN r_result ELSE 0 END) AS sum_r
			FROM {$t}",
			ARRAY_A
		);
		$stats  = array_map( 'floatval', (array) $stats );
		$closed = $stats['wins'] + $stats['losses'] + $stats['expired'];

		$rows = $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$t} ORDER BY id DESC LIMIT %d", $limit ),
			ARRAY_A
		);

		return array(
			'stats' => array(
				'total'    => (int) $stats['total'],
				'open'     => (int) $stats['open_n'],
				'closed'   => (int) $closed,
				'wins'     => (int) $stats['wins'],
				'losses'   => (int) $stats['losses'],
				'expired'  => (int) $stats['expired'],
				'sum_r'    => round( $stats['sum_r'], 2 ),
				// زیر ۳۰ معاملهٔ بسته، نرخ برد و میانگین اعلام نمی‌شود.
				'win_rate' => $closed >= 30 ? round( $stats['wins'] / $closed * 100, 1 ) : null,
				'avg_r'    => $closed >= 30 ? round( $stats['sum_r'] / $closed, 2 ) : null,
				'min_n'    => 30,
			),
			'curve' => self::curve(),
			'rows'  => array_map( array( __CLASS__, 'public_row' ), (array) $rows ),
		);
	}

	/** منحنی تجمعی R روی سیگنال‌های بسته، به ترتیب زمان بسته‌شدن. */
	public static function curve( $max_points = 500 ) {
		global $wpdb;
		$t    = self::table();
		$rows = $wpdb->get_results(
			"SELECT closed_at, r_result FROM {$t} WHERE status <> 'open' AND r_result IS NOT NULL ORDER BY closed_at ASC, id ASC",
			ARRAY_A
		);
		$sum = 0.0;
		$pts = array();
		foreach ( (array) $rows as $r ) {
			$sum  += (float) $r['r_result'];
			$pts[] = array(
				'time' => (int) $r['closed_at'],
				'r'    => round( $sum, 2 ),
			);
		}
		$n = count( $pts );
		if ( $n > $max_points ) {
			// نمونه‌برداری یکنواخت؛ آخرین نقطه همیشه حفظ می‌شود.
			$step = $n / $max_points;
			$out  = array();
			for ( $k = 0; $k < $max_points - 1; $k++ ) {
				$out[] = $pts[ (int) floor( $k * $step ) ];
			}
			$out[] = $pts[ $n - 1 ];
			$pts   = $out;
		}
		return $pts;
	}

	public static function public_row( array $r ) {
		return array(
			'symbol'    => $r['symbol'],
			'tf'        => $r['tf'],
			'direction' => $r['direction'],
			'strategy'  => $r['strategy'],
			'entry'     => (float) $r['entry_price'],
			'stop'      => (float) $r['stop_price'],
			'target'    => (float) $r['target_price'],
			'status'    => $r['status'],
			'r'         => null === $r['r_result'] ? null : (float) $r['r_result'],
			'time'      => (int) $r['bar_time'] + ( Damoon_Market::TF[ $r['tf'] ] ?? 0 ),
			'decimals'  => Damoon_Market::decimals( (float) $r['entry_price'] ),
		);
	}

	/**
	 * جست‌وجو برای پنل مدیریت.
	 *
	 * @return array [rows, total]
	 */
	public static function query( array $f, $per_page = 50, $page = 1 ) {
		global $wpdb;
		$t      = self::table();
		$where  = array( '1=1' );
		$params = array();
		if ( ! empty( $f['status'] ) && in_array( $f['status'], self::STATUSES, true ) ) {
			$where[]  = 'status = %s';
			$params[] = $f['status'];
		}
		if ( ! empty( $f['symbol'] ) ) {
			$where[]  = 'symbol = %s';
			$params[] = $f['symbol'];
		}
		if ( ! empty( $f['tf'] ) && isset( Damoon_Market::TF[ $f['tf'] ] ) ) {
			$where[]  = 'tf = %s';
			$params[] = $f['tf'];
		}
		if ( ! empty( $f['source'] ) && in_array( $f['source'], array( 'user', 'scan' ), true ) ) {
			$where[]  = 'source = %s';
			$params[] = $f['source'];
		}
		$w   = implode( ' AND ', $where );
		$cnt = "SELECT COUNT(*) FROM {$t} WHERE {$w}";
		$sel = "SELECT * FROM {$t} WHERE {$w} ORDER BY id DESC LIMIT %d OFFSET %d";

		$total = (int) ( $params ? $wpdb->get_var( $wpdb->prepare( $cnt, $params ) ) : $wpdb->get_var( $cnt ) );
		$rows  = $wpdb->get_results(
			$wpdb->prepare( $sel, array_merge( $params, array( (int) $per_page, max( 0, ( (int) $page - 1 ) * (int) $per_page ) ) ) ),
			ARRAY_A
		);
		return array( (array) $rows, $total );
	}
}
