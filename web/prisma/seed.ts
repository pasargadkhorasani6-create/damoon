import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/** پلن‌های پیش‌فرض؛ قیمت‌ها را بعداً از پنل ادمین تغییر دهید. اجرای مجدد، پلن‌های موجود را تغییر نمی‌دهد */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const plans = [
    { slug: "monthly", title: "ماهانه", days: 30, priceToman: 1_500_000, priceUsdtCents: 1500, sortOrder: 1 },
    { slug: "quarterly", title: "سه‌ماهه", days: 90, priceToman: 3_900_000, priceUsdtCents: 3900, sortOrder: 2 },
  ];
  for (const p of plans) {
    await db.plan.upsert({ where: { slug: p.slug }, update: {}, create: p });
  }
  console.log("seeded plans");
}

main().finally(() => db.$disconnect());
