import os
import json
import uuid
import mimetypes
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from google import genai
from google.genai import types

from config import API_KEY
from database import (
    create_tables,
    create_chat,
    update_chat_title,
    save_message,
    get_chats,
    get_messages,
    delete_chat,
    clear_all_chats
)

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = os.path.join(app.root_path, "uploads")
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # 32MB max upload

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

# ----------------------------
# Gemini Client
# ----------------------------
client = genai.Client(api_key=API_KEY)

# Initialize Database
create_tables()


# Helper: Extract text from uploaded non-image files
def extract_file_text(filepath, filename):
    ext = os.path.splitext(filename)[1].lower()

    # Plain text / Code / Data files
    if ext in [".txt", ".md", ".py", ".js", ".json", ".csv", ".html", ".css", ".c", ".cpp", ".java", ".sql", ".xml", ".yaml", ".yml"]:
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        except Exception as e:
            return f"[Error reading file: {str(e)}]"

    # PDF files
    elif ext == ".pdf":
        try:
            import pypdf
            reader = pypdf.PdfReader(filepath)
            text = ""
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
            return text if text.strip() else "[PDF contains no readable text or is scanned image]"
        except Exception as e:
            return f"[PDF parsing error: {str(e)}]"

    return None


# Helper: Auto Generate Chat Title
def generate_chat_title(first_message):
    try:
        title_prompt = f"Summarize this initial user request into a clean, concise chat title (max 5 words, no quotes, no period):\n\n'{first_message}'"
        res = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=title_prompt
        )
        clean_title = res.text.strip().replace('"', '').replace("'", "")
        return clean_title if clean_title else "New Chat"
    except Exception:
        return "New Chat"


# ----------------------------
# Home Route
# ----------------------------
@app.route("/")
def home():
    return render_template("index.html")


# ----------------------------
# File Upload Endpoint
# ----------------------------
@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    filename = secure_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex[:8]}_{filename}"
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)
    file.save(filepath)

    size = os.path.getsize(filepath)
    mime_type, _ = mimetypes.guess_type(filepath)
    if not mime_type:
        mime_type = "application/octet-stream"

    is_image = mime_type.startswith("image/")

    return jsonify({
        "original_name": filename,
        "filename": unique_name,
        "filepath": filepath,
        "file_url": f"/uploads/{unique_name}",
        "mime_type": mime_type,
        "is_image": is_image,
        "size_formatted": f"{round(size / 1024, 1)} KB" if size < 1024*1024 else f"{round(size / (1024*1024), 2)} MB"
    })


# ----------------------------
# Serve Uploaded Files
# ----------------------------
@app.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


# ----------------------------
# Create New Chat
# ----------------------------
@app.route("/new_chat", methods=["POST"])
def new_chat():
    data = request.get_json() or {}
    title = data.get("title", "New Chat")
    chat_id = create_chat(title)
    return jsonify({
        "chat_id": chat_id,
        "title": title
    })


