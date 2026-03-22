"""
Morthe API — Backend principal
Gerencia a área do cliente e do administrador com integração ao Google Drive.
"""
import os
import io
import re
import json
import secrets
import string
import shutil
import threading
import requests
from PIL import Image
from typing import Optional, List

from fastapi import FastAPI, HTTPException, BackgroundTasks, Header, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from colorthief import ColorThief
from dotenv import load_dotenv

import database

# ─── Bootstrap ───────────────────────────────────────────────────────────────

load_dotenv()

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "M0rTh3")

# Drive: usa escopo completo para poder criar subpastas e copiar arquivos
SCOPES = ["https://www.googleapis.com/auth/drive"]

# ── Dirs de dados ───────────────────────────────────────────────────────────────
# Em produção (Render): DATA_DIR=/data  (persistent disk)
# Em desenvolvimento: usa api/ local
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRIVE_FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "1fQzGW9Kg4-kG3SqMsMbOBNF3AWJ2SGeI")
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(BASE_DIR, "api"))

# Credenciais da Service Account
# Em produção, o arquivo é copiado para DATA_DIR via deploy ou env var GOOGLE_SA_JSON
SERVICE_ACCOUNT_PATH = os.environ.get(
    "GOOGLE_SA_PATH",
    os.path.join(BASE_DIR, "website", "public", "morthe-83002885203b.json"),
)

# Cache de thumbnails — servido estaticamente pelo FastAPI
THUMB_CACHE_DIR = os.path.join(DATA_DIR, "thumb_cache")
os.makedirs(THUMB_CACHE_DIR, exist_ok=True)

# Pasta legada (slideshow da home) — continua local
SYNC_DIR = os.path.join(BASE_DIR, "website", "public", "destaques_sync")
METADATA_FILE = os.path.join(SYNC_DIR, "metadata.json")
os.makedirs(SYNC_DIR, exist_ok=True)


def find_watermark() -> Optional[str]:
    """Procura o arquivo de marca d'água em public/ com qualquer extensão de imagem."""
    public_dir = os.path.join(BASE_DIR, "website", "public")
    for ext in ("png", "webp", "jpg", "jpeg", "PNG", "WEBP", "JPG", "JPEG"):
        path = os.path.join(public_dir, f"marcadagua.{ext}")
        if os.path.exists(path):
            return path
    return None


