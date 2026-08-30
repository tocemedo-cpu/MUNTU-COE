"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Filter,
  Gauge,
  Gavel,
  Globe2,
  Handshake,
  Home,
  Inbox,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  Menu,
  Network,
  Package,
  PackageCheck,
  Pickaxe,
  Plane,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  UploadCloud,
  UserCog,
  Users,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUSES } from "@/lib/support";
import { bucketRequestsByMonth, computeAvgCycleDays, computeSlaOnTimePct } from "@/lib/requests-sla";

type PortalView =
  | "dashboard" | "new-request" | "requests" | "approvals" | "suppliers"
  | "tenders" | "contracts" | "catalog" | "pos" | "receipts" | "invoices" | "exceptions" | "payments"
  | "reports" | "repository" | "admin" | "users" | "billing" | "support" | "applications" | "team";

type RequestItem = {
  id: string;
  subject: string;
  tower: string;
  value: number;
  status: string;
  priority: "Alta" | "Média" | "Normal" | string;
  owner: string;
  sla: string;
  stage: number;
  submitted: string;
  supplier: string;
  costCenter: string;
  createdAt: string;
  slaDueAt: string | null;
  decidedAt: string | null;
};

type Supplier = { id: number; name: string; category: string; passport: number; risk: string; local: string; status: string; iban: string | null; bic: string | null };
type PurchaseOrder = { id: string; supplier: string; description: string; value: number; status: string; nextAction: string; supplierId: number | null; requestId: string | null };
type PoEvent = { id: number; poId: string; type: string; description: string; userId: number | null; createdAt: string };
type Receipt = { id: number; po: string; description: string; supplier: string; value: number; progress: number; status: string };
type Invoice = { id: string; supplier: string; po: string; value: number; match: string; status: string; due: string };
type ExceptionItem = { id: string; title: string; ref: string; owner: string; cause: string; impact: string; resolved: boolean; createdAt: string };
type Approver = { id: number; name: string; role: string; accessLevel: AccessLevel };
type PublicStats = { activeRequests: number; slaOnTimePct: number; avgCycleDays: number } | null;
type ApplicationStatus = "recebida" | "em_avaliacao" | "aprovada" | "rejeitada" | "homologada";
type ApplicationItem = {
  id: string;
  kind: "empresa" | "fornecedor";
  companyName: string;
  taxId: string;
  sector: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  status: ApplicationStatus;
  rejectionReason: string | null;
  assignedToUserId: number | null;
  homologatedAt: string | null;
  createdAt: string;
};
type ApplicationDocument = { id: number; name: string; updated: string };

const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  recebida: "Recebida",
  em_avaliacao: "Em avaliação",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  homologada: "Homologada — acesso criado",
};
type PaymentBatch = { id: string; date: string; count: number; value: number; status: string; released: boolean };
type DocumentItem = { id: number; name: string; type: string; request: string; owner: string; version: string; updated: string };
type AccessLevel = "system_admin" | "coe_manager" | "analyst" | "supplier" | "company_admin" | "requester";
type AuthUser = { id: number; name: string; email: string; role: string; initials: string; tenant: string; accessLevel: AccessLevel; companyId: number | null; supplierId: number | null };

const stages = ["Intake", "Validação", "Aprovação", "PO", "Receção", "Factura", "Excepção", "Pagamento"];

const money = (value: number) => new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(value);

