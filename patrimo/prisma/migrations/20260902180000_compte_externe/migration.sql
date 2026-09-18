-- Reference du compte telle qu'elle apparait dans les exports de la banque.
ALTER TABLE "Account" ADD COLUMN "externalRef" TEXT;
CREATE UNIQUE INDEX "Account_externalRef_key" ON "Account"("externalRef");
