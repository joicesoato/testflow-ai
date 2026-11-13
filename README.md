# TestFlow AI

**Plataforma SaaS para organização e automação inteligente de testes de APIs REST.**

O TestFlow AI centraliza projetos, casos de teste, geração assistida por inteligência artificial, execução de requisições HTTP, simulações locais e histórico de resultados. A plataforma também possui autenticação, controle de permissões, auditoria e estrutura de planos Free e Pro com integração de cobrança recorrente.

Projeto acadêmico desenvolvido individualmente para a disciplina **ISW055 — Introdução à Computação em Nuvem**, do curso de Tecnologia em Sistemas Inteligentes da **FATEC Pompeia**, semestre **2026.2**.

- **Aplicação:** https://joice-brito-isw055.lapps.studio/
- **Repositório:** https://github.com/joicesoato/testflow-ai
- **Disciplina:** https://github.com/siriani

---

## 1. Problema e proposta de valor

O desenvolvimento e a manutenção de APIs REST exigem a criação de cenários, envio de requisições, conferência de respostas e registro de resultados. Quando essas atividades ficam distribuídas entre clientes HTTP, scripts e planilhas, torna-se mais difícil organizar os testes e acompanhar sua evolução.

O TestFlow AI propõe centralizar esse fluxo em uma única plataforma. O usuário organiza seus projetos, cadastra ou gera casos de teste com auxílio de IA, executa verificações e consulta o histórico. A solução é direcionada principalmente a desenvolvedores, profissionais de QA, freelancers e pequenas equipes que trabalham com APIs REST.

## 2. Funcionalidades implementadas

### Gestão de projetos e casos de teste
- Cadastro, consulta, atualização e exclusão de projetos.
- Associação dos projetos ao usuário autenticado.
- Cadastro, edição, consulta e exclusão de casos de teste.
- Configuração de método HTTP, endpoint relativo, cabeçalhos, corpo e status esperado.
- Histórico de execuções associado ao projeto, caso e usuário.

### Geração assistida por inteligência artificial
- Integração backend com a API da Groq.
- Geração de cenários positivos, negativos e de validação a partir do objetivo informado e do contexto cadastrado no projeto.
- Validação dos dados retornados pela IA antes de persistir os casos no MariaDB.
- Modelo configurável pela variável `GROQ_MODEL`; o padrão atual é `openai/gpt-oss-120b`.

A IA auxilia na elaboração dos cenários. Ela não substitui a validação do profissional de QA e não descobre automaticamente toda a documentação da API.

### Execução de testes HTTP
- Execução das requisições no backend, não diretamente no navegador.
- Comparação entre o status HTTP recebido e o status esperado.
- Registro do resultado, duração, resposta resumida e eventuais erros.
- Timeout de 10 segundos e limite para o conteúdo de resposta armazenado.
- Restrição dos endpoints a caminhos relativos dentro do domínio base cadastrado.

Na versão atual, a validação automática dos testes HTTP compara o status recebido com o esperado. Não representa uma suíte completa de assertions sobre todos os campos do corpo da resposta.

### Simulação sem URL — recurso Pro
- Criação de cenários com dados JSON, sem cadastrar uma URL de API.
- Avaliação local e determinística, sem realizar chamadas de rede.
- Operadores disponíveis: `equals`, `not_equals`, `exists`, `not_exists`, `contains`, `greater_than`, `less_than`, `is_true`, `is_false` e `is_type`.
- Resultado detalhado por verificação, com total de aprovadas e reprovadas.
- Identificação explícita do modo de execução como simulação.

A simulação não é uma chamada HTTP nem substitui o teste de integração com uma API real.

### Planos e cobrança
O backend aplica as regras de plano antes de liberar funcionalidades:

| Recurso | Free | Pro |
|---|---:|---:|
| Projetos | Até 2 | Ilimitados |
| Execuções HTTP | Até 3 por mês | Sem limite mensal definido pelo plano |
| Simulação sem URL | Não | Sim |
| Histórico de execuções | Disponível | Disponível |

O plano é consultado no MariaDB e os limites são aplicados no backend. A simulação sem URL verifica a condição Pro tanto na criação quanto na execução do cenário.

A integração de cobrança utiliza:
- Stripe Checkout em modo de assinatura recorrente.
- Stripe Billing Portal para gerenciamento da assinatura.
- Webhook com validação HMAC da assinatura e do timestamp.
- Registro de identificadores de eventos na tabela `stripe_eventos` para evitar processamento duplicado.
- Persistência do cliente, assinatura, preço, plano, estado e período de cobrança na tabela `assinaturas`.