// Idade calculada a cada render a partir de um timestamp real, em vez de
// um texto tipo "2h 14m" gravado uma vez na base de dados e nunca mais
// actualizado.
function formatElapsedPt(fromIso: string): string {
  const ms = Date.now() - new Date(fromIso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(minutes, 0)}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${String(hours % 24).padStart(2, "0")}h`;
}

const applicationStatusPill = (status: ApplicationStatus) => {
  if (status === "rejeitada") return "status status-red";
  if (status === "aprovada" || status === "homologada") return "status status-green";
  return "status status-amber"; // recebida | em_avaliacao
};

const statusClass = (status: string) => {
  if (["Pago", "Activo", "Validada", "Aprovado", "Concluído", "Confirmada"].includes(status)) return "status status-green";
  if (["Excepção", "Vencido", "Rejeitado"].some((word) => status.includes(word))) return "status status-red";
  if (["Aprovação", "Pendente", "Revisão", "Documentos"].includes(status)) return "status status-amber";
  return "status status-slate";
};

// Corpo devolvido por uma rota que bloqueia por risco alto (ver
// lib/risk-block.ts) — carregado no erro lançado por api() para quem
// precisa de oferecer o override (aprovar pedido, adjudicar tender),
// sem obrigar todos os outros chamadores a mudar.
type ApiErrorBody = { error?: string; riskBlock?: boolean; canOverride?: boolean };
class ApiError extends Error {
  body: ApiErrorBody;
  constructor(body: ApiErrorBody) {
    super(body.error || "Erro de comunicação com o servidor");
    this.body = body;
  }
}

// Nome tem de bater certo com lib/csrf.ts#CSRF_COOKIE_NAME — não importado
// directamente para não puxar lib/session.ts (código de servidor) para o
// bundle do cliente só por uma constante de string.
const CSRF_COOKIE_NAME = "muntu_csrf";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Double-submit CSRF (ver middleware.ts): reenvia como cabeçalho o
  // valor do cookie legível por JS que o login/SSO deixou — o middleware
  // recusa qualquer pedido que mude estado sem os dois baterem certo.
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const csrfToken = readCookie(CSRF_COOKIE_NAME);
  if (csrfToken) headers.set("x-csrf-token", csrfToken);

  const response = await fetch(path, { ...init, headers });
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("muntu:unauthorized"));
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data as ApiErrorBody);
  }
  return data as T;
}

function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return <div className={`brand ${inverse ? "brand-inverse" : ""}`}>
    <img src="/muntu/muntu-mark.svg" alt="Símbolo Muntu COE" />
    {!compact && <span><strong>MUNTU</strong><small>CENTRE OF EXCELLENCE</small></span>}
  </div>;
}

function PublicSite({
  onLogin,
  onCandidatar,
  publicStats,
}: {
  onLogin: () => void;
  onCandidatar: () => void;
  publicStats: PublicStats;
}) {
  return <div className="public-site">
    <header className="public-header">
      <Brand />
      <nav aria-label="Navegação principal"><a href="#solucao">Solução</a><a href="#capacidades">Capacidades</a><a href="#modelo">Modelo operacional</a><a href="#expansao">Expansão</a></nav>
      <div className="public-header-actions">
        <Button variant="outline" onClick={onCandidatar}>Candidatar empresa/fornecedor</Button>
        <Button className="btn-burgundy" onClick={onLogin}>Aceder ao portal <ArrowRight /></Button>
      </div>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <Badge className="eyebrow-badge">ANGOLA FIRST • AFRICA READY</Badge>
          <h1>O seu one-stop-shop P2P com excelência.</h1>
          <p>O Muntu COE transforma pedidos, compras, fornecedores, facturas e pagamentos num único fluxo visível — com operação local, SLA mensurável e dados prontos para decisão.</p>
          <div className="hero-actions"><Button size="lg" className="btn-burgundy" onClick={onLogin}>Entrar no portal <ArrowRight /></Button><Button size="lg" variant="outline" onClick={() => document.getElementById("solucao")?.scrollIntoView({ behavior: "smooth" })}>Conhecer o modelo</Button></div>
          <div className="hero-proof"><div><strong>8</strong><span>etapas P2P conectadas</span></div><div><strong>AOA</strong><span>pagamentos e reporting local</span></div><div><strong>1</strong><span>repositório auditável</span></div></div>
        </div>
        <div className="hero-visual">
          <img src="/muntu/hero-coe.png" alt="Equipa africana do Muntu COE numa reunião de operações Oil & Gas" />
          <div className="hero-float hero-float-top"><span className="live-dot" /> Operação acompanhada em tempo real</div>
          <div className="hero-float hero-float-bottom"><Gauge /><div><strong>{publicStats ? `${publicStats.slaOnTimePct}%` : "—"}</strong><span>SLA dentro do prazo</span></div></div>
        </div>
      </section>

      <section className="pain-strip"><div><AlertTriangle /><span><strong>Hoje:</strong> e-mails, folhas de cálculo e sistemas desconectados.</span></div><ArrowRight /><div><Sparkles /><span><strong>Com Muntu:</strong> uma entrada, um responsável, um SLA, uma fonte de verdade.</span></div></section>

      <section id="solucao" className="public-section solution-section">
        <div className="section-heading"><p className="kicker">DA SOLICITAÇÃO AO PAGAMENTO</p><h2>Um processo completo, sem pontos cegos.</h2><p>O portal orquestra a transacção. A equipa Muntu trata as excepções e mantém cada interveniente informado.</p></div>
        <div className="flow-ribbon">{stages.map((stage, index) => <div className="flow-step" key={stage}><span>{String(index + 1).padStart(2, "0")}</span><strong>{stage}</strong>{index < stages.length - 1 && <ChevronRight />}</div>)}</div>
      </section>

      <section id="capacidades" className="public-section capabilities">
        <div className="capabilities-image"><img src="/muntu/operations-team.png" alt="Equipa de operações a processar transacções e documentação" /><div className="image-caption"><Clock3 /><span><strong>A complexidade não espera.</strong> O Muntu concentra trabalho, prioridade e evidência.</span></div></div>
        <div className="capabilities-copy"><p className="kicker">CAPACIDADE OPERACIONAL</p><h2>Tecnologia onde ajuda. Pessoas onde importa.</h2><div className="capability-list">
          <article><Inbox /><div><h3>Intake e triagem</h3><p>Pedidos estruturados, anexos, prioridade e ownership desde o primeiro minuto.</p></div></article>
          <article><ShoppingCart /><div><h3>Procurement e PO</h3><p>Validação, sourcing, aprovação, emissão e expediting numa única linha de execução.</p></div></article>
          <article><ReceiptText /><div><h3>AP e gestão de excepções</h3><p>3-way match, discrepâncias, resolução humana e preparação do pagamento.</p></div></article>
          <article><BarChart3 /><div><h3>Analytics e reporting</h3><p>SLA, spend, conteúdo local, risco e performance por cliente e fornecedor.</p></div></article>
        </div></div>
      </section>

      <section id="modelo" className="public-section model-section"><div className="section-heading light-heading"><p className="kicker">MODELO OPERACIONAL</p><h2>Responsabilidade clara em cada decisão.</h2></div><div className="role-grid"><article><span>01</span><Building2 /><h3>Cliente</h3><p>Solicita, aprova, recebe e liberta o pagamento segundo a sua matriz de autoridade.</p></article><article><span>02</span><Network /><h3>Muntu COE</h3><p>Executa o processo, controla SLA, resolve excepções, garante evidência e reporting.</p></article><article><span>03</span><Handshake /><h3>Fornecedor</h3><p>Mantém o Supplier Passport, confirma o PO, entrega e acompanha a factura.</p></article></div></section>

      <section id="expansao" className="public-section expansion-section"><div className="section-heading"><p className="kicker">ANGOLA PRIMEIRO. ÁFRICA A SEGUIR.</p><h2>Especialização sectorial com escala disciplinada.</h2></div><div className="sector-grid"><article className="sector-feature"><img src="/muntu/oilgas-field.png" alt="Profissionais angolanos numa instalação de Oil & Gas" /><div><span>FASE 01</span><h3>Oil & Gas</h3><p>Integridade, MRO, serviços técnicos, logística e operações de elevada criticidade.</p></div></article><article><Pickaxe /><span>FASE 01</span><h3>Minas</h3><p>Fornecimento técnico e cadeias operacionais remotas.</p></article><article><Plane /><span>FASE 01</span><h3>Aviação</h3><p>MRO, materiais críticos e serviços aeroportuários.</p></article><article><Globe2 /><span>FASE 02</span><h3>PALOP e SSA</h3><p>Expansão selectiva após prova operacional em Angola.</p></article></div></section>

      <section className="cta-section"><div><p className="kicker">COMECE COM UM PEDIDO</p><h2>Uma porta de entrada. Execução ponta-a-ponta.</h2></div><div className="cta-actions"><Button size="lg" variant="outline" onClick={onCandidatar}>Candidatar empresa/fornecedor</Button><Button size="lg" onClick={onLogin}>Aceder ao portal <ArrowRight /></Button></div></section>
    </main>
    <footer className="public-footer"><Brand inverse /><p>Procurement • Accounts Payable • Compliance • Conteúdo local</p><span>Luanda, Angola • © 2026 Muntu COE</span></footer>
  </div>;
}

// Primeiro contacto real com a plataforma, para quem ainda não tem conta
// nenhuma (Candidatura -> Documentos -> Avaliação -> Aprovada/Rejeitada ->
// Homologação -> Acesso Muntu). Sem sessão: o formulário é público
// (POST /api/applications) e o acompanhamento do estado é por token — ver
// lib/application-access.ts e o README, secção "Como um utilizador real
// chega à plataforma".
function CandidaturaScreen({
  onBack,
  initialApplicationId,
  initialToken,
  onLinkConsumed,
}: {
  onBack: () => void;
  initialApplicationId?: string;
  initialToken?: string;
  onLinkConsumed: () => void;
}) {
  const [applicationId, setApplicationId] = useState<string | undefined>(initialApplicationId);
  const [token, setToken] = useState<string | undefined>(initialToken);
  const [application, setApplication] = useState<ApplicationItem | null>(null);
  const [docs, setDocs] = useState<ApplicationDocument[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<"empresa" | "fornecedor">("empresa");
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [sector, setSector] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!applicationId || !token) return;
    try {
      window.localStorage.setItem("muntu_application_id", applicationId);
      window.localStorage.setItem("muntu_application_token", token);
    } catch {
      // localStorage indisponível (modo privado, etc.) — sem consequência,
      // o acompanhamento continua a funcionar dentro desta sessão do browser.
    }
    onLinkConsumed();
  }, [applicationId, token]);

  useEffect(() => {
    if (applicationId || token) return;
    try {
      const storedId = window.localStorage.getItem("muntu_application_id");
      const storedToken = window.localStorage.getItem("muntu_application_token");
      if (storedId && storedToken) {
        setApplicationId(storedId);
        setToken(storedToken);
      }
    } catch {
      // ver comentário acima
    }
  }, []);

  useEffect(() => {
    if (!applicationId || !token) return;
    let cancelled = false;
    (async () => {
      setLoadingStatus(true);
      try {
        const data = await api<{ application: ApplicationItem; documents: ApplicationDocument[] }>(
          `/api/applications/${encodeURIComponent(applicationId)}?token=${encodeURIComponent(token)}`
        );
        if (!cancelled) {
          setApplication(data.application);
          setDocs(data.documents);
        }
      } catch {
        if (!cancelled) toast.error("Não foi possível carregar o estado da candidatura — o link pode ter expirado.");
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applicationId, token]);

  const submitApplication = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const data = await api<{ application: ApplicationItem; token: string }>("/api/applications", {
        method: "POST",
        body: JSON.stringify({ kind, companyName, taxId, sector, contactName, contactEmail, contactPhone, notes }),
      });
      toast.success(`Candidatura ${data.application.id} recebida — enviámos um e-mail de confirmação com o link de acompanhamento.`);
      setApplication(data.application);
      setApplicationId(data.application.id);
      setToken(data.token);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível submeter a candidatura");
    } finally {
      setSubmitting(false);
    }
  };

  const uploadApplicationDocument = async (file: File) => {
    if (!applicationId || !token) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("token", token);
      formData.append("file", file);
      // Esta rota autoriza-se pelo token da candidatura, nunca por sessão
      // — mas se por acaso houver também uma sessão Muntu válida no mesmo
      // browser (ex.: um revisor a testar o link), o middleware ainda
      // exige o cabeçalho CSRF para qualquer pedido que muda estado.
      const csrfToken = readCookie(CSRF_COOKIE_NAME);
      const response = await fetch(`/api/applications/${encodeURIComponent(applicationId)}/documents`, {
        method: "POST",
        body: formData,
        headers: csrfToken ? { "x-csrf-token": csrfToken } : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível anexar o documento");
      setDocs((items) => [data.document as ApplicationDocument, ...items]);
      toast.success(`${file.name} anexado à candidatura`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível anexar o documento");
    } finally {
      setUploading(false);
    }
  };

  if (application) {
    return <main className="candidatura-page">
      <button className="back-link" onClick={onBack}><ArrowRight /> Voltar ao site</button>
      <div className="candidatura-card">
        <Brand />
        <p className="kicker">CANDIDATURA {application.id}</p>
        <h2>{application.companyName}</h2>
        {loadingStatus ? <p className="muted">A actualizar estado…</p> : <>
          <span className={statusClass(application.status === "rejeitada" ? "Rejeitado" : application.status === "homologada" ? "Aprovado" : "Pendente")}>{APPLICATION_STATUS_LABEL[application.status]}</span>
          {application.status === "rejeitada" && application.rejectionReason && <p className="muted">Motivo: {application.rejectionReason}</p>}
          {application.status === "homologada" && <p className="muted">A sua conta já foi criada — verifique o e-mail {application.contactEmail} para definir a palavra-passe e aceder ao portal.</p>}
        </>}
        <div className="sheet-documents">
          <div className="sheet-documents-head">
            <h3>Documentos de suporte</h3>
            <input ref={fileInputRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadApplicationDocument(file); event.target.value = ""; }} />
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}><UploadCloud /> Anexar</Button>
          </div>
          {docs.length === 0 ? <p className="muted">Sem documentos anexados.</p> : docs.map((doc) => <a key={doc.id} className="candidatura-doc-row" href={`/api/applications/${encodeURIComponent(applicationId ?? "")}/documents/${doc.id}/download?token=${encodeURIComponent(token ?? "")}`}><FileText /><span><strong>{doc.name}</strong><small>{doc.updated}</small></span><Download /></a>)}
        </div>
      </div>
    </main>;
  }

  return <main className="candidatura-page">
    <button className="back-link" onClick={onBack}><ArrowRight /> Voltar ao site</button>
    <div className="candidatura-card">
      <Brand />
      <p className="kicker">CANDIDATURA</p>
      <h2>Candidate-se ao Muntu COE</h2>
      <p className="muted">Empresa cliente (&ldquo;Operadora&rdquo;) ou fornecedor (&ldquo;Prestadora&rdquo;) — a candidatura segue avaliação e homologação pela equipa Muntu antes de dar acesso ao portal.</p>
      <form onSubmit={submitApplication}>
        <label>Tipo de candidatura
          <NativeSelect value={kind} onChange={(event) => setKind(event.target.value as "empresa" | "fornecedor")}>
            <NativeSelectOption value="empresa">Empresa cliente (Operadora)</NativeSelectOption>
            <NativeSelectOption value="fornecedor">Fornecedor (Prestadora)</NativeSelectOption>
          </NativeSelect>
        </label>
        <label>Nome da empresa<Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required /></label>
        <label>NIF<Input value={taxId} onChange={(event) => setTaxId(event.target.value)} required /></label>
        <label>Sector<Input value={sector} onChange={(event) => setSector(event.target.value)} placeholder="ex.: Oil & Gas, Logística…" /></label>
        <label>Nome do contacto<Input value={contactName} onChange={(event) => setContactName(event.target.value)} required /></label>
        <label>E-mail do contacto<Input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} required /></label>
        <label>Telefone<Input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /></label>
        <label>Notas<Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Apresentação breve, capacidades, referências…" /></label>
        <Button type="submit" size="lg" className="btn-burgundy login-submit" disabled={submitting}>{submitting ? "A submeter…" : "Submeter candidatura"} <ArrowRight /></Button>
      </form>
    </div>
  </main>;
}

function Login({
  onBack,
  onSuccess,
  initialError,
  resetToken,
  onResetTokenConsumed,
  publicStats,
}: {
  onBack: () => void;
  onSuccess: (user: AuthUser) => void;
  initialError?: string;
  resetToken?: string;
  onResetTokenConsumed: () => void;
  publicStats: PublicStats;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"email" | "password" | "forgot" | "reset">(resetToken ? "reset" : "email");
  const [ssoCompanyName, setSsoCompanyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => { if (initialError) toast.error(initialError); }, [initialError]);
  useEffect(() => { if (resetToken) setStep("reset"); }, [resetToken]);

  const continueWithEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { authMethod, companyName } = await api<{ authMethod: "sso" | "password"; companyName?: string }>(
        "/api/auth/company-lookup",
        { method: "POST", body: JSON.stringify({ email }) }
      );
      if (authMethod === "sso") {
        setSsoCompanyName(companyName ?? "empresa");
      } else {
        setStep("password");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível verificar o e-mail");
    } finally {
      setLoading(false);
    }
  };

  const startSso = () => {
    window.location.href = `/api/auth/sso/start?email=${encodeURIComponent(email)}`;
  };

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { user } = await api<{ user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      toast.success("Sessão iniciada com sucesso");
      onSuccess(user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível iniciar sessão");
    } finally {
      setLoading(false);
    }
  };

  const requestPasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await api("/api/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) });
      setForgotSent(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível pedir a recuperação de acesso");
    } finally {
      setLoading(false);
    }
  };

  const confirmPasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("As palavras-passe não coincidem");
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      toast.success("Palavra-passe actualizada — inicie sessão com a nova palavra-passe");
      onResetTokenConsumed();
      setStep("email");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar a palavra-passe");
    } finally {
      setLoading(false);
    }
  };

  return <main className="login-page">
    <section className="login-visual"><button className="back-link" onClick={onBack}><ArrowRight /> Voltar ao site</button><Brand inverse /><div className="login-message"><Badge>PORTAL OPERACIONAL</Badge><h1>Todos os pedidos. Todos os intervenientes. Um único fluxo.</h1><p>Acompanhe o trabalho do intake ao pagamento, com SLA, documentação e responsabilidades visíveis.</p><div className="login-stats"><div><strong>{publicStats ? `${publicStats.slaOnTimePct}%` : "—"}</strong><span>SLA</span></div><div><strong>{publicStats ? publicStats.activeRequests : "—"}</strong><span>pedidos activos</span></div><div><strong>{publicStats ? `${publicStats.avgCycleDays.toString().replace(".", ",")}d` : "—"}</strong><span>ciclo médio</span></div></div></div></section>
    <section className="login-panel"><div className="login-card"><div className="mobile-login-brand"><Brand /></div><p className="kicker">BEM-VINDO DE VOLTA</p><h2>Aceda ao Muntu COE</h2>
      {step === "email" && !ssoCompanyName && <p className="muted">Introduza o seu e-mail — o portal identifica automaticamente o seu perfil e decide se é SSO ou palavra-passe.</p>}
      {step === "email" && !ssoCompanyName && <form onSubmit={continueWithEmail}>
        <label>E-mail corporativo<div className="input-with-icon"><Mail /><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /></div></label>
        <Button type="submit" size="lg" className="btn-burgundy login-submit" disabled={loading}>{loading ? "A verificar…" : "Continuar"} <ArrowRight /></Button>
      </form>}
      {ssoCompanyName && <div className="wizard-step">
        <p>A <strong>{ssoCompanyName}</strong> usa início de sessão único (SSO). Vai ser redireccionado para o fornecedor de identidade da sua empresa.</p>
        <Button size="lg" className="btn-burgundy login-submit" onClick={startSso}>Continuar com SSO <ArrowRight /></Button>
        <button type="button" className="back-link" onClick={() => { setSsoCompanyName(null); setStep("email"); }}>Usar outro e-mail</button>
      </div>}
      {step === "password" && !ssoCompanyName && <form onSubmit={submitPassword}>
        <p className="muted">{email}</p>
        <label>Palavra-passe<div className="input-with-icon"><KeyRound /><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /></div></label>
        <div className="login-options"><label className="remember"><Switch defaultChecked size="sm" /> Manter sessão</label><button type="button" onClick={() => setStep("forgot")}>Recuperar acesso</button></div>
        <Button type="submit" size="lg" className="btn-burgundy login-submit" disabled={loading}>{loading ? "A entrar…" : "Entrar no portal"} <ArrowRight /></Button>
        <button type="button" className="back-link" onClick={() => setStep("email")}>Usar outro e-mail</button>
      </form>}
      {step === "forgot" && !forgotSent && <form onSubmit={requestPasswordReset}>
        <p className="muted">Introduza o seu e-mail — se existir uma conta com palavra-passe local, enviamos um link para a repor.</p>
        <label>E-mail corporativo<div className="input-with-icon"><Mail /><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /></div></label>
        <Button type="submit" size="lg" className="btn-burgundy login-submit" disabled={loading}>{loading ? "A enviar…" : "Enviar link de recuperação"} <ArrowRight /></Button>
        <button type="button" className="back-link" onClick={() => setStep("password")}>Voltar</button>
      </form>}
      {step === "forgot" && forgotSent && <div className="wizard-step">
        <p>Se existir uma conta com o e-mail <strong>{email}</strong>, enviámos um link para repor a palavra-passe. Verifique a caixa de entrada (e o spam) — o link expira em 30 minutos.</p>
        <button type="button" className="back-link" onClick={() => { setForgotSent(false); setStep("password"); }}>Voltar ao login</button>
      </div>}
      {step === "reset" && <form onSubmit={confirmPasswordReset}>
        <p className="muted">Defina uma nova palavra-passe para a sua conta.</p>
        <label>Nova palavra-passe<div className="input-with-icon"><KeyRound /><Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} autoFocus /></div></label>
        <label>Confirmar palavra-passe<div className="input-with-icon"><KeyRound /><Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} /></div></label>
        <Button type="submit" size="lg" className="btn-burgundy login-submit" disabled={loading}>{loading ? "A actualizar…" : "Definir nova palavra-passe"} <ArrowRight /></Button>
        <button type="button" className="back-link" onClick={() => { onResetTokenConsumed(); setStep("email"); }}>Cancelar</button>
      </form>}
    <div className="secure-note"><ShieldCheck /><span>Ambiente seguro • Autenticação ligada à base de dados • AOA</span></div></div></section>
  </main>;
}

// Quem pode ver cada vista. Um "requester" fica limitado ao seu próprio
// workflow de pedidos; um "analyst" (buyer/AP) fica limitado à execução
// P2P (sem dashboard, relatórios ou administração — isso é do COE
// manager); "company_admin", "coe_manager" e "system_admin" têm visão
// abrangente. A imposição real está nas rotas de API (middleware.ts +
// lib/authz.ts) — isto só decide o que aparece no menu.
const VIEW_ROLES: Record<PortalView, AccessLevel[]> = {
  dashboard: ["company_admin", "coe_manager", "system_admin"],
  "new-request": ["requester", "company_admin"],
  requests: ["requester", "company_admin", "coe_manager", "system_admin"],
  approvals: ["company_admin", "coe_manager", "system_admin"],
  suppliers: ["company_admin", "analyst", "coe_manager", "system_admin", "supplier"],
  tenders: ["company_admin", "analyst", "coe_manager", "system_admin", "supplier"],
  contracts: ["company_admin", "analyst", "coe_manager", "system_admin", "supplier"],
  catalog: ["requester", "company_admin", "analyst", "coe_manager", "system_admin", "supplier"],
  pos: ["company_admin", "analyst", "coe_manager", "system_admin", "supplier"],
  receipts: ["company_admin", "analyst", "coe_manager", "system_admin", "supplier"],
  invoices: ["company_admin", "analyst", "coe_manager", "system_admin", "supplier"],
  exceptions: ["company_admin", "analyst", "coe_manager", "system_admin"],
  payments: ["company_admin", "analyst", "coe_manager", "system_admin"],
  reports: ["company_admin", "coe_manager", "system_admin"],
  repository: ["company_admin", "analyst", "coe_manager", "system_admin"],
  admin: ["system_admin"],
  users: ["system_admin"],
  billing: ["system_admin"],
  // Qualquer persona pode abrir um pedido de suporte; só o System Admin
  // vê a caixa de entrada completa — essa distinção fica dentro do
  // próprio componente (ver Support/SupportInbox), não no menu.
  support: ["requester", "company_admin", "analyst", "coe_manager", "system_admin", "supplier"],
  // Avaliar/homologar candidaturas (Candidatura -> ... -> Acesso Muntu) é
  // trabalho da equipa Muntu, não de uma empresa/fornecedor cliente.
  applications: ["coe_manager", "system_admin"],
  // Convidar colegas para a própria empresa — só o Administrador da
  // empresa, escopado à sua própria empresa (ver /api/company/users).
  team: ["company_admin"],
};

const navigation: { group: string; items: { id: PortalView; label: string; icon: typeof Home; count?: number }[] }[] = [
  { group: "TRABALHO", items: [{ id: "dashboard", label: "Visão geral", icon: LayoutDashboard }, { id: "new-request", label: "Novo pedido", icon: Plus }, { id: "requests", label: "Meus pedidos", icon: Inbox }, { id: "approvals", label: "Aprovações", icon: ClipboardCheck }, { id: "team", label: "Equipa", icon: UserCog }] },
  { group: "HOMOLOGAÇÃO", items: [{ id: "applications", label: "Candidaturas", icon: Handshake }] },
  { group: "SOURCING", items: [{ id: "tenders", label: "Tenders (RFQ)", icon: Gavel }, { id: "contracts", label: "Contratos", icon: BriefcaseBusiness }, { id: "catalog", label: "Catálogo", icon: Package }] },
  { group: "EXECUÇÃO P2P", items: [{ id: "suppliers", label: "Fornecedores", icon: Users }, { id: "pos", label: "Ordens de compra", icon: ShoppingCart }, { id: "receipts", label: "Recepções", icon: PackageCheck }, { id: "invoices", label: "Facturas & match", icon: ReceiptText }, { id: "exceptions", label: "Excepções", icon: AlertTriangle }, { id: "payments", label: "Pagamentos", icon: WalletCards }] },
  { group: "INTELIGÊNCIA", items: [{ id: "reports", label: "Relatórios", icon: BarChart3 }, { id: "repository", label: "Repositório", icon: Database }, { id: "admin", label: "Administração", icon: Settings }, { id: "users", label: "Utilizadores", icon: UserCog }, { id: "billing", label: "Facturação", icon: Landmark }] },
  { group: "SUPORTE", items: [{ id: "support", label: "Suporte", icon: LifeBuoy }] },
];

const viewLabels: Record<PortalView, string> = { dashboard: "Visão geral", "new-request": "Novo pedido", requests: "Meus pedidos", approvals: "Aprovações", suppliers: "Fornecedores", tenders: "Tenders (RFQ)", contracts: "Contratos", catalog: "Catálogo", pos: "Ordens de compra", receipts: "Recepções", invoices: "Facturas & match", exceptions: "Excepções", payments: "Pagamentos", reports: "Relatórios", repository: "Repositório", admin: "Administração", users: "Utilizadores", billing: "Facturação", support: "Suporte", applications: "Candidaturas", team: "Equipa" };

function Portal({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const firstAllowedView = (navigation.flatMap((group) => group.items).find((item) => VIEW_ROLES[item.id].includes(user.accessLevel))?.id ?? "dashboard") as PortalView;
  const [view, setView] = useState<PortalView>(firstAllowedView);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [receiptsList, setReceiptsList] = useState<Receipt[]>([]);
  const [invoicesList, setInvoicesList] = useState<Invoice[]>([]);
  const [exceptionsList, setExceptionsList] = useState<ExceptionItem[]>([]);
  const [paymentBatches, setPaymentBatches] = useState<PaymentBatch[]>([]);
  const [documentsList, setDocumentsList] = useState<DocumentItem[]>([]);
  const [applicationsList, setApplicationsList] = useState<ApplicationItem[]>([]);

  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  // Sem valores por omissão fixos no código (antes "Kwanza Industrial",
  // "OFS-OPS-210", "João Sebastião — Director de Operações" para todos os
  // utilizadores, de qualquer empresa) — o fornecedor e o aprovador ficam
  // vazios até serem escolhidos ou preenchidos com o primeiro dado real
  // recebido da API (ver efeito abaixo).
  const [form, setForm] = useState({ tower: "Requisition-to-PO", type: "PO standard", subject: "", costCenter: "", supplier: "", value: "", due: "", approver: "", priority: "Média", notes: "" });

  const isRequester = user.accessLevel === "requester";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Um "requester" está bloqueado no servidor para as rotas de
        // execução P2P — nem sequer as chama, para não rebentar o
        // carregamento do portal com um 403 dentro do Promise.all.
        const [r, s, ap] = await Promise.all([
          api<{ requests: RequestItem[] }>("/api/requests"),
          api<{ suppliers: Supplier[] }>("/api/suppliers"),
          api<{ approvers: Approver[] }>("/api/approvers"),
        ]);
        if (cancelled) return;
        setRequests(r.requests);
        setSuppliersList(s.suppliers);
        setApprovers(ap.approvers);

        if (!isRequester) {
          const [po, rc, inv, exc, pay, doc] = await Promise.all([
            api<{ purchaseOrders: PurchaseOrder[] }>("/api/purchase-orders"),
            api<{ receipts: Receipt[] }>("/api/receipts"),
            api<{ invoices: Invoice[] }>("/api/invoices"),
            api<{ exceptions: ExceptionItem[] }>("/api/exceptions"),
            api<{ paymentBatches: PaymentBatch[] }>("/api/payments"),
            api<{ documents: DocumentItem[] }>("/api/documents"),
          ]);
          if (cancelled) return;
          setPurchaseOrders(po.purchaseOrders);
          setReceiptsList(rc.receipts);
          setInvoicesList(inv.invoices);
          setExceptionsList(exc.exceptions);
          setPaymentBatches(pay.paymentBatches);
          setDocumentsList(doc.documents);
        }

        if (user.accessLevel === "coe_manager" || user.accessLevel === "system_admin") {
          const { applications } = await api<{ applications: ApplicationItem[] }>("/api/applications");
          if (cancelled) return;
          setApplicationsList(applications);
        }
      } catch {
        if (!cancelled) toast.error("Não foi possível carregar os dados do portal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Preenche o fornecedor/aprovador do wizard com o primeiro dado real
  // assim que chega — só se o utilizador ainda não escolheu nada, para
  // nunca substituir uma escolha já feita.
  useEffect(() => {
    if (suppliersList.length === 0) return;
    setForm((current) => (current.supplier ? current : { ...current, supplier: suppliersList[0].name }));
  }, [suppliersList]);
  useEffect(() => {
    if (approvers.length === 0) return;
    setForm((current) => (current.approver ? current : { ...current, approver: `${approvers[0].name} — ${approvers[0].role}` }));
  }, [approvers]);

  const go = (next: PortalView) => { setView(next); setSidebarOpen(false); setSearch(""); };

  const filteredRequests = useMemo(() => { const query = search.toLowerCase(); return requests.filter((item) => [item.id, item.subject, item.supplier, item.status].some((field) => field.toLowerCase().includes(query))); }, [requests, search]);

  const actOnRequest = async (id: string, action: "approve" | "reject", overrideRisk?: boolean) => {
    try {
      const { request: updated } = await api<{ request: RequestItem }>(`/api/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, overrideRisk }),
      });
      setRequests((items) => items.map((item) => (item.id === id ? updated : item)));
      toast[action === "approve" ? "success" : "error"](action === "approve" ? `${id} aprovado e enviado para execução` : `${id} devolvido ao solicitante`);
    } catch (error) {
      // Bloqueio por risco alto (lib/risk-block.ts): quem pode confirmar
      // o override tem a opção de repetir a acção com overrideRisk — sem
      // isto, o único caminho seria pedir a outra pessoa para editar o
      // risco do fornecedor só para conseguir aprovar.
      if (error instanceof ApiError && error.body.riskBlock) {
        if (error.body.canOverride && window.confirm(`${error.body.error} Aprovar mesmo assim?`)) {
          return actOnRequest(id, action, true);
        }
        toast.error(error.body.error ?? "Fornecedor de risco alto");
        return;
      }
      toast.error("Não foi possível actualizar o pedido");
    }
  };

  const submitRequest = async () => {
    try {
      const { request: created } = await api<{ request: RequestItem }>("/api/requests", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setRequests((items) => [created, ...items]);
      setWizardStep(1);
      setForm((current) => ({ ...current, subject: "", value: "", due: "", notes: "" }));
      toast.success(`${created.id} submetido. A validação Muntu já começou.`);
      go("requests");
    } catch {
      toast.error("Não foi possível submeter o pedido");
    }
  };

  const resolveException = async (id: string) => {
    try {
      const { exception: updated } = await api<{ exception: ExceptionItem }>(`/api/exceptions/${id}`, { method: "PATCH", body: JSON.stringify({ action: "resolve" }) });
      setExceptionsList((items) => items.map((item) => (item.id === id ? updated : item)));
      toast.success(`${id} resolvida e registada na auditoria`);
    } catch {
      toast.error("Não foi possível resolver a excepção");
    }
  };

  const releasePayment = async (id: string) => {
    try {
      const { paymentBatch: updated } = await api<{ paymentBatch: PaymentBatch }>(`/api/payments/${id}`, { method: "PATCH", body: JSON.stringify({ action: "release" }) });
      setPaymentBatches((items) => items.map((item) => (item.id === id ? updated : item)));
      toast.success(`${id} libertado para execução bancária`);
    } catch {
      toast.error("Não foi possível libertar o pagamento");
    }
  };

  const exportIso20022 = async (id: string) => {
    try {
      const response = await fetch(`/api/payments/${id}/export/iso20022`);
      if (response.status === 401) window.dispatchEvent(new CustomEvent("muntu:unauthorized"));
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Não foi possível gerar o ficheiro");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `pain001-${id}.xml`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Ficheiro ISO 20022 gerado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o ficheiro");
    }
  };

  const confirmReceipt = async (id: number) => {
    try {
      const { receipt: updated } = await api<{ receipt: Receipt }>(`/api/receipts/${id}`, { method: "PATCH", body: JSON.stringify({ action: "confirm" }) });
      setReceiptsList((items) => items.map((item) => (item.id === id ? updated : item)));
      toast.success("Recepção confirmada e factura desbloqueada");
    } catch {
      toast.error("Não foi possível confirmar a recepção");
    }
  };

  const advancePo = async (poId: string, action: "ship" | "deliver" | "flag_exception" | "resolve_exception"): Promise<PurchaseOrder | null> => {
    try {
      const { purchaseOrder: updated } = await api<{ purchaseOrder: PurchaseOrder }>(`/api/purchase-orders/${poId}`, { method: "PATCH", body: JSON.stringify({ action }) });
      setPurchaseOrders((items) => items.map((item) => (item.id === poId ? updated : item)));
      toast.success("Estado da PO actualizado");
      return updated;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar a PO");
      return null;
    }
  };

  const inviteSupplier = async () => {
    try {
      const { supplier: created } = await api<{ supplier: Supplier }>("/api/suppliers", {
        method: "POST",
        body: JSON.stringify({ name: `Novo fornecedor ${suppliersList.length + 1}`, category: "Onboarding" }),
      });
      setSuppliersList((items) => [...items, created]);
      toast.success("Convite de onboarding criado");
    } catch {
      toast.error("Não foi possível convidar o fornecedor");
    }
  };

  const updateSupplierProfile = async (id: number, fields: { category?: string; local?: string; iban?: string; bic?: string }) => {
    try {
      const { supplier: updated } = await api<{ supplier: Supplier }>(`/api/suppliers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      setSuppliersList((items) => items.map((item) => (item.id === id ? updated : item)));
      toast.success("Perfil actualizado");
    } catch {
      toast.error("Não foi possível actualizar o perfil");
    }
  };

  const uploadDocument = async (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }): Promise<DocumentItem | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", options?.type ?? "Geral");
      formData.append("request", options?.request ?? "—");
      if (options?.entityType) formData.append("entityType", options.entityType);
      if (options?.entityId) formData.append("entityId", options.entityId);
      // Fora de api(): FormData não pode ir em JSON, mas o pedido continua
      // autenticado e a mudar estado, por isso continua a precisar do
      // cabeçalho CSRF que api() normalmente trata sozinho.
      const csrfToken = readCookie(CSRF_COOKIE_NAME);
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
        headers: csrfToken ? { "x-csrf-token": csrfToken } : undefined,
      });
      if (response.status === 401) window.dispatchEvent(new CustomEvent("muntu:unauthorized"));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar o documento");
      const created = data.document as DocumentItem;
      setDocumentsList((items) => [created, ...items]);
      toast.success(`${file.name} adicionado ao repositório`);
      return created;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o documento");
      return null;
    }
  };

  const downloadDocument = async (doc: DocumentItem) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}/download`);
      if (response.status === 401) window.dispatchEvent(new CustomEvent("muntu:unauthorized"));
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Não foi possível descarregar o ficheiro");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = doc.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível descarregar o ficheiro");
    }
  };

  const approvalsCount = requests.filter((item) => item.status === "Aprovação").length;
  const exceptionsCount = exceptionsList.filter((item) => !item.resolved).length;

  // Substitui os 3 alertas fixos no código (sempre os mesmos, para
  // qualquer utilizador, em qualquer sessão) por uma lista real derivada
  // do que já está carregado — excepções abertas mais antigas primeiro,
  // pedidos à espera de decisão (só para quem pode decidir) e recepções
  // prontas a confirmar. Sem tabela de notificações nova: é só uma leitura
  // do estado já em memória, recalculada a cada render.
  const notifications = useMemo(() => {
    type Notification = { key: string; Icon: typeof AlertTriangle; text: React.ReactNode };
    const items: Notification[] = [];
    [...exceptionsList]
      .filter((item) => !item.resolved)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, 2)
      .forEach((item) => items.push({ key: `exc-${item.id}`, Icon: AlertTriangle, text: <><b>{item.ref}</b> está em excepção há {formatElapsedPt(item.createdAt)}.</> }));
    if (!isRequester) {
      requests
        .filter((item) => item.status === "Aprovação")
        .slice(0, 2)
        .forEach((item) => items.push({ key: `req-${item.id}`, Icon: ClipboardCheck, text: <><b>{item.id}</b> aguarda a sua aprovação.</> }));
    }
    receiptsList
      .filter((item) => item.progress === 100 && item.status !== "Confirmada")
      .slice(0, 2)
      .forEach((item) => items.push({ key: `rec-${item.id}`, Icon: PackageCheck, text: <><b>{item.po}</b> está pronto para recepção.</> }));
    return items.slice(0, 5);
  }, [exceptionsList, requests, receiptsList, isRequester]);

  return <div className="portal-shell"><Toaster richColors position="top-right" />
    {sidebarOpen && <button className="mobile-overlay" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}><div className="sidebar-brand"><Brand /><button aria-label="Fechar menu" onClick={() => setSidebarOpen(false)}><X /></button></div><div className="tenant"><span>{user.initials.slice(0, 2)}</span><div><strong>{user.tenant}</strong><small>ANGOLA • PRODUÇÃO</small></div></div><nav>{navigation.map((group) => { const items = group.items.filter((item) => VIEW_ROLES[item.id].includes(user.accessLevel)); return items.length ? <div className="nav-group" key={group.group}><p>{group.group}</p>{items.map((item) => { const Icon = item.icon; const count = item.id === "approvals" ? approvalsCount : item.id === "exceptions" ? exceptionsCount : item.id === "requests" ? requests.length : item.id === "invoices" ? invoicesList.filter((invoice) => invoice.status === "Excepção").length : undefined; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => go(item.id)}><Icon /><span>{item.label}</span>{count ? <b>{count}</b> : null}</button>; })}</div> : null; })}</nav><div className="sidebar-help"><ShieldCheck /><div><strong>Centro de controlo</strong><span>Operação acompanhada pelo Muntu COE</span></div></div></aside>
    <section className="portal-main"><header className="topbar"><div className="topbar-left"><button className="menu-button" aria-label="Abrir menu" onClick={() => setSidebarOpen(true)}><Menu /></button><div><small>MUNTU COE / {user.role.toUpperCase()}</small><strong>{viewLabels[view]}</strong></div></div><div className="topbar-search"><Search /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar pedido, PO, factura ou fornecedor…" /></div><div className="topbar-actions"><Button className="btn-burgundy quick-new" onClick={() => go("new-request")}><Plus /> Novo pedido</Button><div className="notification-wrap"><Button size="icon" variant="outline" aria-label="Notificações" onClick={() => setNotificationsOpen((open) => !open)}><Bell />{notifications.length > 0 && <span className="notification-dot">{notifications.length}</span>}</Button>{notificationsOpen && <div className="notification-panel"><div><strong>Notificações</strong><button onClick={() => setNotificationsOpen(false)}><X /></button></div>{notifications.length === 0 ? <p className="muted">Sem notificações novas.</p> : notifications.map(({ key, Icon, text }) => <article key={key}><Icon /><span>{text}</span></article>)}</div>}</div><div className="user-menu"><span>{user.initials}</span><div><strong>{user.name}</strong><small>{user.role}</small></div><button aria-label="Terminar sessão" onClick={onLogout}><LogOut /></button></div></div></header>
      <main className="workspace">
        {loading ? <div className="empty-state panel"><Sparkles /><h3>A carregar o portal…</h3><p>A ligar à base de dados do Muntu COE.</p></div> : <>
          {view === "dashboard" && <Dashboard requests={requests} go={go} setSelectedRequest={setSelectedRequest} />}
          {view === "new-request" && <NewRequest step={wizardStep} setStep={setWizardStep} form={form} setForm={setForm} submit={submitRequest} suppliers={suppliersList} approvers={approvers} onUploadDocument={uploadDocument} />}
          {view === "requests" && <RequestsTable title="Meus pedidos" subtitle="Acompanhe prioridade, responsável, etapa e SLA em tempo real." requests={filteredRequests} onSelect={setSelectedRequest} />}
          {view === "approvals" && <Approvals requests={requests.filter((item) => item.status === "Aprovação")} onAction={actOnRequest} onSelect={setSelectedRequest} />}
          {view === "suppliers" && (user.accessLevel === "supplier" ? <SupplierProfile supplier={suppliersList[0]} onUpdate={updateSupplierProfile} /> : <Suppliers search={search} suppliers={suppliersList} onInvite={inviteSupplier} onUploadDocument={uploadDocument} onDownloadDocument={downloadDocument} onUpdateBankDetails={updateSupplierProfile} />)}
          {view === "tenders" && <Tenders user={user} suppliersList={suppliersList} />}
          {view === "contracts" && <Contracts user={user} suppliersList={suppliersList} onUploadDocument={uploadDocument} onDownloadDocument={downloadDocument} />}
          {view === "catalog" && <Catalog user={user} suppliersList={suppliersList} />}
          {view === "pos" && <PurchaseOrders purchaseOrders={purchaseOrders} user={user} onAdvancePo={advancePo} onUploadDocument={uploadDocument} onDownloadDocument={downloadDocument} />}
          {view === "receipts" && <Receipts receipts={receiptsList} onConfirm={confirmReceipt} onUploadDocument={uploadDocument} onDownloadDocument={downloadDocument} />}
          {view === "invoices" && <Invoices search={search} invoices={invoicesList} onUploadDocument={uploadDocument} onDownloadDocument={downloadDocument} />}
          {view === "exceptions" && <Exceptions items={exceptionsList} onResolve={resolveException} onUploadDocument={uploadDocument} onDownloadDocument={downloadDocument} />}
          {view === "payments" && <Payments batches={paymentBatches} onRelease={releasePayment} onExportIso20022={exportIso20022} />}
          {view === "reports" && <Reports requests={requests} exceptions={exceptionsList} invoices={invoicesList} purchaseOrders={purchaseOrders} suppliers={suppliersList} />}
          {view === "repository" && <Repository search={search} documents={documentsList} onUpload={uploadDocument} onDownload={downloadDocument} />}
          {view === "admin" && <Administration user={user} />}
          {view === "users" && <UsersAdmin />}
          {view === "billing" && <ClientBilling />}
          {view === "support" && <Support user={user} />}
          {view === "applications" && <Applications applications={applicationsList} onApplicationUpdated={(updated) => setApplicationsList((items) => items.map((item) => (item.id === updated.id ? updated : item)))} onUploadDocument={uploadDocument} onDownloadDocument={downloadDocument} />}
          {view === "team" && <Team />}
        </>}
      </main>
    </section>
    <Sheet open={Boolean(selectedRequest)} onOpenChange={(open) => !open && setSelectedRequest(null)}><SheetContent className="request-sheet sm:max-w-xl">{selectedRequest && <RequestDetail request={selectedRequest} onAction={actOnRequest} canDecide={!isRequester} onUploadDocument={uploadDocument} onDownloadDocument={downloadDocument} />}</SheetContent></Sheet>
  </div>;
}

