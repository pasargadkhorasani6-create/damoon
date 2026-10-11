import { config } from "dotenv";
import { afterAll, beforeEach, vi } from "vitest";

config({ path: ".env.test", override: true });

// server-only در محیط تست بی‌اثر است
vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { redis } = await import("@/lib/redis");

export async function resetDb() {
  const tables = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`,
  );
  if (tables.length) {
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(",")} RESTART IDENTITY CASCADE`);
  }
  await redis().flushdb();
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.$disconnect();
  redis().disconnect();
});
