"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface DriveFile {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  cachedThumbUrl: string | null;
  cachedMdUrl: string | null;
  proxyUrl: string;
  selected?: boolean;
  cached?: boolean;
}

interface Mood {
  id: string;
  title: string;
  folderName: string;
  files: DriveFile[];
}

interface ClientInfo {
  name: string;
  session_date: string | null;
  status: string;
  max_selections: number;
  current_selections: number;
  notes: string | null;
}

interface FinalizeInfo {
  finalized: boolean;
  can_reopen: boolean;
  reopen_seconds_left: number;
  unlock_count: number;
  locked: boolean;
}

interface ConfirmModal {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

export default function ClientDashboard() {
  const { code } = useParams<{ code: string }>();
  const [info, setInfo] = useState<ClientInfo | null>(null);
  const [gallery, setGallery] = useState<DriveFile[]>([]);
  const [moodboard, setMoodboard] = useState<DriveFile[]>([]);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [expandedMood, setExpandedMood] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectionsCount, setSelectionsCount] = useState(0);
  const [maxSelections, setMaxSelections] = useState(20);
  const [finalizeInfo, setFinalizeInfo] = useState<FinalizeInfo>({
    finalized: false, can_reopen: false, reopen_seconds_left: 0,
    unlock_count: 0, locked: false,
  });
  const [countdown, setCountdown] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [lightbox, setLightbox] = useState<{ file: DriveFile; idx: number; source: "gallery" | "mood"; moodId?: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>({
    open: false, title: "", message: "", onConfirm: () => {},
  });
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: unknown) {
    const text = typeof msg === "string" ? msg : Array.isArray(msg) ? "Erro no servidor." : String(msg);
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  }

  function openConfirm(title: string, message: string, onConfirm: () => void, confirmLabel = "Confirmar") {
    setConfirmModal({ open: true, title, message, onConfirm, confirmLabel });
  }

  // Collect all selected files from gallery + moods
  const allSelectedFiles = [
    ...gallery.filter(f => f.selected),
    ...moods.flatMap(m => m.files.filter(f => f.selected)),
  ];
  const limitReached = selectionsCount >= maxSelections;

  // All files for lightbox navigation (gallery + expanded mood)
  const lightboxFiles = lightbox?.source === "mood" && lightbox.moodId
    ? moods.find(m => m.id === lightbox.moodId)?.files || []
    : gallery;