function PageHeader({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-header"><div><p>{kicker}</p><h1>{title}</h1><span>{description}</span></div>{action}</div>; }

function Dashboard({ requests, go, setSelectedRequest }: { requests: RequestItem[]; go: (view: PortalView) => void; setSelectedRequest: (request: RequestItem) => void }) {
  const active = requests.filter((item) => !["Pago", "Rejeitado"].includes(item.status)).length;
  const inApproval = requests.filter((item) => item.status === "Aprovação").length;
  const totalValue = requests.reduce((sum, item) => sum + item.value, 0);
  const pipelineCounts = stages.map((_, index) => requests.filter((item) => item.stage === index).length);
  const highestApproval = requests.filter((item) => item.status === "Aprovação").sort((a, b) => b.value - a.value)[0];
  // Única fonte real de "SLA no prazo" e "ciclo médio" — ver
  // lib/requests-sla.ts. Substitui os 96,4%/3,2 dias/78% fixos no código
  // que existiam aqui antes, sem nenhuma ligação aos dados reais.
  const slaOnTimePct = computeSlaOnTimePct(requests);
  const avgCycleDays = computeAvgCycleDays(requests);
  const decidedCount = requests.filter((item) => item.decidedAt).length;

  return <><PageHeader kicker="VISÃO GERAL" title="Bom dia." description="A sua operação P2P está sob controlo, com dados actualizados directamente da base de dados." action={<Button className="btn-burgundy" onClick={() => go("new-request")}><Plus /> Criar pedido</Button>} />
    <section className="metric-grid"><article><span className="metric-icon burgundy"><Inbox /></span><div><small>PEDIDOS ACTIVOS</small><strong>{active}</strong><p>{requests.length} no total</p></div></article><article><span className="metric-icon amber"><Clock3 /></span><div><small>EM APROVAÇÃO</small><strong>{inApproval}</strong><p>Requer decisão</p></div></article><article><span className="metric-icon green"><CheckCircle2 /></span><div><small>SLA NO PRAZO</small><strong>{slaOnTimePct}%</strong><p>{decidedCount} de {requests.length} pedidos decididos</p></div></article><article><span className="metric-icon slate"><CircleDollarSign /></span><div><small>VALOR EM FLUXO</small><strong>{money(totalValue)}</strong><p>{requests.length} transacções</p></div></article></section>
    <section className="dashboard-grid"><article className="panel pipeline-panel"><div className="panel-heading"><div><p>WORKFLOW P2P</p><h2>Transacções por etapa</h2></div><button onClick={() => go("reports")}>Ver relatório <ArrowRight /></button></div><div className="pipeline-list">{pipelineCounts.map((count, index) => <button key={stages[index]} onClick={() => go(index < 3 ? "requests" : index === 3 ? "pos" : index === 4 ? "receipts" : index === 5 ? "invoices" : index === 6 ? "exceptions" : "payments")}><span>{String(index + 1).padStart(2, "0")}</span><strong>{stages[index]}</strong><b>{count}</b>{index < stages.length - 1 && <ChevronRight />}</button>)}</div><div className="cycle-summary"><div><strong>{avgCycleDays ? `${avgCycleDays.toString().replace(".", ",")} dias` : "—"}</strong><span>Ciclo médio de decisão</span></div><Progress value={slaOnTimePct} /><small>Meta: ≤ 4 dias • {slaOnTimePct}% dentro do SLA</small></div></article>
      <article className="panel attention-panel"><div className="panel-heading"><div><p>PRIORIDADE</p><h2>Requer a sua atenção</h2></div><Badge className="badge-alert">{inApproval} itens</Badge></div><button onClick={() => go("approvals")}><span className="attention-icon amber"><ClipboardCheck /></span><div><strong>{inApproval} pedidos por aprovar</strong><p>{highestApproval ? `Maior valor: ${money(highestApproval.value)}` : "Sem pedidos pendentes"}</p></div><ChevronRight /></button><button onClick={() => go("exceptions")}><span className="attention-icon red"><AlertTriangle /></span><div><strong>Excepções abertas</strong><p>Ver fila de resolução</p></div><ChevronRight /></button><button onClick={() => go("receipts")}><span className="attention-icon slate"><PackageCheck /></span><div><strong>Recepções pendentes</strong><p>Confirme para desbloquear pagamentos</p></div><ChevronRight /></button><div className="coe-note"><Sparkles /><div><strong>Muntu Operations</strong><p>A equipa já contactou o fornecedor e preparou a evidência para a sua decisão.</p></div></div></article></section>
    <section className="panel recent-panel"><div className="panel-heading"><div><p>ACTIVIDADE</p><h2>Pedidos recentes</h2></div><button onClick={() => go("requests")}>Ver todos <ArrowRight /></button></div><RequestRows requests={requests.slice(0, 4)} onSelect={setSelectedRequest} /></section>
  </>;
}

function RequestRows({ requests, onSelect }: { requests: RequestItem[]; onSelect: (request: RequestItem) => void }) { return <div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Fornecedor</TableHead><TableHead>Valor</TableHead><TableHead>Estado</TableHead><TableHead>SLA</TableHead><TableHead className="text-right">Acção</TableHead></TableRow></TableHeader><TableBody>{requests.map((request) => <TableRow key={request.id}><TableCell><button className="request-link" onClick={() => onSelect(request)}><strong>{request.id}</strong><span>{request.subject}</span></button></TableCell><TableCell>{request.supplier}</TableCell><TableCell>{money(request.value)}</TableCell><TableCell><span className={statusClass(request.status)}>{request.status}</span></TableCell><TableCell className={request.sla.includes("Vencido") ? "text-danger" : ""}>{request.sla}</TableCell><TableCell className="text-right"><Button size="icon-sm" variant="ghost" onClick={() => onSelect(request)} aria-label={`Abrir ${request.id}`}><Eye /></Button></TableCell></TableRow>)}</TableBody></Table>{requests.length === 0 && <div className="empty-state"><Search /><h3>Sem pedidos</h3><p>Ainda não existem pedidos registados.</p></div>}</div>; }

function RequestsTable({ title, subtitle, requests, onSelect }: { title: string; subtitle: string; requests: RequestItem[]; onSelect: (request: RequestItem) => void }) { return <><PageHeader kicker="WORKFLOW E REPOSITÓRIO" title={title} description={subtitle} action={<div className="header-actions"><Button variant="outline"><Filter /> Filtros</Button><Button variant="outline"><Download /> Exportar</Button></div>} /><section className="filter-chips"><button className="active">Todos <b>{requests.length}</b></button><button>Em curso <b>{requests.filter((item) => !["Pago", "Rejeitado"].includes(item.status)).length}</b></button><button>Excepções <b>{requests.filter((item) => item.status === "Excepção").length}</b></button></section><section className="panel"><RequestRows requests={requests} onSelect={onSelect} />{requests.length === 0 && <div className="empty-state"><Search /><h3>Nenhum resultado</h3><p>Experimente pesquisar por outro pedido, fornecedor ou estado.</p></div>}</section></>; }

function NewRequest({ step, setStep, form, setForm, submit, suppliers, approvers, onUploadDocument }: { step: number; setStep: (step: number) => void; form: Record<string, string>; setForm: React.Dispatch<React.SetStateAction<{ tower: string; type: string; subject: string; costCenter: string; supplier: string; value: string; due: string; approver: string; priority: string; notes: string }>>; submit: () => void; suppliers: Supplier[]; approvers: Approver[]; onUploadDocument: (file: File, options?: { type?: string; request?: string }) => void }) {
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const attachFile = (file: File) => {
    onUploadDocument(file, { type: "Pedido", request: form.subject || "Novo pedido" });
    setAttachedFiles((current) => [...current, file.name]);
  };
  return <><PageHeader kicker="INTAKE E TRIAGEM" title="Novo pedido" description="Uma entrada estruturada alimenta workflow, SLA e repositório automaticamente." /><section className="wizard-shell"><div className="wizard-progress">{["Tipo", "Detalhes", "Aprovação", "Confirmar"].map((label, index) => <button key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} onClick={() => step > index + 1 && setStep(index + 1)}><span>{step > index + 1 ? <Check /> : index + 1}</span><div><strong>{label}</strong><small>{["Torre e transacção", "Dados e anexos", "Matriz e SLA", "Revisão final"][index]}</small></div></button>)}</div><div className="wizard-content">
    {step === 1 && <div className="wizard-step"><p className="kicker">PASSO 1 DE 4</p><h2>Que trabalho precisa de iniciar?</h2><p>Escolha a torre operacional e o tipo de transacção.</p><div className="option-grid"><button className={form.tower === "Requisition-to-PO" ? "selected" : ""} onClick={() => update("tower", "Requisition-to-PO")}><ShoppingCart /><span><strong>Requisition-to-PO</strong><small>Criação, validação, aprovação e emissão de PO</small></span>{form.tower === "Requisition-to-PO" && <CheckCircle2 />}</button><button className={form.tower === "PO-to-Receipt" ? "selected" : ""} onClick={() => update("tower", "PO-to-Receipt")}><PackageCheck /><span><strong>PO-to-Receipt</strong><small>Expediting, entrega, qualidade e recepção</small></span>{form.tower === "PO-to-Receipt" && <CheckCircle2 />}</button><button className={form.tower === "Invoice-to-Pay" ? "selected" : ""} onClick={() => update("tower", "Invoice-to-Pay")}><ReceiptText /><span><strong>Invoice-to-Pay</strong><small>Factura, match, excepção e preparação do pagamento</small></span>{form.tower === "Invoice-to-Pay" && <CheckCircle2 />}</button><button className={form.tower === "Supplier Management" ? "selected" : ""} onClick={() => update("tower", "Supplier Management")}><Users /><span><strong>Supplier Management</strong><small>Onboarding, Supplier Passport, risco e desempenho</small></span>{form.tower === "Supplier Management" && <CheckCircle2 />}</button></div><label className="form-field">Tipo de transacção<NativeSelect value={form.type} onChange={(event) => update("type", event.target.value)} className="field-control"><NativeSelectOption>PO standard</NativeSelectOption><NativeSelectOption>PO catalogado</NativeSelectOption><NativeSelectOption>Serviço técnico</NativeSelectOption><NativeSelectOption>Compra urgente</NativeSelectOption><NativeSelectOption>Contrato / Call-off</NativeSelectOption></NativeSelect></label></div>}
    {step === 2 && <div className="wizard-step"><p className="kicker">PASSO 2 DE 4</p><h2>Detalhes do pedido</h2><p>Inclua informação suficiente para a validação começar sem devoluções.</p><div className="form-grid"><label className="form-field span-2">Título do pedido<Input value={form.subject} onChange={(event) => update("subject", event.target.value)} placeholder="Ex.: Válvulas de controlo para campanha offshore" /></label><label className="form-field">Centro de custo<Input value={form.costCenter} onChange={(event) => update("costCenter", event.target.value)} /></label><label className="form-field">Fornecedor preferencial<NativeSelect value={form.supplier} onChange={(event) => update("supplier", event.target.value)} className="field-control">{suppliers.map((supplier) => <NativeSelectOption key={supplier.name}>{supplier.name}</NativeSelectOption>)}</NativeSelect></label><label className="form-field">Valor estimado (AOA)<Input inputMode="numeric" value={form.value} onChange={(event) => update("value", event.target.value)} placeholder="84 000 000" /></label><label className="form-field">Data necessária<Input type="date" value={form.due} onChange={(event) => update("due", event.target.value)} /></label><label className="form-field span-2">Escopo e contexto<Textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Explique a necessidade, o local de entrega e os requisitos críticos…" /></label><input ref={fileInputRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) attachFile(file); event.target.value = ""; }} /><button type="button" className="upload-zone span-2" onClick={() => fileInputRef.current?.click()}><UploadCloud /><strong>Adicionar documentos</strong><span>{attachedFiles.length === 0 ? "Especificação, cotação, desenho ou justificativo • PDF, XLSX, DOCX, ZIP" : `${attachedFiles.length} documento${attachedFiles.length > 1 ? "s" : ""} anexado${attachedFiles.length > 1 ? "s" : ""}: ${attachedFiles.join(", ")}`}</span></button></div></div>}
    {step === 3 && <div className="wizard-step"><p className="kicker">PASSO 3 DE 4</p><h2>Aprovação e prioridade</h2><p>A regra sugerida usa o valor, centro de custo e tipo de pedido.</p><div className="approval-card"><span><ShieldCheck /></span><div><small>ROTA RECOMENDADA</small><strong>Solicitante → Director de Operações → Finanças</strong><p>O Muntu valida o dossier antes de iniciar a aprovação. Valor acima de AOA 50M requer dupla aprovação.</p></div></div><div className="form-grid"><label className="form-field span-2">Aprovador principal<NativeSelect value={form.approver} onChange={(event) => update("approver", event.target.value)} className="field-control">{approvers.length === 0 ? <NativeSelectOption value="">Sem aprovadores disponíveis</NativeSelectOption> : approvers.map((approver) => <NativeSelectOption key={approver.id}>{`${approver.name} — ${approver.role}`}</NativeSelectOption>)}</NativeSelect></label><label className="form-field">Prioridade<NativeSelect value={form.priority} onChange={(event) => update("priority", event.target.value)} className="field-control"><NativeSelectOption>Normal</NativeSelectOption><NativeSelectOption>Média</NativeSelectOption><NativeSelectOption>Alta</NativeSelectOption></NativeSelect></label><label className="form-field">SLA inicial<Input value={form.priority === "Alta" ? "4 horas" : form.priority === "Média" ? "8 horas" : "16 horas"} readOnly /></label></div><div className="sla-note"><Clock3 /><span><strong>O relógio começa após a submissão.</strong> Pausas e devoluções ficam registadas na auditoria.</span></div></div>}
    {step === 4 && <div className="wizard-step"><p className="kicker">PASSO 4 DE 4</p><h2>Confirme e submeta</h2><p>O resumo será gravado no repositório e distribuído aos responsáveis.</p><div className="summary-grid"><div><span>Torre</span><strong>{form.tower}</strong></div><div><span>Transacção</span><strong>{form.type}</strong></div><div className="span-2"><span>Pedido</span><strong>{form.subject || "Novo pedido operacional"}</strong></div><div><span>Fornecedor</span><strong>{form.supplier}</strong></div><div><span>Valor</span><strong>{form.value ? `AOA ${form.value}` : "A confirmar"}</strong></div><div><span>Centro de custo</span><strong>{form.costCenter}</strong></div><div><span>Prioridade</span><strong>{form.priority}</strong></div><div className="span-2"><span>Aprovador</span><strong>{form.approver}</strong></div></div><div className="confirmation-note"><CheckCircle2 /><div><strong>Pronto para iniciar</strong><p>A equipa Muntu receberá o pedido, validará os dados e actualizará o SLA em tempo real.</p></div></div></div>}
  </div><div className="wizard-footer"><Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : window.history.back()}>{step > 1 ? "Voltar" : "Cancelar"}</Button>{step < 4 ? <Button className="btn-burgundy" onClick={() => setStep(step + 1)} disabled={step === 2 && !form.subject}>Continuar <ArrowRight /></Button> : <Button className="btn-burgundy" onClick={submit}>Submeter pedido <CheckCircle2 /></Button>}</div></section></>;
}

function Approvals({ requests, onAction, onSelect }: { requests: RequestItem[]; onAction: (id: string, action: "approve" | "reject") => void; onSelect: (request: RequestItem) => void }) { return <><PageHeader kicker="MATRIZ DE AUTORIDADE" title="Aprovações" description="Decida com contexto, evidência e impacto visíveis." /><div className="approval-list">{requests.length ? requests.map((request) => <article key={request.id} className="approval-item"><div className="approval-main"><span className="priority-flag"><AlertTriangle /></span><div><small>{request.id} • {request.tower}</small><h2>{request.subject}</h2><p>{request.supplier} • {request.costCenter} • submetido {request.submitted}</p></div></div><div className="approval-value"><small>VALOR TOTAL</small><strong>{money(request.value)}</strong><span className={statusClass(request.status)}>{request.sla}</span></div><div className="approval-actions"><Button variant="outline" onClick={() => onSelect(request)}><Eye /> Ver dossier</Button><Button variant="outline" className="reject-button" onClick={() => onAction(request.id, "reject")}><XCircle /> Devolver</Button><Button className="btn-green" onClick={() => onAction(request.id, "approve")}><Check /> Aprovar</Button></div></article>) : <div className="empty-state panel"><CheckCircle2 /><h3>Sem aprovações pendentes</h3><p>Todos os itens foram decididos.</p></div>}</div></>; }

function SupplierPassportSheet({
  supplier,
  onUploadDocument,
  onDownloadDocument,
  onUpdateBankDetails,
}: {
  supplier: Supplier;
  onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>;
  onDownloadDocument: (doc: DocumentItem) => void;
  onUpdateBankDetails: (id: number, fields: { iban?: string; bic?: string }) => Promise<void>;
}) {
  const [iban, setIban] = useState(supplier.iban ?? "");
  const [bic, setBic] = useState(supplier.bic ?? "");
  const [saving, setSaving] = useState(false);

  const [syncedSupplierId, setSyncedSupplierId] = useState(supplier.id);
  if (supplier.id !== syncedSupplierId) {
    setSyncedSupplierId(supplier.id);
    setIban(supplier.iban ?? "");
    setBic(supplier.bic ?? "");
  }

  const saveBankDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onUpdateBankDetails(supplier.id, { iban, bic });
    } finally {
      setSaving(false);
    }
  };

  return <><SheetHeader><p className="kicker">SUPPLIER PASSPORT</p><SheetTitle>{supplier.name}</SheetTitle><SheetDescription>{supplier.category}</SheetDescription></SheetHeader><div className="sheet-body">
    <section className="supplier-summary">
      <article><ShieldCheck /><div><strong>{supplier.passport}%</strong><span>Supplier Passport</span></div></article>
      <article><Globe2 /><div><strong>{supplier.local}</strong><span>Conteúdo local</span></div></article>
      <article><AlertTriangle /><div><strong>{supplier.risk}</strong><span>Classificação de risco</span></div></article>
      <article><CheckCircle2 /><div><strong>{supplier.status}</strong><span>Estado</span></div></article>
    </section>
    <div className="sheet-documents">
      <div className="sheet-documents-head"><h3>Conta bancária (exportação ISO 20022)</h3></div>
      <form onSubmit={saveBankDetails} className="form-grid">
        <label className="form-field">IBAN<Input value={iban} onChange={(event) => setIban(event.target.value)} placeholder="AO06 0000 0000 0000 0000 0000 0" /></label>
        <label className="form-field">BIC<Input value={bic} onChange={(event) => setBic(event.target.value)} placeholder="BAOAAOLU" /></label>
        <div className="header-actions"><Button type="submit" size="sm" disabled={saving}>{saving ? "A guardar…" : "Guardar conta bancária"}</Button></div>
      </form>
    </div>
    <EntityDocuments entityType="supplier" entityId={String(supplier.id)} onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} />
  </div></>;
}

