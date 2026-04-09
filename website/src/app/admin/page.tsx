"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import MortheLoader from "@/components/MortheLoader";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface Client {
  id: number;
  name: string;
  code: string;
  drive_gallery_url: string | null;
  session_date: string | null;
  max_selections: number;
  status: string;
  created_at: string;
  notes: string | null;
  selection_count?: number;
  selection_locked?: number;
  selection_unlock_count?: number;
  selection_finalized_at?: string | null;
  delivery_released?: number;
  delivery_status?: string | null;
  delivery_message?: string | null;
  delivery_zip_size?: number | null;
  delivery_generated_at?: string | null;
  delivery_downloaded?: number;
}

interface DeliveryStatus {
  status: "idle" | "generating" | "ready" | "error";
  released: boolean;
  message: string;
  zip_size: number | null;
  generated_at: string | null;
  downloaded: boolean;
  downloaded_at: string | null;
  progress: { stage: string; processed: number; total: number; error: string | null } | null;
}

interface DeliveryPreviewFile {
  id: string;
  name: string;
  mimeType: string;
  relDir: string;
  url: string;
}

interface Selection {
  image_id: string;
  image_name: string;
  selected_at: string;
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:        { label: "Aguardando",    color: "#888",    bg: "#1a1a1a" },
  syncing:        { label: "Sincronizando", color: "#a78bfa", bg: "#1a1028" },
  gallery_ready:  { label: "Pronta",        color: "#60a5fa", bg: "#0f1a2e" },
  selecting:      { label: "Selecionando",  color: "#fbbf24", bg: "#1a1800" },
  selection_done: { label: "Concluído",     color: "#4ade80", bg: "#0a1a0f" },
};

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("morthe_admin_token") : null;
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

type View = "dashboard" | "client" | "new";

