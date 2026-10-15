<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * ارسال سیگنال‌ها به سایت دامون (Next.js) از طریق API امضاشدهٔ ربات.
 *
 * امضا دقیقاً مثل web/src/lib/bot/hmac.ts:
 *   canonical   = "{timestamp}\n{nonce}\n{METHOD}\n{path}\n{sha256hex(body)}"
 *   X-Signature = hex(HMAC-SHA256(secret, canonical))
 */
class Damoon_Bridge {

	public static function configured() {
		return damoon_sig_opt( 'site_enabled' ) && damoon_sig_opt( 'site_url' ) && damoon_sig_opt( 'site_key_id' ) && strlen( (string) damoon_sig_opt( 'site_secret' ) ) >= 32;
	}

	public static function canonical( $ts, $nonce, $method, $path, $body ) {
		return $ts . "\n" . $nonce . "\n" . strtoupper( $method ) . "\n" . $path . "\n" . hash( 'sha256', $body );
	}

	public static function sign( $secret, $ts, $nonce, $method, $path, $body ) {
		return hash_hmac( 'sha256', self::canonical( $ts, $nonce, $method, $path, $body ), $secret );
	}

	/**
	 * شناسهٔ یکتا در سایت. پیشوند تصادفی هر نصب جلوی تداخل شناسهٔ چند سایت وردپرسی
	 * (یا نصب دوباره با جدول خالی) روی یک سایت دامون را می‌گیرد.
	 */
	public static function external_id( $signal_id ) {
		$uid = get_option( 'damoon_sig_uid' );
		if ( ! $uid ) {
			$uid = substr( bin2hex( random_bytes( 4 ) ), 0, 8 );
			add_option( 'damoon_sig_uid', $uid, '', false );
			$uid = get_option( 'damoon_sig_uid' );
		}
		return 'wp:' . $uid . ':' . (int) $signal_id;
	}

	/** بدنهٔ رویداد طبق web/src/lib/signals/schemas.ts */
	public static function payload( array $s, $event ) {
		$len = Damoon_Market::TF[ $s['tf'] ] ?? 0;
		if ( 'closed' === $event ) {
			$reasons = array(
				'win'     => 'TP',
				'loss'    => 'SL',
				'expired' => 'MANUAL',
			);
			return array(
				'type'       => 'signal.closed',
				'externalId' => self::external_id( $s['id'] ),
				'exitPrice'  => (float) $s['exit_price'],
				'reason'     => $reasons[ $s['status'] ] ?? 'UNKNOWN',
				'at'         => (int) $s['closed_at'],
			);
		}
		$labels = Damoon_Telegram::STRATEGY;
		return array(
			'type'       => 'signal.new',
			'externalId' => self::external_id( $s['id'] ),
			'symbol'     => $s['symbol'],
			'direction'  => 'long' === $s['direction'] ? 'BUY' : 'SELL',
			// ورود با قیمت بسته‌شدن کندل سیگنال است، پس سفارش بازار حساب می‌شود.
			'orderType'  => 'MARKET',
			'entry'      => (float) $s['entry_price'],
			'stopLoss'   => (float) $s['stop_price'],
			'takeProfit' => (float) $s['target_price'],
			'timeframe'  => $s['tf'],
			'digits'     => Damoon_Market::decimals( (float) $s['entry_price'] ),
			'signalAt'   => (int) $s['bar_time'] + $len,
			'comment'    => 'Damoon WP · ' . ( $labels[ $s['strategy'] ] ?? $s['strategy'] ),
		);
	}

	/** @return array|WP_Error پاسخ خام wp_remote_request */
	public static function request( $method, $path, $body = '' ) {
		$url    = untrailingslashit( (string) damoon_sig_opt( 'site_url' ) ) . $path;
		$parsed = wp_parse_url( $url );
		$ts     = (string) time();
		$nonce  = bin2hex( random_bytes( 16 ) );
		$sig    = self::sign( (string) damoon_sig_opt( 'site_secret' ), $ts, $nonce, $method, $parsed['path'] ?? $path, $body );

		$args = array(
			'method'  => $method,
			'timeout' => 15,
			'headers' => array(
				'X-Api-Key'   => (string) damoon_sig_opt( 'site_key_id' ),
				'X-Timestamp' => $ts,
				'X-Nonce'     => $nonce,
				'X-Signature' => $sig,
			),
		);
		if ( 'GET' !== $method ) {
			$args['headers']['Content-Type'] = 'application/json';
			$args['body']                    = $body;
		}
		return wp_remote_request( $url, $args );
	}

	/** @return true|WP_Error */
	public static function send_event( array $payload ) {
		$body = wp_json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
		$res  = self::request( 'POST', '/api/bot/events', $body );
		if ( is_wp_error( $res ) ) {
			return new WP_Error( 'network', 'اتصال به سایت برقرار نشد: ' . $res->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		if ( 200 === $code || 201 === $code ) {
			return true;
		}
		$json = json_decode( wp_remote_retrieve_body( $res ), true );
		$msg  = 'سایت: HTTP ' . $code . ( is_array( $json ) && isset( $json['error'] ) ? ' — ' . $json['error'] : '' );
		// ۴۰۹ و ۴۲۲ یعنی سایت این رویداد را هرگز نمی‌پذیرد. ۴۰۱ (کلید یا ساعت) و ۴۰۴ (سیگنال هنوز نرسیده) قابل اصلاح‌اند.
		return new WP_Error( in_array( $code, array( 409, 413, 422 ), true ) ? 'permanent' : 'site', $msg );
	}

	/** بررسی کلید، امضا و اختلاف ساعت با /api/bot/health */
	public static function health() {
		$res = self::request( 'GET', '/api/bot/health' );
		if ( is_wp_error( $res ) ) {
			return new WP_Error( 'network', 'اتصال به سایت برقرار نشد: ' . $res->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$json = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( 200 !== $code || empty( $json['ok'] ) ) {
			return new WP_Error( 'site', 'سایت: HTTP ' . $code . ( isset( $json['error'] ) ? ' — ' . $json['error'] : '' ) );
		}
		$skew = isset( $json['serverTime'] ) ? (int) $json['serverTime'] - time() : 0;
		return sprintf( 'اتصال برقرار است (کلید %s، اختلاف ساعت %d ثانیه).', $json['keyId'] ?? '', $skew );
	}
}