function Suppliers({
  search,
  suppliers,
  onInvite,
  onUploadDocument,
  onDownloadDocument,
  onUpdateBankDetails,
}: {
  search: string;
  suppliers: Supplier[];
  onInvite: () => void;
  onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>;
  onDownloadDocument: (doc: DocumentItem) => void;
  onUpdateBankDetails: (id: number, fields: { iban?: string; bic?: string }) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Supplier | null>(null);
  const list = suppliers.filter((supplier) => supplier.name.toLowerCase().includes(search.toLowerCase()));
  const passportAvg = suppliers.length ? Math.round(suppliers.reduce((sum, item) => sum + item.passport, 0) / suppliers.length) : 0;
  return <><PageHeader kicker="SUPPLIER PASSPORT" title="Fornecedores" description="Onboarding, compliance, conteúdo local, risco e desempenho numa única vista." action={<Button className="btn-burgundy" onClick={onInvite}><Plus /> Convidar fornecedor</Button>} /><section className="supplier-summary"><article><Users /><div><strong>{suppliers.length}</strong><span>Fornecedores registados</span></div></article><article><ShieldCheck /><div><strong>{passportAvg}%</strong><span>Passport médio</span></div></article><article><Globe2 /><div><strong>{suppliers.filter((item) => item.status === "Activo").length}</strong><span>Fornecedores activos</span></div></article><article><AlertTriangle /><div><strong>{suppliers.filter((item) => item.status === "Revisão" || item.status === "Documentos").length}</strong><span>Revisões pendentes</span></div></article></section><section className="panel"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Fornecedor</TableHead><TableHead>Categoria</TableHead><TableHead>Supplier Passport</TableHead><TableHead>Conteúdo local</TableHead><TableHead>Risco</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader><TableBody>{list.map((supplier) => <TableRow key={supplier.id}><TableCell><strong>{supplier.name}</strong></TableCell><TableCell>{supplier.category}</TableCell><TableCell><div className="passport-cell"><Progress value={supplier.passport} /><span>{supplier.passport}%</span></div></TableCell><TableCell>{supplier.local}</TableCell><TableCell><span className={supplier.risk === "Baixo" ? "risk-low" : "risk-medium"}>{supplier.risk}</span></TableCell><TableCell><span className={statusClass(supplier.status)}>{supplier.status}</span></TableCell><TableCell><Button size="icon-sm" variant="ghost" onClick={() => setSelected(supplier)} aria-label={`Ver Supplier Passport de ${supplier.name}`}><Eye /></Button></TableCell></TableRow>)}</TableBody></Table></div></section>
  <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><SheetContent className="request-sheet sm:max-w-xl">{selected && <SupplierPassportSheet supplier={selected} onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} onUpdateBankDetails={onUpdateBankDetails} />}</SheetContent></Sheet>
  </>;
}

function SupplierProfile({ supplier, onUpdate }: { supplier: Supplier | undefined; onUpdate: (id: number, fields: { category?: string; local?: string }) => Promise<void> }) {
  const [category, setCategory] = useState(supplier?.category ?? "");
  const [local, setLocal] = useState(supplier?.local ?? "");
  const [saving, setSaving] = useState(false);

  // Repõe o formulário quando o fornecedor ligado muda — feito durante o
  // render (não num efeito) seguindo o padrão recomendado pelo React para
  // "ajustar estado quando uma prop muda", evitando um render extra.
  const [syncedSupplierId, setSyncedSupplierId] = useState(supplier?.id);
  if (supplier?.id !== syncedSupplierId) {
    setSyncedSupplierId(supplier?.id);
    setCategory(supplier?.category ?? "");
    setLocal(supplier?.local ?? "");
  }

  if (!supplier) {
    return <><PageHeader kicker="SUPPLIER PASSPORT" title="O meu perfil" description="A sua conta ainda não está ligada a um fornecedor." /><div className="empty-state panel"><Users /><h3>Perfil por ligar</h3><p>Peça ao System Admin para ligar a sua conta a um fornecedor concreto em &quot;Utilizadores&quot;.</p></div></>;
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onUpdate(supplier.id, { category, local });
    } finally {
      setSaving(false);
    }
  };

  return <><PageHeader kicker="SUPPLIER PASSPORT" title="O meu perfil" description="Dados visíveis à Muntu COE e às empresas clientes." />
    <section className="supplier-summary">
      <article><ShieldCheck /><div><strong>{supplier.passport}%</strong><span>Supplier Passport</span></div></article>
      <article><Globe2 /><div><strong>{supplier.local}</strong><span>Conteúdo local</span></div></article>
      <article><AlertTriangle /><div><strong>{supplier.risk}</strong><span>Classificação de risco</span></div></article>
      <article><CheckCircle2 /><div><strong>{supplier.status}</strong><span>Estado</span></div></article>
    </section>
    <section className="panel">
      <form onSubmit={save} className="form-grid">
        <label className="form-field span-2">Categoria<Input value={category} onChange={(event) => setCategory(event.target.value)} /></label>
        <label className="form-field">Conteúdo local<Input value={local} onChange={(event) => setLocal(event.target.value)} placeholder="ex.: 85%" /></label>
        <Button type="submit" className="btn-burgundy" disabled={saving}>{saving ? "A guardar…" : "Guardar"} <ArrowRight /></Button>
      </form>
      <p className="muted">O Supplier Passport, a classificação de risco e o estado são avaliados pela Muntu COE — não são editáveis aqui.</p>
    </section>
  </>;
}

const PO_EVENT_LABELS: Record<string, string> = {
  criada: "PO criada",
  confirmada: "Recepção confirmada",
  expediting: "Em expediting",
  entregue: "Entregue",
  excepcao: "Excepção registada",
  excepcao_resolvida: "Excepção resolvida",
};

// Acção disponível -> pré-condição de estado, espelhando exactamente
// TRANSITIONS em app/api/purchase-orders/[id]/route.ts — só para decidir
// que botões mostrar; a validação real (e a única que conta) é sempre
// feita no servidor.
const PO_NEXT_ACTIONS: { action: "ship" | "deliver" | "flag_exception" | "resolve_exception"; label: string; from: string[] }[] = [
  { action: "ship", label: "Marcar em expediting", from: ["Confirmado"] },
  { action: "deliver", label: "Marcar como entregue", from: ["Expediting"] },
  { action: "flag_exception", label: "Registar excepção", from: ["Confirmado", "Expediting"] },
  { action: "resolve_exception", label: "Resolver excepção", from: ["Excepção"] },
];

function PurchaseOrderTimelineSheet({
  po,
  canAdvance,
  onAdvance,
  onUploadDocument,
  onDownloadDocument,
}: {
  po: PurchaseOrder;
  canAdvance: boolean;
  onAdvance: (poId: string, action: "ship" | "deliver" | "flag_exception" | "resolve_exception") => Promise<void>;
  onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>;
  onDownloadDocument: (doc: DocumentItem) => void;
}) {
  const [events, setEvents] = useState<PoEvent[] | null>(null);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    (async () => {
      try {
        const data = await api<{ events: PoEvent[] }>(`/api/purchase-orders/${po.id}`);
        if (!cancelled) setEvents(data.events);
      } catch {
        if (!cancelled) setEvents([]);
      }
    })();
    return () => { cancelled = true; };
  }, [po.id, po.status]);

  const advance = async (action: "ship" | "deliver" | "flag_exception" | "resolve_exception") => {
    setAdvancing(true);
    try {
      await onAdvance(po.id, action);
    } finally {
      setAdvancing(false);
    }
  };

  const availableActions = canAdvance ? PO_NEXT_ACTIONS.filter((item) => item.from.includes(po.status)) : [];

  return <><SheetHeader><p className="kicker">LINHA TEMPORAL DA PO</p><SheetTitle>{po.id}</SheetTitle><SheetDescription>{po.description}</SheetDescription></SheetHeader><div className="sheet-body">
    <div className="sheet-value"><small>VALOR</small><strong>{money(po.value)}</strong><p>{po.supplier}</p></div>
    <div className="sheet-status"><span className={statusClass(po.status)}>{po.status}</span>{po.nextAction && <span>Próxima acção: {po.nextAction}</span>}</div>
    {availableActions.length > 0 && <div className="header-actions">{availableActions.map((item) => <Button key={item.action} variant="outline" disabled={advancing} onClick={() => advance(item.action)}>{item.label}</Button>)}</div>}
    <div className="timeline"><h3>Histórico</h3>
      {events === null && <p className="muted">A carregar histórico…</p>}
      {events !== null && events.length === 0 && <p className="muted">Sem eventos registados.</p>}
      {events !== null && events.map((event, index) => <div key={event.id} className={index < events.length - 1 ? "complete" : "current"}><span>{index < events.length - 1 ? <Check /> : events.length}</span><div><strong>{PO_EVENT_LABELS[event.type] || event.type}</strong><small>{event.description} • {formatElapsedPt(event.createdAt)} atrás</small></div></div>)}
    </div>
    <EntityDocuments entityType="purchase_order" entityId={po.id} onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} />
  </div></>;
}

function PurchaseOrders({
  purchaseOrders,
  user,
  onAdvancePo,
  onUploadDocument,
  onDownloadDocument,
}: {
  purchaseOrders: PurchaseOrder[];
  user: AuthUser;
  onAdvancePo: (poId: string, action: "ship" | "deliver" | "flag_exception" | "resolve_exception") => Promise<PurchaseOrder | null>;
  onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>;
  onDownloadDocument: (doc: DocumentItem) => void;
}) {
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [exportFormOpen, setExportFormOpen] = useState(false);
  const canExport = user.accessLevel === "company_admin" || user.accessLevel === "system_admin";
  // Um fornecedor vê a sua própria PO mas não pode avançar o estado — só
  // quem faz o trabalho de execução (cliente/Muntu) tem os botões, mesmo
  // conjunto de papéis aceite pelo PATCH no servidor.
  const canAdvance = user.accessLevel !== "supplier";
  return <><PageHeader kicker="PURCHASE ORDER CONTROL TOWER" title="Ordens de compra" description="Emissão, confirmação, expediting, alterações e entrega controlados ponta-a-ponta." action={canExport ? <Button variant="outline" onClick={() => setExportFormOpen((open) => !open)}><Download /> Exportar mapa</Button> : undefined} />
    {exportFormOpen && <SapExportForm user={user} onExported={() => setExportFormOpen(false)} />}
    <section className="panel"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>PO</TableHead><TableHead>Fornecedor</TableHead><TableHead>Descrição</TableHead><TableHead>Valor AOA</TableHead><TableHead>Estado</TableHead><TableHead>Próxima acção</TableHead><TableHead /></TableRow></TableHeader><TableBody>{purchaseOrders.map((po) => <TableRow key={po.id}><TableCell><strong>{po.id}</strong></TableCell><TableCell>{po.supplier}</TableCell><TableCell>{po.description}</TableCell><TableCell>{money(po.value)}</TableCell><TableCell><span className={statusClass(po.status)}>{po.status}</span></TableCell><TableCell>{po.nextAction}</TableCell><TableCell><Button size="icon-sm" variant="ghost" onClick={() => setSelected(po)} aria-label={`Ver linha temporal de ${po.id}`}><Eye /></Button></TableCell></TableRow>)}</TableBody></Table></div></section>
  <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><SheetContent className="request-sheet sm:max-w-xl">{selected && <PurchaseOrderTimelineSheet po={selected} canAdvance={canAdvance} onAdvance={async (poId, action) => { const updated = await onAdvancePo(poId, action); if (updated) setSelected(updated); }} onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} />}</SheetContent></Sheet>
  </>;
}

// Exportação estruturada SAP (CSV, lib/sap-export.ts) — company_admin
// exporta sempre a sua própria empresa; system_admin escolhe a empresa de
// uma lista, mesmo padrão de CreateTenderForm/CreateContractForm.
function SapExportForm({ user, onExported }: { user: AuthUser; onExported: () => void }) {
  const [periodStart, setPeriodStart] = useState(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [companyId, setCompanyId] = useState("");
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [exporting, setExporting] = useState(false);

  const needsCompany = user.accessLevel === "system_admin";

  useEffect(() => {
    if (!needsCompany) return;
    (async () => {
      try {
        const { companies } = await api<{ companies: CompanyOption[] }>("/api/admin/companies");
        setCompanyOptions(companies);
      } catch {
        toast.error("Não foi possível carregar as empresas");
      }
    })();
  }, [needsCompany]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (needsCompany && !companyId) { toast.error("Escolha uma empresa"); return; }
    setExporting(true);
    try {
      const params = new URLSearchParams({ periodStart, periodEnd });
      if (needsCompany) params.set("companyId", companyId);
      const response = await fetch(`/api/purchase-orders/export/sap?${params.toString()}`);
      if (response.status === 401) window.dispatchEvent(new CustomEvent("muntu:unauthorized"));
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Não foi possível gerar o ficheiro");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `sap-po-export-${periodStart}-${periodEnd}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Mapa SAP exportado");
      onExported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o ficheiro");
    } finally {
      setExporting(false);
    }
  };

  return <section className="panel">
    <form onSubmit={submit} className="form-grid">
      <label className="form-field">Início do período<Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
      <label className="form-field">Fim do período<Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
      {needsCompany && <label className="form-field">Empresa<NativeSelect value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="field-control" required><NativeSelectOption value="">Seleccione…</NativeSelectOption>{companyOptions.map((company) => <NativeSelectOption key={company.id} value={company.id}>{company.name}</NativeSelectOption>)}</NativeSelect></label>}
      <div className="header-actions"><Button type="submit" variant="outline" disabled={exporting}><Download /> {exporting ? "A gerar…" : "Exportar CSV"}</Button></div>
    </form>
  </section>;
}

function ReceiptEvidenceSheet({ receipt, onUploadDocument, onDownloadDocument }: { receipt: Receipt; onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>; onDownloadDocument: (doc: DocumentItem) => void }) {
  return <><SheetHeader><p className="kicker">EVIDÊNCIA DE RECEPÇÃO</p><SheetTitle>{receipt.po}</SheetTitle><SheetDescription>{receipt.description}</SheetDescription></SheetHeader><div className="sheet-body">
    <div className="sheet-status"><span className={statusClass(receipt.status)}>{receipt.status}</span></div>
    <div className="sheet-value"><small>VALOR</small><strong>{money(receipt.value)}</strong><p>{receipt.supplier} • {receipt.progress}% entregue</p></div>
    <EntityDocuments entityType="receipt" entityId={String(receipt.id)} onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} />
  </div></>;
}

function Receipts({ receipts, onConfirm, onUploadDocument, onDownloadDocument }: { receipts: Receipt[]; onConfirm: (id: number) => void; onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>; onDownloadDocument: (doc: DocumentItem) => void }) {
  const [selected, setSelected] = useState<Receipt | null>(null);
  return <><PageHeader kicker="GOODS & SERVICE RECEIPT" title="Recepções" description="Confirme quantidade, qualidade, evidência e data para desbloquear a factura." /><div className="receipt-grid">{receipts.map((item) => <article className="receipt-card" key={item.id}><div><span className="receipt-icon"><PackageCheck /></span><span className={statusClass(item.status)}>{item.status}</span></div><small>{item.po}</small><h2>{item.description}</h2><p>{item.supplier}</p><strong>{money(item.value)}</strong><div className="receipt-progress"><Progress value={item.progress} /><span>{item.progress}% entregue</span></div><Button className={item.progress === 100 && item.status !== "Confirmada" ? "btn-burgundy" : ""} variant={item.progress === 100 && item.status !== "Confirmada" ? "default" : "outline"} disabled={item.status === "Confirmada"} onClick={() => (item.progress === 100 ? onConfirm(item.id) : setSelected(item))}>{item.status === "Confirmada" ? "Recepção confirmada" : item.progress === 100 ? "Confirmar recepção" : "Ver evidência"}</Button></article>)}</div>
  <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><SheetContent className="request-sheet sm:max-w-xl">{selected && <ReceiptEvidenceSheet receipt={selected} onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} />}</SheetContent></Sheet>
  </>;
}

function InvoiceMatchSheet({ invoice, onUploadDocument, onDownloadDocument }: { invoice: Invoice; onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>; onDownloadDocument: (doc: DocumentItem) => void }) {
  return <><SheetHeader><p className="kicker">IMAGEM E MATCH</p><SheetTitle>{invoice.id}</SheetTitle><SheetDescription>{invoice.supplier} • {invoice.po}</SheetDescription></SheetHeader><div className="sheet-body">
    <div className="sheet-status"><span className={statusClass(invoice.status)}>{invoice.status}</span><span>{invoice.match}</span></div>
    <div className="sheet-value"><small>VALOR</small><strong>{money(invoice.value)}</strong><p>Vencimento: {invoice.due}</p></div>
    <EntityDocuments entityType="invoice" entityId={invoice.id} title="Imagem da factura" onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} />
  </div></>;
}

function Invoices({ search, invoices, onUploadDocument, onDownloadDocument }: { search: string; invoices: Invoice[]; onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>; onDownloadDocument: (doc: DocumentItem) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const list = invoices.filter((invoice) => [invoice.id, invoice.supplier, invoice.po, invoice.status].some((item) => item.toLowerCase().includes(search.toLowerCase())));
  const touchless = invoices.length ? Math.round((invoices.filter((item) => item.match === "3-way match").length / invoices.length) * 100) : 0;
  return <><PageHeader kicker="ACCOUNTS PAYABLE" title="Facturas & match" description="Recepção digital, validação fiscal, 2/3-way match e fila de excepções." action={<><input ref={fileInputRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onUploadDocument(file, { type: "Factura" }); event.target.value = ""; }} /><Button className="btn-burgundy" onClick={() => fileInputRef.current?.click()}><UploadCloud /> Carregar factura</Button></>} /><section className="match-summary"><article><FileCheck2 /><div><strong>{touchless}%</strong><span>Touchless match</span></div></article><article><AlertTriangle /><div><strong>{invoices.filter((item) => item.status === "Excepção").length}</strong><span>Excepções abertas</span></div></article></section><section className="panel"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Factura</TableHead><TableHead>Fornecedor</TableHead><TableHead>PO</TableHead><TableHead>Valor</TableHead><TableHead>Match</TableHead><TableHead>Estado</TableHead><TableHead>Vencimento</TableHead><TableHead /></TableRow></TableHeader><TableBody>{list.map((invoice) => <TableRow key={invoice.id}><TableCell><strong>{invoice.id}</strong></TableCell><TableCell>{invoice.supplier}</TableCell><TableCell>{invoice.po}</TableCell><TableCell>{money(invoice.value)}</TableCell><TableCell>{invoice.match}</TableCell><TableCell><span className={statusClass(invoice.status)}>{invoice.status}</span></TableCell><TableCell>{invoice.due}</TableCell><TableCell><Button size="icon-sm" variant="ghost" onClick={() => setSelected(invoice)} aria-label={`Ver imagem e match de ${invoice.id}`}><Eye /></Button></TableCell></TableRow>)}</TableBody></Table></div></section>
  <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><SheetContent className="request-sheet sm:max-w-xl">{selected && <InvoiceMatchSheet invoice={selected} onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} />}</SheetContent></Sheet>
  </>;
}

function ExceptionEvidenceSheet({ item, onUploadDocument, onDownloadDocument }: { item: ExceptionItem; onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>; onDownloadDocument: (doc: DocumentItem) => void }) {
  return <><SheetHeader><p className="kicker">DOSSIER DE EXCEPÇÃO</p><SheetTitle>{item.id}</SheetTitle><SheetDescription>{item.title}</SheetDescription></SheetHeader><div className="sheet-body">
    <div className="sheet-value"><small>REFERÊNCIA</small><strong>{item.ref}</strong><p>Responsável: {item.owner} • Causa: {item.cause} • Idade: {formatElapsedPt(item.createdAt)} • Impacto: {item.impact}</p></div>
    <EntityDocuments entityType="exception" entityId={item.id} title="Evidência" onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} />
  </div></>;
}

function Exceptions({ items, onResolve, onUploadDocument, onDownloadDocument }: { items: ExceptionItem[]; onResolve: (id: string) => void; onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>; onDownloadDocument: (doc: DocumentItem) => void }) {
  const [selected, setSelected] = useState<ExceptionItem | null>(null);
  return <><PageHeader kicker="RESOLUÇÃO HUMANA" title="Excepções" description="A tecnologia identifica. O Muntu coordena pessoas, evidência e decisão até ao encerramento." /><div className="exception-list">{items.map((item) => <article key={item.id} className={item.resolved ? "resolved" : ""}><span className="exception-severity"><AlertTriangle /></span><div className="exception-copy"><small>{item.id} • {item.ref}</small><h2>{item.title}</h2><p>Responsável: <strong>{item.owner}</strong> • Causa: <strong>{item.cause}</strong> • Idade: <strong>{formatElapsedPt(item.createdAt)}</strong> • Impacto: <strong>{item.impact}</strong></p></div><div className="exception-actions">{item.resolved ? <span className="resolved-label"><CheckCircle2 /> Resolvida</span> : <><Button variant="outline" onClick={() => setSelected(item)}><Eye /> Evidência</Button><Button className="btn-burgundy" onClick={() => onResolve(item.id)}>Resolver <ArrowRight /></Button></>}</div></article>)}{items.length === 0 && <div className="empty-state panel"><CheckCircle2 /><h3>Sem excepções</h3><p>Não existem excepções registadas.</p></div>}</div>
  <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><SheetContent className="request-sheet sm:max-w-xl">{selected && <ExceptionEvidenceSheet item={selected} onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} />}</SheetContent></Sheet>
  </>;
}

