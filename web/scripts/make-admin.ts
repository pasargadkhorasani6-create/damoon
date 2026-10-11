/**
 * ارتقای یک کاربر ثبت‌نام‌شده به ادمین (فقط از خط فرمان سرور؛ از داخل سایت ممکن نیست):
 *   npm run make-admin -- user@example.com
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("usage: npm run make-admin -- <email>");
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
db.user
  .update({ where: { email }, data: { role: "ADMIN" } })
  .then((u) => console.log(`✓ ${u.email} is now ADMIN`))
  .catch(() => {
    console.error(`user ${email} not found — register on the site first`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
