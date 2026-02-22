-- Add feature flags per professional
ALTER TABLE "configuracoes"
  ADD COLUMN "feature_dashboard_ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "feature_agenda_ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "feature_acao_manual_agenda_ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "feature_pacientes_ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "feature_relatorios_ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "feature_solicitacoes_ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "feature_configuracoes_ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "feature_portal_paciente_ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "feature_webhook_ativo" BOOLEAN NOT NULL DEFAULT true;
