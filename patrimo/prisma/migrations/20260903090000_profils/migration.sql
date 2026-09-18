-- Passage du mono-utilisateur au multi-profils.
--
-- La table Settings (une seule ligne, id = 1) devient la table Profile, et
-- chaque table de donnees personnelles recoit une colonne profileId non nulle.
-- Les installations existantes sont reprises : la ligne Settings devient le
-- profil proprietaire, et toutes les donnees deja presentes lui sont
-- rattachees. Une base vierge passe la migration sans rien a reprendre.

-- 1. Table des profils ------------------------------------------------------

CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT '#3d7ea6',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "budgetMode" "BudgetMode" NOT NULL DEFAULT 'TRACKING',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "monthStartDay" INTEGER NOT NULL DEFAULT 1,
    "riskProfile" INTEGER NOT NULL DEFAULT 5,
    "horizonYears" INTEGER NOT NULL DEFAULT 15,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Profile_name_key" ON "Profile"("name");

-- Reprise de l'installation existante, s'il y en a une. Le profil herite du
-- code PIN et des reglages : personne n'a besoin de reconfigurer quoi que ce
-- soit apres la mise a jour. onboarded = true parce qu'une installation deja
-- en service n'a pas a repasser par le parcours de demarrage.
INSERT INTO "Profile" (
    "id", "name", "pinHash", "isOwner", "sortOrder", "budgetMode", "currency",
    "monthStartDay", "riskProfile", "horizonYears", "aiEnabled", "onboarded",
    "failedPinAttempts", "lockedUntil", "createdAt", "updatedAt"
)
SELECT
    'profile_owner_1', 'Moi', "pinHash", true, 0, "budgetMode", "currency",
    "monthStartDay", "riskProfile", "horizonYears", "aiEnabled", true,
    0, NULL, "createdAt", CURRENT_TIMESTAMP
FROM "Settings" WHERE "id" = 1;

-- 2. Colonnes profileId : ajout, reprise, puis passage en NOT NULL ----------

ALTER TABLE "Account"            ADD COLUMN "profileId" TEXT;
ALTER TABLE "Category"           ADD COLUMN "profileId" TEXT;
ALTER TABLE "Transaction"        ADD COLUMN "profileId" TEXT;
ALTER TABLE "ImportBatch"        ADD COLUMN "profileId" TEXT;
ALTER TABLE "CategoryRule"       ADD COLUMN "profileId" TEXT;
ALTER TABLE "Budget"             ADD COLUMN "profileId" TEXT;
ALTER TABLE "Envelope"           ADD COLUMN "profileId" TEXT;
ALTER TABLE "EnvelopeAllocation" ADD COLUMN "profileId" TEXT;
ALTER TABLE "EnvelopeTransfer"   ADD COLUMN "profileId" TEXT;
ALTER TABLE "RecurringSeries"    ADD COLUMN "profileId" TEXT;
ALTER TABLE "AlertRule"          ADD COLUMN "profileId" TEXT;
ALTER TABLE "AlertEvent"         ADD COLUMN "profileId" TEXT;
ALTER TABLE "AssetAccount"       ADD COLUMN "profileId" TEXT;
ALTER TABLE "Holding"            ADD COLUMN "profileId" TEXT;
ALTER TABLE "ValuationSnapshot"  ADD COLUMN "profileId" TEXT;
ALTER TABLE "AssetTransaction"   ADD COLUMN "profileId" TEXT;
ALTER TABLE "SyncLog"            ADD COLUMN "profileId" TEXT;

UPDATE "Account"            SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "Category"           SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "Transaction"        SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "ImportBatch"        SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "CategoryRule"       SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "Budget"             SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "Envelope"           SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "EnvelopeAllocation" SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "EnvelopeTransfer"   SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "RecurringSeries"    SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "AlertRule"          SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "AlertEvent"         SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "AssetAccount"       SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "Holding"            SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "ValuationSnapshot"  SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "AssetTransaction"   SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;
UPDATE "SyncLog"            SET "profileId" = 'profile_owner_1' WHERE "profileId" IS NULL;

-- Une ligne orpheline signifierait des donnees sans proprietaire : plutot que
-- de les rattacher au hasard, la migration echoue et laisse la base intacte.
ALTER TABLE "Account"            ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "Category"           ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "Transaction"        ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "ImportBatch"        ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "CategoryRule"       ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "Budget"             ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "Envelope"           ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "EnvelopeAllocation" ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "EnvelopeTransfer"   ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "RecurringSeries"    ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "AlertRule"          ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "AlertEvent"         ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "AssetAccount"       ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "Holding"            ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "ValuationSnapshot"  ALTER COLUMN "profileId" SET NOT NULL;
ALTER TABLE "AssetTransaction"   ALTER COLUMN "profileId" SET NOT NULL;

-- 3. Contraintes d'unicite portees au niveau du profil ----------------------
--
-- Sans cela, l'ami qui cree un compte "Compte courant" se verrait refuser la
-- creation parce que le proprietaire en a deja un.

DROP INDEX "Account_name_key";
DROP INDEX "Account_externalRef_key";
CREATE UNIQUE INDEX "Account_profileId_name_key" ON "Account"("profileId", "name");
CREATE UNIQUE INDEX "Account_profileId_externalRef_key" ON "Account"("profileId", "externalRef");
CREATE INDEX "Account_profileId_idx" ON "Account"("profileId");

DROP INDEX "Category_name_parentId_key";
CREATE UNIQUE INDEX "Category_profileId_name_parentId_key" ON "Category"("profileId", "name", "parentId");
CREATE INDEX "Category_profileId_idx" ON "Category"("profileId");

