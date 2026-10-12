<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * ذخیرهٔ سیگنال‌ها و ثبت خودکار نتیجه (کارنامه).
 *
 * هر ترکیب نماد + تایم‌فریم + کندل فقط یک بار ثبت می‌شود، پس درخواست‌های تکراری
 * کاربران کارنامه را باد نمی‌کند. هیچ سیگنالی از کارنامه حذف نمی‌شود.
 */
class Damoon_Store {

	const DB_VER = '1';

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'damoon_signals';
	}

	public static function maybe_install() {
		if ( get_option( 'damoon_sig_db' ) !== self::DB_VER ) {
			self::install();
		}
		if ( ! wp_next_scheduled( 'damoon_sig_evaluate' ) ) {
			wp_schedule_event( time() + 300, 'hourly', 'damoon_sig_evaluate' );
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
		update_option( 'damoon_sig_db', self::DB_VER );
	}

	/** ثبت ستاپ؛ اگر برای همین کندل قبلاً ثبت شده باشد کاری نمی‌کند. */
	public static function save( array $a ) {
		global $wpdb;
		if ( empty( $a['setup'] ) ) {
			return;
		}
		$s = $a['setup'];
		$t = self::table();
		$wpdb->query(
			$wpdb->prepare(
				"INSERT IGNORE INTO {$t}
				(symbol, tf, bar_time, direction, strategy, regime, entry_price, stop_price, target_price, rr, status, created_at)
				VALUES (%s, %s, %d, %s, %s, %s, %f, %f, %f, %f, 'open', %d)",
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
				time()
			)
		);
	}

	/**
	 * نتیجهٔ یک سیگنال روی کندل‌های بعد از آن.
	 * اگر در یک کندل هم حد ضرر و هم هدف لمس شود، محافظه‌کارانه ضرر حساب می‌شود.
	 *
	 * @return array|null [status, exit_price, r, time] یا null اگر هنوز باز است.
	 */
	public static function resolve( array $sig, array $candles, $expiry ) {
		$long  = 'long' === $sig['direction'];
		$entry = (float) $sig['entry_price'];
		$stop  = (float) $sig['stop_price'];
		$tgt   = (float) $sig['target_price'];
		$risk  = abs( $entry - $stop );
		$seen  = 0;

		foreach ( $candles as $c ) {
			if ( empty( $c['closed'] ) ) {
				continue;
			}
			$seen++;
			$hit_stop = $long ? $c['low'] <= $stop : $c['high'] >= $stop;
			$hit_tgt  = $long ? $c['high'] >= $tgt : $c['low'] <= $tgt;
			if ( $hit_stop ) {
				return array( 'loss', $stop, -1.0, $c['time'] );
			}
			if ( $hit_tgt ) {
				return array( 'win', $tgt, (float) $sig['rr'], $c['time'] );
			}
			if ( $seen >= $expiry ) {
				$r = $risk > 0 ? ( $long ? 1 : -1 ) * ( $c['close'] - $entry ) / $risk : 0.0;
				return array( 'expired', $c['close'], round( $r, 2 ), $c['time'] );
			}
		}
		return null;
	}

	/** کران ساعتی: بستن سیگنال‌های باز. */
	public static function evaluate_open() {
		global $wpdb;
		$t      = self::table();
		$expiry = max( 1, (int) damoon_sig_opt( 'expiry_bars' ) );
		$rows   = $wpdb->get_results( "SELECT * FROM {$t} WHERE status = 'open' ORDER BY id ASC LIMIT 100", ARRAY_A );

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
			$wpdb->update(
				$t,
				array(
					'status'     => $res[0],
					'exit_price' => $res[1],
					'r_result'   => $res[2],
					'closed_at'  => $res[3],
				),
				array( 'id' => (int) $sig['id'] ),
				array( '%s', '%f', '%f', '%d' ),
				array( '%d' )
			);
		}
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
			'rows'  => array_map(
				function ( $r ) {
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
				},
				(array) $rows
			),
		);
	}
}
