import { execSync } from "node:child_process";
import { config } from "dotenv";
import { sql } from "./db";

/** دیتابیس تست را به‌روز و خالی می‌کند تا اجراهای E2E مستقل باشند */
export default async function globalSetup() {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  config({ path: ".env.test", processEnv: env, override: true });
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: env as NodeJS.ProcessEnv });
  const tables = await sql<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`,
  );
  if (tables.length) await sql(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(",")} RESTART IDENTITY CASCADE`);
  execSync("npx prisma db seed", { stdio: "ignore", env: env as NodeJS.ProcessEnv });
}
