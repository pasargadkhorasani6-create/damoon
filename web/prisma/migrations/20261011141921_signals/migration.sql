-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'STOP', 'LIMIT');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('PENDING', 'ACTIVE', 'TP_HIT', 'SL_HIT', 'CLOSED', 'CANCELED');

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "timeframe" TEXT,
    "digits" INTEGER NOT NULL DEFAULT 5,
    "entry" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit" DOUBLE PRECISION,
    "initialStopLoss" DOUBLE PRECISION NOT NULL,
    "initialTakeProfit" DOUBLE PRECISION,
    "status" "SignalStatus" NOT NULL DEFAULT 'PENDING',
    "signalAt" TIMESTAMP(3) NOT NULL,
    "fillPrice" DOUBLE PRECISION,
    "activatedAt" TIMESTAMP(3),
    "exitPrice" DOUBLE PRECISION,
    "closedAt" TIMESTAMP(3),
    "resultR" DOUBLE PRECISION,
    "cancelReason" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalEvent" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Signal_externalId_key" ON "Signal"("externalId");

-- CreateIndex
CREATE INDEX "Signal_status_idx" ON "Signal"("status");

-- CreateIndex
CREATE INDEX "Signal_signalAt_idx" ON "Signal"("signalAt");

-- CreateIndex
CREATE INDEX "Signal_closedAt_idx" ON "Signal"("closedAt");

-- CreateIndex
CREATE INDEX "SignalEvent_signalId_createdAt_idx" ON "SignalEvent"("signalId", "createdAt");

-- AddForeignKey
ALTER TABLE "SignalEvent" ADD CONSTRAINT "SignalEvent_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
