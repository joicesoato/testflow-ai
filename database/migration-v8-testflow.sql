-- TestFlow AI — migração de domínio v8
-- Pré-requisitos: tabela usuarios existente; usuarios.id deve ser INT e InnoDB.
-- Faça backup do banco antes de executar. Não executar automaticamente no deploy.

CREATE TABLE IF NOT EXISTS projetos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  nome VARCHAR(120) NOT NULL,
  descricao TEXT NULL,
  url_base VARCHAR(2048) NULL,
  ambiente VARCHAR(40) NOT NULL DEFAULT 'desenvolvimento',
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_projetos_id_usuario (id, usuario_id),
  UNIQUE KEY uq_projetos_nome_usuario (usuario_id, nome),
  KEY idx_projetos_usuario_data (usuario_id, criado_em),
  CONSTRAINT fk_projetos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS casos_teste (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  projeto_id BIGINT UNSIGNED NOT NULL,
  usuario_id INT NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  descricao TEXT NULL,
  metodo ENUM('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS') NOT NULL DEFAULT 'GET',
  endpoint VARCHAR(2048) NOT NULL,
  headers JSON NULL,
  corpo JSON NULL,
  status_esperado SMALLINT UNSIGNED NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_casos_id_projeto_usuario (id, projeto_id, usuario_id),
  KEY idx_casos_projeto_usuario (projeto_id, usuario_id),
  CONSTRAINT fk_casos_projeto_usuario FOREIGN KEY (projeto_id, usuario_id)
    REFERENCES projetos(id, usuario_id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_casos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS execucoes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  caso_teste_id BIGINT UNSIGNED NOT NULL,
  projeto_id BIGINT UNSIGNED NOT NULL,
  usuario_id INT NOT NULL,
  status ENUM('sucesso','falha','erro','pendente') NOT NULL DEFAULT 'pendente',
  status_http SMALLINT UNSIGNED NULL,
  duracao_ms INT UNSIGNED NULL,
  resposta_resumo MEDIUMTEXT NULL,
  erro_resumo TEXT NULL,
  executado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_execucoes_id_projeto_usuario (id, projeto_id, usuario_id),
  KEY idx_execucoes_caso_projeto_usuario (caso_teste_id, projeto_id, usuario_id),
  KEY idx_execucoes_usuario_data (usuario_id, executado_em),
  CONSTRAINT fk_execucoes_caso_projeto_usuario
    FOREIGN KEY (caso_teste_id, projeto_id, usuario_id)
    REFERENCES casos_teste(id, projeto_id, usuario_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evidencias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  execucao_id BIGINT UNSIGNED NOT NULL,
  projeto_id BIGINT UNSIGNED NOT NULL,
  usuario_id INT NOT NULL,
  nome_arquivo VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  tamanho_bytes INT UNSIGNED NOT NULL,
  objeto_key VARCHAR(500) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_evidencias_execucao_objeto (execucao_id, objeto_key),
  KEY idx_evidencias_usuario_projeto (usuario_id, projeto_id),
  CONSTRAINT fk_evidencias_execucao_projeto_usuario
    FOREIGN KEY (execucao_id, projeto_id, usuario_id)
    REFERENCES execucoes(id, projeto_id, usuario_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
