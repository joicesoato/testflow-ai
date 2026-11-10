# TestFlow AI

Plataforma para organizar projetos, gerar casos de teste com IA e executar verificações reais em APIs REST.

Projeto acadêmico da disciplina **ISW055 — Introdução à Computação em Nuvem**, CST em Sistemas Inteligentes, FATEC Pompeia, semestre 2026.2.

## O que está implementado nesta versão

- Landing page e interface React/TypeScript.
- Cadastro/login integrado ao serviço de autenticação.
- CRUD de projetos com isolamento por usuário.
- Cadastro e exclusão de casos de teste.
- Geração de cenários com Gemini API e gravação dos casos no MariaDB.
- Execução real de requisições HTTP a partir do backend.
- Cenários de simulação sem URL, com dados JSON e verificações determinísticas executadas localmente, sem chamadas de rede.
- Comparação entre status HTTP recebido e esperado nos cenários HTTP.
- Histórico de execuções persistido no MariaDB.
- Registro de eventos no serviço de auditoria.
- Limite de tempo e tamanho de resposta, bloqueio de destinos locais/privados e de redirecionamentos durante a execução.

**Limites desta entrega:** a IA gera casos de teste a partir do contexto informado e da URL base cadastrada. Ela não descobre automaticamente toda a documentação da API. Nos testes HTTP, a validação automática compara o status recebido; a simulação sem URL avalia apenas as verificações declaradas sobre os dados fornecidos e não representa uma chamada real. O checkout e o portal Stripe dependem de chaves, preço recorrente e webhook configurados no ambiente. Upload de arquivos de evidência ainda não está implementado. A stack ainda precisa ser validada no Codespace/Portainer de destino.

## Tecnologias

- Node.js 22, Express 5 e `fetch` nativo.
- React 19, TypeScript, Vite 6 e React Router.
- MariaDB 11.
- Serviço de autenticação JWT.
- Serviço de logs com Redis Streams.
- Gemini API (`generateContent`) para geração de casos.
- Docker Compose.

## Configuração no Codespaces

### 1. Criar o arquivo `.env`

Na raiz do repositório:

```bash
cp .env.example .env
```

Preencha as credenciais locais. Não publique nem envie o arquivo `.env`.

Para um Codespace de desenvolvimento, gere segredos fortes para `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `JWT_SECRET`, `SESSION_SECRET`, `INTERNAL_SERVICE_SECRET` e `MINIO_SECRET_KEY`. Use valores diferentes entre si.

Defina também:

```env
DB_HOST=db
DB_NAME=testflow_ai
DB_USER=testflow
EMAIL_VERIFICATION_REQUIRED=false
GEMINI_API_KEY=sua_chave_configurada_localmente
GEMINI_MODEL=gemini-3.5-flash-lite
```

`EMAIL_VERIFICATION_REQUIRED=false` é somente uma conveniência para desenvolvimento local sem SMTP. Em produção, mantenha `true` e configure um serviço de e-mail válido.

A chave Gemini é usada exclusivamente pelo backend. Nunca a coloque no React, em `VITE_*`, em commits, prints ou mensagens.

### 2. Instalar dependências e compilar o frontend

```bash
npm ci
npm --prefix frontend ci
npm --prefix frontend run build
npm test
```

### 3. Subir os serviços de infraestrutura

```bash
docker compose up -d db redis minio auth-service log-service
docker compose ps
```

Aguarde MariaDB e os serviços ficarem saudáveis.

### 4. Aplicar a migração de domínio

As migrações `database/migration-v8-testflow.sql` e `database/migration-v9-saas.sql` criam/atualizam o domínio, incluindo projetos, casos, execuções, evidências, modo de simulação e controle de assinaturas. A v8 deve ser aplicada primeiro; a v9 deve ser aplicada depois, no banco correto, após backup.

```bash
docker compose exec -T db sh -c 'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' < database/migration-v8-testflow.sql
docker compose exec -T db sh -c 'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' < database/migration-v9-saas.sql
```

Confira as tabelas antes de prosseguir. Não execute `docker compose down -v` para tentar corrigir problemas: isso remove volumes e pode apagar dados.

### 5. Subir a aplicação

```bash
docker compose up -d --build app
docker compose ps
```

A aplicação local fica disponível na porta `3000`. No Codespaces, abra a porta encaminhada pelo painel Ports.

## Fluxo principal

1. Crie uma conta e entre na plataforma.
2. Crie um projeto e informe a URL base pública da API.
3. Abra os detalhes do projeto.
4. Use **Gerar casos com IA** para gerar cenários com Gemini ou cadastre um caso manualmente.
5. Clique em **Executar** para realizar a chamada HTTP.
6. Confira o status recebido, o tempo de resposta e o conteúdo retornado.

Para criar um teste sem URL, use o painel **Simulação sem URL** nos detalhes do projeto. Informe os dados JSON e as verificações desejadas. Os operadores disponíveis são `equals`, `not_equals`, `exists`, `not_exists`, `contains`, `greater_than`, `less_than`, `is_true`, `is_false` e `is_type`. Ao executar, a plataforma avalia os dados localmente e identifica explicitamente o resultado como simulação; nenhuma requisição HTTP é enviada.

A página **Assinatura** apresenta o estado do plano, permite iniciar o Checkout e abrir o portal de cobrança. Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` e `APP_URL` no servidor. No Dashboard Stripe, cadastre o endpoint `/api/billing/webhook` do seu domínio e habilite `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` e `customer.deleted`. Use somente chaves de teste durante a validação.

