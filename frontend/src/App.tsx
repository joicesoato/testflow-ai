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
            <a href="/#produto">Produto</a>
            <a href="/#seguranca">Segurança</a>
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

function Landing() {
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
          <Link className="primary" to="/register">
            Criar minha conta <span>→</span>
          </Link>
        </section>
      </main>
    </>
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
  return (
    <main className="workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ÁREA DE TRABALHO</span>
          <h1>Meus projetos</h1>
          <p>Organize os projetos e acompanhe seus testes de API.</p>
        </div>
        {canManage && (
          <Link className="primary" to="/projects/new">Novo projeto</Link>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="empty-state">Carregando projetos...</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <h2>Nenhum projeto cadastrado</h2>
          <p>Crie seu primeiro projeto para começar.</p>
          {canManage && (
            <Link className="primary" to="/projects/new">Criar projeto</Link>
          )}
        </div>
      ) : (
        <div className="project-grid">
          {projects.map(project => (
            <article className="project-card" key={project.id}>
              <div className="project-icon">API</div>
              <h2>{project.name}</h2>
              <p>{project.description || "Sem descrição."}</p>
              <div className="project-meta">
                <span>{project.environment}</span>
              </div>
              {project.baseUrl && (
                <div className="project-url">{project.baseUrl}</div>
              )}
              <Link className="card-link" to={`/projects/${project.id}`}>
                Acessar projeto →
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

      <section className="case-detail">
        <div className="list-heading">
          <h2>Casos de teste</h2>
        </div>
        <div className="pending-panel">
          <b>Integração em andamento</b>
          <span>
            O gerenciamento de casos de teste será habilitado quando as
            respectivas rotas da API forem implementadas.
          </span>
        </div>
      </section>
    </main>
  );
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
        <Route path="/" element={<Landing />} />

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
