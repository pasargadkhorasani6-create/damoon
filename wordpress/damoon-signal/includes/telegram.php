<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * ارسال سیگنال‌ها به کانال یا گروه تلگرام.
 */
class Damoon_Telegram {

	const STRATEGY = array(
		'mean_reversion' => 'بازگشت به میانگین',
		'trend_pullback' => 'ادامهٔ روند',
	);
	const REGIME   = array(
		'high_vol' => 'نوسان بالا',
		'normal'   => 'نوسان عادی',
		'low_vol'  => 'نوسان پایین',
	);

	public static function configured() {
		return damoon_sig_opt( 'tg_enabled' ) && damoon_sig_opt( 'tg_token' ) && damoon_sig_opt( 'tg_chat' );
	}

	/** @return true|WP_Error */
	public static function send( $text ) {
		$token = (string) damoon_sig_opt( 'tg_token' );
		$chat  = (string) damoon_sig_opt( 'tg_chat' );
		if ( ! $token || ! $chat ) {
			return new WP_Error( 'config', 'توکن یا شناسهٔ کانال تلگرام تنظیم نشده است.' );
		}
		$base = untrailingslashit( (string) damoon_sig_opt( 'tg_api_base' ) );
		$res  = wp_remote_post(
			$base . '/bot' . $token . '/sendMessage',
			array(
				'timeout' => 15,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'chat_id'                  => $chat,
						'text'                     => $text,
						'parse_mode'               => 'HTML',
						'disable_web_page_preview' => true,
					)
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return new WP_Error( 'network', 'اتصال به تلگرام برقرار نشد: ' . $res->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( 200 === $code && ! empty( $body['ok'] ) ) {
			return true;
		}
		$desc = is_array( $body ) && isset( $body['description'] ) ? (string) $body['description'] : 'HTTP ' . $code;
		// ۴۰۰ یعنی متن یا شناسهٔ کانال قابل قبول نیست؛ تکرار همان درخواست فایده ندارد.
		return new WP_Error( 400 === $code ? 'permanent' : 'telegram', 'تلگرام: ' . $desc );
	}

	public static function pair( $symbol ) {
		return preg_replace( '/(USDT|USDC|BUSD|FDUSD)$/', '/$1', $symbol );
	}

	public static function num( $v, $d ) {
		return number_format( (float) $v, (int) $d, '.', ',' );
	}

	/** متن پیام (HTML تلگرام). */
	public static function message( array $s, $event ) {
		$d    = Damoon_Market::decimals( (float) $s['entry_price'] );
		$long = 'long' === $s['direction'];
		$name = esc_html( self::pair( $s['symbol'] ) ) . ' · ' . esc_html( $s['tf'] );
		$side = $long ? 'خرید' : 'فروش';

		if ( 'closed' === $event ) {
			$icons  = array(
				'win'     => '✅',
				'loss'    => '❌',
				'expired' => '⏱',
			);
			$labels = array(
				'win'     => 'به هدف رسید',
				'loss'    => 'حد ضرر خورد',
				'expired' => 'منقضی شد',
			);
			$r      = (float) $s['r_result'];
			$lines  = array(
				( $icons[ $s['status'] ] ?? '•' ) . ' <b>' . $name . '</b> — ' . $side . ' ' . ( $labels[ $s['status'] ] ?? esc_html( $s['status'] ) ),
				'ورود: <code>' . self::num( $s['entry_price'], $d ) . '</code>',
				'خروج: <code>' . self::num( $s['exit_price'], $d ) . '</code>',
				'نتیجه: <b>' . ( $r > 0 ? '+' : '' ) . self::num( $r, 2 ) . 'R</b>',
			);
			return implode( "\n", $lines );
		}

		$lines = array(
			( $long ? '🟢' : '🔴' ) . ' <b>' . $side . ' ' . $name . '</b>',
		);
		if ( 'open' !== $s['status'] ) {
			$lines[] = '<i>(ارسال با تأخیر؛ این سیگنال دیگر باز نیست)</i>';
		}
		$lines[] = '';
		$lines[] = 'ورود: <code>' . self::num( $s['entry_price'], $d ) . '</code>';
		$lines[] = 'حد ضرر: <code>' . self::num( $s['stop_price'], $d ) . '</code>';
		$lines[] = 'هدف: <code>' . self::num( $s['target_price'], $d ) . '</code>';
		$risk    = null !== $s['risk_pct'] ? 'ریسک: ' . self::num( $s['risk_pct'], 2 ) . '٪ · ' : '';
		$lines[] = $risk . 'سود به ریسک: ' . self::num( $s['rr'], 1 );
		$lines[] = 'الگو: ' . ( self::STRATEGY[ $s['strategy'] ] ?? esc_html( $s['strategy'] ) ) . ' · ' . ( self::REGIME[ $s['regime'] ] ?? esc_html( $s['regime'] ) );
		if ( ! empty( $s['thesis'] ) ) {
			$lines[] = '';
			$lines[] = esc_html( $s['thesis'] );
		}
		$lines[] = '';
		$lines[] = '⚠️ ' . esc_html( Damoon_UI::DISCLAIMER );
		return implode( "\n", $lines );
	}
}
