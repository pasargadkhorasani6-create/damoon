<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * اسکن خودکار: هر نماد در هر تایم‌فریمِ انتخاب‌شده، فقط یک بار پس از بسته‌شدن هر کندل تحلیل می‌شود.
 */
class Damoon_Scanner {

	const MAX_PER_RUN = 40;

	/** زمان شروع آخرین کندل بسته‌شده. */
	public static function last_closed_bar( $tf, $now = null ) {
		$len = Damoon_Market::TF[ $tf ];
		$now = null === $now ? time() : (int) $now;
		return (int) ( floor( $now / $len ) * $len - $len );
	}

	/**
	 * @param bool $force اگر true باشد بدون توجه به تنظیم «اسکن خودکار» و کندل‌های قبلاً بررسی‌شده اجرا می‌شود.
	 * @return array [checked, created, errors]
	 */
	public static function run( $force = false ) {
		$force = true === $force;
		$stats = array(
			'checked' => 0,
			'created' => 0,
			'errors'  => 0,
		);
		if ( ! $force && ! damoon_sig_opt( 'auto_scan' ) ) {
			return $stats;
		}
		if ( get_transient( 'damoon_scan_lock' ) ) {
			return $stats;
		}
		set_transient( 'damoon_scan_lock', 1, 5 * MINUTE_IN_SECONDS );

		$done = (array) get_option( 'damoon_sig_scan_state', array() );
		$tfs  = damoon_sig_scan_tfs();
		foreach ( damoon_sig_symbols() as $symbol ) {
			foreach ( $tfs as $tf ) {
				$key = $symbol . '|' . $tf;
				$bar = self::last_closed_bar( $tf );
				if ( ! $force && isset( $done[ $key ] ) && (int) $done[ $key ] >= $bar ) {
					continue;
				}
				if ( $stats['checked'] >= self::MAX_PER_RUN ) {
					break 2; // بقیه در اجرای بعدی.
				}
				$stats['checked']++;
				$a = Damoon_Engine::analyze( $symbol, $tf );
				if ( is_wp_error( $a ) ) {
					$stats['errors']++;
					continue; // کندل علامت نمی‌خورد تا دفعهٔ بعد دوباره امتحان شود.
				}
				set_transient( 'damoon_a_' . $symbol . '_' . $tf, $a, 60 );
				if ( Damoon_Store::save( $a, 'scan' ) ) {
					$stats['created']++;
				}
				// اگر منبع داده هنوز کندل آخر را بسته اعلام نکرده باشد، اجرای بعدی دوباره بررسی می‌کند.
				$done[ $key ] = (int) $a['bar_time'];
			}
		}
		update_option( 'damoon_sig_scan_state', $done, false );
		update_option( 'damoon_sig_scan_last', array_merge( $stats, array( 'time' => time() ) ), false );
		delete_transient( 'damoon_scan_lock' );
		return $stats;
	}
}
