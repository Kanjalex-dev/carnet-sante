-- CreateEnum
CREATE TYPE "BudgetMode" AS ENUM ('TRACKING', 'ENVELOPE');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('CHECKING', 'SAVINGS', 'CARD', 'CASH');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER');

-- CreateEnum
CREATE TYPE "CategorySource" AS ENUM ('IMPORT_RULE', 'AI', 'MANUAL', 'LEARNED', 'UNSET');

-- CreateEnum
CREATE TYPE "ImportFormat" AS ENUM ('CSV', 'OFX', 'QIF');

-- CreateEnum
CREATE TYPE "RuleMatch" AS ENUM ('CONTAINS', 'STARTS_WITH', 'REGEX', 'EXACT');

-- CreateEnum
CREATE TYPE "EnvelopeTarget" AS ENUM ('NONE', 'MONTHLY', 'BY_DATE', 'BALANCE');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'IRREGULAR');

-- CreateEnum
CREATE TYPE "SeriesStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED', 'IGNORED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('BUDGET_OVERRUN', 'LOW_BALANCE', 'LARGE_UPCOMING', 'LARGE_TRANSACTION', 'NEW_SUBSCRIPTION', 'PRICE_INCREASE', 'PORTFOLIO_DRIFT', 'PORTFOLIO_MOVE');