def sync_client_thumbnails(client: dict):
    """
    Baixa TODAS as imagens da pasta do Drive (galeria + moodboard),
    aplica a marca d'água e salva como WebP em thumb_cache/{code}/.
    Executado em background thread — não bloqueia a API.
    """
    code = client["code"]
    folder_id = client["drive_gallery_id"]
    client_id = client["id"]

    cache_dir = os.path.join(THUMB_CACHE_DIR, code)
    mood_dir  = os.path.join(cache_dir, "moodboard")
    os.makedirs(cache_dir, exist_ok=True)
    os.makedirs(mood_dir,  exist_ok=True)

    print(f"[SYNC] Iniciando sync para '{client['name']}' ({code})")
    database.update_client(client_id, status="syncing")

    try:
        service = get_drive_service()

        # ── Carrega marca d'água uma vez ─────────────────────────────
        watermark_img: Optional[Image.Image] = None
        wm_path = find_watermark()
        if wm_path:
            try:
                watermark_img = Image.open(wm_path).convert("RGBA")
                print(f"[SYNC] Marca d'água carregada: {wm_path}")
            except Exception as e:
                print(f"[WARN] Não foi possível carregar marca d'água: {e}")

        def _apply_watermark(base: Image.Image) -> Image.Image:
            """Centraliza a marca d'água com 50% da largura e 10% de opacidade."""
            if not watermark_img:
                return base
            wm = watermark_img.copy()
            # Marca ocupa 50% da largura da imagem base
            wm_w = max(int(base.width * 0.50), 60)
            ratio = wm_w / wm.width
            wm_h = int(wm.height * ratio)
            wm = wm.resize((wm_w, wm_h), Image.LANCZOS)
            # Reduz opacidade para 10%
            r, g, b, a = wm.split()
            a = a.point(lambda x: int(x * 0.10))
            wm.putalpha(a)
            # Posição: centro da imagem
            pos = ((base.width - wm_w) // 2, (base.height - wm_h) // 2)
            canvas = base.copy()
            canvas.paste(wm, pos, wm)
            return canvas

        def _process_file(service, file_id: str, file_name: str, out_dir: str) -> bool:
            """Baixa um arquivo do Drive, aplica watermark e salva WebP nos dois tamanhos."""
            sm_path = os.path.join(out_dir, f"{file_id}_sm.webp")
            md_path = os.path.join(out_dir, f"{file_id}_md.webp")
            if os.path.exists(sm_path) and os.path.exists(md_path):
                return True  # já em cache

            request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            fh.seek(0)

            original = Image.open(fh).convert("RGBA")

            if not os.path.exists(sm_path):
                sm = original.copy()
                sm.thumbnail((400, 400), Image.LANCZOS)
                sm = _apply_watermark(sm)
                sm.convert("RGB").save(sm_path, "WEBP", quality=82, method=4)

            if not os.path.exists(md_path):
                md = original.copy()
                md.thumbnail((900, 900), Image.LANCZOS)
                md = _apply_watermark(md)
                md.convert("RGB").save(md_path, "WEBP", quality=88, method=4)

            return True

        # ── Sync galeria principal ────────────────────────────────────
        query_gallery = (
            f"'{folder_id}' in parents "
            f"and mimeType contains 'image/' "
            f"and trashed = false "
            f"and not name contains 'Moodboard_'"
        )
        gallery_files = service.files().list(
            q=query_gallery, fields="files(id, name)",
            supportsAllDrives=True, includeItemsFromAllDrives=True, pageSize=200,
        ).execute().get("files", [])

        # ── Sync moodboard ────────────────────────────────────────────
        query_mood = (
            f"'{folder_id}' in parents "
            f"and mimeType contains 'image/' "
            f"and trashed = false "
            f"and name contains 'Moodboard_'"
        )
        mood_files = service.files().list(
            q=query_mood, fields="files(id, name)",
            supportsAllDrives=True, includeItemsFromAllDrives=True, pageSize=50,
        ).execute().get("files", [])

        total = len(gallery_files) + len(mood_files)
        print(f"[SYNC] {len(gallery_files)} fotos de galeria + {len(mood_files)} moodboard")

        synced = 0
        for f in gallery_files:
            try:
                _process_file(service, f["id"], f["name"], cache_dir)
                synced += 1
                print(f"[SYNC] galeria {synced}/{total} — {f['name']}")
            except Exception as e:
                print(f"[WARN] Erro em '{f['name']}': {e}")

        for f in mood_files:
            try:
                _process_file(service, f["id"], f["name"], mood_dir)
                synced += 1
                print(f"[SYNC] moodboard {synced}/{total} — {f['name']}")
            except Exception as e:
                print(f"[WARN] Erro em '{f['name']}': {e}")

        database.update_client(client_id, status="gallery_ready")
        print(f"[SYNC] Concluído '{client['name']}': {synced}/{total} arquivos.")

    except Exception as e:
        print(f"[ERROR] Falha no sync para '{code}': {e}")
        database.update_client(client_id, status="pending")

app = FastAPI(title="Morthe API", version="2.0.0")

# Serve thumbnails diretamente via FastAPI (produção: backend é separado do Next.js)
app.mount("/thumb_cache", StaticFiles(directory=THUMB_CACHE_DIR), name="thumb_cache")

# CORS: permite frontend local e produção
_FRONTEND_URL = os.environ.get("FRONTEND_URL", "")
_ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:3001"]
if _FRONTEND_URL:
    _ALLOWED_ORIGINS.append(_FRONTEND_URL.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializa o banco de dados na startup
database.init_db()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def rgb_to_hex(rgb):
    return "#{:02x}{:02x}{:02x}".format(rgb[0], rgb[1], rgb[2])


def get_drive_service():
    """Retorna um cliente autenticado da API do Google Drive."""
    if not os.path.exists(SERVICE_ACCOUNT_PATH):
        raise HTTPException(
            status_code=500,
            detail=f"Credenciais da Service Account não encontradas em: {SERVICE_ACCOUNT_PATH}",
        )
    creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_PATH, scopes=SCOPES)
    return build("drive", "v3", credentials=creds)


def get_service_account_email() -> str:
    """Lê o email da Service Account do arquivo de credenciais."""
    try:
        with open(SERVICE_ACCOUNT_PATH, "r") as f:
            data = json.load(f)
            return data.get("client_email", "email não encontrado")
    except Exception:
        return "não foi possível ler o email"


def extract_folder_id(url: str) -> Optional[str]:
    """
    Extrai o folderId de uma URL do Google Drive.
    Suporta formatos:
      - https://drive.google.com/drive/folders/FOLDER_ID
      - https://drive.google.com/drive/u/0/folders/FOLDER_ID
    """
    match = re.search(r"/folders/([a-zA-Z0-9_-]+)", url)
    return match.group(1) if match else None


def generate_client_code() -> str:
    """
    Gera um código alfanumérico único de 8 caracteres (maiúsc + minúsc + dígitos).
    Exemplo: 'M7rT9xK2'
    """
    alphabet = string.ascii_letters + string.digits
    for _ in range(100):  # Limite de tentativas para evitar loop infinito
        code = "".join(secrets.choice(alphabet) for _ in range(8))
        if not database.code_exists(code):
            return code
    raise RuntimeError("Não foi possível gerar um código único. Tente novamente.")


def verify_admin(x_admin_token: str = Header(..., alias="X-Admin-Token")):
    """Dependency que valida o token de administrador no header."""
    if x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Token de administrador inválido.")


def get_client_or_404(code: str) -> dict:
    """Busca cliente pelo código ou retorna 404."""
    client = database.get_client_by_code(code)
    if not client:
        raise HTTPException(status_code=404, detail="Código de cliente não encontrado.")
    return client


def get_or_create_selection_folder(service, parent_folder_id: str) -> str:
    """
    Encontra ou cria a subpasta 'selection' dentro da pasta do cliente no Drive.
    A subpasta herda as permissões da pasta pai.
    """
    query = (
        f"'{parent_folder_id}' in parents "
        f"and name = 'selection' "
        f"and mimeType = 'application/vnd.google-apps.folder' "
        f"and trashed = false"
    )
    results = service.files().list(
        q=query,
        fields="files(id, name)",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()

    files = results.get("files", [])
    if files:
        return files[0]["id"]

    # Cria a pasta se não existir
    folder_meta = {
        "name": "selection",
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_folder_id],
    }
    folder = service.files().create(
        body=folder_meta, fields="id", supportsAllDrives=True
    ).execute()
    print(f"[DRIVE] Subpasta 'selection' criada: {folder['id']}")
    return folder["id"]


# ─── Models ──────────────────────────────────────────────────────────────────

class CreateClientRequest(BaseModel):
    name: str
    drive_gallery_url: str
    session_date: Optional[str] = None
    max_selections: int = 20
    notes: Optional[str] = None


class UpdateClientRequest(BaseModel):
    name: Optional[str] = None
    drive_gallery_url: Optional[str] = None
    session_date: Optional[str] = None
    max_selections: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class SelectionRequest(BaseModel):
    code: str
    image_id: str
    image_name: str
    action: str  # "add" ou "remove"


class ImageHighlight(BaseModel):
    id: str
    imageUrl: str
    colorPrimary: str
    colorSecondary: str


# ─── Rotas de Admin ──────────────────────────────────────────────────────────

@app.post("/api/admin/clients", dependencies=[Depends(verify_admin)])
def create_client(body: CreateClientRequest):
    """
    Cria um novo cliente.
    - Valida e extrai o folderId da URL do Drive.
    - Verifica se a pasta está acessível pela Service Account.
    - Gera automaticamente um código alfanumérico único de 8 chars.
    """
    folder_id = extract_folder_id(body.drive_gallery_url)
    if not folder_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "URL do Google Drive inválida. "
                "Use o formato: https://drive.google.com/drive/folders/ID_DA_PASTA"
            ),
        )

    # Valida acesso à pasta antes de salvar
    try:
        service = get_drive_service()
        service.files().get(
            fileId=folder_id, fields="id,name", supportsAllDrives=True
        ).execute()
    except Exception as e:
        sa_email = get_service_account_email()
        raise HTTPException(
            status_code=400,
            detail=(
                f"Não foi possível acessar a pasta do Drive. "
                f"Compartilhe a pasta como EDITOR com: {sa_email}. "
                f"Detalhe técnico: {str(e)}"
            ),
        )

    code = generate_client_code()
    client = database.create_client(
        name=body.name,
        code=code,
        drive_gallery_url=body.drive_gallery_url,
        drive_gallery_id=folder_id,
        session_date=body.session_date,
        max_selections=body.max_selections,
        notes=body.notes,
    )

    # Inicia sync de thumbnails em background (não bloqueia a resposta)
    if client:
        threading.Thread(
            target=sync_client_thumbnails,
            args=(client,),
            daemon=True,
        ).start()

    return {
        "message": f"Cliente criado! Sincronizando galeria em background… Código: {code}",
        "client": client,
        "code": code,
    }


