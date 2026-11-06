-- Seed opcional e idempotente do TestFlow AI.
-- Substitua pelo e-mail de uma conta real já cadastrada. Não cria usuários.
SET @testflow_email = 'SUBSTITUA_PELO_EMAIL_DA_CONTA_CADASTRADA';
SET @testflow_usuario_id = (SELECT id FROM usuarios WHERE email = @testflow_email LIMIT 1);

INSERT INTO projetos (usuario_id, nome, descricao, url_base, ambiente)
SELECT @testflow_usuario_id, 'API de demonstração',
       'Projeto de exemplo para validar a organização dos casos de teste.',
       'https://api.exemplo.com', 'homologacao'
WHERE @testflow_usuario_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM projetos WHERE usuario_id = @testflow_usuario_id AND nome = 'API de demonstração');

SET @testflow_projeto_id = (
  SELECT id FROM projetos
  WHERE usuario_id = @testflow_usuario_id AND nome = 'API de demonstração'
  LIMIT 1
);

INSERT INTO casos_teste (projeto_id, usuario_id, titulo, descricao, metodo, endpoint, status_esperado)
SELECT @testflow_projeto_id, @testflow_usuario_id, 'Verificar disponibilidade da API',
       'Exemplo ilustrativo. Substitua o endpoint por um serviço sob sua autorização.',
       'GET', '/health', 200
WHERE @testflow_usuario_id IS NOT NULL AND @testflow_projeto_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM casos_teste WHERE projeto_id = @testflow_projeto_id AND usuario_id = @testflow_usuario_id AND titulo = 'Verificar disponibilidade da API');

INSERT INTO casos_teste (projeto_id, usuario_id, titulo, descricao, metodo, endpoint, status_esperado)
SELECT @testflow_projeto_id, @testflow_usuario_id, 'Validar recurso inexistente',
       'Exemplo ilustrativo de resposta esperada para recurso não encontrado.',
       'GET', '/recurso-inexistente', 404
WHERE @testflow_usuario_id IS NOT NULL AND @testflow_projeto_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM casos_teste WHERE projeto_id = @testflow_projeto_id AND usuario_id = @testflow_usuario_id AND titulo = 'Validar recurso inexistente');

SELECT CASE WHEN @testflow_usuario_id IS NULL
  THEN 'Seed não aplicado: informe o e-mail de uma conta existente.'
  ELSE CONCAT('Seed conferido para o usuário ID ', @testflow_usuario_id, '.')
END AS resultado;