DROP INDEX "Transaction_date_idx";
CREATE INDEX "Transaction_profileId_date_idx" ON "Transaction"("profileId", "date");

CREATE INDEX "ImportBatch_profileId_importedAt_idx" ON "ImportBatch"("profileId", "importedAt");

DROP INDEX "CategoryRule_pattern_match_amountMin_amountMax_key";
DROP INDEX "CategoryRule_priority_idx";
CREATE UNIQUE INDEX "CategoryRule_profileId_pattern_match_amountMin_amountMax_key"
    ON "CategoryRule"("profileId", "pattern", "match", "amountMin", "amountMax");
CREATE INDEX "CategoryRule_profileId_priority_idx" ON "CategoryRule"("profileId", "priority");

DROP INDEX "Budget_month_idx";
CREATE INDEX "Budget_profileId_month_idx" ON "Budget"("profileId", "month");

DROP INDEX "Envelope_name_key";
CREATE UNIQUE INDEX "Envelope_profileId_name_key" ON "Envelope"("profileId", "name");
CREATE INDEX "Envelope_profileId_idx" ON "Envelope"("profileId");

DROP INDEX "EnvelopeAllocation_month_idx";
CREATE INDEX "EnvelopeAllocation_profileId_month_idx" ON "EnvelopeAllocation"("profileId", "month");

DROP INDEX "EnvelopeTransfer_month_idx";
CREATE INDEX "EnvelopeTransfer_profileId_month_idx" ON "EnvelopeTransfer"("profileId", "month");

DROP INDEX "RecurringSeries_key_key";
CREATE UNIQUE INDEX "RecurringSeries_profileId_key_key" ON "RecurringSeries"("profileId", "key");
CREATE INDEX "RecurringSeries_profileId_idx" ON "RecurringSeries"("profileId");

DROP INDEX "AlertRule_type_key";
CREATE UNIQUE INDEX "AlertRule_profileId_type_key" ON "AlertRule"("profileId", "type");

DROP INDEX "AlertEvent_dedupeKey_key";
DROP INDEX "AlertEvent_createdAt_idx";
CREATE UNIQUE INDEX "AlertEvent_profileId_dedupeKey_key" ON "AlertEvent"("profileId", "dedupeKey");
CREATE INDEX "AlertEvent_profileId_createdAt_idx" ON "AlertEvent"("profileId", "createdAt");

DROP INDEX "AssetAccount_provider_label_key";
CREATE UNIQUE INDEX "AssetAccount_profileId_provider_label_key" ON "AssetAccount"("profileId", "provider", "label");
CREATE INDEX "AssetAccount_profileId_idx" ON "AssetAccount"("profileId");

DROP INDEX "Holding_assetAccountId_idx";
CREATE INDEX "Holding_profileId_idx" ON "Holding"("profileId");

DROP INDEX "ValuationSnapshot_date_idx";
CREATE INDEX "ValuationSnapshot_profileId_date_idx" ON "ValuationSnapshot"("profileId", "date");

-- Postgres considere deux NULL comme distincts : l'index unique
-- (assetAccountId, date) ne contraint donc rien sur les lignes consolidees,
-- ou assetAccountId est nul. Cet index partiel garantit une seule ligne
-- consolidee par profil et par jour — c'est lui qui empeche le doublon
-- responsable des variations de patrimoine aberrantes.
CREATE UNIQUE INDEX "ValuationSnapshot_profileId_date_consolidated_key"
    ON "ValuationSnapshot"("profileId", "date") WHERE "assetAccountId" IS NULL;

CREATE INDEX "AssetTransaction_profileId_date_idx" ON "AssetTransaction"("profileId", "date");

DROP INDEX "SyncLog_createdAt_idx";
CREATE INDEX "SyncLog_profileId_createdAt_idx" ON "SyncLog"("profileId", "createdAt");

-- 4. Cles etrangeres --------------------------------------------------------

ALTER TABLE "Account"            ADD CONSTRAINT "Account_profileId_fkey"            FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Category"           ADD CONSTRAINT "Category_profileId_fkey"           FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction"        ADD CONSTRAINT "Transaction_profileId_fkey"        FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportBatch"        ADD CONSTRAINT "ImportBatch_profileId_fkey"        FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryRule"       ADD CONSTRAINT "CategoryRule_profileId_fkey"       FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Budget"             ADD CONSTRAINT "Budget_profileId_fkey"             FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Envelope"           ADD CONSTRAINT "Envelope_profileId_fkey"           FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnvelopeAllocation" ADD CONSTRAINT "EnvelopeAllocation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnvelopeTransfer"   ADD CONSTRAINT "EnvelopeTransfer_profileId_fkey"   FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringSeries"    ADD CONSTRAINT "RecurringSeries_profileId_fkey"    FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlertRule"          ADD CONSTRAINT "AlertRule_profileId_fkey"          FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlertEvent"         ADD CONSTRAINT "AlertEvent_profileId_fkey"         FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetAccount"       ADD CONSTRAINT "AssetAccount_profileId_fkey"       FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Holding"            ADD CONSTRAINT "Holding_profileId_fkey"            FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ValuationSnapshot"  ADD CONSTRAINT "ValuationSnapshot_profileId_fkey"  FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetTransaction"   ADD CONSTRAINT "AssetTransaction_profileId_fkey"   FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SyncLog"            ADD CONSTRAINT "SyncLog_profileId_fkey"            FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Settings a fini son office --------------------------------------------

DROP TABLE "Settings";
