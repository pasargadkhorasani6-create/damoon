# syntax=docker/dockerfile:1
# روی سرور ایران می‌توانید با --build-arg NPM_REGISTRY=<mirror> از میرور npm استفاده کنید
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY} \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# اختیاری: CA سفارشی برای پراکسی سازمانی:  docker build --secret id=ca,src=/path/ca.crt
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund

FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# build به اتصال دیتابیس نیاز ندارد؛ این مقادیر فقط برای عبور از اعتبارسنجی env هستند
RUN export DATABASE_URL=postgresql://build:build@localhost:5432/build \
      SESSION_SECRET=build-time-placeholder-000000000000000000 \
      OTP_PEPPER=build-time-placeholder-0000000000000000000000 && \
    npx prisma generate && npm run build

# ---------- وب‌سرور (خروجی standalone، بدون devDependencies)
FROM ${NODE_IMAGE} AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN useradd -r -u 1001 nextjs
COPY --from=builder --chown=nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# ---------- worker و migrate (فقط وابستگی‌های production + کد منبع؛ با tsx اجرا می‌شود)
FROM ${NODE_IMAGE} AS worker
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ARG NPM_REGISTRY=https://registry.npmjs.org/
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY}
COPY package.json package-lock.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --omit=dev --no-audit --no-fund --ignore-scripts && npx prisma generate && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
RUN useradd -r -u 1001 worker && chown -R worker /app/src/generated
USER worker
CMD ["npx", "tsx", "--tsconfig", "tsconfig.json", "src/worker/index.ts"]
