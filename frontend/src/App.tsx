import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams
} from "react-router-dom";

type User = {
  id: number;
  nome: string;
  email: string;
  role: string;
};

type Project = {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  environment: string;
};

type ProjectFormData = Omit<Project, "id">;

const TOKEN_KEY = "testflow_token";
const USER_KEY = "testflow_user";

function getStoredUser(): User | null {
  try {
    const value = sessionStorage.getItem(USER_KEY);
    return value ? JSON.parse(value) as User : null;
  } catch {
    return null;
  }
}

function mapProject(project: any): Project {
  return {
    id: String(project.id),
    name: project.nome,
    description: project.descricao || "",
    baseUrl: project.url_base || "",
    environment: project.ambiente || "desenvolvimento"
  };
}

async function apiRequest(
  path: string,
  token: string,
  options: RequestInit = {}
) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.erro || "Não foi possível concluir a operação.");
  }

  return data;
}

function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">T</span>
      <span>TestFlow <b>AI</b></span>
    </Link>
  );
}

function Shell({
  children,
  user,
  onLogout
}: {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
}) {
  return (
    <div className="app-shell">
      <div className="site">
        <header className="topbar">
          <Brand />
          <nav>
            <Link to="/projects">Projetos</Link>
            {user && <Link to="/billing">Assinatura</Link>}
            <Link to="/produto">Produto</Link>
            <Link to="/seguranca">Segurança</Link>
          </nav>
          {user ? (
            <button className="nav-cta" onClick={onLogout}>
              Sair <span>↗</span>
            </button>
          ) : (
            <Link className="nav-cta" to="/login">
              Entrar <span>↗</span>
            </Link>
          )}
        </header>
        {children}
        <footer>
          <Brand />
          <span>TestFlow AI · Qualidade de software em um fluxo.</span>
        </footer>
      </div>
    </div>
  );
}

