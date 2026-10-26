# TestFlow AI — Automação inteligente de testes de APIs

Transforme requisitos de software em testes de APIs REST executáveis e relatórios de qualidade, com auxílio de inteligência artificial.

Projeto desenvolvido para a disciplina ISW055 — Introdução à Computação em Nuvem, da FATEC, no semestre 2026.2, sob orientação do professor Allan Lincoln Rodrigues Siriani.

Professor: https://github.com/siriani

## 1. A dor que queremos resolver

Pequenas empresas de desenvolvimento de software, freelancers e equipes que trabalham com APIs REST precisam verificar continuamente se suas funcionalidades estão funcionando como esperado.

Quando uma API recebe uma atualização, é necessário conferir respostas, códigos HTTP, dados retornados e regras de negócio. Parte desse trabalho é feita manualmente, com scripts individuais, ferramentas de requisições ou planilhas para registrar os resultados.

Esse processo pode consumir tempo, dificultar a repetição dos testes e deixar falhas sem documentação adequada. Quando uma integração apresenta problemas, o desenvolvedor também precisa investigar o que aconteceu e comunicar os resultados para a equipe ou para o cliente.

O TestFlow AI pretende reduzir esse esforço permitindo que o desenvolvedor descreva uma funcionalidade ou forneça requisitos e receba uma sugestão estruturada de casos de teste. Após revisar os casos, poderá executá-los em APIs de ambientes autorizados e consultar os resultados em um único lugar.

**Quem sofre com o problema:** profissionais e pequenas equipes que desenvolvem sistemas web e APIs, especialmente quando não possuem uma equipe dedicada de garantia da qualidade (QA).

**Quando a dor aparece:** durante o desenvolvimento de novas funcionalidades, correções, manutenção e preparação de versões para publicação.

**Custo atual:** tempo de desenvolvimento dedicado à preparação e repetição de testes, retrabalho causado por falhas não identificadas e esforço para documentar resultados. O valor financeiro e o tempo efetivamente gastos serão investigados durante a validação com potenciais usuários.

**Como resolvem hoje:** ferramentas de requisições HTTP, scripts automatizados, frameworks de teste, planilhas, documentação manual e conferências realizadas diretamente pelos desenvolvedores.

## 2. Persona

**Persona fictícia: Rafael, 27 anos, desenvolvedor freelancer.**

Rafael desenvolve sistemas web para pequenos negócios e precisa integrar formulários, cadastros, autenticação e serviços externos. Ele trabalha em vários projetos e nem sempre conta com um profissional de QA para revisar suas entregas.

Antes de publicar uma atualização, Rafael verifica manualmente algumas rotas, executa scripts que já possui e anota os resultados em documentos separados. Quando altera uma funcionalidade, precisa lembrar quais verificações devem ser repetidas.

O problema aparece quando ele precisa entregar rapidamente um projeto sem deixar de verificar funcionalidades importantes. Repetir os mesmos testes consome tempo, e preparar um relatório para o cliente acrescenta mais uma tarefa.

Rafael procuraria uma ferramenta que organizasse os cenários de teste, executasse verificações de API e produzisse um relatório compreensível, sem exigir que ele configurasse todo o processo manualmente.

Essa persona representa uma hipótese inicial de cliente. Sua rotina e suas necessidades deverão ser confrontadas com entrevistas e testes do produto.

## 3. Concorrentes e alternativas

O TestFlow AI não será a primeira ferramenta de testes de software. Sua oportunidade está em simplificar o fluxo entre a descrição de um requisito, a geração de casos de teste, a execução e a apresentação dos resultados.

| Concorrente ou alternativa | O que oferece | Oportunidade para o TestFlow AI |
|---|---|---|
| Postman | Criação e execução de requisições HTTP, organização de coleções e recursos de teste de APIs | Simplificar a criação inicial de verificações a partir de requisitos em linguagem natural e centralizar o fluxo de geração e relatório |
| Bruno | Cliente de API com coleções e suporte a fluxos de trabalho de testes | Reduzir a configuração manual inicial para usuários que precisam transformar requisitos em verificações |
| Swagger / OpenAPI | Documentação e descrição estruturada de APIs; ferramentas do ecossistema permitem explorar e testar endpoints | Usar a especificação da API como entrada para sugerir casos de teste e resultados esperados |
| Scripts e frameworks de teste | Automação flexível e integração com o processo de desenvolvimento | Oferecer uma experiência mais acessível para quem não quer escrever toda a estrutura de testes manualmente |
| Planilhas e documentação manual | Registro de cenários, resultados e evidências | Centralizar os registros e gerar relatórios a partir das execuções realizadas |

