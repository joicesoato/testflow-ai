# Plano de implementação das APIs

Ordem sugerida para a próxima etapa, mantendo cada etapa pequena e testável.

## 1. Base comum
- Integrar autenticação JWT do auth-service ao servidor web.
- Middleware `requireAuth`.
- Middleware `requireRole` com `admin`, `analista` e `desenvolvedor`.
- Resolver usuário exclusivamente pelo token validado.
- Padronizar erros `400`, `401`, `403`, `404`, `409`, `413`, `422` e `500`.

## 2. Projetos
- `GET /api/projetos`
- `POST /api/projetos`
- `GET /api/projetos/:id`
- `PATCH /api/projetos/:id`
- `DELETE /api/projetos/:id`

Todas as operações devem filtrar por `usuario_id` obtido da sessão/token. Admin não recebe acesso automático aos projetos privados de outras pessoas.

## 3. Casos de teste
- `GET /api/projetos/:id/casos`
- `POST /api/projetos/:id/casos`
- `GET /api/casos/:id`
- `PATCH /api/casos/:id`
- `DELETE /api/casos/:id`

Validar se o projeto pertence ao usuário antes de criar ou consultar casos.

## 4. Execuções
- `POST /api/casos/:id/execucoes`
- `GET /api/casos/:id/execucoes`
- `GET /api/execucoes/:id`

Executar somente destinos autorizados; validar SSRF, DNS, redirect, timeout, tamanho máximo de resposta e métodos permitidos. Registrar resultado e duração.

## 5. Evidências e auditoria
- `POST /api/execucoes/:id/evidencias`
- `GET /api/execucoes/:id/evidencias`
- `GET /api/evidencias/:id`
- Registrar eventos de criação, alteração, exclusão e execução.
- Upload no MinIO com chave gerada pelo servidor, bucket privado e metadados no MariaDB.

## 6. Testes mínimos obrigatórios
- Fluxo feliz para cada endpoint.
- Entrada inválida e payload excessivo.
- Sem token (`401`).
- Papel sem permissão (`403`).
- Usuário A tentando acessar/alterar/excluir ID do usuário B (`403` ou `404`).
- SQL injection em campos de texto.
- SSRF para localhost, IP privado, metadata e redirects.
- Upload com extensão/MIME divergente, arquivo grande e arquivo inválido.
- Indisponibilidade de MariaDB, Redis e MinIO.
