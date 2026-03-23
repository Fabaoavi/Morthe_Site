"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const ADMIN_TRIGGER = "admin"; // Typing "admin" as code triggers the admin login flow

export default function ClientLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Admin login modal
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toLowerCase();
    if (!trimmed) return;

    // Admin access trigger
    if (trimmed === ADMIN_TRIGGER) {
      setShowAdminModal(true);
      setAdminUser("");
      setAdminPass("");
      setAdminError("");
      return;
    }

    // Normal client login
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API}/api/client/verify?code=${encodeURIComponent(code.trim())}`
      );
      const data = await res.json();
      if (data.valid) {
        router.push(`/cliente/${code.trim()}`);
      } else {
        setError("Código não encontrado. Verifique e tente novamente.");
      }
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!adminUser.trim() || !adminPass.trim()) return;

    setAdminLoading(true);
    setAdminError("");
    try {
      const res = await fetch(`${API}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: adminUser.trim(), password: adminPass }),
      });
      const data = await res.json();

      if (res.ok && data.token) {
        sessionStorage.setItem("morthe_admin_token", data.token);
        setShowAdminModal(false);
        router.push("/admin");
      } else {
        setAdminError(data.detail || "Credenciais incorretas.");
        setAdminPass("");
      }
    } catch {
      setAdminError("Erro de conexão com o servidor.");
    } finally {
      setAdminLoading(false);
    }
  }

  return (
    <main style={s.main}>
      <div style={s.card}>
        <p style={s.brand}>MORTHE</p>
        <h1 style={s.title}>Área do Cliente</h1>
        <p style={s.subtitle}>
          Digite o código recebido pelo fotógrafo para acessar sua galeria.
        </p>

        <form onSubmit={handleLogin} style={s.form}>
          <input
            style={s.input}
            type="text"
            placeholder="Seu código de acesso"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(""); }}
            maxLength={12}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
          />
          <button style={s.button} type="submit" disabled={loading}>
            {loading ? "Verificando…" : "Entrar →"}
          </button>
        </form>

        {error && <p style={s.error}>{error}</p>}
      </div>

      {/* Admin Login Modal — authenticates via backend JWT */}
      {showAdminModal && (
        <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) setShowAdminModal(false); }}>
          <div style={s.modal}>
            <h2 style={s.modalTitle}>Acesso Administrativo</h2>
            <p style={s.modalSubtitle}>Autentique-se para acessar o painel.</p>

            <form onSubmit={handleAdminLogin} style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
              <input
                style={s.input}
                type="text"
                placeholder="Usuário"
                value={adminUser}
                onChange={(e) => { setAdminUser(e.target.value); setAdminError(""); }}
                autoFocus
                autoComplete="username"
              />
              <input
                style={s.input}
                type="password"
                placeholder="Senha"
                value={adminPass}
                onChange={(e) => { setAdminPass(e.target.value); setAdminError(""); }}
                autoComplete="current-password"
              />
              <button style={s.button} type="submit" disabled={adminLoading}>
                {adminLoading ? "Autenticando…" : "Entrar"}
              </button>
            </form>

            {adminError && <p style={s.error}>{adminError}</p>}

            <button
              style={{ ...s.button, background: "transparent", color: "#555", border: "1px solid #333", marginTop: 8 }}
              onClick={() => setShowAdminModal(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0a0a",
    padding: "24px",
  },
  card: {
    background: "#111",
    border: "1px solid #222",
    borderRadius: 18,
    padding: "52px 44px",
    maxWidth: 400,
    width: "100%",
    textAlign: "center",
  },
  brand: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.3em",
    color: "#555",
    marginBottom: 16,
  },
  title: {
    color: "#fff",
    fontSize: 26,
    fontWeight: 700,
    marginBottom: 8,
  },
  subtitle: {
    color: "#666",
    fontSize: 14,
    marginBottom: 32,
    lineHeight: 1.7,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  input: {
    background: "#0a0a0a",
    border: "1px solid #333",
    borderRadius: 10,
    padding: "14px 18px",
    color: "#fff",
    fontSize: 17,
    textAlign: "center",
    letterSpacing: "0.12em",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  button: {
    background: "#fff",
    color: "#000",
    border: "none",
    borderRadius: 10,
    padding: "14px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    width: "100%",
  },
  error: {
    color: "#f87171",
    marginTop: 14,
    fontSize: 13,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.85)",
    backdropFilter: "blur(12px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 24,
  },
  modal: {
    background: "#111",
    border: "1px solid #333",
    borderRadius: 16,
    padding: "40px 36px",
    maxWidth: 380,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#fff",
    marginBottom: 4,
  },
  modalSubtitle: {
    color: "#666",
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 1.6,
  },
};