As alternativas existentes são úteis e algumas já oferecem automação avançada ou recursos de inteligência artificial. O objetivo não é afirmar que sejam inferiores em todos os aspectos, mas investigar se existe espaço para uma experiência mais simples e integrada para pequenas equipes.

## 4. Proposta de valor

**O TestFlow AI transforma requisitos de APIs REST em casos de teste revisáveis, executa verificações em ambientes autorizados e organiza os resultados em relatórios, reduzindo o trabalho manual de preparação e documentação dos testes.**

O diferencial proposto é reunir geração assistida por IA, execução controlada e histórico de resultados em um fluxo acessível. A qualidade das gerações, o tempo economizado e a disposição dos clientes para pagar serão medidos durante a validação.

## 5. Modelo de receita com Stripe

O modelo de negócio será Software as a Service (SaaS), com acesso pela internet e possibilidade de assinatura mensal. O Stripe será utilizado na etapa de monetização prevista para a Atividade 11 da disciplina.

Os preços abaixo são hipóteses iniciais para testar a aceitação do mercado.

| Plano | Preço mensal hipotético | Limites e benefícios |
|---|---:|---|
| Free | R$ 0 | Um projeto ativo, limite mensal de gerações com IA, quantidade limitada de execuções e relatórios básicos |
| Pro | R$ 59,90 | Mais projetos e execuções, histórico ampliado, relatórios exportáveis e maior limite de gerações |
| Equipe | R$ 249,90 | Projetos compartilhados, múltiplos usuários, permissões de equipe, auditoria e limites ampliados |

**Por que alguém pagaria pelo Pro?**

O plano pago deverá oferecer economia de tempo, maior volume de testes e histórico útil para projetos recorrentes. Para pequenas equipes, o plano Equipe poderá agregar colaboração e padronização das verificações.

Os limites exatos de cada plano serão definidos depois de medir o custo da IA, das execuções e da infraestrutura.

A integração com o Stripe deverá contemplar criação de sessão de checkout, confirmação de pagamentos por webhook verificado, atualização do plano e tratamento de cancelamentos. O sistema não deverá liberar benefícios apenas porque o usuário retornou à página de pagamento.

No protótipo inicial, a prioridade será demonstrar o fluxo principal do produto. A cobrança real será implementada após a validação técnica e a preparação da integração comercial.

## 6. Métricas de sucesso

As métricas serão divididas entre uso do produto, qualidade técnica e viabilidade comercial.

| Métrica | O que mede |
|---|---|
| Cadastros | Interesse inicial pelo produto |
| Projetos ativos | Quantidade de usuários que utilizam o fluxo de testes |
| Suítes geradas e executadas | Utilização efetiva da funcionalidade principal |
| Taxa de aproveitamento dos casos gerados | Proporção de casos considerados úteis após revisão |
| Tempo de preparação dos testes | Possível redução do esforço manual |
| Usuários ativos recorrentes | Frequência de utilização ao longo do tempo |
| Assinantes pagos | Conversão de usuários para planos pagos |
| MRR | Receita recorrente mensal das assinaturas |
| Retenção e cancelamentos | Capacidade de manter clientes ao longo do tempo |
| Custo por execução | Sustentabilidade operacional do serviço |

No início, será priorizado um piloto com um pequeno grupo de usuários. As metas numéricas serão estabelecidas após obter uma linha de base de uso, custos e qualidade. Não serão tratados como resultados comprovados números que ainda não foram medidos.

## 7. Lean Canvas

| Bloco | Definição para o TestFlow AI |
|---|---|
| **Problema** | Preparação repetitiva de testes de APIs; execução e registro dispersos; dificuldade de documentar resultados e investigar falhas. Hoje, os clientes utilizam ferramentas de API, scripts, planilhas e processos manuais. |
| **Segmentos de clientes** | Freelancers, pequenas software houses e equipes de desenvolvimento que trabalham com APIs REST. Os primeiros usuários a buscar serão profissionais com testes