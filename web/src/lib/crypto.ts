import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export const hmacHex = (secret: string, data: string | Buffer) =>
  createHmac("sha256", secret).update(data).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** کد عددی n رقمی با RNG امن */
export function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += randomInt(0, 10).toString();
  return s;
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || !/^[0-9a-f]*$/i.test(a) || !/^[0-9a-f]*$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
