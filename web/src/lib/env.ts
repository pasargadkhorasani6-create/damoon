import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  APP_NAME: z.string().default("دامون"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379/0"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET باید حداقل ۳۲ کاراکتر باشد"),
  OTP_PEPPER: z.string().min(32, "OTP_PEPPER باید حداقل ۳۲ کاراکتر باشد"),

  MELIPAYAMAK_CONSOLE_KEY: z.string().optional().default(""),
  MELIPAYAMAK_BODY_ID: z.string().optional().default(""),
  MELIPAYAMAK_FROM: z.string().optional().default(""),
  SMS_DRY_RUN: bool,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** متغیرهای محیطی را یک بار اعتبارسنجی می‌کند؛ مقدار ناقص = خطای واضح هنگام بالا آمدن. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** فقط برای تست‌ها */
export function resetEnvCache() {
  cached = null;
}