**Importante:** a implementação do fluxo de cobrança está no código. A disponibilidade do Checkout e do Portal depende de credenciais, preço recorrente e webhook válidos configurados no ambiente. Utilize chaves de teste para validação acadêmica. A existência do código, isoladamente, não comprova uma transação concluída em produção.

### Administração e auditoria
- Painel administrativo protegido por papel e permissão.
- Indicadores de usuários, assinaturas, execuções e receita recorrente estimada, quando a configuração Stripe permite consultá-la.
- Consulta de eventos recentes pelo serviço de logs.
- Registro de ações relevantes, como criação e atualização de projetos, criação e execução de casos e geração por IA.

---

## 3. Arquitetura e tecnologias

A solução utiliza uma aplicação web principal integrada a microsserviços e serviços externos.

| Camada / componente | Tecnologia | Responsabilidade |
|---|---|---|
| Frontend | React 19, TypeScript, Vite 6, React Router | Interface web e navegação |
| Aplicação principal | Node.js 22, Express 5 | APIs de domínio e regras de negócio |
| Autenticação | auth-service, JWT, bcryptjs | Cadastro, login e validação de sessão |
| Autorização | RBAC e permissões | Controle de acesso às operações |
| Banco relacional | MariaDB 11 | Usuários, projetos, casos, execuções e assinaturas |
| Auditoria | log-service | Recebimento e consulta de eventos |
| Stream de eventos | Redis 7 / Redis Streams | Persistência dos eventos de auditoria |
| Armazenamento de objetos | MinIO | Serviço provisionado na infraestrutura |
| IA | Groq API | Geração assistida de casos de teste |
| Pagamentos | Stripe | Checkout recorrente, Billing Portal e webhooks |
| Empacotamento | Docker e Docker Compose | Construção e execução dos serviços |
| Implantação | Docker Hub e Portainer | Distribuição de imagens e gerenciamento da Stack |
| Integração contínua | GitHub Actions | Testes, build, smoke tests e publicação condicional |

### Comunicação entre os componentes

1. O navegador acessa a aplicação pelo domínio HTTPS.
2. A aplicação principal processa as rotas e regras de negócio.
3. Para operações autenticadas, o backend consulta o `auth-service`, que valida o JWT e retorna o usuário e suas permissões.
4. As operações de domínio consultam ou atualizam o MariaDB, sempre considerando o usuário proprietário.
5. Eventos relevantes são enviados ao `log-service`, que utiliza Redis Streams.
6. A geração de casos consulta a Groq API pelo backend.
7. O fluxo comercial comunica-se com o Stripe e recebe atualizações por webhook.

### Infraestrutura de implantação

