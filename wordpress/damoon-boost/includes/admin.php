<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Damoon_Boost_Admin {

	const SLUG = 'damoon-boost';

	public static function menu() {
		add_options_page( 'دامون بوست', 'دامون بوست', 'manage_options', self::SLUG, array( __CLASS__, 'page' ) );
	}

	public static function links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'options-general.php?page=' . self::SLUG ) ) . '">تنظیمات</a>' );
		return $links;
	}

	public static function settings() {
		register_setting( 'damoon_boost', 'damoon_boost', array( 'sanitize_callback' => array( __CLASS__, 'sanitize' ) ) );
	}

	private static function fields() {
		return array(
			'سرعت' => array(
				'emoji'        => array( 'checkbox', 'حذف اسکریپت ایموجی وردپرس', 'یک فایل JS و یک درخواست به s.w.org کمتر. ایموجی‌ها با فونت خود سیستم نمایش داده می‌شوند.' ),
				'embeds'       => array( 'checkbox', 'حذف wp-embed', 'فقط اگر پست‌های سایت‌های وردپرسی دیگر را داخل صفحه جاسازی نمی‌کنید.' ),
				'head_cleanup' => array( 'checkbox', 'پاک‌سازی head', 'حذف نسخهٔ وردپرس، RSD، wlwmanifest، shortlink و فید نظرات.' ),
				'migrate'      => array( 'checkbox', 'حذف jquery-migrate در بخش عمومی', 'همان پیام JQMIGRATE در کنسول. اگر بخشی از سایت بعد از روشن‌کردن کار نکرد، خاموشش کنید.' ),
				'heartbeat'    => array( 'checkbox', 'محدود کردن Heartbeat', 'در بخش عمومی خاموش و در پیشخوان هر ۶۰ ثانیه (به‌جای ۱۵) تا بار سرور کم شود.' ),
				'dashicons'    => array( 'checkbox', 'حذف dashicons برای بازدیدکننده‌ها', 'فونت آیکون پیشخوان؛ بازدیدکنندهٔ واردنشده لازمش ندارد.' ),
				'defer'        => array( 'checkbox', 'defer اسکریپت‌ها (آزمایشی)', 'اسکریپت‌ها بعد از ساخته‌شدن صفحه اجرا می‌شوند و رندر اول سریع‌تر می‌شود. jQuery و وابسته‌هایش defer نمی‌شوند. بعد از روشن‌کردن، فرم‌ها، سبد خرید و اسلایدرها را امتحان کنید.' ),
				'defer_skip'   => array( 'text', 'استثناهای defer', 'نام (handle) اسکریپت‌هایی که نباید defer شوند، با کاما.' ),
				'preconnect'   => array( 'textarea', 'preconnect', 'دامنه‌هایی که صفحه از آن‌ها فونت یا فایل می‌گیرد، هر خط یکی (حداکثر ۵)؛ مثل https://fonts.gstatic.com' ),
			),
			'امنیت' => array(
				'headers'         => array( 'checkbox', 'هدرهای امنیتی', 'nosniff، جلوگیری از قرارگرفتن سایت در iframe سایت‌های دیگر (clickjacking)، Referrer-Policy و Permissions-Policy.' ),
				'hsts'            => array( 'checkbox', 'HSTS', 'مرورگر یک سال سایت را فقط با https باز می‌کند. فقط وقتی روشن بماند که همهٔ زیردامنه‌ها https دارند.' ),
				'xmlrpc'          => array( 'checkbox', 'بستن XML-RPC و pingback', 'مسیر رایج حملهٔ حدس رمز. اگر Jetpack فعال باشد خودکار باز می‌ماند.' ),
				'users'           => array( 'checkbox', 'جلوگیری از شناسایی نام کاربری‌ها', 'بستن ‎/wp-json/wp/v2/users‎ برای مهمان، ‎?author=1‎ و نقشهٔ سایت کاربران.' ),
				'author_archives' => array( 'checkbox', 'بستن صفحه‌های نویسنده', 'صفحهٔ ‎/author/…‎ به صفحهٔ اصلی می‌رود (برای سایت تک‌نویسنده محتوای تکراری است).' ),
				'login_limit'     => array( 'checkbox', 'محدودیت تلاش ورود', '۵ تلاش ناموفق در ۱۵ دقیقه از یک IP = ۳۰ دقیقه قفل. پشت Cloudflare حتماً real_ip را در nginx تنظیم کنید (فایل deploy).' ),
				'login_errors'    => array( 'checkbox', 'پیام خطای یکسان در ورود', 'معلوم نشود نام کاربری درست بوده یا رمز.' ),
				'app_passwords'   => array( 'checkbox', 'خاموش کردن Application Passwords', 'اگر اپ یا سرویسی با رمز برنامه به سایت وصل نمی‌شود.' ),
			),
			'سئو' => array(
				'seo'          => array( 'checkbox', 'فعال', 'توضیح متا، Open Graph (پیش‌نمایش لینک در تلگرام و شبکه‌ها)، کارت توییتر، داده‌ی ساختاریافتهٔ صفحهٔ اصلی و noindex برای نتایج جست‌وجو. اگر Yoast یا Rank Math نصب باشد خودکار کنار می‌رود.' ),
				'home_desc_fa' => array( 'textarea', 'توضیح صفحهٔ اصلی (فارسی)', 'حدود ۱۲۰ تا ۱۶۰ نویسه؛ همان متنی که زیر عنوان در نتایج گوگل دیده می‌شود.' ),
				'home_desc_en' => array( 'textarea', 'توضیح صفحهٔ اصلی (English)', '' ),
				'home_desc_ru' => array( 'textarea', 'توضیح صفحهٔ اصلی (Русский)', '' ),
				'og_image'     => array( 'text', 'تصویر پیش‌فرض اشتراک‌گذاری', 'آدرس تصویر ۱۲۰۰×۶۳۰ برای صفحه‌هایی که تصویر شاخص ندارند.' ),
				'twitter'      => array( 'text', 'حساب X (توییتر)', 'مثل @damoon' ),
				'same_as'      => array( 'textarea', 'صفحه‌های رسمی', 'آدرس کانال تلگرام، اینستاگرام، X و… هر خط یکی؛ به گوگل می‌گوید این حساب‌ها مال همین سایت است.' ),
			),
		);
	}

	public static function sanitize( $in ) {
		$in  = (array) $in;
		$out = array();
		foreach ( self::fields() as $fields ) {
			foreach ( $fields as $key => $f ) {
				switch ( $f[0] ) {
					case 'checkbox':
						$out[ $key ] = empty( $in[ $key ] ) ? 0 : 1;
						break;
					case 'textarea':
						$out[ $key ] = sanitize_textarea_field( (string) ( $in[ $key ] ?? '' ) );
						break;
					default:
						$out[ $key ] = sanitize_text_field( (string) ( $in[ $key ] ?? '' ) );
				}
			}
		}
		$out['preconnect'] = implode( "\n", Damoon_Boost_Lib::url_lines( $out['preconnect'], 5 ) );
		$out['same_as']    = implode( "\n", Damoon_Boost_Lib::url_lines( $out['same_as'] ) );
		$img               = Damoon_Boost_Lib::url_lines( $out['og_image'], 1 );
		$out['og_image']   = $img ? $img[0] : '';
		$out['twitter']    = preg_match( '/^@?[A-Za-z0-9_]{1,15}$/', $out['twitter'] ) ? '@' . ltrim( $out['twitter'], '@' ) : '';
		$out['defer_skip'] = implode( ',', array_filter( array_map( 'sanitize_key', damoon_boost_list( $out['defer_skip'] ) ) ) );
		return $out;
	}

	/**
	 * وضعیت سایت: [عنوان, true=خوب | false=مشکل | null=اطلاع, توضیح].
	 */
	public static function checks() {
		global $wpdb;
		$rows   = array();
		$rows[] = array( 'HTTPS', is_ssl() || 0 === strpos( home_url(), 'https://' ), 'آدرس سایت در «تنظیمات ← عمومی» باید با https شروع شود؛ برای گوگل و امنیت ورود ضروری است.' );
		$rows[] = array( 'دیده‌شدن در موتورهای جست‌وجو', (bool) get_option( 'blog_public' ), 'در «تنظیمات ← خواندن» تیک «از موتورهای جست‌وجو درخواست شود محتوای سایت را بررسی نکنند» را بردارید. سایت‌های تازه‌منتقل‌شده اغلب این تیک را دارند.' );
		$rows[] = array( 'پیوند یکتا', '' !== (string) get_option( 'permalink_structure' ), 'در «تنظیمات ← پیوندهای یکتا» گزینهٔ «نام نوشته» را انتخاب کنید؛ آدرس‌های ‎?p=123‎ برای سئو بد است.' );
		$rows[] = array( 'کش صفحه', ( defined( 'WP_CACHE' ) && WP_CACHE ) || file_exists( WP_CONTENT_DIR . '/advanced-cache.php' ) ? true : null, 'اگر کش صفحه در nginx (فایل deploy) یا Cloudflare تنظیم کرده‌اید این مورد را نادیده بگیرید؛ وگرنه یک افزونهٔ کش (مثل LiteSpeed Cache روی هاست LiteSpeed) لازم است.' );
		$rows[] = array( 'کش آبجکت (Redis)', wp_using_ext_object_cache() ? true : null, 'اختیاری؛ با Redis پیشخوان و ووکامرس سریع‌تر می‌شوند.' );
		$rows[] = array( 'کرون واقعی سرور', defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ? true : null, 'افزونهٔ دامون سیگنال به کرون وابسته است. با کش صفحه، WP-Cron قابل اعتماد نیست: DISABLE_WP_CRON و کرون سرور هر دقیقه (فایل deploy).' );
		$rows[] = array( 'ویرایشگر فایل پیشخوان خاموش', defined( 'DISALLOW_FILE_EDIT' ) && DISALLOW_FILE_EDIT, "در wp-config.php: define( 'DISALLOW_FILE_EDIT', true );" );
		$rows[] = array( 'حالت دیباگ خاموش', ! ( defined( 'WP_DEBUG_DISPLAY' ) && WP_DEBUG_DISPLAY && defined( 'WP_DEBUG' ) && WP_DEBUG ), 'روی سایت اصلی خطاها نباید به بازدیدکننده نمایش داده شوند.' );
		$rows[] = array( 'کاربری با نام admin', ! username_exists( 'admin' ), 'یک مدیر با نام دیگر بسازید، محتوا را به او منتقل و کاربر admin را حذف کنید.' );
		$rows[] = array( 'PHP ' . PHP_VERSION, version_compare( PHP_VERSION, '8.1', '>=' ), 'نسخهٔ ۸٫۱ یا بالاتر هم سریع‌تر است و هم به‌روزرسانی امنیتی دارد.' );
		$rows[] = array( 'پشتیبانی WebP', wp_image_editor_supports( array( 'mime_type' => 'image/webp' ) ) ? true : null, 'برای تبدیل تصاویر به WebP (حجم کمتر) افزونهٔ GD یا Imagick سرور باید WebP داشته باشد.' );
		$seo = Damoon_Boost_SEO::other_plugin();
		$rows[] = array( 'افزونهٔ سئو', $seo ? null : true, $seo ? 'افزونهٔ سئوی دیگری فعال است؛ بخش سئوی دامون بوست کنار رفته است.' : 'بخش سئوی دامون بوست فعال است.' );
		$rows[] = array( 'چندزبانه (Polylang)', function_exists( 'pll_current_language' ) ? true : null, 'برای سه زبان و hreflang لازم است.' );
		$rows[] = array( 'پیشوند جدول‌ها', 'wp_' === $wpdb->prefix ? null : true, 'پیشوند پیش‌فرض wp_ مشکل امنیتی جدی نیست؛ برای سایت تازه یک پیشوند دیگر بهتر است.' );
		return $rows;
	}

	public static function page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap">
			<h1>دامون بوست — سرعت، امنیت، سئو</h1>
			<?php settings_errors(); ?>

			<h2>وضعیت سایت</h2>
			<table class="widefat striped" style="max-width:900px">
				<tbody>
				<?php foreach ( self::checks() as $c ) : ?>
					<tr>
						<td style="width:28px"><?php echo true === $c[1] ? '✅' : ( false === $c[1] ? '❌' : 'ℹ️' ); ?></td>
						<td style="width:220px"><b><?php echo esc_html( $c[0] ); ?></b></td>
						<td><?php echo true === $c[1] ? '' : esc_html( $c[2] ); ?></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>

			<form method="post" action="options.php">
				<?php settings_fields( 'damoon_boost' ); ?>
				<?php foreach ( self::fields() as $section => $fields ) : ?>
					<h2><?php echo esc_html( $section ); ?></h2>
					<table class="form-table" role="presentation">
						<?php
						foreach ( $fields as $key => $f ) :
							$name  = 'damoon_boost[' . $key . ']';
							$value = damoon_boost_opt( $key );
							?>
							<tr>
								<th scope="row"><label for="dmnb-<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $f[1] ); ?></label></th>
								<td>
									<?php if ( 'checkbox' === $f[0] ) : ?>
										<input type="checkbox" id="dmnb-<?php echo esc_attr( $key ); ?>" name="<?php echo esc_attr( $name ); ?>" value="1" <?php checked( (bool) $value ); ?>>
									<?php elseif ( 'textarea' === $f[0] ) : ?>
										<textarea class="large-text" rows="3" id="dmnb-<?php echo esc_attr( $key ); ?>" name="<?php echo esc_attr( $name ); ?>" dir="auto"><?php echo esc_textarea( (string) $value ); ?></textarea>
									<?php else : ?>
										<input class="regular-text" type="text" dir="ltr" id="dmnb-<?php echo esc_attr( $key ); ?>" name="<?php echo esc_attr( $name ); ?>" value="<?php echo esc_attr( (string) $value ); ?>">
									<?php endif; ?>
									<?php if ( $f[2] ) : ?>
										<p class="description"><?php echo esc_html( $f[2] ); ?></p>
									<?php endif; ?>
								</td>
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
