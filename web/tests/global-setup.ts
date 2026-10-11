import { execSync } from "node:child_process";
import { config } from "dotenv";

export default function setup() {
  config({ path: ".env.test", override: true });
  // migrationهای جدید را روی دیتابیس تست اعمال می‌کند (داده‌ها در هر تست TRUNCATE می‌شوند)
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
