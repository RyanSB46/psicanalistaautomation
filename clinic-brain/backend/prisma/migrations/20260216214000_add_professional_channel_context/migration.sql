ALTER TABLE "profissionais"
  ADD COLUMN "professional_type" TEXT,
  ADD COLUMN "instance_name" TEXT,
  ADD COLUMN "evolution_api_key" TEXT;

CREATE UNIQUE INDEX "profissionais_instance_name_key"
  ON "profissionais"("instance_name");