Para uma primeira validação, pode ser usada uma API pública de testes, como `https://jsonplaceholder.typicode.com`. Exemplo de caso: método `GET`, endpoint `/posts/1`, status esperado `200`.

## API de domínio

Todas as rotas abaixo exigem token Bearer válido.

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/api/projetos/:projetoId/casos` | Listar casos do projeto |
| POST | `/api/projetos/:projetoId/casos` | Criar caso manual |
| POST | `/api/projetos/:projetoId/casos/gerar-ia` | Gerar e salvar casos com Gemini |
| DELETE | `/api/projetos/:projetoId/casos/:casoId` | Excluir caso |
| POST | `/api/projetos/:projetoId/casos/:casoId/executar` | Executar caso HTTP |
| POST | `/api/projetos/:projetoId/casos-simulacao` | Criar cenário sem URL |
| POST | `/api/projetos/:projetoId/casos/:casoId/executar-simulacao` | Executar simulação local |
| GET | `/api/billing/status` | Consultar plano |
| POST | `/api/billing/checkout` | Criar Checkout Stripe |
| POST | `/api/billing/portal` | Abrir portal de cobrança |
| POST | `/api/billing/webhook` | Receber eventos Stripe assinados |
| GET | `/api/admin/dashboard` | Consultar métricas e eventos administrativos |
| GET | `/api/projetos/:projetoId/execucoes` | Consultar histórico recente |

Exemplo de corpo para criar um caso:

```json
{
  "titulo": "Consultar post por ID",
  "metodo": "GET",
  "endpoint": "/posts/1",
  "headers": {},
  "corpo": null,
  "status_esperado": 200
}
```

Para gerar casos com IA:

```json
{
  "objetivo": "API de posts com consulta e listagem"
}
```

## Segurança da execução HTTP

A execução acontece no servidor, nunca diretamente no navegador. O executor:

- Aceita somente caminhos relativos no endpoint do caso.
- Mantém a chamada no mesmo domínio da URL base do projeto.
- Rejeita endereços locais, privados e de metadados após resolução DNS.
- Não segue redirecionamentos.
- Aplica timeout de 10 segundos.
- Limita a resposta armazenada.
- Não executa código arbitrário enviado pelo caso.

Por isso, endpoints `localhost`, IPs privados e serviços internos do Docker não podem ser usados como alvo de teste. Utilize uma API pública ou um ambiente de homologação com endereço público.

## Verificações

```bash
npm test
curl http://localhost:3000/health
curl http://localhost:3000/api/status
```

`npm test` verifica a sintaxe dos serviços Node.js. Isso não substitui os testes de integração com banco, autenticação, Gemini e uma API-alvo real.

## Segurança e publicação

- Não versionar `.env`, chaves Gemini, tokens, senhas ou credenciais.
- Configurar HTTPS e segredos exclusivos no ambiente publicado.
- Manter `EMAIL_VERIFICATION_REQUIRED=true` em produção.
- Aplicar a migração somente após backup e confirmação do banco.
- Configurar `GEMINI_API_KEY` como variável secreta no ambiente de execução.
- Conferir permissões e isolamento entre usuários antes da publicação.
- Revisar `SECURITY.md`, `VALIDACAO.md` e `docker-compose.portainer.yml` antes do deploy.

## Contexto acadêmico

Desenvolvido para a disciplina ISW055 — FATEC Pompeia, semestre 2026.2.