function Landing({ loggedIn }: { loggedIn: boolean }) {
  return (
    <>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="pulse" />
              QUALIDADE DE SOFTWARE, EM UM FLUXO
            </div>

            <h1>
              Teste suas APIs.
              <br />
              <em>Entregue com confiança.</em>
            </h1>

            <p>
              Organize projetos, estruture cenários de teste e acompanhe
              execuções de APIs REST em uma plataforma preparada para
              evoluir com inteligência artificial.
            </p>

            <div className="hero-actions">
              <Link className="primary" to="/register">
                Criar minha conta <span>→</span>
              </Link>
              <Link className="secondary" to="/projects">
                Explorar plataforma
              </Link>
            </div>

            <div className="hero-note">
              <span className="pulse" />
              Uma visão clara do ciclo de testes, do cenário à evidência.
            </div>
          </div>

          <div className="visual">
            <div className="visual-head">
              <div>
                <small>WORKSPACE / VISÃO GERAL</small>
                <strong>Qualidade das APIs</strong>
              </div>
              <span className="live">● DEMONSTRAÇÃO</span>
            </div>

            <div className="metric-grid">
              <div className="metric">
                <small>PROJETOS</small>
                <strong>02</strong>
                <span>Organizados por workspace</span>
              </div>
              <div className="metric">
                <small>CASOS DE TESTE</small>
                <strong>02</strong>
                <span>Cenários de exemplo</span>
              </div>
              <div className="metric">
                <small>EXECUÇÕES</small>
                <strong>—</strong>
                <span>Integração em andamento</span>
              </div>
            </div>

            <div className="flow-card">
              <div className="flow-title">
                FLUXO DE QUALIDADE
                <span>VISÃO DO PRODUTO</span>
              </div>
              <div className="flow">
                <div>
                  <i>01</i>
                  <b>Projeto</b>
                  <small>API e ambiente</small>
                </div>
                <span>→</span>
                <div>
                  <i>02</i>
                  <b>Caso de teste</b>
                  <small>Regras esperadas</small>
                </div>
                <span>→</span>
                <div>
                  <i>03</i>
                  <b>Execução</b>
                  <small>Resultado HTTP</small>
                </div>
                <span>→</span>
                <div>
                  <i>04</i>
                  <b>Evidência</b>
                  <small>Registro</small>
                </div>
              </div>
            </div>

            <div className="visual-foot">
              <span>TESTFLOW AI</span>
              <span>DADOS ILUSTRATIVOS</span>
            </div>
          </div>
        </section>

        <div className="trust-strip">
          <span>PROJETOS ORGANIZADOS</span>
          <span>TESTES DE API REST</span>
          <span>CONTROLE DE ACESSO</span>
          <span>RASTREABILIDADE</span>
        </div>

        <section className="section" id="produto">
          <span className="section-kicker">UMA PLATAFORMA, UM FLUXO</span>
          <h2>
            Tudo organizado para
            <br />
            <em>testar com clareza.</em>
          </h2>
          <p className="section-intro">
            Uma estrutura centralizada para organizar seus projetos,
            documentar cenários e acompanhar a qualidade das suas APIs.
          </p>

          <div className="feature-grid">
            <div className="feature">
              <span>01 / PROJETOS</span>
              <h3>Organização centralizada</h3>
              <p>Cadastre projetos, endereços de API e ambientes de trabalho.</p>
            </div>
            <div className="feature">
              <span>02 / CENÁRIOS</span>
              <h3>Casos de teste</h3>
              <p>Estruture requisições e resultados esperados para cada API.</p>
            </div>
            <div className="feature">
              <span>03 / EXECUÇÕES</span>
              <h3>Acompanhamento</h3>
              <p>Organize execuções e acompanhe os resultados dos testes.</p>
            </div>
            <div className="feature">
              <span>04 / EVIDÊNCIAS</span>
              <h3>Rastreabilidade</h3>
              <p>Mantenha registros associados às execuções dos testes.</p>
            </div>
          </div>
        </section>

        <section className="workflow">
          <div>
            <span className="section-kicker">COMO FUNCIONA</span>
            <h2>Do projeto à evidência, em um fluxo.</h2>
            <p>
              O TestFlow AI organiza as etapas necessárias para estruturar
              e acompanhar testes de software.
            </p>
          </div>
          <ol>
            <li>
              <b>Cadastre seu projeto</b>
              <span>Defina a API e o ambiente que deseja testar.</span>
            </li>
            <li>
              <b>Organize os casos de teste</b>
              <span>Descreva cenários, parâmetros e resultados esperados.</span>
            </li>
            <li>
              <b>Execute os testes</b>
              <span>Acompanhe os resultados das requisições.</span>
            </li>
            <li>
              <b>Registre evidências</b>
              <span>Centralize informações para análise e rastreabilidade.</span>
            </li>
          </ol>
        </section>

        <section className="security" id="seguranca">
          <span className="section-kicker">SEGURANÇA E CONTROLE</span>
          <h2>Seus projetos com acesso organizado.</h2>
          <div className="security-grid">
            <div>
              <b>Autenticação</b>
              <p>Acesso protegido por conta e sessão autenticada.</p>
            </div>
            <div>
              <b>Permissões</b>
              <p>Operações controladas conforme o perfil de acesso.</p>
            </div>
            <div>
              <b>Isolamento</b>
              <p>Projetos vinculados aos respectivos usuários.</p>
            </div>
            <div>
              <b>Auditoria</b>
              <p>Registro de ações importantes realizadas na plataforma.</p>
            </div>
          </div>
        </section>

        <section className="closing">
          <div>
            <span className="section-kicker">COMECE A ORGANIZAR</span>
            <h2>Mais clareza em cada teste.</h2>
            <p>
              Crie sua conta e comece a estruturar seus projetos de testes
              de API em um só lugar.
            </p>
          </div>
          <Link className="primary" to={loggedIn ? "/projects" : "/register"}>
            {loggedIn ? "Acessar meus projetos" : "Criar minha conta"} <span>→</span>
          </Link>
        </section>
      </main>
    </>
  );
}