O arquivo `docker-compose.portainer.yml` descreve os serviços `app`, `auth-service`, `log-service`, `redis` e `minio). A aplicação principal publica a porta interna 3000 na porta 8211 do host. Os microsserviços e os serviços de suporte comunicam-se pela rede Docker `catalogo_net`; suas portas não são publicadas diretamente no host nesse arquivo.

O MariaDB é acessado por configuração de ambiente e não é declarado como container nessa Stack do Portainer. Redis e MinIO utilizam volumes persistentes definidos no Compose. O arquivo configura health checks para a aplicação, autenticação, logs e Redis.

**Limitação conhecida:** o MinIO está provisionado na Stack, mas o fluxo de upload e recuperação de arquivos de evidência ainda não está integrado à aplicação. A presença do serviço na infraestrutura não deve ser interpretada como funcionalidade de upload concluída.

### Modelo de dados

As principais entidades do domínio são:
- `usuarios`: contas e identidade dos usuários.
- `projetos`: projetos de teste associados ao proprietário.
- `casos_teste`: cenários HTTP ou de simulação.
- `execucoes`: resultados, duração, status e dados resumidos.
- `evidencias`: estrutura de metadados prevista para arquivos associados às execuções; upload ainda não implementado.
- `assinaturas`: relação entre usuário, plano e identificadores do Stripe.
- `stripe_eventos`: identificadores únicos dos eventos processados.

As migrações de domínio estão em `database/`. A migração `migration-v8-testflow.sql` estabelece as entidades do domínio de testes e `migration-v9-saas.sql` acrescenta simulação e dados de assinatura.

---

## 4. Segurança

A aplicação aplica controles em diferentes camadas:

- Senhas armazenadas com hash por bcryptjs no serviço de autenticação.
- Autenticação de requisições por JWT.
- Autorização no backend por permissões RBAC; ocultar um botão na interface não é considerado controle de segurança.
- Isolamento de projetos, casos e execuções por `usuario_id`.
- Consultas parametrizadas ao MariaDB.
- Chaves estrangeiras para integridade referencial.
- Comunicação interna entre serviços com segredo compartilhado por variável de ambiente.
- Helmet, política de segurança de conteúdo e rate limiting.
- Respostas genéricas para erros internos, sem expor stack traces ao usuário.
- Segredos e credenciais configurados no ambiente de execução, fora do repositório.

### Proteções do executor HTTP

O executor:
- aceita somente endpoints relativos;
- mantém o destino no mesmo domínio da URL base do projeto;
- valida a resolução DNS e rejeita endereços locais, privados e não permitidos;
- não segue redirecionamentos;
- aplica timeout de 10 segundos;
- limita o tamanho da resposta armazenada;
- não executa código arbitrário enviado pelo usuário.

Essas medidas reduzem riscos de SSRF e de consumo excessivo de recursos. Para os testes, deve ser utilizada uma API pública ou um ambiente de homologação com endereço público; endereços locais, privados e serviços internos do Docker são bloqueados.

---

## 5. Configuração para desenvolvimento

### Pré-requisitos
- Node.js 22.
- npm.
- Docker e Docker Compose.
- Acesso a um MariaDB.
- Chave da Groq para geração assistida por IA.
- Credenciais Stripe de teste para validar o fluxo de assinatura.

### Variáveis de ambiente

Crie um arquivo local a partir do exemplo:

```bash
cp .env.example .env
```

Configure os valores exigidos pelo ambiente. Entre as variáveis utilizadas estão:

| Grupo | Variáveis |
|---|---|
| Aplicação | `PORT`, `APP_URL`, `TRUST_PROXY_HOPS` |
| Banco | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` |
| Autenticação e serviços | `JWT_SECRET`, `SESSION_SECRET`, `INTERNAL_SERVICE_SECRET` |
| Microsserviços | `AUTH_SERVICE_URL`, `LOG_SERVICE_URL` |
| E-mail | `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` |
| MinIO | `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` |
| Groq | `GROQ_API_KEY`, `GROQ_MODEL` |

Use segredos fortes e diferentes entre si. Não publique o arquivo `.env`, chaves de API, tokens, senhas ou credenciais em commits, issues, prints ou documentação.

### Instalação e build

```bash
npm ci
npm --prefix frontend ci
npm --prefix frontend run build
npm test
```

### Subida local

```bash
docker compose up -d db redis minio auth-service log-service
docker compose ps
docker compose up -d --build app
docker compose ps
```

A aplicação local utiliza a porta 3000. No Codespaces, abra a porta encaminhada pelo painel **Ports**.

### Migrações

A migração de domínio deve ser aplicada na ordem correta e somente após backup e confirmação do banco de destino:

1. `database/migration-v8-testflow.sql`
2. `database/migration-v9-saas.sql`

Não execute `docker compose down -v` para tentar corrigir problemas: a opção remove volumes e pode apagar dados persistidos.

---

## 6. Fluxo de utilização

1. Crie uma conta e entre na plataforma.
2. Crie um projeto e, para testes HTTP, informe a URL base pública da API.
3. Abra os detalhes do projeto.
4. Cadastre um caso manualmente ou utilize **Gerar casos com IA**.
5. Execute o caso HTTP e confira status, duração e resposta.
6. Consulte o histórico de execuções.

Para testar a simulação sem URL, a conta precisa ter assinatura Pro. Crie um cenário com dados JSON e uma ou mais verificações, execute-o e confira o resultado detalhado. Essa modalidade avalia os dados localmente e não envia requisições de rede.

Para uma primeira validação HTTP, pode ser utilizada uma API pública de testes, por exemplo `https://jsonplaceholder.typicode.com`. Um cenário simples pode utilizar método `GET`, endpoint `/posts/1` e status esperado `200`.

---

## 7. Principais rotas da API

