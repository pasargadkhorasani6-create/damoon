import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // generate (و build داکر) به دیتابیس نیاز ندارد؛ migrate بدون DATABASE_URL خطای اتصال می‌دهد
    url: process.env.DATABASE_URL ?? "",
  },
});
