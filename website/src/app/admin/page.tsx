"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
}

interface Selection {
  image_id: string;
  image_name: string;
  selected_at: string;
}

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const STATUS: Record<string, { label: string; color: string }> = {
  pending:        { label: "Aguardando",      color: "#888" },
  syncing:        { label: "Sincronizando",   color: "#a78bfa" },
  gallery_ready:  { label: "Galeria pronta",  color: "#60a5fa" },
  selecting:      { label: "Selecionando",    color: "#fbbf24" },
  selection_done: { label: "Concluído",       color: "#4ade80" },
};

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("morthe_admin_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function AdminDashboard() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saEmail, setSaEmail] = useState("");
  const [copied, setCopied] = useState("");

  // Form
  const [form, setForm] = useState({ name: "", drive_gallery_url: "", session_date: "", max_selections: 20, notes: "" });
  const [urlStatus, setUrlStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [urlError, setUrlError] = useState("");
  const [formMsg, setFormMsg] = useState({ text: "", type: "" });
  const [submitting, setSubmitting] = useState(false);

  // Cliente expandido
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [maxEdit, setMaxEdit] = useState<Record<number, string>>({});

  async function fetchClients() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/clients`, { headers: getAuthHeaders() });
      if (r.status === 401) { router.push("/cliente"); return; }
      if (r.ok) setClients(await r.json());
    } finally { setLoading(false); }
  }

  async function fetchSaEmail() {
    try {
      const r = await fetch(`${API}/api/admin/service-account-email`, { headers: getAuthHeaders() });
      if (r.ok) setSaEmail((await r.json()).email);
    } catch { /* silencioso */ }
  }

  useEffect(() => {
    // Check if we have a token
    const token = sessionStorage.getItem("morthe_admin_token");
    if (!token) { router.push("/cliente"); return; }
    fetchClients(); fetchSaEmail();
  }, []); // eslint-disable-line

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1800);
  }

  async function validateUrl() {
    if (!form.drive_gallery_url) { setUrlError("Cole o link primeiro."); setUrlStatus("error"); return; }
    setUrlStatus("checking");
    setUrlError("");
    const r = await fetch(`${API}/api/admin/validate-folder?url=${encodeURIComponent(form.drive_gallery_url)}`, { headers: getAuthHeaders()});
    const d = await r.json();
    if (d.valid) { setUrlStatus("ok"); }
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
      if (!r.ok) { setFormMsg({ text: d.detail || "Erro ao criar.", type: "error" }); }
      else {
        setFormMsg({ text: `✓ Cliente criado! Código: ${d.code}`, type: "success" });
        setForm({ name: "", drive_gallery_url: "", session_date: "", max_selections: 20, notes: "" });
        setUrlStatus("idle");
        fetchClients();
      }
    } finally { setSubmitting(false); }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Remover "${name}"? Os thumbnails em cache serão excluídos.`)) return;
    await fetch(`${API}/api/admin/clients/${id}`, { method: "DELETE", headers: getAuthHeaders()});
    fetchClients();
  }

  async function handleSync(id: number) {
    await fetch(`${API}/api/admin/clients/${id}/sync`, { method: "POST", headers: getAuthHeaders()});
    fetchClients();
  }

  async function expandClient(c: Client) {
    if (expandedId === c.id) { setExpandedId(null); return; }
    setExpandedId(c.id);
    const r = await fetch(`${API}/api/admin/clients/${c.id}/selections`, { headers: getAuthHeaders()});
    if (r.ok) { const d = await r.json(); setSelections(d.selections || []); }
    else setSelections([]);
  }

  async function handleLock(id: number) {
    await fetch(`${API}/api/admin/clients/${id}/lock`, { method: "POST", headers: getAuthHeaders()});
    fetchClients();
  }

  async function handleUnlock(id: number) {
    await fetch(`${API}/api/admin/clients/${id}/unlock`, { method: "POST", headers: getAuthHeaders()});
    fetchClients();
  }

  async function handleAdjustMax(id: number) {
    const val = parseInt(maxEdit[id] || "");
    if (!val || val < 1) { alert("Insira um número válido."); return; }
    await fetch(`${API}/api/admin/clients/${id}/max-selections`, {
      method: "PUT", headers: getAuthHeaders(),
      body: JSON.stringify({ max_selections: val }),
    });
    setMaxEdit(prev => { const n = { ...prev }; delete n[id]; return n; });
    fetchClients();
  }

  return (
    <main style={s.main}>
      <h1 style={s.pageTitle}>⚙️ Painel do Administrador</h1>

      {/* SA Email */}
      {saEmail && (
        <div style={s.banner}>
          <span style={{ color: "#666", fontSize: 13 }}>Service Account — compartilhe as pastas do Drive como <strong>EDITOR</strong>:</span>
          <button
            style={s.emailBtn}
            onClick={() => copyToClipboard(saEmail, "email")}
            title="Clique para copiar"
          >
            {saEmail}
            <span style={{ marginLeft: 8, opacity: 0.6 }}>{copied === "email" ? "✓" : "📋"}</span>
          </button>
        </div>
      )}

      {/* ── Form ── */}
      <section style={s.section}>
        <h2 style={s.sTitle}>Cadastrar Novo Cliente</h2>
        <form onSubmit={handleCreate} style={s.form}>
          <div style={s.row}>
            <label style={s.field}>
              <span style={s.label}>Nome *</span>
              <input style={s.input} required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="João Silva" />
            </label>
            <label style={s.field}>
              <span style={s.label}>Data da Sessão</span>
              <input style={s.input} type="date" value={form.session_date} onChange={e => setForm(p => ({ ...p, session_date: e.target.value }))} />
            </label>
            <label style={{ ...s.field, maxWidth: 140 }}>
              <span style={s.label}>Máx. Seleções</span>
              <input style={s.input} type="number" min={1} max={999} value={form.max_selections} onChange={e => setForm(p => ({ ...p, max_selections: Number(e.target.value) }))} />
            </label>
          </div>

          {/* URL com validação inline */}
          <label style={{ ...s.field, flex: "none" }}>
            <span style={s.label}>Link Google Drive *</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                style={{ ...s.input, flex: 1 }}
                required
                value={form.drive_gallery_url}
                onChange={e => { setForm(p => ({ ...p, drive_gallery_url: e.target.value })); setUrlStatus("idle"); }}
                placeholder="https://drive.google.com/drive/folders/..."
              />
              <button type="button" style={s.btnSm} onClick={validateUrl} disabled={urlStatus === "checking"}>
                {urlStatus === "checking" ? "…" : "Validar"}
              </button>
              {urlStatus === "ok" && <span style={{ color: "#4ade80", fontSize: 20 }} title="Pasta acessível">✓</span>}
              {urlStatus === "error" && <span style={{ color: "#f87171", fontSize: 20 }} title={urlError}>✕</span>}
            </div>
            {urlStatus === "error" && <span style={{ color: "#f87171", fontSize: 12, marginTop: 4 }}>{urlError}</span>}
            {urlStatus === "ok" && <span style={{ color: "#4ade80", fontSize: 12, marginTop: 4 }}>Pasta verificada com sucesso.</span>}
            <span style={{ color: "#444", fontSize: 12, marginTop: 4, display: "block" }}>
              Coloque nessa pasta as fotos do cliente + arquivos Moodboard_*. Compartilhe como EDITOR com o email acima.
            </span>
          </label>

          <label style={{ ...s.field, flex: "none" }}>
            <span style={s.label}>Notas (opcional)</span>
            <input style={s.input} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observações internas…" />
          </label>

          {formMsg.text && <p style={{ color: formMsg.type === "error" ? "#f87171" : "#4ade80", fontSize: 14 }}>{formMsg.text}</p>}
          <button style={s.btnPrimary} type="submit" disabled={submitting}>
            {submitting ? "Criando…" : "+ Cadastrar Cliente"}
          </button>
        </form>
      </section>

      {/* ── Lista ── */}
      <section style={s.section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={s.sTitle}>Clientes Ativos ({clients.length})</h2>
          <button style={s.btnSm} onClick={fetchClients}>↻ Atualizar</button>
        </div>

        {loading ? <p style={{ color: "#555" }}>Carregando…</p> :
        clients.length === 0 ? <p style={{ color: "#444" }}>Nenhum cliente cadastrado.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {clients.map(c => {
              const st = STATUS[c.status] ?? { label: c.status, color: "#888" };
              const isExpanded = expandedId === c.id;
              return (
                <div key={c.id} style={s.card}>
                  <div style={s.cardHeader}>
                    {/* Info */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                      <strong style={{ fontSize: 17 }}>{c.name}</strong>

                      {/* Código clicável */}
                      <button
                        style={s.codeBtn}
                        onClick={() => copyToClipboard(c.code, `code-${c.id}`)}
                        title="Clique para copiar o código"
                      >
                        {c.code}
                        <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 11 }}>{copied === `code-${c.id}` ? "✓ copiado" : "📋"}</span>
                      </button>

                      <span style={{ color: st.color, fontSize: 13, fontWeight: 600 }}>● {st.label}</span>
                      {c.selection_locked ? <span style={{ color: "#f87171", fontSize: 12 }}>🔒 Travado</span> : null}
                    </div>

                    {/* Ações */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                      <button style={s.btnSm} onClick={() => expandClient(c)}>
                        {isExpanded ? "Fechar" : `Ver seleções (${c.selection_count ?? 0}/${c.max_selections})`}
                      </button>
                      <button
                        style={{ ...s.btnSm, color: "#a78bfa", borderColor: c.status === "syncing" ? "#a78bfa" : "#333" }}
                        onClick={() => handleSync(c.id)}
                        disabled={c.status === "syncing"}
                        title="Baixar e cachear todas as fotos (WebP + marca d'água). Novo sync quando adicionar fotos no Drive."
                      >
                        {c.status === "syncing" ? "⏳ Sincronizando..." : "↻ Sincronizar"}
                      </button>
                      {c.selection_locked
                        ? <button style={{ ...s.btnSm, color: "#4ade80", borderColor: "#4ade80" }} onClick={() => handleUnlock(c.id)}>🔓 Liberar</button>
                        : <button style={{ ...s.btnSm, color: "#fbbf24", borderColor: "#fbbf24" }} onClick={() => handleLock(c.id)}>🔒 Travar</button>
                      }
                      {/* Ajustar limite inline */}
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          style={{ ...s.input, width: 60, padding: "4px 8px", fontSize: 13 }}
                          type="number"
                          placeholder={String(c.max_selections)}
                          value={maxEdit[c.id] ?? ""}
                          onChange={e => setMaxEdit(p => ({ ...p, [c.id]: e.target.value }))}
                        />
                        <button style={s.btnSm} onClick={() => handleAdjustMax(c.id)}>± Limite</button>
                      </div>
                      <button style={{ ...s.btnSm, color: "#f87171", borderColor: "#334" }} onClick={() => handleDelete(c.id, c.name)}>Remover</button>
                    </div>
                  </div>

                  {/* Meta info */}
                  <div style={s.metaRow}>
                    <span>📅 {c.session_date ? new Date(c.session_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</span>
                    <span>🖼 Máx: {c.max_selections}</span>
                    <span>🔁 Reaperturas: {c.selection_unlock_count ?? 0}/3</span>
                    {c.drive_gallery_url && <a href={c.drive_gallery_url} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>📁 Drive</a>}
                    <span onClick={() => copyToClipboard(`${window.location.origin}/cliente/${c.code}`, `link-${c.id}`)} style={{ cursor: "pointer", color: "#555" }}>
                      🔗 {copied === `link-${c.id}` ? "✓ copiado!" : `${window.location.origin}/cliente/${c.code}`}
                    </span>
                  </div>
                  {c.notes && <p style={{ color: "#555", fontSize: 13, marginTop: 4 }}>💬 {c.notes}</p>}

                  {/* ── Seleções expandidas ── */}
                  {isExpanded && (
                    <div style={s.selPanel}>
                      <p style={{ color: "#888", fontSize: 13, marginBottom: 12 }}>
                        {selections.length > 0
                          ? `${selections.length} foto(s) selecionada(s) — clique para abrir no Drive`
                          : "Nenhuma foto selecionada ainda."}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 10 }}>
                        {selections.map((sel, i) => (
                          <a
                            key={i}
                            href={`https://drive.google.com/file/d/${sel.image_id}/view`}
                            target="_blank"
                            rel="noreferrer"
                            style={s.selThumb}
                            title={sel.image_name}
                          >
                            <img
                              src={`https://drive.google.com/thumbnail?id=${sel.image_id}&sz=w200`}
                              alt={sel.image_name}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              loading="lazy"
                            />
                            <div style={s.selThumbOverlay}>
                              <span style={{ fontSize: 11, color: "#ccc", textAlign: "center" as const, padding: 4 }}>{sel.image_name}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", background: "#0a0a0a", color: "#fff", padding: "36px 28px", maxWidth: 1100, margin: "0 auto" },
  pageTitle: { fontSize: 26, fontWeight: 700, marginBottom: 24 },
  banner: { background: "#111", border: "1px solid #222", borderRadius: 10, padding: "12px 16px", marginBottom: 32, display: "flex", flexDirection: "column", gap: 6 },
  emailBtn: { background: "transparent", border: "1px solid #333", borderRadius: 8, padding: "8px 14px", color: "#60a5fa", fontSize: 13, cursor: "pointer", textAlign: "left", fontFamily: "monospace" },
  section: { marginBottom: 52 },
  sTitle: { fontSize: 18, fontWeight: 600, marginBottom: 18, paddingBottom: 10, borderBottom: "1px solid #1a1a1a" },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  row: { display: "flex", gap: 14, flexWrap: "wrap" as const },
  field: { display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 180 },
  label: { fontSize: 12, color: "#666", fontWeight: 500 },
  input: { background: "#111", border: "1px solid #222", borderRadius: 7, padding: "9px 13px", color: "#fff", fontSize: 14, outline: "none" },
  btnPrimary: { background: "#fff", color: "#000", border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer", alignSelf: "flex-start" },
  btnSm: { background: "transparent", color: "#888", border: "1px solid #333", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" },
  card: { background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 12, padding: "18px 20px" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" as const, gap: 12 },
  codeBtn: { background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, padding: "4px 12px", color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "monospace", letterSpacing: "0.1em" },
  metaRow: { display: "flex", gap: 20, fontSize: 13, color: "#555", marginTop: 10, flexWrap: "wrap" as const },
  selPanel: { marginTop: 16, background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: "14px 16px" },
  selThumb: { width: 90, height: 90, borderRadius: 8, overflow: "hidden", display: "block", position: "relative", border: "1px solid #222", flexShrink: 0, cursor: "pointer" },
  selThumbOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.8))", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "4px 2px", minHeight: 30 },
};
