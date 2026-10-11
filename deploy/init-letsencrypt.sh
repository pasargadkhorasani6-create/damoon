#!/usr/bin/env bash
# دریافت اولین گواهی SSL از Let's Encrypt.
# پیش‌نیاز: رکورد A دامنه به IP سرور اشاره کند و DOMAIN و LETSENCRYPT_EMAIL در .env تنظیم باشد.
#   ./deploy/init-letsencrypt.sh            (گواهی واقعی)
#   STAGING=1 ./deploy/init-letsencrypt.sh  (آزمایشی، بدون محدودیت نرخ)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
: "${DOMAIN:?DOMAIN not set in .env}"
: "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL not set in .env}"

live="/etc/letsencrypt/live/$DOMAIN"
echo "### گواهی موقت self-signed تا nginx بتواند بالا بیاید"
docker compose run --rm --entrypoint sh certbot -c "
  mkdir -p $live &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 -keyout $live/privkey.pem -out $live/fullchain.pem -subj /CN=localhost"

echo "### اجرای nginx"
docker compose up -d nginx

echo "### حذف گواهی موقت و درخواست گواهی واقعی"
docker compose run --rm --entrypoint sh certbot -c "rm -rf /etc/letsencrypt/live/$DOMAIN /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf"
docker compose run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
  ${STAGING:+--staging} --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email \
  -d "$DOMAIN" --rsa-key-size 4096 --force-renewal

docker compose exec nginx nginx -s reload
echo "### انجام شد: https://$DOMAIN"
