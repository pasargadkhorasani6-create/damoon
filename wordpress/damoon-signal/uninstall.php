<?php
/**
 * حذف افزونه از وردپرس.
 *
 * کارنامه فقط وقتی پاک می‌شود که در تنظیمات «حذف داده‌ها» فعال شده باشد؛
 * در غیر این صورت فقط کارهای زمان‌بندی‌شده برداشته می‌شوند تا با نصب دوباره، کارنامه سر جایش باشد.
 */
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

foreach ( array( 'damoon_sig_evaluate', 'damoon_sig_scan', 'damoon_sig_outbox', 'damoon_sig_outbox_now', 'damoon_sig_pulse' ) as $hook ) {
	wp_clear_scheduled_hook( $hook );
}

$opts = (array) get_option( 'damoon_sig_options', array() );
if ( empty( $opts['delete_data'] ) ) {
	return;
}

global $wpdb;
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}damoon_signals" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}damoon_outbox" );

foreach ( array( 'damoon_sig_options', 'damoon_sig_db', 'damoon_sig_scan_state', 'damoon_sig_scan_last', 'damoon_sig_uid', 'damoon_sig_scan_latest', 'damoon_sig_ver', 'damoon_sig_pulse_last' ) as $opt ) {
	delete_option( $opt );
}
delete_metadata( 'user', 0, 'damoon_sig_quota', '', true );

// transientها (کش نمودار، تحلیل، سهمیهٔ مهمان و قفل‌ها).
$wpdb->query(
	"DELETE FROM {$wpdb->options} WHERE option_name LIKE '\_transient\_damoon\_%' OR option_name LIKE '\_transient\_timeout\_damoon\_%'"
);
