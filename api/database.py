"""
database.py — Módulo SQLite para gerenciamento de clientes e seleções.
"""
import sqlite3
import os
import shutil
from typing import Optional

_DATA_DIR = os.environ.get("DATA_DIR", os.path.dirname(__file__))
DB_PATH = os.path.join(_DATA_DIR, "morthe.db")


def _disk_report() -> str:
    """Relatório curto de uso do volume — usado em mensagens de erro."""
    try:
        usage = shutil.disk_usage(_DATA_DIR)
        free_mb = usage.free / (1024 * 1024)
        used_pct = (usage.used / usage.total) * 100 if usage.total else 0
        return (
            f"data_dir={_DATA_DIR} "
            f"free={free_mb:.1f}MB used={used_pct:.1f}% "
            f"total={usage.total/(1024*1024):.0f}MB"
        )
    except Exception as e:
        return f"data_dir={_DATA_DIR} (disk_usage failed: {e})"


def get_connection() -> sqlite3.Connection:
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        # Tenta WAL — se falhar (disco cheio/readonly), cai para o modo padrão
        try:
            conn.execute("PRAGMA journal_mode=WAL")
        except sqlite3.OperationalError as e:
            # Loga o estado real do volume e re-lança com contexto
            report = _disk_report()
            raise sqlite3.OperationalError(
                f"PRAGMA journal_mode=WAL falhou ({e}). "
                f"Provável volume cheio/read-only. {report}"
            ) from e
        return conn
    except sqlite3.OperationalError as e:
        # Erro abrindo o banco em si — também enriquece a mensagem
        if "disk" in str(e).lower() or "i/o" in str(e).lower():
            raise sqlite3.OperationalError(
                f"sqlite3.connect falhou ({e}). {_disk_report()}"
            ) from e
        raise


def init_db():
    """Cria as tabelas e aplica migrations de schema se necessário."""
    conn = get_connection()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS clients (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                name                    TEXT    NOT NULL,
                code                    TEXT    UNIQUE NOT NULL,
                drive_gallery_url       TEXT,
                drive_gallery_id        TEXT,
                session_date            TEXT,
                max_selections          INTEGER DEFAULT 20,
                status                  TEXT    DEFAULT 'pending',
                created_at              TEXT    DEFAULT (datetime('now')),
                notes                   TEXT,
                selection_finalized_at  TEXT,
                selection_unlock_count  INTEGER DEFAULT 0,
                selection_locked        INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS selections (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                client_code  TEXT    NOT NULL,
                image_id     TEXT    NOT NULL,
                image_name   TEXT,
                selected_at  TEXT    DEFAULT (datetime('now')),
                UNIQUE(client_code, image_id)
            );
        """)
        conn.commit()

        # Migration: adiciona colunas novas em bancos existentes (sem perder dados)
        _migrate(conn)

    finally:
        conn.close()


def _migrate(conn: sqlite3.Connection):
    """Adiciona colunas que podem não existir em versões antigas do banco."""
    existing = {row[1] for row in conn.execute("PRAGMA table_info(clients)")}
    migrations = [
        ("selection_finalized_at",  "TEXT"),
        ("selection_unlock_count",  "INTEGER DEFAULT 0"),
        ("selection_locked",        "INTEGER DEFAULT 0"),
        # Delivery (entrega final sem watermark)
        ("delivery_released",       "INTEGER DEFAULT 0"),
        ("delivery_message",        "TEXT"),
        ("delivery_zip_path",       "TEXT"),
        ("delivery_zip_size",       "INTEGER"),
        ("delivery_generated_at",   "TEXT"),
        ("delivery_status",         "TEXT DEFAULT 'idle'"),
        ("delivery_downloaded",     "INTEGER DEFAULT 0"),
        ("delivery_downloaded_at",  "TEXT"),
    ]
    for col, col_type in migrations:
        if col not in existing:
            conn.execute(f"ALTER TABLE clients ADD COLUMN {col} {col_type}")
    conn.commit()


# ─── Clientes ────────────────────────────────────────────────────────────────

def create_client(
    name: str,
    code: str,
    drive_gallery_url: Optional[str],
    drive_gallery_id: Optional[str],
    session_date: Optional[str],
    max_selections: int,
    notes: Optional[str],
) -> Optional[dict]:
    conn = get_connection()
    try:
        conn.execute(
            """
            INSERT INTO clients
                (name, code, drive_gallery_url, drive_gallery_id,
                 session_date, max_selections, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (name, code, drive_gallery_url, drive_gallery_id,
             session_date, max_selections, notes),
        )
        conn.commit()
        row_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return get_client_by_id(row_id)
    finally:
        conn.close()


def get_all_clients() -> list:
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM clients ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_client_by_id(client_id: int) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM clients WHERE id = ?", (client_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_client_by_code(code: str) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM clients WHERE code = ?", (code,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def code_exists(code: str) -> bool:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT 1 FROM clients WHERE code = ?", (code,)
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def update_client(client_id: int, **kwargs) -> Optional[dict]:
    allowed = {
        "name", "drive_gallery_url", "drive_gallery_id",
        "session_date", "max_selections", "status", "notes",
        "selection_finalized_at", "selection_unlock_count", "selection_locked",
        "delivery_released", "delivery_message", "delivery_zip_path",
        "delivery_zip_size", "delivery_generated_at", "delivery_status",
        "delivery_downloaded", "delivery_downloaded_at",
    }
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return get_client_by_id(client_id)

    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [client_id]

    conn = get_connection()
    try:
        conn.execute(f"UPDATE clients SET {set_clause} WHERE id = ?", values)
        conn.commit()
        return get_client_by_id(client_id)
    finally:
        conn.close()


def delete_client(client_id: int):
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM selections WHERE client_code = "
            "(SELECT code FROM clients WHERE id = ?)",
            (client_id,),
        )
        conn.execute("DELETE FROM clients WHERE id = ?", (client_id,))
        conn.commit()
    finally:
        conn.close()


# ─── Seleções ────────────────────────────────────────────────────────────────

def save_selection(client_code: str, image_id: str, image_name: str):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO selections (client_code, image_id, image_name) "
            "VALUES (?, ?, ?)",
            (client_code, image_id, image_name),
        )
        conn.commit()
    finally:
        conn.close()


def remove_selection(client_code: str, image_id: str):
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM selections WHERE client_code = ? AND image_id = ?",
            (client_code, image_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_selections(client_code: str) -> list:
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM selections WHERE client_code = ? ORDER BY selected_at",
            (client_code,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def count_selections(client_code: str) -> int:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM selections WHERE client_code = ?",
            (client_code,),
        ).fetchone()
        return row["cnt"] if row else 0
    finally:
        conn.close()
