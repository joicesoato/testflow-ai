# Documentação técnica — TestFlow AI

## 1. Visão geral

O TestFlow AI é uma plataforma SaaS para organização e automação inteligente de testes de APIs REST. O fluxo principal é **projeto → caso de teste → execução → histórico**. A solução permite cadastrar projetos e cenários, gerar casos com auxílio de IA, executar requisições HTTP, consultar resultados e gerenciar o acesso conforme o plano contratado.

Projeto acadêmico desenvolvido para a disciplina **ISW055 — Introdução à Computação em Nuvem**, do curso de Tecnologia em Sistemas Inteligentes da **FATEC Pompeia**, semestre 2026.2.

- Aplicação: https://joice-brito-isw055.lapps.studio/
- Repositório: https://github.com/joicesoato/testflow-ai

## 2. Funcionalidades

### Gestão e execução de testes
- Cadastro, edição, consulta e exclusão de projetos e casos de teste.
- Associação dos registros ao usuário autenticado.
- Configuração de método HTTP, endpoint relativo, cabeçalhos, corpo e status esperado.
- Execução das requisições no backend e registro de status, duração, resposta resumida e erros.
- Histórico de execuções por projeto.

A validação HTTP automática compara o status recebido com o esperado. Não representa uma suíte completa de assertions sobre todos os campos do corpo da resposta.

### Inteligência artificial
A integração com a API da Groq permite gerar cenários positivos, negativos e de validação a partir do objetivo informado e do contexto do projeto. Os dados retornados são validados antes de serem persistidos. O modelo é configurável por `GROQ_MODEL`; a IA auxilia a elaboração dos testes, mas não substitui a revisão profissional.

### Simulação sem URL
Recurso disponível no plano Pro. Avalia dados JSON localmente, sem realizar chamadas de rede. Inclui operadores como `equals`, `not_equals`, `exists`, `contains`, `greater_than`, `less_than`, `is_true`, `is_false` e `is_type`. O resultado apresenta verificações aprovadas e reprovadas.

### Planos e cobrança
| Recurso | Free | Pro |
|---|---:|---:|
| Projetos | Até 2 | Ilimitados |
| Execuções HTTP | Até 3 por mês | Sem limite mensal definido pelo plano |
| Simulação sem URL | Não | Sim |
| Histórico | Disponível | Disponível |

As regras são verificadas no backend. A integração Stripe utiliza Checkout recorrente, Billing Portal e webhooks assinados. O sistema persiste cliente, assinatura, preço, plano, estado e período de cobrança em `assinaturas`. Os identificadores de eventos são registrados em `stripe_eventos`, cuja restrição única auxilia a impedir processamento duplicado. A validação de assinatura e timestamp protege o recebimento dos webhooks.

### Administração e auditoria
O painel administrativo apresenta indicadores de usuários, assinaturas, execuções e informações de cobrança disponíveis. Eventos relevantes são enviados ao serviço de logs e processados com Redis Streams.

## 3. Arquitetura

| Componente | Tecnologia | Responsabilidade |
|---|---|---|
| Frontend | React 19, TypeScript, Vite 6, React Router | Interface e navegação |
| Aplicação | Node.js 22, Express 5 | APIs e regras de negócio |
| Autenticação | auth-service, JWT, bcryptjs | Cadastro, login e validação de sessão |
| Autorização | RBAC e permissões | Controle de acesso |
| Banco | MariaDB 11 | Dados de usuários, domínio e assinaturas |
| Auditoria | log-service | Recepção e consulta de eventos |
| Mensageria | Redis 7 / Redis Streams | Fluxo de eventos de auditoria |
| Objetos | MinIO | Serviço provisionado para armazenamento |
| IA | Groq API | Geração assistida de casos |
| Pagamentos | Stripe | Assinaturas, Checkout, Portal e webhooks |
| Infraestrutura | Docker, Docker Compose, Docker Hub e Portainer | Empacotamento e implantação |
| CI/CD | GitHub Actions | Verificações, build e publicação condicional |

### Comunicação
1. O navegador acessa a aplicação pelo domínio HTTPS.
2. A aplicação Express recebe as requisições e aplica as regras de negócio.
3. Nas operações autenticadas, o backend valida a sessão e as permissões com o serviço de autenticação.
4. Os dados de domínio são consultados ou persistidos no MariaDB, respeitando o usuário proprietário.
5. Eventos relevantes são enviados ao log-service e encaminhados ao Redis Streams.
6. A geração assistida consulta a Groq API pelo backend.
7. O fluxo de assinatura comunica-se com o Stripe; os webhooks atualizam o estado da assinatura no banco.

### Implantação
A Stack de produção é definida em `docker-compose.portainer.yml` e contém os serviços `app`, `auth-service`, `log-service`, `redis` e `minio`. A aplicação publica a porta interna 3000 na porta 8211 do host. Os serviços internos comunicam-se pela rede Docker. O MariaDB é externo à Stack e acessado por variáveis de ambiente. Redis e MinIO utilizam volumes persistentes.

O deploy utiliza imagens publicadas no Docker Hub e é gerenciado pelo Portainer. As variáveis e credenciais são configuradas no ambiente de execução; seus valores secretos não devem ser armazenados no repositório.

**Limitação:** o MinIO está provisionado na infraestrutura, mas o fluxo de upload e recuperação de arquivos de evidência ainda não está integrado à aplicação.