function ProdutoPage({ loggedIn }: { loggedIn: boolean }) {
  return (
    <main>
      <section className="section">
        <span className="section-kicker">PRODUTO TESTFLOW AI</span>
        <h2>
          Qualidade de software
          <br />
          <em>em um único fluxo.</em>
        </h2>
        <p className="section-intro">
          Organize projetos, documente cenários de teste e acompanhe
          as etapas de validação das suas APIs REST em um só lugar.
        </p>

        <div className="feature-grid">
          <div className="feature">
            <span>01 / PROJETOS</span>
            <h3>Organização centralizada</h3>
            <p>Cadastre projetos, endereços de API e ambientes de trabalho.</p>
          </div>
          <div className="feature">
            <span>02 / CENÁRIOS</span>
            <h3>Casos de teste</h3>
            <p>Estruture requisições e resultados esperados para cada API.</p>
          </div>
          <div className="feature">
            <span>03 / EXECUÇÕES</span>
            <h3>Acompanhamento</h3>
            <p>Organize execuções e acompanhe os resultados dos testes.</p>
          </div>
          <div className="feature">
            <span>04 / EVIDÊNCIAS</span>
            <h3>Rastreabilidade</h3>
            <p>Mantenha registros associados às execuções dos testes.</p>
          </div>
        </div>
      </section>

      <section className="workflow">
        <div>
          <span className="section-kicker">COMO FUNCIONA</span>
          <h2>Do projeto à evidência, em um fluxo.</h2>
          <p>
            O TestFlow AI organiza as etapas necessárias para estruturar
            e acompanhar testes de software.
          </p>
        </div>
        <ol>
          <li>
            <b>Cadastre seu projeto</b>
            <span>Defina a API e o ambiente que deseja testar.</span>
          </li>
          <li>
            <b>Organize os casos de teste</b>
            <span>Descreva cenários, parâmetros e resultados esperados.</span>
          </li>
          <li>
            <b>Execute os testes</b>
            <span>Acompanhe os resultados das requisições.</span>
          </li>
          <li>
            <b>Registre evidências</b>
            <span>Centralize informações para análise e rastreabilidade.</span>
          </li>
        </ol>
      </section>

      <section className="closing">
        <div>
          <span className="section-kicker">COMECE A ORGANIZAR</span>
          <h2>Mais clareza em cada teste.</h2>
          <p>Crie sua conta e comece a estruturar seus projetos de testes de API.</p>
        </div>
        <Link className="primary" to={loggedIn ? "/projects" : "/register"}>
          {loggedIn ? "Acessar meus projetos" : "Criar minha conta"} <span>→</span>
        </Link>
      </section>
    </main>
  );
}

function SegurancaPage({ loggedIn }: { loggedIn: boolean }) {
  return (
    <main>
      <section className="security">
        <span className="section-kicker">SEGURANÇA E CONTROLE</span>
        <h2>
          Seus projetos com
          <br />
          <em>acesso organizado.</em>
        </h2>
        <p className="section-intro">
          A plataforma utiliza mecanismos de autenticação, controle de
          permissões e registros de atividades para organizar o acesso
          aos recursos.
        </p>

        <div className="security-grid">
          <div>
            <b>Autenticação</b>
            <p>Acesso protegido por conta e sessão autenticada.</p>
          </div>
          <div>
            <b>Permissões</b>
            <p>Operações controladas conforme o perfil de acesso.</p>
          </div>
          <div>
            <b>Isolamento</b>
            <p>Projetos vinculados aos respectivos usuários.</p>
          </div>
          <div>
            <b>Auditoria</b>
            <p>Registro de ações importantes realizadas na plataforma.</p>
          </div>
        </div>
      </section>

      <section className="workflow">
        <div>
          <span className="section-kicker">CONTROLE DE ACESSO</span>
          <h2>Organização em cada operação.</h2>
          <p>
            Os recursos da plataforma consideram a identidade do usuário
            autenticado e as permissões associadas ao seu perfil.
          </p>
        </div>
        <ol>
          <li>
            <b>Identificação</b>
            <span>O usuário acessa a plataforma com sua conta.</span>
          </li>
          <li>
            <b>Autorização</b>
            <span>As operações verificam as permissões necessárias.</span>
          </li>
          <li>
            <b>Isolamento</b>
            <span>As consultas de projetos consideram o usuário autenticado.</span>
          </li>
          <li>
            <b>Rastreabilidade</b>
            <span>Ações importantes podem ser registradas para auditoria.</span>
          </li>
        </ol>
      </section>

      <section className="closing">
        <div>
          <span className="section-kicker">TESTFLOW AI</span>
          <h2>Qualidade com organização.</h2>
          <p>Conheça a plataforma e organize seus projetos de testes de API.</p>
        </div>
        <Link className="primary" to="/register">
          Criar minha conta <span>→</span>
        </Link>
      </section>
    </main>
  );
}