function Payments({ batches, onRelease, onExportIso20022 }: { batches: PaymentBatch[]; onRelease: (id: string) => void; onExportIso20022: (id: string) => void }) { return <><PageHeader kicker="PAYMENT READINESS" title="Pagamentos" description="O Muntu prepara o lote, controla a evidência e o cliente mantém a libertação bancária." /><section className="payment-banner"><div><ShieldCheck /><span><strong>Segregação de funções preservada.</strong> Muntu prepara e recomenda; Finanças valida e liberta no banco.</span></div><Badge>0 RISCO DE CRÉDITO</Badge></section><div className="payment-grid">{batches.map((batch) => { const isReleased = batch.released || batch.status === "Pago"; return <article key={batch.id}><div><span className="payment-icon"><WalletCards /></span><span className={statusClass(isReleased ? "Pago" : "Aprovação")}>{isReleased ? "Pago" : "Pronto para libertar"}</span></div><small>{batch.id}</small><h2>{money(batch.value)}</h2><p>{batch.count} facturas • Data proposta: {batch.date}</p><div className="payment-checks">{isReleased ? <><span><CheckCircle2 /> Match concluído</span><span><CheckCircle2 /> Aprovações completas</span><span><CheckCircle2 /> Dados bancários verificados</span></> : <span className="muted"><Clock3 /> Aguarda validação e libertação bancária</span>}</div><div className="header-actions"><Button className={isReleased ? "" : "btn-burgundy"} variant={isReleased ? "outline" : "default"} disabled={isReleased} onClick={() => onRelease(batch.id)}>{isReleased ? "Comprovativo disponível" : "Libertar para o banco"}</Button><Button variant="outline" onClick={() => onExportIso20022(batch.id)}><Download /> ISO 20022</Button></div></article>; })}</div></>; }

function Reports({ requests, exceptions, invoices, purchaseOrders, suppliers }: { requests: RequestItem[]; exceptions: ExceptionItem[]; invoices: Invoice[]; purchaseOrders: PurchaseOrder[]; suppliers: Supplier[] }) {
  const openExceptions = exceptions.filter((item) => !item.resolved).length;
  // Ciclo de decisão e tendência mensal: única fonte real (ver
  // lib/requests-sla.ts), substitui o array de 6 meses fixo no código
  // (5 deles inventados) que existia aqui antes.
  const avgCycleDays = computeAvgCycleDays(requests);
  const decidedCount = requests.filter((item) => item.decidedAt).length;
  const months = bucketRequestsByMonth(requests);
  // Mesma fórmula já usada (e correcta) em Invoices — antes duplicada
  // aqui como um "87%" fixo, dessincronizado da real.
  const touchless = invoices.length ? Math.round((invoices.filter((item) => item.match === "3-way match").length / invoices.length) * 100) : 0;

  // Spend local real: conteúdo local de cada fornecedor (suppliers.local)
  // ponderado pelo valor das POs efectivamente emitidas — substitui o
  // "82% / AOA 1,24 mil M" fixo no código, sem nenhuma base nos dados.
  const localPctByName = new Map(suppliers.map((s) => [s.name, Number(String(s.local).replace(/\D/g, "")) || 0]));
  const totalSpend = purchaseOrders.reduce((sum, po) => sum + po.value, 0);
  const localSpend = purchaseOrders.reduce((sum, po) => sum + (po.value * (localPctByName.get(po.supplier) ?? 0)) / 100, 0);
  const spendLocalPct = totalSpend ? Math.round((localSpend / totalSpend) * 100) : 0;

  // Excepções por causa: agregação real de exceptions.cause — substitui a
  // lista de percentagens fixa no código (schema não tinha sequer coluna
  // de causa antes).
  const causeCounts = new Map<string, number>();
  exceptions.forEach((item) => causeCounts.set(item.cause, (causeCounts.get(item.cause) ?? 0) + 1));
  const causeBreakdown = [...causeCounts.entries()]
    .map(([label, count]): [string, number] => [label, exceptions.length ? Math.round((count / exceptions.length) * 100) : 0])
    .sort((a, b) => b[1] - a[1]);
  const topCause = causeBreakdown[0];

  return <><PageHeader kicker="CONTROL TOWER ANALYTICS" title="Relatórios" description="Performance operacional, spend, conteúdo local, risco e oportunidades de melhoria." /><section className="metric-grid report-metrics"><article><div><small>CICLO DE DECISÃO</small><strong>{avgCycleDays ? `${avgCycleDays.toString().replace(".", ",")}d` : "—"}</strong><p>{decidedCount} pedidos decididos</p></div></article><article><div><small>TOUCHLESS INVOICE</small><strong>{touchless}%</strong><p>{invoices.length} facturas</p></div></article><article><div><small>SPEND LOCAL</small><strong>{spendLocalPct}%</strong><p>{money(totalSpend)} em POs</p></div></article><article><div><small>EXCEPÇÕES ABERTAS</small><strong>{openExceptions}</strong><p>Fila activa</p></div></article></section><section className="reports-grid"><article className="panel"><div className="panel-heading"><div><p>TENDÊNCIA</p><h2>Volume e SLA</h2></div></div><div className="bar-chart">{months.map((item) => <div key={item.label}><span className="bar-value">{item.count}</span><div className="bar" style={{ height: `${Math.max(item.count * 2.4, 4)}px` }}><i style={{ height: `${item.slaPct}%` }} /></div><strong>{item.label}</strong></div>)}</div><div className="chart-legend"><span><i className="legend-burgundy" /> Pedidos</span><span><i className="legend-gold" /> SLA %</span></div></article><article className="panel"><div className="panel-heading"><div><p>DRIVERS</p><h2>Excepções por causa</h2></div></div><div className="cause-list">{causeBreakdown.length === 0 ? <p className="muted">Sem excepções registadas.</p> : causeBreakdown.map(([label, value]) => <div key={label}><span>{label}</span><Progress value={value} /><strong>{value}%</strong></div>)}</div>{topCause && <div className="insight-box"><Sparkles /><span><strong>Insight Muntu</strong>{`"${topCause[0]}" é a causa mais comum das excepções, representando ${topCause[1]}% dos casos registados.`}</span></div>}</article></section></>;
}

function Repository({ search, documents, onUpload, onDownload }: { search: string; documents: DocumentItem[]; onUpload: (file: File) => void; onDownload: (doc: DocumentItem) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const list = documents.filter((doc) => [doc.name, doc.type, doc.request, doc.owner].some((item) => item.toLowerCase().includes(search.toLowerCase())));
  return <><PageHeader kicker="FONTE ÚNICA DE VERDADE" title="Repositório" description="Documentos, versões, aprovações e evidência ligados à transacção." action={<><input ref={fileInputRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} /><Button className="btn-burgundy" onClick={() => fileInputRef.current?.click()}><UploadCloud /> Carregar documento</Button></>} /><section className="repository-layout"><aside className="folder-list"><p>PASTAS</p>{([
  { label: "Todos os documentos", Icon: FileText, count: documents.length },
  { label: "Contratos", Icon: BriefcaseBusiness, count: documents.filter((d) => d.type === "Contrato").length },
  { label: "Pedidos e PO", Icon: ShoppingCart, count: documents.filter((d) => d.type === "Pedido").length },
  { label: "Recepções", Icon: PackageCheck, count: documents.filter((d) => d.type === "Receção").length },
  { label: "Facturas", Icon: ReceiptText, count: documents.filter((d) => d.type === "Factura").length },
  { label: "Compliance", Icon: ShieldCheck, count: documents.filter((d) => d.type === "Compliance").length },
] as { label: string; Icon: typeof FileText; count: number }[]).map(({ label, Icon, count }, index) => <button className={index === 0 ? "active" : ""} key={label}><Icon /><span>{label}</span><b>{count}</b></button>)}</aside><div className="panel repository-table"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Documento</TableHead><TableHead>Tipo</TableHead><TableHead>Referência</TableHead><TableHead>Responsável</TableHead><TableHead>Versão</TableHead><TableHead>Actualizado</TableHead><TableHead /></TableRow></TableHeader><TableBody>{list.map((doc) => <TableRow key={doc.id}><TableCell><div className="doc-name"><FileText /><strong>{doc.name}</strong></div></TableCell><TableCell>{doc.type}</TableCell><TableCell>{doc.request}</TableCell><TableCell>{doc.owner}</TableCell><TableCell>{doc.version}</TableCell><TableCell>{doc.updated}</TableCell><TableCell><Button size="icon-sm" variant="ghost" onClick={() => onDownload(doc)} aria-label={`Descarregar ${doc.name}`}><Download /></Button></TableCell></TableRow>)}</TableBody></Table></div></div></section></>;
}

type SsoDraft = { authMethod: string; ssoIssuerUrl: string; ssoClientId: string; ssoClientSecret: string; iban: string; bic: string };

function SsoSettings() {
  const [companiesList, setCompaniesList] = useState<CompanyRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, SsoDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { companies } = await api<{ companies: CompanyRow[] }>("/api/admin/companies");
        setCompaniesList(companies);
        setDrafts(
          Object.fromEntries(
            companies.map((company) => [
              company.id,
              {
                authMethod: company.authMethod,
                ssoIssuerUrl: company.ssoIssuerUrl ?? "",
                ssoClientId: company.ssoClientId ?? "",
                ssoClientSecret: "",
                iban: company.iban ?? "",
                bic: company.bic ?? "",
              },
            ])
          )
        );
      } catch {
        toast.error("Não foi possível carregar as empresas");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateDraft = (id: number, field: keyof SsoDraft, value: string) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));

  const save = async (company: CompanyRow) => {
    const draft = drafts[company.id];
    setSavingId(company.id);
    try {
      const body: Record<string, string> = {
        authMethod: draft.authMethod,
        ssoIssuerUrl: draft.ssoIssuerUrl,
        ssoClientId: draft.ssoClientId,
        iban: draft.iban,
        bic: draft.bic,
      };
      if (draft.ssoClientSecret) body.ssoClientSecret = draft.ssoClientSecret;
      const { company: updated } = await api<{ company: CompanyRow }>(`/api/admin/companies/${company.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setCompaniesList((current) => current.map((row) => (row.id === company.id ? updated : row)));
      updateDraft(company.id, "ssoClientSecret", "");
      toast.success(`${updated.name} actualizada`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar a empresa");
    } finally {
      setSavingId(null);
    }
  };

  return <article className="panel">
    <div className="panel-heading"><div><p>IDENTIDADE E PAGAMENTOS</p><h2>SSO e conta bancária por empresa</h2></div></div>
    <p className="muted">Cada empresa cliente escolhe o método de login pelo domínio do e-mail. SSO só produz um login funcional com credenciais reais de um fornecedor de identidade compatível com OpenID Connect Discovery — <code>redirect_uri</code> a configurar no IdP: <code>{typeof window !== "undefined" ? window.location.origin : ""}/api/auth/sso/callback</code>.</p>
    {companiesList.map((company) => {
      const draft = drafts[company.id] ?? { authMethod: "password", ssoIssuerUrl: "", ssoClientId: "", ssoClientSecret: "", iban: "", bic: "" };
      return <div key={company.id} className="sso-company-row">
        <div className="panel-heading"><div><p>{company.domain}</p><h3>{company.name}</h3></div></div>
        <div className="admin-fields">
          <label>Método de login<NativeSelect value={draft.authMethod} onChange={(event) => updateDraft(company.id, "authMethod", event.target.value)} className="field-control"><NativeSelectOption value="password">E-mail e palavra-passe</NativeSelectOption><NativeSelectOption value="sso">SSO (OIDC)</NativeSelectOption></NativeSelect></label>
          <label>Issuer URL<Input value={draft.ssoIssuerUrl} onChange={(event) => updateDraft(company.id, "ssoIssuerUrl", event.target.value)} placeholder="https://login.microsoftonline.com/<tenant-id>/v2.0" /></label>
          <label>Client ID<Input value={draft.ssoClientId} onChange={(event) => updateDraft(company.id, "ssoClientId", event.target.value)} /></label>
          <label>Client Secret<Input type="password" value={draft.ssoClientSecret} onChange={(event) => updateDraft(company.id, "ssoClientSecret", event.target.value)} placeholder={company.hasSsoClientSecret ? "•••••••• (definido — deixe em branco para manter)" : "Não definido"} /></label>
          <label>IBAN (conta devedora, exportação ISO 20022)<Input value={draft.iban} onChange={(event) => updateDraft(company.id, "iban", event.target.value)} placeholder="AO06 0000 0000 0000 0000 0000 0" /></label>
          <label>BIC<Input value={draft.bic} onChange={(event) => updateDraft(company.id, "bic", event.target.value)} placeholder="BAOAAOLU" /></label>
        </div>
        <Button variant="outline" disabled={savingId === company.id} onClick={() => save(company)}>{savingId === company.id ? "A guardar…" : "Guardar"}</Button>
      </div>;
    })}
    {!loading && companiesList.length === 0 && <p className="muted">Sem empresas registadas.</p>}
  </article>;
}

function Administration({ user }: { user: AuthUser }) {
  return <><PageHeader kicker="CONFIGURAÇÃO E GOVERNANCE" title="Administração" description="Organização e identidade (SSO) por empresa." />
    <section className="admin-grid">
      <article className="panel"><div className="panel-heading"><div><p>ORGANIZAÇÃO</p><h2>{user.tenant}</h2></div><Badge>ANGOLA</Badge></div><div className="admin-fields"><label>Moeda principal<Input value="AOA — Kwanza angolano" readOnly /></label><label>Idioma<Input value="Português (Angola)" readOnly /></label><label>Fuso horário<Input value="Africa/Luanda (UTC+1)" readOnly /></label><label>Regime fiscal<Input value="Angola • IVA 14%" readOnly /></label></div></article>
      <SsoSettings />
      <article className="panel integration-panel"><div className="panel-heading"><div><p>ROADMAP</p><h2>Integrações</h2></div></div>{[["Banco", "Ficheiro ISO 20022 (pain.001) — Pagamentos", "Activo"], ["Fiscalidade", "AGT / SAF-T — Facturação", "Activo"], ["ERP Financeiro", "Mapa SAP (CSV) — Ordens de compra", "Activo"], ["Identidade", "Microsoft Entra ID (via SSO acima)", "Planeado"]].map((item) => <div key={item[0]}><span><Network /></span><div><strong>{item[0]}</strong><small>{item[1]}</small></div><b className={statusClass(item[2])}>{item[2]}</b></div>)}</article>
    </section>
  </>;
}

const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  system_admin: "System Admin",
  coe_manager: "COE Manager",
  analyst: "Analista (Buyer/AP)",
  company_admin: "Administrador da empresa",
  requester: "Requisitante",
  supplier: "Fornecedor",
};

type AdminUserRow = { id: number; name: string; email: string; role: string; accessLevel: AccessLevel; companyId: number | null; companyName: string | null; supplierId: number | null; supplierName: string | null };
type SupplierOption = { id: number; name: string };
type CompanyOption = { id: number; name: string };

function UsersAdmin() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [{ users: list }, { suppliers: supplierList }, { companies: companyList }] = await Promise.all([
          api<{ users: AdminUserRow[] }>("/api/admin/users"),
          api<{ suppliers: SupplierOption[] }>("/api/suppliers"),
          api<{ companies: CompanyOption[] }>("/api/admin/companies"),
        ]);
        setRows(list);
        setSupplierOptions(supplierList);
        setCompanyOptions(companyList);
      } catch {
        toast.error("Não foi possível carregar os utilizadores");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const changeAccessLevel = async (id: number, accessLevel: AccessLevel) => {
    setSavingId(id);
    try {
      const { user: updated } = await api<{ user: AdminUserRow }>(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ accessLevel }),
      });
      setRows((current) => current.map((row) => (row.id === id ? { ...row, accessLevel: updated.accessLevel } : row)));
      toast.success(`Permissão de ${rows.find((r) => r.id === id)?.name} actualizada`);
    } catch {
      toast.error("Não foi possível actualizar a permissão");
    } finally {
      setSavingId(null);
    }
  };

  const changeSupplier = async (id: number, accessLevel: AccessLevel, supplierId: number | null) => {
    setSavingId(id);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ accessLevel, supplierId }) });
      const supplierName = supplierOptions.find((s) => s.id === supplierId)?.name ?? null;
      setRows((current) => current.map((row) => (row.id === id ? { ...row, supplierId, supplierName } : row)));
      toast.success("Fornecedor ligado");
    } catch {
      toast.error("Não foi possível ligar o fornecedor");
    } finally {
      setSavingId(null);
    }
  };

  const onCreated = (user: AdminUserRow & { companyId: number | null; supplierId: number | null }) => {
    setRows((current) => [
      {
        ...user,
        companyName: user.companyId != null ? (companyOptions.find((c) => c.id === user.companyId)?.name ?? null) : null,
        supplierName: user.supplierId != null ? (supplierOptions.find((s) => s.id === user.supplierId)?.name ?? null) : null,
      },
      ...current,
    ]);
    setFormOpen(false);
  };

  return <><PageHeader kicker="GESTÃO DE PLATAFORMA" title="Utilizadores" description="Conceda ou retire permissões — o System Admin é o único nível que pode alterar isto." action={<Button className="btn-burgundy" onClick={() => setFormOpen((open) => !open)}><Plus /> Criar utilizador</Button>} />
    {formOpen && <CreateUserForm companyOptions={companyOptions} supplierOptions={supplierOptions} onCreated={onCreated} onCancel={() => setFormOpen(false)} />}
    <section className="panel"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Utilizador</TableHead><TableHead>E-mail</TableHead><TableHead>Empresa</TableHead><TableHead>Nível de acesso</TableHead><TableHead>Fornecedor</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><strong>{row.name}</strong></TableCell><TableCell>{row.email}</TableCell><TableCell>{row.companyName ?? "—"}</TableCell><TableCell><NativeSelect value={row.accessLevel} disabled={savingId === row.id} onChange={(event) => changeAccessLevel(row.id, event.target.value as AccessLevel)} className="field-control">{(Object.keys(ACCESS_LEVEL_LABELS) as AccessLevel[]).map((level) => <NativeSelectOption key={level} value={level}>{ACCESS_LEVEL_LABELS[level]}</NativeSelectOption>)}</NativeSelect></TableCell><TableCell>{row.accessLevel === "supplier" ? <NativeSelect value={row.supplierId ?? ""} disabled={savingId === row.id} onChange={(event) => changeSupplier(row.id, row.accessLevel, event.target.value ? Number(event.target.value) : null)} className="field-control"><NativeSelectOption value="">Por ligar…</NativeSelectOption>{supplierOptions.map((supplier) => <NativeSelectOption key={supplier.id} value={supplier.id}>{supplier.name}</NativeSelectOption>)}</NativeSelect> : row.supplierName ?? "—"}</TableCell></TableRow>)}</TableBody></Table>{!loading && rows.length === 0 && <div className="empty-state"><Users /><h3>Sem utilizadores</h3></div>}</div></section></>;
}

function CreateUserForm({
  companyOptions,
  supplierOptions,
  onCreated,
  onCancel,
}: {
  companyOptions: CompanyOption[];
  supplierOptions: SupplierOption[];
  onCreated: (user: AdminUserRow & { companyId: number | null; supplierId: number | null }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("requester");
  const [companyId, setCompanyId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [saving, setSaving] = useState(false);

  const needsCompany = accessLevel === "requester" || accessLevel === "company_admin";
  const needsSupplier = accessLevel === "supplier";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { user } = await api<{ user: AdminUserRow & { companyId: number | null; supplierId: number | null } }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          role: role.trim() || undefined,
          accessLevel,
          companyId: needsCompany && companyId ? Number(companyId) : undefined,
          supplierId: needsSupplier && supplierId ? Number(supplierId) : undefined,
        }),
      });
      toast.success(`${user.name} criado — enviámos um e-mail para definir a palavra-passe`);
      onCreated(user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o utilizador");
    } finally {
      setSaving(false);
    }
  };

  return <section className="panel">
    <form onSubmit={submit} className="form-grid">
      <label className="form-field">Nome<Input value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></label>
      <label className="form-field">E-mail<Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label className="form-field">Cargo (opcional)<Input value={role} onChange={(event) => setRole(event.target.value)} placeholder={ACCESS_LEVEL_LABELS[accessLevel]} /></label>
      <label className="form-field">Nível de acesso<NativeSelect value={accessLevel} onChange={(event) => setAccessLevel(event.target.value as AccessLevel)} className="field-control">{(Object.keys(ACCESS_LEVEL_LABELS) as AccessLevel[]).map((level) => <NativeSelectOption key={level} value={level}>{ACCESS_LEVEL_LABELS[level]}</NativeSelectOption>)}</NativeSelect></label>
      {needsCompany && <label className="form-field">Empresa<NativeSelect value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="field-control" required><NativeSelectOption value="">Seleccione…</NativeSelectOption>{companyOptions.map((company) => <NativeSelectOption key={company.id} value={company.id}>{company.name}</NativeSelectOption>)}</NativeSelect></label>}
      {needsSupplier && <label className="form-field">Fornecedor<NativeSelect value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="field-control" required><NativeSelectOption value="">Seleccione…</NativeSelectOption>{supplierOptions.map((supplier) => <NativeSelectOption key={supplier.id} value={supplier.id}>{supplier.name}</NativeSelectOption>)}</NativeSelect></label>}
      <div className="header-actions"><Button type="submit" className="btn-burgundy" disabled={saving}>{saving ? "A criar…" : "Criar utilizador"} <ArrowRight /></Button><Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button></div>
    </form>
  </section>;
}

type TeamUserRow = { id: number; name: string; email: string; role: string; accessLevel: AccessLevel };

// Equipa da própria empresa — só o Administrador da empresa a vê (ver
// VIEW_ROLES), escopada por session.companyId no próprio handler
// (GET/POST /api/company/users), nunca por um id escolhido aqui. Fecha o
// buraco descoberto depois da homologação: o primeiro utilizador de cada
// empresa era criado automaticamente, mas não havia forma nenhuma de
// juntar mais colegas sem SQL directo.
function Team() {
  const [rows, setRows] = useState<TeamUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { users: list } = await api<{ users: TeamUserRow[] }>("/api/company/users");
        setRows(list);
      } catch {
        toast.error("Não foi possível carregar a equipa");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return <><PageHeader kicker="A MINHA EMPRESA" title="Equipa" description="Convide colegas da sua empresa para o portal." action={<Button className="btn-burgundy" onClick={() => setFormOpen((open) => !open)}><Plus /> Convidar colega</Button>} />
    {formOpen && <InviteTeamMemberForm onCreated={(user) => { setRows((current) => [user, ...current]); setFormOpen(false); }} onCancel={() => setFormOpen(false)} />}
    <section className="panel"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>E-mail</TableHead><TableHead>Cargo</TableHead><TableHead>Nível de acesso</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><strong>{row.name}</strong></TableCell><TableCell>{row.email}</TableCell><TableCell>{row.role}</TableCell><TableCell>{ACCESS_LEVEL_LABELS[row.accessLevel]}</TableCell></TableRow>)}</TableBody></Table>{!loading && rows.length === 0 && <div className="empty-state"><Users /><h3>Sem colegas ainda</h3><p>Convide o primeiro colega para a sua empresa.</p></div>}</div></section>
  </>;
}

function InviteTeamMemberForm({ onCreated, onCancel }: { onCreated: (user: TeamUserRow) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accessLevel, setAccessLevel] = useState<"requester" | "company_admin">("requester");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { user } = await api<{ user: TeamUserRow }>("/api/company/users", {
        method: "POST",
        body: JSON.stringify({ name, email, accessLevel }),
      });
      toast.success(`${user.name} convidado — enviámos um e-mail para definir a palavra-passe`);
      onCreated(user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível convidar o colega");
    } finally {
      setSaving(false);
    }
  };

  return <section className="panel">
    <form onSubmit={submit} className="form-grid">
      <label className="form-field">Nome<Input value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></label>
      <label className="form-field">E-mail<Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label className="form-field">Nível de acesso<NativeSelect value={accessLevel} onChange={(event) => setAccessLevel(event.target.value as "requester" | "company_admin")} className="field-control"><NativeSelectOption value="requester">Requisitante</NativeSelectOption><NativeSelectOption value="company_admin">Administrador da empresa</NativeSelectOption></NativeSelect></label>
      <div className="header-actions"><Button type="submit" className="btn-burgundy" disabled={saving}>{saving ? "A convidar…" : "Convidar colega"} <ArrowRight /></Button><Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button></div>
    </form>
  </section>;
}

type TenderStatus = "aberto" | "adjudicado" | "cancelado";
type TenderRow = {
  id: string;
  title: string;
  description: string;
  companyId: number;
  requestId: string | null;
  deadline: string;
  status: TenderStatus;
  awardedBidId: number | null;
  awardedPoId: string | null;
  createdAt: string;
};
type TenderInviteRow = { supplierId: number; supplierName: string };
type BidStatus = "submetida" | "vencedora" | "rejeitada";
type TenderBidRow = { id: number; supplierId: number; supplierName: string; value: number; notes: string; status: BidStatus; submittedAt: string };
type MyBidRow = { id: number; value: number; notes: string; status: BidStatus; submittedAt: string };
type TenderDetail = { tender: TenderRow; invites: TenderInviteRow[]; bids: TenderBidRow[] } | { tender: TenderRow; myBid: MyBidRow | null };

const TENDER_STATUS_LABEL: Record<TenderStatus, string> = { aberto: "Aberto a propostas", adjudicado: "Adjudicado", cancelado: "Cancelado" };
function tenderStatusPill(status: TenderStatus) {
  if (status === "adjudicado") return "status status-green";
  if (status === "cancelado") return "status status-red";
  return "status status-amber";
}
function isBuyerDetail(detail: TenderDetail): detail is { tender: TenderRow; invites: TenderInviteRow[]; bids: TenderBidRow[] } {
  return "invites" in detail;
}

// Sourcing (RFQ): pedido de cotação a fornecedores convidados, com
// adjudicação a uma proposta que gera a PO — primeira etapa concorrencial
// do pilar Procurement, antes disso só existia emissão de PO a partir de
// um pedido já aprovado. A criação fica limitada a quem tem uma origem
// clara para o companyId no ecrã (Administrador da empresa, pela própria
// sessão, e System Admin, pela lista de empresas) — analyst/coe_manager
// já podem gerir e adjudicar tenders existentes, mas ainda não têm aqui
// forma de escolher a empresa para abrir um novo.
function Tenders({ user, suppliersList }: { user: AuthUser; suppliersList: Supplier[] }) {
  const [rows, setRows] = useState<TenderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<TenderRow | null>(null);
  const [detail, setDetail] = useState<TenderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const isSupplier = user.accessLevel === "supplier";
  const canCreate = user.accessLevel === "company_admin" || user.accessLevel === "system_admin";
  const canManage = !isSupplier;

  const loadRows = async () => {
    try {
      const { tenders } = await api<{ tenders: TenderRow[] }>("/api/tenders");
      setRows(tenders);
    } catch {
      toast.error("Não foi possível carregar os tenders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const openDetail = async (tender: TenderRow) => {
    setSelected(tender);
    setDetail(null);
    setDetailLoading(true);
    try {
      const data = await api<TenderDetail>(`/api/tenders/${tender.id}`);
      setDetail(data);
    } catch {
      toast.error("Não foi possível carregar o detalhe do tender");
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (selected) await openDetail(selected);
    await loadRows();
  };

  return <><PageHeader kicker="SOURCING" title="Tenders (RFQ)" description="Peça cotações a vários fornecedores em concorrência e adjudique a melhor proposta." action={canCreate ? <Button className="btn-burgundy" onClick={() => setFormOpen((open) => !open)}><Plus /> Novo tender</Button> : undefined} />
    {formOpen && <CreateTenderForm user={user} suppliersList={suppliersList} onCreated={(tender) => { setRows((current) => [tender, ...current]); setFormOpen(false); }} onCancel={() => setFormOpen(false)} />}
    <section className="panel"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Tender</TableHead><TableHead>Título</TableHead><TableHead>Prazo</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Acção</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><button className="request-link" onClick={() => openDetail(row)}><strong>{row.id}</strong></button></TableCell><TableCell>{row.title}</TableCell><TableCell>{formatSupportDate(row.deadline)}</TableCell><TableCell><span className={tenderStatusPill(row.status)}>{TENDER_STATUS_LABEL[row.status]}</span></TableCell><TableCell className="text-right"><Button size="icon-sm" variant="ghost" onClick={() => openDetail(row)} aria-label={`Abrir ${row.id}`}><Eye /></Button></TableCell></TableRow>)}</TableBody></Table>{!loading && rows.length === 0 && <div className="empty-state"><Gavel /><h3>Sem tenders ainda</h3><p>{isSupplier ? "Ainda não foi convidado para nenhum tender." : "Abra o primeiro tender para começar a pedir cotações."}</p></div>}</div></section>
    <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
      <SheetContent className="request-sheet sm:max-w-xl">
        {selected && <div className="request-detail">
          <SheetHeader><SheetTitle>{selected.title}</SheetTitle><SheetDescription>{selected.id} — prazo {formatSupportDate(selected.deadline)}</SheetDescription></SheetHeader>
          <span className={tenderStatusPill(selected.status)}>{TENDER_STATUS_LABEL[selected.status]}</span>
          {selected.description && <p className="muted">{selected.description}</p>}
          {detailLoading && <p className="muted">A carregar…</p>}
          {detail && isBuyerDetail(detail) && <BuyerTenderDetail detail={detail} canManage={canManage} onChanged={refreshDetail} />}
          {detail && !isBuyerDetail(detail) && <SupplierTenderDetail tender={detail.tender} myBid={detail.myBid} onChanged={refreshDetail} />}
        </div>}
      </SheetContent>
    </Sheet>
  </>;
}

function BuyerTenderDetail({
  detail,
  canManage,
  onChanged,
}: {
  detail: { tender: TenderRow; invites: TenderInviteRow[]; bids: TenderBidRow[] };
  canManage: boolean;
  onChanged: () => void;
}) {
  const { tender, invites, bids } = detail;
  const [busy, setBusy] = useState(false);
  const sortedBids = [...bids].sort((a, b) => a.value - b.value);

  const award = async (bidId: number, overrideRisk?: boolean) => {
    setBusy(true);
    try {
      await api(`/api/tenders/${tender.id}/award`, { method: "POST", body: JSON.stringify({ bidId, overrideRisk }) });
      toast.success("Tender adjudicado — PO gerada");
      onChanged();
    } catch (error) {
      // Mesmo bloqueio por risco alto do que a aprovação de um pedido —
      // ver actOnRequest.
      if (error instanceof ApiError && error.body.riskBlock) {
        setBusy(false);
        if (error.body.canOverride && window.confirm(`${error.body.error} Adjudicar mesmo assim?`)) {
          await award(bidId, true);
        } else {
          toast.error(error.body.error ?? "Fornecedor de risco alto");
        }
        return;
      }
      toast.error(error instanceof Error ? error.message : "Não foi possível adjudicar");
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/api/tenders/${tender.id}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
      toast.success("Tender cancelado");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cancelar");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <div><p className="muted">Fornecedores convidados</p><p>{invites.map((invite) => invite.supplierName).join(", ") || "—"}</p></div>
    <div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Fornecedor</TableHead><TableHead>Valor</TableHead><TableHead>Estado</TableHead>{tender.status === "aberto" && canManage && <TableHead></TableHead>}</TableRow></TableHeader><TableBody>
      {sortedBids.map((bid) => <TableRow key={bid.id}><TableCell>{bid.supplierName}</TableCell><TableCell>{money(bid.value)}</TableCell><TableCell><span className={bid.status === "vencedora" ? "status status-green" : bid.status === "rejeitada" ? "status status-red" : "status status-slate"}>{bid.status === "submetida" ? "Submetida" : bid.status === "vencedora" ? "Vencedora" : "Rejeitada"}</span></TableCell>
        {tender.status === "aberto" && canManage && <TableCell><Button size="sm" disabled={busy} onClick={() => award(bid.id)}>Adjudicar</Button></TableCell>}
      </TableRow>)}
    </TableBody></Table>{bids.length === 0 && <p className="muted">Ainda sem propostas.</p>}</div>
    {tender.status === "aberto" && canManage && <Button variant="outline" disabled={busy} onClick={cancel}>Cancelar tender</Button>}
    {tender.awardedPoId && <p className="muted">PO gerada: <strong>{tender.awardedPoId}</strong></p>}
  </>;
}

function SupplierTenderDetail({ tender, myBid, onChanged }: { tender: TenderRow; myBid: MyBidRow | null; onChanged: () => void }) {
  const [value, setValue] = useState(myBid ? String(myBid.value) : "");
  const [notes, setNotes] = useState(myBid?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const canBid = tender.status === "aberto" && new Date(tender.deadline) > new Date();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/api/tenders/${tender.id}/bids`, { method: "POST", body: JSON.stringify({ value: Number(value), notes }) });
      toast.success(myBid ? "Proposta actualizada" : "Proposta enviada");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a proposta");
    } finally {
      setSaving(false);
    }
  };

  return <>
    {myBid && <div><p className="muted">A sua proposta</p><p><strong>{money(myBid.value)}</strong> — <span className={myBid.status === "vencedora" ? "status status-green" : myBid.status === "rejeitada" ? "status status-red" : "status status-slate"}>{myBid.status === "submetida" ? "Submetida" : myBid.status === "vencedora" ? "Vencedora" : "Rejeitada"}</span></p></div>}
    {canBid ? <form onSubmit={submit} className="form-grid">
      <label className="form-field">Valor da proposta (AOA)<Input type="number" min={0} value={value} onChange={(event) => setValue(event.target.value)} required /></label>
      <label className="form-field">Notas (opcional)<Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></label>
      <Button type="submit" className="btn-burgundy" disabled={saving}>{saving ? "A enviar…" : myBid ? "Actualizar proposta" : "Enviar proposta"} <ArrowRight /></Button>
    </form> : <p className="muted">{tender.status !== "aberto" ? "Este tender já não está aberto a propostas." : "O prazo para propostas já terminou."}</p>}
  </>;
}

