# Plano de implementação das APIs — estado do MVP

## Implementado nesta versão

- Autenticação via auth-service e verificação das permissões por rota.
- CRUD de projetos com isolamento por `usuario_id`.
- Listagem, criação e exclusão de casos de teste.
- Geração de casos via Gemini API e persistência dos cenários gerados.
- Execução HTTP de casos com comparação do status esperado.
- Registro e consulta de histórico de execuções.
- Auditoria dos eventos de criação, geração e execução.

## Rotas de casos e execuções

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/api/projetos/:projetoId/casos` | Listar casos do projeto |
| POST | `/api/projetos/:projetoId/casos` | Criar caso |
| POST | `/api/projetos/:projetoId/casos/gerar-ia` | Gerar e salvar casos com Gemini |
| DELETE | `/api/projetos/:projetoId/casos/:casoId` | Excluir caso |
| POST | `/api/projetos/:projetoId/casos/:casoId/executar` | Executar caso |
| GET | `/api/projetos/:projetoId/execucoes` | Consultar histórico |

## Pendências para evolução

- Atualização de casos (`PATCH`/`PUT`).
- Validações de conteúdo da resposta além do status HTTP.
- Análise de falhas com IA baseada no histórico de execução.
- Upload e recuperação de evidências no MinIO.
- Testes automatizados de integração, autorização e SSRF.
- Limites de uso por usuário para geração de IA e execução.
- Monitoramento, quotas e restrições de saída na rede de produção.

## Segurança mínima da execução

O executor aceita endpoints relativos ao domínio base do projeto, valida DNS/IP, rejeita endereços privados/locais, não segue redirecionamentos, limita o tempo a 10 segundos e limita o conteúdo da resposta. Esses controles devem ser complementados por allowlist e firewall de saída no ambiente publicado.