export default function AdminDashboard() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saEmail, setSaEmail] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState("");
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [syncProgressMap, setSyncProgressMap] = useState<Record<number, { percent: number; processed: number; total: number }>>({});

  // ── Data fetching ──
  const fetchClients = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/admin/clients`, { headers: getAuthHeaders() });
      if (r.status === 401) { router.push("/cliente"); return; }
      if (r.ok) setClients(await r.json());
    } finally { setLoading(false); }
  }, [router]);

  const fetchSaEmail = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/admin/service-account-email`, { headers: getAuthHeaders() });
      if (r.ok) setSaEmail((await r.json()).email);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("morthe_admin_token");
    if (!token) { router.push("/cliente"); return; }
    fetchClients();
    fetchSaEmail();
  }, [fetchClients, fetchSaEmail, router]);

  // ── Helpers ──
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1800);
  }

  function selectClient(id: number) {
    setSelectedClientId(id);
    setView("client");
    setSidebarOpen(false);
  }

  function handleLogout() {
    sessionStorage.removeItem("morthe_admin_token");
    router.push("/cliente");
  }

  const selectedClient = clients.find(c => c.id === selectedClientId) || null;

  // ── Sync with polling ──
  async function handleSync(id: number) {
    await fetch(`${API}/api/admin/clients/${id}/sync`, { method: "POST", headers: getAuthHeaders() });
    showToast("Sync iniciado...");
    fetchClients();

    // Start polling every 3s with progress
    if (syncPollRef.current) clearInterval(syncPollRef.current);
    syncPollRef.current = setInterval(async () => {
      const r = await fetch(`${API}/api/admin/clients`, { headers: getAuthHeaders() });
      if (r.ok) {
        const data: Client[] = await r.json();
        setClients(data);
        const client = data.find(c => c.id === id);

        // Fetch sync progress for this client
        if (client?.status === "syncing") {
          try {
            const pr = await fetch(`${API}/api/client/sync-progress?code=${encodeURIComponent(client.code)}`);
            if (pr.ok) {
              const pg = await pr.json();
              setSyncProgressMap(prev => ({ ...prev, [id]: { percent: pg.percent, processed: pg.processed, total: pg.total } }));
            }
          } catch { /* ignore */ }
        }

        if (client && client.status !== "syncing") {
          if (syncPollRef.current) clearInterval(syncPollRef.current);
          syncPollRef.current = null;
          setSyncProgressMap(prev => { const n = { ...prev }; delete n[id]; return n; });
          showToast("Sync concluído!");
        }
      }
    }, 3000);
  }

  useEffect(() => {
    return () => { if (syncPollRef.current) clearInterval(syncPollRef.current); };
  }, []);

  // ── Dashboard stats ──
  const stats = {
    total: clients.length,
    pending: clients.filter(c => c.status === "pending" || c.status === "syncing").length,
    selecting: clients.filter(c => c.status === "selecting" || c.status === "gallery_ready").length,
    done: clients.filter(c => c.status === "selection_done").length,
  };

  if (loading) return <MortheLoader fullscreen />;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#09090b", color: "#fff" }}>
      {/* ── Sidebar ── */}
      {/* Mobile overlay */}
      {sidebarOpen && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 80 }} onClick={() => setSidebarOpen(false)} />}

      <aside style={{
        width: 260, flexShrink: 0, background: "#0f0f0f", borderRight: "1px solid #1a1a1a",
        display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0,
        // Mobile: fixed drawer
        ...(typeof window !== "undefined" && window.innerWidth < 768 ? {
          position: "fixed", left: sidebarOpen ? 0 : -270, zIndex: 90,
          transition: "left 0.3s ease-out", boxShadow: sidebarOpen ? "4px 0 20px rgba(0,0,0,0.5)" : "none",
        } : {}),
      }}>
        {/* Sidebar header */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.15em", color: "#555" }}>MORTHE ADMIN</span>
          <button onClick={handleLogout} style={{ background: "transparent", border: "none", color: "#555", fontSize: 12, cursor: "pointer" }} title="Sair">Sair</button>
        </div>

        {/* Nav */}
        <nav style={{ padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          <button
            onClick={() => { setView("dashboard"); setSidebarOpen(false); }}
            style={{ ...sideBtn, background: view === "dashboard" ? "#1a1a1a" : "transparent" }}
          >
            <span style={{ fontSize: 16 }}>◉</span> Dashboard
          </button>
          <button
            onClick={() => { setView("new"); setSidebarOpen(false); }}
            style={{ ...sideBtn, color: "#4ade80" }}
          >
            <span style={{ fontSize: 16 }}>+</span> Novo Cliente
          </button>
        </nav>

        {/* Client list */}
        <div style={{ padding: "4px 8px 8px", borderTop: "1px solid #1a1a1a", flex: 1, overflowY: "auto" }}>
          <p style={{ fontSize: 11, color: "#444", padding: "8px 8px 4px", fontWeight: 600, letterSpacing: "0.1em" }}>CLIENTES ({clients.length})</p>
          {clients.map(c => {
            const st = STATUS[c.status] ?? STATUS.pending;
            const isActive = view === "client" && selectedClientId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => selectClient(c.id)}
                style={{
                  ...sideBtn,
                  background: isActive ? "#1a1a1a" : "transparent",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Top bar (mobile) */}
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #1a1a1a", gap: 12 }}>
          <button onClick={() => setSidebarOpen(true)} style={{ background: "transparent", border: "1px solid #333", borderRadius: 6, width: 36, height: 36, color: "#888", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>☰</button>
          <span style={{ fontSize: 14, color: "#555", fontWeight: 600 }}>
            {view === "dashboard" ? "Dashboard" : view === "new" ? "Novo Cliente" : selectedClient?.name || ""}
          </span>
        </div>

        <div style={{ flex: 1, padding: "24px 20px", maxWidth: 900, width: "100%", margin: "0 auto", overflowY: "auto" }}>
          {view === "dashboard" && <DashboardView stats={stats} saEmail={saEmail} copied={copied} copy={copy} />}
          {view === "new" && <NewClientView onCreated={() => { fetchClients(); setView("dashboard"); showToast("Cliente criado com sucesso!"); }} />}
          {view === "client" && selectedClient && (
            <ClientDetailView
              key={selectedClient.id}
              client={selectedClient}
              onSync={() => handleSync(selectedClient.id)}
              onRefresh={fetchClients}
              onDelete={() => { fetchClients(); setView("dashboard"); showToast("Cliente removido."); }}
              copy={copy}
              copied={copied}
              showToast={showToast}
              syncProgressMap={syncProgressMap}
            />
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#222", color: "#fff", borderRadius: 8, padding: "10px 20px", fontSize: 13, zIndex: 300, boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>{toast}</div>}
    </div>
  );
}

// ─── Dashboard View ──────────────────────────────────────────────────────────

function DashboardView({ stats, saEmail, copied, copy }: { stats: { total: number; pending: number; selecting: number; done: number }; saEmail: string; copied: string; copy: (t: string, k: string) => void }) {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Dashboard</h1>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 32 }}>
        <StatCard label="Total" value={stats.total} color="#fff" />
        <StatCard label="Pendentes" value={stats.pending} color="#a78bfa" />
        <StatCard label="Selecionando" value={stats.selecting} color="#fbbf24" />
        <StatCard label="Concluídos" value={stats.done} color="#4ade80" />
      </div>

      {/* Service Account */}
      {saEmail && (
        <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: "16px 20px", marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>Service Account — compartilhe pastas do Drive como EDITOR:</p>
          <button
            onClick={() => copy(saEmail, "email")}
            style={{ background: "#0a0a0a", border: "1px solid #222", borderRadius: 8, padding: "10px 14px", color: "#60a5fa", fontSize: 13, cursor: "pointer", fontFamily: "monospace", width: "100%", textAlign: "left" }}
          >
            {saEmail} {copied === "email" ? "  ✓" : "  📋"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
      <p style={{ fontSize: 32, fontWeight: 700, color, marginBottom: 4 }}>{value}</p>
      <p style={{ fontSize: 12, color: "#555", fontWeight: 500 }}>{label}</p>
    </div>
  );
}

// ─── New Client View ─────────────────────────────────────────────────────────

function NewClientView({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", drive_gallery_url: "", session_date: "", max_selections: 20, notes: "" });
  const [urlStatus, setUrlStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [urlError, setUrlError] = useState("");
  const [formMsg, setFormMsg] = useState({ text: "", type: "" });
  const [submitting, setSubmitting] = useState(false);

  async function validateUrl() {
    if (!form.drive_gallery_url) { setUrlError("Cole o link primeiro."); setUrlStatus("error"); return; }
    setUrlStatus("checking");
    const r = await fetch(`${API}/api/admin/validate-folder?url=${encodeURIComponent(form.drive_gallery_url)}`, { headers: getAuthHeaders() });
    const d = await r.json();
    if (d.valid) setUrlStatus("ok");
    else { setUrlStatus("error"); setUrlError(d.error || "Pasta inacessível."); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg({ text: "", type: "" });
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/admin/clients`, {
        method: "POST", headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, session_date: form.session_date || null, notes: form.notes || null }),
      });
      const d = await r.json();
      if (!r.ok) setFormMsg({ text: d.detail || "Erro ao criar.", type: "error" });
      else onCreated();
    } finally { setSubmitting(false); }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Novo Cliente</h1>
      <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 600 }}>
        <Field label="Nome *">
          <input style={inp} required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="João Silva" />
        </Field>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Field label="Data da Sessão" style={{ flex: 1, minWidth: 160 }}>
            <input style={inp} type="date" value={form.session_date} onChange={e => setForm(p => ({ ...p, session_date: e.target.value }))} />
          </Field>
          <Field label="Máx. Seleções" style={{ width: 130 }}>
            <input style={inp} type="number" min={1} max={999} value={form.max_selections} onChange={e => setForm(p => ({ ...p, max_selections: Number(e.target.value) }))} />
          </Field>
        </div>

        <Field label="Link Google Drive *">
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inp, flex: 1 }} required value={form.drive_gallery_url} onChange={e => { setForm(p => ({ ...p, drive_gallery_url: e.target.value })); setUrlStatus("idle"); }} placeholder="https://drive.google.com/drive/folders/..." />
            <button type="button" onClick={validateUrl} disabled={urlStatus === "checking"} style={btnSm}>{urlStatus === "checking" ? "..." : "Validar"}</button>
          </div>
          {urlStatus === "ok" && <span style={{ color: "#4ade80", fontSize: 12, marginTop: 4 }}>Pasta verificada com sucesso.</span>}
          {urlStatus === "error" && <span style={{ color: "#f87171", fontSize: 12, marginTop: 4 }}>{urlError}</span>}
        </Field>

        <Field label="Notas (opcional)">
          <input style={inp} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observações internas..." />
        </Field>

        {formMsg.text && <p style={{ color: formMsg.type === "error" ? "#f87171" : "#4ade80", fontSize: 14 }}>{formMsg.text}</p>}
        <button style={{ background: "#fff", color: "#000", border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" }} type="submit" disabled={submitting}>
          {submitting ? "Criando..." : "+ Cadastrar Cliente"}
        </button>
      </form>
    </div>
  );
}

// ─── Client Detail View ──────────────────────────────────────────────────────

function ClientDetailView({ client, onSync, onRefresh, onDelete, copy, copied, showToast, syncProgressMap }: {
  client: Client;
  onSync: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  copy: (t: string, k: string) => void;
  copied: string;
  showToast: (msg: string) => void;
  syncProgressMap: Record<number, { percent: number; processed: number; total: number }>;
}) {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [selLoading, setSelLoading] = useState(false);
  const [maxInput, setMaxInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const st = STATUS[client.status] ?? STATUS.pending;

  useEffect(() => {
    setSelLoading(true);
    fetch(`${API}/api/admin/clients/${client.id}/selections`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { selections: [] })
      .then(d => setSelections(d.selections || []))
      .finally(() => setSelLoading(false));
  }, [client.id, client.status]);

  async function handleLock() {
    await fetch(`${API}/api/admin/clients/${client.id}/lock`, { method: "POST", headers: getAuthHeaders() });
    onRefresh();
    showToast("Seleção travada.");
  }

  async function handleUnlock() {
    await fetch(`${API}/api/admin/clients/${client.id}/unlock`, { method: "POST", headers: getAuthHeaders() });
    onRefresh();
    showToast("Seleção liberada.");
  }

  async function handleAdjustMax() {
    const val = parseInt(maxInput);
    if (!val || val < 1) return;
    await fetch(`${API}/api/admin/clients/${client.id}/max-selections`, {
      method: "PUT", headers: getAuthHeaders(),
      body: JSON.stringify({ max_selections: val }),
    });
    setMaxInput("");
    onRefresh();
    showToast(`Limite ajustado para ${val}.`);
  }

  async function handleDeleteConfirm() {
    await fetch(`${API}/api/admin/clients/${client.id}`, { method: "DELETE", headers: getAuthHeaders() });
    onDelete();
  }

  const clientUrl = typeof window !== "undefined" ? `${window.location.origin}/cliente/${client.code}` : "";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>{client.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => copy(client.code, "code")} style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, padding: "4px 12px", color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "monospace" }}>
              {client.code} {copied === "code" ? " ✓" : " 📋"}
            </button>
            <span style={{ color: st.color, fontSize: 13, fontWeight: 600, background: st.bg, padding: "3px 10px", borderRadius: 6 }}>
              {st.label}
            </span>
            {!!client.selection_locked && <span style={{ color: "#f87171", fontSize: 12 }}>Travado</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => copy(clientUrl, "link")} style={btnSm}>
            {copied === "link" ? "✓ Copiado" : "Copiar link"}
          </button>
          {client.drive_gallery_url && (
            <a href={client.drive_gallery_url} target="_blank" rel="noreferrer" style={{ ...btnSm, textDecoration: "none", color: "#60a5fa" }}>Drive</a>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 24 }}>
        <MiniCard label="Seleções" value={`${client.selection_count ?? 0}/${client.max_selections}`} />
        <MiniCard label="Sessão" value={client.session_date ? new Date(client.session_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"} />
        <MiniCard label="Reaperturas" value={`${client.selection_unlock_count ?? 0}/3`} />
        <MiniCard label="Criado em" value={client.created_at ? new Date(client.created_at).toLocaleDateString("pt-BR") : "—"} />
      </div>

      {client.notes && <p style={{ color: "#555", fontSize: 13, marginBottom: 20, padding: "10px 14px", background: "#111", borderRadius: 8, border: "1px solid #1a1a1a" }}>{client.notes}</p>}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 32 }}>
        <button
          onClick={onSync}
          disabled={client.status === "syncing"}
          style={{ ...btnAction, borderColor: "#a78bfa", color: "#a78bfa" }}
        >
          {client.status === "syncing" ? (
            <>
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite", marginRight: 6 }}>↻</span>
              {syncProgressMap[client.id]
                ? `${syncProgressMap[client.id].percent}% (${syncProgressMap[client.id].processed}/${syncProgressMap[client.id].total})`
                : "Sincronizando..."}
            </>
          ) : "↻ Sincronizar"}
        </button>

        {client.selection_locked
          ? <button onClick={handleUnlock} style={{ ...btnAction, borderColor: "#4ade80", color: "#4ade80" }}>Liberar seleção</button>
          : <button onClick={handleLock} style={{ ...btnAction, borderColor: "#fbbf24", color: "#fbbf24" }}>Travar seleção</button>
        }

        <div style={{ display: "flex", gap: 4 }}>
          <input
            style={{ ...inp, width: 70, padding: "6px 10px", fontSize: 13 }}
            type="number"
            placeholder={String(client.max_selections)}
            value={maxInput}
            onChange={e => setMaxInput(e.target.value)}
          />
          <button onClick={handleAdjustMax} style={btnSm}>Ajustar limite</button>
        </div>

        <button onClick={() => setConfirmDelete(true)} style={{ ...btnAction, borderColor: "#333", color: "#f87171" }}>Remover</button>
      </div>

      {/* Entrega */}
      <DeliverySection clientId={client.id} clientName={client.name} showToast={showToast} />

      {/* Selections */}
      <div style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: "#888" }}>
          Seleções ({selections.length})
        </h2>
        {selLoading ? (
          <p style={{ color: "#555", fontSize: 13 }}>Carregando...</p>
        ) : selections.length === 0 ? (
          <p style={{ color: "#444", fontSize: 13 }}>Nenhuma foto selecionada ainda.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
            {selections.map((sel, i) => (
              <a
                key={i}
                href={`https://drive.google.com/file/d/${sel.image_id}/view`}
                target="_blank"
                rel="noreferrer"
                style={{ aspectRatio: "1", borderRadius: 8, overflow: "hidden", display: "block", position: "relative", border: "1px solid #222", background: "#111" }}
                title={sel.image_name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://drive.google.com/thumbnail?id=${sel.image_id}&sz=w200`}
                  alt={sel.image_name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  loading="lazy"
                />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.8))", padding: "4px 6px" }}>
                  <span style={{ fontSize: 10, color: "#ccc" }}>{sel.image_name}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(false); }}>
          <div style={{ background: "#111", border: "1px solid #333", borderRadius: 16, padding: "28px 24px", maxWidth: 380, width: "100%" }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: "#fff" }}>Remover cliente?</h3>
            <p style={{ color: "#888", fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
              &quot;{client.name}&quot; será removido permanentemente junto com seus thumbnails em cache.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, background: "transparent", border: "1px solid #333", borderRadius: 8, color: "#888", padding: 11, fontSize: 14, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleDeleteConfirm} style={{ flex: 1, background: "#f87171", border: "none", borderRadius: 8, color: "#fff", padding: 11, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 10, padding: "14px 12px" }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{value}</p>
      <p style={{ fontSize: 11, color: "#555" }}>{label}</p>
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
      <span style={{ fontSize: 12, color: "#666", fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

// ─── Delivery Section ────────────────────────────────────────────────────────

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

type DiagnoseSubfolder = {
  id: string;
  name: string;
  name_repr?: string;
  name_bytes_hex?: string;
  matches_entrega_filter?: boolean;
};

type DeliveryProgressPayload = {
  stage?: string;
  processed?: number;
  total?: number;
  total_bytes?: number;
  bytes_done?: number;
  current_file?: string | null;
  current_file_bytes?: number;
  current_file_total?: number;
  started_at?: number;
  last_tick?: number;
  error?: string | null;
  log?: string[];
};

function DiagnoseView({ data }: { data: Record<string, unknown> }) {
  const get = <T,>(k: string): T | undefined => data[k] as T | undefined;
  const backendVersion = get<string>("backend_version");
  const clientName = get<string>("client_name");
  const driveId = get<string>("drive_gallery_id");
  const saEmail = get<string>("service_account_email");
  const parentAccess = get<boolean | null>("parent_access");
  const parentName = get<string>("parent_name");
  const parentDriveId = get<string>("parent_drive_id");
  const subfolders = (get<DiagnoseSubfolder[]>("subfolders") ?? []);
  const entregaMatch = get<string | null>("entrega_match");
  const partialMatches = get<DiagnoseSubfolder[]>("partial_matches") ?? [];
  const error = get<string | null>("error");
  const deliveryStatus = get<string>("delivery_status");
  const progress = get<DeliveryProgressPayload | null>("delivery_progress");

  const row: React.CSSProperties = { display: "flex", gap: 10, fontSize: 12, padding: "4px 0", borderBottom: "1px dashed #1a1a1a" };
  const lbl: React.CSSProperties = { color: "#666", minWidth: 150, flexShrink: 0 };
  const val: React.CSSProperties = { color: "#ccc", wordBreak: "break-all", fontFamily: "ui-monospace, monospace" };

  function copyToClipboard(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  return (
    <div style={{ fontSize: 12 }}>
      {backendVersion && (
        <div style={{ marginBottom: 10, padding: "6px 10px", background: "#0f1a2e", border: "1px solid #1a2a4a", borderRadius: 6, color: "#60a5fa", fontFamily: "ui-monospace, monospace" }}>
          backend_version: {backendVersion}
        </div>
      )}

      {/* Bloco de progresso ao vivo */}
      {progress && (
        <div style={{ marginBottom: 12, padding: "10px 12px", background: "#0a1525", border: "1px solid #1a2e4a", borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: "#60a5fa", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Progresso ao vivo
            </span>
            <span style={{ color: "#888", fontSize: 11 }}>
              stage: {progress.stage ?? "—"} • status: {deliveryStatus ?? "—"}
            </span>
          </div>

          {typeof progress.total === "number" && progress.total > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aaa", marginBottom: 4 }}>
                <span>Arquivos: {progress.processed ?? 0} / {progress.total}</span>
                {typeof progress.total_bytes === "number" && progress.total_bytes > 0 && (
                  <span>
                    Bytes: {formatBytes(progress.bytes_done ?? 0)} / {formatBytes(progress.total_bytes)}
                  </span>
                )}
              </div>
              <div style={{ height: 5, background: "#0a0a0a", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.round(((progress.processed ?? 0) / (progress.total || 1)) * 100)}%`,
                    background: "#60a5fa",
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </>
          )}

          {progress.current_file && (
            <div style={{ fontSize: 11, color: "#ccc", marginBottom: 6 }}>
              <div style={{ color: "#888", marginBottom: 2 }}>Baixando agora:</div>
              <div style={{ fontFamily: "ui-monospace, monospace", color: "#fbbf24", wordBreak: "break-all" }}>
                {progress.current_file}
              </div>
              {typeof progress.current_file_total === "number" && progress.current_file_total > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#888" }}>
                    <span>{formatBytes(progress.current_file_bytes ?? 0)} / {formatBytes(progress.current_file_total)}</span>
                    <span>{Math.round(((progress.current_file_bytes ?? 0) / (progress.current_file_total || 1)) * 100)}%</span>
                  </div>
                  <div style={{ height: 3, background: "#0a0a0a", borderRadius: 2, overflow: "hidden", marginTop: 2 }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round(((progress.current_file_bytes ?? 0) / (progress.current_file_total || 1)) * 100)}%`,
                        background: "#fbbf24",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {progress.error && (
            <div style={{ marginTop: 8, color: "#f87171", fontSize: 11 }}>
              Erro: {progress.error}
            </div>
          )}

          {progress.log && progress.log.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: "#666", fontSize: 10, marginBottom: 4 }}>Log ({progress.log.length}):</div>
              <div style={{
                maxHeight: 180,
                overflow: "auto",
                background: "#000",
                border: "1px solid #111",
                borderRadius: 4,
                padding: 8,
                fontSize: 10,
                fontFamily: "ui-monospace, monospace",
                color: "#9ca3af",
                display: "flex",
                flexDirection: "column-reverse",
              }}>
                {[...progress.log].reverse().map((line, i) => (
                  <div key={i} style={{
                    color: line.includes("ERRO") || line.includes("✗")
                      ? "#f87171"
                      : line.includes("✓") || line.includes("pronto")
                        ? "#4ade80"
                        : line.includes("↓")
                          ? "#fbbf24"
                          : "#9ca3af"
                  }}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={row}>
        <span style={lbl}>Cliente</span>
        <span style={val}>{clientName ?? "—"}</span>
      </div>
      <div style={row}>
        <span style={lbl}>drive_gallery_id</span>
        <span style={val}>
          {driveId ?? "—"}
          {driveId && (
            <button
              onClick={() => copyToClipboard(driveId)}
              style={{ ...btnSm, fontSize: 10, marginLeft: 8, padding: "2px 6px" }}
            >
              copiar
            </button>
          )}
        </span>
      </div>
      <div style={row}>
        <span style={lbl}>Service Account</span>
        <span style={val}>
          {saEmail ?? "—"}
          {saEmail && (
            <button
              onClick={() => copyToClipboard(saEmail)}
              style={{ ...btnSm, fontSize: 10, marginLeft: 8, padding: "2px 6px" }}
            >
              copiar
            </button>
          )}
        </span>
      </div>
      <div style={row}>
        <span style={lbl}>Acesso à pasta pai</span>
        <span style={{ ...val, color: parentAccess ? "#4ade80" : parentAccess === false ? "#f87171" : "#888" }}>
          {parentAccess === true ? "✓ OK" : parentAccess === false ? "✗ SEM ACESSO" : "—"}
        </span>
      </div>
      {parentName && (
        <div style={row}>
          <span style={lbl}>Nome da pasta pai</span>
          <span style={val}>{parentName}</span>
        </div>
      )}
      {parentDriveId && (
        <div style={row}>
          <span style={lbl}>driveId (Shared Drive)</span>
          <span style={val}>{parentDriveId}</span>
        </div>
      )}
      <div style={row}>
        <span style={lbl}>Match &ldquo;Entrega&rdquo;</span>
        <span style={{ ...val, color: entregaMatch ? "#4ade80" : "#f87171" }}>
          {entregaMatch ? `✓ encontrada (id: ${entregaMatch})` : "✗ nenhuma subpasta bate com 'entrega'"}
        </span>
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: "10px 12px", background: "#1a0a0a", border: "1px solid #4a1a1a", borderRadius: 6, color: "#f87171" }}>
          <strong>Erro:</strong> {error}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={{ color: "#888", fontSize: 11, marginBottom: 6, fontWeight: 600 }}>
          Subpastas vistas pelo backend ({subfolders.length}):
        </div>
        {subfolders.length === 0 ? (
          <div style={{ color: "#666", fontSize: 12, padding: "8px 10px", background: "#0a0a0a", borderRadius: 6 }}>
            Nenhuma subpasta encontrada dentro da pasta do cliente.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {subfolders.map((sf) => (
              <div
                key={sf.id}
                style={{
                  padding: "8px 10px",
                  background: sf.matches_entrega_filter ? "#0a1a0f" : "#0a0a0a",
                  border: `1px solid ${sf.matches_entrega_filter ? "#15341c" : "#1a1a1a"}`,
                  borderRadius: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ color: sf.matches_entrega_filter ? "#4ade80" : "#ccc", fontWeight: 600 }}>
                    {sf.matches_entrega_filter ? "✓" : "•"} {sf.name || "(sem nome)"}
                  </span>
                  {sf.matches_entrega_filter && (
                    <span style={{ fontSize: 10, color: "#4ade80", background: "#0a2a14", padding: "1px 6px", borderRadius: 4 }}>
                      MATCH
                    </span>
                  )}
                </div>
                {sf.name_repr && (
                  <div style={{ color: "#666", fontSize: 10, fontFamily: "ui-monospace, monospace" }}>
                    repr: {sf.name_repr}
                  </div>
                )}
                {sf.name_bytes_hex && (
                  <div style={{ color: "#666", fontSize: 10, fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
                    utf-8 hex: {sf.name_bytes_hex}
                  </div>
                )}
                <div style={{ color: "#444", fontSize: 10, fontFamily: "ui-monospace, monospace" }}>
                  id: {sf.id}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {partialMatches.length > 0 && (
        <div style={{ marginTop: 12, padding: "10px 12px", background: "#1a1400", border: "1px solid #3a2e00", borderRadius: 6 }}>
          <div style={{ color: "#fbbf24", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
            Correspondências parciais (contém &ldquo;entrega&rdquo; mas não bate com filtro exato):
          </div>
          {partialMatches.map((sf) => (
            <div key={sf.id} style={{ color: "#e5c068", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
              • {sf.name_repr || sf.name} — hex: {sf.name_bytes_hex}
            </div>
          ))}
        </div>
      )}

      <details style={{ marginTop: 14 }}>
        <summary style={{ color: "#555", fontSize: 11, cursor: "pointer" }}>JSON bruto</summary>
        <pre style={{ marginTop: 6, padding: 10, background: "#000", border: "1px solid #1a1a1a", borderRadius: 6, fontSize: 10, color: "#666", overflow: "auto", maxHeight: 300 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function DeliverySection({ clientId, clientName, showToast }: {
  clientId: number;
  clientName: string;
  showToast: (msg: string) => void;
}) {
  const [delivery, setDelivery] = useState<DeliveryStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [msgDraft, setMsgDraft] = useState("");
  const [msgSaving, setMsgSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<DeliveryPreviewFile[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [diagnoseData, setDiagnoseData] = useState<Record<string, unknown> | null>(null);
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [diagnoseOpen, setDiagnoseOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const diagnosePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(
        `${API}/api/admin/clients/${clientId}/delivery/status`,
        { headers: getAuthHeaders() }
      );
      if (r.ok) {
        const data: DeliveryStatus = await r.json();
        setDelivery(data);
        if (!msgSaving) setMsgDraft(data.message || "");
      }
    } finally {
      setLoading(false);
    }
  }, [clientId, msgSaving]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Polling durante geração
  useEffect(() => {
    if (delivery?.status === "generating") {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchStatus, 2000);
      }
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [delivery?.status, fetchStatus]);

  async function handleSaveMessage() {
    setMsgSaving(true);
    try {
      await fetch(`${API}/api/admin/clients/${clientId}/delivery/message`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ message: msgDraft }),
      });
      showToast("Mensagem salva.");
      fetchStatus();
    } finally {
      setMsgSaving(false);
    }
  }

  async function handleGenerate() {
    const r = await fetch(
      `${API}/api/admin/clients/${clientId}/delivery/generate`,
      { method: "POST", headers: getAuthHeaders() }
    );
    if (r.ok) {
      showToast("Geração iniciada…");
      fetchStatus();
    } else {
      const err = await r.json().catch(() => ({}));
      showToast(err.detail || "Falha ao iniciar geração.");
    }
  }

  async function handleToggleRelease(release: boolean) {
    const r = await fetch(
      `${API}/api/admin/clients/${clientId}/delivery/release`,
      {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ released: release }),
      }
    );
    if (r.ok) {
      showToast(release ? "Entrega liberada!" : "Entrega ocultada.");
      fetchStatus();
    } else {
      const err = await r.json().catch(() => ({}));
      showToast(err.detail || "Falha ao alterar estado.");
    }
  }

  async function handleClearZip() {
    if (clearConfirmText !== clientName) {
      showToast("Digite o nome do cliente corretamente.");
      return;
    }
    const r = await fetch(
      `${API}/api/admin/clients/${clientId}/delivery/zip`,
      { method: "DELETE", headers: getAuthHeaders() }
    );
    if (r.ok) {
      showToast("Dados limpos da nuvem.");
      setConfirmClear(false);
      setClearConfirmText("");
      fetchStatus();
    }
  }

  const fetchDiagnose = useCallback(async () => {
    try {
      const r = await fetch(
        `${API}/api/admin/clients/${clientId}/delivery/diagnose`,
        { headers: getAuthHeaders() }
      );
      if (r.ok) {
        const d = await r.json();
        setDiagnoseData(d);
      } else {
        const err = await r.json().catch(() => ({}));
        setDiagnoseData({ error: err.detail || `HTTP ${r.status}` });
      }
    } catch (e) {
      setDiagnoseData({ error: String(e) });
    }
  }, [clientId]);

  async function handleDiagnose() {
    setDiagnoseLoading(true);
    setDiagnoseOpen(true);
    try {
      await fetchDiagnose();
    } finally {
      setDiagnoseLoading(false);
    }
  }

  // Atalho: Ctrl+Shift+D abre/fecha o painel de diagnóstico
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setDiagnoseOpen(prev => {
          const next = !prev;
          if (next) {
            setDiagnoseLoading(true);
            fetchDiagnose().finally(() => setDiagnoseLoading(false));
          }
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fetchDiagnose]);

  // Polling do diagnose enquanto está aberto E existe uma geração em andamento
  useEffect(() => {
    const isGenerating = delivery?.status === "generating";
    if (diagnoseOpen && isGenerating) {
      if (!diagnosePollRef.current) {
        diagnosePollRef.current = setInterval(fetchDiagnose, 1500);
      }
    } else {
      if (diagnosePollRef.current) {
        clearInterval(diagnosePollRef.current);
        diagnosePollRef.current = null;
      }
    }
    return () => {
      if (diagnosePollRef.current) {
        clearInterval(diagnosePollRef.current);
        diagnosePollRef.current = null;
      }
    };
  }, [diagnoseOpen, delivery?.status, fetchDiagnose]);

  async function handleOpenPreview() {
    setShowPreview(true);
    setPreviewLoading(true);
    setPreviewFiles(null);
    try {
      const r = await fetch(
        `${API}/api/admin/clients/${clientId}/delivery/preview`,
        { headers: getAuthHeaders() }
      );
      if (r.ok) {
        const d = await r.json();
        setPreviewFiles(d.files || []);
      } else {
        setPreviewFiles([]);
      }
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: "#888" }}>Entrega</h2>
        <p style={{ fontSize: 13, color: "#555" }}>Carregando…</p>
      </div>
    );
  }

  if (!delivery) return null;

  const statusLabel: Record<string, { label: string; color: string }> = {
    idle: { label: "Sem entrega gerada", color: "#666" },
    generating: { label: "Gerando ZIP…", color: "#a78bfa" },
    ready: { label: "ZIP pronto", color: "#4ade80" },
    error: { label: "Erro ao gerar", color: "#f87171" },
  };
  const st = statusLabel[delivery.status] ?? statusLabel.idle;
  const progress = delivery.progress;
  const percent = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100)
    : 0;

  return (
    <div style={{ marginTop: 40, paddingTop: 32, borderTop: "1px solid #1a1a1a" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#888", margin: 0 }}>Entrega</h2>
        <span style={{ color: st.color, fontSize: 12, fontWeight: 600, background: "#111", border: "1px solid #222", padding: "3px 10px", borderRadius: 6 }}>
          {st.label}
        </span>
        {delivery.released && (
          <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 600, background: "#0a1a0f", border: "1px solid #15341c", padding: "3px 10px", borderRadius: 6 }}>
            Liberada para cliente
          </span>
        )}
      </div>

      {/* Progress bar durante geração */}
      {delivery.status === "generating" && progress && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#111", border: "1px solid #1a1a1a", borderRadius: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 8 }}>
            <span>{progress.stage === "listing" ? "Listando arquivos…" : progress.stage === "downloading" ? `Baixando ${progress.processed}/${progress.total}` : progress.stage}</span>
            <span>{percent}%</span>
          </div>
          <div style={{ height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${percent}%`, background: "#a78bfa", transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {/* Erro */}
      {delivery.status === "error" && progress?.error && (
        <div style={{ marginBottom: 16, padding: "12px 14px", background: "#1a0a0a", border: "1px solid #4a1a1a", borderRadius: 10, color: "#f87171", fontSize: 13 }}>
          {progress.error}
        </div>
      )}

      {/* Mensagem personalizada */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: "#666", fontWeight: 500, display: "block", marginBottom: 6 }}>
          Mensagem para o cliente
        </label>
        <textarea
          value={msgDraft}
          onChange={e => setMsgDraft(e.target.value)}
          placeholder="Seus arquivos estão prontos! Obrigado pela parceria..."
          rows={3}
          style={{ ...inp, resize: "vertical", minHeight: 80, fontFamily: "inherit" }}
        />
        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleSaveMessage}
            disabled={msgSaving || msgDraft === (delivery.message || "")}
            style={{ ...btnSm, opacity: msgSaving || msgDraft === (delivery.message || "") ? 0.5 : 1 }}
          >
            {msgSaving ? "Salvando…" : "Salvar mensagem"}
          </button>
        </div>
      </div>

      {/* Info do ZIP pronto */}
      {delivery.status === "ready" && (
        <div style={{ marginBottom: 16, padding: "14px 16px", background: "#0a1a0f", border: "1px solid #15341c", borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontSize: 13, color: "#4ade80", fontWeight: 600, marginBottom: 2 }}>
                ZIP pronto • {formatBytes(delivery.zip_size)}
              </p>
              <p style={{ fontSize: 11, color: "#666" }}>
                Gerado em {delivery.generated_at ? new Date(delivery.generated_at).toLocaleString("pt-BR") : "—"}
              </p>
            </div>
            {delivery.downloaded && (
              <span style={{ fontSize: 11, color: "#60a5fa", background: "#0f1a2e", border: "1px solid #1a2a4a", padding: "3px 10px", borderRadius: 6 }}>
                ✓ Baixado pelo cliente
              </span>
            )}
          </div>
        </div>
      )}

      {/* Ações */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button
          onClick={handleGenerate}
          disabled={delivery.status === "generating"}
          style={{ ...btnAction, borderColor: "#a78bfa", color: "#a78bfa", opacity: delivery.status === "generating" ? 0.5 : 1 }}
        >
          {delivery.status === "generating" ? "Gerando…" : delivery.status === "ready" ? "↻ Regenerar ZIP" : "Gerar ZIP"}
        </button>

        <button
          onClick={handleOpenPreview}
          style={{ ...btnAction, borderColor: "#60a5fa", color: "#60a5fa" }}
        >
          Preview
        </button>

        {delivery.status === "ready" && (
          delivery.released
            ? <button onClick={() => handleToggleRelease(false)} style={{ ...btnAction, borderColor: "#fbbf24", color: "#fbbf24" }}>Ocultar entrega</button>
            : <button onClick={() => handleToggleRelease(true)} style={{ ...btnAction, borderColor: "#4ade80", color: "#4ade80" }}>Liberar entrega</button>
        )}

        {delivery.status === "ready" && (
          <a
            href={`${API}/api/client/delivery/download?code=preview`}
            onClick={(e) => {
              e.preventDefault();
              showToast("Download pelo admin não implementado — use o preview.");
            }}
            style={{ display: "none" }}
          >Baixar</a>
        )}

        {(delivery.status === "ready" || delivery.status === "error") && (
          <button
            onClick={() => setConfirmClear(true)}
            style={{ ...btnAction, borderColor: "#333", color: "#f87171" }}
          >
            Limpar dados da nuvem
          </button>
        )}
      </div>

      <p style={{ fontSize: 11, color: "#555", marginTop: 8 }}>
        Os arquivos são lidos da subpasta <code style={{ background: "#111", padding: "1px 6px", borderRadius: 4, color: "#aaa" }}>Entrega/</code> no Google Drive do cliente.
        {" "}<span style={{ color: "#333" }}>•</span> <span style={{ color: "#444" }}>Diagnóstico: <kbd style={{ background: "#0a0a0a", border: "1px solid #222", borderRadius: 3, padding: "1px 5px", fontSize: 10, color: "#666" }}>Ctrl</kbd> + <kbd style={{ background: "#0a0a0a", border: "1px solid #222", borderRadius: 3, padding: "1px 5px", fontSize: 10, color: "#666" }}>Shift</kbd> + <kbd style={{ background: "#0a0a0a", border: "1px solid #222", borderRadius: 3, padding: "1px 5px", fontSize: 10, color: "#666" }}>D</kbd></span>
      </p>

      {/* Painel de diagnóstico (oculto por padrão — abre com Ctrl+Shift+D) */}
      {diagnoseOpen && (
        <div style={{ marginTop: 16, padding: "14px 16px", background: "#0a0a0a", border: "1px solid #222", borderRadius: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "#aaa", margin: 0 }}>
              Diagnóstico {diagnoseLoading && <span style={{ color: "#555" }}>atualizando…</span>}
            </h3>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => fetchDiagnose()} style={{ ...btnSm, fontSize: 11 }}>↻</button>
              <button onClick={() => { setDiagnoseOpen(false); }} style={{ ...btnSm, fontSize: 11 }}>Fechar</button>
            </div>
          </div>
          {diagnoseData
            ? <DiagnoseView data={diagnoseData} />
            : <p style={{ fontSize: 12, color: "#555" }}>Carregando…</p>
          }
        </div>
      )}

      {/* Modal de Preview */}
      {showPreview && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowPreview(false); }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, maxWidth: 1200, width: "100%", margin: "0 auto 20px" }}>
            <div>
              <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: 0 }}>Preview da Entrega</h2>
              <p style={{ color: "#888", fontSize: 12, marginTop: 4 }}>Exatamente o que o cliente verá.</p>
            </div>
            <button onClick={() => setShowPreview(false)} style={{ ...btnSm, fontSize: 14 }}>✕ Fechar</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", maxWidth: 1200, width: "100%", margin: "0 auto" }}>
            {delivery.message && (
              <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
                <p style={{ color: "#ccc", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{delivery.message}</p>
              </div>
            )}

            {previewLoading ? (
              <p style={{ color: "#666", textAlign: "center", padding: 40 }}>Carregando arquivos…</p>
            ) : !previewFiles || previewFiles.length === 0 ? (
              <p style={{ color: "#666", textAlign: "center", padding: 40 }}>
                Nenhum arquivo visual na pasta Entrega.
              </p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                {previewFiles.map(f => (
                  <div key={f.id} style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: "#111", border: "1px solid #1a1a1a", position: "relative" }}>
                    {f.mimeType.startsWith("video/") ? (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 32 }}>
                        ▶
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`${API}${f.url}`}
                        alt={f.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        loading="lazy"
                      />
                    )}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.85))", padding: "16px 8px 6px" }}>
                      <p style={{ fontSize: 10, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</p>
                      {f.relDir && <p style={{ fontSize: 9, color: "#666" }}>{f.relDir}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Confirmação - Limpar ZIP */}
      {confirmClear && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) { setConfirmClear(false); setClearConfirmText(""); } }}
        >
          <div style={{ background: "#111", border: "1px solid #333", borderRadius: 16, padding: "28px 24px", maxWidth: 420, width: "100%" }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: "#f87171" }}>Limpar dados da nuvem?</h3>
            <p style={{ color: "#888", fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
              Isso apaga o ZIP pré-gerado do storage da Morthe. A pasta <code style={{ background: "#000", padding: "1px 6px", borderRadius: 4 }}>Entrega/</code> no Google Drive <strong>não é afetada</strong>. Você poderá regerar depois.
            </p>
            <p style={{ color: "#666", fontSize: 12, marginBottom: 8 }}>
              Digite <strong style={{ color: "#ccc" }}>{clientName}</strong> para confirmar:
            </p>
            <input
              value={clearConfirmText}
              onChange={e => setClearConfirmText(e.target.value)}
              style={{ ...inp, marginBottom: 16 }}
              placeholder={clientName}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { setConfirmClear(false); setClearConfirmText(""); }}
                style={{ flex: 1, background: "transparent", border: "1px solid #333", borderRadius: 8, color: "#888", padding: 11, fontSize: 14, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleClearZip}
                disabled={clearConfirmText !== clientName}
                style={{ flex: 1, background: clearConfirmText === clientName ? "#f87171" : "#3a1a1a", border: "none", borderRadius: 8, color: "#fff", padding: 11, fontSize: 14, fontWeight: 700, cursor: clearConfirmText === clientName ? "pointer" : "not-allowed" }}
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared styles ───────────────────────────────────────────────────────────
const inp: React.CSSProperties = { background: "#111", border: "1px solid #222", borderRadius: 7, padding: "9px 13px", color: "#fff", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" };
const btnSm: React.CSSProperties = { background: "transparent", color: "#888", border: "1px solid #333", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center" };
const btnAction: React.CSSProperties = { background: "transparent", border: "1px solid #333", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const sideBtn: React.CSSProperties = { width: "100%", background: "transparent", border: "none", color: "#aaa", padding: "8px 12px", fontSize: 13, cursor: "pointer", borderRadius: 6, display: "flex", alignItems: "center", gap: 8, textAlign: "left" };
