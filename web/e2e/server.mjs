// next start را با env تست اجرا می‌کند و خروجی را در فایل لاگ هم می‌نویسد تا تست‌ها کد OTP را بخوانند
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { config } from "dotenv";

const port = process.argv[2] ?? "3100";
const env = { ...process.env };
config({ path: ".env.test", processEnv: env, override: true });
env.APP_URL = `http://localhost:${port}`;
env.NODE_ENV = "production";

mkdirSync("e2e/.out", { recursive: true });
const log = createWriteStream("e2e/.out/server.log", { flags: "w" });
const child = spawn("npx", ["next", "start", "-p", port], { env, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", (d) => (process.stdout.write(d), log.write(d)));
child.stderr.on("data", (d) => (process.stderr.write(d), log.write(d)));
const stop = () => child.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", (c) => process.exit(c ?? 0));
