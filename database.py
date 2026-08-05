import os
import sqlite3
import json
import tempfile
from datetime import datetime

# Determine database path (Use /tmp on Vercel or read-only filesystems)
def get_db_path():
    if os.getenv("VERCEL"):
        return os.path.join(tempfile.gettempdir(), "database.db")
    
    # Local check for write permissions
    local_db = os.path.join(os.path.dirname(__file__), "database.db")
    try:
        # Test if we can open/write to directory
        test_file = os.path.join(os.path.dirname(__file__), ".write_test")
        with open(test_file, "w") as f:
            f.write("1")
        os.remove(test_file)
        return local_db
    except Exception:
        return os.path.join(tempfile.gettempdir(), "database.db")

DATABASE = get_db_path()

def get_connection():
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def create_tables():
    conn = get_connection()
    cursor = conn.cursor()

    # Create chats table if it doesn't exist
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT
    )
    """)

    # Create messages table if it doesn't exist
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        sender TEXT NOT NULL,
        message TEXT NOT NULL,
        files TEXT DEFAULT '[]',
        created_at TEXT,
        FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
    )
    """)

    # Safe migration check for existing tables
    cursor.execute("PRAGMA table_info(chats)")
    chat_cols = [column[1] for column in cursor.fetchall()]
    if "created_at" not in chat_cols:
        cursor.execute("ALTER TABLE chats ADD COLUMN created_at TEXT DEFAULT ''")
    if "updated_at" not in chat_cols:
        cursor.execute("ALTER TABLE chats ADD COLUMN updated_at TEXT DEFAULT ''")

    cursor.execute("PRAGMA table_info(messages)")
    msg_cols = [column[1] for column in cursor.fetchall()]
    if "files" not in msg_cols:
        cursor.execute("ALTER TABLE messages ADD COLUMN files TEXT DEFAULT '[]'")
    if "created_at" not in msg_cols:
        cursor.execute("ALTER TABLE messages ADD COLUMN created_at TEXT DEFAULT ''")

    conn.commit()
    conn.close()

def create_chat(title="New Chat"):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO chats (title, created_at, updated_at) VALUES (?, ?, ?)",
        (title, now, now)
    )
    conn.commit()
    chat_id = cursor.lastrowid
    conn.close()
    return chat_id

def update_chat_title(chat_id, title):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute(
        "UPDATE chats SET title = ?, updated_at = ? WHERE id = ?",
        (title, now, chat_id)
    )
    conn.commit()
    conn.close()

def save_message(chat_id, sender, message, files=None):
    conn = get_connection()
    cursor = conn.cursor()
    files_json = json.dumps(files if files else [])
    now = datetime.now().isoformat()

    cursor.execute(
        """
        INSERT INTO messages (chat_id, sender, message, files, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (chat_id, sender, message, files_json, now)
    )
    cursor.execute(
        "UPDATE chats SET updated_at = ? WHERE id = ?",
        (now, chat_id)
    )
    conn.commit()
    conn.close()

def get_chats(search_query=None):
    conn = get_connection()
    if search_query:
        chats = conn.execute(
            "SELECT * FROM chats WHERE title LIKE ? ORDER BY updated_at DESC",
            (f"%{search_query}%",)
        ).fetchall()
    else:
        chats = conn.execute(
            "SELECT * FROM chats ORDER BY updated_at DESC"
        ).fetchall()
    conn.close()
    return [dict(chat) for chat in chats]

def get_messages(chat_id):
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT id, sender, message, files, created_at
        FROM messages
        WHERE chat_id = ?
        ORDER BY id ASC
        """,
        (chat_id,)
    ).fetchall()
    conn.close()

    result = []
    for row in rows:
        item = dict(row)
        try:
            item["files"] = json.loads(item["files"]) if item["files"] else []
        except Exception:
            item["files"] = []
        result.append(item)
    return result

def delete_chat(chat_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM messages WHERE chat_id = ?", (chat_id,))
    cursor.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
    conn.commit()
    conn.close()

def clear_all_chats():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM messages")
    cursor.execute("DELETE FROM chats")
    conn.commit()
    conn.close()