<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * صف پایدار ارسال (تلگرام و سایت دامون).
 *
 * رویدادها اول در دیتابیس ثبت و بعد در پس‌زمینه ارسال می‌شوند؛ قطعی شبکه یا
 * خطای موقت باعث گم‌شدن پیام نمی‌شود و ارسال با فاصلهٔ رو به افزایش تکرار می‌شود.
 * هر (کانال، سیگنال، رویداد) فقط یک بار در صف قرار می‌گیرد.
 */
class Damoon_Outbox {

	const MAX_ATTEMPTS = 12;
	const BATCH        = 20;

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'damoon_outbox';
	}

	public static function install() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$t       = self::table();
		$charset = $wpdb->get_charset_collate();
		dbDelta(
			"CREATE TABLE {$t} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			channel varchar(8) NOT NULL,
			signal_id bigint(20) unsigned NOT NULL,
			event varchar(8) NOT NULL,
			status varchar(8) NOT NULL DEFAULT 'pending',
			attempts smallint(5) unsigned NOT NULL DEFAULT 0,
			next_at int(10) unsigned NOT NULL DEFAULT 0,
			last_error varchar(255) DEFAULT NULL,
			created_at int(10) unsigned NOT NULL,
			sent_at int(10) unsigned DEFAULT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY job (channel,signal_id,event),
			KEY status (status,next_at)
			) {$charset};"
		);
	}

	/** کانال‌های فعال برای هر رویداد. */
	public static function channels( $event ) {
		$out = array();
		if ( Damoon_Telegram::configured() && ( 'new' === $event || damoon_sig_opt( 'tg_on_close' ) ) ) {
			$out[] = 'tg';
		}
		if ( Damoon_Bridge::configured() ) {
			$out[] = 'site';
		}
		return $out;
	}

	public static function on_created( $signal_id ) {
		self::enqueue( (int) $signal_id, 'new' );
	}

	public static function on_closed( $signal_id ) {
		self::enqueue( (int) $signal_id, 'closed' );
	}

	public static function enqueue( $signal_id, $event ) {
		global $wpdb;
		$t     = self::table();
		$added = false;
		foreach ( self::channels( $event ) as $ch ) {
			// بستن سیگنالی که خودش هیچ‌وقت به این کانال نرفته معنی ندارد (مثلاً سیگنال‌های قبل از فعال‌سازی کانال).
			if ( 'closed' === $event && ! self::has( $ch, $signal_id, 'new' ) ) {
				continue;
			}
			$n = $wpdb->query(
				$wpdb->prepare(
					"INSERT IGNORE INTO {$t} (channel, signal_id, event, status, attempts, next_at, created_at) VALUES (%s, %d, %s, 'pending', 0, %d, %d)",
					$ch,
					$signal_id,
					$event,
					time(),
					time()
				)
			);
			$added = $added || 1 === (int) $n;
		}
		if ( $added && ! wp_next_scheduled( 'damoon_sig_outbox_now' ) ) {
			// اجرای فوری در درخواست بعدی کرون؛ کرون ۵ دقیقه‌ای پشتیبان آن است.
			wp_schedule_single_event( time(), 'damoon_sig_outbox_now' );
		}
	}

	private static function has( $channel, $signal_id, $event ) {
		global $wpdb;
		$t = self::table();
		return (bool) $wpdb->get_var(
			$wpdb->prepare( "SELECT id FROM {$t} WHERE channel = %s AND signal_id = %d AND event = %s", $channel, $signal_id, $event )
		);
	}

	/** پردازش صف. تعداد پیام‌های ارسال‌شده را برمی‌گرداند. */
	public static function run() {
		global $wpdb;
		// قفل ساده تا دو اجرای هم‌زمان یک پیام را دو بار نفرستند.
		if ( get_transient( 'damoon_outbox_lock' ) ) {
			return 0;
		}
		set_transient( 'damoon_outbox_lock', 1, 2 * MINUTE_IN_SECONDS );

		$t    = self::table();
		$rows = $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$t} WHERE status = 'pending' AND next_at <= %d ORDER BY id ASC LIMIT %d", time(), self::BATCH ),
			ARRAY_A
		);
		$sent = 0;
		foreach ( (array) $rows as $job ) {
			// «بسته‌شد» قبل از «جدید» همان کانال ارسال نمی‌شود.
			if ( 'closed' === $job['event'] && ! self::is_sent( $job['channel'], (int) $job['signal_id'], 'new' ) ) {
				if ( 'dead' === self::status_of( $job['channel'], (int) $job['signal_id'], 'new' ) ) {
					self::fail( $job, 'پیام «سیگنال جدید» ارسال نشد.', true );
				} else {
					$wpdb->update(
						$t,
						array(
							'next_at'    => time() + MINUTE_IN_SECONDS,
							'last_error' => 'منتظر ارسال پیام «سیگنال جدید»',
						),
						array( 'id' => (int) $job['id'] )
					);
				}
				continue;
			}
			$res = self::deliver( $job );
			if ( true === $res ) {
				$wpdb->update(
					$t,
					array(
						'status'     => 'sent',
						'attempts'   => (int) $job['attempts'] + 1,
						'sent_at'    => time(),
						'last_error' => null,
					),
					array( 'id' => (int) $job['id'] )
				);
				$sent++;
			} else {
				self::fail( $job, $res->get_error_message(), 'permanent' === $res->get_error_code() );
			}
		}
		delete_transient( 'damoon_outbox_lock' );
		return $sent;
	}

	/** @return true|WP_Error کد خطای permanent یعنی تلاش دوباره فایده ندارد. */
	private static function deliver( array $job ) {
		$sig = Damoon_Store::get( (int) $job['signal_id'] );
		if ( ! $sig ) {
			return new WP_Error( 'permanent', 'سیگنال پیدا نشد.' );
		}
		if ( 'closed' === $job['event'] && 'open' === $sig['status'] ) {
			return new WP_Error( 'permanent', 'سیگنال هنوز باز است.' );
		}
		if ( 'tg' === $job['channel'] ) {
			return Damoon_Telegram::send( Damoon_Telegram::message( $sig, $job['event'] ) );
		}
		if ( 'site' === $job['channel'] ) {
			return Damoon_Bridge::send_event( Damoon_Bridge::payload( $sig, $job['event'] ) );
		}
		return new WP_Error( 'permanent', 'کانال نامعتبر.' );
	}

	private static function fail( array $job, $error, $permanent ) {
		global $wpdb;
		$attempts = (int) $job['attempts'] + 1;
		$dead     = $permanent || $attempts >= self::MAX_ATTEMPTS;
		$wpdb->update(
			self::table(),
			array(
				'status'     => $dead ? 'dead' : 'pending',
				'attempts'   => $attempts,
				// ۱، ۲، ۴، … دقیقه، حداکثر ۶ ساعت.
				'next_at'    => time() + min( 6 * HOUR_IN_SECONDS, MINUTE_IN_SECONDS * ( 2 ** ( $attempts - 1 ) ) ),
				'last_error' => mb_substr( (string) $error, 0, 250 ),
			),
			array( 'id' => (int) $job['id'] )
		);
	}

	private static function status_of( $channel, $signal_id, $event ) {
		global $wpdb;
		$t = self::table();
		return $wpdb->get_var(
			$wpdb->prepare( "SELECT status FROM {$t} WHERE channel = %s AND signal_id = %d AND event = %s", $channel, $signal_id, $event )
		);
	}

	private static function is_sent( $channel, $signal_id, $event ) {
		return 'sent' === self::status_of( $channel, $signal_id, $event );
	}

	/** بازگرداندن پیام‌های شکست‌خورده به صف. */
	public static function retry_dead() {
		global $wpdb;
		$t = self::table();
		return (int) $wpdb->query(
			$wpdb->prepare( "UPDATE {$t} SET status = 'pending', attempts = 0, next_at = %d WHERE status = 'dead'", time() )
		);
	}

	public static function counts() {
		global $wpdb;
		$t   = self::table();
		$out = array(
			'pending' => 0,
			'sent'    => 0,
			'dead'    => 0,
		);
		foreach ( (array) $wpdb->get_results( "SELECT status, COUNT(*) AS n FROM {$t} GROUP BY status", ARRAY_A ) as $r ) {
			$out[ $r['status'] ] = (int) $r['n'];
		}
		return $out;
	}

	public static function recent( $limit = 50, $status = '' ) {
		global $wpdb;
		$t = self::table();
		if ( in_array( $status, array( 'pending', 'sent', 'dead' ), true ) ) {
			return (array) $wpdb->get_results(
				$wpdb->prepare( "SELECT * FROM {$t} WHERE status = %s ORDER BY id DESC LIMIT %d", $status, $limit ),
				ARRAY_A
			);
		}
		return (array) $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$t} ORDER BY id DESC LIMIT %d", $limit ), ARRAY_A );
	}
}

add_action( 'damoon_sig_outbox_now', array( 'Damoon_Outbox', 'run' ) );