## 4. Modelo de dados

As entidades centrais incluem:
- `usuarios`: contas e identidade.
- `projetos`: projetos de teste associados ao proprietário.
- `casos_teste`: cenários HTTP ou de simulação.
- `execucoes`: resultados, duração, status e dados resumidos.
- `evidencias`: estrutura de metadados prevista para arquivos associados às execuções; upload ainda não integrado.
- `assinaturas`: plano e identificadores de cobrança Stripe vinculados ao usuário.
- `stripe_eventos`: identificadores únicos de eventos Stripe recebidos.

As migrações SQL do diretório `database/` definem a estrutura do domínio e da cobrança. As chaves estrangeiras preservam a integridade referencial; a autorização e a validação de propriedade também são aplicadas no backend.

## 5. Segurança

- Senhas armazenadas com hash bcryptjs.
- Autenticação por JWT e autorização por permissões RBAC.
- Isolamento dos dados por usuário proprietário.
- Consultas parametrizadas ao MariaDB.
- Segredos e credenciais fornecidos por variáveis de ambiente.
- Helmet, política de segurança de conteúdo e rate limiting.
- Mensagens genéricas para erros internos.
- Validação de assinatura e timestamp dos webhooks Stripe.

### Proteções do executor HTTP
O executor aceita endpoints relativos ao domínio base do projeto, valida a resolução DNS e bloqueia endereços locais, privados e não permitidos. Também não segue redirecionamentos, aplica timeout e limita o tamanho da resposta armazenada. Essas medidas reduzem riscos de SSRF e de consumo excessivo de recursos.

## 6. Configuração

Principais grupos de variáveis de ambiente:
- Aplicação: `PORT`, `APP_URL`, `TRUST_PROXY_HOPS`.
- Banco: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- Segurança e serviços: `JWT_SECRET`, `SESSION_SECRET`, `INTERNAL_SERVICE_SECRET`, `AUTH_SERVICE_URL`, `LOG_SERVICE_URL`.
- E-mail: `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`.
- MinIO: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`.
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`.
- Groq: `GROQ_API_KEY`, `GROQ_MODEL`.

Nunca publique arquivos `.env`, tokens, chaves de API ou senhas em commits, issues ou capturas de tela.

## 7. Rotas principais

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/projetos` | Listar projetos do usuário |
| POST | `/api/projetos` | Criar projeto |
| GET/PUT/DELETE | `/api/projetos/:id` | Consultar, atualizar e excluir projeto |
| GET/POST | `/api/projetos/:projetoId/casos` | Consultar e criar casos |
| POST | `/api/projetos/:projetoId/casos/gerar-ia` | Gerar casos com Groq |
| POST | `/api/projetos/:projetoId/casos/:casoId/executar` | Executar teste HTTP |
| POST | `/api/projetos/:projetoId/casos-simulacao` | Criar simulação |
| POST | `/api/projetos/:projetoId/casos/:casoId/executar-simulacao` | Executar simulação |
| GET | `/api/projetos/:projetoId/execucoes` | Consultar histórico |
| GET | `/api/billing/status` | Consultar plano |
| POST | `/api/billing/checkout` | Criar Checkout |
| POST | `/api/billing/portal` | Abrir Portal de cobrança |
| POST | `/api/billing/webhook` | Receber eventos Stripe |
| GET | `/api/admin/dashboard` | Painel administrativo |

As rotas de domínio exigem autenticação; o webhook Stripe utiliza validação própria de assinatura.

## 8. Testes e integração contínua

O repositório contém testes automatizados e o workflow `.github/workflows/ci-cd.yml`, que contempla instalação de dependências, testes do backend, build do frontend, construção de imagens e verificações de saúde dos serviços em CI. A publicação no Docker Hub e o acionamento de deploy dependem dos secrets e da configuração do ambiente.

A validação funcional no ambiente publicado deve ser registrada separadamente. Para comprovação acadêmica, são relevantes as evidências de cadastro/login, gestão e execução de testes, geração por IA, aplicação dos limites Free, ativação Pro por Checkout/webhook e implantação da Stack.

## 9. Limitações e evoluções

- O armazenamento de evidências no MinIO ainda precisa ser integrado ao fluxo da aplicação.
- A validação de testes HTTP compara o status esperado; assertions detalhadas estão disponíveis na simulação.
- A geração por IA depende de chave Groq e disponibilidade externa.
- Checkout, Portal e atualização de assinatura dependem da configuração Stripe e da entrega dos webhooks.
- A CI não substitui testes funcionais no ambiente publicado.

Evoluções possíveis incluem integrar evidências ao MinIO, ampliar as assertions HTTP, expandir testes de integração e segurança e fortalecer o monitoramento.

## 10. Contexto acadêmico

Projeto desenvolvido para a disciplina **ISW055 — Introdução à Computação em Nuvem**, curso de Tecnologia em Sistemas Inteligentes, **FATEC Pompeia**, semestre 2026.2.

- Repositório: https://github.com/joicesoato/testflow-ai
- Aplicação: https://joice-brito-isw055.lapps.studio/

Esta documentação descreve a arquitetura e as funcionalidades implementadas conforme o código do projeto. A comprovação de funcionamento em ambiente publicado deve ser acompanhada de capturas de tela, registros de execução, histórico do GitHub e evidências da infraestrutura.