-- CreateEnum
CREATE TYPE "AssetProvider" AS ENUM ('TRADE_REPUBLIC', 'YOMONI', 'MANUAL');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('EQUITY', 'ETF', 'BOND', 'EURO_FUND', 'REAL_ESTATE', 'CRYPTO', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetTxType" AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'FEE', 'INTEREST', 'ARBITRAGE');

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "pinHash" TEXT NOT NULL,
    "budgetMode" "BudgetMode" NOT NULL DEFAULT 'TRACKING',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "monthStartDay" INTEGER NOT NULL DEFAULT 1,
    "riskProfile" INTEGER NOT NULL DEFAULT 5,
    "horizonYears" INTEGER NOT NULL DEFAULT 15,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "kind" "AccountKind" NOT NULL DEFAULT 'CHECKING',
    "iban" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "statedBalance" DECIMAL(14,2),
    "statedBalanceDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL DEFAULT 'EXPENSE',
    "icon" TEXT NOT NULL DEFAULT '•',
    "color" TEXT NOT NULL DEFAULT '#8b8b8b',
    "parentId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "valueDate" DATE,
    "amount" DECIMAL(14,2) NOT NULL,
    "rawLabel" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "merchant" TEXT,
    "categoryId" TEXT,
    "categorySource" "CategorySource" NOT NULL DEFAULT 'UNSET',
    "aiConfidence" DOUBLE PRECISION,
    "notes" TEXT,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "transferPairId" TEXT,
    "recurringSeriesId" TEXT,
    "envelopeId" TEXT,
    "importBatchId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "format" "ImportFormat" NOT NULL,
    "profileUsed" TEXT,
    "rowsParsed" INTEGER NOT NULL DEFAULT 0,
    "rowsInserted" INTEGER NOT NULL DEFAULT 0,
    "rowsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "rowsRejected" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "match" "RuleMatch" NOT NULL DEFAULT 'CONTAINS',
    "categoryId" TEXT NOT NULL,
    "amountMin" DECIMAL(14,2),
    "amountMax" DECIMAL(14,2),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "learned" BOOLEAN NOT NULL DEFAULT false,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "rollover" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Envelope" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "group" TEXT NOT NULL DEFAULT 'Depenses',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "targetType" "EnvelopeTarget" NOT NULL DEFAULT 'NONE',
    "targetAmount" DECIMAL(14,2),
    "targetDate" DATE,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Envelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvelopeAllocation" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "allocated" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "EnvelopeAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvelopeTransfer" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "fromEnvelopeId" TEXT,
    "toEnvelopeId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvelopeTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringSeries" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "merchant" TEXT,
    "categoryId" TEXT,
    "frequency" "Frequency" NOT NULL DEFAULT 'MONTHLY',
    "amountAvg" DECIMAL(14,2) NOT NULL,
    "amountLast" DECIMAL(14,2) NOT NULL,
    "amountMin" DECIMAL(14,2) NOT NULL,
    "amountMax" DECIMAL(14,2) NOT NULL,
    "dayOfMonth" INTEGER,
    "occurrences" INTEGER NOT NULL DEFAULT 0,
    "firstSeen" DATE NOT NULL,
    "lastSeen" DATE NOT NULL,
    "nextExpected" DATE,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isSubscription" BOOLEAN NOT NULL DEFAULT false,
    "status" "SeriesStatus" NOT NULL DEFAULT 'ACTIVE',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "payload" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAccount" (
    "id" TEXT NOT NULL,
    "provider" "AssetProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "credentialsEnc" TEXT,
    "connectorState" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "assetAccountId" TEXT NOT NULL,
    "isin" TEXT,
    "symbol" TEXT,
    "name" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL DEFAULT 'OTHER',
    "quantity" DECIMAL(20,8) NOT NULL,
    "unitPrice" DECIMAL(20,8) NOT NULL,
    "value" DECIMAL(16,2) NOT NULL,
    "costBasis" DECIMAL(16,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "asOf" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuationSnapshot" (
    "id" TEXT NOT NULL,
    "assetAccountId" TEXT,
    "date" DATE NOT NULL,
    "totalValue" DECIMAL(16,2) NOT NULL,
    "invested" DECIMAL(16,2),
    "breakdown" JSONB,

    CONSTRAINT "ValuationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTransaction" (
    "id" TEXT NOT NULL,
    "assetAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "AssetTxType" NOT NULL,
    "isin" TEXT,
    "symbol" TEXT,
    "name" TEXT,
    "quantity" DECIMAL(20,8),
    "price" DECIMAL(20,8),
    "amount" DECIMAL(16,2) NOT NULL,
    "fees" DECIMAL(16,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "externalId" TEXT,
    "fingerprint" TEXT NOT NULL,

    CONSTRAINT "AssetTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "close" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benchmark" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_name_key" ON "Account"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_parentId_key" ON "Category"("name", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_fingerprint_key" ON "Transaction"("fingerprint");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");

-- CreateIndex
CREATE INDEX "Transaction_envelopeId_idx" ON "Transaction"("envelopeId");

-- CreateIndex
CREATE INDEX "CategoryRule_priority_idx" ON "CategoryRule"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryRule_pattern_match_amountMin_amountMax_key" ON "CategoryRule"("pattern", "match", "amountMin", "amountMax");

-- CreateIndex
CREATE INDEX "Budget_month_idx" ON "Budget"("month");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_categoryId_month_key" ON "Budget"("categoryId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Envelope_name_key" ON "Envelope"("name");

-- CreateIndex
CREATE INDEX "EnvelopeAllocation_month_idx" ON "EnvelopeAllocation"("month");

-- CreateIndex
CREATE UNIQUE INDEX "EnvelopeAllocation_envelopeId_month_key" ON "EnvelopeAllocation"("envelopeId", "month");

-- CreateIndex
CREATE INDEX "EnvelopeTransfer_month_idx" ON "EnvelopeTransfer"("month");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringSeries_key_key" ON "RecurringSeries"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AlertRule_type_key" ON "AlertRule"("type");

-- CreateIndex
CREATE UNIQUE INDEX "AlertEvent_dedupeKey_key" ON "AlertEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "AlertEvent_createdAt_idx" ON "AlertEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetAccount_provider_label_key" ON "AssetAccount"("provider", "label");

-- CreateIndex
CREATE INDEX "Holding_assetAccountId_idx" ON "Holding"("assetAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_assetAccountId_isin_symbol_key" ON "Holding"("assetAccountId", "isin", "symbol");

-- CreateIndex
CREATE INDEX "ValuationSnapshot_date_idx" ON "ValuationSnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ValuationSnapshot_assetAccountId_date_key" ON "ValuationSnapshot"("assetAccountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AssetTransaction_fingerprint_key" ON "AssetTransaction"("fingerprint");

-- CreateIndex
CREATE INDEX "AssetTransaction_assetAccountId_date_idx" ON "AssetTransaction"("assetAccountId", "date");

-- CreateIndex
CREATE INDEX "Quote_symbol_date_idx" ON "Quote"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_symbol_date_key" ON "Quote"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Benchmark_key_key" ON "Benchmark"("key");

-- CreateIndex
CREATE INDEX "SyncLog_createdAt_idx" ON "SyncLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringSeriesId_fkey" FOREIGN KEY ("recurringSeriesId") REFERENCES "RecurringSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeAllocation" ADD CONSTRAINT "EnvelopeAllocation_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeTransfer" ADD CONSTRAINT "EnvelopeTransfer_fromEnvelopeId_fkey" FOREIGN KEY ("fromEnvelopeId") REFERENCES "Envelope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeTransfer" ADD CONSTRAINT "EnvelopeTransfer_toEnvelopeId_fkey" FOREIGN KEY ("toEnvelopeId") REFERENCES "Envelope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "AssetAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationSnapshot" ADD CONSTRAINT "ValuationSnapshot_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "AssetAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "AssetAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
