# Documentação técnica — TestFlow AI

## 1. Objetivo

O TestFlow AI é uma plataforma SaaS proposta para organizar e automatizar testes de APIs REST. O fluxo de negócio é **projeto → caso de teste → execução → evidência**. A geração assistida por IA e a monetização por assinatura são evoluções planejadas, não funcionalidades comprovadas nesta base.

## 2. Estado da implementação

Esta entrega contém a landing page React responsiva, servidor web Express, health check, rate limit básico, configuração inicial de Docker/Portainer, esquema inicial de autenticação e migração de domínio com quatro tabelas. As APIs CRUD, execução de requisições, autorização por papel, isolamento multiusuário, auditoria de negócio e upload MinIO ainda devem ser implementados e testados.

## 3. Modelo de negócio

Público inicial: freelancers, pequenas software houses e equipes de desenvolvimento que trabalham com APIs REST. Problema: testes repetitivos e resultados dispersos entre scripts, clientes HTTP e planilhas. Proposta: centralizar cenários, execução, histórico e evidências. Postman, Bruno, Swagger/OpenAPI, scripts e planilhas são alternativas existentes. Os preços Free, Pro e Equipe descritos no README original são hipóteses comerciais e devem ser validados antes de qualquer cobrança.

## 4. Arquitetura planejada

- Frontend React + TypeScript + Vite.
- Node.js + Express como servidor web e API.
- Auth-service com JWT, bcrypt e recuperação de senha.
- MariaDB para usuários e dados de domínio.
- Log-service + Redis Streams para auditoria.
- MinIO para evidências binárias.
- Docker Compose, GitHub Actions, Docker Hub e Portainer para empacotamento e implantação.

## 5. Modelo relacional

`database/migration-v8-testflow.sql` define `projetos`, `casos_teste`, `execucoes` e `evidencias`. Os registros carregam a chave do proprietário e as FKs compostas mantêm a associação entre projeto, caso, execução e evidência. O backend deve repetir a validação de propriedade em cada operação; integridade referencial não substitui autorização.

## 6. Papéis

- `admin`: administra os próprios projetos/casos e consulta logs administrativos.
- `analista`: cria e mantém projetos/casos, executa testes e gerencia evidências próprias. Contas legadas `usuario` devem receber permissões equivalentes durante a migração.
- `desenvolvedor`: consulta projetos/casos e cria/consulta execuções e evidências próprias.

Admin não deve ter acesso implícito aos dados privados de outro usuário. As regras precisam ser aplicadas no backend e verificadas com contas distintas.

## 7. Segurança

Controles da base: Helmet, CSP, rate limit básico, desativação do cabeçalho X-Powered-By, erros genéricos e ausência de endpoints de domínio não implementados. Controles pendentes: JWT integrado, RBAC, isolamento multiusuário, validação de entrada, proteção SSRF para execução HTTP, upload seguro, auditoria, gestão de segredos e testes de segurança. Ver `SECURITY.md`.

## 8. Deploy

`docker-compose.portainer.yml` preserva a porta externa 8211 e a rede existente. As imagens Docker foram renomeadas para `joicesoato/testflow-ai*`. Antes de redeploy: verificar repositórios/imagens no Docker Hub, secrets do GitHub, variáveis no Portainer, backup do banco e migração. Não executar migração automaticamente no deploy.

## 9. Critérios de validação

Executar build frontend, syntax check Node, validação do Compose, build dos containers, smoke test HTTP, testes de autenticação, RBAC, isolamento, SSRF, upload e auditoria. A documentação não declara esses testes como concluídos sem evidência de execução.
