-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('AGENDADO', 'CONFIRMADO', 'CANCELADO', 'FALTOU', 'REMARCADO');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('BOT', 'HUMANO', 'PACIENTE');

-- CreateTable
CREATE TABLE "profissionais" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "phone_number" TEXT,
    "specialty" TEXT,
    "consultation_fee_cents" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profissionais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacientes" (
    "id" TEXT NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "email" TEXT,
    "first_consultation_at" TIMESTAMPTZ(3),
    "status" "PatientStatus" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamentos" (
    "id" TEXT NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "paciente_id" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'AGENDADO',
    "notes" TEXT,
    "remarcado_de_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interacoes" (
    "id" TEXT NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "paciente_id" TEXT,
    "agendamento_id" TEXT,
    "mensagem" TEXT NOT NULL,
    "tipo" "InteractionType" NOT NULL,
    "message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes" (
    "id" TEXT NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "mensagem_boas_vindas" TEXT,
    "mensagem_confirmacao" TEXT,
    "politica_cancelamento" TEXT,
    "lembrete_d1_ativo" BOOLEAN NOT NULL DEFAULT true,
    "lembrete_2h_ativo" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes_whatsapp" (
    "id" TEXT NOT NULL,
    "profissional_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "current_state" TEXT NOT NULL DEFAULT 'INITIAL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_message_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessoes_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profissionais_email_key" ON "profissionais"("email");

-- CreateIndex
CREATE INDEX "pacientes_profissional_id_idx" ON "pacientes"("profissional_id");

-- CreateIndex
CREATE INDEX "pacientes_profissional_id_status_idx" ON "pacientes"("profissional_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_profissional_id_phone_number_key" ON "pacientes"("profissional_id", "phone_number");

-- CreateIndex
CREATE INDEX "agendamentos_profissional_id_starts_at_idx" ON "agendamentos"("profissional_id", "starts_at");

-- CreateIndex
CREATE INDEX "agendamentos_profissional_id_status_idx" ON "agendamentos"("profissional_id", "status");

-- CreateIndex
CREATE INDEX "agendamentos_paciente_id_starts_at_idx" ON "agendamentos"("paciente_id", "starts_at");

-- CreateIndex
CREATE INDEX "interacoes_profissional_id_created_at_idx" ON "interacoes"("profissional_id", "created_at");

-- CreateIndex
CREATE INDEX "interacoes_paciente_id_created_at_idx" ON "interacoes"("paciente_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_profissional_id_key" ON "configuracoes"("profissional_id");

-- CreateIndex
CREATE INDEX "sessoes_whatsapp_profissional_id_updated_at_idx" ON "sessoes_whatsapp"("profissional_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_whatsapp_profissional_id_phone_number_key" ON "sessoes_whatsapp"("profissional_id", "phone_number");

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_remarcado_de_id_fkey" FOREIGN KEY ("remarcado_de_id") REFERENCES "agendamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes" ADD CONSTRAINT "configuracoes_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes_whatsapp" ADD CONSTRAINT "sessoes_whatsapp_profissional_id_fkey" FOREIGN KEY ("profissional_id") REFERENCES "profissionais"("id") ON DELETE CASCADE ON UPDATE CASCADE;
