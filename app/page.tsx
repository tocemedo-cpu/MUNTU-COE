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
  Globe2,
  Handshake,
  Home,
  Inbox,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Network,
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

type PortalView =
  | "dashboard" | "new-request" | "requests" | "approvals" | "suppliers"
  | "pos" | "receipts" | "invoices" | "exceptions" | "payments"
  | "reports" | "repository" | "admin" | "users" | "billing";

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
};

type Supplier = { id: number; name: string; category: string; passport: number; risk: string; local: string; status: string };
type PurchaseOrder = { id: string; supplier: string; description: string; value: number; status: string; nextAction: string };
type Receipt = { id: number; po: string; description: string; supplier: string; value: number; progress: number; status: string };
type Invoice = { id: string; supplier: string; po: string; value: number; match: string; status: string; due: string };
type ExceptionItem = { id: string; title: string; ref: string; owner: string; age: string; impact: string; resolved: boolean };
type PaymentBatch = { id: string; date: string; count: number; value: number; status: string; released: boolean };
type DocumentItem = { id: number; name: string; type: string; request: string; owner: string; version: string; updated: string };
type AccessLevel = "system_admin" | "coe_manager" | "analyst" | "supplier" | "company_admin" | "requester";
type AuthUser = { id: number; name: string; email: string; role: string; initials: string; tenant: string; accessLevel: AccessLevel; companyId: number | null; supplierId: number | null };

const stages = ["Intake", "Validação", "Aprovação", "PO", "Receção", "Factura", "Excepção", "Pagamento"];

const money = (value: number) => new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(value);

const statusClass = (status: string) => {
  if (["Pago", "Activo", "Validada", "Aprovado", "Concluído", "Confirmada"].includes(status)) return "status status-green";
  if (["Excepção", "Vencido", "Rejeitado"].some((word) => status.includes(word))) return "status status-red";
  if (["Aprovação", "Pendente", "Revisão", "Documentos"].includes(status)) return "status status-amber";
  return "status status-slate";
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("muntu:unauthorized"));
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Erro de comunicação com o servidor");
  }
  return data as T;
}

function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return <div className={`brand ${inverse ? "brand-inverse" : ""}`}>
    <img src="/muntu/muntu-mark.svg" alt="Símbolo Muntu COE" />
    {!compact && <span><strong>MUNTU</strong><small>CENTRE OF EXCELLENCE</small></span>}
  </div>;
}

function PublicSite({ onLogin }: { onLogin: () => void }) {
  return <div className="public-site">
    <header className="public-header">
      <Brand />
      <nav aria-label="Navegação principal"><a href="#solucao">Solução</a><a href="#capacidades">Capacidades</a><a href="#modelo">Modelo operacional</a><a href="#expansao">Expansão</a></nav>
      <Button className="btn-burgundy" onClick={onLogin}>Aceder ao portal <ArrowRight /></Button>
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
          <div className="hero-float hero-float-bottom"><Gauge /><div><strong>96,4%</strong><span>SLA dentro do prazo</span></div></div>
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

      <section className="cta-section"><div><p className="kicker">COMECE COM UM PEDIDO</p><h2>Uma porta de entrada. Execução ponta-a-ponta.</h2></div><Button size="lg" onClick={onLogin}>Aceder ao portal <ArrowRight /></Button></section>
    </main>
    <footer className="public-footer"><Brand inverse /><p>Procurement • Accounts Payable • Compliance • Conteúdo local</p><span>Luanda, Angola • © 2026 Muntu COE</span></footer>
  </div>;
}