function CreateTenderForm({
  user,
  suppliersList,
  onCreated,
  onCancel,
}: {
  user: AuthUser;
  suppliersList: Supplier[];
  onCreated: (tender: TenderRow) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [supplierIds, setSupplierIds] = useState<number[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [saving, setSaving] = useState(false);

  const needsCompany = user.accessLevel === "system_admin";

  useEffect(() => {
    if (!needsCompany) return;
    (async () => {
      try {
        const { companies } = await api<{ companies: CompanyOption[] }>("/api/admin/companies");
        setCompanyOptions(companies);
      } catch {
        toast.error("Não foi possível carregar as empresas");
      }
    })();
  }, [needsCompany]);

  const toggleSupplier = (id: number) => {
    setSupplierIds((current) => (current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (supplierIds.length === 0) {
      toast.error("Convide pelo menos um fornecedor");
      return;
    }
    setSaving(true);
    try {
      const { tender } = await api<{ tender: TenderRow }>("/api/tenders", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: description || undefined,
          deadline: new Date(deadline).toISOString(),
          supplierIds,
          companyId: needsCompany && companyId ? Number(companyId) : undefined,
        }),
      });
      toast.success(`${tender.id} aberto — fornecedores convidados`);
      onCreated(tender);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o tender");
    } finally {
      setSaving(false);
    }
  };

  return <section className="panel">
    <form onSubmit={submit} className="form-grid">
      <label className="form-field">Título<Input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus /></label>
      <label className="form-field">Descrição (opcional)<Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} /></label>
      <label className="form-field">Prazo para propostas<Input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} required /></label>
      {needsCompany && <label className="form-field">Empresa<NativeSelect value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="field-control" required><NativeSelectOption value="">Seleccione…</NativeSelectOption>{companyOptions.map((company) => <NativeSelectOption key={company.id} value={company.id}>{company.name}</NativeSelectOption>)}</NativeSelect></label>}
      <div className="form-field"><span>Fornecedores a convidar</span><div className="checkbox-list">{suppliersList.map((supplier) => <label key={supplier.id}><input type="checkbox" checked={supplierIds.includes(supplier.id)} onChange={() => toggleSupplier(supplier.id)} /> {supplier.name}</label>)}</div></div>
      <div className="header-actions"><Button type="submit" className="btn-burgundy" disabled={saving}>{saving ? "A abrir…" : "Abrir tender"} <ArrowRight /></Button><Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button></div>
    </form>
  </section>;
}

type ContractStatus = "activo" | "terminado";
type ContractRow = {
  id: string;
  title: string;
  supplier: string;
  supplierId: number | null;
  companyId: number;
  requestId: string | null;
  value: number;
  startDate: string;
  endDate: string;
  notes: string;
  status: ContractStatus;
  createdAt: string;
};

// "A expirar"/"Expirado" nunca vêm da base de dados — são sempre
// calculados a partir de endDate a cada render, para nunca ficarem
// desactualizados (mesmo princípio da linha temporal da PO: derivado, não
// fabricado). Só "Activo"/"Terminado" reflectem o que foi gravado.
function contractDisplay(contract: ContractRow): { label: string; className: string } {
  if (contract.status === "terminado") return { label: "Terminado", className: "status status-slate" };
  const daysLeft = (new Date(contract.endDate).getTime() - Date.now()) / 86_400_000;
  if (daysLeft < 0) return { label: "Expirado", className: "status status-red" };
  if (daysLeft < 30) return { label: "A expirar", className: "status status-amber" };
  return { label: "Activo", className: "status status-green" };
}

// Contratos/Call-off — acordos com validade e tecto de valor, distintos
// de uma PO pontual. Mesma limitação de âmbito de criação que Tenders:
// company_admin (empresa da sessão) e system_admin (escolhe a empresa);
// analyst/coe_manager já gerem contratos existentes, sem selector de
// empresa no ecrã ainda para abrir um novo.
function Contracts({
  user,
  suppliersList,
  onUploadDocument,
  onDownloadDocument,
}: {
  user: AuthUser;
  suppliersList: Supplier[];
  onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>;
  onDownloadDocument: (doc: DocumentItem) => void;
}) {
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<ContractRow | null>(null);
  const [busy, setBusy] = useState(false);

  const isSupplier = user.accessLevel === "supplier";
  const canCreate = user.accessLevel === "company_admin" || user.accessLevel === "system_admin";
  const canManage = !isSupplier;

  const loadRows = async () => {
    try {
      const { contracts: list } = await api<{ contracts: ContractRow[] }>("/api/contracts");
      setRows(list);
    } catch {
      toast.error("Não foi possível carregar os contratos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const terminate = async (id: string) => {
    setBusy(true);
    try {
      const { contract } = await api<{ contract: ContractRow }>(`/api/contracts/${id}`, { method: "PATCH", body: JSON.stringify({ action: "terminate" }) });
      setRows((current) => current.map((row) => (row.id === id ? contract : row)));
      setSelected(contract);
      toast.success("Contrato terminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível terminar o contrato");
    } finally {
      setBusy(false);
    }
  };

  return <><PageHeader kicker="SOURCING" title="Contratos" description="Acordos com fornecedores, validade e tecto de valor — distintos de uma PO pontual." action={canCreate ? <Button className="btn-burgundy" onClick={() => setFormOpen((open) => !open)}><Plus /> Novo contrato</Button> : undefined} />
    {formOpen && <CreateContractForm user={user} suppliersList={suppliersList} onCreated={(contract) => { setRows((current) => [contract, ...current]); setFormOpen(false); }} onCancel={() => setFormOpen(false)} />}
    <section className="panel"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Contrato</TableHead><TableHead>Título</TableHead><TableHead>Fornecedor</TableHead><TableHead>Validade</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Acção</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => { const display = contractDisplay(row); return <TableRow key={row.id}><TableCell><button className="request-link" onClick={() => setSelected(row)}><strong>{row.id}</strong></button></TableCell><TableCell>{row.title}</TableCell><TableCell>{row.supplier}</TableCell><TableCell>{new Date(row.startDate).toLocaleDateString("pt-PT")} — {new Date(row.endDate).toLocaleDateString("pt-PT")}</TableCell><TableCell><span className={display.className}>{display.label}</span></TableCell><TableCell className="text-right"><Button size="icon-sm" variant="ghost" onClick={() => setSelected(row)} aria-label={`Abrir ${row.id}`}><Eye /></Button></TableCell></TableRow>; })}</TableBody></Table>{!loading && rows.length === 0 && <div className="empty-state"><BriefcaseBusiness /><h3>Sem contratos ainda</h3><p>{isSupplier ? "Ainda sem contratos associados à sua empresa." : "Registe o primeiro contrato com um fornecedor."}</p></div>}</div></section>
    <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
      <SheetContent className="request-sheet sm:max-w-xl">
        {selected && <div className="request-detail">
          <SheetHeader><SheetTitle>{selected.title}</SheetTitle><SheetDescription>{selected.id} — {selected.supplier}</SheetDescription></SheetHeader>
          <span className={contractDisplay(selected).className}>{contractDisplay(selected).label}</span>
          <div><p className="muted">Validade</p><p>{new Date(selected.startDate).toLocaleDateString("pt-PT")} — {new Date(selected.endDate).toLocaleDateString("pt-PT")}</p></div>
          <div><p className="muted">Valor do contrato</p><p><strong>{money(selected.value)}</strong></p></div>
          {selected.notes && <div><p className="muted">Notas</p><p>{selected.notes}</p></div>}
          <EntityDocuments entityType="contract" entityId={selected.id} title="Documentos do contrato" onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} />
          {canManage && selected.status === "activo" && <Button variant="outline" disabled={busy} onClick={() => terminate(selected.id)}>Terminar contrato</Button>}
        </div>}
      </SheetContent>
    </Sheet>
  </>;
}

function CreateContractForm({
  user,
  suppliersList,
  onCreated,
  onCancel,
}: {
  user: AuthUser;
  suppliersList: Supplier[];
  onCreated: (contract: ContractRow) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [value, setValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [saving, setSaving] = useState(false);

  const needsCompany = user.accessLevel === "system_admin";

  useEffect(() => {
    if (!needsCompany) return;
    (async () => {
      try {
        const { companies } = await api<{ companies: CompanyOption[] }>("/api/admin/companies");
        setCompanyOptions(companies);
      } catch {
        toast.error("Não foi possível carregar as empresas");
      }
    })();
  }, [needsCompany]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { contract } = await api<{ contract: ContractRow }>("/api/contracts", {
        method: "POST",
        body: JSON.stringify({
          title,
          supplierId: Number(supplierId),
          value: Number(value),
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          notes: notes || undefined,
          companyId: needsCompany && companyId ? Number(companyId) : undefined,
        }),
      });
      toast.success(`${contract.id} registado`);
      onCreated(contract);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registar o contrato");
    } finally {
      setSaving(false);
    }
  };

  return <section className="panel">
    <form onSubmit={submit} className="form-grid">
      <label className="form-field">Título<Input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus /></label>
      <label className="form-field">Fornecedor<NativeSelect value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="field-control" required><NativeSelectOption value="">Seleccione…</NativeSelectOption>{suppliersList.map((supplier) => <NativeSelectOption key={supplier.id} value={supplier.id}>{supplier.name}</NativeSelectOption>)}</NativeSelect></label>
      <label className="form-field">Valor do contrato (AOA)<Input type="number" min={0} value={value} onChange={(event) => setValue(event.target.value)} required /></label>
      {needsCompany && <label className="form-field">Empresa<NativeSelect value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="field-control" required><NativeSelectOption value="">Seleccione…</NativeSelectOption>{companyOptions.map((company) => <NativeSelectOption key={company.id} value={company.id}>{company.name}</NativeSelectOption>)}</NativeSelect></label>}
      <label className="form-field">Início<Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label>
      <label className="form-field">Fim<Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label>
      <label className="form-field span-2">Notas (opcional)<Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} /></label>
      <div className="header-actions"><Button type="submit" className="btn-burgundy" disabled={saving}>{saving ? "A registar…" : "Registar contrato"} <ArrowRight /></Button><Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button></div>
    </form>
  </section>;
}

type CatalogItemRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  supplier: string;
  supplierId: number;
  unitPrice: number;
  unit: string;
  active: boolean;
  createdAt: string;
};