# ----------------------------
# Main Chat Endpoint
# ----------------------------
@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        chat_id = data.get("chat_id")
        user_message = data.get("message", "").strip()
        attached_files = data.get("files", [])

        if not user_message and not attached_files:
            return jsonify({"response": "Please enter a message or attach a file."}), 400

        # Auto-create chat if no chat_id
        is_first_msg = False
        if not chat_id:
            chat_id = create_chat("New Chat")
            is_first_msg = True
        else:
            # Check if this chat has no messages yet
            existing = get_messages(chat_id)
            if len(existing) == 0:
                is_first_msg = True

        # Save user message
        save_message(chat_id, "user", user_message, attached_files)

        # Build context from previous messages (up to last 10 messages)
        history_msgs = get_messages(chat_id)
        # Exclude the very last message we just saved
        previous_history = history_msgs[:-1] if len(history_msgs) > 1 else []

        # Prepare Gemini Request Contents
        content_parts = []

        # Add brief conversation context if previous messages exist
        if previous_history:
            context_str = "Prior Conversation Context:\n"
            for m in previous_history[-8:]:
                sender_label = "User" if m["sender"] == "user" else "Assistant"
                context_str += f"{sender_label}: {m['message']}\n"
            content_parts.append(context_str + "\n---\n")

        # Process Attached Files
        if attached_files:
            content_parts.append("Attached Files provided by User:")
            for file_info in attached_files:
                fname = file_info.get("filename")
                orig_name = file_info.get("original_name", fname)
                fpath = os.path.join(app.config["UPLOAD_FOLDER"], fname)

                if os.path.exists(fpath):
                    mime = file_info.get("mime_type", "")
                    if mime.startswith("image/"):
                        try:
                            with open(fpath, "rb") as img_f:
                                img_bytes = img_f.read()
                            content_parts.append(f"Image File: {orig_name}")
                            content_parts.append(types.Part.from_bytes(data=img_bytes, mime_type=mime))
                        except Exception as img_err:
                            content_parts.append(f"[Could not process image {orig_name}: {img_err}]")
                    else:
                        extracted_text = extract_file_text(fpath, orig_name)
                        if extracted_text:
                            content_parts.append(f"\n--- File Content ({orig_name}) ---\n{extracted_text}\n--- End File Content ---")

        # Add current user message
        if user_message:
            content_parts.append(f"User Request: {user_message}")

        # System Instruction
        system_instruction = (
            "You are Nexus AI, an advanced, highly intelligent, helpful AI assistant built by Google DeepMind technology. "
            "Respond accurately, clearly, and comprehensively in GitHub-flavored Markdown. "
            "When providing code snippets, always specify the correct language tag in markdown code blocks. "
            "If analyzing files, refer to the file contents provided accurately."
        )

        # Generate Response using Gemini
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=content_parts,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction
            )
        )

        bot_reply = response.text if response.text else "I processed your request, but received no text output."

        # Save bot response
        save_message(chat_id, "bot", bot_reply)

        # Auto-update chat title on first message
        chat_title = None
        if is_first_msg:
            title_source = user_message if user_message else (attached_files[0]["original_name"] if attached_files else "New Chat")
            chat_title = generate_chat_title(title_source)
            update_chat_title(chat_id, chat_title)

        return jsonify({
            "chat_id": chat_id,
            "chat_title": chat_title,
            "response": bot_reply
        })

    except Exception as e:
        print(f"Error in /chat: {e}")
        return jsonify({"response": f"An error occurred: {str(e)}"}), 500


# ----------------------------
# Fetch Chat History
# ----------------------------
@app.route("/chat_history")
def chat_history():
    query = request.args.get("q", "").strip()
    chats = get_chats(search_query=query if query else None)
    return jsonify(chats)


# ----------------------------
# Load Messages of a Chat
# ----------------------------
@app.route("/load_chat/<int:chat_id>")
def load_chat(chat_id):
    messages = get_messages(chat_id)
    return jsonify(messages)


# ----------------------------
# Rename Chat Title
# ----------------------------
@app.route("/rename_chat/<int:chat_id>", methods=["POST"])
def rename_chat(chat_id):
    data = request.get_json() or {}
    new_title = data.get("title", "").strip()
    if not new_title:
        return jsonify({"error": "Title cannot be empty"}), 400

    update_chat_title(chat_id, new_title)
    return jsonify({"success": True, "title": new_title})


# ----------------------------
# Delete Chat
# ----------------------------
@app.route("/delete_chat/<int:chat_id>", methods=["DELETE"])
def remove_chat(chat_id):
    delete_chat(chat_id)
    return jsonify({"success": True})


# ----------------------------
# Clear All Chats
# ----------------------------
@app.route("/clear_all_chats", methods=["POST"])
def clear_all():
    clear_all_chats()
    return jsonify({"success": True})


# ----------------------------
# Run App
# ----------------------------
if __name__ == "__main__":
    app.run(debug=True, port=5000)