function Login({
  onBack,
  onSuccess,
  initialError,
  resetToken,
  onResetTokenConsumed,
}: {
  onBack: () => void;
  onSuccess: (user: AuthUser) => void;
  initialError?: string;
  resetToken?: string;
  onResetTokenConsumed: () => void;
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
    <section className="login-visual"><button className="back-link" onClick={onBack}><ArrowRight /> Voltar ao site</button><Brand inverse /><div className="login-message"><Badge>PORTAL OPERACIONAL</Badge><h1>Todos os pedidos. Todos os intervenientes. Um único fluxo.</h1><p>Acompanhe o trabalho do intake ao pagamento, com SLA, documentação e responsabilidades visíveis.</p><div className="login-stats"><div><strong>96,4%</strong><span>SLA</span></div><div><strong>42</strong><span>pedidos activos</span></div><div><strong>3,2d</strong><span>ciclo médio</span></div></div></div></section>
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
};

const navigation: { group: string; items: { id: PortalView; label: string; icon: typeof Home; count?: number }[] }[] = [
  { group: "TRABALHO", items: [{ id: "dashboard", label: "Visão geral", icon: LayoutDashboard }, { id: "new-request", label: "Novo pedido", icon: Plus }, { id: "requests", label: "Meus pedidos", icon: Inbox }, { id: "approvals", label: "Aprovações", icon: ClipboardCheck }] },
  { group: "EXECUÇÃO P2P", items: [{ id: "suppliers", label: "Fornecedores", icon: Users }, { id: "pos", label: "Ordens de compra", icon: ShoppingCart }, { id: "receipts", label: "Recepções", icon: PackageCheck }, { id: "invoices", label: "Facturas & match", icon: ReceiptText }, { id: "exceptions", label: "Excepções", icon: AlertTriangle }, { id: "payments", label: "Pagamentos", icon: WalletCards }] },
  { group: "INTELIGÊNCIA", items: [{ id: "reports", label: "Relatórios", icon: BarChart3 }, { id: "repository", label: "Repositório", icon: Database }, { id: "admin", label: "Administração", icon: Settings }, { id: "users", label: "Utilizadores", icon: UserCog }, { id: "billing", label: "Facturação", icon: Landmark }] },
];

const viewLabels: Record<PortalView, string> = { dashboard: "Visão geral", "new-request": "Novo pedido", requests: "Meus pedidos", approvals: "Aprovações", suppliers: "Fornecedores", pos: "Ordens de compra", receipts: "Recepções", invoices: "Facturas & match", exceptions: "Excepções", payments: "Pagamentos", reports: "Relatórios", repository: "Repositório", admin: "Administração", users: "Utilizadores", billing: "Facturação" };

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

  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [form, setForm] = useState({ tower: "Requisition-to-PO", type: "PO standard", subject: "", costCenter: "OFS-OPS-210", supplier: "Kwanza Industrial", value: "", due: "", approver: "João Sebastião — Director de Operações", priority: "Média", notes: "" });

  const isRequester = user.accessLevel === "requester";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Um "requester" está bloqueado no servidor para as rotas de
        // execução P2P — nem sequer as chama, para não rebentar o
        // carregamento do portal com um 403 dentro do Promise.all.
        const [r, s] = await Promise.all([
          api<{ requests: RequestItem[] }>("/api/requests"),
          api<{ suppliers: Supplier[] }>("/api/suppliers"),
        ]);
        if (cancelled) return;
        setRequests(r.requests);
        setSuppliersList(s.suppliers);

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
      } catch {
        if (!cancelled) toast.error("Não foi possível carregar os dados do portal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const go = (next: PortalView) => { setView(next); setSidebarOpen(false); setSearch(""); };

  const filteredRequests = useMemo(() => { const query = search.toLowerCase(); return requests.filter((item) => [item.id, item.subject, item.supplier, item.status].some((field) => field.toLowerCase().includes(query))); }, [requests, search]);

  const actOnRequest = async (id: string, action: "approve" | "reject") => {
    try {
      const { request: updated } = await api<{ request: RequestItem }>(`/api/requests/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      setRequests((items) => items.map((item) => (item.id === id ? updated : item)));
      toast[action === "approve" ? "success" : "error"](action === "approve" ? `${id} aprovado e enviado para execução` : `${id} devolvido ao solicitante`);
    } catch {
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

  const confirmReceipt = async (id: number) => {
    try {
      const { receipt: updated } = await api<{ receipt: Receipt }>(`/api/receipts/${id}`, { method: "PATCH", body: JSON.stringify({ action: "confirm" }) });
      setReceiptsList((items) => items.map((item) => (item.id === id ? updated : item)));
      toast.success("Recepção confirmada e factura desbloqueada");
    } catch {
      toast.error("Não foi possível confirmar a recepção");
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

  const updateSupplierProfile = async (id: number, fields: { category?: string; local?: string }) => {
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

  const uploadDocument = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "Geral");
      formData.append("request", "—");
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      if (response.status === 401) window.dispatchEvent(new CustomEvent("muntu:unauthorized"));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar o documento");
      setDocumentsList((items) => [data.document as DocumentItem, ...items]);
      toast.success(`${file.name} adicionado ao repositório`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o documento");
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

  return <div className="portal-shell"><Toaster richColors position="top-right" />
    {sidebarOpen && <button className="mobile-overlay" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}><div className="sidebar-brand"><Brand /><button aria-label="Fechar menu" onClick={() => setSidebarOpen(false)}><X /></button></div><div className="tenant"><span>{user.initials.slice(0, 2)}</span><div><strong>{user.tenant}</strong><small>ANGOLA • PRODUÇÃO</small></div></div><nav>{navigation.map((group) => { const items = group.items.filter((item) => VIEW_ROLES[item.id].includes(user.accessLevel)); return items.length ? <div className="nav-group" key={group.group}><p>{group.group}</p>{items.map((item) => { const Icon = item.icon; const count = item.id === "approvals" ? approvalsCount : item.id === "exceptions" ? exceptionsCount : item.id === "requests" ? requests.length : item.id === "invoices" ? invoicesList.filter((invoice) => invoice.status === "Excepção").length : undefined; return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => go(item.id)}><Icon /><span>{item.label}</span>{count ? <b>{count}</b> : null}</button>; })}</div> : null; })}</nav><div className="sidebar-help"><ShieldCheck /><div><strong>Centro de controlo</strong><span>Operação acompanhada pelo Muntu COE</span></div></div></aside>
    <section className="portal-main"><header className="topbar"><div className="topbar-left"><button className="menu-button" aria-label="Abrir menu" onClick={() => setSidebarOpen(true)}><Menu /></button><div><small>MUNTU COE / {user.role.toUpperCase()}</small><strong>{viewLabels[view]}</strong></div></div><div className="topbar-search"><Search /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar pedido, PO, factura ou fornecedor…" /></div><div className="topbar-actions"><Button className="btn-burgundy quick-new" onClick={() => go("new-request")}><Plus /> Novo pedido</Button><div className="notification-wrap"><Button size="icon" variant="outline" aria-label="Notificações" onClick={() => setNotificationsOpen((open) => !open)}><Bell /><span className="notification-dot">3</span></Button>{notificationsOpen && <div className="notification-panel"><div><strong>Notificações</strong><button onClick={() => setNotificationsOpen(false)}><X /></button></div><article><AlertTriangle /><span><b>FT-2026-1192</b> está em excepção há 2 horas.</span></article><article><ClipboardCheck /><span><b>REQ-2026-0814</b> aguarda a sua aprovação.</span></article><article><PackageCheck /><span><b>PO-6100380</b> está pronto para recepção.</span></article></div>}</div><div className="user-menu"><span>{user.initials}</span><div><strong>{user.name}</strong><small>{user.role}</small></div><button aria-label="Terminar sessão" onClick={onLogout}><LogOut /></button></div></div></header>
      <main className="workspace">
        {loading ? <div className="empty-state panel"><Sparkles /><h3>A carregar o portal…</h3><p>A ligar à base de dados do Muntu COE.</p></div> : <>
          {view === "dashboard" && <Dashboard requests={requests} go={go} setSelectedRequest={setSelectedRequest} />}
          {view === "new-request" && <NewRequest step={wizardStep} setStep={setWizardStep} form={form} setForm={setForm} submit={submitRequest} suppliers={suppliersList} />}
          {view === "requests" && <RequestsTable title="Meus pedidos" subtitle="Acompanhe prioridade, responsável, etapa e SLA em tempo real." requests={filteredRequests} onSelect={setSelectedRequest} />}
          {view === "approvals" && <Approvals requests={requests.filter((item) => item.status === "Aprovação")} onAction={actOnRequest} onSelect={setSelectedRequest} />}
          {view === "suppliers" && (user.accessLevel === "supplier" ? <SupplierProfile supplier={suppliersList[0]} onUpdate={updateSupplierProfile} /> : <Suppliers search={search} suppliers={suppliersList} onInvite={inviteSupplier} />)}
          {view === "pos" && <PurchaseOrders purchaseOrders={purchaseOrders} />}
          {view === "receipts" && <Receipts receipts={receiptsList} onConfirm={confirmReceipt} />}
          {view === "invoices" && <Invoices search={search} invoices={invoicesList} />}
          {view === "exceptions" && <Exceptions items={exceptionsList} onResolve={resolveException} />}
          {view === "payments" && <Payments batches={paymentBatches} onRelease={releasePayment} />}
          {view === "reports" && <Reports requests={requests} exceptions={exceptionsList} />}
          {view === "repository" && <Repository search={search} documents={documentsList} onUpload={uploadDocument} onDownload={downloadDocument} />}
          {view === "admin" && <Administration user={user} />}
          {view === "users" && <UsersAdmin />}
          {view === "billing" && <ClientBilling />}
        </>}
      </main>
    </section>
    <Sheet open={Boolean(selectedRequest)} onOpenChange={(open) => !open && setSelectedRequest(null)}><SheetContent className="request-sheet sm:max-w-xl">{selectedRequest && <RequestDetail request={selectedRequest} onAction={actOnRequest} canDecide={!isRequester} />}</SheetContent></Sheet>
  </div>;
}

function PageHeader({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-header"><div><p>{kicker}</p><h1>{title}</h1><span>{description}</span></div>{action}</div>; }

function Dashboard({ requests, go, setSelectedRequest }: { requests: RequestItem[]; go: (view: PortalView) => void; setSelectedRequest: (request: RequestItem) => void }) {
  const active = requests.filter((item) => !["Pago", "Rejeitado"].includes(item.status)).length;
  const inApproval = requests.filter((item) => item.status === "Aprovação").length;
  const totalValue = requests.reduce((sum, item) => sum + item.value, 0);
  const pipelineCounts = stages.map((_, index) => requests.filter((item) => item.stage === index).length);
  const highestApproval = requests.filter((item) => item.status === "Aprovação").sort((a, b) => b.value - a.value)[0];

  return <><PageHeader kicker="VISÃO GERAL" title="Bom dia." description="A sua operação P2P está sob controlo, com dados actualizados directamente da base de dados." action={<Button className="btn-burgundy" onClick={() => go("new-request")}><Plus /> Criar pedido</Button>} />
    <section className="metric-grid"><article><span className="metric-icon burgundy"><Inbox /></span><div><small>PEDIDOS ACTIVOS</small><strong>{active}</strong><p>{requests.length} no total</p></div></article><article><span className="metric-icon amber"><Clock3 /></span><div><small>EM APROVAÇÃO</small><strong>{inApproval}</strong><p>Requer decisão</p></div></article><article><span className="metric-icon green"><CheckCircle2 /></span><div><small>SLA NO PRAZO</small><strong>96,4%</strong><p><b>+2,1 pp</b> vs. mês anterior</p></div></article><article><span className="metric-icon slate"><CircleDollarSign /></span><div><small>VALOR EM FLUXO</small><strong>{money(totalValue)}</strong><p>{requests.length} transacções</p></div></article></section>
    <section className="dashboard-grid"><article className="panel pipeline-panel"><div className="panel-heading"><div><p>WORKFLOW P2P</p><h2>Transacções por etapa</h2></div><button onClick={() => go("reports")}>Ver relatório <ArrowRight /></button></div><div className="pipeline-list">{pipelineCounts.map((count, index) => <button key={stages[index]} onClick={() => go(index < 3 ? "requests" : index === 3 ? "pos" : index === 4 ? "receipts" : index === 5 ? "invoices" : index === 6 ? "exceptions" : "payments")}><span>{String(index + 1).padStart(2, "0")}</span><strong>{stages[index]}</strong><b>{count}</b>{index < stages.length - 1 && <ChevronRight />}</button>)}</div><div className="cycle-summary"><div><strong>3,2 dias</strong><span>Ciclo médio end-to-end</span></div><Progress value={78} /><small>Meta: ≤ 4 dias • 78% concluídos sem intervenção manual</small></div></article>
      <article className="panel attention-panel"><div className="panel-heading"><div><p>PRIORIDADE</p><h2>Requer a sua atenção</h2></div><Badge className="badge-alert">{inApproval} itens</Badge></div><button onClick={() => go("approvals")}><span className="attention-icon amber"><ClipboardCheck /></span><div><strong>{inApproval} pedidos por aprovar</strong><p>{highestApproval ? `Maior valor: ${money(highestApproval.value)}` : "Sem pedidos pendentes"}</p></div><ChevronRight /></button><button onClick={() => go("exceptions")}><span className="attention-icon red"><AlertTriangle /></span><div><strong>Excepções abertas</strong><p>Ver fila de resolução</p></div><ChevronRight /></button><button onClick={() => go("receipts")}><span className="attention-icon slate"><PackageCheck /></span><div><strong>Recepções pendentes</strong><p>Confirme para desbloquear pagamentos</p></div><ChevronRight /></button><div className="coe-note"><Sparkles /><div><strong>Muntu Operations</strong><p>A equipa já contactou o fornecedor e preparou a evidência para a sua decisão.</p></div></div></article></section>
    <section className="panel recent-panel"><div className="panel-heading"><div><p>ACTIVIDADE</p><h2>Pedidos recentes</h2></div><button onClick={() => go("requests")}>Ver todos <ArrowRight /></button></div><RequestRows requests={requests.slice(0, 4)} onSelect={setSelectedRequest} /></section>
  </>;
}

function RequestRows({ requests, onSelect }: { requests: RequestItem[]; onSelect: (request: RequestItem) => void }) { return <div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Fornecedor</TableHead><TableHead>Valor</TableHead><TableHead>Estado</TableHead><TableHead>SLA</TableHead><TableHead className="text-right">Acção</TableHead></TableRow></TableHeader><TableBody>{requests.map((request) => <TableRow key={request.id}><TableCell><button className="request-link" onClick={() => onSelect(request)}><strong>{request.id}</strong><span>{request.subject}</span></button></TableCell><TableCell>{request.supplier}</TableCell><TableCell>{money(request.value)}</TableCell><TableCell><span className={statusClass(request.status)}>{request.status}</span></TableCell><TableCell className={request.sla.includes("Vencido") ? "text-danger" : ""}>{request.sla}</TableCell><TableCell className="text-right"><Button size="icon-sm" variant="ghost" onClick={() => onSelect(request)} aria-label={`Abrir ${request.id}`}><Eye /></Button></TableCell></TableRow>)}</TableBody></Table>{requests.length === 0 && <div className="empty-state"><Search /><h3>Sem pedidos</h3><p>Ainda não existem pedidos registados.</p></div>}</div>; }

function RequestsTable({ title, subtitle, requests, onSelect }: { title: string; subtitle: string; requests: RequestItem[]; onSelect: (request: RequestItem) => void }) { return <><PageHeader kicker="WORKFLOW E REPOSITÓRIO" title={title} description={subtitle} action={<div className="header-actions"><Button variant="outline"><Filter /> Filtros</Button><Button variant="outline"><Download /> Exportar</Button></div>} /><section className="filter-chips"><button className="active">Todos <b>{requests.length}</b></button><button>Em curso <b>{requests.filter((item) => !["Pago", "Rejeitado"].includes(item.status)).length}</b></button><button>Excepções <b>{requests.filter((item) => item.status === "Excepção").length}</b></button></section><section className="panel"><RequestRows requests={requests} onSelect={onSelect} />{requests.length === 0 && <div className="empty-state"><Search /><h3>Nenhum resultado</h3><p>Experimente pesquisar por outro pedido, fornecedor ou estado.</p></div>}</section></>; }

function NewRequest({ step, setStep, form, setForm, submit, suppliers }: { step: number; setStep: (step: number) => void; form: Record<string, string>; setForm: React.Dispatch<React.SetStateAction<{ tower: string; type: string; subject: string; costCenter: string; supplier: string; value: string; due: string; approver: string; priority: string; notes: string }>>; submit: () => void; suppliers: Supplier[] }) {
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <><PageHeader kicker="INTAKE E TRIAGEM" title="Novo pedido" description="Uma entrada estruturada alimenta workflow, SLA e repositório automaticamente." /><section className="wizard-shell"><div className="wizard-progress">{["Tipo", "Detalhes", "Aprovação", "Confirmar"].map((label, index) => <button key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""} onClick={() => step > index + 1 && setStep(index + 1)}><span>{step > index + 1 ? <Check /> : index + 1}</span><div><strong>{label}</strong><small>{["Torre e transacção", "Dados e anexos", "Matriz e SLA", "Revisão final"][index]}</small></div></button>)}</div><div className="wizard-content">
    {step === 1 && <div className="wizard-step"><p className="kicker">PASSO 1 DE 4</p><h2>Que trabalho precisa de iniciar?</h2><p>Escolha a torre operacional e o tipo de transacção.</p><div className="option-grid"><button className={form.tower === "Requisition-to-PO" ? "selected" : ""} onClick={() => update("tower", "Requisition-to-PO")}><ShoppingCart /><span><strong>Requisition-to-PO</strong><small>Criação, validação, aprovação e emissão de PO</small></span>{form.tower === "Requisition-to-PO" && <CheckCircle2 />}</button><button className={form.tower === "PO-to-Receipt" ? "selected" : ""} onClick={() => update("tower", "PO-to-Receipt")}><PackageCheck /><span><strong>PO-to-Receipt</strong><small>Expediting, entrega, qualidade e recepção</small></span>{form.tower === "PO-to-Receipt" && <CheckCircle2 />}</button><button className={form.tower === "Invoice-to-Pay" ? "selected" : ""} onClick={() => update("tower", "Invoice-to-Pay")}><ReceiptText /><span><strong>Invoice-to-Pay</strong><small>Factura, match, excepção e preparação do pagamento</small></span>{form.tower === "Invoice-to-Pay" && <CheckCircle2 />}</button><button className={form.tower === "Supplier Management" ? "selected" : ""} onClick={() => update("tower", "Supplier Management")}><Users /><span><strong>Supplier Management</strong><small>Onboarding, Supplier Passport, risco e desempenho</small></span>{form.tower === "Supplier Management" && <CheckCircle2 />}</button></div><label className="form-field">Tipo de transacção<NativeSelect value={form.type} onChange={(event) => update("type", event.target.value)} className="field-control"><NativeSelectOption>PO standard</NativeSelectOption><NativeSelectOption>PO catalogado</NativeSelectOption><NativeSelectOption>Serviço técnico</NativeSelectOption><NativeSelectOption>Compra urgente</NativeSelectOption><NativeSelectOption>Contrato / Call-off</NativeSelectOption></NativeSelect></label></div>}
    {step === 2 && <div className="wizard-step"><p className="kicker">PASSO 2 DE 4</p><h2>Detalhes do pedido</h2><p>Inclua informação suficiente para a validação começar sem devoluções.</p><div className="form-grid"><label className="form-field span-2">Título do pedido<Input value={form.subject} onChange={(event) => update("subject", event.target.value)} placeholder="Ex.: Válvulas de controlo para campanha offshore" /></label><label className="form-field">Centro de custo<Input value={form.costCenter} onChange={(event) => update("costCenter", event.target.value)} /></label><label className="form-field">Fornecedor preferencial<NativeSelect value={form.supplier} onChange={(event) => update("supplier", event.target.value)} className="field-control">{suppliers.map((supplier) => <NativeSelectOption key={supplier.name}>{supplier.name}</NativeSelectOption>)}</NativeSelect></label><label className="form-field">Valor estimado (AOA)<Input inputMode="numeric" value={form.value} onChange={(event) => update("value", event.target.value)} placeholder="84 000 000" /></label><label className="form-field">Data necessária<Input type="date" value={form.due} onChange={(event) => update("due", event.target.value)} /></label><label className="form-field span-2">Escopo e contexto<Textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Explique a necessidade, o local de entrega e os requisitos críticos…" /></label><button className="upload-zone span-2" onClick={() => toast.success("Anexo de demonstração adicionado")}><UploadCloud /><strong>Adicionar documentos</strong><span>Especificação, cotação, desenho ou justificativo • PDF, XLSX, DOCX, ZIP</span></button></div></div>}
    {step === 3 && <div className="wizard-step"><p className="kicker">PASSO 3 DE 4</p><h2>Aprovação e prioridade</h2><p>A regra sugerida usa o valor, centro de custo e tipo de pedido.</p><div className="approval-card"><span><ShieldCheck /></span><div><small>ROTA RECOMENDADA</small><strong>Solicitante → Director de Operações → Finanças</strong><p>O Muntu valida o dossier antes de iniciar a aprovação. Valor acima de AOA 50M requer dupla aprovação.</p></div></div><div className="form-grid"><label className="form-field span-2">Aprovador principal<NativeSelect value={form.approver} onChange={(event) => update("approver", event.target.value)} className="field-control"><NativeSelectOption>João Sebastião — Director de Operações</NativeSelectOption><NativeSelectOption>Maria José — Directora Financeira</NativeSelectOption><NativeSelectOption>Paulo Agostinho — Director de Supply Chain</NativeSelectOption></NativeSelect></label><label className="form-field">Prioridade<NativeSelect value={form.priority} onChange={(event) => update("priority", event.target.value)} className="field-control"><NativeSelectOption>Normal</NativeSelectOption><NativeSelectOption>Média</NativeSelectOption><NativeSelectOption>Alta</NativeSelectOption></NativeSelect></label><label className="form-field">SLA inicial<Input value={form.priority === "Alta" ? "4 horas" : form.priority === "Média" ? "8 horas" : "16 horas"} readOnly /></label></div><div className="sla-note"><Clock3 /><span><strong>O relógio começa após a submissão.</strong> Pausas e devoluções ficam registadas na auditoria.</span></div></div>}
    {step === 4 && <div className="wizard-step"><p className="kicker">PASSO 4 DE 4</p><h2>Confirme e submeta</h2><p>O resumo será gravado no repositório e distribuído aos responsáveis.</p><div className="summary-grid"><div><span>Torre</span><strong>{form.tower}</strong></div><div><span>Transacção</span><strong>{form.type}</strong></div><div className="span-2"><span>Pedido</span><strong>{form.subject || "Novo pedido operacional"}</strong></div><div><span>Fornecedor</span><strong>{form.supplier}</strong></div><div><span>Valor</span><strong>{form.value ? `AOA ${form.value}` : "A confirmar"}</strong></div><div><span>Centro de custo</span><strong>{form.costCenter}</strong></div><div><span>Prioridade</span><strong>{form.priority}</strong></div><div className="span-2"><span>Aprovador</span><strong>{form.approver}</strong></div></div><div className="confirmation-note"><CheckCircle2 /><div><strong>Pronto para iniciar</strong><p>A equipa Muntu receberá o pedido, validará os dados e actualizará o SLA em tempo real.</p></div></div></div>}
  </div><div className="wizard-footer"><Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : window.history.back()}>{step > 1 ? "Voltar" : "Cancelar"}</Button>{step < 4 ? <Button className="btn-burgundy" onClick={() => setStep(step + 1)} disabled={step === 2 && !form.subject}>Continuar <ArrowRight /></Button> : <Button className="btn-burgundy" onClick={submit}>Submeter pedido <CheckCircle2 /></Button>}</div></section></>;
}

function Approvals({ requests, onAction, onSelect }: { requests: RequestItem[]; onAction: (id: string, action: "approve" | "reject") => void; onSelect: (request: RequestItem) => void }) { return <><PageHeader kicker="MATRIZ DE AUTORIDADE" title="Aprovações" description="Decida com contexto, evidência e impacto visíveis." /><div className="approval-list">{requests.length ? requests.map((request) => <article key={request.id} className="approval-item"><div className="approval-main"><span className="priority-flag"><AlertTriangle /></span><div><small>{request.id} • {request.tower}</small><h2>{request.subject}</h2><p>{request.supplier} • {request.costCenter} • submetido {request.submitted}</p></div></div><div className="approval-value"><small>VALOR TOTAL</small><strong>{money(request.value)}</strong><span className={statusClass(request.status)}>{request.sla}</span></div><div className="approval-actions"><Button variant="outline" onClick={() => onSelect(request)}><Eye /> Ver dossier</Button><Button variant="outline" className="reject-button" onClick={() => onAction(request.id, "reject")}><XCircle /> Devolver</Button><Button className="btn-green" onClick={() => onAction(request.id, "approve")}><Check /> Aprovar</Button></div></article>) : <div className="empty-state panel"><CheckCircle2 /><h3>Sem aprovações pendentes</h3><p>Todos os itens foram decididos.</p></div>}</div></>; }

function Suppliers({ search, suppliers, onInvite }: { search: string; suppliers: Supplier[]; onInvite: () => void }) { const list = suppliers.filter((supplier) => supplier.name.toLowerCase().includes(search.toLowerCase())); const passportAvg = suppliers.length ? Math.round(suppliers.reduce((sum, item) => sum + item.passport, 0) / suppliers.length) : 0; return <><PageHeader kicker="SUPPLIER PASSPORT" title="Fornecedores" description="Onboarding, compliance, conteúdo local, risco e desempenho numa única vista." action={<Button className="btn-burgundy" onClick={onInvite}><Plus /> Convidar fornecedor</Button>} /><section className="supplier-summary"><article><Users /><div><strong>{suppliers.length}</strong><span>Fornecedores registados</span></div></article><article><ShieldCheck /><div><strong>{passportAvg}%</strong><span>Passport médio</span></div></article><article><Globe2 /><div><strong>{suppliers.filter((item) => item.status === "Activo").length}</strong><span>Fornecedores activos</span></div></article><article><AlertTriangle /><div><strong>{suppliers.filter((item) => item.status === "Revisão" || item.status === "Documentos").length}</strong><span>Revisões pendentes</span></div></article></section><section className="panel"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Fornecedor</TableHead><TableHead>Categoria</TableHead><TableHead>Supplier Passport</TableHead><TableHead>Conteúdo local</TableHead><TableHead>Risco</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow></TableHeader><TableBody>{list.map((supplier) => <TableRow key={supplier.id}><TableCell><strong>{supplier.name}</strong></TableCell><TableCell>{supplier.category}</TableCell><TableCell><div className="passport-cell"><Progress value={supplier.passport} /><span>{supplier.passport}%</span></div></TableCell><TableCell>{supplier.local}</TableCell><TableCell><span className={supplier.risk === "Baixo" ? "risk-low" : "risk-medium"}>{supplier.risk}</span></TableCell><TableCell><span className={statusClass(supplier.status)}>{supplier.status}</span></TableCell><TableCell><Button size="icon-sm" variant="ghost" onClick={() => toast.info(`Supplier Passport: ${supplier.name}`)}><Eye /></Button></TableCell></TableRow>)}</TableBody></Table></div></section></>; }

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

function PurchaseOrders({ purchaseOrders }: { purchaseOrders: PurchaseOrder[] }) { return <><PageHeader kicker="PURCHASE ORDER CONTROL TOWER" title="Ordens de compra" description="Emissão, confirmação, expediting, alterações e entrega controlados ponta-a-ponta." action={<Button variant="outline"><Download /> Exportar mapa</Button>} /><section className="panel"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>PO</TableHead><TableHead>Fornecedor</TableHead><TableHead>Descrição</TableHead><TableHead>Valor AOA</TableHead><TableHead>Estado</TableHead><TableHead>Próxima acção</TableHead><TableHead /></TableRow></TableHeader><TableBody>{purchaseOrders.map((po) => <TableRow key={po.id}><TableCell><strong>{po.id}</strong></TableCell><TableCell>{po.supplier}</TableCell><TableCell>{po.description}</TableCell><TableCell>{money(po.value)}</TableCell><TableCell><span className={statusClass(po.status)}>{po.status}</span></TableCell><TableCell>{po.nextAction}</TableCell><TableCell><Button size="icon-sm" variant="ghost" onClick={() => toast.info(`Linha temporal de ${po.id}`)}><Eye /></Button></TableCell></TableRow>)}</TableBody></Table></div></section></>; }

function Receipts({ receipts, onConfirm }: { receipts: Receipt[]; onConfirm: (id: number) => void }) { return <><PageHeader kicker="GOODS & SERVICE RECEIPT" title="Recepções" description="Confirme quantidade, qualidade, evidência e data para desbloquear a factura." /><div className="receipt-grid">{receipts.map((item) => <article className="receipt-card" key={item.id}><div><span className="receipt-icon"><PackageCheck /></span><span className={statusClass(item.status)}>{item.status}</span></div><small>{item.po}</small><h2>{item.description}</h2><p>{item.supplier}</p><strong>{money(item.value)}</strong><div className="receipt-progress"><Progress value={item.progress} /><span>{item.progress}% entregue</span></div><Button className={item.progress === 100 && item.status !== "Confirmada" ? "btn-burgundy" : ""} variant={item.progress === 100 && item.status !== "Confirmada" ? "default" : "outline"} disabled={item.status === "Confirmada"} onClick={() => item.progress === 100 ? onConfirm(item.id) : toast.info("Evidência aberta")}>{item.status === "Confirmada" ? "Recepção confirmada" : item.progress === 100 ? "Confirmar recepção" : "Ver evidência"}</Button></article>)}</div></>; }

function Invoices({ search, invoices }: { search: string; invoices: Invoice[] }) { const list = invoices.filter((invoice) => [invoice.id, invoice.supplier, invoice.po, invoice.status].some((item) => item.toLowerCase().includes(search.toLowerCase()))); const touchless = invoices.length ? Math.round((invoices.filter((item) => item.match === "3-way match").length / invoices.length) * 100) : 0; return <><PageHeader kicker="ACCOUNTS PAYABLE" title="Facturas & match" description="Recepção digital, validação fiscal, 2/3-way match e fila de excepções." action={<Button className="btn-burgundy" onClick={() => toast.success("Factura de demonstração carregada")}><UploadCloud /> Carregar factura</Button>} /><section className="match-summary"><article><FileCheck2 /><div><strong>{touchless}%</strong><span>Touchless match</span></div></article><article><Clock3 /><div><strong>1,8 dias</strong><span>Ciclo médio</span></div></article><article><AlertTriangle /><div><strong>{invoices.filter((item) => item.status === "Excepção").length}</strong><span>Excepções abertas</span></div></article></section><section className="panel"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Factura</TableHead><TableHead>Fornecedor</TableHead><TableHead>PO</TableHead><TableHead>Valor</TableHead><TableHead>Match</TableHead><TableHead>Estado</TableHead><TableHead>Vencimento</TableHead><TableHead /></TableRow></TableHeader><TableBody>{list.map((invoice) => <TableRow key={invoice.id}><TableCell><strong>{invoice.id}</strong></TableCell><TableCell>{invoice.supplier}</TableCell><TableCell>{invoice.po}</TableCell><TableCell>{money(invoice.value)}</TableCell><TableCell>{invoice.match}</TableCell><TableCell><span className={statusClass(invoice.status)}>{invoice.status}</span></TableCell><TableCell>{invoice.due}</TableCell><TableCell><Button size="icon-sm" variant="ghost" onClick={() => toast.info(`Imagem e match de ${invoice.id}`)}><Eye /></Button></TableCell></TableRow>)}</TableBody></Table></div></section></>; }

function Exceptions({ items, onResolve }: { items: ExceptionItem[]; onResolve: (id: string) => void }) { return <><PageHeader kicker="RESOLUÇÃO HUMANA" title="Excepções" description="A tecnologia identifica. O Muntu coordena pessoas, evidência e decisão até ao encerramento." /><div className="exception-list">{items.map((item) => <article key={item.id} className={item.resolved ? "resolved" : ""}><span className="exception-severity"><AlertTriangle /></span><div className="exception-copy"><small>{item.id} • {item.ref}</small><h2>{item.title}</h2><p>Responsável: <strong>{item.owner}</strong> • Idade: <strong>{item.age}</strong> • Impacto: <strong>{item.impact}</strong></p></div><div className="exception-actions">{item.resolved ? <span className="resolved-label"><CheckCircle2 /> Resolvida</span> : <><Button variant="outline" onClick={() => toast.info(`Dossier ${item.id} aberto`)}><Eye /> Evidência</Button><Button className="btn-burgundy" onClick={() => onResolve(item.id)}>Resolver <ArrowRight /></Button></>}</div></article>)}{items.length === 0 && <div className="empty-state panel"><CheckCircle2 /><h3>Sem excepções</h3><p>Não existem excepções registadas.</p></div>}</div></>; }

function Payments({ batches, onRelease }: { batches: PaymentBatch[]; onRelease: (id: string) => void }) { return <><PageHeader kicker="PAYMENT READINESS" title="Pagamentos" description="O Muntu prepara o lote, controla a evidência e o cliente mantém a libertação bancária." /><section className="payment-banner"><div><ShieldCheck /><span><strong>Segregação de funções preservada.</strong> Muntu prepara e recomenda; Finanças valida e liberta no banco.</span></div><Badge>0 RISCO DE CRÉDITO</Badge></section><div className="payment-grid">{batches.map((batch) => { const isReleased = batch.released || batch.status === "Pago"; return <article key={batch.id}><div><span className="payment-icon"><WalletCards /></span><span className={statusClass(isReleased ? "Pago" : "Aprovação")}>{isReleased ? "Pago" : "Pronto para libertar"}</span></div><small>{batch.id}</small><h2>{money(batch.value)}</h2><p>{batch.count} facturas • Data proposta: {batch.date}</p><div className="payment-checks"><span><CheckCircle2 /> Match concluído</span><span><CheckCircle2 /> Aprovações completas</span><span><CheckCircle2 /> Dados bancários verificados</span></div><Button className={isReleased ? "" : "btn-burgundy"} variant={isReleased ? "outline" : "default"} disabled={isReleased} onClick={() => onRelease(batch.id)}>{isReleased ? "Comprovativo disponível" : "Libertar para o banco"}</Button></article>; })}</div></>; }

function Reports({ requests, exceptions }: { requests: RequestItem[]; exceptions: ExceptionItem[] }) {
  const months = [{ month: "Mar", requests: 62, sla: 88 }, { month: "Abr", requests: 74, sla: 91 }, { month: "Mai", requests: 69, sla: 93 }, { month: "Jun", requests: 81, sla: 94 }, { month: "Jul", requests: 92, sla: 95 }, { month: "Ago", requests: requests.length || 86, sla: 96 }];
  const openExceptions = exceptions.filter((item) => !item.resolved).length;
  return <><PageHeader kicker="CONTROL TOWER ANALYTICS" title="Relatórios" description="Performance operacional, spend, conteúdo local, risco e oportunidades de melhoria." action={<div className="header-actions"><NativeSelect defaultValue="Agosto 2026"><NativeSelectOption>Agosto 2026</NativeSelectOption><NativeSelectOption>Julho 2026</NativeSelectOption><NativeSelectOption>Q2 2026</NativeSelectOption></NativeSelect><Button variant="outline"><Download /> PDF</Button></div>} /><section className="metric-grid report-metrics"><article><div><small>CICLO REQ-TO-PO</small><strong>2,4d</strong><p><b>−18%</b> vs. baseline</p></div></article><article><div><small>TOUCHLESS INVOICE</small><strong>87%</strong><p><b>+9 pp</b> no trimestre</p></div></article><article><div><small>SPEND LOCAL</small><strong>82%</strong><p>AOA 1,24 mil M</p></div></article><article><div><small>EXCEPÇÕES ABERTAS</small><strong>{openExceptions}</strong><p>Fila activa</p></div></article></section><section className="reports-grid"><article className="panel"><div className="panel-heading"><div><p>TENDÊNCIA</p><h2>Volume e SLA</h2></div><Badge className="badge-positive">Meta atingida</Badge></div><div className="bar-chart">{months.map((item) => <div key={item.month}><span className="bar-value">{item.requests}</span><div className="bar" style={{ height: `${item.requests * 2.4}px` }}><i style={{ height: `${item.sla}%` }} /></div><strong>{item.month}</strong></div>)}</div><div className="chart-legend"><span><i className="legend-burgundy" /> Pedidos</span><span><i className="legend-gold" /> SLA %</span></div></article><article className="panel"><div className="panel-heading"><div><p>DRIVERS</p><h2>Excepções por causa</h2></div></div><div className="cause-list">{[["Recepção em falta", 34], ["Preço divergente", 26], ["Dados fiscais", 18], ["Quantidade", 13], ["Outros", 9]].map(([label, value]) => <div key={label as string}><span>{label}</span><Progress value={value as number} /><strong>{value}%</strong></div>)}</div><div className="insight-box"><Sparkles /><span><strong>Insight Muntu</strong>Confirmar recepções no telemóvel pode eliminar 34% das excepções actuais.</span></div></article></section></>;
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

type SsoDraft = { authMethod: string; ssoIssuerUrl: string; ssoClientId: string; ssoClientSecret: string };

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
              { authMethod: company.authMethod, ssoIssuerUrl: company.ssoIssuerUrl ?? "", ssoClientId: company.ssoClientId ?? "", ssoClientSecret: "" },
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
      };
      if (draft.ssoClientSecret) body.ssoClientSecret = draft.ssoClientSecret;
      const { company: updated } = await api<{ company: CompanyRow }>(`/api/admin/companies/${company.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setCompaniesList((current) => current.map((row) => (row.id === company.id ? updated : row)));
      updateDraft(company.id, "ssoClientSecret", "");
      toast.success(`SSO de ${updated.name} actualizado`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar o SSO");
    } finally {
      setSavingId(null);
    }
  };

  return <article className="panel">
    <div className="panel-heading"><div><p>IDENTIDADE</p><h2>SSO por empresa</h2></div></div>
    <p className="muted">Cada empresa cliente escolhe o método de login pelo domínio do e-mail. SSO só produz um login funcional com credenciais reais de um fornecedor de identidade compatível com OpenID Connect Discovery — <code>redirect_uri</code> a configurar no IdP: <code>{typeof window !== "undefined" ? window.location.origin : ""}/api/auth/sso/callback</code>.</p>
    {companiesList.map((company) => {
      const draft = drafts[company.id] ?? { authMethod: "password", ssoIssuerUrl: "", ssoClientId: "", ssoClientSecret: "" };
      return <div key={company.id} className="sso-company-row">
        <div className="panel-heading"><div><p>{company.domain}</p><h3>{company.name}</h3></div></div>
        <div className="admin-fields">
          <label>Método de login<NativeSelect value={draft.authMethod} onChange={(event) => updateDraft(company.id, "authMethod", event.target.value)} className="field-control"><NativeSelectOption value="password">E-mail e palavra-passe</NativeSelectOption><NativeSelectOption value="sso">SSO (OIDC)</NativeSelectOption></NativeSelect></label>
          <label>Issuer URL<Input value={draft.ssoIssuerUrl} onChange={(event) => updateDraft(company.id, "ssoIssuerUrl", event.target.value)} placeholder="https://login.microsoftonline.com/<tenant-id>/v2.0" /></label>
          <label>Client ID<Input value={draft.ssoClientId} onChange={(event) => updateDraft(company.id, "ssoClientId", event.target.value)} /></label>
          <label>Client Secret<Input type="password" value={draft.ssoClientSecret} onChange={(event) => updateDraft(company.id, "ssoClientSecret", event.target.value)} placeholder={company.hasSsoClientSecret ? "•••••••• (definido — deixe em branco para manter)" : "Não definido"} /></label>
        </div>
        <Button variant="outline" disabled={savingId === company.id} onClick={() => save(company)}>{savingId === company.id ? "A guardar…" : "Guardar SSO"}</Button>
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
      <article className="panel integration-panel"><div className="panel-heading"><div><p>ROADMAP</p><h2>Integrações planeadas</h2></div></div>{[["ERP Financeiro", "SAP S/4HANA"], ["Banco", "Ficheiro ISO 20022"], ["Fiscalidade", "AGT / SAF-T"], ["Identidade", "Microsoft Entra ID (via SSO acima)"]].map((item) => <div key={item[0]}><span><Network /></span><div><strong>{item[0]}</strong><small>{item[1]}</small></div><b className={statusClass("Planeado")}>Planeado</b></div>)}</article>
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

function UsersAdmin() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ users: list }, { suppliers: supplierList }] = await Promise.all([
          api<{ users: AdminUserRow[] }>("/api/admin/users"),
          api<{ suppliers: SupplierOption[] }>("/api/suppliers"),
        ]);
        setRows(list);
        setSupplierOptions(supplierList);
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

  return <><PageHeader kicker="GESTÃO DE PLATAFORMA" title="Utilizadores" description="Conceda ou retire permissões — o System Admin é o único nível que pode alterar isto." /><section className="panel"><div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Utilizador</TableHead><TableHead>E-mail</TableHead><TableHead>Empresa</TableHead><TableHead>Nível de acesso</TableHead><TableHead>Fornecedor</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><strong>{row.name}</strong></TableCell><TableCell>{row.email}</TableCell><TableCell>{row.companyName ?? "—"}</TableCell><TableCell><NativeSelect value={row.accessLevel} disabled={savingId === row.id} onChange={(event) => changeAccessLevel(row.id, event.target.value as AccessLevel)} className="field-control">{(Object.keys(ACCESS_LEVEL_LABELS) as AccessLevel[]).map((level) => <NativeSelectOption key={level} value={level}>{ACCESS_LEVEL_LABELS[level]}</NativeSelectOption>)}</NativeSelect></TableCell><TableCell>{row.accessLevel === "supplier" ? <NativeSelect value={row.supplierId ?? ""} disabled={savingId === row.id} onChange={(event) => changeSupplier(row.id, row.accessLevel, event.target.value ? Number(event.target.value) : null)} className="field-control"><NativeSelectOption value="">Por ligar…</NativeSelectOption>{supplierOptions.map((supplier) => <NativeSelectOption key={supplier.id} value={supplier.id}>{supplier.name}</NativeSelectOption>)}</NativeSelect> : row.supplierName ?? "—"}</TableCell></TableRow>)}</TableBody></Table>{!loading && rows.length === 0 && <div className="empty-state"><Users /><h3>Sem utilizadores</h3></div>}</div></section></>;
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
      <div className="panel-heading"><div><p>CONFIGURAÇÃO</p><h2>Retainer por empresa</h2></div></div>
      <div className="responsive-table"><Table><TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Domínio</TableHead><TableHead>Retainer mensal (AOA)</TableHead></TableRow></TableHeader><TableBody>{companiesList.map((company) => <TableRow key={company.id}><TableCell><strong>{company.name}</strong></TableCell><TableCell>{company.domain}</TableCell><TableCell><Input type="number" min={0} step={1} defaultValue={company.retainerAmount} disabled={savingCompanyId === company.id} onBlur={(event) => { const value = Number(event.target.value); if (value !== company.retainerAmount) saveRetainer(company.id, value); }} className="rate-input" /></TableCell></TableRow>)}</TableBody></Table>{!loading && companiesList.length === 0 && <div className="empty-state"><Landmark /><h3>Sem empresas registadas</h3></div>}</div>
    </section>
  </>;
}

function RequestDetail({ request, onAction, canDecide }: { request: RequestItem; onAction: (id: string, action: "approve" | "reject") => void; canDecide: boolean }) { return <><SheetHeader><p className="kicker">DOSSIER DA TRANSACÇÃO</p><SheetTitle>{request.id}</SheetTitle><SheetDescription>{request.subject}</SheetDescription></SheetHeader><div className="sheet-body"><div className="sheet-status"><span className={statusClass(request.status)}>{request.status}</span><span className={request.sla.includes("Vencido") ? "text-danger" : ""}><Clock3 /> {request.sla}</span></div><div className="sheet-value"><small>VALOR</small><strong>{money(request.value)}</strong><p>{request.supplier} • {request.costCenter}</p></div><div className="timeline"><h3>Workflow</h3>{stages.map((stage, index) => <div key={stage} className={index < request.stage ? "complete" : index === request.stage ? "current" : ""}><span>{index < request.stage ? <Check /> : index + 1}</span><div><strong>{stage}</strong><small>{index < request.stage ? "Concluído" : index === request.stage ? "Em curso • Muntu Operations" : "A aguardar"}</small></div></div>)}</div><div className="sheet-documents"><h3>Documentos</h3><button><FileText /><span><strong>Requisição e justificativo.pdf</strong><small>Actualizado {request.submitted}</small></span><Download /></button><button><FileText /><span><strong>Proposta do fornecedor.pdf</strong><small>Versão validada</small></span><Download /></button></div><div className="audit-note"><ShieldCheck /><span><strong>Auditoria activa</strong>Todas as decisões, alterações e anexos ficam registados.</span></div></div>{canDecide && request.status === "Aprovação" && <div className="sheet-actions"><Button variant="outline" className="reject-button" onClick={() => onAction(request.id, "reject")}><XCircle /> Devolver</Button><Button className="btn-green" onClick={() => onAction(request.id, "approve")}><Check /> Aprovar</Button></div>}</>; }

export default function HomePage() {
  const [screen, setScreen] = useState<"public" | "login" | "portal">("public");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [ssoError, setSsoError] = useState<string | undefined>(undefined);
  const [resetToken, setResetToken] = useState<string | undefined>(undefined);

  const navigate = (next: "public" | "login" | "portal") => { setScreen(next); window.history.replaceState(null, "", next === "public" ? window.location.pathname : `#${next}`); window.scrollTo({ top: 0, behavior: "smooth" }); };

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    const errorFromSso = params.get("sso_error");
    const tokenFromReset = params.get("reset_token");
    if (errorFromSso || tokenFromReset) {
      if (errorFromSso) setSsoError(errorFromSso);
      if (tokenFromReset) setResetToken(tokenFromReset);
      window.history.replaceState(null, "", window.location.pathname + "#login");
    }
    (async () => {
      try {
        // Fetch directo (não usa api()) para não disparar o evento de
        // "sessão expirada" numa visita sem sessão nenhuma — um 401 aqui
        // é o resultado normal de ainda não ter feito login.
        const response = await fetch("/api/auth/me");
        if (response.ok && !errorFromSso && !tokenFromReset) {
          const { user: restored } = (await response.json()) as { user: AuthUser };
          setUser(restored);
          setScreen("portal");
        } else if (hash === "#login" || errorFromSso || tokenFromReset) {
          setScreen("login");
        }
      } catch {
        if (hash === "#login" || errorFromSso || tokenFromReset) setScreen("login");
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
    return <><Toaster richColors position="top-right" /><Login onBack={() => navigate("public")} onSuccess={(loggedUser) => { setUser(loggedUser); navigate("portal"); }} initialError={ssoError} resetToken={resetToken} onResetTokenConsumed={() => setResetToken(undefined)} /></>;
  }
  if (screen === "portal" && user) {
    return <Portal user={user} onLogout={logout} />;
  }
  return <PublicSite onLogin={() => navigate("login")} />;
}
