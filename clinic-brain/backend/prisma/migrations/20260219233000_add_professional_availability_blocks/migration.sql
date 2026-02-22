-- Create table for professional availability blocks
CREATE TABLE "bloqueios_agenda" (
  "id" TEXT NOT NULL,
  "profissional_id" TEXT NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "bloqueios_agenda_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bloqueios_agenda_profissional_id_starts_at_idx"
  ON "bloqueios_agenda"("profissional_id", "starts_at");

CREATE INDEX "bloqueios_agenda_profissional_id_ends_at_idx"
  ON "bloqueios_agenda"("profissional_id", "ends_at");

ALTER TABLE "bloqueios_agenda"
  ADD CONSTRAINT "bloqueios_agenda_profissional_id_fkey"
  FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
