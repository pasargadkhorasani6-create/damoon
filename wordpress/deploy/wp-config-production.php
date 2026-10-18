<?php
/**
 * تنظیمات wp-config.php برای سایت اصلی روی سرور خارجی.
 * این خط‌ها را بالای «That's all, stop editing!» در wp-config.php بگذارید (این فایل را مستقیم include نکنید).
 *
 * کلیدهای امنیتی (AUTH_KEY و…) را تازه بسازید: https://api.wordpress.org/secret-key/1.1/salt/
 * کلیدهایی که قبلاً جایی فرستاده یا منتشر شده‌اند را دوباره استفاده نکنید.
 */

define( 'WP_ENVIRONMENT_TYPE', 'production' );

// خطاها در فایل لاگ، نه روی صفحه.
define( 'WP_DEBUG', false );
define( 'WP_DEBUG_DISPLAY', false );
define( 'WP_DEBUG_LOG', false );

// امنیت
define( 'DISALLOW_FILE_EDIT', true );   // ویرایشگر قالب/افزونه در پیشخوان خاموش
define( 'FORCE_SSL_ADMIN', true );
define( 'WP_AUTO_UPDATE_CORE', 'minor' ); // به‌روزرسانی امنیتی خودکار هسته

// سرعت
define( 'WP_POST_REVISIONS', 10 );
define( 'AUTOSAVE_INTERVAL', 120 );
define( 'EMPTY_TRASH_DAYS', 14 );
define( 'WP_MEMORY_LIMIT', '256M' );

// کرون واقعی سرور (کرون دامون سیگنال هر ۵ و ۱۵ دقیقه اجرا می‌شود و با کش صفحه WP-Cron قابل اعتماد نیست):
//   crontab -e -u www-data
//   * * * * * cd /var/www/damoon && php wp-cron.php > /dev/null 2>&1
define( 'DISABLE_WP_CRON', true );

// پراکسی‌های WP_PROXY_* مخصوص سایت لوکال در ایران بودند؛ روی سرور خارجی تعریف نشوند.