  const fetchData = useCallback(async () => {
    try {
      const [infoRes, galleryRes, moodRes, moodsRes] = await Promise.all([
        fetch(`${API}/api/client/info?code=${code}`),
        fetch(`${API}/api/client/gallery?code=${code}`),
        fetch(`${API}/api/client/moodboard?code=${code}`),
        fetch(`${API}/api/client/moods?code=${code}`),
      ]);
      const infoData: ClientInfo = await infoRes.json();
      const galleryData = await galleryRes.json();
      const moodData = await moodRes.json();
      const moodsData = await moodsRes.json();

      setInfo(infoData);
      setGallery(galleryData.files || []);
      setMoodboard(moodData.files || []);
      setMoods(moodsData.moods || []);
      setSelectionsCount(infoData.current_selections);
      setMaxSelections(infoData.max_selections);
      setFinalizeInfo(prev => ({ ...prev, finalized: infoData.status === "selection_done" }));

      if (infoData.status === "syncing") setTimeout(fetchData, 8000);
    } catch {
      setError("Erro ao carregar. Verifique se a API está rodando.");
    } finally { setLoading(false); }
  }, [code]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Countdown para reopen
  useEffect(() => {
    if (!finalizeInfo.finalized || !finalizeInfo.can_reopen || finalizeInfo.reopen_seconds_left <= 0) return;
    setCountdown(finalizeInfo.reopen_seconds_left);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [finalizeInfo]);

  // Teclado para lightbox
  useEffect(() => {
    if (!lightbox) return;
    const files = lightboxFiles;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight" && lightbox.idx >= 0 && lightbox.idx < files.length - 1)
        setLightbox({ ...lightbox, file: files[lightbox.idx + 1], idx: lightbox.idx + 1 });
      if (e.key === "ArrowLeft" && lightbox.idx > 0)
        setLightbox({ ...lightbox, file: files[lightbox.idx - 1], idx: lightbox.idx - 1 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, lightboxFiles]);

  async function toggleSelect(file: DriveFile, moodId?: string) {
    if (finalizeInfo.finalized) return;
    const isSelected = file.selected;
    if (!isSelected && limitReached) return;

    // Optimistic update — gallery
    setGallery(g => g.map(f => f.id === file.id ? { ...f, selected: !isSelected } : f));
    // Optimistic update — moods
    setMoods(ms => ms.map(m => ({
      ...m,
      files: m.files.map(f => f.id === file.id ? { ...f, selected: !isSelected } : f),
    })));
    setSelectionsCount(c => c + (isSelected ? -1 : 1));

    try {
      const res = await fetch(`${API}/api/client/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code, image_id: file.id, image_name: file.name,
          action: isSelected ? "remove" : "add",
        }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert
      setGallery(g => g.map(f => f.id === file.id ? { ...f, selected: isSelected } : f));
      setMoods(ms => ms.map(m => ({
        ...m,
        files: m.files.map(f => f.id === file.id ? { ...f, selected: isSelected } : f),
      })));
      setSelectionsCount(c => c + (isSelected ? 1 : -1));
      showToast("Erro ao atualizar seleção. Tente novamente.");
    }
  }

  async function handleFinalize() {
    openConfirm(
      "Finalizar seleção?",
      `Você selecionou ${selectionsCount} de ${maxSelections} fotos. Tem certeza que deseja finalizar? Você poderá reabrir em até 6 horas (máx. 3 vezes).`,
      async () => {
        setFinalizing(true);
        try {
          const res = await fetch(`${API}/api/client/finalize?code=${encodeURIComponent(code)}`, { method: "POST" });
          const d = await res.json();
          if (!res.ok) { showToast(d.detail || "Erro ao finalizar."); return; }
          setFinalizeInfo({
            finalized: true,
            can_reopen: d.can_reopen,
            reopen_seconds_left: d.reopen_seconds_left ?? 0,
            unlock_count: 3 - (d.reopens_remaining ?? 3),
            locked: false,
          });
        } finally { setFinalizing(false); }
      },
      "Finalizar"
    );
  }

  async function handleReopen() {
    openConfirm(
      "Reabrir seleção?",
      `Você usará ${finalizeInfo.unlock_count + 1} de 3 tentativas. Após reabrir, terá ${Math.floor(countdown / 3600)}h para refazer a seleção.`,
      async () => {
        const res = await fetch(`${API}/api/client/reopen?code=${encodeURIComponent(code)}`, { method: "POST" });
        const d = await res.json();
        if (!res.ok) { showToast(d.detail || "Não foi possível reabrir."); return; }
        setFinalizeInfo({
          finalized: false, can_reopen: false,
          reopen_seconds_left: d.reopen_seconds_left ?? 0,
          unlock_count: d.reopens_used ?? 0,
          locked: false,
        });
        fetchData();
      },
      "Reabrir"
    );
  }

  function fmtTime(secs: number) {
    const h = Math.floor(secs / 3600).toString().padStart(2, "0");
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
    const ss = (secs % 60).toString().padStart(2, "0");
    return `${h}:${m}:${ss}`;
  }

  function thumbSrc(file: DriveFile) {
    if (file.cachedThumbUrl) return `${API}${file.cachedThumbUrl}`;
    return file.thumbnailUrl ?? `${API}${file.proxyUrl}`;
  }
  function lightboxSrcFn(file: DriveFile) {
    if (file.cachedMdUrl) return `${API}${file.cachedMdUrl}`;
    return file.thumbnailUrl ?? `${API}${file.proxyUrl}`;
  }

  const hasMoods = moods.length > 0;

  if (loading) return (
    <div style={s.center}>
      <div style={s.spinner} />
    </div>
  );
  if (error) return <div style={s.center}><p style={{ color: "#f87171" }}>{error}</p></div>;
  if (!info) return null;

  return (
    <div style={s.root}>
      {/* ── Header ── */}
      <header style={s.header}>
        <div>
          <h1 style={s.clientName}>{info.name}</h1>
          {info.session_date && (
            <p style={s.sessionDate}>
              {new Date(info.session_date + "T12:00:00").toLocaleDateString("pt-BR", { dateStyle: "long" })}
            </p>
          )}
        </div>
        <div style={s.counter}>
          <span style={{ fontSize: 22, fontWeight: 700, color: limitReached ? "#4ade80" : "#fff" }}>
            {selectionsCount}
          </span>
          <span style={{ color: "#555", fontSize: 14 }}>/{maxSelections}</span>
        </div>
      </header>

      {/* ── Banners ── */}
      {info.status === "syncing" && (
        <div style={s.banner}>Preparando sua galeria em alta qualidade... aguarde.</div>
      )}
      {finalizeInfo.finalized && (
        <div style={{ ...s.banner, background: "#052e16", borderColor: "#166534", color: "#4ade80" }}>
          Seleção finalizada!
          {finalizeInfo.can_reopen && countdown > 0 && (
            <span style={{ marginLeft: 12, fontSize: 13, color: "#86efac" }}>
              Reabrir disponível por {fmtTime(countdown)}
              {" "}({3 - finalizeInfo.unlock_count} tentativas restantes)
              {" "}
              <button style={s.reabrirBtn} onClick={handleReopen}>Reabrir</button>
            </span>
          )}
          {(!finalizeInfo.can_reopen || countdown <= 0) && (
            <span style={{ marginLeft: 12, fontSize: 13, color: "#555" }}>
              {finalizeInfo.locked ? "Bloqueado pelo fotógrafo." : "Prazo para reabrir encerrado."}
            </span>
          )}
        </div>
      )}
      {limitReached && !finalizeInfo.finalized && (
        <div style={{ ...s.banner, background: "#0f172a", borderColor: "#1e40af", color: "#93c5fd" }}>
          Você atingiu o limite de {maxSelections} fotos. Revise sua seleção ou finalize.
        </div>
      )}
      {info.notes && (
        <div style={{ ...s.banner, background: "#1a1a1a", borderColor: "#333", color: "#888" }}>
          {info.notes}
        </div>
      )}

      {/* ── Moodboard (referências) ── */}
      {moodboard.length > 0 && (
        <section style={s.section}>
          <h2 style={s.sTitle}>Referências</h2>
          <div style={s.grid}>
            {moodboard.map(f => (
              <div key={f.id} style={s.card} onClick={() => setLightbox({ file: f, idx: -1, source: "gallery" })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbSrc(f)} alt={f.name} style={s.img} loading="lazy" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Moods (subpastas Mood_*) ── */}
      {hasMoods && (
        <section style={s.section}>
          <h2 style={s.sTitle}>Moods</h2>
          <MoodsContainer
            moods={moods}
            expandedMood={expandedMood}
            onExpand={(id) => setExpandedMood(expandedMood === id ? null : id)}
            onClose={() => setExpandedMood(null)}
            thumbSrc={thumbSrc}
            lightboxSrc={lightboxSrcFn}
            onSelect={(file, moodId) => toggleSelect(file, moodId)}
            onLightbox={(file, idx, moodId) => setLightbox({ file, idx, source: "mood", moodId })}
            finalized={finalizeInfo.finalized}
            limitReached={limitReached}
          />
        </section>
      )}

      {/* ── Gallery (fotos sem mood) ── */}
      {gallery.length > 0 && (
        <section style={{ ...s.section, paddingBottom: allSelectedFiles.length > 0 ? 160 : 24 }}>
          <h2 style={s.sTitle}>{hasMoods ? "Outras fotos" : "Galeria"}</h2>
          <div style={s.grid}>
            {gallery.map((file, idx) => {
              const isSelected = !!file.selected;
              const showCheckbox = !finalizeInfo.finalized && (isSelected || !limitReached);
              return (
                <div
                  key={file.id}
                  style={{
                    ...s.card,
                    outline: isSelected ? "3px solid #fff" : "none",
                    outlineOffset: -3,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbSrc(file)}
                    alt={file.name}
                    style={s.img}
                    loading="lazy"
                    onClick={() => setLightbox({ file, idx, source: "gallery" })}
                  />
                  {showCheckbox && (
                    <button
                      style={{
                        ...s.checkbox,
                        background: isSelected ? "#fff" : "rgba(0,0,0,0.55)",
                        border: isSelected ? "2px solid #fff" : "2px solid rgba(255,255,255,0.4)",
                      }}
                      onClick={e => { e.stopPropagation(); toggleSelect(file); }}
                      aria-label={isSelected ? "Remover seleção" : "Selecionar"}
                    >
                      {isSelected && <span style={{ color: "#000", fontSize: 12, fontWeight: 700 }}>✓</span>}
                    </button>
                  )}
                  {isSelected && !showCheckbox && (
                    <div style={s.selectedBadge}>✓</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* No content state */}
      {gallery.length === 0 && moods.length === 0 && moodboard.length === 0 && (
        <section style={s.section}>
          <p style={{ color: "#555", textAlign: "center", paddingTop: 40 }}>
            {info.status === "syncing" ? "Preparando suas fotos..." : "Nenhuma foto disponível ainda."}
          </p>
        </section>
      )}

      {/* ── Fixed bottom selection bar ── */}
      {allSelectedFiles.length > 0 && (
        <div style={s.bottomBar}>
          {!finalizeInfo.finalized && (
            <div style={s.bottomBarTop}>
              <span style={s.bottomBarCount}>{selectionsCount}/{maxSelections} selecionadas</span>
              <button style={s.finalizeBtn} onClick={handleFinalize} disabled={finalizing}>
                {finalizing ? "Finalizando..." : "Finalizar seleção →"}
              </button>
            </div>
          )}
          <div style={s.bottomBarThumbs}>
            {allSelectedFiles.map(f => (
              <div
                key={f.id}
                style={s.bottomThumb}
                onClick={() => setLightbox({ file: f, idx: -1, source: "gallery" })}
                title={f.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbSrc(f)} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {!finalizeInfo.finalized && (
                  <button
                    style={s.removeBadge}
                    onClick={e => { e.stopPropagation(); toggleSelect(f); }}
                    aria-label="Remover"
                  >✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div style={s.lightboxOverlay} onClick={e => { if (e.target === e.currentTarget) setLightbox(null); }}>
          <button style={s.lightboxClose} onClick={() => setLightbox(null)}>✕</button>

          {lightbox.idx > 0 && (
            <button style={{ ...s.lightboxNav, left: 12 }}
              onClick={() => setLightbox({ ...lightbox, file: lightboxFiles[lightbox.idx - 1], idx: lightbox.idx - 1 })}>‹</button>
          )}
          {lightbox.idx >= 0 && lightbox.idx < lightboxFiles.length - 1 && (
            <button style={{ ...s.lightboxNav, right: 12 }}
              onClick={() => setLightbox({ ...lightbox, file: lightboxFiles[lightbox.idx + 1], idx: lightbox.idx + 1 })}>›</button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxSrcFn(lightbox.file)} alt={lightbox.file.name} style={s.lightboxImg} />

          <div style={s.lightboxFooter}>
            <span style={{ color: "#ccc", fontSize: 14, flex: 1 }}>{lightbox.file.name}</span>
            {!finalizeInfo.finalized && (
              <button
                style={{
                  ...s.lightboxSelectBtn,
                  background: lightbox.file.selected ? "transparent" : "#fff",
                  color: lightbox.file.selected ? "#f87171" : "#000",
                  border: lightbox.file.selected ? "1px solid #f87171" : "none",
                }}
                onClick={() => toggleSelect(lightbox.file, lightbox.moodId)}
                disabled={!lightbox.file.selected && limitReached}
              >
                {lightbox.file.selected ? "✕ Remover" : "+ Selecionar"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Confirm modal ── */}
      {confirmModal.open && (
        <div style={s.modalOverlay} onClick={e => { if (e.target === e.currentTarget) setConfirmModal(p => ({...p, open: false})); }}>
          <div style={s.modalBox}>
            <h3 style={s.modalTitle}>{confirmModal.title}</h3>
            <p style={s.modalMsg}>{confirmModal.message}</p>
            <div style={s.modalBtns}>
              <button style={s.modalCancel} onClick={() => setConfirmModal(p => ({...p, open: false}))}>Cancelar</button>
              <button style={s.modalConfirm} onClick={() => { setConfirmModal(p => ({...p, open: false})); confirmModal.onConfirm(); }}>
                {confirmModal.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}

// ─── VHS Animation Styles ────────────────────────────────────────────────────

const VHS_STYLES = `
@keyframes vhsPanelExpand {
  0%   { transform: scaleY(0.01) scaleX(0.3); opacity: 0; max-height: 0; }
  30%  { transform: scaleY(0.01) scaleX(1); opacity: 0.5; max-height: 4px; }
  50%  { transform: scaleY(0.02) scaleX(1); opacity: 0.8; max-height: 8px; }
  100% { transform: scaleY(1) scaleX(1); opacity: 1; max-height: 80vh; }
}
@keyframes menuSlideIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

// ─── Moods Container ────────────────────────────────────────────────────────

interface MoodsContainerProps {
  moods: Mood[];
  expandedMood: string | null;
  onExpand: (id: string) => void;
  onClose: () => void;
  thumbSrc: (f: DriveFile) => string;
  lightboxSrc: (f: DriveFile) => string;
  onSelect: (f: DriveFile, moodId: string) => void;
  onLightbox: (f: DriveFile, idx: number, moodId: string) => void;
  finalized: boolean;
  limitReached: boolean;
}

function MoodsContainer({ moods, expandedMood, onExpand, onClose, thumbSrc, onSelect, onLightbox, finalized, limitReached }: MoodsContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const useCarousel = moods.length > 3;

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.7;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <div>
      <style>{VHS_STYLES}</style>

      {/* Expanded panel — ABOVE cards, pushes them down. VHS animation. */}
      {expandedMood && (() => {
        const mood = moods.find(m => m.id === expandedMood);
        if (!mood) return null;
        const selectedInMood = mood.files.filter(f => f.selected).length;
        return (
          <div style={{
            marginBottom: 16,
            background: "#0a0a0a",
            borderRadius: 14,
            border: "1px solid #222",
            overflow: "hidden",
            transformOrigin: "center top",
            animation: "vhsPanelExpand 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}>
            {/* Panel header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #1a1a1a" }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 }}>{mood.title}</h3>
                <p style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{mood.files.length} fotos{selectedInMood > 0 ? ` · ${selectedInMood} selecionadas` : ""}</p>
              </div>
              <button
                onClick={onClose}
                style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 34, height: 34, color: "#888", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >✕</button>
            </div>
            {/* Photo grid */}
            <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(120px, 40vw), 1fr))", gap: 8, maxHeight: "65vh", overflowY: "auto" }}>
              {mood.files.map((file, idx) => {
                const isSelected = !!file.selected;
                const showCheckbox = !finalized && (isSelected || !limitReached);
                return (
                  <div key={file.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: "#1a1a1a", cursor: "pointer", outline: isSelected ? "3px solid #fff" : "none", outlineOffset: -3 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbSrc(file)} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" onClick={() => onLightbox(file, idx, mood.id)} />
                    {showCheckbox && (
                      <button
                        style={{ position: "absolute", top: 6, left: 6, width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: isSelected ? "#fff" : "rgba(0,0,0,0.55)", border: isSelected ? "2px solid #fff" : "2px solid rgba(255,255,255,0.4)" }}
                        onClick={e => { e.stopPropagation(); onSelect(file, mood.id); }}
                      >
                        {isSelected && <span style={{ color: "#000", fontSize: 13, fontWeight: 700 }}>✓</span>}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Mood cards — centered grid, max 3 per row, carousel if >3 */}
      <div style={{ position: "relative" }}>
        {useCarousel && (
          <>
            <button onClick={() => scroll("left")} style={{ position: "absolute", left: -4, top: "50%", transform: "translateY(-50%)", zIndex: 10, background: "rgba(0,0,0,0.7)", border: "1px solid #333", borderRadius: "50%", width: 32, height: 32, color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <button onClick={() => scroll("right")} style={{ position: "absolute", right: -4, top: "50%", transform: "translateY(-50%)", zIndex: 10, background: "rgba(0,0,0,0.7)", border: "1px solid #333", borderRadius: "50%", width: 32, height: 32, color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          </>
        )}

        <div
          ref={scrollRef}
          style={{
            display: "flex",
            gap: 14,
            justifyContent: "center",
            overflowX: useCarousel ? "auto" : "visible",
            scrollSnapType: useCarousel ? "x mandatory" : undefined,
            scrollbarWidth: "none",
            padding: useCarousel ? "0 24px" : "0",
            flexWrap: useCarousel ? "nowrap" : "wrap",
          }}
        >
          {moods.map(mood => (
            <div key={mood.id} style={{ scrollSnapAlign: "center", flexShrink: 0 }}>
              <MoodCard
                mood={mood}
                isActive={expandedMood === mood.id}
                onExpand={() => onExpand(mood.id)}
                thumbSrc={thumbSrc}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mood Card Component ─────────────────────────────────────────────────────

interface MoodCardProps {
  mood: Mood;
  isActive: boolean;
  onExpand: () => void;
  thumbSrc: (f: DriveFile) => string;
}

function MoodCard({ mood, isActive, onExpand, thumbSrc }: MoodCardProps) {
  const [slideIdx, setSlideIdx] = useState(0);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (mood.files.length <= 1) return;
    const interval = setInterval(() => {
      setSlideIdx(prev => (prev + 1) % mood.files.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [mood.files.length]);

  const selectedInMood = mood.files.filter(f => f.selected).length;

  return (
    <div
      style={{
        position: "relative",
        width: "min(200px, 44vw)",
        aspectRatio: "1",
        borderRadius: 12,
        overflow: "hidden",
        background: "#111",
        cursor: "pointer",
        border: isActive ? "2px solid #fff" : "1px solid #222",
        transition: "border-color 0.3s, transform 0.3s",
        transform: hovered ? "scale(1.03)" : "scale(1)",
      }}
      onClick={onExpand}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Slideshow */}
      {mood.files.slice(0, 5).map((file, idx) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={file.id}
          src={thumbSrc(file)}
          alt=""
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            transition: "opacity 0.8s ease-in-out",
            opacity: idx === slideIdx % Math.min(mood.files.length, 5) ? 1 : 0,
          }}
          loading="lazy"
        />
      ))}

      {/* Overlay + Title */}
      <div style={{
        position: "absolute", inset: 0,
        background: hovered || isActive ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.15)",
        transition: "background 0.3s",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <h3 style={{
          color: "#fff", fontSize: "clamp(14px, 4vw, 20px)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
          opacity: hovered || isActive ? 1 : 0, transform: hovered || isActive ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 0.3s, transform 0.3s",
          textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          textAlign: "center", padding: "0 8px",
        }}>
          {mood.title}
        </h3>
        <p style={{
          color: "#aaa", fontSize: 11, marginTop: 4,
          opacity: hovered || isActive ? 1 : 0, transition: "opacity 0.3s 0.05s",
        }}>
          {mood.files.length} fotos
        </p>
      </div>

      {/* Selection badge */}
      {selectedInMood > 0 && (
        <div style={{ position: "absolute", top: 8, right: 8, background: "#fff", color: "#000", borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700, zIndex: 2 }}>
          {selectedInMood}
        </div>
      )}
    </div>
  );
}

// ─── Styles (mobile-first, no Tailwind) ──────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:    { minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" },
  center:  { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a0a0a" },
  spinner: { width: 36, height: 36, border: "3px solid #222", borderTop: "3px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" },

  header:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 16px 12px", borderBottom: "1px solid #1a1a1a", gap: 12 },
  clientName:  { fontSize: "clamp(18px, 5vw, 26px)", fontWeight: 700, marginBottom: 4 },
  sessionDate: { fontSize: 13, color: "#555" },
  counter:     { textAlign: "right", flexShrink: 0 },

  banner: { margin: "0 16px 2px", padding: "10px 14px", borderRadius: 8, border: "1px solid #333", fontSize: 13, background: "#1a1a0a", color: "#fbbf24" },
  reabrirBtn: { background: "#fff", color: "#000", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" },

  section: { padding: "20px 16px" },
  sTitle:  { fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", color: "#555", textTransform: "uppercase" as const, marginBottom: 14 },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(140px, 44vw), 1fr))",
    gap: 8,
  },
  card: { position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", background: "#111", cursor: "pointer" },
  img:  { width: "100%", height: "100%", objectFit: "cover", display: "block" },

  checkbox: { position: "absolute", top: 6, left: 6, width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s" },
  selectedBadge: { position: "absolute", top: 6, left: 6, width: 22, height: 22, borderRadius: 6, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#000" },

  bottomBar: {
    position: "fixed", bottom: 0, left: 0, right: 0,
    background: "rgba(10,10,10,0.97)", backdropFilter: "blur(16px)",
    borderTop: "1px solid #222", zIndex: 50,
    paddingBottom: "env(safe-area-inset-bottom)",
  },
  bottomBarTop: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 6px", gap: 10 },
  bottomBarCount: { color: "#888", fontSize: 13, whiteSpace: "nowrap" as const },
  finalizeBtn: {
    background: "#fff", color: "#000", border: "none", borderRadius: 8,
    padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  bottomBarThumbs: {
    display: "flex", gap: 8, overflowX: "auto" as const,
    padding: "0 16px 12px", scrollbarWidth: "none" as const,
  },
  bottomThumb: {
    position: "relative", width: 60, height: 60, flexShrink: 0,
    borderRadius: 8, overflow: "hidden", cursor: "pointer",
    border: "2px solid #333",
  },
  removeBadge: {
    position: "absolute", top: 2, right: 2, width: 18, height: 18,
    background: "rgba(0,0,0,0.7)", border: "none", borderRadius: 4,
    color: "#f87171", fontSize: 10, fontWeight: 700, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },

  lightboxOverlay: {
    position: "fixed", inset: 0, zIndex: 100,
    background: "rgba(0,0,0,0.95)", backdropFilter: "blur(20px)",
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
  },
  lightboxImg: { maxWidth: "95vw", maxHeight: "78vh", objectFit: "contain", borderRadius: 8 },
  lightboxClose: {
    position: "absolute", top: 16, right: 16,
    background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%",
    color: "#fff", width: 40, height: 40, fontSize: 18, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  lightboxNav: {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
    fontSize: 32, width: 44, height: 44, borderRadius: "50%", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  lightboxFooter: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    display: "flex", alignItems: "center", gap: 12,
    padding: "14px 20px", background: "linear-gradient(transparent, rgba(0,0,0,0.9))",
    paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
  },
  lightboxSelectBtn: {
    flexShrink: 0, border: "none", borderRadius: 8,
    padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
  },

  modalOverlay: {
    position: "fixed", inset: 0, zIndex: 200,
    background: "rgba(0,0,0,0.88)", backdropFilter: "blur(12px)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  },
  modalBox: {
    background: "#111", border: "1px solid #333", borderRadius: 16,
    padding: "28px 24px", maxWidth: 380, width: "100%",
  },
  modalTitle: { fontSize: 20, fontWeight: 700, marginBottom: 10 },
  modalMsg:   { color: "#888", fontSize: 14, lineHeight: 1.6, marginBottom: 22 },
  modalBtns:  { display: "flex", gap: 10 },
  modalCancel:  { flex: 1, background: "transparent", border: "1px solid #333", borderRadius: 8, color: "#888", padding: "11px", fontSize: 14, cursor: "pointer" },
  modalConfirm: { flex: 1, background: "#fff", border: "none", borderRadius: 8, color: "#000", padding: "11px", fontSize: 14, fontWeight: 700, cursor: "pointer" },

  toast: {
    position: "fixed", bottom: 180, left: "50%", transform: "translateX(-50%)",
    background: "#333", color: "#fff", borderRadius: 8, padding: "10px 18px",
    fontSize: 13, zIndex: 300, whiteSpace: "nowrap" as const,
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
  },
};