// Catálogo de fornecedores — itens com preço pré-negociado para alimentar
// o tipo de transacção "PO catalogado" (tier automático) com dados reais
// em vez de um valor livre digitado no wizard. Curado só por
// analyst/coe_manager/system_admin (a Muntu negoceia os preços); qualquer
// outra pessoa navega em modo só de leitura, só itens activos.
function Catalog({ user, suppliersList }: { user: AuthUser; suppliersList: Supplier[] }) {
  const [rows, setRows] = useState<CatalogItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const isCurator = user.accessLevel === "analyst" || user.accessLevel === "coe_manager" || user.accessLevel === "system_admin";
  const isSupplier = user.accessLevel === "supplier";

  const loadRows = async () => {
    try {
      const { items } = await api<{ items: CatalogItemRow[] }>("/api/catalog");
      setRows(items);
    } catch {
      toast.error("Não foi possível carregar o catálogo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const toggleActive = async (item: CatalogItemRow) => {
    setSavingId(item.id);
    try {
      const { item: updated } = await api<{ item: CatalogItemRow }>(`/api/catalog/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active }),
      });
      setRows((current) => current.map((row) => (row.id === item.id ? updated : row)));
    } catch {
      toast.error("Não foi possível actualizar o item");
    } finally {
      setSavingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return rows.filter((row) => [row.name, row.category, row.supplier].some((field) => field.toLowerCase().includes(q)));
  }, [rows, query]);

  return <><PageHeader kicker="SOURCING" title="Catálogo" description="Itens de fornecedores com preço pré-negociado, para pedidos do tipo &quot;PO catalogado&quot;." action={isCurator ? <Button className="btn-burgundy" onClick={() => setFormOpen((open) => !open)}><Plus /> Novo item</Button> : undefined} />
    {formOpen && <CreateCatalogItemForm suppliersList={suppliersList} onCreated={(item) => { setRows((current) => [item, ...current]); setFormOpen(false); }} onCancel={() => setFormOpen(false)} />}
    <div className="catalog-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar por nome, categoria ou fornecedor…" /></div>
    <section className="panel"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Categoria</TableHead><TableHead>Fornecedor</TableHead><TableHead>Preço unitário</TableHead>{(isCurator || isSupplier) && <TableHead>Estado</TableHead>}{isCurator && <TableHead className="text-right">Acção</TableHead>}</TableRow></TableHeader><TableBody>{filtered.map((row) => <TableRow key={row.id}><TableCell><strong>{row.name}</strong>{row.description && <div className="muted">{row.description}</div>}</TableCell><TableCell>{row.category || "—"}</TableCell><TableCell>{row.supplier}</TableCell><TableCell>{money(row.unitPrice)} / {row.unit}</TableCell>{(isCurator || isSupplier) && <TableCell><span className={row.active ? "status status-green" : "status status-slate"}>{row.active ? "Activo" : "Inactivo"}</span></TableCell>}{isCurator && <TableCell className="text-right"><Button size="sm" variant="outline" disabled={savingId === row.id} onClick={() => toggleActive(row)}>{row.active ? "Desactivar" : "Reactivar"}</Button></TableCell>}</TableRow>)}</TableBody></Table>{!loading && filtered.length === 0 && <div className="empty-state"><Package /><h3>Sem itens no catálogo</h3><p>{isCurator ? "Registe o primeiro item para começar a alimentar o catálogo." : "Ainda não há itens de catálogo disponíveis."}</p></div>}</div></section>
  </>;
}

function CreateCatalogItemForm({
  suppliersList,
  onCreated,
  onCancel,
}: {
  suppliersList: Supplier[];
  onCreated: (item: CatalogItemRow) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [unit, setUnit] = useState("un");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { item } = await api<{ item: CatalogItemRow }>("/api/catalog", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: description || undefined,
          category: category || undefined,
          supplierId: Number(supplierId),
          unitPrice: Number(unitPrice),
          unit: unit || undefined,
        }),
      });
      toast.success(`${item.name} adicionado ao catálogo`);
      onCreated(item);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar o item");
    } finally {
      setSaving(false);
    }
  };

  return <section className="panel">
    <form onSubmit={submit} className="form-grid">
      <label className="form-field">Nome<Input value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></label>
      <label className="form-field">Categoria (opcional)<Input value={category} onChange={(event) => setCategory(event.target.value)} /></label>
      <label className="form-field">Fornecedor<NativeSelect value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="field-control" required><NativeSelectOption value="">Seleccione…</NativeSelectOption>{suppliersList.map((supplier) => <NativeSelectOption key={supplier.id} value={supplier.id}>{supplier.name}</NativeSelectOption>)}</NativeSelect></label>
      <label className="form-field">Preço unitário (AOA)<Input type="number" min={0} value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} required /></label>
      <label className="form-field">Unidade<Input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="un" /></label>
      <label className="form-field span-2">Descrição (opcional)<Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} /></label>
      <div className="header-actions"><Button type="submit" className="btn-burgundy" disabled={saving}>{saving ? "A adicionar…" : "Adicionar ao catálogo"} <ArrowRight /></Button><Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button></div>
    </form>
  </section>;
}

type CompanyRow = {
  id: number;
  name: string;
  domain: string;
  authMethod: string;
  retainerAmount: number;
  ssoIssuerUrl: string | null;
  ssoClientId: string | null;
  hasSsoClientSecret: boolean;
  iban: string | null;
  bic: string | null;
  taxId: string | null;
};
type BillingRateRow = { key: string; label: string; amount: number; updatedAt: string };
type ClientInvoiceRow = {
  id: string;
  companyId: number;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  scope: "parcial" | "total";
  status: "pendente_aprovacao" | "aprovada" | "rejeitada" | "enviada_contabilidade";
  generatedBy: "automatico" | "manual";
  retainerAmount: number;
  poAmount: number;
  invoiceAmount: number;
  totalAmount: number;
};

const CLIENT_INVOICE_STATUS_LABELS: Record<ClientInvoiceRow["status"], string> = {
  pendente_aprovacao: "Pendente de aprovação",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  enviada_contabilidade: "Enviada à contabilidade",
};

function clientInvoiceStatusClass(status: ClientInvoiceRow["status"]) {
  if (status === "enviada_contabilidade" || status === "aprovada") return "status status-green";
  if (status === "rejeitada") return "status status-red";
  return "status status-amber";
}

function ClientBilling() {
  const [companiesList, setCompaniesList] = useState<CompanyRow[]>([]);
  const [rows, setRows] = useState<ClientInvoiceRow[]>([]);
  const [rates, setRates] = useState<BillingRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [savingRateKey, setSavingRateKey] = useState<string | null>(null);
  const [savingCompanyId, setSavingCompanyId] = useState<number | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ companyId: "", periodStart: today, periodEnd: today, scope: "total" as "parcial" | "total" });

  const load = async () => {
    try {
      const [companiesResponse, billingResponse, ratesResponse] = await Promise.all([
        api<{ companies: CompanyRow[] }>("/api/admin/companies"),
        api<{ clientInvoices: ClientInvoiceRow[] }>("/api/admin/billing"),
        api<{ billingRates: BillingRateRow[] }>("/api/admin/billing-rates"),
      ]);
      setCompaniesList(companiesResponse.companies);
      setRows(billingResponse.clientInvoices);
      setRates(ratesResponse.billingRates);
      setForm((current) => ({ ...current, companyId: current.companyId || String(companiesResponse.companies[0]?.id ?? "") }));
    } catch {
      toast.error("Não foi possível carregar a facturação");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveRate = async (key: string, amount: number) => {
    if (!Number.isFinite(amount) || amount < 0) { toast.error("Valor inválido"); return; }
    setSavingRateKey(key);
    try {
      const { billingRate } = await api<{ billingRate: BillingRateRow }>(`/api/admin/billing-rates/${key}`, {
        method: "PATCH",
        body: JSON.stringify({ amount }),
      });
      setRates((current) => current.map((rate) => (rate.key === key ? billingRate : rate)));
      toast.success(`${billingRate.label}: ${money(billingRate.amount)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar a tarifa");
    } finally {
      setSavingRateKey(null);
    }
  };

  const saveRetainer = async (companyId: number, retainerAmount: number) => {
    if (!Number.isFinite(retainerAmount) || retainerAmount < 0) { toast.error("Valor inválido"); return; }
    setSavingCompanyId(companyId);
    try {
      const { company } = await api<{ company: CompanyRow }>(`/api/admin/companies/${companyId}`, {
        method: "PATCH",
        body: JSON.stringify({ retainerAmount }),
      });
      setCompaniesList((current) => current.map((row) => (row.id === companyId ? company : row)));
      toast.success(`Retainer de ${company.name}: ${money(company.retainerAmount)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar o retainer");
    } finally {
      setSavingCompanyId(null);
    }
  };

  const saveTaxId = async (companyId: number, taxId: string) => {
    setSavingCompanyId(companyId);
    try {
      const { company } = await api<{ company: CompanyRow }>(`/api/admin/companies/${companyId}`, {
        method: "PATCH",
        body: JSON.stringify({ taxId }),
      });
      setCompaniesList((current) => current.map((row) => (row.id === companyId ? company : row)));
      toast.success(`NIF de ${company.name} actualizado`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar o NIF");
    } finally {
      setSavingCompanyId(null);
    }
  };

  const [saftPeriod, setSaftPeriod] = useState({ periodStart: today, periodEnd: today });
  const [exportingSaft, setExportingSaft] = useState(false);

  const exportSaft = async (event: React.FormEvent) => {
    event.preventDefault();
    setExportingSaft(true);
    try {
      const response = await fetch(`/api/admin/billing/export/saft?periodStart=${saftPeriod.periodStart}&periodEnd=${saftPeriod.periodEnd}`);
      if (response.status === 401) window.dispatchEvent(new CustomEvent("muntu:unauthorized"));
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Não foi possível gerar o ficheiro");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `saft-agt-${saftPeriod.periodStart}-${saftPeriod.periodEnd}.xml`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Ficheiro SAF-T gerado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o ficheiro");
    } finally {
      setExportingSaft(false);
    }
  };

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.companyId) { toast.error("Escolha uma empresa"); return; }
    setGenerating(true);
    try {
      const { clientInvoice } = await api<{ clientInvoice: ClientInvoiceRow }>("/api/admin/billing", {
        method: "POST",
        body: JSON.stringify({ companyId: Number(form.companyId), periodStart: form.periodStart, periodEnd: form.periodEnd, scope: form.scope }),
      });
      setRows((current) => [clientInvoice, ...current]);
      toast.success(`${clientInvoice.id} gerada — ${money(clientInvoice.totalAmount)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar a factura");
    } finally {
      setGenerating(false);
    }
  };

  const act = async (id: string, action: "approve" | "reject" | "send_to_accounting") => {
    setActingId(id);
    try {
      const { clientInvoice } = await api<{ clientInvoice: ClientInvoiceRow }>(`/api/admin/billing/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      setRows((current) => current.map((row) => (row.id === id ? { ...row, status: clientInvoice.status } : row)));
      toast.success(`${id}: ${CLIENT_INVOICE_STATUS_LABELS[clientInvoice.status as ClientInvoiceRow["status"]]}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar a factura");
    } finally {
      setActingId(null);
    }
  };

  return <><PageHeader kicker="COBRANÇA DE ACTIVIDADE" title="Facturação" description="Retainer + POs + facturas do período, por empresa. Geração mensal automática ou sob pedido — sempre validada pelo System Admin antes de seguir para a contabilidade." />
    <section className="panel">
      <form onSubmit={generate} className="form-grid">
        <label className="form-field">Empresa<NativeSelect value={form.companyId} onChange={(event) => setForm((current) => ({ ...current, companyId: event.target.value }))} className="field-control">{companiesList.map((company) => <NativeSelectOption key={company.id} value={company.id}>{company.name}</NativeSelectOption>)}</NativeSelect></label>
        <label className="form-field">Início do período<Input type="date" value={form.periodStart} onChange={(event) => setForm((current) => ({ ...current, periodStart: event.target.value }))} /></label>
        <label className="form-field">Fim do período<Input type="date" value={form.periodEnd} onChange={(event) => setForm((current) => ({ ...current, periodEnd: event.target.value }))} /></label>
        <label className="form-field">Âmbito<NativeSelect value={form.scope} onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value as "parcial" | "total" }))} className="field-control"><NativeSelectOption value="total">Total</NativeSelectOption><NativeSelectOption value="parcial">Parcial</NativeSelectOption></NativeSelect></label>
        <Button type="submit" className="btn-burgundy" disabled={generating}>{generating ? "A gerar…" : "Gerar factura"} <ArrowRight /></Button>
      </form>
    </section>
    <section className="panel">
      <div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Factura</TableHead><TableHead>Empresa</TableHead><TableHead>Período</TableHead><TableHead>Origem</TableHead><TableHead>Total</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><strong>{row.id}</strong></TableCell><TableCell>{row.companyName}</TableCell><TableCell>{row.periodStart} a {row.periodEnd}</TableCell><TableCell>{row.generatedBy === "automatico" ? "Automática" : "Manual"} • {row.scope === "total" ? "Total" : "Parcial"}</TableCell><TableCell>{money(row.totalAmount)}</TableCell><TableCell><span className={clientInvoiceStatusClass(row.status)}>{CLIENT_INVOICE_STATUS_LABELS[row.status]}</span></TableCell><TableCell className="text-right">{row.status === "pendente_aprovacao" && <><Button size="icon-sm" variant="ghost" disabled={actingId === row.id} onClick={() => act(row.id, "approve")} aria-label={`Aprovar ${row.id}`}><Check /></Button><Button size="icon-sm" variant="ghost" disabled={actingId === row.id} onClick={() => act(row.id, "reject")} aria-label={`Rejeitar ${row.id}`}><XCircle /></Button></>}{row.status === "aprovada" && <Button size="sm" variant="outline" disabled={actingId === row.id} onClick={() => act(row.id, "send_to_accounting")}>Enviar à contabilidade</Button>}</TableCell></TableRow>)}</TableBody></Table>{!loading && rows.length === 0 && <div className="empty-state"><Landmark /><h3>Sem facturas geradas</h3><p>Use o formulário acima para gerar a primeira.</p></div>}</div>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><p>CONFIGURAÇÃO</p><h2>Tarifas por unidade</h2></div></div>
      <div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Tarifa</TableHead><TableHead>Valor (AOA)</TableHead><TableHead>Actualizada</TableHead></TableRow></TableHeader><TableBody>{rates.map((rate) => <TableRow key={rate.key}><TableCell><strong>{rate.label}</strong></TableCell><TableCell><Input type="number" min={0} step={1} defaultValue={rate.amount} disabled={savingRateKey === rate.key} onBlur={(event) => { const value = Number(event.target.value); if (value !== rate.amount) saveRate(rate.key, value); }} className="rate-input" /></TableCell><TableCell>{new Date(rate.updatedAt).toLocaleDateString("pt-PT")}</TableCell></TableRow>)}</TableBody></Table>{!loading && rates.length === 0 && <div className="empty-state"><Landmark /><h3>Sem tarifas semeadas</h3><p>A facturação usa os valores por omissão do Estudo de Viabilidade até semear <code>billing_rates</code>.</p></div>}</div>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><p>CONFIGURAÇÃO</p><h2>Retainer e NIF por empresa</h2></div></div>
      <div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Domínio</TableHead><TableHead>Retainer mensal (AOA)</TableHead><TableHead>NIF (exportação SAF-T)</TableHead></TableRow></TableHeader><TableBody>{companiesList.map((company) => <TableRow key={company.id}><TableCell><strong>{company.name}</strong></TableCell><TableCell>{company.domain}</TableCell><TableCell><Input type="number" min={0} step={1} defaultValue={company.retainerAmount} disabled={savingCompanyId === company.id} onBlur={(event) => { const value = Number(event.target.value); if (value !== company.retainerAmount) saveRetainer(company.id, value); }} className="rate-input" /></TableCell><TableCell><Input defaultValue={company.taxId ?? ""} placeholder="Não definido" disabled={savingCompanyId === company.id} onBlur={(event) => { const value = event.target.value.trim(); if (value !== (company.taxId ?? "")) saveTaxId(company.id, value); }} className="rate-input" /></TableCell></TableRow>)}</TableBody></Table>{!loading && companiesList.length === 0 && <div className="empty-state"><Landmark /><h3>Sem empresas registadas</h3></div>}</div>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><p>FISCALIDADE</p><h2>Exportação AGT/SAF-T</h2></div></div>
      <p className="muted">Gera um ficheiro SAF-T (Header + Clientes + Facturas de venda) com as facturas de cliente aprovadas no período — todas as empresas facturadas precisam de ter NIF definido acima.</p>
      <form onSubmit={exportSaft} className="form-grid">
        <label className="form-field">Início do período<Input type="date" value={saftPeriod.periodStart} onChange={(event) => setSaftPeriod((current) => ({ ...current, periodStart: event.target.value }))} /></label>
        <label className="form-field">Fim do período<Input type="date" value={saftPeriod.periodEnd} onChange={(event) => setSaftPeriod((current) => ({ ...current, periodEnd: event.target.value }))} /></label>
        <div className="header-actions"><Button type="submit" variant="outline" disabled={exportingSaft}><Download /> {exportingSaft ? "A gerar…" : "Exportar SAF-T"}</Button></div>
      </form>
    </section>
  </>;
}

type SupportTicketRow = {
  id: string;
  subject: string;
  category: string;
  priority: "baixa" | "normal" | "alta" | "urgente";
  status: "aberto" | "em_curso" | "resolvido" | "fechado";
  userId: number;
  companyId: number | null;
  assignedToUserId: number | null;
  slaDueAt: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  authorName?: string;
};
type SupportMessageRow = { id: number; ticketId: string; body: string; createdAt: string; authorUserId: number; authorName: string | null };

const SUPPORT_STATUS_LABELS: Record<SupportTicketRow["status"], string> = { aberto: "Aberto", em_curso: "Em curso", resolvido: "Resolvido", fechado: "Fechado" };
function supportStatusClass(status: SupportTicketRow["status"]) {
  if (status === "resolvido" || status === "fechado") return "status status-green";
  if (status === "aberto") return "status status-amber";
  return "status status-slate";
}
const SUPPORT_PRIORITY_LABELS: Record<SupportTicketRow["priority"], string> = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" };
function supportPriorityClass(priority: SupportTicketRow["priority"]) {
  if (priority === "urgente") return "status status-red";
  if (priority === "alta") return "status status-amber";
  return "status status-slate";
}
function isTicketOverdue(ticket: SupportTicketRow) {
  return (ticket.status === "aberto" || ticket.status === "em_curso") && new Date(ticket.slaDueAt).getTime() < Date.now();
}
function formatSupportDate(value: string) {
  return new Date(value).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Avaliação e homologação de candidaturas (Candidatura -> Documentos ->
// Avaliação -> Aprovada/Rejeitada -> Homologação -> Acesso Muntu) — só
// coe_manager/system_admin veem esta vista (ver VIEW_ROLES). A candidatura
// em si é submetida sem sessão nenhuma — ver CandidaturaScreen.
function Applications({
  applications,
  onApplicationUpdated,
  onUploadDocument,
  onDownloadDocument,
}: {
  applications: ApplicationItem[];
  onApplicationUpdated: (application: ApplicationItem) => void;
  onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>;
  onDownloadDocument: (doc: DocumentItem) => void;
}) {
  const [selected, setSelected] = useState<ApplicationItem | null>(null);
  const [reviewers, setReviewers] = useState<Approver[]>([]);
  const pending = applications.filter((item) => item.status === "recebida" || item.status === "em_avaliacao").length;
  const approved = applications.filter((item) => item.status === "aprovada").length;
  const homologated = applications.filter((item) => item.status === "homologada").length;

  useEffect(() => {
    (async () => {
      try {
        const { approvers } = await api<{ approvers: Approver[] }>("/api/approvers");
        setReviewers(approvers.filter((item) => item.accessLevel === "coe_manager" || item.accessLevel === "system_admin"));
      } catch {
        // silencioso — a atribuição fica só sem opções, o resto da página continua a funcionar
      }
    })();
  }, []);

  const reviewerName = (userId: number | null) => (userId == null ? "—" : (reviewers.find((r) => r.id === userId)?.name ?? "—"));

  return <>
    <PageHeader kicker="HOMOLOGAÇÃO" title="Candidaturas" description="Avaliação e homologação de empresas e fornecedores — o primeiro contacto real com a plataforma." />
    <section className="supplier-summary">
      <article><Inbox /><div><strong>{applications.length}</strong><span>Candidaturas recebidas</span></div></article>
      <article><ClipboardCheck /><div><strong>{pending}</strong><span>Por avaliar</span></div></article>
      <article><CheckCircle2 /><div><strong>{approved}</strong><span>Aprovadas, por homologar</span></div></article>
      <article><ShieldCheck /><div><strong>{homologated}</strong><span>Homologadas</span></div></article>
    </section>
    <section className="panel">
      {applications.length === 0 ? <div className="empty-state"><Inbox /><h3>Sem candidaturas</h3><p>Ainda não chegou nenhuma candidatura de empresa ou fornecedor.</p></div> : <div className="responsive-table"><Table>
        <TableHeader><TableRow><TableHead>Candidatura</TableHead><TableHead>Tipo</TableHead><TableHead>Contacto</TableHead><TableHead>Estado</TableHead><TableHead>Atribuída</TableHead><TableHead>Recebida</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{applications.map((application) => <TableRow key={application.id}>
          <TableCell><strong>{application.companyName}</strong><br /><small className="muted">{application.id}</small></TableCell>
          <TableCell>{application.kind === "empresa" ? "Empresa" : "Fornecedor"}</TableCell>
          <TableCell>{application.contactName}<br /><small className="muted">{application.contactEmail}</small></TableCell>
          <TableCell><span className={applicationStatusPill(application.status)}>{APPLICATION_STATUS_LABEL[application.status]}</span></TableCell>
          <TableCell>{reviewerName(application.assignedToUserId)}</TableCell>
          <TableCell>{new Date(application.createdAt).toLocaleDateString("pt-PT")}</TableCell>
          <TableCell><Button size="icon-sm" variant="ghost" onClick={() => setSelected(application)} aria-label={`Ver candidatura ${application.id}`}><Eye /></Button></TableCell>
        </TableRow>)}</TableBody>
      </Table></div>}
    </section>
    <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
      <SheetContent className="request-sheet sm:max-w-xl">
        {selected && <ApplicationReviewSheet
          application={selected}
          reviewers={reviewers}
          onUpdated={(updated) => { onApplicationUpdated(updated); setSelected(updated); }}
          onUploadDocument={onUploadDocument}
          onDownloadDocument={onDownloadDocument}
        />}
      </SheetContent>
    </Sheet>
  </>;
}

function ApplicationReviewSheet({
  application,
  reviewers,
  onUpdated,
  onUploadDocument,
  onDownloadDocument,
}: {
  application: ApplicationItem;
  reviewers: Approver[];
  onUpdated: (application: ApplicationItem) => void;
  onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>;
  onDownloadDocument: (doc: DocumentItem) => void;
}) {
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const assign = async (assignedToUserId: number | null) => {
    setAssigning(true);
    try {
      const { application: updated } = await api<{ application: ApplicationItem }>(`/api/applications/${application.id}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedToUserId }),
      });
      onUpdated(updated);
      toast.success(assignedToUserId ? "Candidatura atribuída" : "Atribuição removida");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atribuir a candidatura");
    } finally {
      setAssigning(false);
    }
  };

  const review = async (status: "em_avaliacao" | "aprovada" | "rejeitada") => {
    if (status === "rejeitada" && !rejectionReason.trim()) {
      toast.error("Indique o motivo da rejeição");
      return;
    }
    setBusy(true);
    try {
      const { application: updated } = await api<{ application: ApplicationItem }>(`/api/applications/${application.id}`, {
        method: "PATCH",
        body: JSON.stringify(status === "rejeitada" ? { status, rejectionReason } : { status }),
      });
      onUpdated(updated);
      toast.success(status === "aprovada" ? "Candidatura aprovada" : status === "rejeitada" ? "Candidatura rejeitada" : "Candidatura em avaliação");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar a candidatura");
    } finally {
      setBusy(false);
    }
  };

  const homologate = async () => {
    setBusy(true);
    try {
      const { application: updated } = await api<{ application: ApplicationItem }>(`/api/applications/${application.id}/homologate`, { method: "POST" });
      onUpdated(updated);
      toast.success(`${updated.companyName} homologada — acesso criado, e-mail de boas-vindas enviado`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível homologar a candidatura");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <SheetHeader><p className="kicker">CANDIDATURA {application.id}</p><SheetTitle>{application.companyName}</SheetTitle><SheetDescription>{application.kind === "empresa" ? "Empresa cliente (Operadora)" : "Fornecedor (Prestadora)"}</SheetDescription></SheetHeader>
    <div className="sheet-body">
      <div className="sheet-status"><span className={applicationStatusPill(application.status)}>{APPLICATION_STATUS_LABEL[application.status]}</span></div>
      <label>Responsável<NativeSelect value={application.assignedToUserId ?? ""} disabled={assigning} onChange={(event) => assign(event.target.value ? Number(event.target.value) : null)} className="field-control">
        <NativeSelectOption value="">Por atribuir</NativeSelectOption>
        {reviewers.map((reviewer) => <NativeSelectOption key={reviewer.id} value={reviewer.id}>{reviewer.name}</NativeSelectOption>)}
      </NativeSelect></label>
      <div className="candidatura-detail-grid">
        <div><small>NIF</small><strong>{application.taxId}</strong></div>
        <div><small>Sector</small><strong>{application.sector || "—"}</strong></div>
        <div><small>Contacto</small><strong>{application.contactName}</strong></div>
        <div><small>E-mail</small><strong>{application.contactEmail}</strong></div>
        <div><small>Telefone</small><strong>{application.contactPhone || "—"}</strong></div>
      </div>
      {application.notes && <p className="muted">{application.notes}</p>}
      {application.status === "rejeitada" && application.rejectionReason && <p className="muted">Motivo da rejeição: {application.rejectionReason}</p>}
      {application.status === "em_avaliacao" && <label>Motivo (necessário para rejeitar)<Textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={2} /></label>}
      <EntityDocuments entityType="application" entityId={application.id} onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} />
    </div>
    <div className="sheet-actions">
      {application.status === "recebida" && <Button className="btn-burgundy" disabled={busy} onClick={() => review("em_avaliacao")}>Iniciar avaliação</Button>}
      {application.status === "em_avaliacao" && <>
        <Button variant="outline" className="reject-button" disabled={busy} onClick={() => review("rejeitada")}><XCircle /> Rejeitar</Button>
        <Button className="btn-green" disabled={busy} onClick={() => review("aprovada")}><Check /> Aprovar</Button>
      </>}
      {application.status === "aprovada" && <Button className="btn-burgundy" disabled={busy} onClick={homologate}><ShieldCheck /> Homologar e criar acesso</Button>}
    </div>
  </>;
}

function Support({ user }: { user: AuthUser }) {
  return user.accessLevel === "system_admin" ? <SupportInbox /> : <MyTickets />;
}

function NewTicketForm({ onCreated }: { onCreated: (ticket: SupportTicketRow) => void }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>(SUPPORT_CATEGORIES[0]);
  const [priority, setPriority] = useState<SupportTicketRow["priority"]>("normal");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { ticket } = await api<{ ticket: SupportTicketRow }>("/api/support", {
        method: "POST",
        body: JSON.stringify({ subject, category, priority, message }),
      });
      onCreated(ticket);
      setSubject("");
      setMessage("");
      setCategory(SUPPORT_CATEGORIES[0]);
      setPriority("normal");
      setOpen(false);
      toast.success(`${ticket.id} aberto`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o pedido de suporte");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return <Button className="btn-burgundy" onClick={() => setOpen(true)}><Plus /> Novo pedido de suporte</Button>;

  return <section className="panel">
    <form onSubmit={submit} className="form-grid">
      <label className="form-field span-2">Assunto<Input value={subject} onChange={(event) => setSubject(event.target.value)} required autoFocus /></label>
      <label className="form-field">Categoria<NativeSelect value={category} onChange={(event) => setCategory(event.target.value)} className="field-control">{SUPPORT_CATEGORIES.map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></label>
      <label className="form-field">Prioridade<NativeSelect value={priority} onChange={(event) => setPriority(event.target.value as SupportTicketRow["priority"])} className="field-control">{SUPPORT_PRIORITIES.map((item) => <NativeSelectOption key={item} value={item}>{SUPPORT_PRIORITY_LABELS[item]}</NativeSelectOption>)}</NativeSelect></label>
      <label className="form-field span-2">Mensagem<Textarea value={message} onChange={(event) => setMessage(event.target.value)} required rows={4} /></label>
      <div className="header-actions"><Button type="submit" className="btn-burgundy" disabled={saving}>{saving ? "A enviar…" : "Enviar pedido"} <ArrowRight /></Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button></div>
    </form>
  </section>;
}

function SupportThread({ ticketId, isAdmin, onTicketUpdated }: { ticketId: string; isAdmin: boolean; onTicketUpdated?: (ticket: SupportTicketRow) => void }) {
  const [ticket, setTicket] = useState<SupportTicketRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<{ ticket: SupportTicketRow; messages: SupportMessageRow[] }>(`/api/support/${ticketId}`);
      setTicket(data.ticket);
      setMessages(data.messages);
    } catch {
      toast.error("Não foi possível carregar o pedido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [ticketId]);

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api(`/api/support/${ticketId}/messages`, { method: "POST", body: JSON.stringify({ body: reply }) });
      setReply("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a resposta");
    } finally {
      setSending(false);
    }
  };

  const updateTicket = async (fields: Partial<Pick<SupportTicketRow, "status" | "priority" | "category">>) => {
    try {
      const { ticket: updated } = await api<{ ticket: SupportTicketRow }>(`/api/support/${ticketId}`, { method: "PATCH", body: JSON.stringify(fields) });
      setTicket(updated);
      onTicketUpdated?.(updated);
      toast.success(`${ticketId} actualizado`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar o pedido");
    }
  };

  if (loading || !ticket) return <div className="sheet-body"><p className="muted">A carregar…</p></div>;

  return <>
    <SheetHeader><p className="kicker">PEDIDO DE SUPORTE</p><SheetTitle>{ticket.id}</SheetTitle><SheetDescription>{ticket.subject}</SheetDescription></SheetHeader>
    <div className="sheet-body">
      <div className="sheet-status">
        <span className={supportStatusClass(ticket.status)}>{SUPPORT_STATUS_LABELS[ticket.status]}</span>
        <span className={isTicketOverdue(ticket) ? "text-danger" : ""}><Clock3 /> {isTicketOverdue(ticket) ? "SLA vencido" : `SLA até ${formatSupportDate(ticket.slaDueAt)}`}</span>
      </div>
      {isAdmin && <div className="admin-fields">
        <label>Estado<NativeSelect value={ticket.status} onChange={(event) => updateTicket({ status: event.target.value as SupportTicketRow["status"] })} className="field-control">{SUPPORT_STATUSES.map((item) => <NativeSelectOption key={item} value={item}>{SUPPORT_STATUS_LABELS[item]}</NativeSelectOption>)}</NativeSelect></label>
        <label>Prioridade<NativeSelect value={ticket.priority} onChange={(event) => updateTicket({ priority: event.target.value as SupportTicketRow["priority"] })} className="field-control">{SUPPORT_PRIORITIES.map((item) => <NativeSelectOption key={item} value={item}>{SUPPORT_PRIORITY_LABELS[item]}</NativeSelectOption>)}</NativeSelect></label>
        <label>Categoria<NativeSelect value={ticket.category} onChange={(event) => updateTicket({ category: event.target.value })} className="field-control">{SUPPORT_CATEGORIES.map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></label>
      </div>}
      <div className="support-thread">
        {messages.map((item) => <div key={item.id} className="support-message"><div className="support-message-meta"><strong>{item.authorName ?? "Utilizador"}</strong><small>{formatSupportDate(item.createdAt)}</small></div><p>{item.body}</p></div>)}
      </div>
      <form onSubmit={sendReply} className="support-reply-form">
        <Textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Escreva uma resposta…" rows={3} />
        <Button type="submit" className="btn-burgundy" disabled={sending || !reply.trim()}>{sending ? "A enviar…" : "Responder"} <ArrowRight /></Button>
      </form>
    </div>
  </>;
}

function MyTickets() {
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    try {
      const { tickets: list } = await api<{ tickets: SupportTicketRow[] }>("/api/support");
      setTickets(list);
    } catch {
      toast.error("Não foi possível carregar os seus pedidos de suporte");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return <><PageHeader kicker="PRECISA DE AJUDA?" title="Suporte" description="Abra um pedido e acompanhe a resposta da equipa Muntu COE." action={<NewTicketForm onCreated={(ticket) => setTickets((current) => [ticket, ...current])} />} />
    <section className="panel">
      <div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Assunto</TableHead><TableHead>Categoria</TableHead><TableHead>Prioridade</TableHead><TableHead>Estado</TableHead><TableHead>Actualizado</TableHead><TableHead /></TableRow></TableHeader><TableBody>{tickets.map((ticket) => <TableRow key={ticket.id}><TableCell><strong>{ticket.id}</strong></TableCell><TableCell>{ticket.subject}</TableCell><TableCell>{ticket.category}</TableCell><TableCell><span className={supportPriorityClass(ticket.priority)}>{SUPPORT_PRIORITY_LABELS[ticket.priority]}</span></TableCell><TableCell><span className={supportStatusClass(ticket.status)}>{SUPPORT_STATUS_LABELS[ticket.status]}</span></TableCell><TableCell>{formatSupportDate(ticket.updatedAt)}</TableCell><TableCell className="text-right"><Button size="icon-sm" variant="ghost" onClick={() => setSelectedId(ticket.id)} aria-label={`Ver ${ticket.id}`}><Eye /></Button></TableCell></TableRow>)}</TableBody></Table>{!loading && tickets.length === 0 && <div className="empty-state"><LifeBuoy /><h3>Sem pedidos de suporte</h3><p>Use &quot;Novo pedido de suporte&quot; para falar com a equipa Muntu COE.</p></div>}</div>
    </section>
    <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}><SheetContent className="request-sheet sm:max-w-xl">{selectedId && <SupportThread ticketId={selectedId} isAdmin={false} />}</SheetContent></Sheet>
  </>;
}

function SupportInbox() {
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    try {
      const { tickets: list } = await api<{ tickets: SupportTicketRow[] }>("/api/support");
      setTickets(list);
    } catch {
      toast.error("Não foi possível carregar a caixa de suporte");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCount = tickets.filter((t) => t.status === "aberto").length;
  const overdueCount = tickets.filter(isTicketOverdue).length;

  const applyUpdate = (updated: SupportTicketRow) => setTickets((current) => current.map((t) => (t.id === updated.id ? updated : t)));

  return <><PageHeader kicker="CAIXA DE ENTRADA" title="Suporte" description="Pedidos e dúvidas de todos os utilizadores do Muntu COE." />
    <section className="metric-grid report-metrics">
      <article><div><small>ABERTOS</small><strong>{openCount}</strong></div></article>
      <article><div><small>SLA VENCIDO</small><strong className={overdueCount > 0 ? "text-danger" : ""}>{overdueCount}</strong></div></article>
      <article><div><small>TOTAL</small><strong>{tickets.length}</strong></div></article>
    </section>
    <section className="panel">
      <div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Assunto</TableHead><TableHead>Categoria</TableHead><TableHead>Prioridade</TableHead><TableHead>Estado</TableHead><TableHead>SLA</TableHead><TableHead /></TableRow></TableHeader><TableBody>{tickets.map((ticket) => <TableRow key={ticket.id}><TableCell><strong>{ticket.id}</strong></TableCell><TableCell>{ticket.subject}</TableCell><TableCell>{ticket.category}</TableCell><TableCell><span className={supportPriorityClass(ticket.priority)}>{SUPPORT_PRIORITY_LABELS[ticket.priority]}</span></TableCell><TableCell><span className={supportStatusClass(ticket.status)}>{SUPPORT_STATUS_LABELS[ticket.status]}</span></TableCell><TableCell><span className={isTicketOverdue(ticket) ? "text-danger" : ""}>{isTicketOverdue(ticket) ? "Vencido" : formatSupportDate(ticket.slaDueAt)}</span></TableCell><TableCell className="text-right"><Button size="icon-sm" variant="ghost" onClick={() => setSelectedId(ticket.id)} aria-label={`Ver ${ticket.id}`}><Eye /></Button></TableCell></TableRow>)}</TableBody></Table>{!loading && tickets.length === 0 && <div className="empty-state"><LifeBuoy /><h3>Sem pedidos de suporte</h3><p>Nada pendente por agora.</p></div>}</div>
    </section>
    <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}><SheetContent className="request-sheet sm:max-w-xl">{selectedId && <SupportThread ticketId={selectedId} isAdmin onTicketUpdated={applyUpdate} />}</SheetContent></Sheet>
  </>;
}

// Documentos reais ligados a uma entidade concreta (pedido, fornecedor,
// factura, recepção, excepção, PO) — substitui os botões "Ver
// evidência"/"Ver Supplier Passport"/etc. que antes só disparavam um
// toast, e o par de nomes de ficheiro fixos que existia no dossier do
// pedido. Um único componente partilhado por todos, apoiado em
// GET/POST /api/documents?entityType=&entityId= (lib/document-access.ts
// decide quem pode ver/anexar cada entidade).
function EntityDocuments({
  entityType,
  entityId,
  title = "Documentos",
  onUploadDocument,
  onDownloadDocument,
}: {
  entityType: string;
  entityId: string;
  title?: string;
  onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>;
  onDownloadDocument: (doc: DocumentItem) => void;
}) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { documents } = await api<{ documents: DocumentItem[] }>(`/api/documents?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`);
        if (!cancelled) setDocs(documents);
      } catch {
        if (!cancelled) setDocs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  const attach = async (file: File) => {
    const created = await onUploadDocument(file, { entityType, entityId, type: title });
    if (created) setDocs((items) => [created, ...items]);
  };

  return <div className="sheet-documents">
    <div className="sheet-documents-head">
      <h3>{title}</h3>
      <input ref={fileInputRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) attach(file); event.target.value = ""; }} />
      <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}><UploadCloud /> Anexar</Button>
    </div>
    {loading ? <p className="muted">A carregar…</p> : docs.length === 0 ? <p className="muted">Sem documentos anexados.</p> : docs.map((doc) => <button key={doc.id} onClick={() => onDownloadDocument(doc)}><FileText /><span><strong>{doc.name}</strong><small>{doc.owner} • {doc.updated}</small></span><Download /></button>)}
  </div>;
}

function RequestDetail({ request, onAction, canDecide, onUploadDocument, onDownloadDocument }: { request: RequestItem; onAction: (id: string, action: "approve" | "reject") => void; canDecide: boolean; onUploadDocument: (file: File, options?: { type?: string; request?: string; entityType?: string; entityId?: string }) => Promise<DocumentItem | null>; onDownloadDocument: (doc: DocumentItem) => void }) { return <><SheetHeader><p className="kicker">DOSSIER DA TRANSACÇÃO</p><SheetTitle>{request.id}</SheetTitle><SheetDescription>{request.subject}</SheetDescription></SheetHeader><div className="sheet-body"><div className="sheet-status"><span className={statusClass(request.status)}>{request.status}</span><span className={request.sla.includes("Vencido") ? "text-danger" : ""}><Clock3 /> {request.sla}</span></div><div className="sheet-value"><small>VALOR</small><strong>{money(request.value)}</strong><p>{request.supplier} • {request.costCenter}</p></div><div className="timeline"><h3>Workflow</h3>{stages.map((stage, index) => <div key={stage} className={index < request.stage ? "complete" : index === request.stage ? "current" : ""}><span>{index < request.stage ? <Check /> : index + 1}</span><div><strong>{stage}</strong><small>{index < request.stage ? "Concluído" : index === request.stage ? "Em curso • Muntu Operations" : "A aguardar"}</small></div></div>)}</div><EntityDocuments entityType="request" entityId={request.id} onUploadDocument={onUploadDocument} onDownloadDocument={onDownloadDocument} /><div className="audit-note"><ShieldCheck /><span><strong>Auditoria activa</strong>Todas as decisões, alterações e anexos ficam registados.</span></div></div>{canDecide && request.status === "Aprovação" && <div className="sheet-actions"><Button variant="outline" className="reject-button" onClick={() => onAction(request.id, "reject")}><XCircle /> Devolver</Button><Button className="btn-green" onClick={() => onAction(request.id, "approve")}><Check /> Aprovar</Button></div>}</>; }

export default function HomePage() {
  const [screen, setScreen] = useState<"public" | "login" | "portal" | "candidatura">("public");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [ssoError, setSsoError] = useState<string | undefined>(undefined);
  const [resetToken, setResetToken] = useState<string | undefined>(undefined);
  const [applicationToken, setApplicationToken] = useState<string | undefined>(undefined);
  const [applicationId, setApplicationId] = useState<string | undefined>(undefined);
  const [publicStats, setPublicStats] = useState<PublicStats>(null);

  // Estatísticas reais para o site público e o login (antes do
  // utilizador iniciar sessão) — substitui os "96,4% SLA / 42 pedidos
  // activos / 3,2 dias" fixos no código que apareciam nestes dois ecrãs.
  // Falha silenciosa (fica null, os componentes mostram "—"): não vale a
  // pena um erro visível por causa de um número decorativo.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/public-stats");
        if (!response.ok) return;
        const data = (await response.json()) as PublicStats;
        if (!cancelled) setPublicStats(data);
      } catch {
        // silencioso — ver comentário acima
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const navigate = (next: "public" | "login" | "portal" | "candidatura") => { setScreen(next); window.history.replaceState(null, "", next === "public" ? window.location.pathname : `#${next}`); window.scrollTo({ top: 0, behavior: "smooth" }); };

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const errorFromSso = params.get("sso_error");
    const tokenFromReset = params.get("reset_token");
    // Link do e-mail de confirmação de candidatura (Candidatura ->
    // Documentos): sem sessão nenhuma, o acesso à candidatura é por este
    // token — ver sendApplicationReceivedEmail em lib/mailer.ts.
    const tokenFromApplication = params.get("application_token");
    const idFromApplication = params.get("application_id");
    if (errorFromSso || tokenFromReset) {
      if (errorFromSso) setSsoError(errorFromSso);
      if (tokenFromReset) setResetToken(tokenFromReset);
      window.history.replaceState(null, "", window.location.pathname + "#login");
    }
    if (tokenFromApplication && idFromApplication) {
      setApplicationToken(tokenFromApplication);
      setApplicationId(idFromApplication);
      window.history.replaceState(null, "", window.location.pathname + "#candidatura");
    }
    (async () => {
      try {
        // Fetch directo (não usa api()) para não disparar o evento de
        // "sessão expirada" numa visita sem sessão nenhuma — um 401 aqui
        // é o resultado normal de ainda não ter feito login.
        const response = await fetch("/api/auth/me");
        if (response.ok && !errorFromSso && !tokenFromReset && !tokenFromApplication) {
          const { user: restored } = (await response.json()) as { user: AuthUser };
          setUser(restored);
          setScreen("portal");
        } else if (hash === "#login" || errorFromSso || tokenFromReset) {
          setScreen("login");
        } else if (hash === "#candidatura" || tokenFromApplication) {
          setScreen("candidatura");
        }
      } catch {
        if (hash === "#login" || errorFromSso || tokenFromReset) setScreen("login");
        else if (hash === "#candidatura" || tokenFromApplication) setScreen("candidatura");
      } finally {
        setSessionChecked(true);
      }
    })();
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      navigate("login");
      toast.error("Sessão expirada. Inicie sessão novamente.");
    };
    window.addEventListener("muntu:unauthorized", onUnauthorized);
    return () => window.removeEventListener("muntu:unauthorized", onUnauthorized);
  }, []);

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      toast.success("Sessão terminada");
      setUser(null);
      navigate("public");
    }
  };

  if (!sessionChecked) {
    return <div className="empty-state panel"><Sparkles /><h3>A carregar…</h3></div>;
  }
  if (screen === "login" || (screen === "portal" && !user)) {
    return <><Toaster richColors position="top-right" /><Login onBack={() => navigate("public")} onSuccess={(loggedUser) => { setUser(loggedUser); navigate("portal"); }} initialError={ssoError} resetToken={resetToken} onResetTokenConsumed={() => setResetToken(undefined)} publicStats={publicStats} /></>;
  }
  if (screen === "candidatura") {
    return <><Toaster richColors position="top-right" /><CandidaturaScreen onBack={() => navigate("public")} initialApplicationId={applicationId} initialToken={applicationToken} onLinkConsumed={() => { setApplicationToken(undefined); setApplicationId(undefined); }} /></>;
  }
  if (screen === "portal" && user) {
    return <Portal user={user} onLogout={logout} />;
  }
  return <PublicSite onLogin={() => navigate("login")} onCandidatar={() => navigate("candidatura")} publicStats={publicStats} />;
}
