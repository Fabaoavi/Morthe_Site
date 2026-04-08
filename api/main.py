"""
Morthe API — Backend principal
Gerencia a área do cliente e do administrador com integração ao Google Drive.
"""
import os
import io
import re
import json
import base64
import secrets
import string
import shutil
import tempfile
import threading
import time
import zipfile
import requests
from PIL import Image
from typing import Optional, List

from fastapi import FastAPI, HTTPException, BackgroundTasks, Header, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from colorthief import ColorThief
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta
import jwt

import database

# ─── Bootstrap ───────────────────────────────────────────────────────────────

load_dotenv()

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "M0rTh3")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "M0rTh3")
JWT_SECRET = os.environ.get("JWT_SECRET", "morthe-jwt-secret-change-in-production")

# Drive: usa escopo completo para poder criar subpastas e copiar arquivos
SCOPES = ["https://www.googleapis.com/auth/drive"]

# ── Dirs de dados ───────────────────────────────────────────────────────────────
# API_DIR = pasta onde main.py está (sempre certo, independente do cwd)
API_DIR  = os.path.dirname(os.path.abspath(__file__))
# BASE_DIR usado apenas localmente para resolver caminhos do monorepo
BASE_DIR = os.path.dirname(API_DIR)  # pai de api/  (ex: Morthe_Site/)
DRIVE_FOLDER_ID = os.environ.get("DRIVE_FOLDER_ID", "1fQzGW9Kg4-kG3SqMsMbOBNF3AWJ2SGeI")

# Em produção (Railway): DATA_DIR=/data  (persistent volume)
# Em desenvolvimento: usa api/ local
DATA_DIR = os.environ.get("DATA_DIR", API_DIR)

# Credenciais da Service Account (env var GOOGLE_SA_JSON tem prioridade)
SERVICE_ACCOUNT_PATH = os.environ.get(
    "GOOGLE_SA_PATH",
    os.path.join(BASE_DIR, "website", "public", "morthe-83002885203b.json"),
)

# Cache de thumbnails — servido estaticamente pelo FastAPI
THUMB_CACHE_DIR = os.path.join(DATA_DIR, "thumb_cache")
os.makedirs(THUMB_CACHE_DIR, exist_ok=True)

# Sync progress tracking (in-memory, per client code)
sync_progress: dict[str, dict] = {}

# Slideshow da home — em produção fica em DATA_DIR para persistir
SYNC_DIR      = os.path.join(DATA_DIR, "destaques_sync")
METADATA_FILE = os.path.join(SYNC_DIR, "metadata.json")
os.makedirs(SYNC_DIR, exist_ok=True)

# Entrega (arquivos finais sem watermark): ZIPs pré-gerados + previews
DELIVERIES_DIR = os.path.join(DATA_DIR, "deliveries")
os.makedirs(DELIVERIES_DIR, exist_ok=True)
# Progress em memória por cliente: {code: {stage, processed, total, error}}
delivery_progress: dict[str, dict] = {}


