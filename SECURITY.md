# Segurança — TestFlow AI

## Estado da revisão

Este documento descreve controles presentes na base entregue e controles obrigatórios para a conclusão das APIs. Não é uma certificação, pentest ou garantia de ausência de vulnerabilidades.

### Controles presentes nesta base
- Helmet aplicado no servidor web.
- Política CSP restritiva, sem scripts de terceiros.
- `X-Powered-By` desabilitado.
- Rate limit básico no prefixo `/api`.
- Tratamento genérico de erros HTTP, sem stack trace no cliente.
- Health check sem expor segredos ou configuração.
- `.env` ignorado pelo Git (confirmar `.gitignore` antes do commit).
- Arquivos estáticos servidos pelo mesmo host.
- Rotas de projetos/casos/execuções validam o token no auth-service e filtram registros pelo proprietário.
- O executor aceita somente endpoints relativos no mesmo domínio da URL base, verifica DNS/IP, bloqueia endereços locais/privados, não segue redirects, aplica timeout e limita o corpo de resposta.
- A chave Gemini é lida pelo backend via variável de ambiente e não é enviada ao frontend.
- A verificação de e-mail pode ser desativada somente em desenvolvimento por `EMAIL_VERIFICATION_REQUIRED=false`; em produção deve permanecer habilitada.

### Controles obrigatórios antes de publicar APIs
1. **Autenticação:** JWT com algoritmo explicitamente permitido, expiração curta, validação de issuer/audience quando aplicável, rotação e segredo forte; senhas com bcrypt/Argon2 e política adequada.
2. **Autorização:** negar por padrão; validar papel e propriedade em cada endpoint. Não confiar em `usuario_id` recebido do cliente.
3. **Multi-tenant:** todas as consultas devem incluir proprietário no SQL; não buscar por ID global e só depois validar. Testar usuário A contra IDs do usuário B.
4. **Validação:** schemas de entrada, limites de tamanho, tipos e formatos; queries parametrizadas; evitar mass assignment.
5. **Execução de APIs:** somente HTTP/HTTPS; bloquear loopback, redes privadas, link-local, multicast e metadata endpoints; validar DNS/IP, bloquear redirects ou revalidá-los, timeout e limites de bytes; considerar DNS rebinding e egress firewall.
6. **SSRF:** permitir apenas destinos autorizados quando possível. A validação na aplicação deve ser complementada por restrições de rede.
7. **Uploads:** allowlist de MIME/extensão, inspeção de assinatura do arquivo, limite de tamanho, nomes aleatórios, chave de objeto não controlada pelo usuário, bucket privado e download autenticado.
8. **Segredos:** armazenar no gerenciador de secrets do ambiente; nunca em código, imagem Docker, logs, README ou workflow.
9. **CORS/CSRF:** manter mesma origem quando possível; se houver cookies, configurar `HttpOnly`, `Secure`, `SameSite` e proteção CSRF conforme o fluxo.
10. **Auditoria:** autor, ação, recurso, data/hora UTC e resultado; nunca gravar senhas, tokens, cookies ou dados pessoais desnecessários.
11. **Banco:** usuário SQL com privilégio mínimo, InnoDB, backup testado e TLS quando suportado.
12. **Infraestrutura:** containers sem privilégios, imagens atualizadas e fixadas por versão/digest em produção, portas internas não publicadas sem necessidade, HTTPS e monitoramento.

## Threat model resumido

| Ameaça | Impacto | Mitigação necessária |
|---|---|---|
| IDOR / acesso a dados de outra conta | Exposição/alteração de dados | Filtro de proprietário em cada operação e testes com duas contas |
| Escalada de privilégio | Ações administrativas indevidas | RBAC no backend, negar por padrão e nunca confiar no role do cliente |
| SSRF via endpoint de teste | Acesso a rede interna/metadata | Allowlist, validação DNS/IP, bloqueio de redirect e egress firewall |
| Upload malicioso | Execução/armazenamento de conteúdo perigoso | Allowlist, assinatura, limite, bucket privado e download autenticado |
| Abuso de API | Indisponibilidade/custo | Rate limit por usuário/IP, quotas, timeout e limites de resposta |
| Vazamento de segredos | Comprometimento de serviços | Secrets manager, rotação, `.gitignore`, revisão de histórico |
| SQL injection | Leitura/alteração indevida | Queries parametrizadas e validação de entrada |
| Repetição de webhook | Estado financeiro inconsistente | Verificação criptográfica, tolerância de timestamp e idempotência |

## Verificações executadas nesta entrega

A entrega deve ser validada com:
- `node --check server.js`
- `npm --prefix frontend run build`
- `docker compose config --quiet` (após preencher variáveis locais)
- `git diff --check`
- build das imagens e execução em ambiente isolado
- testes funcionais e de autorização com contas distintas

Não foi realizado pentest externo nem validação de segurança na infraestrutura de produção. Dependências devem passar por `npm audit` e revisão de advisories antes do deploy.
