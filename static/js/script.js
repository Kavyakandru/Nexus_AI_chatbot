/**
 * NEXUS AI PRO — CORE JAVASCRIPT APP
 */

document.addEventListener("DOMContentLoaded", () => {
    // ----------------------------------------------------------------------
    // App State
    // ----------------------------------------------------------------------
    let currentChatId = null;
    let attachedFiles = [];
    let isGenerating = false;
    let renameTargetId = null;

    // Configure Marked.js Options
    if (window.marked) {
        marked.setOptions({
            gfm: true,
            breaks: true,
            headerIds: false,
            mangle: false
        });
    }

    // DOM Elements
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");
    const openSidebarBtn = document.getElementById("openSidebarBtn");
    const closeSidebarBtn = document.getElementById("closeSidebarBtn");
    
    const newChatBtn = document.getElementById("newChatBtn");
    const headerNewChatBtn = document.getElementById("headerNewChatBtn");
    
    const searchInput = document.getElementById("searchInput");
    const clearSearchBtn = document.getElementById("clearSearchBtn");
    const historyList = document.getElementById("historyList");
    
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const headerThemeBtn = document.getElementById("headerThemeBtn");
    const themeIcon = document.getElementById("themeIcon");
    const themeLabel = document.getElementById("themeLabel");
    
    const activeChatTitle = document.getElementById("activeChatTitle");
    const welcomeScreen = document.getElementById("welcomeScreen");
    const messagesWrapper = document.getElementById("messagesWrapper");
    const messagesList = document.getElementById("messagesList");
    const chatContainer = document.getElementById("chatContainer");
    const typingIndicator = document.getElementById("typingIndicator");
    
    const filePreviewsBar = document.getElementById("filePreviewsBar");
    const previewsList = document.getElementById("previewsList");
    const fileInput = document.getElementById("fileInput");
    const attachBtn = document.getElementById("attachBtn");
    const messageInput = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendBtn");
    
    const renameModal = document.getElementById("renameModal");
    const renameInput = document.getElementById("renameInput");
    const closeRenameModalBtn = document.getElementById("closeRenameModalBtn");
    const cancelRenameBtn = document.getElementById("cancelRenameBtn");
    const confirmRenameBtn = document.getElementById("confirmRenameBtn");
    
    const clearAllBtn = document.getElementById("clearAllBtn");
    const clearModal = document.getElementById("clearModal");
    const closeClearModalBtn = document.getElementById("closeClearModalBtn");
    const cancelClearBtn = document.getElementById("cancelClearBtn");
    const confirmClearBtn = document.getElementById("confirmClearBtn");

    // ----------------------------------------------------------------------
    // 1. Theme Management
    // ----------------------------------------------------------------------
    function initTheme() {
        const savedTheme = localStorage.getItem("nexus_theme") || "dark";
        setTheme(savedTheme);
    }

    function setTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("nexus_theme", theme);
        if (theme === "dark") {
            themeIcon.className = "fa-solid fa-moon";
            themeLabel.textContent = "Dark Mode";
            headerThemeBtn.querySelector("i").className = "fa-solid fa-sun";
        } else {
            themeIcon.className = "fa-solid fa-sun";
            themeLabel.textContent = "Light Mode";
            headerThemeBtn.querySelector("i").className = "fa-solid fa-moon";
        }
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute("data-theme");
        setTheme(currentTheme === "dark" ? "light" : "dark");
    }

    themeToggleBtn.addEventListener("click", toggleTheme);
    headerThemeBtn.addEventListener("click", toggleTheme);

    // ----------------------------------------------------------------------
    // 2. Sidebar Navigation & Drawer
    // ----------------------------------------------------------------------
    function openSidebar() {
        sidebar.classList.add("open");
        sidebarOverlay.classList.add("active");
    }

    function closeSidebar() {
        sidebar.classList.remove("open");
        sidebarOverlay.classList.remove("active");
    }

    openSidebarBtn.addEventListener("click", openSidebar);
    closeSidebarBtn.addEventListener("click", closeSidebar);
    sidebarOverlay.addEventListener("click", closeSidebar);

    // ----------------------------------------------------------------------
    // 3. Chat History & Search
    // ----------------------------------------------------------------------
    async function loadHistory(searchQuery = "") {
        try {
            const url = searchQuery ? `/chat_history?q=${encodeURIComponent(searchQuery)}` : "/chat_history";
            const res = await fetch(url);
            const chats = await res.json();
            renderHistoryList(chats);
        } catch (err) {
            console.error("Failed to load chat history:", err);
        }
    }

    function renderHistoryList(chats) {
        historyList.innerHTML = "";
        if (!chats || chats.length === 0) {
            historyList.innerHTML = `<div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">No conversations found</div>`;
            return;
        }

        chats.forEach(chat => {
            const item = document.createElement("div");
            item.className = `history-item ${chat.id === currentChatId ? "active" : ""}`;
            item.dataset.id = chat.id;

            item.innerHTML = `
                <div class="history-item-title">
                    <i class="fa-regular fa-message"></i>
                    <span>${escapeHtml(chat.title)}</span>
                </div>
                <div class="history-item-actions">
                    <span class="action-icon rename-icon" title="Rename"><i class="fa-solid fa-pen"></i></span>
                    <span class="action-icon delete-icon" title="Delete"><i class="fa-solid fa-trash-can"></i></span>
                </div>
            `;

            // Click item to load chat
            item.addEventListener("click", (e) => {
                if (e.target.closest(".rename-icon")) {
                    openRenameModal(chat.id, chat.title);
                } else if (e.target.closest(".delete-icon")) {
                    deleteSingleChat(chat.id);
                } else {
                    selectChat(chat.id, chat.title);
                    if (window.innerWidth <= 768) closeSidebar();
                }
            });

            historyList.appendChild(item);
        });
    }

    searchInput.addEventListener("input", (e) => {
        const val = e.target.value.trim();
        clearSearchBtn.style.display = val ? "block" : "none";
        loadHistory(val);
    });

    clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        clearSearchBtn.style.display = "none";
        loadHistory();
    });

    // ----------------------------------------------------------------------
    // 4. Select / New / Delete Chat
    // ----------------------------------------------------------------------
    function startNewChat() {
        currentChatId = null;
        activeChatTitle.textContent = "New Chat";
        messagesList.innerHTML = "";
        welcomeScreen.style.display = "block";
        messagesWrapper.style.display = "none";
        attachedFiles = [];
        renderFilePreviews();
        messageInput.value = "";
        autoResizeInput();
        loadHistory();
    }

    newChatBtn.addEventListener("click", startNewChat);
    headerNewChatBtn.addEventListener("click", startNewChat);

    async function selectChat(chatId, title) {
        currentChatId = chatId;
        activeChatTitle.textContent = title;
        welcomeScreen.style.display = "none";
        messagesWrapper.style.display = "flex";
        messagesList.innerHTML = "";

        try {
            const res = await fetch(`/load_chat/${chatId}`);
            const messages = await res.json();
            
            messages.forEach(msg => {
                appendMessageRow(msg.sender, msg.message, msg.files || []);
            });

            scrollToBottom();
            loadHistory();
        } catch (err) {
            console.error("Error loading chat messages:", err);
        }
    }

    async function deleteSingleChat(chatId) {
        try {
            await fetch(`/delete_chat/${chatId}`, { method: "DELETE" });
            if (currentChatId === chatId) {
                startNewChat();
            } else {
                loadHistory();
            }
        } catch (err) {
            console.error("Failed to delete chat:", err);
        }
    }

    // ----------------------------------------------------------------------
    // 5. File Upload System
    // ----------------------------------------------------------------------
    attachBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        for (const file of files) {
            const formData = new FormData();
            formData.append("file", file);

            try {
                const res = await fetch("/upload", {
                    method: "POST",
                    body: formData
                });
                if (res.ok) {
                    const fileData = await res.json();
                    attachedFiles.push(fileData);
                } else {
                    alert("Failed to upload file");
                }
            } catch (err) {
                console.error("File upload error:", err);
            }
        }
        fileInput.value = "";
        renderFilePreviews();
    });

    function renderFilePreviews() {
        if (!attachedFiles.length) {
            filePreviewsBar.style.display = "none";
            previewsList.innerHTML = "";
            return;
        }

        filePreviewsBar.style.display = "block";
        previewsList.innerHTML = "";

        attachedFiles.forEach((file, index) => {
            const chip = document.createElement("div");
            chip.className = "preview-chip";
            const iconClass = file.is_image ? "fa-image" : "fa-file-code";

            chip.innerHTML = `
                <i class="fa-solid ${iconClass}" style="color: var(--accent-primary)"></i>
                <span class="preview-chip-name">${escapeHtml(file.original_name)}</span>
                <span style="font-size: 10px; color: var(--text-muted)">(${file.size_formatted})</span>
                <button class="remove-chip-btn" data-index="${index}"><i class="fa-solid fa-xmark"></i></button>
            `;

            chip.querySelector(".remove-chip-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                attachedFiles.splice(index, 1);
                renderFilePreviews();
            });

            previewsList.appendChild(chip);
        });
    }

    // ----------------------------------------------------------------------
    // 6. Message Rendering & Sending
    // ----------------------------------------------------------------------
    function autoResizeInput() {
        messageInput.style.height = "auto";
        messageInput.style.height = Math.min(messageInput.scrollHeight, 180) + "px";
    }

    messageInput.addEventListener("input", autoResizeInput);

    messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    sendBtn.addEventListener("click", handleSend);

    async function handleSend() {
        const text = messageInput.value.trim();
        if ((!text && !attachedFiles.length) || isGenerating) return;

        isGenerating = true;
        sendBtn.disabled = true;

        // Switch screen view
        welcomeScreen.style.display = "none";
        messagesWrapper.style.display = "flex";

        // Display user message
        const currentFiles = [...attachedFiles];
        appendMessageRow("user", text, currentFiles);

        // Reset input area
        messageInput.value = "";
        autoResizeInput();
        attachedFiles = [];
        renderFilePreviews();
        scrollToBottom();

        // Show typing indicator
        typingIndicator.style.display = "flex";
        scrollToBottom();

        try {
            const res = await fetch("/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: currentChatId,
                    message: text,
                    files: currentFiles
                })
            });

            const data = await res.json();
            typingIndicator.style.display = "none";

            if (res.ok) {
                // If title was auto generated / updated
                if (data.chat_id) {
                    currentChatId = data.chat_id;
                }
                if (data.chat_title) {
                    activeChatTitle.textContent = data.chat_title;
                }
                loadHistory();

                // Append Bot Response
                appendMessageRow("bot", data.response);
            } else {
                appendMessageRow("bot", `⚠️ Error: ${data.response || "Something went wrong."}`);
            }
        } catch (err) {
            typingIndicator.style.display = "none";
            appendMessageRow("bot", "⚠️ Network error. Please check your connection.");
            console.error("Chat error:", err);
        } finally {
            isGenerating = false;
            sendBtn.disabled = false;
            scrollToBottom();
        }
    }

    function appendMessageRow(sender, text, files = []) {
        const row = document.createElement("div");
        row.className = `message-row ${sender}`;

        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.innerHTML = sender === "user" ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-brain"></i>';

        const contentBox = document.createElement("div");
        contentBox.className = "message-content-box";

        // Attached files in user message
        if (files && files.length > 0) {
            const filesContainer = document.createElement("div");
            filesContainer.className = "attached-files-container";

            files.forEach(f => {
                if (f.is_image) {
                    const img = document.createElement("img");
                    img.src = f.file_url;
                    img.alt = f.original_name;
                    img.className = "attached-img-preview";
                    filesContainer.appendChild(img);
                } else {
                    const chip = document.createElement("a");
                    chip.href = f.file_url;
                    chip.target = "_blank";
                    chip.className = "attached-file-chip";
                    chip.innerHTML = `
                        <i class="fa-solid fa-file-lines"></i>
                        <div class="file-chip-info">
                            <span class="file-chip-name">${escapeHtml(f.original_name)}</span>
                            <span class="file-chip-size">${f.size_formatted || "File"}</span>
                        </div>
                    `;
                    filesContainer.appendChild(chip);
                }
            });
            contentBox.appendChild(filesContainer);
        }

        // Bubble Text
        const bubble = document.createElement("div");
        bubble.className = "message-bubble";

        if (sender === "bot") {
            // Render Markdown for AI responses
            bubble.innerHTML = window.marked ? marked.parse(text) : escapeHtml(text);
            
            // Process Code Blocks
            bubble.querySelectorAll("pre code").forEach((codeBlock) => {
                if (window.hljs) hljs.highlightElement(codeBlock);

                const pre = codeBlock.parentElement;
                const lang = codeBlock.className.replace("hljs language-", "").replace("hljs", "") || "code";

                const header = document.createElement("div");
                header.className = "code-block-header";
                header.innerHTML = `
                    <span>${lang}</span>
                    <button class="copy-code-btn"><i class="fa-regular fa-copy"></i> Copy code</button>
                `;

                header.querySelector(".copy-code-btn").addEventListener("click", () => {
                    navigator.clipboard.writeText(codeBlock.innerText);
                    const btn = header.querySelector(".copy-code-btn");
                    btn.innerHTML = `<i class="fa-solid fa-check" style="color: #22c55e"></i> Copied!`;
                    setTimeout(() => {
                        btn.innerHTML = `<i class="fa-regular fa-copy"></i> Copy code`;
                    }, 2000);
                });

                pre.insertBefore(header, codeBlock);
            });

            // Action Bar for Bot Message
            const actions = document.createElement("div");
            actions.className = "message-actions";
            actions.innerHTML = `
                <button class="msg-action-btn copy-msg-btn"><i class="fa-regular fa-copy"></i> Copy</button>
            `;
            actions.querySelector(".copy-msg-btn").addEventListener("click", () => {
                navigator.clipboard.writeText(text);
                const btn = actions.querySelector(".copy-msg-btn");
                btn.innerHTML = `<i class="fa-solid fa-check" style="color: #22c55e"></i> Copied!`;
                setTimeout(() => {
                    btn.innerHTML = `<i class="fa-regular fa-copy"></i> Copy`;
                }, 2000);
            });
            contentBox.appendChild(bubble);
            contentBox.appendChild(actions);

        } else {
            // Plain user text
            bubble.textContent = text;
            contentBox.appendChild(bubble);
        }

        row.appendChild(avatar);
        row.appendChild(contentBox);
        messagesList.appendChild(row);
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // ----------------------------------------------------------------------
    // 7. Prompt Suggestion Cards
    // ----------------------------------------------------------------------
    document.querySelectorAll(".suggestion-card").forEach(card => {
        card.addEventListener("click", () => {
            const prompt = card.dataset.prompt;
            if (prompt) {
                messageInput.value = prompt;
                autoResizeInput();
                handleSend();
            }
        });
    });

    // ----------------------------------------------------------------------
    // 8. Modals Management (Rename & Clear)
    // ----------------------------------------------------------------------
    function openRenameModal(chatId, currentTitle) {
        renameTargetId = chatId;
        renameInput.value = currentTitle;
        renameModal.classList.add("active");
        renameInput.focus();
    }

    function closeRenameModal() {
        renameModal.classList.remove("active");
        renameTargetId = null;
    }

    closeRenameModalBtn.addEventListener("click", closeRenameModal);
    cancelRenameBtn.addEventListener("click", closeRenameModal);

    confirmRenameBtn.addEventListener("click", async () => {
        const newTitle = renameInput.value.trim();
        if (!newTitle || !renameTargetId) return;

        try {
            const res = await fetch(`/rename_chat/${renameTargetId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newTitle })
            });

            if (res.ok) {
                if (currentChatId === renameTargetId) {
                    activeChatTitle.textContent = newTitle;
                }
                loadHistory();
                closeRenameModal();
            }
        } catch (err) {
            console.error("Rename failed:", err);
        }
    });

    clearAllBtn.addEventListener("click", () => clearModal.classList.add("active"));
    closeClearModalBtn.addEventListener("click", () => clearModal.classList.remove("active"));
    cancelClearBtn.addEventListener("click", () => clearModal.classList.remove("active"));

    confirmClearBtn.addEventListener("click", async () => {
        try {
            await fetch("/clear_all_chats", { method: "POST" });
            clearModal.classList.remove("active");
            startNewChat();
        } catch (err) {
            console.error("Failed to clear chats:", err);
        }
    });

    // Global Key Shortcuts
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
            e.preventDefault();
            startNewChat();
        }
    });

    // Utilities
    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, (m) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[m]);
    }

    // Init App
    initTheme();
    loadHistory();
});