As rotas de domínio abaixo exigem autenticação Bearer válida, salvo o webhook Stripe.

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/health` | Health check da aplicação |
| GET | `/api/status` | Estado básico da API |
| GET | `/api/projetos` | Listar projetos do usuário |
| POST | `/api/projetos` | Criar projeto |
| GET | `/api/projetos/:id` | Consultar projeto |
| PUT | `/api/projetos/:id` | Atualizar projeto |
| DELETE | `/api/projetos/:id` | Excluir projeto |
| GET | `/api/projetos/:projetoId/casos` | Listar casos |
| POST | `/api/projetos/:projetoId/casos` | Criar caso HTTP |
| POST | `/api/projetos/:projetoId/casos/gerar-ia` | Gerar casos com Groq |
| POST | `/api/projetos/:projetoId/casos/:casoId/executar` | Executar teste HTTP |
| POST | `/api/projetos/:projetoId/casos-simulacao` | Criar simulação sem URL |
| POST | `/api/projetos/:projetoId/casos/:casoId/executar-simulacao` | Executar simulação local |
| GET | `/api/projetos/:projetoId/execucoes` | Consultar histórico |
| GET | `/api/billing/status` | Consultar plano e assinatura |
| POST | `/api/billing/checkout` | Criar sessão Stripe Checkout |
| POST | `/api/billing/portal` | Criar sessão do Billing Portal |
| POST | `/api/billing/webhook` | Receber eventos Stripe assinados |
| GET | `/api/admin/dashboard` | Consultar painel administrativo |

---

## 8. Testes e integração contínua

O comando `npm test` realiza verificações de sintaxe dos módulos Node.js e executa os testes automatizados disponíveis em `tests/`.

O workflow `.github/workflows/ci-cd.yml` está configurado para:
1. instalar dependências e executar testes do backend;
2. instalar dependências e compilar o frontend;
3. construir as imagens Docker;
4. subir a composição de serviços em ambiente de CI;
5. verificar o health check da aplicação, o status da API e a saúde dos serviços de autenticação e logs;
6. publicar as imagens no Docker Hub após a aprovação dos testes na branch `main), quando os secrets necessários estiverem configurados;
7. acionar o webhook de implantação do Portainer, quando configurado.

Essas etapas automatizadas não substituem a validação funcional no ambiente publicado. Testes de integração com Stripe, Groq, isolamento entre contas, limites de plano e execução contra APIs externas devem ser verificados separadamente e documentados com suas evidências.

---

## 9. Estrutura relevante do repositório

| Caminho | Conteúdo |
|---|---|
| `frontend/` | Interface React e TypeScript |
| `routes/` | Rotas e regras de negócio do backend |
| `services/` | Serviços auxiliares, incluindo controle de limite de execução |
| `auth-service/` | Microsserviço de autenticação e autorização |
| `log-service/` | Microsserviço de auditoria |
| `database/` | Migrações SQL |
| `tests/` | Testes automatizados |
| `.github/workflows/` | Workflow de CI/CD |
| `docker-compose.yml` | Composição de desenvolvimento |
| `docker-compose.portainer.yml` | Composição destinada à Stack do Portainer |
| `SECURITY.md` | Orientações de segurança |
| `VALIDACAO.md` | Roteiro de validação |

---

## 10. Limitações conhecidas e próximos passos

O estado do código deve ser diferenciado do estado de validação em ambiente real. Entre os pontos conhecidos desta versão:

- O MinIO está provisionado, mas o upload e a recuperação de arquivos de evidência ainda não foram integrados ao fluxo da aplicação.
- A geração por IA depende de chave Groq válida, conectividade externa e disponibilidade do modelo configurado.
- O Checkout, o Billing Portal e a atualização de assinaturas dependem de configuração válida no Stripe e da entrega dos webhooks.
- A validação HTTP automática compara o status recebido com o esperado; a validação detalhada por assertions está disponível no modo de simulação.
- A execução de testes contra APIs privadas ou endereços internos é bloqueada pelas proteções do executor.
- A validação automatizada do pipeline não comprova, por si só, todos os fluxos funcionais da aplicação publicada.

Próximas evoluções incluem integrar o armazenamento de evidências no MinIO, ampliar as assertions dos testes HTTP, expandir os testes de integração e segurança e fortalecer o monitoramento da aplicação.

---

## 11. Contexto acadêmico e autoria

Projeto desenvolvido para a disciplina **ISW055 — Introdução à Computação em Nuvem**, do curso de Tecnologia em Sistemas Inteligentes da **FATEC Pompeia**, semestre **2026.2**.

- Repositório: https://github.com/joicesoato/testflow-ai
- Disciplina e orientações: https://github.com/siriani
- Aplicação: https://joice-brito-isw055.lapps.studio/

A documentação descreve funcionalidades e configurações identificadas no código do repositório. A comprovação de funcionamento em ambiente publicado deve ser feita por meio de registros de execução, capturas de tela, histórico do GitHub e evidências da infraestrutura.
