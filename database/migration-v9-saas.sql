-- TestFlow AI — migração v9: simulação sem URL e billing SaaS
-- Execute após migration-v8-testflow.sql. Faça backup antes da aplicação.

ALTER TABLE casos_teste
  MODIFY endpoint VARCHAR(2048) NULL,
  ADD COLUMN IF NOT EXISTS modo_execucao ENUM('http','simulacao') NOT NULL DEFAULT 'http',
  ADD COLUMN IF NOT EXISTS dados_teste JSON NULL,
  ADD COLUMN IF NOT EXISTS assertions_json JSON NULL;

ALTER TABLE execucoes
  ADD COLUMN IF NOT EXISTS modo_execucao ENUM('http','simulacao') NOT NULL DEFAULT 'http',
  ADD COLUMN IF NOT EXISTS resultado_detalhado_json JSON NULL;

CREATE TABLE IF NOT EXISTS assinaturas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  stripe_customer_id VARCHAR(255) NULL,
  stripe_subscription_id VARCHAR(255) NULL,
  stripe_price_id VARCHAR(255) NULL,
  plano VARCHAR(40) NOT NULL DEFAULT 'free',
  status VARCHAR(40) NOT NULL DEFAULT 'inactive',
  periodo_inicio DATETIME NULL,
  periodo_fim DATETIME NULL,
  cancelar_no_fim BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assinaturas_usuario (usuario_id),
  UNIQUE KEY uq_assinaturas_customer (stripe_customer_id),
  UNIQUE KEY uq_assinaturas_subscription (stripe_subscription_id),
  CONSTRAINT fk_assinaturas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stripe_eventos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  stripe_event_id VARCHAR(255) NOT NULL,
  tipo VARCHAR(120) NOT NULL,
  processado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stripe_evento (stripe_event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