@app.get("/api/admin/clients", dependencies=[Depends(verify_admin)])
def list_clients():
    """Lista todos os clientes com contagem de seleções."""
    clients = database.get_all_clients()
    for c in clients:
        c["selection_count"] = database.count_selections(c["code"])
    return clients


@app.get("/api/admin/clients/{client_id}", dependencies=[Depends(verify_admin)])
def get_client(client_id: int):
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    client["selection_count"] = database.count_selections(client["code"])
    client["selections"] = database.get_selections(client["code"])
    return client


@app.put("/api/admin/clients/{client_id}", dependencies=[Depends(verify_admin)])
def update_client(client_id: int, body: UpdateClientRequest):
    """
    Atualiza dados do cliente.
    Se a URL do Drive for alterada, re-valida o acesso e extrai o novo folderId.
    """
    existing = database.get_client_by_id(client_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    update_data = body.model_dump(exclude_none=True)

    if "drive_gallery_url" in update_data:
        folder_id = extract_folder_id(update_data["drive_gallery_url"])
        if not folder_id:
            raise HTTPException(
                status_code=400, detail="URL do Google Drive inválida."
            )
        # Valida o novo link
        try:
            service = get_drive_service()
            service.files().get(
                fileId=folder_id, fields="id,name", supportsAllDrives=True
            ).execute()
        except Exception as e:
            sa_email = get_service_account_email()
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Não foi possível acessar a nova pasta. "
                    f"Compartilhe como EDITOR com: {sa_email}. Erro: {str(e)}"
                ),
            )
        update_data["drive_gallery_id"] = folder_id

    client = database.update_client(client_id, **update_data)
    return client


