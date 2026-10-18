<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
delete_option( 'damoon_boost' );
global $wpdb;
// شمارنده‌های تلاش ورود
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_dmnb\\_login\\_%' OR option_name LIKE '\\_transient\\_timeout\\_dmnb\\_login\\_%'" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
