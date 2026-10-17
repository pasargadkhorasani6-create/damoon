<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * پنل مدیریت: فهرست سیگنال‌ها، صف ارسال، تنظیمات و ابزارهای تست.
 */
class Damoon_Admin {

	const CAP  = 'manage_options';
	const SLUG = 'damoon-signal';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'settings' ) );
		add_action( 'admin_post_damoon_sig', array( __CLASS__, 'action' ) );
		add_action( 'admin_notices', array( __CLASS__, 'notices' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( DAMOON_SIG_DIR . 'damoon-signal.php' ), array( __CLASS__, 'links' ) );
	}

	public static function links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=' . self::SLUG . '-settings' ) ) . '">تنظیمات</a>' );
		return $links;
	}

	public static function menu() {
		add_menu_page( 'Damoon Signal', 'دامون سیگنال', self::CAP, self::SLUG, array( __CLASS__, 'page_signals' ), 'dashicons-chart-line', 58 );
		add_submenu_page( self::SLUG, 'سیگنال‌ها', 'سیگنال‌ها', self::CAP, self::SLUG, array( __CLASS__, 'page_signals' ) );
		add_submenu_page( self::SLUG, 'صف ارسال', 'صف ارسال', self::CAP, self::SLUG . '-outbox', array( __CLASS__, 'page_outbox' ) );
		add_submenu_page( self::SLUG, 'نبض بازار', 'نبض بازار', self::CAP, self::SLUG . '-pulse', array( __CLASS__, 'page_pulse' ) );
		add_submenu_page( self::SLUG, 'تنظیمات', 'تنظیمات', self::CAP, self::SLUG . '-settings', array( __CLASS__, 'page_settings' ) );
	}

	/* ---------- عملیات (admin-post.php) ---------- */

	private static function action_url( $do, array $extra = array() ) {
		return wp_nonce_url(
			add_query_arg( array_merge( array( 'action' => 'damoon_sig', 'do' => $do ), $extra ), admin_url( 'admin-post.php' ) ),
			'damoon_sig_' . $do
		);
	}

	private static function button( $do, $label, $primary = false ) {
		printf(
			'<a class="button%s" href="%s">%s</a> ',
			$primary ? ' button-primary' : '',
			esc_url( self::action_url( $do ) ),
			esc_html( $label )
		);
	}

	private static function flash( $msg, $type = 'success' ) {
		set_transient(
			'damoon_sig_flash_' . get_current_user_id(),
			array(
				'msg'  => $msg,
				'type' => $type,
			),
			60
		);
	}

	public static function notices() {
		$key = 'damoon_sig_flash_' . get_current_user_id();
		$f   = get_transient( $key );
		if ( $f ) {
			delete_transient( $key );
			printf( '<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr( $f['type'] ), esc_html( $f['msg'] ) );
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		$ours   = $screen && false !== strpos( (string) $screen->id, self::SLUG );
		$err    = get_transient( 'damoon_api_error' );
		if ( $ours && $err ) {
			printf(
				'<div class="notice notice-error"><p><b>منبع داده در دسترس نیست</b>؛ تا وقتی این مشکل حل نشود، اسکن و ارزیابی انجام نمی‌شود.</p><p dir="ltr" style="text-align:left"><code>%s</code></p><p>اگر سرور در ایران است یا IP آن توسط Binance مسدود شده (HTTP 451 یا 403)، یک پراکسی (نمونهٔ Cloudflare Worker در پوشهٔ docs افزونه) بسازید و آدرسش را بالای «آدرس‌های API داده» در تنظیمات بگذارید.</p></div>',
				esc_html( $err )
			);
		}
		if ( $ours && ! damoon_sig_opt( 'auto_scan' ) ) {
			echo '<div class="notice notice-warning"><p>اسکن خودکار خاموش است؛ کارنامه و شورت‌کد <code>[damoon_scan]</code> فقط با درخواست کاربران پر می‌شوند. از «تنظیمات ← اسکن خودکار» روشنش کنید.</p></div>';
		}
		if ( $ours && defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) {
			echo '<div class="notice notice-info"><p>WP-Cron داخلی غیرفعال است؛ مطمئن شوید کرون سیستم هر چند دقیقه <code>wp-cron.php</code> را اجرا می‌کند، وگرنه ارزیابی، اسکن و ارسال انجام نمی‌شود.</p></div>';
		}
	}

	public static function action() {
		$do = isset( $_GET['do'] ) ? sanitize_key( wp_unslash( $_GET['do'] ) ) : '';
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( 'دسترسی ندارید.', 403 );
		}
		check_admin_referer( 'damoon_sig_' . $do );
		$back = wp_get_referer() ?: admin_url( 'admin.php?page=' . self::SLUG );

		switch ( $do ) {
			case 'evaluate':
				$n = Damoon_Store::evaluate_open();
				self::flash( sprintf( 'ارزیابی انجام شد؛ %d سیگنال بسته شد.', $n ) );
				break;

			case 'scan':
				$s = Damoon_Scanner::run( true );
				self::flash(
					sprintf( 'اسکن انجام شد: %d بررسی، %d ستاپ تازه، %d خطای داده.', $s['checked'], $s['created'], $s['errors'] ),
					$s['errors'] ? 'warning' : 'success'
				);
				break;

			case 'outbox':
				$n = Damoon_Outbox::run();
				self::flash( sprintf( '%d پیام ارسال شد.', $n ) );
				break;

			case 'retry_dead':
				$n = Damoon_Outbox::retry_dead();
				Damoon_Outbox::run();
				self::flash( sprintf( '%d پیام دوباره در صف قرار گرفت.', $n ) );
				break;

			case 'pulse_refresh':
				if ( ! damoon_sig_opt( 'pulse_enabled' ) ) {
					self::flash( 'نبض بازار در تنظیمات خاموش است.', 'warning' );
					break;
				}
				$errs = array();
				foreach ( array_slice( damoon_sig_symbols(), 0, Damoon_Pulse::MAX_SYMS ) as $sym ) {
					$d = Damoon_Pulse::refresh( $sym );
					foreach ( $d['errors'] as $src => $msg ) {
						$errs[ $src ] = $msg;
					}
				}
				self::flash(
					$errs ? 'به‌روزرسانی انجام شد، ولی این منابع در دسترس نبودند: ' . implode( '، ', array_keys( $errs ) ) . '. جزئیات در جدول پایین.' : 'نبض بازار برای همهٔ نمادها به‌روز شد.',
					$errs ? 'warning' : 'success'
				);
				break;

			case 'test_data':
				$symbols = damoon_sig_symbols();
				$c       = Damoon_Market::klines( $symbols ? $symbols[0] : 'BTCUSDT', '1h', 2 );
				if ( is_wp_error( $c ) ) {
					self::flash( 'منبع داده: ' . $c->get_error_message(), 'error' );
				} else {
					$last = end( $c );
					self::flash( sprintf( 'منبع داده پاسخ داد (%s). آخرین قیمت: %s', (string) get_transient( 'damoon_api_ok' ), $last ? $last['close'] : '—' ) );
				}
				break;

			case 'test_tg':
				$r = Damoon_Telegram::send( '✅ پیام آزمایشی Damoon Signal از ' . esc_html( get_bloginfo( 'name' ) ) );
				self::flash( true === $r ? 'پیام آزمایشی به تلگرام ارسال شد.' : $r->get_error_message(), true === $r ? 'success' : 'error' );
				break;

			case 'test_site':
				$r = Damoon_Bridge::health();
				self::flash( is_wp_error( $r ) ? $r->get_error_message() : $r, is_wp_error( $r ) ? 'error' : 'success' );
				break;

			case 'export':
				self::export();
				exit;

			default:
				self::flash( 'عملیات نامعتبر.', 'error' );
		}
		wp_safe_redirect( $back );
		exit;
	}

	private static function filters() {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- فقط فیلتر نمایش.
		$f = array(
			'status' => isset( $_GET['status'] ) ? sanitize_key( wp_unslash( $_GET['status'] ) ) : '',
			'symbol' => isset( $_GET['symbol'] ) ? strtoupper( sanitize_text_field( wp_unslash( $_GET['symbol'] ) ) ) : '',
			'tf'     => isset( $_GET['tf'] ) ? sanitize_text_field( wp_unslash( $_GET['tf'] ) ) : '',
			'source' => isset( $_GET['source'] ) ? sanitize_key( wp_unslash( $_GET['source'] ) ) : '',
		);
		// phpcs:enable
		return $f;
	}

	/** خروجی CSV از کل کارنامه (با همان فیلترها). */
	private static function export() {
		$f = self::filters();
		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=damoon-signals-' . gmdate( 'Ymd-His' ) . '.csv' );
		$out = fopen( 'php://output', 'w' );
		fwrite( $out, "\xEF\xBB\xBF" ); // BOM برای نمایش درست فارسی در اکسل.
		fputcsv( $out, array( 'id', 'symbol', 'tf', 'signal_time_utc', 'direction', 'strategy', 'regime', 'entry', 'stop', 'target', 'rr', 'risk_pct', 'source', 'status', 'exit', 'r', 'closed_at_utc' ) );
		$page = 1;
		do {
			list( $rows ) = Damoon_Store::query( $f, 500, $page );
			foreach ( $rows as $r ) {
				fputcsv(
					$out,
					array(
						$r['id'],
						$r['symbol'],
						$r['tf'],
						gmdate( 'Y-m-d H:i', (int) $r['bar_time'] + ( Damoon_Market::TF[ $r['tf'] ] ?? 0 ) ),
						$r['direction'],
						$r['strategy'],
						$r['regime'],
						$r['entry_price'],
						$r['stop_price'],
						$r['target_price'],
						$r['rr'],
						$r['risk_pct'],
						$r['source'],
						$r['status'],
						$r['exit_price'],
						$r['r_result'],
						$r['closed_at'] ? gmdate( 'Y-m-d H:i', (int) $r['closed_at'] ) : '',
					)
				);
			}
			$page++;
		} while ( count( $rows ) === 500 );
		fclose( $out );
	}

	/* ---------- صفحهٔ سیگنال‌ها ---------- */

	const STATUS_LABELS = array(
		'open'    => 'باز',
		'win'     => 'هدف',
		'loss'    => 'حد ضرر',
		'expired' => 'منقضی',
	);

	public static function page_signals() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$f     = self::filters();
		$page  = isset( $_GET['paged'] ) ? max( 1, (int) $_GET['paged'] ) : 1; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$per   = 50;
		$stats = Damoon_Store::record( 1 )['stats'];
		list( $rows, $total ) = Damoon_Store::query( $f, $per, $page );
		$pages = max( 1, (int) ceil( $total / $per ) );
		?>
		<div class="wrap">
			<h1 class="wp-heading-inline">سیگنال‌ها</h1>
			<hr class="wp-header-end">

			<p>
				<?php
				printf(
					'کل: <b>%d</b> · باز: <b>%d</b> · هدف: <b>%d</b> · حد ضرر: <b>%d</b> · منقضی: <b>%d</b> · جمع نتیجه: <b dir="ltr">%s R</b>',
					(int) $stats['total'],
					(int) $stats['open'],
					(int) $stats['wins'],
					(int) $stats['losses'],
					(int) $stats['expired'],
					esc_html( ( $stats['sum_r'] > 0 ? '+' : '' ) . number_format( $stats['sum_r'], 2 ) )
				);
				if ( null !== $stats['win_rate'] ) {
					printf( ' · نرخ برد: <b>%s٪</b> · میانگین: <b dir="ltr">%s R</b>', esc_html( $stats['win_rate'] ), esc_html( $stats['avg_r'] ) );
				}
				?>
			</p>

			<p>
				<?php
				self::button( 'evaluate', 'ارزیابی سیگنال‌های باز' );
				self::button( 'scan', 'اسکن همهٔ نمادها' );
				printf( '<a class="button" href="%s">خروجی CSV</a>', esc_url( self::action_url( 'export', array_filter( $f ) ) ) );
				?>
			</p>

			<?php self::latest_scan(); ?>

			<form method="get">
				<input type="hidden" name="page" value="<?php echo esc_attr( self::SLUG ); ?>">
				<select name="status">
					<option value="">همهٔ وضعیت‌ها</option>
					<?php foreach ( self::STATUS_LABELS as $k => $v ) : ?>
						<option value="<?php echo esc_attr( $k ); ?>" <?php selected( $f['status'], $k ); ?>><?php echo esc_html( $v ); ?></option>
					<?php endforeach; ?>
				</select>
				<select name="symbol">
					<option value="">همهٔ نمادها</option>
					<?php foreach ( damoon_sig_symbols() as $s ) : ?>
						<option value="<?php echo esc_attr( $s ); ?>" <?php selected( $f['symbol'], $s ); ?>><?php echo esc_html( $s ); ?></option>
					<?php endforeach; ?>
				</select>
				<select name="tf">
					<option value="">همهٔ تایم‌فریم‌ها</option>
					<?php foreach ( Damoon_UI::TF_LABELS as $k => $v ) : ?>
						<option value="<?php echo esc_attr( $k ); ?>" <?php selected( $f['tf'], $k ); ?>><?php echo esc_html( $v ); ?></option>
					<?php endforeach; ?>
				</select>
				<select name="source">
					<option value="">همهٔ منابع</option>
					<option value="user" <?php selected( $f['source'], 'user' ); ?>>درخواست کاربر</option>
					<option value="scan" <?php selected( $f['source'], 'scan' ); ?>>اسکن خودکار</option>
				</select>
				<?php submit_button( 'فیلتر', '', '', false ); ?>
			</form>

			<table class="widefat striped" style="margin-top:12px">
				<thead>
					<tr>
						<th>#</th><th>زمان سیگنال</th><th>نماد</th><th>جهت</th><th>الگو</th>
						<th>ورود</th><th>حد ضرر</th><th>هدف</th><th>منبع</th><th>وضعیت</th><th>خروج</th><th>R</th><th>بسته‌شدن</th>
					</tr>
				</thead>
				<tbody>
				<?php if ( ! $rows ) : ?>
					<tr><td colspan="13">سیگنالی پیدا نشد.</td></tr>
				<?php endif; ?>
				<?php
				foreach ( $rows as $r ) :
					$d = Damoon_Market::decimals( (float) $r['entry_price'] );
					$n = function ( $v ) use ( $d ) {
						return null === $v ? '—' : number_format( (float) $v, $d );
					};
					?>
					<tr>
						<td><?php echo (int) $r['id']; ?></td>
						<td dir="ltr"><?php echo esc_html( wp_date( 'Y-m-d H:i', (int) $r['bar_time'] + ( Damoon_Market::TF[ $r['tf'] ] ?? 0 ) ) ); ?></td>
						<td dir="ltr"><?php echo esc_html( $r['symbol'] . ' · ' . $r['tf'] ); ?></td>
						<td><?php echo 'long' === $r['direction'] ? 'خرید' : 'فروش'; ?></td>
						<td title="<?php echo esc_attr( (string) $r['thesis'] ); ?>"><?php echo esc_html( Damoon_Telegram::STRATEGY[ $r['strategy'] ] ?? $r['strategy'] ); ?></td>
						<td dir="ltr"><?php echo esc_html( $n( $r['entry_price'] ) ); ?></td>
						<td dir="ltr"><?php echo esc_html( $n( $r['stop_price'] ) ); ?></td>
						<td dir="ltr"><?php echo esc_html( $n( $r['target_price'] ) ); ?></td>
						<td><?php echo 'scan' === $r['source'] ? 'اسکن' : 'کاربر'; ?></td>
						<td><?php echo esc_html( self::STATUS_LABELS[ $r['status'] ] ?? $r['status'] ); ?></td>
						<td dir="ltr"><?php echo esc_html( $n( $r['exit_price'] ) ); ?></td>
						<td dir="ltr"><?php echo null === $r['r_result'] ? '—' : esc_html( ( $r['r_result'] > 0 ? '+' : '' ) . number_format( (float) $r['r_result'], 2 ) ); ?></td>
						<td dir="ltr"><?php echo $r['closed_at'] ? esc_html( wp_date( 'Y-m-d H:i', (int) $r['closed_at'] ) ) : '—'; ?></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>

			<?php if ( $pages > 1 ) : ?>
				<div class="tablenav"><div class="tablenav-pages">
					<?php
					echo wp_kses_post(
						paginate_links(
							array(
								'base'    => add_query_arg( 'paged', '%#%' ),
								'format'  => '',
								'current' => $page,
								'total'   => $pages,
							)
						)
					);
					?>
				</div></div>
			<?php endif; ?>
			<p class="description">سیگنال‌ها هرگز حذف یا ویرایش نمی‌شوند تا کارنامه قابل اعتماد بماند.</p>
		</div>
		<?php
	}

	/** آخرین نتیجهٔ اسکن هر نماد (همان دادهٔ [damoon_scan]). */
	private static function latest_scan() {
		$last = get_option( 'damoon_sig_scan_last' );
		$rows = array();
		foreach ( damoon_sig_scan_tfs() as $tf ) {
			$rows = array_merge( $rows, damoon_sig_scan_items( $tf ) );
		}
		echo '<h2>آخرین اسکن</h2>';
		if ( is_array( $last ) ) {
			printf(
				'<p class="description">%s — %d بررسی، %d ستاپ تازه، %d خطای داده.</p>',
				esc_html( wp_date( 'Y-m-d H:i', (int) $last['time'] ) ),
				(int) $last['checked'],
				(int) $last['created'],
				(int) $last['errors']
			);
		}
		if ( ! $rows ) {
			echo '<p>هنوز اسکنی انجام نشده است. دکمهٔ «اسکن همهٔ نمادها» را بزنید.</p>';
			return;
		}
		echo '<table class="widefat striped" style="max-width:900px;margin-bottom:16px"><thead><tr><th>نماد</th><th>تایم‌فریم</th><th>قیمت</th><th>تغییر ۲۴ساعته</th><th>وضعیت</th><th>توضیح</th></tr></thead><tbody>';
		$why = array(
			'no_setup'          => 'هیچ الگویی برقرار نیست',
			'wrong_playbook'    => 'خلاف روند اصلی در نوسان بالا',
			'risk_out_of_range' => 'فاصلهٔ حد ضرر خارج از محدوده',
			'no_data'           => 'دادهٔ کافی نیست',
		);
		foreach ( $rows as $r ) {
			printf(
				'<tr><td dir="ltr">%s</td><td>%s</td><td dir="ltr">%s</td><td dir="ltr">%s</td><td><b>%s</b></td><td>%s</td></tr>',
				esc_html( $r['symbol'] ),
				esc_html( Damoon_UI::TF_LABELS[ $r['tf'] ] ?? $r['tf'] ),
				esc_html( number_format( (float) $r['price'], (int) $r['decimals'] ) ),
				null === $r['change_24h'] ? '—' : esc_html( number_format( (float) $r['change_24h'], 2 ) . '%' ),
				esc_html( 'long' === $r['direction'] ? 'خرید' : ( 'short' === $r['direction'] ? 'فروش' : 'خنثی' ) ),
				esc_html( $r['direction'] ? ( Damoon_Telegram::STRATEGY[ $r['strategy'] ] ?? '' ) : ( $why[ $r['reason'] ] ?? '' ) )
			);
		}
		echo '</tbody></table>';
	}

	/* ---------- صفحهٔ صف ارسال ---------- */

	public static function page_outbox() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$status = isset( $_GET['status'] ) ? sanitize_key( wp_unslash( $_GET['status'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$counts = Damoon_Outbox::counts();
		$rows   = Damoon_Outbox::recent( 100, $status );
		$labels = array(
			'pending' => 'در انتظار',
			'sent'    => 'ارسال‌شده',
			'dead'    => 'ناموفق',
		);
		$base   = admin_url( 'admin.php?page=' . self::SLUG . '-outbox' );
		?>
		<div class="wrap">
			<h1>صف ارسال</h1>
			<p>
				تلگرام: <b><?php echo Damoon_Telegram::configured() ? 'فعال' : 'غیرفعال'; ?></b> ·
				سایت دامون: <b><?php echo Damoon_Bridge::configured() ? 'فعال' : 'غیرفعال'; ?></b>
			</p>
			<ul class="subsubsub">
				<li><a href="<?php echo esc_url( $base ); ?>" <?php echo '' === $status ? 'class="current"' : ''; ?>>همه</a> | </li>
				<?php foreach ( $labels as $k => $v ) : ?>
					<li><a href="<?php echo esc_url( add_query_arg( 'status', $k, $base ) ); ?>" <?php echo $k === $status ? 'class="current"' : ''; ?>><?php echo esc_html( $v ); ?> <span class="count">(<?php echo (int) $counts[ $k ]; ?>)</span></a> | </li>
				<?php endforeach; ?>
			</ul>
			<p style="clear:both;padding-top:8px">
				<?php
				self::button( 'outbox', 'ارسال الان' );
				if ( $counts['dead'] ) {
					self::button( 'retry_dead', 'تلاش دوباره برای ناموفق‌ها' );
				}
				?>
			</p>
			<table class="widefat striped">
				<thead><tr><th>#</th><th>کانال</th><th>سیگنال</th><th>رویداد</th><th>وضعیت</th><th>تلاش</th><th>تلاش بعدی</th><th>آخرین خطا</th></tr></thead>
				<tbody>
				<?php if ( ! $rows ) : ?>
					<tr><td colspan="8">صف خالی است.</td></tr>
				<?php endif; ?>
				<?php foreach ( $rows as $r ) : ?>
					<tr>
						<td><?php echo (int) $r['id']; ?></td>
						<td><?php echo 'tg' === $r['channel'] ? 'تلگرام' : 'سایت'; ?></td>
						<td>#<?php echo (int) $r['signal_id']; ?></td>
						<td><?php echo 'new' === $r['event'] ? 'سیگنال جدید' : 'بسته‌شدن'; ?></td>
						<td><?php echo esc_html( $labels[ $r['status'] ] ?? $r['status'] ); ?></td>
						<td><?php echo (int) $r['attempts']; ?></td>
						<td dir="ltr"><?php echo 'pending' === $r['status'] ? esc_html( wp_date( 'Y-m-d H:i', (int) $r['next_at'] ) ) : '—'; ?></td>
						<td><?php echo esc_html( (string) $r['last_error'] ); ?></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		</div>
		<?php
	}

	/* ---------- نبض بازار ---------- */

	public static function page_pulse() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$next = wp_next_scheduled( 'damoon_sig_pulse' );
		$auto = damoon_sig_list( damoon_sig_opt( 'pulse_auto' ), false );
		?>
		<div class="wrap">
			<h1>نبض بازار</h1>
			<?php if ( ! damoon_sig_opt( 'pulse_enabled' ) ) : ?>
				<div class="notice notice-warning inline"><p>نبض بازار خاموش است. از «تنظیمات ← نبض بازار» روشنش کنید.</p></div>
			<?php endif; ?>
			<p>
				<?php self::button( 'pulse_refresh', 'به‌روزرسانی الان (همهٔ نمادها)', true ); ?>
				<a class="button" href="<?php echo esc_url( home_url( '/' ) ); ?>" target="_blank">مشاهدهٔ صفحهٔ اصلی</a>
				<a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=' . self::SLUG . '-settings' ) ); ?>">تنظیمات</a>
			</p>
			<p>
				محل نمایش:
				<?php echo esc_html( $auto ? implode( '، ', array_map( function ( $a ) { return 'front' === $a ? 'صفحهٔ اصلی (خودکار)' : 'صفحه‌های ربات (خودکار)'; }, $auto ) ) : 'فقط جایی که شورت‌کد گذاشته شده' ); ?>
				— شورت‌کد دستی: <code>[damoon_pulse theme="dark"]</code>
				— اجرای بعدی کرون: <span dir="ltr"><?php echo $next ? esc_html( wp_date( 'H:i:s', $next ) ) : 'زمان‌بندی نشده'; ?></span>
			</p>
			<table class="widefat striped" style="max-width:1100px">
				<thead><tr><th>نماد</th><th>آخرین به‌روزرسانی</th><th>نظرات ۲۴ ساعت</th><th>خرید / فروش</th><th>اخبار</th><th>ربات</th><th>منابع در دسترس نبود</th></tr></thead>
				<tbody>
				<?php
				foreach ( array_slice( damoon_sig_symbols(), 0, Damoon_Pulse::MAX_SYMS ) as $sym ) :
					$d = Damoon_Pulse::get( $sym, false );
					?>
					<tr>
						<td dir="ltr"><?php echo esc_html( $sym ); ?></td>
						<?php if ( ! $d ) : ?>
							<td colspan="6">هنوز داده‌ای گرفته نشده؛ «به‌روزرسانی الان» را بزنید.</td>
						<?php else : ?>
							<td dir="ltr"><?php echo esc_html( wp_date( 'Y-m-d H:i', (int) $d['updated'] ) ); ?></td>
							<td><?php echo (int) $d['social']['total']; ?></td>
							<td><?php echo (int) $d['social']['bull'] . ' / ' . (int) $d['social']['bear']; ?></td>
							<td><?php echo (int) $d['news']['total']; ?></td>
							<td><?php echo esc_html( $d['damoon'] && $d['damoon']['direction'] ? ( 'long' === $d['damoon']['direction'] ? 'خرید' : 'فروش' ) : 'خنثی' ); ?></td>
							<td dir="ltr" style="text-align:left">
								<?php
								foreach ( $d['errors'] as $src => $msg ) {
									echo '<div><b>' . esc_html( $src ) . '</b>: <code>' . esc_html( $msg ) . '</code></div>';
								}
								echo $d['errors'] ? '' : '—';
								?>
							</td>
						<?php endif; ?>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
			<p class="description">اگر منابع خطا می‌دهند (مثلاً <code>cURL error 28</code>، <code>HTTP 403</code> یا <code>Could not resolve host</code>)، سرور به آن‌ها دسترسی ندارد — روی سرور ایران این طبیعی است. Cloudflare Worker نمونهٔ <code>docs/cloudflare-worker.js</code> را بسازید و آدرسش را در «تنظیمات ← نبض بازار ← پراکسی» بگذارید.</p>
		</div>
		<?php
	}

	/* ---------- تنظیمات ---------- */

	public static function settings() {
		register_setting(
			'damoon_sig',
			'damoon_sig_options',
			array( 'sanitize_callback' => array( __CLASS__, 'sanitize' ) )
		);
	}

	/** آدرس‌های https معتبر، جداشده با خط جدید. */
	private static function urls( $raw, $max = 6 ) {
		$out = array();
		foreach ( preg_split( '/[\s,]+/', (string) $raw ) as $u ) {
			$u = esc_url_raw( trim( $u ), array( 'https' ) );
			if ( $u ) {
				$out[] = untrailingslashit( $u );
			}
		}
		return array_slice( array_values( array_unique( $out ) ), 0, $max );
	}

	public static function sanitize( $in ) {
		$d    = damoon_sig_defaults();
		$prev = wp_parse_args( (array) get_option( 'damoon_sig_options', array() ), $d );
		$in   = (array) $in;
		$out  = array();

		$bases           = self::urls( $in['api_base'] ?? '' );
		$out['api_base'] = $bases ? implode( "\n", $bases ) : $d['api_base'];

		$syms = array();
		foreach ( preg_split( '/[\s,]+/', strtoupper( (string) ( $in['symbols'] ?? '' ) ) ) as $s ) {
			$s = trim( $s );
			if ( preg_match( '/^[A-Z0-9]{5,20}$/', $s ) ) {
				$syms[] = $s;
			}
		}
		$out['symbols'] = $syms ? implode( ',', array_slice( array_unique( $syms ), 0, 30 ) ) : $d['symbols'];

		$clamp = function ( $key, $min, $max, $int = false ) use ( $in, $d ) {
			$v = isset( $in[ $key ] ) && is_numeric( $in[ $key ] ) ? (float) $in[ $key ] : $d[ $key ];
			$v = min( $max, max( $min, $v ) );
			return $int ? (int) $v : $v;
		};
		$out['guest_limit']   = $clamp( 'guest_limit', 0, 1000, true );
		$out['user_limit']    = $clamp( 'user_limit', 0, 10000, true );
		$out['atr_stop_mult'] = $clamp( 'atr_stop_mult', 0.5, 5 );
		$out['rr']            = $clamp( 'rr', 0.5, 10 );
		$out['stretch_thr']   = $clamp( 'stretch_thr', 0.5, 6 );
		$out['expiry_bars']   = $clamp( 'expiry_bars', 4, 500, true );

		$access               = (string) ( $in['access'] ?? '' );
		$out['access']        = in_array( $access, array( 'public', 'members', 'roles' ), true ) ? $access : 'public';
		$roles                = array_intersect( array_map( 'sanitize_key', damoon_sig_input_list( $in['allowed_roles'] ?? array() ) ), array_keys( wp_roles()->get_names() ) );
		$out['allowed_roles'] = $roles ? implode( ',', $roles ) : 'administrator';

		$out['auto_scan'] = empty( $in['auto_scan'] ) ? 0 : 1;
		$tfs              = array_intersect( array_map( 'sanitize_text_field', damoon_sig_input_list( $in['scan_tfs'] ?? array() ) ), array_keys( Damoon_Market::TF ) );
		$out['scan_tfs']  = $tfs ? implode( ',', $tfs ) : $d['scan_tfs'];

		$out['tg_enabled']  = empty( $in['tg_enabled'] ) ? 0 : 1;
		$out['tg_on_close'] = empty( $in['tg_on_close'] ) ? 0 : 1;
		$chat               = trim( sanitize_text_field( (string) ( $in['tg_chat'] ?? '' ) ) );
		$out['tg_chat']     = preg_match( '/^(@[A-Za-z0-9_]{5,32}|-?\d{5,20})$/', $chat ) ? $chat : '';
		$tg_base            = self::urls( $in['tg_api_base'] ?? '', 1 );
		$out['tg_api_base'] = $tg_base ? $tg_base[0] : $d['tg_api_base'];
		$out['tg_token']    = self::secret( $in, 'tg_token', $prev, '/^\d{5,15}:[A-Za-z0-9_-]{20,64}$/', 'توکن ربات تلگرام' );

		$out['site_enabled'] = empty( $in['site_enabled'] ) ? 0 : 1;
		$site                = self::urls( $in['site_url'] ?? '', 1 );
		$out['site_url']     = $site ? $site[0] : '';
		$key_id              = sanitize_text_field( (string) ( $in['site_key_id'] ?? '' ) );
		$out['site_key_id']  = preg_match( '/^[A-Za-z0-9_.\-]{1,64}$/', $key_id ) ? $key_id : '';
		$out['site_secret']  = self::secret( $in, 'site_secret', $prev, '/^[^\s,:]{32,256}$/', 'Secret سایت دامون (حداقل ۳۲ کاراکتر)' );

		$out['pulse_enabled'] = empty( $in['pulse_enabled'] ) ? 0 : 1;
		$srcs                 = array_intersect( array_map( 'sanitize_key', damoon_sig_input_list( $in['pulse_sources'] ?? array() ) ), array_keys( Damoon_Pulse::SOURCES ) );
		$out['pulse_sources'] = $srcs ? implode( ',', $srcs ) : '';
		$feeds                = array();
		foreach ( preg_split( '/[\s]+/', (string) ( $in['pulse_news_feeds'] ?? '' ) ) as $f ) {
			// {q} = نام رمزارز؛ esc_url_raw آکولاد را خراب می‌کند پس موقتاً جایگزین می‌شود.
			$f = esc_url_raw( str_replace( '{q}', 'DMNQ', trim( $f ) ), array( 'https' ) );
			if ( $f ) {
				$feeds[] = str_replace( 'DMNQ', '{q}', $f );
			}
		}
		$out['pulse_news_feeds'] = implode( "\n", array_slice( array_unique( $feeds ), 0, 5 ) );
		$auto                    = array_intersect( array_map( 'sanitize_key', damoon_sig_input_list( $in['pulse_auto'] ?? array() ) ), array( 'front', 'robot' ) );
		$out['pulse_auto']       = implode( ',', $auto );
		$anchor                  = trim( wp_strip_all_tags( (string) ( $in['pulse_anchor'] ?? '' ) ) );
		// فقط انتخابگر CSS ساده (بدون کاراکترهایی که از رشتهٔ JS بیرون بزنند).
		$out['pulse_anchor']     = preg_match( '/^[A-Za-z0-9_\-#.\[\]=:>\s"\'()*~+^$|]{1,120}$/', $anchor ) && false === strpos( $anchor, '</' ) ? $anchor : '';
		$proxy                   = self::urls( $in['pulse_proxy'] ?? '', 1 );
		$out['pulse_proxy']      = $proxy ? $proxy[0] : '';
		if ( $out['pulse_proxy'] && ( preg_match( '#\.js$#i', $out['pulse_proxy'] ) || ! preg_match( '#^https://[^/]+\.[^/]+#', $out['pulse_proxy'] ) ) ) {
			add_settings_error( 'damoon_sig_options', 'pulse_proxy', 'پراکسی باید آدرس Worker ساخته‌شده در Cloudflare باشد (مثل https://damoon-proxy.yourname.workers.dev)، نه نام فایل docs/cloudflare-worker.js. پراکسی خالی شد.' );
			$out['pulse_proxy'] = '';
		}
		if ( $out['pulse_enabled'] !== (int) $prev['pulse_enabled'] || $out['pulse_sources'] !== (string) $prev['pulse_sources'] ) {
			// منابع تغییر کرد؛ داده‌ی تازه در اجرای بعدی کرون ساخته می‌شود.
			wp_schedule_single_event( time() + 5, 'damoon_sig_pulse' );
		}

		$out['delete_data'] = empty( $in['delete_data'] ) ? 0 : 1;

		if ( $out['tg_enabled'] && ( ! $out['tg_chat'] || ( ! $out['tg_token'] && ! defined( 'DAMOON_TG_TOKEN' ) ) ) ) {
			add_settings_error( 'damoon_sig_options', 'tg', 'برای ارسال به تلگرام، توکن ربات و شناسهٔ کانال معتبر لازم است.' );
		}
		if ( $out['site_enabled'] && ( ! $out['site_url'] || ! $out['site_key_id'] || ( ! $out['site_secret'] && ! defined( 'DAMOON_SITE_SECRET' ) ) ) ) {
			add_settings_error( 'damoon_sig_options', 'site', 'برای ارسال به سایت، آدرس https، شناسهٔ کلید و secret حداقل ۳۲ کاراکتری لازم است.' );
		}
		return $out;
	}

	/** فیلد محرمانه: خالی = مقدار قبلی حفظ شود؛ تیک «پاک کردن» = حذف. */
	private static function secret( array $in, $key, array $prev, $pattern, $label ) {
		if ( ! empty( $in[ $key . '_clear' ] ) ) {
			return '';
		}
		$v = trim( (string) ( $in[ $key ] ?? '' ) );
		if ( '' === $v ) {
			return (string) $prev[ $key ];
		}
		if ( ! preg_match( $pattern, $v ) ) {
			add_settings_error( 'damoon_sig_options', $key, 'مقدار واردشده برای ' . $label . ' معتبر نیست و ذخیره نشد.' );
			return (string) $prev[ $key ];
		}
		return $v;
	}

	private static function fields() {
		$roles = wp_roles()->get_names();
		return array(
			'داده و موتور'  => array(
				'api_base'      => array( 'آدرس‌های API داده', 'textarea', 'سازگار با Binance Spot؛ هر خط یک آدرس. به ترتیب امتحان می‌شوند. اگر سرور به Binance دسترسی ندارد، آدرس پراکسی خودتان را بالاتر بگذارید (نمونهٔ Cloudflare Worker در پوشهٔ docs افزونه).' ),
				'symbols'       => array( 'نمادها', 'text', 'با کاما جدا کنید، مثل BTCUSDT,ETHUSDT (حداکثر ۳۰)' ),
				'atr_stop_mult' => array( 'ضریب ATR برای حد ضرر', 'number' ),
				'rr'            => array( 'نسبت سود به ریسک', 'number' ),
				'stretch_thr'   => array( 'آستانهٔ فاصله از EMA20 (بر حسب ATR)', 'number', 'برای الگوی بازگشت به میانگین.' ),
				'expiry_bars'   => array( 'انقضای سیگنال (تعداد کندل)', 'number' ),
			),
			'دسترسی و سهمیه' => array(
				'access'        => array(
					'دسترسی به ستاپ‌ساز',
					'select',
					'کارنامه همیشه عمومی است. افزونه‌های عضویت می‌توانند با فیلتر damoon_sig_can_use دسترسی را کنترل کنند.',
					array(
						'public'  => 'همه (مهمان و کاربر)',
						'members' => 'فقط کاربران واردشده',
						'roles'   => 'فقط نقش‌های انتخاب‌شده',
					),
				),
				'allowed_roles' => array( 'نقش‌های مجاز', 'checks', 'فقط وقتی «نقش‌های انتخاب‌شده» فعال است. مدیر کل همیشه دسترسی دارد.', $roles ),
				'guest_limit'   => array( 'سهمیهٔ روزانهٔ مهمان', 'number' ),
				'user_limit'    => array( 'سهمیهٔ روزانهٔ کاربر', 'number' ),
			),
			'اسکن خودکار'    => array(
				'auto_scan' => array( 'فعال', 'checkbox', 'همهٔ نمادها بعد از بسته‌شدن هر کندل خودکار بررسی و ستاپ‌ها در کارنامه ثبت می‌شوند (هر ۱۵ دقیقه، با WP-Cron).' ),
				'scan_tfs'  => array( 'تایم‌فریم‌ها', 'checks', '', Damoon_UI::TF_LABELS ),
			),
			'تلگرام'         => array(
				'tg_enabled'  => array( 'ارسال به تلگرام', 'checkbox', 'هر ستاپ تازه به کانال یا گروه ارسال می‌شود. ربات باید ادمین کانال باشد.' ),
				'tg_token'    => array( 'توکن ربات', 'secret', 'از @BotFather. یا در wp-config.php: define( \'DAMOON_TG_TOKEN\', \'...\' );', 'DAMOON_TG_TOKEN' ),
				'tg_chat'     => array( 'شناسهٔ کانال', 'text', 'مثل @my_channel یا -1001234567890' ),
				'tg_on_close' => array( 'اعلام نتیجه', 'checkbox', 'وقتی سیگنال به هدف یا حد ضرر رسید یا منقضی شد، نتیجه هم ارسال شود.' ),
				'tg_api_base' => array( 'آدرس API تلگرام', 'text', 'برای سرور ایران می‌توانید یک relay (مثلاً Cloudflare Worker) بگذارید.' ),
			),
			'سایت دامون'     => array(
				'site_enabled' => array( 'ارسال به سایت دامون', 'checkbox', 'ستاپ‌ها با API امضاشدهٔ ربات به سایت Next.js دامون فرستاده می‌شوند. توجه: این سیگنال‌ها در فید و صفحهٔ عملکرد سایت کنار سیگنال‌های ربات اصلی نمایش داده می‌شوند.' ),
				'site_url'     => array( 'آدرس سایت', 'text', 'مثل https://example.com' ),
				'site_key_id'  => array( 'شناسهٔ کلید (keyId)', 'text', 'همان بخش قبل از «:» در BOT_API_KEYS سایت، مثلاً wp1' ),
				'site_secret'  => array( 'Secret', 'secret', 'حداقل ۳۲ کاراکتر؛ همان بخش بعد از «:» در BOT_API_KEYS. یا در wp-config.php: define( \'DAMOON_SITE_SECRET\', \'...\' );', 'DAMOON_SITE_SECRET' ),
			),
			'نبض بازار'      => array(
				'pulse_enabled'    => array( 'فعال', 'checkbox', 'شورت‌کد [damoon_pulse]: حجم نظرات، نسبت خرید/فروش، نظرات هم‌سو با ربات، اخبار و شاخص ترس و طمع. هر ۵ دقیقه به‌روز می‌شود.' ),
				'pulse_sources'    => array( 'منابع', 'checks', 'StockTwits برچسب خرید/فروش را خود کاربران می‌زنند؛ جهت Reddit و اخبار با واژه‌ها تخمین زده می‌شود.', Damoon_Pulse::SOURCES ),
				'pulse_news_feeds' => array( 'فیدهای خبری (RSS)', 'textarea', 'هر خط یک آدرس https (حداکثر ۵). {q} با نام رمزارز جایگزین می‌شود؛ فیدهای عمومی بر اساس نام رمزارز فیلتر می‌شوند.' ),
				'pulse_auto'       => array(
					'نمایش خودکار',
					'checks',
					'بدون نیاز به شورت‌کد. در صفحهٔ اصلی قبل از فوتر سایت (یا بعد از «عنصر مرجع») و زیر صفحه‌هایی که [damoon_scan] یا [damoon_signal] دارند نمایش داده می‌شود.',
					array(
						'front' => 'صفحهٔ اصلی',
						'robot' => 'صفحه‌های ربات',
					),
				),
				'pulse_anchor'     => array( 'عنصر مرجع در صفحهٔ اصلی', 'text', 'اختیاری؛ انتخابگر CSS بخشی که نبض بازار زیر آن بیاید، مثل #robot-scan یا .hero. خالی = قبل از فوتر.' ),
				'pulse_proxy'      => array( 'پراکسی', 'text', 'برای سرور ایران: آدرس Cloudflare Worker (مسیر ‎/fetch‎ نمونهٔ docs/cloudflare-worker.js). خالی = اتصال مستقیم.' ),
			),
			'حذف افزونه'     => array(
				'delete_data' => array( 'حذف داده‌ها', 'checkbox', 'اگر فعال باشد، با «حذف» افزونه از وردپرس، کارنامه و همهٔ تنظیمات برای همیشه پاک می‌شود.' ),
			),
		);
	}

	private static function field( $key, array $f ) {
		$name  = 'damoon_sig_options[' . $key . ']';
		$id    = 'dmn-' . $key;
		$value = damoon_sig_opt( $key );
		switch ( $f[1] ) {
			case 'textarea':
				printf( '<textarea class="large-text code" rows="4" dir="ltr" id="%s" name="%s">%s</textarea>', esc_attr( $id ), esc_attr( $name ), esc_textarea( (string) $value ) );
				break;
			case 'checkbox':
				printf( '<label><input type="checkbox" id="%s" name="%s" value="1" %s> %s</label>', esc_attr( $id ), esc_attr( $name ), checked( (bool) $value, true, false ), esc_html( $f[0] ) );
				break;
			case 'select':
				printf( '<select id="%s" name="%s">', esc_attr( $id ), esc_attr( $name ) );
				foreach ( $f[3] as $k => $label ) {
					printf( '<option value="%s" %s>%s</option>', esc_attr( $k ), selected( $value, $k, false ), esc_html( $label ) );
				}
				echo '</select>';
				break;
			case 'checks':
				$on = damoon_sig_list( $value, false );
				foreach ( $f[3] as $k => $label ) {
					printf(
						'<label style="margin-inline-end:14px;display:inline-block"><input type="checkbox" name="%s[]" value="%s" %s> %s</label>',
						esc_attr( $name ),
						esc_attr( $k ),
						checked( in_array( (string) $k, $on, true ), true, false ),
						esc_html( translate_user_role( $label ) )
					);
				}
				break;
			case 'secret':
				if ( defined( $f[3] ) ) {
					echo '<p><code>' . esc_html( $f[3] ) . '</code> در wp-config.php تعریف شده و همان استفاده می‌شود.</p>';
					break;
				}
				$stored = (string) ( ( (array) get_option( 'damoon_sig_options', array() ) )[ $key ] ?? '' );
				printf(
					'<input class="regular-text" dir="ltr" type="password" autocomplete="new-password" id="%s" name="%s" value="" placeholder="%s">',
					esc_attr( $id ),
					esc_attr( $name ),
					esc_attr( $stored ? 'ذخیره شده (برای تغییر، مقدار تازه وارد کنید)' : '' )
				);
				if ( $stored ) {
					printf( ' <label><input type="checkbox" name="damoon_sig_options[%s_clear]" value="1"> پاک کردن</label>', esc_attr( $key ) );
				}
				break;
			default:
				printf( '<input class="regular-text" dir="ltr" type="text" id="%s" name="%s" value="%s">', esc_attr( $id ), esc_attr( $name ), esc_attr( (string) $value ) );
		}
		if ( ! empty( $f[2] ) ) {
			echo '<p class="description">' . esc_html( $f[2] ) . '</p>';
		}
	}

	public static function page_settings() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$last = get_option( 'damoon_sig_scan_last' );
		?>
		<div class="wrap">
			<h1>تنظیمات Damoon Signal</h1>
			<?php settings_errors(); ?>
			<p>شورت‌کدها: <code>[damoon_signal]</code> (ستاپ‌ساز)، <code>[damoon_record]</code> (کارنامه) و <code>[damoon_scan tf="4h" theme="dark"]</code> (اسکن زنده)</p>

			<h2>ابزارها</h2>
			<p>
				<?php
				self::button( 'test_data', 'تست منبع داده' );
				self::button( 'test_tg', 'ارسال پیام آزمایشی تلگرام' );
				self::button( 'test_site', 'تست اتصال سایت دامون' );
				?>
			</p>
			<table class="widefat striped" style="max-width:720px">
				<thead><tr><th>کار زمان‌بندی‌شده</th><th>اجرای بعدی</th></tr></thead>
				<tbody>
				<?php
				$names = array(
					'damoon_sig_evaluate' => 'ارزیابی سیگنال‌های باز (ساعتی)',
					'damoon_sig_scan'     => 'اسکن خودکار (۱۵ دقیقه)',
					'damoon_sig_outbox'   => 'صف ارسال (۵ دقیقه)',
				);
				foreach ( $names as $hook => $label ) :
					$next = wp_next_scheduled( $hook );
					?>
					<tr><td><?php echo esc_html( $label ); ?></td><td dir="ltr"><?php echo $next ? esc_html( wp_date( 'Y-m-d H:i:s', $next ) ) : 'زمان‌بندی نشده'; ?></td></tr>
				<?php endforeach; ?>
				</tbody>
			</table>
			<?php if ( is_array( $last ) ) : ?>
				<p class="description">
					<?php
					printf(
						'آخرین اسکن: %s — %d بررسی، %d ستاپ تازه، %d خطای داده.',
						esc_html( wp_date( 'Y-m-d H:i', (int) $last['time'] ) ),
						(int) $last['checked'],
						(int) $last['created'],
						(int) $last['errors']
					);
					?>
				</p>
			<?php endif; ?>

			<form method="post" action="options.php">
				<?php settings_fields( 'damoon_sig' ); ?>
				<?php foreach ( self::fields() as $section => $fields ) : ?>
					<h2><?php echo esc_html( $section ); ?></h2>
					<table class="form-table" role="presentation">
						<?php foreach ( $fields as $key => $f ) : ?>
							<tr>
								<th scope="row"><label for="dmn-<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $f[0] ); ?></label></th>
								<td><?php self::field( $key, $f ); ?></td>
							</tr>
						<?php endforeach; ?>
					</table>
				<?php endforeach; ?>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}
