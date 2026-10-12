<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Damoon_Rest {

	public static function register() {
		$market_args = array(
			'symbol' => array(
				'required'          => true,
				'sanitize_callback' => function ( $v ) {
					return strtoupper( sanitize_text_field( $v ) );
				},
				'validate_callback' => function ( $v ) {
					return in_array( strtoupper( (string) $v ), damoon_sig_symbols(), true );
				},
			),
			'tf'     => array(
				'default'           => '1h',
				'validate_callback' => function ( $v ) {
					return isset( Damoon_Market::TF[ $v ] );
				},
			),
		);

		register_rest_route(
			'damoon/v1',
			'/candles',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'candles' ),
				'permission_callback' => '__return_true',
				'args'                => $market_args,
			)
		);
		register_rest_route(
			'damoon/v1',
			'/setup',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'setup' ),
				'permission_callback' => '__return_true',
				'args'                => $market_args,
			)
		);
		register_rest_route(
			'damoon/v1',
			'/record',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'record' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	public static function candles( WP_REST_Request $req ) {
		$symbol = $req['symbol'];
		$tf     = $req['tf'];
		$key    = 'damoon_c_' . $symbol . '_' . $tf;
		$data   = get_transient( $key );

		if ( false === $data ) {
			$candles = Damoon_Market::klines( $symbol, $tf, 300 );
			if ( is_wp_error( $candles ) ) {
				return $candles;
			}
			$ema  = Damoon_Market::ema( array_column( $candles, 'close' ), 20 );
			$line = array();
			foreach ( $candles as $i => $c ) {
				if ( null !== $ema[ $i ] ) {
					$line[] = array(
						'time'  => $c['time'],
						'value' => $ema[ $i ],
					);
				}
			}
			$last = end( $candles );
			$data = array(
				'candles'  => $candles,
				'ema20'    => $line,
				'decimals' => $last ? Damoon_Market::decimals( $last['close'] ) : 2,
			);
			set_transient( $key, $data, 30 );
		}
		return rest_ensure_response( $data );
	}

	public static function setup( WP_REST_Request $req ) {
		$quota = self::quota();
		if ( $quota['used'] >= $quota['limit'] ) {
			return new WP_Error(
				'damoon_quota',
				is_user_logged_in() ? 'سهمیهٔ امروز شما تمام شده است.' : 'سهمیهٔ امروز مهمان تمام شده است. برای سهمیهٔ بیشتر وارد شوید.',
				array( 'status' => 429 )
			);
		}

		$symbol = $req['symbol'];
		$tf     = $req['tf'];
		$key    = 'damoon_a_' . $symbol . '_' . $tf;
		$a      = get_transient( $key );

		if ( false === $a ) {
			$a = Damoon_Engine::analyze( $symbol, $tf );
			if ( is_wp_error( $a ) ) {
				return $a;
			}
			set_transient( $key, $a, 60 );
			Damoon_Store::save( $a );
		}

		self::consume( $quota );
		$a['quota'] = array(
			'used'  => $quota['used'] + 1,
			'limit' => $quota['limit'],
		);
		return rest_ensure_response( $a );
	}

	public static function record() {
		return rest_ensure_response( Damoon_Store::record() );
	}

	/* ---------- سهمیهٔ روزانه ---------- */

	private static function guest_key() {
		// فقط REMOTE_ADDR؛ هدرهای فورواردشده قابل جعل‌اند.
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '0';
		return 'damoon_q_' . md5( $ip . '|' . wp_date( 'Y-m-d' ) . '|' . wp_salt( 'nonce' ) );
	}

	public static function quota() {
		$today = wp_date( 'Y-m-d' );
		if ( is_user_logged_in() ) {
			$m = get_user_meta( get_current_user_id(), 'damoon_sig_quota', true );
			return array(
				'used'  => ( is_array( $m ) && ( $m['d'] ?? '' ) === $today ) ? (int) $m['n'] : 0,
				'limit' => (int) damoon_sig_opt( 'user_limit' ),
			);
		}
		return array(
			'used'  => (int) get_transient( self::guest_key() ),
			'limit' => (int) damoon_sig_opt( 'guest_limit' ),
		);
	}

	private static function consume( array $quota ) {
		$n = $quota['used'] + 1;
		if ( is_user_logged_in() ) {
			update_user_meta(
				get_current_user_id(),
				'damoon_sig_quota',
				array(
					'd' => wp_date( 'Y-m-d' ),
					'n' => $n,
				)
			);
		} else {
			set_transient( self::guest_key(), $n, DAY_IN_SECONDS );
		}
	}
}