function AuthPage({
  mode,
  onLogin
}: {
  mode: "login" | "register";
  onLogin: (token: string, user: User) => void;
}) {
  const navigate = useNavigate();
  const registering = mode === "register";

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErro("");
    setMensagem("");
    setLoading(true);

    try {
      const response = await fetch(
        registering ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            registering ? { nome, email, senha } : { email, senha }
          )
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.erro || "Não foi possível realizar a operação.");
      }

      if (registering) {
        setMensagem(
          data.mensagem ||
          "Cadastro realizado. Verifique seu e-mail para confirmar a conta."
        );
        setSenha("");
      } else {
        onLogin(data.token, data.usuario);
        navigate("/projects");
      }
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="workspace auth-workspace">
      <section className="auth-card">
        <Brand />
        <h1>{registering ? "Criar conta" : "Bem-vinda de volta"}</h1>
        <p>
          {registering
            ? "Cadastre-se para começar a organizar seus testes."
            : "Entre para acessar seus projetos."}
        </p>

        <form className="panel-form" onSubmit={submit}>
          {registering && (
            <label>
              Nome
              <input
                value={nome}
                onChange={event => setNome(event.target.value)}
                maxLength={100}
                required
                autoComplete="name"
                placeholder="Seu nome"
              />
            </label>
          )}

          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              maxLength={150}
              required
              autoComplete="email"
              placeholder="seu@email.com"
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              value={senha}
              onChange={event => setSenha(event.target.value)}
              minLength={6}
              required
              autoComplete={registering ? "new-password" : "current-password"}
              placeholder="Sua senha"
            />
          </label>

          {erro && <div className="form-error">{erro}</div>}
          {mensagem && <div className="form-success">{mensagem}</div>}

          <button className="primary" type="submit" disabled={loading}>
            {loading
              ? "Aguarde..."
              : registering
                ? "Criar conta"
                : "Entrar"}
          </button>
        </form>

        <div className="auth-switch">
          {registering ? (
            <>Já tem uma conta? <Link to="/login">Entrar</Link></>
          ) : (
            <>Ainda não tem conta? <Link to="/register">Cadastre-se</Link></>
          )}
        </div>
      </section>
    </main>
  );
}

