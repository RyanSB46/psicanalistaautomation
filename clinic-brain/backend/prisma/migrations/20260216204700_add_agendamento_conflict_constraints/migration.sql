CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "agendamentos"
ADD CONSTRAINT "agendamentos_intervalo_valido_check"
CHECK ("ends_at" > "starts_at");

ALTER TABLE "agendamentos"
ADD CONSTRAINT "agendamentos_sem_conflito_horario_excl"
EXCLUDE USING GIST (
  "profissional_id" WITH =,
  tstzrange("starts_at", "ends_at", '[)') WITH &&
)
WHERE ("status" <> 'CANCELADO'::"AppointmentStatus");
