import { hash, verify } from "@node-rs/argon2";

// Argon2id با پارامترهای پیشنهادی OWASP
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** هش ثابت برای جلوگیری از timing attack وقتی کاربر وجود ندارد */
let dummy: Promise<string> | null = null;
export async function dummyVerify(password: string) {
  dummy ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(await dummy, password);
}