function Projects({
  projects,
  loading,
  error,
  canManage
}: {
  projects: Project[];
  loading: boolean;
  error: string;
  canManage: boolean;
}) {
  const [search, setSearch] = useState("");
  const [environment, setEnvironment] = useState("todos");

  const filtered = projects.filter(project => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const matches = !term || [project.name, project.description, project.baseUrl]
      .some(value => value.toLocaleLowerCase("pt-BR").includes(term));
    return matches && (environment === "todos" || project.environment === environment);
  });

  return (
    <main className="workspace projects-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ÁREA DE TRABALHO</span>
          <h1>Meus projetos</h1>
          <p>Organize seus ambientes, acompanhe cenários e execute testes de API.</p>
        </div>
        {canManage && <Link className="primary" to="/projects/new">+ Novo projeto</Link>}
      </div>

      {error && <div className="form-error">{error}</div>}

      {!loading && projects.length > 0 && (
        <div className="project-toolbar">
          <label>
            Buscar projetos
            <input value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Nome, descrição ou URL da API..." />
          </label>
          <label>
            Ambiente
            <select value={environment} onChange={event => setEnvironment(event.target.value)}>
              <option value="todos">Todos os ambientes</option>
              <option value="desenvolvimento">Desenvolvimento</option>
              <option value="homologacao">Homologação</option>
              <option value="producao">Produção</option>
            </select>
          </label>
          <span className="project-total">{filtered.length} de {projects.length} projetos</span>
        </div>
      )}

      {loading ? (
        <div className="empty-state">Carregando projetos...</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <h2>Nenhum projeto cadastrado</h2>
          <p>Crie seu primeiro projeto para organizar os casos e as execuções da sua API.</p>
          {canManage && <Link className="primary" to="/projects/new">Criar primeiro projeto</Link>}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h2>Nenhum resultado encontrado</h2>
          <p>Altere a busca ou selecione outro ambiente.</p>
          <button className="secondary" type="button"
            onClick={() => { setSearch(""); setEnvironment("todos"); }}>
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="project-grid">
          {filtered.map(project => (
            <article className="project-card" key={project.id}>
              <div className="project-card-top">
                <div className="project-icon">API</div>
                <span className={`environment-tag environment-${project.environment}`}>
                  {project.environment === "homologacao" ? "Homologação" :
                    project.environment === "producao" ? "Produção" : "Desenvolvimento"}
                </span>
              </div>
              <h2>{project.name}</h2>
              <p>{project.description || "Sem descrição cadastrada."}</p>
              <div className={`project-url ${project.baseUrl ? "" : "project-url-empty"}`}>
                {project.baseUrl || "URL base ainda não configurada"}
              </div>
              <Link className="card-link" to={`/projects/${project.id}`}>
                Abrir projeto <span>→</span>
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function ProjectForm({
  initial,
  title,
  loading,
  error,
  onSave
}: {
  initial?: Project;
  title: string;
  loading: boolean;
  error: string;
  onSave: (data: ProjectFormData) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl || "");
  const [environment, setEnvironment] = useState(
    initial?.environment || "desenvolvimento"
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave({ name, description, baseUrl, environment });
  }

  return (
    <main className="workspace narrow">
      <Link className="back-link" to="/projects">← Voltar aos projetos</Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PROJETOS</span>
          <h1>{title}</h1>
          <p>Informe os dados principais do projeto.</p>
        </div>
      </div>

      <form className="panel-form" onSubmit={submit}>
        <label>
          Nome do projeto
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            maxLength={120}
            required
            placeholder="Ex.: API de clientes"
          />
        </label>

        <label>
          Descrição
          <textarea
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder="Descreva o objetivo do projeto."
          />
        </label>

        <label>
          URL base da API
          <input
            type="url"
            value={baseUrl}
            onChange={event => setBaseUrl(event.target.value)}
            placeholder="https://api.exemplo.com"
          />
          <small className="field-help">
            Nesta versão, a execução precisa alcançar a API por um endereço público. APIs internas, localhost e intranets não são acessadas pela nuvem. A execução privada exigirá um agente instalado na rede autorizada.
          </small>
        </label>

        <label>
          Ambiente
          <select
            value={environment}
            onChange={event => setEnvironment(event.target.value)}
          >
            <option value="desenvolvimento">Desenvolvimento</option>
            <option value="homologacao">Homologação</option>
            <option value="producao">Produção</option>
          </select>
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Salvar projeto"}
          </button>
          <Link className="secondary" to="/projects">Cancelar</Link>
        </div>
      </form>
    </main>
  );
}


type TestCase = {
  id: number;
  titulo: string;
  descricao: string;
  metodo: string;
  endpoint: string;
  status_esperado: number;
  ultimo_status?: string | null;
  modo_execucao?: "http" | "simulacao";
};

function CasesPanel({ token, project, canManage }: { token: string; project: Project; canManage: boolean }) {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [title, setTitle] = useState("");
  const [endpoint, setEndpoint] = useState("/");
  const [method, setMethod] = useState("GET");
  const [expected, setExpected] = useState("200");
  const [objective, setObjective] = useState("");
  const [simulationTitle, setSimulationTitle] = useState("");
  const [simulationData, setSimulationData] = useState('{"status":"ok","total":3}');
  const [simulationAssertions, setSimulationAssertions] = useState('[{"path":"status","operator":"equals","expected":"ok"},{"path":"total","operator":"greater_than","expected":0}]');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);

  async function loadCases() {
    const data = await apiRequest(`/api/projetos/${project.id}/casos`, token);
    setCases(data.casos || []);
  }

  useEffect(() => {
    loadCases().catch(err => setError(err.message));
  }, [project.id, token]);

  async function createCase(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/api/projetos/${project.id}/casos`, token, {
        method: "POST",
        body: JSON.stringify({
          titulo: title,
          metodo: method,
          endpoint,
          status_esperado: Number(expected),
          descricao: "Caso cadastrado manualmente."
        })
      });
      setTitle("");
      setEndpoint("/");
      setMessage("Caso de teste cadastrado.");
      await loadCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setLoading(false);
    }
  }

  async function createSimulation(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setMessage(""); setLastResult(null);
    try {
      const dados = JSON.parse(simulationData); const assertions = JSON.parse(simulationAssertions);
      await apiRequest("/api/projetos/" + project.id + "/casos-simulacao", token, { method: "POST", body: JSON.stringify({ titulo: simulationTitle, dados_teste: dados, assertions }) });
      setSimulationTitle(""); setMessage("Cenário de simulação cadastrado. Nenhuma requisição externa será realizada."); await loadCases();
    } catch (err) { setError(err instanceof Error ? err.message : "Confira os JSONs informados."); } finally { setLoading(false); }
  }

  async function executeSimulation(id: number) {
    setLoading(true); setError(""); setMessage(""); setLastResult(null);
    try {
      const data = await apiRequest("/api/projetos/" + project.id + "/casos/" + id + "/executar-simulacao", token, { method: "POST" });
      setLastResult({ ...data.execucao, resposta: JSON.stringify(data.execucao.resumo, null, 2) }); setMessage(data.mensagem); await loadCases();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha na simulação."); } finally { setLoading(false); }
  }
  async function generateWithAI() {
    setAiLoading(true);
    setError("");
    setMessage("");
    setLastResult(null);
    try {
      const data = await apiRequest(`/api/projetos/${project.id}/casos/gerar-ia`, token, {
        method: "POST",
        body: JSON.stringify({ objetivo: objective })
      });
      setMessage(data.mensagem || "Casos gerados com IA.");
      await loadCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar com IA.");
    } finally {
      setAiLoading(false);
    }
  }

  async function executeCase(id: number) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const data = await apiRequest(`/api/projetos/${project.id}/casos/${id}/executar`, token, {
        method: "POST"
      });
      setLastResult(data.execucao);
      setMessage(data.mensagem);
      await loadCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na execução.");
      await loadCases().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }

  async function deleteCase(id: number) {
    if (!window.confirm("Excluir este caso de teste e seu histórico?")) return;
    setError("");
    try {
      await apiRequest(`/api/projetos/${project.id}/casos/${id}`, token, { method: "DELETE" });
      setMessage("Caso excluído.");
      await loadCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  return (
    <section className="case-detail">
      <div className="list-heading">
        <div>
          <h2>Casos de teste</h2>
          <p>Crie cenários, gere sugestões com IA e escolha entre requisição HTTP real ou simulação local sem URL.</p>
        </div>
        <span className="case-count">{cases.length} casos</span>
      </div>

      {error && <div className="form-error">{error}</div>}
      {message && <div className="form-success">{message}</div>}

      {canManage && <div className="case-ai-panel">
        <div>
          <span className="eyebrow">TESTFLOW AI</span>
          <h3>Gerar casos com Gemini</h3>
          <p>A IA analisa o contexto e cria cenários que são salvos neste projeto.</p>
        </div>
        <label>
          O que a API faz? (opcional)
          <textarea
            value={objective}
            onChange={event => setObjective(event.target.value)}
            placeholder="Ex.: API de usuários com listagem, cadastro e consulta por ID."
            rows={2}
          />
        </label>
        <button className="primary" type="button" onClick={generateWithAI} disabled={aiLoading || !project.baseUrl}>
          {aiLoading ? "Gerando com Gemini..." : "✦ Gerar casos com IA"}
        </button>
        {!project.baseUrl && <small>Cadastre a URL base da API para habilitar a geração.</small>}
      </div>}

      {canManage && <div className="case-create-panel">
        <h3>Simulação sem URL</h3>
        <p>Valide regras e estruturas de dados localmente. Este modo não chama APIs nem acessa a internet.</p>
        <form className="panel-form" onSubmit={createSimulation}>
          <label>Título do cenário<input value={simulationTitle} onChange={event => setSimulationTitle(event.target.value)} required maxLength={160} placeholder="Ex.: Validar retorno de cadastro" /></label>
          <label>Dados de teste (JSON)<textarea rows={5} value={simulationData} onChange={event => setSimulationData(event.target.value)} required spellCheck={false} /></label>
          <label>Verificações (JSON)<textarea rows={6} value={simulationAssertions} onChange={event => setSimulationAssertions(event.target.value)} required spellCheck={false} /></label>
          <small>Operadores: equals, not_equals, exists, not_exists, contains, greater_than, less_than, is_true, is_false e is_type.</small>
          <button className="secondary" type="submit" disabled={loading || !simulationTitle.trim()}>{loading ? "Salvando..." : "Criar cenário de simulação"}</button>
        </form>
      </div>}
      {canManage && <div className="case-create-panel">
        <h3>Novo caso manual</h3>
        <form className="case-form" onSubmit={createCase}>
          <label>
            Título
            <input value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} placeholder="Ex.: Listar usuários" />
          </label>
          <div className="case-fields">
            <label>
              Método
              <select value={method} onChange={event => setMethod(event.target.value)}>
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map(value => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Endpoint
              <input value={endpoint} onChange={event => setEndpoint(event.target.value)} required placeholder="/users" />
            </label>
            <label>
              Status esperado
              <input type="number" min="100" max="599" value={expected} onChange={event => setExpected(event.target.value)} required />
            </label>
          </div>
          <button className="secondary" type="submit" disabled={loading || !title.trim()}>
            {loading ? "Salvando..." : "Adicionar caso"}
          </button>
        </form>
      </div>}

      <div className="case-list">
        {cases.length === 0 ? (
          <div className="pending-panel"><b>Nenhum caso cadastrado</b><span>Crie um caso manualmente ou use a geração com Gemini.</span></div>
        ) : cases.map(item => (
          <article className="case-item" key={item.id}>
            <div className="case-item-main">
              <span className="method-tag">{item.metodo}</span>
              <div>
                <b>{item.titulo}</b>
                <small>{item.modo_execucao === "simulacao" ? "SIMULAÇÃO LOCAL · sem chamada de rede" : item.endpoint + " · Esperado HTTP " + item.status_esperado}</small>
              </div>
            </div>
            <div className="case-item-actions">
              {item.ultimo_status && <span className={`status-tag ${item.ultimo_status}`}>{item.ultimo_status}</span>}
              <button className="primary small-button" type="button" disabled={loading} onClick={() => item.modo_execucao === "simulacao" ? executeSimulation(item.id) : executeCase(item.id)}>{item.modo_execucao === "simulacao" ? "Simular" : "Executar"}</button>
              {canManage && <button className="text-button" type="button" onClick={() => deleteCase(item.id)}>Excluir</button>}
            </div>
          </article>
        ))}
      </div>

      {lastResult && (
        <div className="execution-result">
          <div className="list-heading">
            <h3>Resultado da última execução</h3>
            <span className={`status-tag ${lastResult.status}`}>{lastResult.status}</span>
          </div>
          <p>HTTP {lastResult.status_http} · {lastResult.duracao_ms} ms · Esperado {lastResult.status_esperado}</p>
          {lastResult.erro && <div className="form-error">{lastResult.erro}</div>}
          <pre>{lastResult.resposta || "A API não retornou conteúdo."}</pre>
        </div>
      )}
    </section>
  );
}

function ProjectDetails({
  token,
  canManage,
  onDelete,
  onUpdate
}: {
  token: string;
  canManage: boolean;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, data: ProjectFormData) => Promise<void>;
}) {
  const { id = "" } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    apiRequest(`/api/projetos/${id}`, token)
      .then(data => {
        if (active) setProject(mapProject(data.projeto));
      })
      .catch(error => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [id, token]);

  if (loading) {
    return <main className="workspace">Carregando projeto...</main>;
  }

  if (!project) {
    return (
      <main className="workspace">
        <Link className="back-link" to="/projects">← Voltar</Link>
        <div className="form-error">{error || "Projeto não encontrado."}</div>
      </main>
    );
  }

  if (editing && canManage) {
    return (
      <ProjectForm
        initial={project}
        title="Editar projeto"
        loading={false}
        error={error}
        onSave={async data => {
          try {
            await onUpdate(id, data);
            setProject({ ...project, ...data });
            setEditing(false);
            setError("");
          } catch (error) {
            setError(error instanceof Error ? error.message : "Erro ao atualizar.");
          }
        }}
      />
    );
  }

  return (
    <main className="workspace">
      <Link className="back-link" to="/projects">← Voltar aos projetos</Link>

      <div className="page-heading">
        <div>
          <span className="eyebrow">DETALHES DO PROJETO</span>
          <h1>{project.name}</h1>
          <p>{project.description || "Sem descrição."}</p>
        </div>
        {canManage && (
          <div className="form-actions">
            <button className="secondary" onClick={() => setEditing(true)}>
              Editar
            </button>
            <button
              className="danger"
              onClick={() => {
                if (window.confirm("Deseja realmente excluir este projeto?")) {
                  onDelete(id);
                }
              }}
            >
              Excluir
            </button>
          </div>
        )}
      </div>

      <section className="detail-stats">
        <div>
          <span>Ambiente</span>
          <strong>{project.environment}</strong>
        </div>
        <div>
          <span>URL base</span>
          <strong>{project.baseUrl || "Não informada"}</strong>
        </div>
      </section>

      <CasesPanel token={token} project={project} canManage={canManage} />
    </main>
  );
}

function BillingPage({ token }: { token: string }) {
  const [status, setStatus] = useState<any>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [message, setMessage] = useState(new URLSearchParams(window.location.search).get("checkout") === "success" ? "Checkout concluído. A confirmação depende do webhook Stripe." : "");
  useEffect(() => { apiRequest("/api/billing/status", token).then(data => setStatus(data.assinatura)).catch(err => setError(err.message)).finally(() => setLoading(false)); }, [token]);
  async function action(path: string) { setLoading(true); setError(""); try { const data = await apiRequest(path, token, { method: "POST" }); if (data.url) window.location.assign(data.url); } catch (err) { setError(err instanceof Error ? err.message : "Falha na cobrança."); } finally { setLoading(false); } }
  return <main className="workspace narrow"><div className="page-heading"><div><span className="eyebrow">CONTA E PLANO</span><h1>Assinatura</h1><p>Consulte seu plano e gerencie a cobrança.</p></div></div>
    {error && <div className="form-error">{error}</div>}{message && <div className="form-success">{message}</div>}
    {loading && !status ? <div className="empty-state">Carregando assinatura...</div> : <section className="case-create-panel"><span className="eyebrow">PLANO ATUAL</span><h2>{status?.plano === "pro" ? "TestFlow Pro" : "Plano gratuito"}</h2><p>Status: {status?.status || "inactive"}</p>{status?.periodo_fim && <p>Período até {new Date(status.periodo_fim).toLocaleDateString("pt-BR")}</p>}{status?.cancelar_no_fim && <p>Cancelamento programado ao fim do período.</p>}{status?.plano === "pro" ? <button className="primary" disabled={loading} onClick={() => action("/api/billing/portal")}>Gerenciar assinatura</button> : <button className="primary" disabled={loading} onClick={() => action("/api/billing/checkout")}>Assinar TestFlow Pro</button>}<small>Checkout depende da configuração de chaves e preço recorrente no servidor.</small></section>}</main>;
}
function Protected({
  token,
  children
}: {
  token: string | null;
  children: React.ReactNode;
}) {
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem(TOKEN_KEY)
  );
  const [user, setUser] = useState<User | null>(getStoredUser);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setProjects([]);
    navigate("/login");
  }

  function login(newToken: string, newUser: User) {
    sessionStorage.setItem(TOKEN_KEY, newToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }

  async function loadProjects() {
    if (!token) return;

    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/api/projetos", token);
      setProjects((data.projetos || []).map(mapProject));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao carregar.";
      if (message.includes("Token") || message.includes("autenticação")) {
        logout();
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadProjects();
  }, [token]);

  async function createProject(data: ProjectFormData) {
    if (!token) throw new Error("Sessão não encontrada.");

    await apiRequest("/api/projetos", token, {
      method: "POST",
      body: JSON.stringify({
        nome: data.name,
        descricao: data.description,
        url_base: data.baseUrl || null,
        ambiente: data.environment
      })
    });

    await loadProjects();
    navigate("/projects");
  }

  async function updateProject(id: string, data: ProjectFormData) {
    if (!token) throw new Error("Sessão não encontrada.");

    await apiRequest(`/api/projetos/${id}`, token, {
      method: "PUT",
      body: JSON.stringify({
        nome: data.name,
        descricao: data.description,
        url_base: data.baseUrl || null,
        ambiente: data.environment
      })
    });

    await loadProjects();
  }

  async function deleteProject(id: string) {
    if (!token) return;

    try {
      await apiRequest(`/api/projetos/${id}`, token, {
        method: "DELETE"
      });
      await loadProjects();
      navigate("/projects");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao excluir.");
    }
  }

  const canManage = user?.role !== "desenvolvedor";

  return (
    <Shell user={user} onLogout={logout}>
      <Routes>
        <Route path="/" element={<Landing loggedIn={Boolean(token)} />} />
        <Route path="/produto" element={<ProdutoPage loggedIn={Boolean(token)} />} />
        <Route path="/seguranca" element={<SegurancaPage loggedIn={Boolean(token)} />} />
        <Route path="/billing" element={<Protected token={token}><BillingPage token={token || ""} /></Protected>} />

        <Route
          path="/login"
          element={
            token
              ? <Navigate to="/projects" replace />
              : <AuthPage mode="login" onLogin={login} />
          }
        />

        <Route
          path="/register"
          element={
            token
              ? <Navigate to="/projects" replace />
              : <AuthPage mode="register" onLogin={login} />
          }
        />

        <Route
          path="/projects"
          element={
            <Protected token={token}>
              <Projects
                projects={projects}
                loading={loading}
                error={error}
                canManage={canManage}
              />
            </Protected>
          }
        />

        <Route
          path="/projects/new"
          element={
            <Protected token={token}>
              {canManage ? (
                <ProjectForm
                  title="Novo projeto"
                  loading={false}
                  error=""
                  onSave={createProject}
                />
              ) : <Navigate to="/projects" replace />}
            </Protected>
          }
        />

        <Route
          path="/projects/:id"
          element={
            <Protected token={token}>
              <ProjectDetails
                token={token || ""}
                canManage={canManage}
                onDelete={deleteProject}
                onUpdate={updateProject}
              />
            </Protected>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