@app.delete("/api/admin/clients/{client_id}", dependencies=[Depends(verify_admin)])
def delete_client(client_id: int):
    existing = database.get_client_by_id(client_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    # Remove cache de thumbnails (libera espaço em disco)
    cache_dir = os.path.join(THUMB_CACHE_DIR, existing["code"])
    if os.path.exists(cache_dir):
        shutil.rmtree(cache_dir)
        print(f"[CACHE] Pasta de thumbnails removida: {cache_dir}")

    database.delete_client(client_id)
    return {"message": f"Cliente '{existing['name']}' removido com sucesso."}


@app.get("/api/admin/clients/{client_id}/selections", dependencies=[Depends(verify_admin)])
def admin_get_selections(client_id: int):
    """Retorna as fotos selecionadas pelo cliente (visão do admin)."""
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    selections = database.get_selections(client["code"])
    return {
        "client_name": client["name"],
        "client_code": client["code"],
        "max_selections": client["max_selections"],
        "selections": selections,
        "total": len(selections),
    }


@app.get("/api/admin/validate-folder", dependencies=[Depends(verify_admin)])
def validate_folder(url: str = Query(...)):
    """
    Valida se uma URL do Drive está acessível pela Service Account.
    Útil para o admin verificar antes de cadastrar o cliente.
    """
    folder_id = extract_folder_id(url)
    if not folder_id:
        return {"valid": False, "error": "Não foi possível extrair o folder ID da URL."}
    try:
        service = get_drive_service()
        folder = service.files().get(
            fileId=folder_id, fields="id,name", supportsAllDrives=True
        ).execute()
        return {
            "valid": True,
            "folder_name": folder.get("name"),
            "folder_id": folder_id,
        }
    except Exception as e:
        sa_email = get_service_account_email()
        return {
            "valid": False,
            "folder_id": folder_id,
            "error": (
                f"Pasta não acessível. Compartilhe como EDITOR com a Service Account: {sa_email}"
            ),
            "detail": str(e),
        }


@app.get("/api/admin/service-account-email", dependencies=[Depends(verify_admin)])
def get_sa_email():
    """Retorna o email da Service Account para o admin poder compartilhar pastas."""
    return {"email": get_service_account_email()}


# ─── Rotas de Cliente ────────────────────────────────────────────────────────

@app.get("/api/client/verify")
def verify_client(code: str = Query(...)):
    """Verifica se o código é válido — endpoint de login do cliente."""
    client = database.get_client_by_code(code)
    if not client:
        return {"valid": False}
    return {
        "valid": True,
        "session_date": client.get("session_date"),
        "status": client.get("status"),
    }


@app.get("/api/client/info")
def get_client_info(code: str = Query(...)):
    """Retorna informações públicas da sessão do cliente."""
    client = get_client_or_404(code)
    selections = database.get_selections(code)
    return {
        "name": client["name"],
        "session_date": client["session_date"],
        "status": client["status"],
        "max_selections": client["max_selections"],
        "current_selections": len(selections),
        "notes": client.get("notes"),
    }


@app.get("/api/client/gallery")
def get_gallery(code: str = Query(...)):
    """
    Retorna a lista de imagens da galeria do cliente do Google Drive.
    Exclui automaticamente arquivos cujo nome começa com 'Moodboard_'.
    Não faz download — retorna metadados + URL de proxy para streaming sob demanda.
    """
    client = get_client_or_404(code)
    folder_id = client.get("drive_gallery_id")
    if not folder_id:
        raise HTTPException(
            status_code=404, detail="Nenhuma galeria configurada para este cliente."
        )

    try:
        service = get_drive_service()
        query = (
            f"'{folder_id}' in parents "
            f"and (mimeType contains 'image/') "
            f"and trashed = false "
            f"and name != 'selection'"  # Exclui subpasta
        )
        results = service.files().list(
            q=query,
            pageSize=200,
            fields="files(id, name, mimeType, thumbnailLink, size)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            orderBy="name",
        ).execute()

        files = results.get("files", [])

        # Separa moodboard da galeria principal
        gallery_files = [f for f in files if not f["name"].lower().startswith("moodboard_")]

        # Ids das fotos já selecionadas pelo cliente
        selected_ids = {s["image_id"] for s in database.get_selections(code)}

        # Pasta de cache local para este cliente
        cache_dir = os.path.join(THUMB_CACHE_DIR, code)

        gallery = []
        for f in gallery_files:
            file_id = f["id"]

            # Prioridade 1: cache local WebP (servido pelo Next.js, super rápido)
            sm_cache = os.path.join(cache_dir, f"{file_id}_sm.webp")
            md_cache = os.path.join(cache_dir, f"{file_id}_md.webp")

            if os.path.exists(sm_cache):
                cached_thumb = f"/thumb_cache/{code}/{file_id}_sm.webp"
                cached_md    = f"/thumb_cache/{code}/{file_id}_md.webp"
            else:
                cached_thumb = None
                cached_md    = None

            # Fallback: thumbnail do Google CDN (pode expirar)
            drive_thumb = f.get("thumbnailLink", "")
            if drive_thumb:
                drive_thumb = re.sub(r"=s\d+", "=s400", drive_thumb)

            gallery.append({
                "id": file_id,
                "name": f["name"],
                # cachedThumbUrl: URL estática do servidor (preferido)
                "cachedThumbUrl": cached_thumb,
                "cachedMdUrl":    cached_md,
                # thumbnailUrl: fallback Google CDN
                "thumbnailUrl": drive_thumb or None,
                "proxyUrl": f"/api/client/file/{file_id}?code={code}",
                "selected": file_id in selected_ids,
                "cached": cached_thumb is not None,
            })

        # Atualiza status se ainda estava pending
        if gallery_files and client["status"] == "pending":
            database.update_client(client["id"], status="gallery_ready")

        return {
            "files": gallery,
            "total": len(gallery),
            "synced": sum(1 for g in gallery if g["cached"]),
            "status": client["status"],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Falha ao buscar galeria do Drive: {str(e)}"
        )


@app.get("/api/client/moodboard")
def get_moodboard(code: str = Query(...)):
    """
    Retorna os arquivos de moodboard do cliente.
    Lê arquivos cujo nome começa com 'Moodboard_' na pasta da galeria do cliente.
    Convenção: Moodboard_NomeCliente.jpg na pasta do cliente.
    """
    client = get_client_or_404(code)
    folder_id = client.get("drive_gallery_id")
    if not folder_id:
        raise HTTPException(
            status_code=404, detail="Nenhuma galeria configurada para este cliente."
        )

    try:
        service = get_drive_service()
        query = (
            f"'{folder_id}' in parents "
            f"and name contains 'Moodboard_' "
            f"and trashed = false"
        )
        results = service.files().list(
            q=query,
            fields="files(id, name, mimeType, thumbnailLink)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()

        files = results.get("files", [])
        mood_dir = os.path.join(THUMB_CACHE_DIR, code, "moodboard")
        moodboard = []
        for f in files:
            file_id = f["id"]
            sm_cache = os.path.join(mood_dir, f"{file_id}_sm.webp")
            md_cache = os.path.join(mood_dir, f"{file_id}_md.webp")

            cached_thumb = f"/thumb_cache/{code}/moodboard/{file_id}_sm.webp" if os.path.exists(sm_cache) else None
            cached_md    = f"/thumb_cache/{code}/moodboard/{file_id}_md.webp" if os.path.exists(md_cache) else None

            drive_thumb = f.get("thumbnailLink", "")
            if drive_thumb:
                drive_thumb = re.sub(r"=s\d+", "=s800", drive_thumb)

            moodboard.append({
                "id": file_id,
                "name": f["name"],
                "cachedThumbUrl": cached_thumb,
                "cachedMdUrl":    cached_md,
                "thumbnailUrl": drive_thumb or None,
                "proxyUrl": f"/api/client/file/{file_id}?code={code}",
            })

        return {"files": moodboard, "total": len(moodboard)}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Falha ao buscar moodboard: {str(e)}"
        )


@app.get("/api/client/file/{file_id}")
def stream_file(file_id: str, code: str = Query(...)):
    """
    Proxy de streaming: busca o arquivo do Drive e entrega ao browser sem armazenar em disco.
    O arquivo é transmitido em memória (BytesIO) e descartado após a resposta.
    """
    client = get_client_or_404(code)  # Garante que o código é válido antes de servir

    try:
        service = get_drive_service()
        file_meta = service.files().get(
            fileId=file_id,
            fields="id,name,mimeType",
            supportsAllDrives=True,
        ).execute()

        request = service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()

        fh.seek(0)
        mime = file_meta.get("mimeType", "image/jpeg")
        filename = file_meta.get("name", file_id)

        return StreamingResponse(
            fh,
            media_type=mime,
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Falha ao transmitir arquivo do Drive: {str(e)}"
        )


@app.post("/api/client/select")
def toggle_selection(body: SelectionRequest):
    """
    Adiciona ou remove uma foto das seleções do cliente.
    - 'add': verifica limite, salva no banco e copia o arquivo para a pasta 'selection/' no Drive.
    - 'remove': remove do banco e joga o arquivo da pasta 'selection/' para a lixeira no Drive.
    """
    client = get_client_or_404(body.code)

    if body.action == "add":
        current_count = database.count_selections(body.code)
        max_sel = client.get("max_selections", 20)
        if current_count >= max_sel:
            raise HTTPException(
                status_code=400,
                detail=f"Limite de seleções atingido ({max_sel}/{max_sel}). "
                       f"Para selecionar outra foto, remova uma já selecionada.",
            )

        database.save_selection(body.code, body.image_id, body.image_name)

        # Copia para a subpasta 'selection/' no Drive (não-bloqueante em caso de erro)
        try:
            service = get_drive_service()
            folder_id = client["drive_gallery_id"]
            sel_folder_id = get_or_create_selection_folder(service, folder_id)
            service.files().copy(
                fileId=body.image_id,
                body={"parents": [sel_folder_id], "name": body.image_name},
                supportsAllDrives=True,
            ).execute()
            print(f"[DRIVE] Arquivo '{body.image_name}' copiado para 'selection/'")
        except Exception as e:
            print(f"[WARN] Não foi possível copiar para 'selection/' no Drive: {e}")
            # A seleção está salva no banco mesmo se o Drive falhar

        # Atualiza status
        if client["status"] in ("pending", "gallery_ready"):
            database.update_client(client["id"], status="selecting")

    elif body.action == "remove":
        database.remove_selection(body.code, body.image_id)

        # Remove da pasta 'selection/' no Drive
        try:
            service = get_drive_service()
            folder_id = client["drive_gallery_id"]
            sel_folder_id = get_or_create_selection_folder(service, folder_id)
            q = (
                f"'{sel_folder_id}' in parents "
                f"and name = '{body.image_name}' "
                f"and trashed = false"
            )
            results = service.files().list(
                q=q, fields="files(id)", supportsAllDrives=True,
                includeItemsFromAllDrives=True
            ).execute()
            for f in results.get("files", []):
                service.files().trash(fileId=f["id"]).execute()
            print(f"[DRIVE] Arquivo '{body.image_name}' movido para lixeira em 'selection/'")
        except Exception as e:
            print(f"[WARN] Não foi possível remover de 'selection/' no Drive: {e}")

    else:
        raise HTTPException(
            status_code=400, detail="'action' deve ser 'add' ou 'remove'."
        )

    count = database.count_selections(body.code)
    return {
        "action": body.action,
        "current_selections": count,
        "max_selections": client["max_selections"],
        "remaining": client["max_selections"] - count,
    }


@app.get("/api/client/selections")
def get_client_selections(code: str = Query(...)):
    """Retorna as fotos já selecionadas pelo cliente."""
    client = get_client_or_404(code)
    selections = database.get_selections(code)
    return {
        "selections": selections,
        "count": len(selections),
        "max": client["max_selections"],
        "remaining": client["max_selections"] - len(selections),
    }


# ─── Finalizar / Reabrir Seleção ─────────────────────────────────────────────

from datetime import datetime, timedelta, timezone


def _can_reopen(client: dict) -> tuple[bool, str]:
    """
    Verifica se o cliente pode reabrir a seleção.
    Regras:
      1. Admin não travou manualmente (selection_locked == 0)
      2. Menos de 3 reaperturas feitas
      3. Dentro do prazo de 6h a partir da primeira finalização
    """
    if client.get("selection_locked"):
        return False, "Seleção travada pelo administrador. Entre em contato."

    unlock_count = client.get("selection_unlock_count") or 0
    if unlock_count >= 3:
        return False, "Limite de 3 reaperturas atingido."

    finalized_at = client.get("selection_finalized_at")
    if finalized_at:
        finalized_dt = datetime.fromisoformat(finalized_at).replace(tzinfo=timezone.utc)
        elapsed = datetime.now(timezone.utc) - finalized_dt
        if elapsed > timedelta(hours=6):
            hours_ago = int(elapsed.total_seconds() / 3600)
            return False, f"Prazo de 6 horas expirado (finalizado há {hours_ago}h)."

    return True, "ok"


def _reopen_time_remaining(client: dict) -> Optional[int]:
    """Retorna segundos restantes para poder reabrir, ou None se sem prazo."""
    finalized_at = client.get("selection_finalized_at")
    if not finalized_at:
        return None
    finalized_dt = datetime.fromisoformat(finalized_at).replace(tzinfo=timezone.utc)
    deadline = finalized_dt + timedelta(hours=6)
    remaining = (deadline - datetime.now(timezone.utc)).total_seconds()
    return max(0, int(remaining))


@app.post("/api/client/finalize")
def finalize_selection(code: str = Query(...)):
    """
    Finaliza a seleção do cliente.
    - Muda status para 'selection_done'
    - Grava timestamp de finalização (usado para calcular o prazo de reopen)
    """
    client = get_client_or_404(code)

    if client.get("selection_locked"):
        raise HTTPException(
            status_code=400, detail="Seleção travada pelo administrador."
        )

    count = database.count_selections(code)
    if count == 0:
        raise HTTPException(
            status_code=400, detail="Selecione ao menos uma foto antes de finalizar."
        )

    now_iso = datetime.now(timezone.utc).isoformat()

    # Só grava selection_finalized_at na PRIMEIRA finalização
    update_data: dict = {"status": "selection_done"}
    if not client.get("selection_finalized_at"):
        update_data["selection_finalized_at"] = now_iso

    database.update_client(client["id"], **update_data)

    unlocks_used = client.get("selection_unlock_count") or 0
    remaining_secs = _reopen_time_remaining({**client, **update_data})

    return {
        "message": "Seleção finalizada com sucesso!",
        "status": "selection_done",
        "selections": count,
        "can_reopen": unlocks_used < 3 and (remaining_secs or 0) > 0,
        "reopens_remaining": max(0, 3 - unlocks_used),
        "reopen_seconds_left": remaining_secs,
    }


@app.post("/api/client/reopen")
def reopen_selection(code: str = Query(...)):
    """
    Reabre a seleção do cliente — com validação de 6h e limite de 3x.
    """
    client = get_client_or_404(code)

    can, reason = _can_reopen(client)
    if not can:
        raise HTTPException(status_code=403, detail=reason)

    new_count = (client.get("selection_unlock_count") or 0) + 1
    database.update_client(
        client["id"],
        status="selecting",
        selection_unlock_count=new_count,
    )

    remaining_secs = _reopen_time_remaining(client)

    return {
        "message": "Seleção reaberta. Você pode modificar suas escolhas.",
        "status": "selecting",
        "reopens_used": new_count,
        "reopens_remaining": max(0, 3 - new_count),
        "reopen_seconds_left": remaining_secs,
    }


# ─── Admin: Controles de Seleção por Cliente ─────────────────────────────────

@app.post("/api/admin/clients/{client_id}/lock", dependencies=[Depends(verify_admin)])
def lock_client_selection(client_id: int):
    """Admin trava a seleção do cliente manualmente — cliente não pode reabrir."""
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    database.update_client(client_id, selection_locked=1)
    return {"message": f"Seleção de '{client['name']}' travada com sucesso."}


@app.post("/api/admin/clients/{client_id}/unlock", dependencies=[Depends(verify_admin)])
def unlock_client_selection(client_id: int):
    """
    Admin libera a seleção do cliente.
    Reseta o contador de reaperturas e o timestamp — cliente volta a ter 3 tentativas + 6h.
    """
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    database.update_client(
        client_id,
        selection_locked=0,
        selection_unlock_count=0,
        selection_finalized_at=None,
        status="selecting" if client.get("status") == "selection_done" else client.get("status"),
    )
    return {"message": f"Seleção de '{client['name']}' liberada. Limites resetados."}


class AdjustSelectionsRequest(BaseModel):
    max_selections: int


@app.put("/api/admin/clients/{client_id}/max-selections", dependencies=[Depends(verify_admin)])
def adjust_max_selections(client_id: int, body: AdjustSelectionsRequest):
    """Admin ajusta a quantidade máxima de seleções de um cliente."""
    if body.max_selections < 1 or body.max_selections > 1000:
        raise HTTPException(
            status_code=400,
            detail="Número de seleções deve ser entre 1 e 1000.",
        )
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    updated = database.update_client(client_id, max_selections=body.max_selections)
    return {
        "message": f"Limite atualizado para {body.max_selections} seleções.",
        "client": updated,
    }


@app.post("/api/admin/clients/{client_id}/sync", dependencies=[Depends(verify_admin)])
def sync_client_gallery(client_id: int):
    """
    Dispara manualmente a sincronização de thumbnails de um cliente.
    Útil quando o admin adiciona novas fotos na pasta do Drive.
    O sync acontece em background — retorna imediatamente.
    """
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    if not client.get("drive_gallery_id"):
        raise HTTPException(status_code=400, detail="Cliente sem pasta do Drive configurada.")

    threading.Thread(
        target=sync_client_thumbnails,
        args=(client,),
        daemon=True,
    ).start()

    return {
        "message": f"Sincronização iniciada para '{client['name']}'. Acompanhe o status pelo painel.",
        "status": "syncing",
    }




def perform_sync():
    """
    Legado: Sincroniza imagens do Google Drive com o diretório local
    public/destaques_sync para o slideshow da home.
    """
    print("[SYNC] Iniciando sincronização 1:1 do Google Drive (destaques)...")

    if not os.path.exists(SERVICE_ACCOUNT_PATH):
        print(f"[SYNC ERROR] Credenciais ausentes em: {SERVICE_ACCOUNT_PATH}")
        return

    try:
        credentials = Credentials.from_service_account_file(
            SERVICE_ACCOUNT_PATH, scopes=SCOPES
        )
        service = build("drive", "v3", credentials=credentials)

        query = (
            f"'{DRIVE_FOLDER_ID}' in parents "
            f"and (mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/webp') "
            f"and trashed=false"
        )
        results = service.files().list(
            q=query,
            pageSize=20,
            fields="files(id, name, mimeType, thumbnailLink)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()

        items = results.get("files", [])

        existing_data = {}
        if os.path.exists(METADATA_FILE):
            try:
                with open(METADATA_FILE, "r", encoding="utf-8") as f:
                    for c in json.load(f):
                        existing_data[c["id"]] = c
            except Exception:
                pass

        new_data = []
        drive_ids = set()

        for item in items:
            f_id = item["id"]
            f_name = item["name"]
            f_mime = item.get("mimeType", "")
            drive_ids.add(f_id)

            ext = ".jpg"
            if "png" in f_mime:
                ext = ".png"
            elif "webp" in f_mime:
                ext = ".webp"

            local_filename = f"{f_id}{ext}"
            local_filepath = os.path.join(SYNC_DIR, local_filename)
            local_url = f"/destaques_sync/{local_filename}"

            if os.path.exists(local_filepath) and f_id in existing_data:
                new_data.append(existing_data[f_id])
                continue

            print(f"[SYNC] Baixando: {f_name} ({f_id})")
            request = service.files().get_media(fileId=f_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()

            with open(local_filepath, "wb") as f:
                f.write(fh.getvalue())

            color_primary = ""
            color_secondary = ""
            if "thumbnailLink" in item:
                try:
                    thumb_res = requests.get(item["thumbnailLink"], timeout=5)
                    if thumb_res.status_code == 200:
                        thumb_fh = io.BytesIO(thumb_res.content)
                        ct = ColorThief(thumb_fh)
                        palette = ct.get_palette(color_count=3, quality=1)
                        if palette and len(palette) >= 2:
                            color_primary = rgb_to_hex(palette[0])
                            color_secondary = rgb_to_hex(palette[1])
                except Exception as e:
                    print(f"[-] Falha na extração de cor: {e}")

            new_data.append(
                {
                    "id": f_id,
                    "imageUrl": local_url,
                    "colorPrimary": color_primary,
                    "colorSecondary": color_secondary,
                }
            )

        for local_file in os.listdir(SYNC_DIR):
            if local_file.endswith(".json"):
                continue
            f_id_ext = os.path.splitext(local_file)[0]
            if f_id_ext not in drive_ids:
                print(f"[SYNC] Removendo arquivo órfão: {local_file}")
                os.remove(os.path.join(SYNC_DIR, local_file))

        with open(METADATA_FILE, "w", encoding="utf-8") as f:
            json.dump(new_data, f, ensure_ascii=False, indent=4)

        print("[SYNC] Sincronização concluída.")

    except Exception as e:
        print(f"[SYNC ERROR] {str(e)}")


@app.get("/api/destaques", response_model=List[ImageHighlight])
async def get_destaques(background_tasks: BackgroundTasks):
    """
    Retorna imediatamente o cache local do slideshow e dispara sync em background.
    """
    if not os.path.exists(METADATA_FILE):
        print("[API] Primeiro boot — executando sync inicial...")
        perform_sync()

    try:
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        data = []

    background_tasks.add_task(perform_sync)
    return data


# ─── Entrypoint ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
