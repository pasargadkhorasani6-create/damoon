import { createHash, createHmac, randomBytes } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";

const env: Record<string, string> = {};
config({ path: ".env.test", processEnv: env });

export async function sql<T = unknown>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

export async function giveSubscription(email: string, days = 30) {
  const [u] = await sql<{ id: string }>(`SELECT id FROM "User" WHERE email = $1`, [email]);
  await sql(
    `INSERT INTO "Subscription" (id, "userId", "planSlug", "startsAt", "endsAt", source) VALUES ($1, $2, 'monthly', now(), now() + ($3 || ' days')::interval, 'ADMIN')`,
    [`e2e${Date.now()}`, u.id, String(days)],
  );
}

const [KEY, SECRET] = env.BOT_API_KEYS.split(":");

/** رویداد امضاشده مانند ربات به سرور می‌فرستد */
export async function botPost(baseURL: string, body: unknown) {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(12).toString("hex");
  const canon = `${ts}\n${nonce}\nPOST\n/api/bot/events\n${createHash("sha256").update(raw).digest("hex")}`;
  const res = await fetch(`${baseURL}/api/bot/events`, {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-api-key": KEY,
      "x-timestamp": ts,
      "x-nonce": nonce,
      "x-signature": createHmac("sha256", SECRET).update(canon).digest("hex"),
    },
  });
  return res;
}