def find_watermark() -> Optional[str]:
    """Procura a marca d'água em DATA_DIR ou na pasta local api/."""
    search_dirs = [DATA_DIR, API_DIR, os.path.join(BASE_DIR, "website", "public")]
    for d in search_dirs:
        for ext in ("png", "webp", "jpg", "jpeg", "PNG", "WEBP", "JPG", "JPEG"):
            path = os.path.join(d, f"marcadagua.{ext}")
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
            a = a.point(lambda x: int(x * 0.35))
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

            try:
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
            except Exception as e:
                print(f"[SYNC ERROR] Arquivo {file_name} falhou: {e}")
                return False

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

        # ── Count all files first (gallery + moodboard + mood folders) ──
        # Also pre-fetch mood folder contents for total count
        mood_folder_query = (
            f"'{folder_id}' in parents "
            f"and mimeType = 'application/vnd.google-apps.folder' "
            f"and name contains 'Mood_' "
            f"and trashed = false"
        )
        mood_folders = service.files().list(
            q=mood_folder_query,
            fields="files(id, name)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute().get("files", [])

        mood_folder_files: dict[str, list] = {}
        for mf in mood_folders:
            mood_images_query = (
                f"'{mf['id']}' in parents "
                f"and mimeType contains 'image/' "
                f"and trashed = false"
            )
            mood_images = service.files().list(
                q=mood_images_query,
                fields="files(id, name)",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                pageSize=200,
            ).execute().get("files", [])
            mood_folder_files[mf["id"]] = mood_images

        total_mood_images = sum(len(v) for v in mood_folder_files.values())
        total = len(gallery_files) + len(mood_files) + total_mood_images
        print(f"[SYNC] {len(gallery_files)} galeria + {len(mood_files)} moodboard + {total_mood_images} moods = {total} total")

        synced = 0
        sync_progress[code] = {"total": total, "processed": 0}

        for f in gallery_files:
            try:
                _process_file(service, f["id"], f["name"], cache_dir)
                synced += 1
                sync_progress[code]["processed"] = synced
                print(f"[SYNC] galeria {synced}/{total} — {f['name']}")
            except Exception as e:
                print(f"[WARN] Erro em '{f['name']}': {e}")

        for f in mood_files:
            try:
                _process_file(service, f["id"], f["name"], mood_dir)
                synced += 1
                sync_progress[code]["processed"] = synced
                print(f"[SYNC] moodboard {synced}/{total} — {f['name']}")
            except Exception as e:
                print(f"[WARN] Erro em '{f['name']}': {e}")

        # ── Sync moods (subpastas Mood_*) ─────────────────────────────
        try:
            for mf in mood_folders:
                safe_name = re.sub(r'[^\w\-]', '_', mf["name"].lower())
                mood_cache = os.path.join(cache_dir, safe_name)
                os.makedirs(mood_cache, exist_ok=True)

                mood_images = mood_folder_files.get(mf["id"], [])
                print(f"[SYNC] Mood '{mf['name']}': {len(mood_images)} imagens")
                for mi in mood_images:
                    try:
                        _process_file(service, mi["id"], mi["name"], mood_cache)
                        synced += 1
                        sync_progress[code]["processed"] = synced
                    except Exception as e:
                        print(f"[WARN] Mood '{mf['name']}' / '{mi['name']}': {e}")
        except Exception as e:
            print(f"[WARN] Erro ao sync moods: {e}")

        database.update_client(client_id, status="gallery_ready")
        sync_progress.pop(code, None)
        print(f"[SYNC] Concluído '{client['name']}': {synced} arquivos.")

    except Exception as e:
        print(f"[ERROR] Falha no sync para '{code}': {e}")
        sync_progress.pop(code, None)
        database.update_client(client_id, status="pending")

app = FastAPI(title="Morthe API", version="2.0.0")

# Serve thumbnails diretamente via FastAPI (produção: backend é separado do Next.js)
app.mount("/thumb_cache", StaticFiles(directory=THUMB_CACHE_DIR), name="thumb_cache")
app.mount("/destaques_sync", StaticFiles(directory=SYNC_DIR), name="destaques_sync")

# CORS: allow_origin_regex aceita:
#   - localhost (dev)
#   - qualquer subdomínio *.vercel.app (previews)
#   - FRONTEND_URL customizado (ex: https://morthe.pro)
_FRONTEND_URL   = os.environ.get("FRONTEND_URL", "").rstrip("/")
_CORS_PATTERN   = r"http://localhost:\d+|https://[\w-]+\.vercel\.app"
if _FRONTEND_URL:
    _CORS_PATTERN += "|" + re.escape(_FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_CORS_PATTERN,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializa o banco de dados na startup
database.init_db()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def rgb_to_hex(rgb):
    return "#{:02x}{:02x}{:02x}".format(rgb[0], rgb[1], rgb[2])


def _load_service_account_info() -> dict:
    """
    Carrega as credenciais da Service Account.
    Prioridade:
      1. GOOGLE_SA_JSON env var (conteúdo JSON direto ou base64) — ideal para Railway/Vercel
      2. Arquivo em GOOGLE_SA_PATH (desenvolvimento local)
    """
    sa_json = os.environ.get("GOOGLE_SA_JSON", "")
    if sa_json:
        try:
            # Tenta decodificar base64 primeiro
            decoded = base64.b64decode(sa_json).decode("utf-8")
            return json.loads(decoded)
        except Exception:
            # Assume JSON puro
            return json.loads(sa_json)

    # Fallback: arquivo local
    if not os.path.exists(SERVICE_ACCOUNT_PATH):
        raise HTTPException(
            status_code=500,
            detail=f"Credenciais não encontradas. Defina GOOGLE_SA_JSON ou verifique GOOGLE_SA_PATH: {SERVICE_ACCOUNT_PATH}",
        )
    with open(SERVICE_ACCOUNT_PATH, "r") as f:
        return json.load(f)


def get_drive_service():
    """Retorna um cliente autenticado da API do Google Drive."""
    info = _load_service_account_info()
    creds = Credentials.from_service_account_info(info, scopes=SCOPES)
    return build("drive", "v3", credentials=creds)


def get_service_account_email() -> str:
    """Lê o email da Service Account das credenciais."""
    try:
        return _load_service_account_info().get("client_email", "email não encontrado")
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


def verify_admin(
    authorization: Optional[str] = Header(None),
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token"),
):
    """
    Dependency que valida acesso admin.
    Aceita:
      1. Authorization: Bearer <jwt> (novo, preferido)
      2. X-Admin-Token: <token> (legado, compatibilidade)
    """
    # Tentar JWT primeiro
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        try:
            jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            return  # JWT válido
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Sessão expirada. Faça login novamente.")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Token inválido.")

    # Fallback legado
    if x_admin_token and x_admin_token == ADMIN_TOKEN:
        return

    raise HTTPException(status_code=401, detail="Não autorizado. Faça login.")


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


# ─── Auth ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/admin/login")
def admin_login(body: LoginRequest):
    """
    Autentica o administrador e retorna um JWT válido por 24h.
    Credenciais definidas por ADMIN_USERNAME e ADMIN_PASSWORD (env vars).
    """
    if body.username != ADMIN_USERNAME or body.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos.")

    payload = {
        "sub": body.username,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return {"token": token, "expires_in": 86400}


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

    # Remove ZIP de entrega se existir
    zip_path = existing.get("delivery_zip_path")
    if zip_path and os.path.exists(zip_path):
        try:
            os.remove(zip_path)
            print(f"[DELIVERY] ZIP removido: {zip_path}")
        except Exception as e:
            print(f"[DELIVERY] Falha ao remover ZIP: {e}")
    delivery_progress.pop(existing["code"], None)

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

            is_cached = cached_thumb is not None
            gallery.append({
                "id": file_id,
                "name": f["name"],
                # cachedThumbUrl: URL estática do servidor (preferido)
                "cachedThumbUrl": cached_thumb,
                "cachedMdUrl":    cached_md,
                # SECURITY: Never expose raw URLs when watermarked cache doesn't exist
                "thumbnailUrl": None if not is_cached else (drive_thumb or None),
                "proxyUrl": f"/api/client/file/{file_id}?code={code}" if is_cached else None,
                "selected": file_id in selected_ids,
                "cached": is_cached,
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


@app.get("/api/client/sync-progress")
def get_sync_progress(code: str = Query(...)):
    """Retorna o progresso da sincronização de thumbnails."""
    client = get_client_or_404(code)
    progress = sync_progress.get(code)
    if progress:
        total = progress["total"]
        processed = progress["processed"]
        percent = round((processed / total * 100) if total > 0 else 0)
        return {"syncing": True, "total": total, "processed": processed, "percent": percent, "status": client["status"]}
    return {"syncing": False, "total": 0, "processed": 0, "percent": 100, "status": client["status"]}


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


@app.get("/api/client/moods")
def get_moods(code: str = Query(...)):
    """
    Retorna os moods (subpastas Mood_*) do cliente com seus arquivos.
    Cada subpasta cujo nome começa com 'Mood_' é tratada como um mood separado.
    O título do mood é o nome da pasta sem o prefixo 'Mood_'.
    """
    client = get_client_or_404(code)
    folder_id = client.get("drive_gallery_id")
    if not folder_id:
        raise HTTPException(status_code=404, detail="URL do Google Drive não configurada.")

    try:
        service = get_drive_service()

        # 1. Buscar subpastas Mood_* na pasta do cliente
        folder_query = (
            f"'{folder_id}' in parents "
            f"and mimeType = 'application/vnd.google-apps.folder' "
            f"and name contains 'Mood_' "
            f"and trashed = false"
        )
        folder_results = service.files().list(
            q=folder_query,
            fields="files(id, name)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            orderBy="name",
        ).execute()

        mood_folders = folder_results.get("files", [])

        if not mood_folders:
            return {"moods": [], "total_moods": 0, "has_moods": False}

        # IDs das fotos já selecionadas pelo cliente
        selected_ids = {s["image_id"] for s in database.get_selections(code)}

        moods = []
        for folder in mood_folders:
            mood_id = folder["id"]
            folder_name = folder["name"]
            # Extrair título: remover prefixo "Mood_" (só o primeiro)
            title = folder_name.replace("Mood_", "", 1).strip()
            if not title:
                title = folder_name

            # 2. Listar imagens dentro da subpasta
            file_query = (
                f"'{mood_id}' in parents "
                f"and mimeType contains 'image/' "
                f"and trashed = false"
            )
            file_results = service.files().list(
                q=file_query,
                pageSize=200,
                fields="files(id, name, mimeType, thumbnailLink, size)",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                orderBy="name",
            ).execute()

            files = file_results.get("files", [])

            # Diretório de cache para este mood
            safe_name = re.sub(r'[^\w\-]', '_', folder_name.lower())
            cache_dir = os.path.join(THUMB_CACHE_DIR, code, safe_name)

            mood_files = []
            for f in files:
                file_id = f["id"]

                # URLs de cache
                sm_cache = os.path.join(cache_dir, f"{file_id}_sm.webp")
                md_cache = os.path.join(cache_dir, f"{file_id}_md.webp")

                if os.path.exists(sm_cache):
                    cached_thumb = f"/thumb_cache/{code}/{safe_name}/{file_id}_sm.webp"
                    cached_md = f"/thumb_cache/{code}/{safe_name}/{file_id}_md.webp"
                else:
                    cached_thumb = None
                    cached_md = None

                # Fallback: thumbnail do Google CDN
                drive_thumb = f.get("thumbnailLink", "")
                if drive_thumb:
                    drive_thumb = re.sub(r"=s\d+", "=s400", drive_thumb)

                is_cached = cached_thumb is not None
                mood_files.append({
                    "id": file_id,
                    "name": f["name"],
                    "cachedThumbUrl": cached_thumb,
                    "cachedMdUrl": cached_md,
                    # SECURITY: Never expose raw URLs when watermarked cache doesn't exist
                    "thumbnailUrl": None if not is_cached else (drive_thumb or None),
                    "proxyUrl": f"/api/client/file/{file_id}?code={code}" if is_cached else None,
                    "selected": file_id in selected_ids,
                    "cached": is_cached,
                })

            moods.append({
                "id": mood_id,
                "title": title,
                "folderName": folder_name,
                "files": mood_files,
            })

        return {
            "moods": moods,
            "total_moods": len(moods),
            "has_moods": True,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Falha ao buscar moods para '{code}': {e}")
        raise HTTPException(status_code=500, detail="Erro ao buscar moods do Drive.")


@app.get("/api/client/file/{file_id}")
def stream_file(file_id: str, code: str = Query(...)):
    """
    Proxy de streaming: serve a versão cacheada (com watermark) se existir.
    Se não existir cache, retorna 403 para impedir acesso à imagem sem watermark.
    """
    client = get_client_or_404(code)

    # SECURITY: Always prefer watermarked cached version
    cache_dir = os.path.join(THUMB_CACHE_DIR, code)
    md_cache = os.path.join(cache_dir, f"{file_id}_md.webp")

    # Also check inside mood subdirectories
    if not os.path.exists(md_cache):
        for subdir in os.listdir(cache_dir) if os.path.isdir(cache_dir) else []:
            subpath = os.path.join(cache_dir, subdir, f"{file_id}_md.webp")
            if os.path.exists(subpath):
                md_cache = subpath
                break

    if os.path.exists(md_cache):
        return FileResponse(md_cache, media_type="image/webp")

    # No cached version — block access to raw image
    raise HTTPException(
        status_code=403,
        detail="Imagem ainda em processamento. Aguarde a sincronização."
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
    print(f"[SYNC] Iniciando sincronização destaques — DRIVE_FOLDER_ID={DRIVE_FOLDER_ID}")
    print(f"[SYNC] SYNC_DIR={SYNC_DIR}, existe={os.path.exists(SYNC_DIR)}")

    try:
        service = get_drive_service()
        print("[SYNC] Autenticação Google Drive OK.")

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
        print(f"[SYNC] Encontradas {len(items)} imagens na pasta do Drive.")

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

            local_filename = f"{f_id}.webp"
            local_filepath = os.path.join(SYNC_DIR, local_filename)
            local_url = f"/destaques_sync/{local_filename}"

            if os.path.exists(local_filepath) and f_id in existing_data:
                new_data.append(existing_data[f_id])
                continue

            print(f"[SYNC DESTAQUES] Baixando e convertendo: {f_name} ({f_id})")
            try:
                request = service.files().get_media(fileId=f_id)
                fh = io.BytesIO()
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while not done:
                    _, done = downloader.next_chunk()
                fh.seek(0)

                # Converter para WebP e Redimensionar para max 1920px
                with Image.open(fh) as img:
                    img = img.convert("RGB")
                    img.thumbnail((1920, 1920), Image.LANCZOS)
                    img.save(local_filepath, "WEBP", quality=85, method=4)

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
            except Exception as e:
                print(f"[SYNC DESTAQUES ERROR] Falha ao processar {f_name}: {e}")


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


@app.get("/api/destaques/status")
async def get_destaques_status():
    """
    Endpoint de diagnóstico para debug do slideshow.
    Retorna estado do sync, metadata, e config.
    """
    metadata_exists = os.path.exists(METADATA_FILE)
    sync_dir_exists = os.path.exists(SYNC_DIR)
    image_count = 0
    metadata_content = []
    sync_files = []

    if sync_dir_exists:
        sync_files = [f for f in os.listdir(SYNC_DIR) if not f.endswith(".json")]

    if metadata_exists:
        try:
            with open(METADATA_FILE, "r", encoding="utf-8") as f:
                metadata_content = json.load(f)
                image_count = len(metadata_content)
        except Exception as e:
            metadata_content = {"error": str(e)}

    # Testar acesso ao Drive
    drive_ok = False
    drive_error = None
    drive_file_count = 0
    try:
        service = get_drive_service()
        results = service.files().list(
            q=f"'{DRIVE_FOLDER_ID}' in parents and trashed=false",
            pageSize=5,
            fields="files(id, name)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        drive_file_count = len(results.get("files", []))
        drive_ok = True
    except Exception as e:
        drive_error = str(e)

    return {
        "drive_folder_id": DRIVE_FOLDER_ID,
        "drive_accessible": drive_ok,
        "drive_error": drive_error,
        "drive_files_found": drive_file_count,
        "sync_dir": SYNC_DIR,
        "sync_dir_exists": sync_dir_exists,
        "sync_files_on_disk": sync_files,
        "metadata_file_exists": metadata_exists,
        "metadata_image_count": image_count,
        "metadata": metadata_content,
    }


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
    except Exception as e:
        print(f"[API] Erro ao ler metadata.json: {e}")
        data = []

    if not data:
        print(f"[API] AVISO: metadata.json vazio ou inexistente. DRIVE_FOLDER_ID={DRIVE_FOLDER_ID}")

    background_tasks.add_task(perform_sync)
    return data


# ─── Entrega (Delivery) ──────────────────────────────────────────────────────

# Extensões de arquivo aceitas na entrega final
DELIVERY_ALLOWED_MIMES = (
    "image/",
    "video/",
    "application/pdf",
    "application/postscript",                     # .ai, .eps
    "application/illustrator",
    "application/vnd.adobe.photoshop",             # .psd (alguns casos)
    "image/vnd.adobe.photoshop",                   # .psd
    "application/octet-stream",                    # fallback p/ PSD/AI sem mime
)
DELIVERY_ALLOWED_EXTS = (
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff",
    ".mp4", ".mov", ".avi", ".mkv", ".webm",
    ".psd", ".ai", ".eps", ".pdf",
)


def _is_allowed_delivery_file(name: str, mime: str) -> bool:
    name_lower = (name or "").lower()
    if any(name_lower.endswith(ext) for ext in DELIVERY_ALLOWED_EXTS):
        return True
    if mime and any(mime.startswith(m) for m in DELIVERY_ALLOWED_MIMES):
        return True
    return False


def _find_delivery_folder(service, parent_folder_id: str) -> Optional[str]:
    """
    Localiza a subpasta 'Entrega' (case-insensitive) dentro da pasta do cliente no Drive.
    Retorna o folder_id ou None.
    """
    query = (
        f"'{parent_folder_id}' in parents "
        f"and mimeType = 'application/vnd.google-apps.folder' "
        f"and trashed = false"
    )
    results = service.files().list(
        q=query,
        fields="files(id, name)",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
        pageSize=200,
    ).execute()
    for f in results.get("files", []):
        if (f.get("name") or "").strip().lower() == "entrega":
            return f["id"]
    return None


def _list_delivery_tree(service, folder_id: str, rel_path: str = "") -> list[dict]:
    """
    Lista recursivamente todos os arquivos dentro da pasta 'Entrega/' no Drive.
    Retorna lista de dicts: {id, name, mimeType, rel_dir, size}
    """
    items: list[dict] = []
    query = (
        f"'{folder_id}' in parents "
        f"and trashed = false"
    )
    results = service.files().list(
        q=query,
        fields="files(id, name, mimeType, size)",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
        pageSize=500,
        orderBy="name",
    ).execute()

    for f in results.get("files", []):
        mime = f.get("mimeType", "")
        if mime == "application/vnd.google-apps.folder":
            # Recursiva: subpasta vira subpasta dentro do ZIP
            sub_rel = f["name"] if not rel_path else f"{rel_path}/{f['name']}"
            items.extend(_list_delivery_tree(service, f["id"], sub_rel))
        else:
            if _is_allowed_delivery_file(f.get("name", ""), mime):
                items.append({
                    "id": f["id"],
                    "name": f["name"],
                    "mimeType": mime,
                    "rel_dir": rel_path,
                    "size": int(f.get("size") or 0),
                })
    return items


def _sanitize_filename(name: str) -> str:
    """Remove caracteres problemáticos para ZIP/filesystem."""
    return re.sub(r'[<>:"|?*\x00-\x1f]', '_', name).strip() or "arquivo"


def generate_delivery_zip(client: dict):
    """
    Baixa todos os arquivos da pasta 'Entrega/' do Drive e monta um ZIP organizado.
    Executa em background thread — atualiza delivery_progress e delivery_status no DB.

    Estrutura do ZIP:
        Morthe_NomeCliente_Entrega.zip
        ├── Mood_X/
        │   ├── foto_001.jpg
        │   └── ...
        ├── Videos/
        │   └── clip_01.mp4
        └── arquivo_raiz.pdf
    """
    code = client["code"]
    client_id = client["id"]
    client_name = client["name"]
    folder_id = client.get("drive_gallery_id")

    delivery_progress[code] = {
        "stage": "listing",
        "processed": 0,
        "total": 0,
        "total_bytes": 0,
        "bytes_done": 0,
        "current_file": None,
        "current_file_bytes": 0,
        "current_file_total": 0,
        "started_at": time.time(),
        "last_tick": time.time(),
        "error": None,
        "log": [],
    }
    database.update_client(client_id, delivery_status="generating")

    def _log(msg: str):
        entry = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
        delivery_progress[code]["log"].append(entry)
        # Mantém só os últimos 60 itens para não estourar memória
        if len(delivery_progress[code]["log"]) > 60:
            delivery_progress[code]["log"] = delivery_progress[code]["log"][-60:]
        print(f"[DELIVERY] {code} {msg}")

    try:
        if not folder_id:
            raise RuntimeError("Cliente sem pasta do Drive configurada.")

        service = get_drive_service()
        entrega_id = _find_delivery_folder(service, folder_id)
        if not entrega_id:
            # Lista o que realmente existe para ajudar no debug
            try:
                q = (
                    f"'{folder_id}' in parents "
                    f"and mimeType = 'application/vnd.google-apps.folder' "
                    f"and trashed = false"
                )
                res = service.files().list(
                    q=q, fields="files(name)",
                    supportsAllDrives=True, includeItemsFromAllDrives=True, pageSize=50,
                ).execute()
                found = [f.get("name") for f in res.get("files", [])]
            except Exception:
                found = []
            subs_msg = ", ".join(found) if found else "(nenhuma)"
            raise RuntimeError(
                f"Pasta 'Entrega' não encontrada. Subpastas vistas pelo backend: {subs_msg}. "
                f"Use o botão 'Diagnosticar' para mais detalhes."
            )

        _log("Listando arquivos da pasta Entrega…")
        files = _list_delivery_tree(service, entrega_id)
        if not files:
            raise RuntimeError("Pasta 'Entrega' está vazia ou sem arquivos válidos.")

        total_bytes = sum(f.get("size") or 0 for f in files)
        delivery_progress[code]["total"] = len(files)
        delivery_progress[code]["total_bytes"] = total_bytes
        delivery_progress[code]["stage"] = "downloading"
        _log(f"{len(files)} arquivo(s) • {total_bytes/1024/1024:.1f} MB totais")

        safe_client = re.sub(r"[^\w\-]", "_", client_name)
        zip_filename = f"Morthe_{safe_client}_Entrega.zip"
        zip_path = os.path.join(DELIVERIES_DIR, f"{code}.zip")

        # Remove ZIP anterior se existir
        if os.path.exists(zip_path):
            os.remove(zip_path)

        # ZIP_STORED + allowZip64 mantém sem recompressão (fotos/videos já comprimidos)
        # O ZIP é montado streaming arquivo-a-arquivo, cada arquivo vai para disco
        # em um tempfile primeiro (não carregamos tudo em RAM).
        CHUNK = 8 * 1024 * 1024  # 8 MB por chunk de download do Drive
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED, allowZip64=True) as zf:
            for idx, item in enumerate(files, 1):
                rel_dir = item["rel_dir"] or ""
                safe_name = _sanitize_filename(item["name"])
                arcname = f"{rel_dir}/{safe_name}" if rel_dir else safe_name
                file_total = item.get("size") or 0

                delivery_progress[code]["current_file"] = arcname
                delivery_progress[code]["current_file_bytes"] = 0
                delivery_progress[code]["current_file_total"] = file_total
                _log(f"[{idx}/{len(files)}] ↓ {arcname} ({file_total/1024/1024:.1f} MB)")

                tmp = tempfile.NamedTemporaryFile(
                    delete=False, dir=DELIVERIES_DIR, suffix=".part"
                )
                tmp_path = tmp.name
                try:
                    try:
                        request = service.files().get_media(
                            fileId=item["id"], supportsAllDrives=True
                        )
                        downloader = MediaIoBaseDownload(tmp, request, chunksize=CHUNK)
                        done = False
                        t0 = time.time()
                        while not done:
                            status, done = downloader.next_chunk(num_retries=3)
                            if status is not None:
                                got = int(status.resumable_progress or 0)
                                delivery_progress[code]["current_file_bytes"] = got
                                delivery_progress[code]["last_tick"] = time.time()
                        tmp.flush()
                        tmp.close()
                        got_final = os.path.getsize(tmp_path)
                        delivery_progress[code]["current_file_bytes"] = got_final
                        delivery_progress[code]["bytes_done"] += got_final
                        _log(
                            f"[{idx}/{len(files)}] ✓ {arcname} "
                            f"({got_final/1024/1024:.1f} MB em {time.time()-t0:.1f}s)"
                        )

                        # Escreve no ZIP lendo do tempfile (stream, não carrega em RAM)
                        zinfo = zipfile.ZipInfo(filename=arcname)
                        zinfo.compress_type = zipfile.ZIP_STORED
                        zinfo.file_size = got_final
                        with open(tmp_path, "rb") as src, zf.open(zinfo, "w", force_zip64=True) as dst:
                            shutil.copyfileobj(src, dst, length=CHUNK)
                    except Exception as e:
                        _log(f"[{idx}/{len(files)}] ✗ FALHOU {arcname}: {e}")
                finally:
                    try:
                        if not tmp.closed:
                            tmp.close()
                    except Exception:
                        pass
                    try:
                        if os.path.exists(tmp_path):
                            os.unlink(tmp_path)
                    except Exception:
                        pass

                delivery_progress[code]["processed"] = idx

        zip_size = os.path.getsize(zip_path)
        now_iso = datetime.now(timezone.utc).isoformat()
        database.update_client(
            client_id,
            delivery_zip_path=zip_path,
            delivery_zip_size=zip_size,
            delivery_generated_at=now_iso,
            delivery_status="ready",
        )
        delivery_progress[code]["stage"] = "ready"
        delivery_progress[code]["current_file"] = None
        _log(f"ZIP pronto: {zip_size/1024/1024:.1f} MB")

    except Exception as e:
        err_msg = str(e)
        _log(f"ERRO: {err_msg}")
        delivery_progress[code]["stage"] = "error"
        delivery_progress[code]["error"] = err_msg
        database.update_client(client_id, delivery_status="error")


def _delivery_preview_items(service, folder_id: str) -> list[dict]:
    """
    Retorna itens da entrega apenas para exibi��ão (preview/galeria do cliente).
    Só considera imagens e vídeos (ignora PSD/AI/PDF no grid visual).
    """
    entrega_id = _find_delivery_folder(service, folder_id)
    if not entrega_id:
        return []
    all_items = _list_delivery_tree(service, entrega_id)
    preview = []
    for it in all_items:
        mime = it.get("mimeType", "")
        name_lower = it["name"].lower()
        is_visual = (
            mime.startswith("image/")
            or mime.startswith("video/")
            or any(name_lower.endswith(ext) for ext in (
                ".jpg", ".jpeg", ".png", ".webp", ".gif",
                ".mp4", ".mov", ".webm",
            ))
        )
        if is_visual:
            preview.append(it)
    return preview


# ─── Rotas Admin: Delivery ───────────────────────────────────────────────────

class DeliveryMessageRequest(BaseModel):
    message: Optional[str] = ""


class DeliveryReleaseRequest(BaseModel):
    released: bool


@app.put(
    "/api/admin/clients/{client_id}/delivery/message",
    dependencies=[Depends(verify_admin)],
)
def admin_update_delivery_message(client_id: int, body: DeliveryMessageRequest):
    """Atualiza a mensagem personalizada exibida ao cliente na aba Entrega."""
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    database.update_client(client_id, delivery_message=body.message or "")
    return {"message": "Mensagem atualizada."}


@app.post(
    "/api/admin/clients/{client_id}/delivery/generate",
    dependencies=[Depends(verify_admin)],
)
def admin_generate_delivery(client_id: int):
    """
    Dispara a geração do ZIP em background.
    Lê a pasta 'Entrega/' do Drive, baixa tudo, compacta e salva em DELIVERIES_DIR.
    """
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    if client.get("delivery_status") == "generating":
        raise HTTPException(status_code=409, detail="Já existe uma geração em andamento.")

    threading.Thread(
        target=generate_delivery_zip,
        args=(client,),
        daemon=True,
    ).start()

    return {
        "message": "Geração iniciada. Acompanhe o progresso.",
        "status": "generating",
    }


@app.post(
    "/api/admin/clients/{client_id}/delivery/release",
    dependencies=[Depends(verify_admin)],
)
def admin_release_delivery(client_id: int, body: DeliveryReleaseRequest):
    """
    Libera (ou oculta) a aba Entrega para o cliente.
    Requer que o ZIP já tenha sido gerado (delivery_status = 'ready').
    """
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    if body.released and client.get("delivery_status") != "ready":
        raise HTTPException(
            status_code=400,
            detail="Gere o ZIP antes de liberar a entrega.",
        )

    database.update_client(client_id, delivery_released=1 if body.released else 0)
    return {
        "message": "Entrega liberada!" if body.released else "Entrega ocultada.",
        "released": body.released,
    }


@app.get(
    "/api/admin/clients/{client_id}/delivery/diagnose",
    dependencies=[Depends(verify_admin)],
)
def admin_delivery_diagnose(client_id: int):
    """
    Diagnóstico completo: mostra exatamente o que o backend vê no Drive.
    - Confirma que o novo código de entrega está deployado
    - Testa acesso da Service Account ao drive_gallery_id
    - Lista TODAS as subpastas da pasta do cliente (com bytes hex para detectar caracteres invisíveis)
    - Indica qual (se alguma) bate com o filtro 'entrega'
    """
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    report: dict = {
        "backend_version": "delivery-v2",  # muda se redeployar — confirma código novo
        "client_name": client["name"],
        "drive_gallery_id": client.get("drive_gallery_id"),
        "service_account_email": get_service_account_email(),
        "parent_access": None,
        "parent_name": None,
        "subfolders": [],
        "entrega_match": None,
        "error": None,
        # Estado atual da geração (se houver)
        "delivery_status": client.get("delivery_status") or "idle",
        "delivery_progress": delivery_progress.get(client["code"]),
    }

    folder_id = client.get("drive_gallery_id")
    if not folder_id:
        report["error"] = "Cliente sem drive_gallery_id cadastrado."
        return report

    try:
        service = get_drive_service()
    except Exception as e:
        report["error"] = f"Falha ao autenticar Service Account: {e}"
        return report

    # 1. Testa acesso à pasta pai
    try:
        parent_meta = service.files().get(
            fileId=folder_id,
            fields="id, name, mimeType, driveId, parents",
            supportsAllDrives=True,
        ).execute()
        report["parent_access"] = True
        report["parent_name"] = parent_meta.get("name")
        report["parent_drive_id"] = parent_meta.get("driveId")
    except Exception as e:
        report["parent_access"] = False
        report["error"] = (
            f"Service Account não consegue acessar a pasta {folder_id}. "
            f"Compartilhe como EDITOR com: {report['service_account_email']}. "
            f"Erro: {e}"
        )
        return report

    # 2. Lista TODAS as subpastas diretas
    try:
        query = (
            f"'{folder_id}' in parents "
            f"and mimeType = 'application/vnd.google-apps.folder' "
            f"and trashed = false"
        )
        results = service.files().list(
            q=query,
            fields="files(id, name, parents)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            pageSize=500,
        ).execute()
        subfolders = results.get("files", [])
    except Exception as e:
        report["error"] = f"Erro ao listar subpastas: {e}"
        return report

    for sf in subfolders:
        name = sf.get("name") or ""
        name_lower = name.strip().lower()
        # Hex dos bytes UTF-8 — revela caracteres invisíveis (BOM, espaços não-quebráveis, etc)
        name_hex = name.encode("utf-8").hex(" ")
        is_entrega = name_lower == "entrega"
        report["subfolders"].append({
            "id": sf["id"],
            "name": name,
            "name_repr": repr(name),
            "name_bytes_hex": name_hex,
            "matches_entrega_filter": is_entrega,
        })
        if is_entrega and not report["entrega_match"]:
            report["entrega_match"] = sf["id"]

    # 3. Se não achou, também tenta com match parcial (contém "entrega")
    if not report["entrega_match"]:
        partial = [sf for sf in report["subfolders"] if "entrega" in sf["name"].lower()]
        report["partial_matches"] = partial

    return report


@app.get(
    "/api/admin/clients/{client_id}/delivery/status",
    dependencies=[Depends(verify_admin)],
)
def admin_delivery_status(client_id: int):
    """Retorna o estado atual da entrega (incluindo progresso se estiver gerando)."""
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    progress = delivery_progress.get(client["code"])
    return {
        "status": client.get("delivery_status") or "idle",
        "released": bool(client.get("delivery_released")),
        "message": client.get("delivery_message") or "",
        "zip_size": client.get("delivery_zip_size"),
        "generated_at": client.get("delivery_generated_at"),
        "downloaded": bool(client.get("delivery_downloaded")),
        "downloaded_at": client.get("delivery_downloaded_at"),
        "progress": progress,
    }


@app.get(
    "/api/admin/clients/{client_id}/delivery/preview",
    dependencies=[Depends(verify_admin)],
)
def admin_delivery_preview(client_id: int):
    """
    Retorna os arquivos visuais (imagens/vídeos) da pasta Entrega para preview no admin.
    Usa proxy streaming — o admin vê exatamente o que o cliente verá.
    """
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    folder_id = client.get("drive_gallery_id")
    if not folder_id:
        raise HTTPException(status_code=400, detail="Cliente sem pasta do Drive.")

    try:
        service = get_drive_service()
        items = _delivery_preview_items(service, folder_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler Drive: {e}")

    files = [
        {
            "id": it["id"],
            "name": it["name"],
            "mimeType": it["mimeType"],
            "relDir": it["rel_dir"],
            "url": f"/api/admin/clients/{client_id}/delivery/file/{it['id']}",
        }
        for it in items
    ]
    return {"files": files, "total": len(files)}


@app.get(
    "/api/admin/clients/{client_id}/delivery/file/{file_id}",
    dependencies=[Depends(verify_admin)],
)
def admin_delivery_stream_file(client_id: int, file_id: str):
    """Streaming de arquivo da pasta Entrega (sem watermark) — apenas para admin."""
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    try:
        service = get_drive_service()
        meta = service.files().get(
            fileId=file_id,
            fields="id, name, mimeType",
            supportsAllDrives=True,
        ).execute()
        request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type=meta.get("mimeType") or "application/octet-stream",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao servir arquivo: {e}")


@app.delete(
    "/api/admin/clients/{client_id}/delivery/zip",
    dependencies=[Depends(verify_admin)],
)
def admin_clear_delivery_zip(client_id: int):
    """
    Apaga o ZIP pré-gerado da nuvem (Railway storage).
    Reseta status para 'idle' e oculta a entrega do cliente automaticamente.
    """
    client = database.get_client_by_id(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    zip_path = client.get("delivery_zip_path")
    deleted = False
    if zip_path and os.path.exists(zip_path):
        try:
            os.remove(zip_path)
            deleted = True
            print(f"[DELIVERY] ZIP apagado: {zip_path}")
        except Exception as e:
            print(f"[DELIVERY] Erro ao apagar ZIP: {e}")

    database.update_client(
        client_id,
        delivery_zip_path=None,
        delivery_zip_size=None,
        delivery_generated_at=None,
        delivery_status="idle",
        delivery_released=0,
        delivery_downloaded=0,
        delivery_downloaded_at=None,
    )
    delivery_progress.pop(client["code"], None)

    return {
        "message": "ZIP removido da nuvem." if deleted else "Nada para apagar.",
        "deleted": deleted,
    }


# ─── Rotas Cliente: Delivery ─────────────────────────────────────────────────

@app.get("/api/client/delivery")
def client_delivery_info(code: str = Query(...)):
    """
    Retorna dados da aba Entrega do cliente.
    Só expõe arquivos se delivery_released = true.
    """
    client = get_client_or_404(code)

    if not client.get("delivery_released"):
        return {
            "released": False,
            "message": None,
            "files": [],
            "zip_ready": False,
            "zip_size": None,
        }

    # Lista arquivos visuais para o grid
    files: list[dict] = []
    try:
        service = get_drive_service()
        folder_id = client.get("drive_gallery_id")
        if folder_id:
            items = _delivery_preview_items(service, folder_id)
            files = [
                {
                    "id": it["id"],
                    "name": it["name"],
                    "mimeType": it["mimeType"],
                    "relDir": it["rel_dir"],
                    "url": f"/api/client/delivery/file/{it['id']}?code={code}",
                }
                for it in items
            ]
    except Exception as e:
        print(f"[DELIVERY] Erro ao listar preview para '{code}': {e}")

    zip_path = client.get("delivery_zip_path")
    zip_ready = bool(zip_path and os.path.exists(zip_path))

    return {
        "released": True,
        "message": client.get("delivery_message") or "",
        "files": files,
        "total": len(files),
        "zip_ready": zip_ready,
        "zip_size": client.get("delivery_zip_size"),
        "downloaded": bool(client.get("delivery_downloaded")),
    }


@app.get("/api/client/delivery/file/{file_id}")
def client_delivery_stream_file(file_id: str, code: str = Query(...)):
    """
    Streaming de arquivo da Entrega (sem watermark).
    Só funciona se delivery_released = true para aquele cliente.
    """
    client = get_client_or_404(code)
    if not client.get("delivery_released"):
        raise HTTPException(status_code=403, detail="Entrega ainda não liberada.")

    try:
        service = get_drive_service()
        meta = service.files().get(
            fileId=file_id,
            fields="id, name, mimeType",
            supportsAllDrives=True,
        ).execute()
        request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
        buf = io.BytesIO()
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type=meta.get("mimeType") or "application/octet-stream",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao servir arquivo: {e}")


@app.get("/api/client/delivery/download")
def client_delivery_download(code: str = Query(...)):
    """
    Baixa o ZIP completo da entrega.
    Marca delivery_downloaded = true na primeira vez que for baixado.
    """
    client = get_client_or_404(code)
    if not client.get("delivery_released"):
        raise HTTPException(status_code=403, detail="Entrega ainda não liberada.")

    zip_path = client.get("delivery_zip_path")
    if not zip_path or not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="Arquivo de entrega não disponível.")

    # Marca como baixado (só na primeira vez)
    if not client.get("delivery_downloaded"):
        database.update_client(
            client["id"],
            delivery_downloaded=1,
            delivery_downloaded_at=datetime.now(timezone.utc).isoformat(),
        )

    safe_client = re.sub(r"[^\w\-]", "_", client["name"])
    filename = f"Morthe_{safe_client}_Entrega.zip"
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=filename,
    )


# ─── Entrypoint ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
