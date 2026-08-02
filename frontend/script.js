console.log("Chat App Started");

const API = "http://192.168.0.107:5000/api";
const token = localStorage.getItem("token");

const chatContainer = document.getElementById("chat-list");
const messagesContainer = document.getElementById("messages");
const sendBtn = document.getElementById("send-message");
const messageInput = document.getElementById("message-input");
const leftPanel = document.querySelector(".left")
const resizerPanel = document.querySelector(".resizer");
const messageMenu = document.getElementById("messageMenu")
const deleteMeBtn = document.getElementById("deleteMeBtn");
const deleteEveryoneBtn = document.getElementById("deleteEveryoneBtn");
const copyMsgBtn = document.getElementById("copyMsgBtn");

let selectedChat = null;
let selectedMessageId = null;
let selectedSenderId = null;
let currentChatId = null;
let currentUserProfileId = null;
let currentCallId = null;
let callStartTime = null;
let callTimerInterval = null;
let missedTimer = null;
let peerConnection = null;
let localStream = null;
let incomingOffer = null;
let incomingCallerId = null;
let currentCallReceiverId = null;
let currentCallType = null;
let cachedCallsList = [];
let iceCandidateQueue = []
let currentMediaTabFilter = "media";
let currentCallUserName = "";
let selectedMessageText = "";
let lastRenderedMessageDateString = "";
let typingTimeout;
let targetTabsInitialized = false;
let isResizing = false;
let isTyping = false;
const typingUsers = {};
const outgoingRingSound = new Audio("./sounds/phone-ringing.mp3");
const incomingRingSound = new Audio("./sounds/incoming-call.mp3");
const connectedSound = new Audio("./sounds/call-connected.mp3");
const endCallSound = new Audio("./sounds/end-call.mp3");
outgoingRingSound.loop = true;
incomingRingSound.loop = true;

const rtcConfig = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
};

const msgSound = new Audio("./sounds/mixkit-bell-notification-933.wav");

document.addEventListener("click", () => {
    msgSound.play().then(() => {
        msgSound.pause();
        msgSound.currentTime = 0;
    }).catch(() => { });
}, { once: true });

function showWhatsAppTopPopup(data) {
    const existingNotif = document.querySelector(".wa-top-notification");
    if (existingNotif) existingNotif.remove();

    const notif = document.createElement("div");
    notif.className = "wa-top-notification";

    const senderName = data.senderName || data.ContactName || data.Username || "Contact";
    const avatarUrl = getImage(data.senderAvatar || data.ProfilePicture);
    const msgPreview = data.MessageText || data.lastMessage || (data.MessageType === "image" ? "📷 Photo" : "Message");

    notif.innerHTML = `
        <img src="${avatarUrl}" class="wa-notif-avatar" alt="Avatar">
        <div class="wa-notif-content">
            <div class="wa-notif-header">
                <span class="wa-notif-name">${senderName}</span>
            </div>
            <div class="wa-notif-text">${msgPreview}</div>
        </div>
        <button class="wa-notif-close">&times;</button>
    `;

    notif.addEventListener("click", (e) => {
        if (e.target.classList.contains("wa-notif-close")) return;

        const targetChatId = data.chatId;
        const chatItem = document.querySelector(`.chat-item[data-chat-id="${targetChatId}"]`);
        if (chatItem) chatItem.click();

        notif.classList.add("slide-out");
        setTimeout(() => notif.remove(), 300);
    });

    notif.querySelector(".wa-notif-close").addEventListener("click", (e) => {
        e.stopPropagation();
        notif.classList.add("slide-out");
        setTimeout(() => notif.remove(), 300);
    });

    document.body.appendChild(notif);

    setTimeout(() => {
        if (document.body.contains(notif)) {
            notif.classList.add("slide-out");
            setTimeout(() => notif.remove(), 300);
        }
    }, 4000);
}

function triggerMessageNotification(data) {
    const currentUserId = Number(localStorage.getItem("userId"));

    if (Number(data.senderId) === currentUserId) return;

    const targetChat = allChats.find(c => String(c.ChatId) === String(data.chatId || data.ChatId));
    if (targetChat && (Number(targetChat.IsMuted) === 1 || Boolean(targetChat.IsMuted))) {
        console.log(`Notification suppressed: Chat ${data.chatId} is muted.`);
        return;
    }

    msgSound.play().catch(err => console.log("Audio play blocked:", err));

    showWhatsAppTopPopup(data);
}

function logout() {
    localStorage.clear();
    window.location.href = "accounts.html";
};

let socket;

function initSocket(userId) {
    socket = io("http://192.168.0.107:5000");

    socket.emit("register", userId);

    const processedMessageIds = new Set();

    socket.on("receive_message", (data) => {
        const currentUserId = Number(localStorage.getItem("userId"));

        const msgUniqueKey = data.messageId || data.Id;
        if (msgUniqueKey && processedMessageIds.has(msgUniqueKey)) return;
        if (msgUniqueKey) {
            processedMessageIds.add(msgUniqueKey);
            if (processedMessageIds.size > 200) {
                const firstItem = processedMessageIds.values().next().value;
                processedMessageIds.delete(firstItem);
            }
        }

        loadChats();

        const senderId = Number(data.senderId);
        const incomingChatId = String(data.chatId || data.ChatId || "");
        const activeChatId = String(currentChatId || "");

        const isMe = senderId === currentUserId;

        const isTargetChatActive = activeChatId !== "" && incomingChatId === activeChatId;

        if (!isMe && !isTargetChatActive) {
            triggerMessageNotification(data);

            return;
        }

        if (!isMe && isTargetChatActive) {
            socket.emit("seen_messages", {
                chatId: incomingChatId,
                viewerUserId: currentUserId
            });
        }
        appendDateDivider(data.time || Date.now());

        const div = document.createElement("div");
        div.classList.add("message");
        div.dataset.messageId = data.messageId;
        div.dataset.starred = data.IsStarred ? "1" : "0";
        div.id = `msg-${data.Id || data.messageId}`;
        div.classList.add(isMe ? "sent" : "received");

        const time = new Date(data.time).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });

        const isDeleted = data.DeletedForEveryone == 1 || data.DeletedForEveryone === true;

        let statusReplyHtml = "";
        if (data.isStatusReply || data.messageType === "status_reply") {
            const targetStatusId = data.statusId || data.StatusId;
            const activeProfileId = Number(localStorage.getItem("userId"));
            const isStatusMine = Number(data.StatusOwnerId || data.statusOwnerId) === activeProfileId;

            let displayHeaderName = isStatusMine ? "You" : (data.statusUsername || data.StatusUsername || "User");

            statusReplyHtml = `
            <div class="status-reply-preview" data-status-id="${targetStatusId}" onclick="handleStatusPreviewClick(this)">
                <div class="status-reply-user">
                    ${displayHeaderName} · Status
                </div>
                <div class="status-reply-text">
                    ${data.statusCaption || data.StatusCaption || "Photo"}
                </div>
            </div>
        `;
        }

        const chevronMenuHtml = isDeleted ? "" : `
    <div class="wa-bubble-chevron-container">
        <button class="wa-bubble-chevron-btn"
            onclick="triggerMessageDropdownMenu(event,this,${data.messageId},${data.senderId})">
            <i class="fa-solid fa-chevron-down"></i>
        </button>
    </div>
    `;

        const reactionTriggerHtml = isDeleted ? "" : `
    <div class="wa-action-trigger-container">
        <div class="wa-quick-reactions-popup" id="quickReact-${data.messageId}">
            <button onclick="submitMessageReaction(event,${data.messageId},'👍')">👍</button>
            <button onclick="submitMessageReaction(event,${data.messageId},'❤️')">❤️</button>
            <button onclick="submitMessageReaction(event,${data.messageId},'😂')">😂</button>
            <button onclick="submitMessageReaction(event,${data.messageId},'😮')">😮</button>
            <button onclick="submitMessageReaction(event,${data.messageId},'😢')">😢</button>
            <button onclick="submitMessageReaction(event,${data.messageId},'🙏')">🙏</button>
        </div>
        <button class="wa-reaction-btn" onclick="toggleQuickReactionPopup(event,${data.messageId})">
            <i class="fa-regular fa-face-smile"></i>
        </button>
    </div>
    `;

        const activeReaction = data.Reaction || data.reaction || null;
        let reactionBadgeHtml = "";

        if (activeReaction && !isDeleted) {
            reactionBadgeHtml = `
        <div class="wa-message-reaction-badge" onclick="submitMessageReaction(event,${data.messageId},'REMOVE')">
            ${activeReaction}
        </div>
        `;
        }

        div.innerHTML = `
        ${statusReplyHtml}
        <div class="msg-content-bubble">
            ${chevronMenuHtml}
            ${buildMessageHtml(data, isMe)}
            ${reactionBadgeHtml}
        </div>
        <span class="msg-meta">
        ${time}
        ${isMe ? `<i class="fa-solid ${data.isSeen ? "fa-check-double seen" : data.isDelivered ? "fa-check-double" : "fa-check"}"></i>` : ""}
        </span>
        ${reactionTriggerHtml}
    `;

        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        div.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            selectedMessageId = div.dataset.messageId;
            selectedSenderId = Number(data.senderId);

            const textElement = div.querySelector(".msg-content-bubble p");
            selectedMessageText = textElement ? textElement.innerText : "Media File";

            if (selectedSenderId !== currentUserId) {
                deleteEveryoneBtn.style.display = "none";
            } else {
                deleteEveryoneBtn.style.display = "flex";
            }
        });
    });

    socket.on("incoming-call", (data) => {
        incomingOffer = data.offer;
        incomingCallerId = data.callerId;
        currentCallType = data.callType;
        currentCallId = data.callId;
        let displayName = data.callerName;

        if (cachedCallsList && cachedCallsList.length > 0) {
            const matchedLogRecord = cachedCallsList.find(call =>
                Number(call.CallerId) === Number(data.callerId) ||
                Number(call.ReceiverId) === Number(data.callerId)
            );
            if (matchedLogRecord && matchedLogRecord.ContactName) {
                displayName = matchedLogRecord.ContactName;
            }
        }

        const activeChatHeaderName = document.getElementById("chatUsername")?.innerText;
        if (!displayName && activeChatHeaderName && currentUserProfileId === Number(data.callerId)) {
            displayName = activeChatHeaderName;
        }

        if (displayName) {
            displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        }
        currentCallUserName = displayName;

        document.getElementById("incomingUserName").textContent = displayName;
        document.getElementById("incomingUserImage").src = getImage(data.callerImage);

        missedTimer = setTimeout(async () => {
            if (callStartTime) return;

            try {
                await fetch(`http://192.168.0.107:5000/api/calls/missed/${currentCallId}`, {
                    method: "PUT",
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`
                    }
                });

                socket.emit("send_message", {
                    chatId: currentChatId,
                    senderId: Number(incomingCallerId),
                    messageType: "call_missed",
                    mediaUrl: null,
                    message: currentCallType === "video" ? "Missed video call" : "Missed voice call"
                });
            } catch (err) {
                console.error("Failed to update backend with missed status:", err);
            }

            socket.emit("missed-call", {
                callerId: incomingCallerId
            });
            cleanupCall();

        }, 30000);

        stopAllCallSounds();
        incomingRingSound.play().catch(() => { });

        document.getElementById("incomingCallModal").classList.remove("hidden");
    }
    );

    socket.on("call-accepted", async (data) => {
        try {
            const remoteDescription = new RTCSessionDescription({
                type: 'answer',
                sdp: forceOpusAudioCodec(data.answer.sdp)
            });
            await peerConnection.setRemoteDescription(remoteDescription);

            while (iceCandidateQueue.length > 0) {
                const candidate = iceCandidateQueue.shift();
                await peerConnection.addIceCandidate(candidate);
            }
            document.getElementById("callUserName").innerText = currentCallUserName || "Connected User";
            document.getElementById("callStatus").innerText = "Connected";

            outgoingRingSound.pause();
            outgoingRingSound.currentTime = 0;

            const remoteVideo = document.getElementById("remoteVideo");
            if (remoteVideo) {
                remoteVideo.muted = false;
                remoteVideo.volume = speakerEnabled ? 1.0 : 0.1;
            }
            connectedSound.play().catch(() => { });

            callStartTime = Date.now();
            startLiveCallTimer();
            document.getElementById("callModal").classList.remove("hidden");
        } catch (err) {
            console.error("Error setting up accepted remote call answer:", err);
        }
    });

    socket.on("ice-candidate", async (data) => {
        if (peerConnection && peerConnection.remoteDescription) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
                console.error("Error adding trickled ice candidate:", e);
            }
        } else {
            iceCandidateQueue.push(new RTCIceCandidate(data.candidate));
        }
    });

    socket.on("call-missed", () => {
        stopAllCallSounds();
        endCallSound.play().catch(() => { });
        document.getElementById("callStatus").innerText = "Missed";
        setTimeout(() => {
            cleanupCall();
        }, 1500);
    })

    socket.on("call-ended", () => {
        stopAllCallSounds();
        endCallSound.play().catch(() => { });
        document.getElementById("callStatus").innerText = "Call Ended";
        setTimeout(() => {
            cleanupCall();
        }, 1500);
    });

    socket.on("call-rejected", () => {
        stopAllCallSounds();
        endCallSound.play().catch(() => { });
        document.getElementById("callStatus").innerText = "Rejected";

        if (currentChatId) {
            socket.emit("send_message", {
                chatId: currentChatId,
                senderId: Number(localStorage.getItem("userId")),
                messageType: "call_rejected",
                mediaUrl: null,
                message: currentCallType === "video" ? "Declined video call" : "Declined voice call"
            });
        }
        setTimeout(() => {
            cleanupCall();
        }, 1500);
    });

    socket.on("messages_seen", ({ chatId }) => {

        loadChats();

        if (chatId !== currentChatId) return;

        const icons = messagesContainer.querySelectorAll(".sent .msg-meta i");

        icons.forEach(icon => {

            icon.classList.remove("fa-check");

            icon.classList.remove("fa-check-double");

            icon.classList.add("fa-check-double");

            icon.classList.add("seen");
        });
    });

    socket.on("user_status", (data) => {

        if (data.userId !== currentUserProfileId) return;

        const status = document.getElementById("userStatus");

        if (data.status === "online") {

            status.innerText = "online";

        } else {

            status.innerText = formatLastSeen(data.lastSeen);
        }
        animateStatus();
    });

    socket.on("user_typing", ({ senderId, chatId }) => {

        typingUsers[chatId] = true;

        if (senderId === currentUserProfileId && currentChatId === chatId) {

            document.getElementById("userStatus")
                .innerText = "typing...";
            animateStatus();
        }

        loadChats();
    });

    socket.on("user_stop_typing", ({ chatId }) => {

        delete typingUsers[chatId];

        if (currentChatId === chatId) {

            const activeChat = document.querySelector(".chat-item.active");

            if (activeChat) {

                const isOnline =
                    activeChat.dataset.online === "true";

                const lastSeen =
                    activeChat.dataset.lastseen;

                const status =
                    document.getElementById("userStatus");

                if (isOnline) {

                    status.innerText = "online";

                } else {
                    status.innerText = formatLastSeen(lastSeen);
                }

                animateStatus();
            }
        }

        loadChats();
    });

    socket.on("message_reaction_updated", (data) => {
        if (typeof currentChatId === "undefined" || Number(data.chatId) !== Number(currentChatId)) {
            return;
        }

        const msgDiv = document.querySelector(`[data-message-id="${data.messageId}"]`);
        if (!msgDiv) return;

        const contentBubble = msgDiv.querySelector(".msg-content-bubble");
        if (!contentBubble) return;

        const oldBadge = contentBubble.querySelector(".wa-message-reaction-badge");
        if (oldBadge) oldBadge.remove();

        if (data.emoji) {
            const badge = document.createElement("div");
            badge.className = "wa-message-reaction-badge";
            badge.title = "Remove reaction";
            badge.innerText = data.emoji;

            badge.onclick = (e) => submitMessageReaction(e, data.messageId, 'REMOVE');

            contentBubble.appendChild(badge);
        }
    });

    socket.on("messages_delivered", (data) => {

        loadChats();

        if (data.chatId !== currentChatId) return;

        const icons =
            document.querySelectorAll(".sent .msg-meta i");

        icons.forEach(icon => {

            if (!icon.classList.contains("seen")) {

                icon.classList.remove("fa-check");

                icon.classList.add("fa-check-double");
            }
        });
    });

    socket.on("messages_delivered_global", () => {

        loadChats();

        if (currentChatId) {
            loadMessages(currentChatId);
        }

        const icons =
            document.querySelectorAll(".sent .msg-meta i");

        icons.forEach(icon => {

            if (icon.classList.contains("seen")) return;

            if (icon.classList.contains("fa-check")) {

                icon.classList.remove("fa-check");

                icon.classList.add("fa-check-double");
            }
        });
    });

    socket.on("message_deleted_everyone", ({ messageId }) => {

        const deletedMsg = document.querySelector(
            `[data-message-id="${messageId}"]`
        );

        if (deletedMsg) {

            const bubble = deletedMsg.querySelector(".msg-content-bubble");

            if (bubble) {

                const replyQuote =
                    bubble.querySelector(".reply-quote");

                const statusReply =
                    bubble.querySelector(".status-reply-preview");

                bubble.innerHTML = "";

                if (statusReply) {
                    bubble.appendChild(statusReply);
                }

                if (replyQuote) {
                    bubble.appendChild(replyQuote);
                }

                bubble.insertAdjacentHTML(
                    "beforeend",
                    `
                <p class="deleted-msg">
                    This message was deleted
                </p>
                `
                );

                deletedMsg.dataset.deleted = "true";
            }
        }

        document
            .querySelectorAll(`.reply-quote[data-reply-id="${messageId}"]`)
            .forEach(reply => {

                reply.innerHTML = `
                <div class="reply-name">
                    Original message
                </div>

                <div class="reply-text deleted-msg">
                    This message was deleted
                </div>
            `;

                reply.removeAttribute("onclick");
            });

        if (typeof loadChats === "function") {
            loadChats();
        }

        if (typeof loadAllMediaGalleryPanel === "function") {
            loadAllMediaGalleryPanel();
        }

        if (window.currentContactId &&
            typeof loadUserProfile === "function") {

            loadUserProfile(window.currentContactId);
        }
    });

    socket.on("message_deleted_me", ({ messageId }) => {
        const msgDiv = document.querySelector(`[data-message-id="${messageId}"]`);
        if (msgDiv) {
            msgDiv.remove(); // Removes the message bubble safely from the chat view
        }

        // FIX: Force all panels to recalculate and clear the media instantly without a refresh
        if (typeof loadChats === "function") {
            loadChats();
        }
        if (typeof loadAllMediaGalleryPanel === "function") {
            loadAllMediaGalleryPanel();
        }
        if (window.currentContactId && typeof loadUserProfile === "function") {
            loadUserProfile(window.currentContactId);
        }
    });

    socket.on("chat_list_update", () => {
        loadChats();
    });

    socket.on("call_list_update", () => {
        loadCalls();
    });

    socket.on("refresh_status", () => {
        loadStatuses();
    })

};

async function checkAuth() {
    if (!token) {
        window.location.href = "accounts.html";
        return;
    }

    try {
        const res = await fetch(`${API}/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (res.status === 401) {
            localStorage.clear();
            window.location.href = "accounts.html";
            return;
        }

        const user = await res.json();

        localStorage.setItem("userId", user.Id);

        initSocket(user.Id);

        loadChats();
        loadCalls();
        loadMyProfile();

    } catch (error) {
        console.log(error);
        console.log("Server down or network error");
    }
};

document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
    loadStatuses();
});

function getImage(img) {
    if (!img || img === "null" || img === "undefined") {
        return "img/default-avatar.svg";
    }

    if (img.startsWith("http")) return img;

    return `http://192.168.0.107:5000${img}`;
};

function animateStatus() {

    const status =
        document.getElementById("userStatus");

    status.classList.remove("animate-status");

    void status.offsetWidth;

    status.classList.add("animate-status");
};

function formatLastSeen(lastSeen) {

    if (!lastSeen) return "offline";

    const date = new Date(lastSeen);

    const now = new Date();

    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date();

    yesterday.setDate(now.getDate() - 1);

    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });

    if (isToday) {

        return `last seen today at ${time}`;

    } else if (isYesterday) {

        return `last seen yesterday at ${time}`;

    } else {

        return `last seen on ${date.toLocaleDateString()} at ${time}`;
    }
};

function formatStatusTime(dateString) {

    const date = new Date(dateString);

    const now = new Date();

    const isToday =
        date.toDateString() ===
        now.toDateString();

    const yesterday = new Date();

    yesterday.setDate(now.getDate() - 1);

    const isYesterday =
        date.toDateString() ===
        yesterday.toDateString();

    const time =
        date.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });

    if (isToday) {

        return `Today at ${time}`;

    } else if (isYesterday) {

        return `Yesterday at ${time}`;

    } else {

        return `${date.toLocaleDateString()} at ${time}`;
    }
};

async function openChat(chat) {

    const currentUserId = Number(localStorage.getItem("userId"));

    currentChatId = chat.ChatId;

    socket.emit("join_chat", {
        chatId: chat.ChatId,
        userId: currentUserId
    });

    await loadMessages(chat.ChatId);

    currentCallUserName =
        chat.ContactName ||
        chat.Username ||
        chat.PhoneNumber;

    currentUserProfileId = chat.UserId;

    let rawName =
        chat.ContactName ||
        chat.Username ||
        chat.PhoneNumber ||
        "user";

    let formattedName =
        rawName.charAt(0).toUpperCase() +
        rawName.slice(1);

    document.getElementById("chatUsername").innerText =
        formattedName;

    document.querySelector(".chat-user img").src =
        getImage(chat.ProfilePicture);

    document.querySelector(".chat-header").style.display = "flex";

    document.querySelector(".message-input").style.display = "flex";

    document.querySelector(".chat-area")
        .classList.add("chat-open");

    document.querySelector(".left")
        .classList.add("hidden-mobile");

    const statusText =
        document.getElementById("userStatus");

    if (chat.isOnline) {
        statusText.innerText = "online";
    } else {
        statusText.innerText = formatLastSeen(chat.LastSeen);
    }

    animateStatus();
};

function startLiveCallTimer() {
    if (callTimerInterval) clearInterval(callTimerInterval);

    const timerElement = document.getElementById("callLiveTimer");
    if (timerElement) {
        timerElement.style.display = "block";
        timerElement.innerText = "00:00";
    }

    let totalSeconds = 0;

    callTimerInterval = setInterval(() => {
        totalSeconds++;

        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');

        if (timerElement) {
            timerElement.innerText = `${minutes}:${seconds}`;
        }
    }, 1000);
};

function stopLiveCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }

    const timerElement = document.getElementById("callLiveTimer");
    if (timerElement) {
        timerElement.innerText = "00:00";
        timerElement.style.display = "none"; // Hides it cleanly when call closes
    }
};

function formatCallDuration(seconds) {
    if (!seconds || isNaN(seconds)) return "";
    if (seconds < 60) return `${seconds} seconds`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs === 0 ? `${mins} min` : `${mins} m ${secs} s`;
};

function executeDownloadAction(btnElement) {
    const wrapper = btnElement.closest('.wa-blur-media-wrapper');
    const msgId = wrapper.dataset.msgId;
    const fullUrl = wrapper.dataset.url;
    const messageType = wrapper.dataset.type;

    const icon = btnElement.querySelector('i');
    icon.className = "fa-solid fa-spinner fa-spin";

    setTimeout(() => {
        localStorage.setItem(`wa_downloaded_${msgId}`, "true");
        let mediaHtml = "";

        // FIX: Add the onclick handlers, cursor pointers, and dataset hooks directly onto the newly downloaded markup string!
        if (messageType === "image") {
            mediaHtml = `<img src="${fullUrl}" class="chat-image" data-src="${fullUrl}" data-type="image" onclick="openMediaLightbox(this)" style="cursor: pointer;">`;
        } else if (messageType === "video") {
            // Match the strict 280px width wrapper configuration we set earlier to prevent layout pops
            mediaHtml = `
                <div class="chat-video" data-src="${fullUrl}" data-type="video" onclick="openMediaLightbox(this)">
                    <video class="chat-video-element"><source src="${fullUrl}"></video>
                    <i class="fa-solid fa-play"></i>
                </div>`;
        } else if (messageType === "audio") {
            mediaHtml = `<div class="audio-msg"><audio controls><source src="${fullUrl}"></audio></div>`;
        }

        // Swap out the blur overlay canvas with the active, interactive media element track row
        wrapper.outerHTML = mediaHtml;

        document
            .querySelectorAll(`[data-reply-id="${msgId}"]`)
            .forEach(reply => {

                const placeholder =
                    reply.querySelector(".reply-blur-thumb");

                if (!placeholder) return;

                if (messageType === "image") {

                    placeholder.outerHTML = `
                <img
                    src="${fullUrl}"
                    class="reply-preview-thumb">
            `;

                } else if (messageType === "video") {

                    placeholder.outerHTML = `
                <video
                    class="reply-preview-thumb"
                    muted>

                    <source src="${fullUrl}">

                </video>
            `;
                }

            });

        // Refresh the shared side panels immediately so the file populates into the profile grid views live
        const mediaPanel = document.getElementById("media-panel");
        if (mediaPanel && !mediaPanel.classList.contains("hidden")) {
            loadAllMediaGalleryPanel();
        }
        if (window.currentContactId && typeof loadUserProfile === "function") {
            loadUserProfile(window.currentContactId);
        }
    }, 850);
};

function getFormattedDateDividerText(dateValue) {
    const msgDate = new Date(dateValue);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (msgDate.toDateString() === today.toDateString()) {
        return "Today";
    } else if (msgDate.toDateString() === yesterday.toDateString()) {
        return "Yesterday";
    } else {
        return msgDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
    }
};

function appendDateDivider(timestamp, isClearTarget = false) {
    if (isClearTarget) {
        lastRenderedMessageDateString = "";
    }

    const currentDateStr = new Date(timestamp).toDateString();
    if (currentDateStr !== lastRenderedMessageDateString) {
        lastRenderedMessageDateString = currentDateStr;

        const dividerDiv = document.createElement("div");
        dividerDiv.className = "chat-date-divider-container";
        dividerDiv.innerHTML = `<span class="chat-date-badge">${getFormattedDateDividerText(timestamp)}</span>`;
        messagesContainer.appendChild(dividerDiv);
    }
};

async function handleStatusPreviewClick(element) {
    const rawAttr = element.getAttribute("data-status-id");
    const activeProfileId = Number(localStorage.getItem("userId"));

    const userHeaderElement = element.querySelector(".status-reply-user");
    const isMyOwnStatusReply = userHeaderElement && userHeaderElement.innerText.includes("You");

    if (!rawAttr || rawAttr === "undefined" || rawAttr === "null") {
        console.warn("Live socket packet lacked persistent row indices. Re-routing fallback scanning mechanics...");

        if (isMyOwnStatusReply) {
            const myStatusContainer = document.querySelector(".my-status");
            if (myStatusContainer) {
                myStatusContainer.click();
                return;
            }
        } else {
            const statusPanelList = document.querySelector(".status-list");
            if (statusPanelList) {
                const firstActiveUpdateRow = statusPanelList.querySelector(".status-item");
                if (firstActiveUpdateRow) {
                    firstActiveUpdateRow.click();
                    return;
                }
            }
        }
        alert("Please select the active status card update from the left status side panel container directly.");
        return;
    }

    const targetId = Number(rawAttr);
    try {
        const res = await fetch(`${API}/status?userId=${activeProfileId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const allStatuses = await res.json();

        let targetGroup = null;
        const grouped = {};
        allStatuses.forEach(s => {
            if (!grouped[s.UserId]) grouped[s.UserId] = [];
            grouped[s.UserId].push(s);
        });

        Object.values(grouped).forEach(group => {
            if (group.some(s => Number(s.Id) === targetId)) {
                targetGroup = group;
            }
        });

        if (targetGroup) {
            openStatus(targetGroup);
            const statusIndex = targetGroup.findIndex(s => Number(s.Id) === targetId);
            if (statusIndex !== -1) {
                currentIndex = statusIndex;
                showStatus();
            }
        } else {
            alert("Status no longer available.");
        }
    } catch (err) {
        console.error("Failed to execute link routing logic:", err);
    }
};

resizerPanel.addEventListener("mousedown", () => {
    isResizing = true;
});

document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    leftPanel.style.width = e.clientX + "px";
});

document.addEventListener("mouseup", () => {
    isResizing = false;
});

let toastTimer;

function showToast(message, options = {}) {

    const {
        icon = "fa-check",
        undo = false,
        onUndo = null
    } = options;

    const toast = document.getElementById("toast");
    const text = document.getElementById("toastText");
    const iconEl = document.getElementById("toastIcon");
    const undoBtn = document.getElementById("toastUndo");

    clearTimeout(toastTimer);

    text.textContent = message;
    iconEl.className = `fa-solid ${icon}`;

    if (undo) {

        undoBtn.classList.remove("hidden");

        undoBtn.onclick = () => {

            toast.classList.remove("show");

            if (onUndo) {
                onUndo();
            }

        };

    } else {

        undoBtn.classList.add("hidden");
        undoBtn.onclick = null;

    }

    toast.classList.add("show");

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function updateSidebarChatBadge(totalUnreadCount) {
    const badge = document.getElementById("sidebarChatBadge");
    if (!badge) return;

    if (totalUnreadCount > 0) {
        badge.innerText = totalUnreadCount > 99 ? "99+" : totalUnreadCount;
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
}

// Toggle Dot Indicators for Status/Channels/Calls
function setSidebarDotBadge(elementId, show) {
    const badge = document.getElementById(elementId);
    if (!badge) return;

    if (show) {
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
}

const leftSidebarBtns = document.querySelectorAll(".left-sidebar button");
const sections = document.querySelectorAll(`
    #chat-panel,
    #calls-panel,
    #call-contact-panel,
    #contact-panel,
    #status-panel,
    #status-privacy-panel,
    #channels-panel,
    #communities-panel,
    #archived-panel,
    #meta-panel,
    #media-panel,
    #profile-panel,
    #profile-edit-panel,
    #starred-panel
`);

leftSidebarBtns.forEach((button) => {
    button.addEventListener("click", () => {
        leftSidebarBtns.forEach((btn) => btn.classList.remove("active"));
        button.classList.add("active");

        sections.forEach((section) => section.classList.add("hidden"));

        const sectionId = button.dataset.section;

        // Clear dot badges when opening their respective panels
        if (sectionId === "status-panel") setSidebarDotBadge("sidebarStatusBadge", false);
        if (sectionId === "calls-panel") setSidebarDotBadge("sidebarCallsBadge", false);
        if (sectionId === "channels-panel") setSidebarDotBadge("sidebarChannelsBadge", false);

        if (sectionId === "media-panel") {
            loadAllMediaGalleryPanel();
        }

        if (sectionId) {
            const targetSection = document.getElementById(sectionId);
            if (targetSection) {
                targetSection.classList.remove("hidden");
            }
        }
    });
});

function onChatsLoaded(chats) {
    const totalUnread = chats.filter(c => Number(c.unread) > 0).length;
    updateSidebarChatBadge(totalUnread);
}

async function loadAllMediaGalleryPanel() {
    const galleryContent = document.getElementById("media-gallery-content");
    if (!galleryContent) return;

    galleryContent.innerHTML = `<div style="color: #8696a0; text-align: center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading assets...</div>`;

    try {
        const response = await fetch(`${API}/media/all`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const mediaItems = await response.json();

        setupMediaSubTabsListeners();

        if (!mediaItems || mediaItems.length === 0) {
            galleryContent.innerHTML = `<div style="color: #8696a0; text-align: center; padding: 40px;">No media items found</div>`;
            return;
        }

        const currentUserId = Number(localStorage.getItem("userId"));
        let filteredItems = [];

        if (currentMediaTabFilter === "media") {
            filteredItems = mediaItems.filter(item => {
                const msgType = item.MessageType || item.messagetype || "";
                const isMediaMessage = msgType === "image" || msgType === "video";
                if (!isMediaMessage) return false;

                if (item.DeletedForEveryone == 1 || item.DeletedForEveryone === true || item.isDeleted) {
                    return false;
                }

                const activeDomMsg = document.querySelector(`[data-message-id="${item.Id}"]`);
                if (activeDomMsg && (activeDomMsg.querySelector(".deleted-msg") || activeDomMsg.innerHTML.includes("deleted"))) {
                    return false;
                }

                const isMe = Number(item.SenderId) === currentUserId;
                const isDownloaded = localStorage.getItem(`wa_downloaded_${item.Id}`) === "true";

                return isMe || isDownloaded;
            });
        } else if (currentMediaTabFilter === "docs") {
            filteredItems = mediaItems.filter(item => {
                const msgType = item.MessageType || item.messagetype || "";
                if (msgType !== "document") return false;

                return true;
            });
        } else if (currentMediaTabFilter === "links") {
            filteredItems = mediaItems.filter(item => {
                const text = item.MessageText || "";
                return text.includes("http://") || text.includes("https://") || text.includes("www.");
            });
        }

        if (filteredItems.length === 0) {
            galleryContent.innerHTML = `<div style="color: #8696a0; text-align: center; padding: 40px;">No ${currentMediaTabFilter} found here yet</div>`;
            return;
        }

        galleryContent.innerHTML = "";

        const groups = { "Recent": [], "Yesterday": [], "Older": [] };
        const todayStr = new Date().toDateString();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();

        filteredItems.forEach(item => {
            const itemDate = new Date(item.CreatedAt).toDateString();
            if (itemDate === todayStr) groups["Recent"].push(item);
            else if (itemDate === yesterdayStr) groups["Yesterday"].push(item);
            else groups["Older"].push(item);
        });

        const serverUrl = API.replace("/api", "");

        for (const [title, items] of Object.entries(groups)) {
            if (items.length === 0) continue;

            const sectionBlock = document.createElement("div");
            sectionBlock.style.marginBottom = "24px";

            const isGridLayout = currentMediaTabFilter === "media";

            sectionBlock.innerHTML = `
                <h3 style="color: #8696a0; font-size: 12px; font-weight: 400; margin: 0 0 12px 0;">${title}</h3>
                <div class="content-wrapper" style="${isGridLayout
                    ? "display: grid; grid-template-columns: repeat(3, 1fr); gap:30px 5px;"
                    : "display: flex; flex-direction: column; gap: 8px;"
                }"></div>
            `;

            const container = sectionBlock.querySelector(".content-wrapper");

            items.forEach(file => {
                const fullAssetUrl = serverUrl + file.MediaUrl;
                const listItem = document.createElement("div");
                listItem.style.cursor = "pointer";

                if (currentMediaTabFilter === "media") {
                    listItem.style.position = "relative";
                    listItem.style.aspectRatio = "1";
                    listItem.style.background = "#f6f8fa";
                    listItem.style.borderRadius = "6px";
                    listItem.style.padding = "1px";
                    listItem.style.boxShadow = "0 0 10px black";

                    if (file.MessageType === "image") {
                        listItem.innerHTML = `
                            <img src="${fullAssetUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:6px;">
                            <div class="media-grid-overlay">
                                <span>By ${file.SenderName || 'User'}</span>
                            </div>
                        `;
                    } else if (file.MessageType === "video") {
                        listItem.innerHTML = `
                            <video src="${fullAssetUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:6px;"></video>
                            <i class="fa-solid fa-play" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:white; font-size:14px;"></i>
                            <div class="media-grid-overlay">
                                <span>By ${file.SenderName || 'User'}</span>
                            </div>
                        `;
                    }
                } else if (currentMediaTabFilter === "docs") {
                    listItem.style.background = "#1f2c34";
                    listItem.style.padding = "10px 14px";
                    listItem.style.borderRadius = "6px";
                    listItem.style.display = "flex";
                    listItem.style.alignItems = "center";
                    listItem.style.gap = "12px";

                    const fileName = file.MediaUrl ? file.MediaUrl.split("/").pop() : "Document File";
                    listItem.innerHTML = `
                        <i class="fa-solid fa-file-lines" style="color: #53bdeb; font-size: 20px;"></i>
                        <div style="flex: 1; min-width: 0;">
                            <div style="color: #e9edef; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${fileName}</div>
                            <span style="color: #8696a0; font-size: 11px;">By ${file.SenderName || 'User'}</span>
                        </div>
                    `;
                } else if (currentMediaTabFilter === "links") {
                    listItem.style.background = "#1f2c34";
                    listItem.style.padding = "12px";
                    listItem.style.borderRadius = "6px";
                    listItem.style.display = "flex";
                    listItem.style.flexDirection = "column";
                    listItem.style.gap = "4px";

                    const linkText = file.MessageText || file.message || "";
                    const senderDisplay = file.SenderName || file.senderName || "User";

                    listItem.innerHTML = `
                        <div style="color: #53bdeb; font-size: 13.5px; word-break: break-all; text-decoration: underline;">
                            ${linkText}
                        </div>
                        <span style="color: #8696a0; font-size: 11px;">Sent by ${senderDisplay}</span>
                    `;
                }

                let rawName = file.ContactName || file.Username || file.PhoneNumber || "user";
                let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

                listItem.addEventListener("click", () => {
                    currentChatId = file.ChatId;
                    currentUserProfileId = file.SenderId === Number(localStorage.getItem("userId")) ? file.ReceiverId : file.SenderId;
                    socket.emit("join_chat", { chatId: currentChatId, userId: Number(localStorage.getItem("userId")) });
                    loadMessages(currentChatId);

                    let rawName = file.ContactName || "user";
                    let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

                    document.querySelector(".chat-header").style.display = "flex";
                    document.querySelector(".chat-area").classList.add("chat-open");
                    document.getElementById("chatUsername").innerText = formattedName;
                    document.querySelector(".message-input").style.display = "flex";
                    document.querySelector(".chat-user img").src = getImage(file.ProfilePicture);

                    document.getElementById("modalName").innerText = formattedName;
                    document.getElementById("modalPhone").innerText = file.PhoneNumber || "No Number";
                    document.getElementById("modalAbout").innerText = file.About || "Hey there! I'm using ChatWeb";
                    document.getElementById("modalImg").src = getImage(file.ProfilePicture);

                    const statusEl = document.getElementById("userStatus");
                    statusEl.innerText = "offline";
                    statusEl.classList.remove("animate-status");
                    void statusEl.offsetWidth;
                    statusEl.classList.add("animate-status");

                    setTimeout(() => {
                        if (typeof loadUserProfile === "function") {
                            loadUserProfile(currentUserProfileId);
                        }
                        document.getElementById("profileModal").classList.add("active");
                    }, 250);
                });

                container.appendChild(listItem);
            });

            galleryContent.appendChild(sectionBlock);
        }
    } catch (error) {
        console.error("Failed to render media items layout lists view panel context:", error);
        galleryContent.innerHTML = `<div style="color: #ef4444; text-align: center; padding: 20px;">Failed to load media files.</div>`;
    }
};

function setupMediaSubTabsListeners() {
    if (targetTabsInitialized) return;

    const subTabs = document.querySelectorAll(".media-tab");
    subTabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            subTabs.forEach(t => {
                t.classList.remove("active");
                t.style.color = "#8696a0";
                t.style.borderBottom = "none";
            });

            tab.classList.add("active");
            tab.style.color = "#00a884";
            tab.style.borderBottom = "3px solid #00a884";

            currentMediaTabFilter = tab.dataset.tab;
            loadAllMediaGalleryPanel();
        });
    });

    targetTabsInitialized = true;
};

const displayNewContact = document.querySelector(".display-new-contact");
displayNewContact.addEventListener("click", () => {
    document.querySelector(".new-chat").click();
});

const filterButtons = document.querySelectorAll(".filter-btn");
let activeFilter = "all";

filterButtons.forEach(btn => {

    btn.addEventListener("click", () => {

        filterButtons.forEach(button => {
            button.classList.remove("active");
        });

        btn.classList.add("active");

    });

});

document.getElementById("allFilter").addEventListener("click", () => {
    activeFilter = "all";
    loadChats();
});
document.getElementById("unreadFilter").addEventListener("click", () => {
    activeFilter = "unread";
    loadChats();
});
document.getElementById("favFilter").addEventListener("click", () => {
    activeFilter = "favourites";
    loadChats();
});
document.getElementById("caretFilter").addEventListener("click", () => {
    activeFilter = "caret";
    loadChats();
});

// document.getElementById("profileAddFav").addEventListener("click", () => {})
let selectedChatId = null;

function openChatMenu(x, y, chat) {

    selectedChatId = chat.ChatId;
    selectedChat = chat;

    const menu = document.getElementById("chatItemMenu");
    const favItem = document.getElementById("favChat");

    document.querySelectorAll(".chat-item")
        .forEach(item => item.classList.remove("menu-open"));

    const currentItem = document.querySelector(
        `.chat-item[data-chat-id="${chat.ChatId}"]`
    );

    if (currentItem) {
        currentItem.classList.add("menu-open");
    }

    if (chat.IsFavourite) {

        favItem.classList.add("favourite-active");

        favItem.innerHTML = `
            <i class="fa-solid fa-heart"></i>
            <span>Remove from favourites</span>
        `;

    } else {

        favItem.classList.remove("favourite-active");

        favItem.innerHTML = `
            <i class="fa-regular fa-heart"></i>
            <span>Add to favourites</span>
        `;

    }

    const pinItem = document.getElementById("pinChat");


    if (chat.IsPinned) {

        pinItem.classList.add("pin-active");

        pinItem.innerHTML = `
            <i class="fa-solid fa-thumbtack"></i>
            <span>Unpin chat</span>
        `;

    } else {

        pinItem.classList.remove("pin-active");

        pinItem.innerHTML = `
            <i class="fa-solid fa-thumbtack"></i>
            <span>Pin chat</span>
        `;

    }

    const unreadItem = document.getElementById("markUnread");

    const hasUnreadMessages = Number(chat.unread) > 0 || Boolean(chat.IsMarkedUnread);

    if (hasUnreadMessages) {
        unreadItem.innerHTML = `
            <i class="fa-regular fa-envelope-open"></i>
            <span>Mark as read</span>
        `;
    } else {
        unreadItem.innerHTML = `
            <i class="fa-regular fa-envelope"></i>
            <span>Mark as unread</span>
        `;
    }


    const isMuted = Number(chat.IsMuted) === 1 || Boolean(chat.IsMuted);
    const muteItem = document.getElementById("muteChat");
    if (isMuted) {
        muteItem.innerHTML = `
            <i class="fa-regular fa-bell"></i>
            <span>Unmute notifications</span>
        `;
    } else {
        muteItem.innerHTML = `
            <i class="fa-regular fa-bell-slash"></i>
            <span>Mute notifications</span>
            <i class="fa-solid fa-angle-right" style="margin-left: auto;"></i>
        `;
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    menu.classList.remove("hidden");

}

const searchInput = document.getElementById("chatSearchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const recentContainer = document.getElementById("recentSearchesContainer");
const recentList = document.getElementById("recentSearchesList");
const clearAllRecentBtn = document.getElementById("clearAllRecentBtn");

function getRecentSearches() {
    try {
        return JSON.parse(localStorage.getItem("recentChatSearches") || "[]");
    } catch (e) {
        return [];
    }
}

function saveToRecentSearches(chat) {
    if (!chat || !chat.ChatId) return;

    let recents = getRecentSearches();
    recents = recents.filter(item => item.ChatId !== chat.ChatId);

    recents.unshift({
        ChatId: chat.ChatId,
        ContactName: chat.ContactName,
        Username: chat.Username,
        PhoneNumber: chat.PhoneNumber,
        ProfilePicture: chat.ProfilePicture,
        UserId: chat.UserId
    });

    if (recents.length > 5) recents.pop();

    localStorage.setItem("recentChatSearches", JSON.stringify(recents));
}

function renderRecentSearches() {
    const recents = getRecentSearches();
    if (!recentList || !recentContainer) return;

    recentList.innerHTML = "";

    if (recents.length === 0) {
        recentContainer.classList.add("collapsed");
        return;
    }

    recentContainer.classList.remove("collapsed");

    recents.forEach(chat => {
        let rawName = chat.ContactName || chat.Username || chat.PhoneNumber || "user";
        let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
        let img = getImage(chat.ProfilePicture);

        const div = document.createElement("div");
        div.classList.add("search-chat-item");
        div.innerHTML = `
            <div class="search-chat-info">
                <img src="${img}" class="search-chat-avatar">
                <div class="search-top-row">
                    <h4 class="search-chat-name">${formattedName}</h4>
                </div>
            </div>
        `;

        div.addEventListener("click", (e) => {
            e.stopPropagation();

            recentContainer.classList.add("collapsed");

            resetSearchState();

            const targetItem = chatContainer.querySelector(`[data-chat-id="${chat.ChatId}"]`);
            if (targetItem) {
                targetItem.click();
            }
        });

        recentList.appendChild(div);
    });
}

function resetSearchState() {
    if (searchInput) searchInput.value = "";
    if (clearSearchBtn) clearSearchBtn.classList.add("hidden");

    const chatItems = chatContainer.querySelectorAll(".chat-item");
    chatItems.forEach(item => {
        item.style.display = "flex";
    });

    const emptyMessage = document.getElementById("emptyChatsMessage");
    if (emptyMessage) emptyMessage.style.display = "none";
}

if (searchInput) {
    searchInput.addEventListener("focus", () => {
        if (searchInput.value.trim() === "") {
            renderRecentSearches();
        }
    });

    searchInput.addEventListener("click", (e) => {
        e.stopPropagation();
        if (searchInput.value.trim() === "") {
            renderRecentSearches();
        }
    });

    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();

        if (query.length > 0) {
            if (clearSearchBtn) clearSearchBtn.classList.remove("hidden");
            if (recentContainer) recentContainer.classList.add("collapsed");
        } else {
            if (clearSearchBtn) clearSearchBtn.classList.add("hidden");
            renderRecentSearches();
        }

        filterChatsByQuery(query);
    });
}

if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        resetSearchState();
        renderRecentSearches();
        searchInput.focus();
    });
}

if (clearAllRecentBtn) {
    clearAllRecentBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        localStorage.removeItem("recentChatSearches");
        if (recentContainer) recentContainer.classList.add("collapsed");
    });
}

function filterChatsByQuery(query) {
    const chatItems = chatContainer.querySelectorAll(".chat-item");
    let hasMatches = false;

    chatItems.forEach(item => {
        const name = item.querySelector(".chat-name")?.innerText.toLowerCase() || "";
        const msg = item.querySelector(".last-msg")?.innerText.toLowerCase() || "";

        if (name.includes(query) || msg.includes(query)) {
            item.style.display = "flex";
            hasMatches = true;
        } else {
            item.style.display = "none";
        }
    });

    const emptyMessage = document.getElementById("emptyChatsMessage");
    if (emptyMessage) {
        if (!hasMatches && query !== "") {
            emptyMessage.style.display = "block";
            emptyMessage.innerText = "No chats found";
        } else if (query === "") {
            emptyMessage.style.display = "none";
        }
    }
}

document.addEventListener("click", (e) => {
    const searchContainer = document.querySelector(".search-container") || document.querySelector(".search-box");

    if (
        searchContainer &&
        !searchContainer.contains(e.target) &&
        recentContainer &&
        !recentContainer.contains(e.target)
    ) {
        if (recentContainer) recentContainer.classList.add("collapsed");
    }
});

let allChats = [];
async function loadChats() {
    try {
        const response = await fetch(`${API}/chat`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
            localStorage.clear();
            window.location.href = "accounts.html";
            return;
        }

        const chats = await response.json();
        chats.sort((a, b) => {
            if (a.IsPinned !== b.IsPinned) {
                return b.IsPinned - a.IsPinned;
            }
            return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
        });

        const totalUnreadMessages = chats.reduce((sum, chat) => {
            return sum + (Number(chat.unread) || Number(chat.UnreadCount) || 0);
        }, 0);
        updateSidebarChatBadge(totalUnreadMessages);

        allChats = chats;
        let filteredChats = chats;

        const unreadCount = chats.filter(chat => Number(chat.unread) > 0).length;
        const favouriteCount = chats.filter(chat => Number(chat.IsFavourite) === 1).length;

        const unreadBadge = document.getElementById("unreadCount");
        const favBadge = document.getElementById("favCount");

        if (unreadBadge) {
            unreadBadge.innerText = unreadCount;
            unreadBadge.style.display = unreadCount > 0 ? "inline-flex" : "none";
        }

        if (favBadge) {
            favBadge.innerText = favouriteCount;
            favBadge.style.display = favouriteCount > 0 ? "inline-flex" : "none";
        }

        if (activeFilter === "unread") {
            filteredChats = chats.filter(chat => Number(chat.unread) > 0);
        }

        if (activeFilter === "favourites") {
            filteredChats = chats.filter(chat => chat.IsFavourite === 1);
        }

        if (activeFilter === "caret") {
            filteredChats = [];
        }

        const activeChat = currentChatId;
        chatContainer.innerHTML = "";

        const emptyMessage = document.getElementById("emptyChatsMessage");

        if (filteredChats.length === 0) {
            if (emptyMessage) {
                emptyMessage.style.display = "block";
                if (activeFilter === "unread") {
                    emptyMessage.innerText = "No unread chats yet";
                } else if (activeFilter === "favourites") {
                    emptyMessage.innerText = "No favourite chats yet";
                } else if (activeFilter === "caret") {
                    emptyMessage.innerText = "No group chats yet.\n Feature is not available at the moment.\n Please check back later\n OR\n will notify you when its available.\n Thank You for your patience ";
                } else {
                    emptyMessage.innerText = "No chats available";
                }
            }
            chatContainer.innerHTML = "";
            return;
        }

        if (emptyMessage) emptyMessage.style.display = "none";

        filteredChats.forEach(chat => {
            const div = document.createElement("div");
            div.classList.add("chat-item");
            div.dataset.chatId = chat.ChatId;
            div.dataset.online = chat.isOnline;
            div.dataset.lastseen = chat.LastSeen || "";

            if (chat.ChatId === activeChat) {
                div.classList.add("active");
            }

            const time = chat.lastMessageTime
                ? new Date(chat.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : "";

            const currentUserId = Number(localStorage.getItem("userId"));
            const img = getImage(chat.ProfilePicture);
            let rawName = chat.ContactName || chat.Username || chat.PhoneNumber || "user";
            let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            const lastMsgText = chat.lastMessage || "";
            const isLinkMessage = lastMsgText.includes("http://") || lastMsgText.includes("https://") || lastMsgText.includes("www.");
            const isChatMuted = Number(chat.IsMuted) === 1 || Boolean(chat.IsMuted);

            div.innerHTML = `
                <img src="${img}" class="chat-avatar">
                <div class="chat-info">
                    <div class="top-row">
                        <h4 class="chat-name">${formattedName}</h4>
                        <div class="right-side">
                            ${chat.IsPinned ? `<i class="fa-solid fa-thumbtack pinned-chat-icon"></i>` : ""}
                            ${isChatMuted ? `<i class="fa-solid fa-bell-slash muted-chat-icon"></i>` : ""}
                            <span class="chat-time">${time}</span>
                            <button class="chat-menu-btn">
                                <i class="fa-solid fa-chevron-down"></i>
                            </button>
                        </div>
                    </div>

                    <div class="bottom-row">
                        <p class="last-msg">
                        ${Number(chat.SenderId) === currentUserId
                            ? `<i class="fa-solid ${chat.IsSeen ? "fa-check-double seen" : chat.IsDelivered ? "fa-check-double" : "fa-check"}"></i>`
                            : ""
                        }
                        ${(() => {
                            if (typingUsers[chat.ChatId]) {
                                return `<span class="typing-text">typing...</span>`;
                            }
                            if (isLinkMessage) {
                                return `<span style="color:#8696a0;"><i class="fa-solid fa-link" style="font-size:11px;margin-right:4px;"></i>Link</span>`;
                            }
                            if (chat.IsStatusReply) {
                                return `↩ Replied to status`;
                            }
                            const forward = chat.IsForwarded ? `<span class="chat-forwarded"><i class="fa-solid fa-share"></i>Forwarded</span> ` : "";

                            switch (chat.LastMessageType) {
                                case "image": return `${forward}📷 Photo`;
                                case "video": return `${forward}🎥 Video`;
                                case "audio": return `${forward}🎵 Audio`;
                                case "document": return `${forward}<span style="color:#8696a0;"><i class="fa-solid fa-file-lines" style="font-size:12px;margin-right:4px;"></i>${chat.lastMessage || "File"}</span>`;
                                case "call_missed": return `<span style="color:#ef4444;"><i class="fa-solid fa-phone-slash" style="margin-right:5px;color:#ef4444;"></i>Missed call</span>`;
                                case "call_answered": return `<span style="color:#00a884;"><i class="fa-solid fa-phone" style="margin-right:5px;color:#00a884;"></i>Answered call</span>`;
                                case "call_outgoing": return `<span style="color:#8696a0;"><i class="fa-solid fa-phone" style="margin-right:5px;"></i>Outgoing call</span>`;
                                case "call_rejected": return `<span style="color:#ef4444;"><i class="fa-solid fa-phone-slash" style="margin-right:5px;color:#ef4444;"></i>Declined call</span>`;
                                default: return chat.lastMessage || "No messages";
                            }
                        })()}
                        </p>
                        ${Number(chat.unread) > 0 ? `<span class="unread-count">${chat.unread}</span>` : ""}
                    </div>
                </div>
            `;

            div.addEventListener("click", () => {
                saveToRecentSearches(chat);

                if (recentContainer) recentContainer.classList.add("collapsed");

                resetSearchState();

                const oldChats = document.querySelectorAll(".chat-item");
                oldChats.forEach(c => c.classList.remove("active"));
                div.classList.add("active");

                const oldChatId = currentChatId;
                if (oldChatId) {
                    socket.emit("leave_chat", { userId: currentUserId });
                }

                currentChatId = chat.ChatId;

                if (chat.IsMarkedUnread) {
                    fetch(`${API}/chat/unread`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({ chatId: chat.ChatId })
                    });
                }

                socket.emit("join_chat", { chatId: chat.ChatId, userId: currentUserId });
                socket.emit("seen_messages", { chatId: chat.ChatId, viewerUserId: currentUserId });

                loadMessages(currentChatId);
                currentCallUserName = chat.ContactName || chat.Username || chat.PhoneNumber;
                currentUserProfileId = chat.UserId;

                let rawName = chat.ContactName || chat.Username || chat.PhoneNumber || "user";
                let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
                document.getElementById("chatUsername").innerText = formattedName;
                document.querySelector(".chat-user img").src = getImage(chat.ProfilePicture);
                document.querySelector(".chat-header").style.display = "flex";
                document.querySelector(".message-input").style.display = "flex";

                const statusText = document.getElementById("userStatus");
                if (chat.isOnline) {
                    statusText.innerText = "online";
                } else {
                    statusText.innerText = formatLastSeen(chat.LastSeen);
                }
                animateStatus();

                document.querySelector(".chat-area").classList.add("chat-open");
                document.querySelector(".left").classList.add("hidden-mobile");
            });

            div.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                openChatMenu(e.pageX, e.pageY, chat);
            });

            const ChatMenuBtn = div.querySelector(".chat-menu-btn");
            ChatMenuBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const rect = ChatMenuBtn.getBoundingClientRect();
                openChatMenu(rect.right, rect.bottom + window.scrollY, chat);
            });

            chatContainer.appendChild(div);
        });

    } catch (error) {
        console.error("Error loading chats", error);
    }
}
document.addEventListener("click", (e) => {

    const menu = document.getElementById("chatItemMenu");

    if (!menu.contains(e.target)) {
        menu.classList.add("hidden");
    }

    menu.classList.add("hidden");

    document.querySelectorAll(".chat-item")
        .forEach(item => item.classList.remove("menu-open"));

});

document.getElementById("chatItemMenu").addEventListener("click", (e) => {
    e.stopPropagation();
});

document.getElementById("favChat").addEventListener("click", async () => {

    try {

        await fetch(`${API}/chat/favourite`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                chatId: selectedChatId
            })
        });

        document.getElementById("chatItemMenu")
            .classList.add("hidden");

        if (selectedChat.IsFavourite) {

            showToast("Removed from favourites", {
                undo: true,
                onUndo: async () => {

                    await fetch(`${API}/chat/favourite`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            chatId: selectedChatId
                        })
                    });

                    loadChats();

                }
            });

        } else {

            showToast("Added to favourites");

        }

        loadChats();

    } catch (err) {

        console.log(err);

    }

});

document.getElementById("pinChat").addEventListener("click", async () => {

    try {

        const response = await fetch(`${API}/chat/pin`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },

            body: JSON.stringify({
                chatId: selectedChatId
            })

        });

        const data = await response.json();

        document.getElementById("chatItemMenu")
            .classList.add("hidden");

        if (!response.ok) {

            showToast(data.message || "Something went wrong", {
                icon: "fa-circle-exclamation"
            });

            return;

        }

        if (data.pinned) {

            showToast("Pinned chat", {
                icon: "fa-thumbtack"
            });

        } else {

            showToast("Unpinned chat", {

                icon: "fa-thumbtack",

                undo: true,

                onUndo: async () => {

                    try {

                        const undoResponse = await fetch(`${API}/chat/pin`, {

                            method: "POST",

                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`
                            },

                            body: JSON.stringify({
                                chatId: selectedChatId
                            })

                        });

                        const undoData = await undoResponse.json();

                        if (!undoResponse.ok) {

                            showToast(
                                undoData.message || "Couldn't undo",
                                {
                                    icon: "fa-circle-exclamation"
                                }
                            );

                            return;

                        }

                        showToast("Pinned chat", {
                            icon: "fa-thumbtack"
                        });

                        loadChats();

                    } catch (err) {

                        console.log(err);

                        showToast("Couldn't undo", {
                            icon: "fa-circle-xmark"
                        });

                    }

                }

            });

        }

        loadChats();

    } catch (err) {

        console.log(err);

        showToast("Something went wrong", {
            icon: "fa-circle-xmark"
        });

    }

});

document.getElementById("markUnread").addEventListener("click", async () => {
    if (!selectedChat) return;

    const hasUnreadMessages = Number(selectedChat.unread) > 0 || Boolean(selectedChat.IsMarkedUnread);

    try {
        if (hasUnreadMessages) {
            if (selectedChat.IsMarkedUnread) {
                await fetch(`${API}/chat/unread`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ chatId: selectedChatId })
                });
            }

            socket.emit("seen_messages", {
                chatId: selectedChatId,
                viewerUserId: Number(localStorage.getItem("userId"))
            });

            showToast("Marked as read", { icon: "fa-envelope-open" });

        } else {
            await fetch(`${API}/chat/unread`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ chatId: selectedChatId })
            });

            showToast("Marked as unread", { icon: "fa-envelope" });
        }

        document.getElementById("chatItemMenu").classList.add("hidden");

        loadChats();

    } catch (err) {
        console.error("Error toggling read state:", err);
    }
});

const muteModal = document.getElementById("muteModal");

document.getElementById("muteChat").addEventListener("click", async () => {
    document.getElementById("chatItemMenu").classList.add("hidden");

    if (!selectedChat) return;

    if (selectedChat.IsMuted) {
        try {
            await fetch(`${API}/chat/mute`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ chatId: selectedChatId, duration: "unmute" })
            });

            showToast("Notifications unmuted", { icon: "fa-bell" });
            loadChats();
        } catch (err) {
            console.error("Error unmuting chat:", err);
        }
    } else {
        muteModal.classList.remove("hidden");
    }
});

document.getElementById("cancelMuteBtn").addEventListener("click", () => {
    muteModal.classList.add("hidden");
});

document.getElementById("confirmMuteBtn").addEventListener("click", async () => {
    const selectedOption = document.querySelector('input[name="muteDuration"]:checked').value;

    try {
        await fetch(`${API}/chat/mute`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ chatId: selectedChatId, duration: selectedOption })
        });

        muteModal.classList.add("hidden");
        showToast("Notifications muted", { icon: "fa-bell-slash" });
        loadChats();
    } catch (err) {
        console.error("Error muting chat:", err);
    }
});


const msgBackBtn = document.getElementById("backBtn");
msgBackBtn.addEventListener("click", () => {

    socket.emit("leave_chat", {
        userId: Number(localStorage.getItem("userId")),
    }
    );

    currentChatId = null;

    document.querySelector(".chat-area")
        .classList.remove("chat-open");

    document.querySelector(".left")
        .classList.remove("hidden-mobile");

});

function buildMessageHtml(msg, isMe) {

    const isDeleted = msg.DeletedForEveryone == 1 || msg.DeletedForEveryone === true || msg.DeletedForEveryone == "1";

    let replyHtml = "";

    if (msg.ReplyToMsgId) {

        const currentUserId =
            Number(localStorage.getItem("userId"));

        const senderOwnsOriginal =
            Number(msg.ReplySenderId) === currentUserId;

        const hasDownloadedOriginal =
            localStorage.getItem(`wa_downloaded_${msg.ReplyToMsgId}`) === "true";

        const senderName =
            Number(msg.ReplySenderId) === currentUserId
                ? "You"
                : (msg.ReplySenderName || document.getElementById("chatUsername").innerText);

        let previewHtml = "";

        switch (msg.ReplyMessageType) {

            case "deleted":

                previewHtml = `
                    <div class="reply-preview-text deleted-msg">
                        This message was deleted
                    </div>
                `;
                break;

            case "image": {

                if (senderOwnsOriginal || hasDownloadedOriginal) {

                    previewHtml = `
            <div class="reply-preview-body">

                <div class="reply-preview-text">
                    📷 Photo
                </div>

                <img
                    src="${getImage(msg.ReplyMedia)}"
                    class="reply-preview-thumb">

            </div>
        `;

                } else {

                    previewHtml = `
            <div class="reply-preview-body">

                <div class="reply-preview-text">
                    📷 Photo
                </div>

                <div class="reply-preview-thumb reply-blur-thumb"></div>

            </div>
        `;
                }

                break;
            }

            case "video": {

                if (senderOwnsOriginal || hasDownloadedOriginal) {

                    previewHtml = `
            <div class="reply-preview-body">

                <div class="reply-preview-text">
                    🎥 Video
                </div>

                <video
                    class="reply-preview-thumb"
                    muted>

                    <source src="${getImage(msg.ReplyMedia)}">

                </video>

            </div>
        `;

                } else {

                    previewHtml = `
            <div class="reply-preview-body">

                <div class="reply-preview-text">
                    🎥 Video
                </div>

                <div class="reply-preview-thumb reply-blur-thumb"></div>

            </div>
        `;
                }

                break;
            }

            case "document":

                previewHtml = `
                    <div class="reply-preview-text">
                        📄 Document
                    </div>
                `;
                break;

            case "audio":

                previewHtml = `
                    <div class="reply-preview-text">
                        🎵 Audio
                    </div>
                `;
                break;

            default:

                previewHtml = `
                    <div class="reply-preview-text">
                        ${msg.ReplyMessage}
                    </div>
                `;
        }

        replyHtml = `
            <div class="reply-quote"
                 data-reply-id="${msg.ReplyToMsgId}"
                 ${msg.ReplyMessageType === "deleted"
                ? ""
                : `onclick="scrollToMessage(${msg.ReplyToMsgId})"`}>

                <div class="reply-name">
                    ${senderName}
                </div>

                <div class="reply-text">
                    ${previewHtml}
                </div>

            </div>
        `;
    }

    return `
        ${replyHtml}

        ${isDeleted
            ? `<p class="deleted-msg">This message was deleted</p>`
            : renderMediaContent(msg, isMe)
        }
    `;
}

function scrollToMessage(messageId) {

    const target = document.getElementById(`msg-${messageId}`);

    if (!target) return;

    target.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    const bubble = target.querySelector(".msg-content-bubble");

    if (!bubble) return;

    bubble.classList.add("reply-highlight");

    setTimeout(() => {
        bubble.classList.remove("reply-highlight");
    }, 1600);
};

async function loadMessages(chatId) {
    if (!chatId) return;

    try {
        const response = await fetch(`${API}/chat/messages/${chatId}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
            localStorage.clear();
            window.location.href = "register.html";
            return;
        }

        const messages = await response.json();
        messagesContainer.innerHTML = "";
        lastRenderedMessageDateString = "";

        const currentUserId = Number(localStorage.getItem("userId"));

        messages.forEach(msg => {
            appendDateDivider(msg.CreatedAt || "Date");
            const div = document.createElement("div");
            div.classList.add("message");
            div.dataset.messageId = msg.Id;
            div.dataset.starred = msg.IsStarred ? "1" : "0";
            div.id = `msg-${msg.Id}`;

            const senderId = Number(msg.SenderId);
            const isMe = senderId === currentUserId;
            div.classList.add(isMe ? "sent" : "received");

            const tick = isMe
                ? msg.IsSeen
                    ? `<i class="fa-solid fa-check-double seen"></i>`

                    : msg.IsDelivered
                        ? `<i class="fa-solid fa-check-double"></i>`

                        : `<i class="fa-solid fa-check"></i>`

                : "";

            let statusReplyHtml = "";

            if (msg.IsStatusReply) {
                const targetStatusId = msg.StatusId || msg.statusId;

                statusReplyHtml = `

               <div class="status-reply-preview" data-status-id="${targetStatusId}" onclick="handleStatusPreviewClick(this)">
                <div class="status-reply-user">
                    ${Number(msg.StatusOwnerId) === currentUserId ? "You" : msg.StatusUsername || "user"} · Status
                </div>
                <div class="status-reply-text">
                    ${msg.Caption || "Photo"}
                </div>
            </div>
            `;
            }
            const isDeleted = msg.DeletedForEveryone == 1 || msg.DeletedForEveryone === true || msg.DeletedForEveryone == "1";

            const reactionTriggerHtml = isDeleted ? "" : `
                <div class="wa-action-trigger-container">
                    <div class="wa-quick-reactions-popup" id="quickReact-${msg.Id}">
                        <button type="button" class="quick-emoji-option" onclick="submitMessageReaction(event, ${msg.Id}, '👍')">👍</button>
                        <button type="button" class="quick-emoji-option" onclick="submitMessageReaction(event, ${msg.Id}, '❤️')">❤️</button>
                        <button type="button" class="quick-emoji-option" onclick="submitMessageReaction(event, ${msg.Id}, '😂')">😂</button>
                        <button type="button" class="quick-emoji-option" onclick="submitMessageReaction(event, ${msg.Id}, '😮')">😮</button>
                        <button type="button" class="quick-emoji-option" onclick="submitMessageReaction(event, ${msg.Id}, '😢')">😢</button>
                        <button type="button" class="quick-emoji-option" onclick="submitMessageReaction(event, ${msg.Id}, '🙏')">🙏</button>
                    </div>
                    
                    <button type="button" class="wa-reaction-btn" title="React to message" onclick="toggleQuickReactionPopup(event, ${msg.Id})">
                        <i class="fa-regular fa-face-smile"></i>
                    </button>
                </div>
            `;

            const chevronMenuHtml = isDeleted ? "" : `
                <div class="wa-bubble-chevron-container">
                    <button class="wa-bubble-chevron-btn" title="Message options" onclick="triggerMessageDropdownMenu(event, this, ${msg.Id}, ${msg.SenderId})"">
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
            `;

            const activeReaction = msg.Reaction || msg.reaction || null;
            let reactionBadgeHtml = "";

            if (activeReaction && !isDeleted) {
                reactionBadgeHtml = `
                <div class="wa-message-reaction-badge" title="Remove reaction" onclick="submitMessageReaction(event, ${msg.Id}, 'REMOVE')">
                    ${activeReaction}
                </div>
            `;
            }

            div.innerHTML = `
                ${statusReplyHtml}
                <div class="msg-content-bubble">

                    ${chevronMenuHtml}

                    ${buildMessageHtml(msg, isMe)}

                    ${reactionBadgeHtml}

                    ${msg.IsStarred
                    ? `
                            <div class="wa-star-badge">
                                <i class="fa-solid fa-star"></i>
                            </div>
                        `
                    : ""
                }

                </div>

                <span class="msg-meta">
                    ${new Date(msg.CreatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                })}
                    ${tick}
                </span>
                ${reactionTriggerHtml}
            `;

            messagesContainer.appendChild(div);

            div.addEventListener("contextmenu", (e) => {

                e.preventDefault();
                openContextOverlayMenu(e.pageX, e.pageY, div.dataset.messageId, Number(msg.SenderId), div);

                selectedMessageId = div.dataset.messageId;
                selectedSenderId = Number(msg.SenderId);

                const textElement = div.querySelector(".msg-content-bubble p");
                selectedMessageText = textElement ? textElement.innerText : "Media File";

                const currentUserId = Number(localStorage.getItem("userId"));

                if (selectedSenderId !== currentUserId) {

                    deleteEveryoneBtn.style.display = "none";

                } else {

                    deleteEveryoneBtn.style.display = "flex";
                }
            });
        });

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        const hasUnread = messages.some(
            msg =>
                Number(msg.SenderId) !== currentUserId &&
                !msg.IsSeen
        );

        if (hasUnread) {
            socket.emit("seen_messages", {
                chatId,
                viewerUserId: currentUserId
            });

            loadChats();
        }

    } catch (error) {
        console.log("Error loading messages", error);
    }
};

function triggerMessageDropdownMenu(event, buttonElement, messageId, senderId) {
    selectedMessageId = messageId;
    selectedSenderId = senderId;

    event.preventDefault();
    event.stopPropagation();

    const rect = buttonElement.getBoundingClientRect();

    const targetX = window.scrollX + rect.left;
    const targetY = window.scrollY + rect.bottom + 4;

    const parentMessageDiv = buttonElement.closest(".message");
    openContextOverlayMenu(targetX, targetY, messageId, senderId, parentMessageDiv);
}

function openContextOverlayMenu(pageX, pageY, messageId, senderId, messageElement) {
    selectedMessageId = messageId;
    selectedSenderId = Number(senderId);

    const messageDiv = document.querySelector(
        `[data-message-id="${messageId}"]`
    );

    const isStarred = messageDiv.dataset.starred === "1";

    const starBtn = document.getElementById("starMsgBtn");

    starBtn.innerHTML = isStarred
        ? `
        <i class="fa-regular fa-star"></i>
        Unstar message
      `
        : `
        <i class="fa-solid fa-star"></i>
        Star message
      `;

    const textElement = messageElement.querySelector(".msg-content-bubble p");
    selectedMessageText = textElement ? textElement.innerText : "Media File";

    const emojiButtons = messageMenu.querySelectorAll(".menu-emoji-opt");
    emojiButtons.forEach(btn => {
        btn.onclick = (e) => {
            const emojiStr = btn.getAttribute("data-emoji");
            submitMessageReaction(e, messageId, emojiStr);
            messageMenu.classList.add("hidden");
        };
    });

    messageMenu.style.visibility = "hidden";
    messageMenu.classList.remove("hidden");

    const menuWidth = messageMenu.offsetWidth || 230;
    const menuHeight = messageMenu.offsetHeight || 310;

    messageMenu.style.visibility = "visible";

    if (pageX + menuWidth > window.innerWidth) {
        pageX = window.innerWidth - menuWidth - 20;
    }

    if (pageY + menuHeight > window.innerHeight) {
        pageY = pageY - menuHeight;

        if (pageY < 10) pageY = 10;
    }

    messageMenu.style.left = pageX + "px";
    messageMenu.style.top = pageY + "px";

    const currentUserId = Number(localStorage.getItem("userId"));
    if (selectedSenderId !== currentUserId) {
        deleteEveryoneBtn.style.display = "none";
    } else {
        deleteEveryoneBtn.style.display = "flex";
    }
}

document.getElementById("copyMsgBtn").addEventListener("click", () => {
    if (selectedMessageText) {
        navigator.clipboard.writeText(selectedMessageText)
            .then(() => console.log("Text copied smoothly to clipboard workspace context."))
            .catch(err => console.error("Clipboard permission execution rejected:", err));
    }
    messageMenu.classList.add("hidden");
});

document.addEventListener("click", () => {
    messageMenu.classList.add("hidden");
});

deleteMeBtn.addEventListener("click", () => {

    socket.emit("delete_message_me", {
        messageId: selectedMessageId,
        userId: Number(localStorage.getItem("userId"))
    });

    messageMenu.classList.add("hidden");
});

deleteEveryoneBtn.addEventListener("click", () => {

    socket.emit("delete_message_everyone", {
        messageId: selectedMessageId,
        chatId: currentChatId,
        userId: Number(localStorage.getItem("userId"))
    });

    messageMenu.classList.add("hidden");
});

copyMsgBtn.addEventListener("click", async () => {

    await navigator.clipboard.writeText(
        selectedMessageText
    );

    messageMenu.classList.add("hidden");
});

const statusInput = document.getElementById("statusInput");
let currentStatuses = [];
let currentIndex = 0;
let progressTimeout;
let videoProgressInterval;
let isPaused = false;
let selectedStatusFile = null;
let selectedStatusType = "";

const myStatusImg = document.getElementById("myStatusInput");
const savedProfile = localStorage.getItem("profilePicture");

if (savedProfile && savedProfile !== "null" && savedProfile !== "undefined") {
    myStatusImg.src = getImage(savedProfile);
} else {
    myStatusImg.src = "img/default-avatar.svg";
}

async function loadStatuses() {

    try {

        const myUserId = Number(localStorage.getItem("userId"));

        const res = await fetch(
            `${API}/status`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
        );

        const statuses = await res.json();

        const statusList = document.querySelector(".status-list");

        const groupedStatuses = {};
        let myStatuses = [];

        statuses.forEach(status => {

            if (status.UserId === myUserId) {
                myStatuses.push(status);
            }

            if (!groupedStatuses[status.UserId]) {

                groupedStatuses[status.UserId] = [];
            }

            groupedStatuses[status.UserId].push(status);
        });

        const myStatustext = document.querySelector(".my-status-info p");
        const myStatusConatiner = document.querySelector(".my-status");
        const myStatusWrapper = document.querySelector(".my-status-img");

        if (myStatuses.length > 0) {
            const latestStatus = myStatuses[0];

            myStatustext.innerText = formatStatusTime(latestStatus.CreatedAt);
            myStatusWrapper.classList.add("active-status");

            myStatusConatiner.onclick = () => {
                openStatus(myStatuses);
            };
        } else {

            myStatustext.innerText = "Click to add status update";

            myStatusWrapper.classList.remove("active-status");

            myStatusConatiner.onclick = () => {
                statusInput.click();
            };
        }


        const UnViewedStatus = [];
        const ViewedStatus = [];
        Object.values(groupedStatuses).forEach(userStatuses => {

            const firstStatus = userStatuses[0];

            if (firstStatus.UserId === myUserId) {
                return;
            }

            const isViewed = firstStatus.IsViewed == 1;

            if (isViewed) {
                ViewedStatus.push(userStatuses);

            } else {
                UnViewedStatus.push(userStatuses);
            }
        });

        const hasUnseenStatus = UnViewedStatus.length > 0;
        setSidebarDotBadge("sidebarStatusBadge", hasUnseenStatus);

        statusList.innerHTML = "";

        if (UnViewedStatus.length === 0 && ViewedStatus.length === 0) {
            statusList.innerHTML = `<div style="color: #8696a0; text-align: center; padding: 20px;">No updates available</div>`;
        }

        [...UnViewedStatus, ...ViewedStatus].forEach(userStatuses => {
            const firstStatus = userStatuses[0];

            const isViewed = firstStatus.IsViewed == 1;

            const div = document.createElement("div");

            div.classList.add("status-item");
            let rawName = firstStatus.ContactName || firstStatus.Username || firstStatus.PhoneNumber || "user";
            let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

            div.innerHTML = `

                <div class="status-img ${isViewed ? "viewed-status" : ""}">

                    <img src="${getImage(firstStatus.ProfilePicture)}">

                </div>

                <div class="status-info">

                    <h4>
                        ${formattedName}
                    </h4>

                    <p>
                        ${formatStatusTime(firstStatus.CreatedAt)}
                    </p>

                </div>
            `;

            div.addEventListener("click", () => {
                openStatus(userStatuses);
            }
            );

            statusList.appendChild(div);

        });

    } catch (error) {

        console.log(error);
    }
};

const newStatusBtn = document.querySelector(".new-status-btn span");

newStatusBtn.addEventListener("click", (e) => {

    e.stopPropagation();

    statusInput.click();
});

async function addView(statusId) {

    try {

        const res = await fetch(`${API}/status/view`, {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },

            body: JSON.stringify({

                statusId,

                viewerId: Number(
                    localStorage.getItem("userId")
                )
            })
        }
        );

    } catch (error) {

        console.log(error);
    }
};

async function openStatus(statuses) {
    currentStatuses = statuses;
    currentIndex = 0;

    document.querySelector(".status-viewer")
        .classList.remove("hidden");

    renderBars();
    await addView(statuses[currentIndex].Id);
    showStatus();
    loadStatuses();
};

function showStatus() {

    isPaused = false;
    clearTimeout(progressTimeout);
    clearInterval(videoProgressInterval);

    const status = currentStatuses[currentIndex];
    const container = document.querySelector(".status-content");

    if (status.Type === "video") {
        container.innerHTML = `
            <div class="status-bg">
                <video id="bgViewerMedia" autoplay playsinline muted loop>
                    <source src="http://192.168.0.107:5000${status.MediaUrl}">
                </video>
            </div>

            <div class="status-main">
                <video id="viewerMedia" autoplay playsinline>
                    <source src="http://192.168.0.107:5000${status.MediaUrl}">
                </video>
            </div>

            <button class="pause-status-btn">
                <i class="fa-solid fa-pause"></i>
            </button>
        `;

        const video = document.getElementById("viewerMedia");
        const bgVideo = document.getElementById("bgViewerMedia");
        const PauseBtn = document.querySelector(".pause-status-btn");

        video.muted = false;

        video.onloadedmetadata = async () => {
            try {

                await video.play();
                await bgVideo.play();

            } catch (error) {
                console.log(error);
            }
            renderBars();
            startVideoProgress(video);
        };

        video.onended = () => {
            nextStatus();
        };

        PauseBtn.addEventListener("click", () => {
            if (!isPaused) {
                video.pause();
                bgVideo.pause();
                clearTimeout(progressTimeout);
                clearInterval(videoProgressInterval);
                PauseBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
                isPaused = true;
            } else {
                video.play();
                bgVideo.play();
                startVideoProgress(video);
                PauseBtn.innerHTML = `<i class="fa-solid fa-pause"></i>`;
                isPaused = false;
            }
        });

    } else {
        container.innerHTML = `
            <div class="status-bg">
                <img id="viewerBg" src="http://192.168.0.107:5000${status.MediaUrl}">
            </div>

            <div class="status-main">
                <img id="viewerMedia" src="http://192.168.0.107:5000${status.MediaUrl}">
            </div>
        `;

        renderBars();
        startImageProgress();
    }

    let rawName = status.ContactName || status.Username || status.PhoneNumber || "user";
    let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    document.getElementById("viewerUsername").innerText = formattedName;
    document.getElementById("viewerProfile").src = getImage(status.ProfilePicture);
    document.getElementById("viewerTime").innerText = formatStatusTime(status.CreatedAt);
    document.getElementById("viewerCaption").innerText = status.Caption || "";
    const likeBtn = document.getElementById("likeStatusBtn");
    if (status.IsLiked) {
        likeBtn.innerHTML = `<i class="fa-solid fa-heart"></i>`;
    } else {
        likeBtn.innerHTML = `<i class="fa-regular fa-heart"></i>`;
    }

    document.getElementById("likeCountText").innerText = status.LikeCount || 0;


    const myUserId = Number(localStorage.getItem("userId"));
    const NewStatusBtn = document.querySelector(".new-status-btn");
    const deleteStatus = document.querySelector(".delete-status");
    const replyBox = document.querySelector(".status-reply-box");
    const viewBox = document.querySelector(".status-view-count");
    const viewCount = document.getElementById("viewCount");
    const likeCount = document.querySelector(".status-like-owner");


    if (status.UserId === myUserId) {

        newStatusBtn.style.display = "flex";
        deleteStatus.style.display = "flex";
        viewBox.style.display = "flex";
        replyBox.style.display = "none";
        document.getElementById("viewCountText")
            .innerText = status.ViewCount || 0;
        viewCount.innerHTML = `Viewed By ${status.ViewCount || 0}`;
        likeCount.style.display = "flex";

    } else {
        newStatusBtn.style.display = "none";
        deleteStatus.style.display = "none";
        viewBox.style.display = "none";
        replyBox.style.display = "flex";
        likeCount.style.display = "none";

    }

    // startProgress();
};

document.querySelector(".status-view-count")
    .addEventListener("click", async () => {

        const likesPopup = document.querySelector(".status-likes-popup");
        const viewsPopup = document.querySelector(".status-views-popup");

        if (!viewsPopup.classList.contains("hidden")) {

            viewsPopup.classList.add("hidden");
            return;
        }

        likesPopup.classList.add("hidden");

        viewsPopup.classList.remove("hidden");

        const status = currentStatuses[currentIndex];
        const myUserId = Number(localStorage.getItem("userId"));

        if (status.UserId !== myUserId) {
            return;
        }

        const res = await fetch(
            `http://192.168.0.107:5000/api/status/views/${status.Id}?userId=${myUserId}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
        );

        const views = await res.json();

        const list =
            document.querySelector(".status-views-list");

        list.innerHTML = "";

        if (views.length === 0) {
            list.innerHTML = `
            <p class="no-views">
                No views yet
            </p>
        `;
            return;
        }


        views.forEach(view => {
            const myUserId = Number(localStorage.getItem("userId"));
            let rawName;

            if (view.Id === myUserId) {
                rawName = "You";
            } else if (view.ContactName && view.ContactName !== view.PhoneNumber) {
                rawName = view.ContactName;
            } else {
                rawName = view.Username || view.PhoneNumber || "user"
            }
            let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

            list.innerHTML += `

            <div class="status-view-user">

                <img src="http://192.168.0.107:5000${view.ProfilePicture}">

                <div>

                    <h4>${formattedName}</h4>

                    <p>
                        ${formatStatusTime(view.ViewedAt)}
                    </p>

                </div>

            </div>
        `;
        });

        document.querySelector(".status-views-popup")
            .classList.remove("hidden");
    });

document.querySelector(".close-views")
    .addEventListener("click", () => {

        document.querySelector(".status-views-popup")
            .classList.add("hidden");
    });

function renderBars() {
    const bars = document.querySelector(".status-bars");

    bars.innerHTML = "";

    currentStatuses.forEach(() => {
        const div = document.createElement("div");

        div.classList.add("progress-bar");

        div.innerHTML = `
            <div class="fill"></div> 
        `;

        bars.appendChild(div);
    })
};

function startImageProgress() {
    clearTimeout(progressTimeout);

    const fills =
        document.querySelectorAll(".fill");

    fills.forEach((fill, index) => {

        fill.style.transition = "none";

        if (index < currentIndex) {

            fill.style.width = "100%";

        } else {

            fill.style.width = "0%";
        }
    });

    const currentFill =
        fills[currentIndex];

    requestAnimationFrame(() => {

        currentFill.style.transition =
            "width 5s linear";

        currentFill.style.width = "100%";
    });

    progressTimeout = setTimeout(() => {
        nextStatus();
    }, 5000);
};

function startVideoProgress(video) {

    clearTimeout(progressTimeout);
    clearInterval(videoProgressInterval);

    const fills =
        document.querySelectorAll(".fill");

    fills.forEach((fill, index) => {

        fill.style.transition = "none";

        if (index < currentIndex) {

            fill.style.width = "100%";

        } else {

            fill.style.width = "0%";
        }
    });

    const currentFill =
        fills[currentIndex];

    videoProgressInterval =
        setInterval(() => {

            if (!video.duration) return;

            const progress =
                (video.currentTime / video.duration) * 100;

            currentFill.style.width =
                progress + "%";

        }, 100);
};

function startProgress() {
    clearTimeout(progressTimeout);

    const fills = document.querySelectorAll(".fill");

    fills.forEach((fill, index) => {
        fill.style.transition = "none";

        if (index < currentIndex) {

            fill.style.width = "100%";
        } else {
            fill.style.width = "0%";
        }
    });

    const currentFill = fills[currentIndex];
    const status = currentStatuses[currentIndex];

    let duration = 5000;

    if (status.Type === "video") {
        const video = document.getElementById("viewerMedia");

        video.onloadedmetadata = () => {
            duration = video.duration * 1000;

            currentFill.style.transition = `width ${duration}ms linear`;
            currentFill.style.width = "100%";

            progressTimeout = setTimeout(() => {
                nextStatus();
            }, duration);
        };
    } else {
        requestAnimationFrame(() => {

            requestAnimationFrame(() => {

                currentFill.style.transition =
                    `width ${duration}ms linear`;

                currentFill.style.width = "100%";
            });
        });

        progressTimeout = setTimeout(() => {
            nextStatus();
        }, duration);
    }
};

async function nextStatus() {

    clearTimeout(progressTimeout);
    clearInterval(videoProgressInterval);

    const media =
        document.getElementById("viewerMedia");

    if (
        media &&
        media.tagName === "VIDEO"
    ) {
        media.pause();
    }

    currentIndex++;

    if (currentIndex >= currentStatuses.length) {
        closeStatusViewer();
        return;
    }

    await addView(
        currentStatuses[currentIndex].Id
    );

    showStatus();
};

function prevStatus() {

    const media =
        document.getElementById("viewerMedia");

    if (
        media &&
        media.tagName === "VIDEO"
    ) {
        media.pause();
    }

    currentIndex--;

    if (currentIndex < 0) {
        currentIndex = 0;
    }

    showStatus();
};

function closeStatusViewer() {
    clearTimeout(progressTimeout);
    clearInterval(videoProgressInterval);

    const media =
        document.getElementById("viewerMedia");

    if (
        media &&
        media.tagName === "VIDEO"
    ) {
        media.pause();
        media.currentTime = 0;
        media.removeAttribute("src");
    }

    document.querySelector(".status-viewer")
        .classList.add("hidden");

    document.querySelector(".close-views").click();
    document.querySelector(".close-likes").click();
    lockedReplyStatusIndex = null;
    if (replyInput) replyInput.value = "";
};

document.querySelector(".close-status").addEventListener("click", closeStatusViewer);
document.querySelector(".status-right").addEventListener("click", nextStatus);
document.querySelector(".status-left").addEventListener("click", prevStatus);
document.querySelector(".status-camera").addEventListener("click", () => {
    statusInput.click();
});

statusInput.addEventListener("change", (e) => {

    const file = e.target.files[0];

    if (!file) return;

    selectedStatusFile = file;

    selectedStatusType =
        file.type.startsWith("video")
            ? "video"
            : "image";

    document.querySelector(".status-preview")
        .classList.remove("hidden");

    const image = document.getElementById("previewImage");
    const video = document.getElementById("previewVideo");

    const fileURL = URL.createObjectURL(file);

    if (selectedStatusType === "image") {

        image.hidden = false;
        video.hidden = true;

        image.src = fileURL;

    } else {

        video.hidden = false;
        image.hidden = true;

        video.src = fileURL;
    }
});
document.getElementById("sendStatusBtn").addEventListener("click", async () => {

    if (!selectedStatusFile) return;

    try {

        const formData = new FormData();

        formData.append(
            "status",
            selectedStatusFile
        );

        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 300000);

        const uploadRes = await fetch(
            `${API}/upload/status`,
            {
                method: "POST",
                body: formData,
                signal: controller.signal
            }
        );

        console.log("Upload Status:", uploadRes.status);

        clearTimeout(timeout);

        const uploadData =
            await uploadRes.json();

        const caption =
            document.getElementById("previewCaption").value;

        await fetch(`${API}/status`, {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },

            body: JSON.stringify({
                userId: Number(localStorage.getItem("userId")),
                mediaUrl: uploadData.filePath,
                caption,
                type: selectedStatusType
            })
        }
        );

        socket.emit("new_status");

        loadStatuses();

        closePreview();

    } catch (error) {

        console.log(error);
    }
});

document.getElementById("sendReplyBtn").addEventListener("click", async () => {
    const message = document.getElementById("replyInput").value;
    if (!message.trim()) return;

    const targetIndex = (lockedReplyStatusIndex !== null) ? lockedReplyStatusIndex : currentIndex;
    const status = currentStatuses[targetIndex];
    const senderId = Number(localStorage.getItem("userId"));

    try {
        const res = await fetch(`${API}/status/reply`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                statusId: status.Id,
                senderId,
                message
            })
        });

        document.getElementById("replyInput").value = "";
        lockedReplyStatusIndex = null;
        closeStatusViewer();

    } catch (error) {
        console.log(error);
    }
});

let lockedReplyStatusIndex = null;
const replyInput = document.getElementById("replyInput");

if (replyInput) {
    replyInput.addEventListener("focus", () => {
        clearTimeout(progressTimeout);
        clearInterval(videoProgressInterval);

        lockedReplyStatusIndex = currentIndex;
        isPaused = true;

        const video = document.getElementById("viewerMedia");
        const bgVideo = document.getElementById("bgViewerMedia");
        if (video && video.tagName === "VIDEO") {
            video.pause();
            if (bgVideo) bgVideo.pause();
        }

        const PauseBtn = document.querySelector(".pause-status-btn");
        if (PauseBtn) PauseBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
    });
}

function closePreview() {

    document.querySelector(".status-preview")
        .classList.add("hidden");

    document.getElementById("previewCaption").value = "";

    selectedStatusFile = null;
};

document.querySelector(".close-preview")
    .addEventListener("click", closePreview);

let deleteStatus = document.querySelector(".delete-status");
deleteStatus.addEventListener("click", async () => {

    try {
        const status = currentStatuses[currentIndex];
        const myUserId = Number(localStorage.getItem("userId"));

        if (status.UserId !== myUserId) {
            return;
        }

        const confirmDelete = confirm("Delete this Status?");
        if (!confirmDelete) return;

        const res = await fetch(
            `${API}/status/${status.Id}`,
            {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        currentStatuses.splice(currentIndex, 1);

        if (currentStatuses.length === 0) {
            closeStatusViewer();
        } else {
            if (currentIndex >= currentStatuses.length) {
                currentIndex = currentStatuses.length - 1;
            }
            renderBars();
            showStatus();
        }
    } catch (error) {
        console.log(error);
    }
});
let replyToMsgId = null;
let replyPreviewData = null;

document
    .getElementById("cancelReplyBtn")
    .onclick = function () {

        replyToMsgId = null;

        replyPreviewData = null;

        document
            .getElementById("replyPreviewBar")
            .classList
            .add("hidden");
    };

document
    .getElementById("replyMsgBtn")
    .onclick = function () {

        replyToMsgId = selectedMessageId;

        const bubble = document
            .querySelector(`[data-message-id="${selectedMessageId}"]`);

        let senderName;

        if (selectedSenderId ==
            Number(localStorage.getItem("userId"))) {

            senderName = "You";

        } else {

            senderName = document
                .getElementById("chatUsername")
                .innerText;
        }

        document
            .getElementById("replySenderName")
            .innerText = senderName;

        document
            .getElementById("replyMessageText")
            .innerText = selectedMessageText;

        document
            .getElementById("replyPreviewBar")
            .classList
            .remove("hidden");

        messageMenu.classList.add("hidden");

        messageInput.focus();
    };

async function sendMessage() {

    const text = messageInput.value.trim();

    if (!text || !currentChatId) return;

    socket.emit("send_message", {
        chatId: currentChatId,
        message: text,
        senderId: Number(localStorage.getItem("userId")),
        replyToMsgId: replyToMsgId
    });

    messageInput.value = "";
    replyToMsgId = null;
    replyPreviewData = null;

    document
        .getElementById("replyPreviewBar")
        .classList
        .add("hidden");


    isTyping = false;

    socket.emit("stop_typing", {
        chatId: currentChatId,
        senderId: Number(localStorage.getItem("userId"))
    });
};

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("input", () => {

    if (!currentChatId) return;

    const currentUserId =
        Number(localStorage.getItem("userId"));

    if (!isTyping) {

        isTyping = true;

        socket.emit("typing", {
            chatId: currentChatId,
            senderId: currentUserId
        });
    }

    clearTimeout(typingTimeout);

    typingTimeout = setTimeout(() => {

        isTyping = false;

        socket.emit("stop_typing", {
            chatId: currentChatId,
            senderId: currentUserId
        });

    }, 1000);
});

const attachBtn = document.getElementById("attachBtn");
const attachmentMenu = document.getElementById("attachmentMenu");

attachBtn.addEventListener("click", () => {
    attachmentMenu.classList.toggle("hidden");
});

const mediaInput = document.getElementById("mediaInput");

document.querySelectorAll(".attachment-item").forEach(item => {

    item.addEventListener("click", (e) => {
        e.preventDefault();
        const type = item.dataset.type;

        mediaInput.removeAttribute("capture");

        switch (type) {

            case "image":
                mediaInput.accept =
                    "image/*,video/*";
                break;

            case "audio":
                mediaInput.accept =
                    "audio/*";
                break;

            case "document":
                mediaInput.accept =
                    "*/*";
                break;

            case "camera":
                mediaInput.accept =
                    "image/*";
                mediaInput.capture =
                    "environment";
                break;
        }

        mediaInput.click();

    });

});

mediaInput.addEventListener("change", async e => {

    const file = e.target.files[0];
    if (!file) return;

    attachmentMenu.classList.add("hidden");

    const formData = new FormData();

    formData.append("media", file);

    const response = await fetch(`${API}/chat/upload`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formData
    });
    const result = await response.json();
    let type = "document";

    if (file.type.startsWith("image/")) {
        type = "image";
    }
    else if (file.type.startsWith("video/")) {
        type = "video";
    }
    else if (file.type.startsWith("audio/")) {
        type = "audio";
    }
    else {
        type = "document";
    }

    socket.emit("send_message", {
        chatId: currentChatId,
        message: file.name,
        messageType: type === "media" ? (file.type.startsWith("video") ? "video" : "image") : type,
        mediaUrl: result.mediaUrl,
        senderId: Number(localStorage.getItem("userId"))
    });

    e.target.value = "";
});

async function updateProfilePicture() {
    const fileInput = document.getElementById("profilePicture");
    const profilePicture = fileInput.files[0];
    if (!profilePicture) return;

    const formData = new FormData();
    formData.append("profile", profilePicture);

    try {
        const response = await fetch(`${API}/auth/update-profile-picture`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: formData
        });

        const data = await response.json();

        if (response.ok && data.profilePicture) {
            const myAvatarDisplay = document.getElementById("myProfileImg") || document.getElementById("modalImg");
            if (myAvatarDisplay) {
                myAvatarDisplay.src = API.replace("/api", "") + data.profilePicture + "?t=" + Date.now();
            }

            alert("Profile Updated successfully!");
        } else {
            alert(data.message || "Upload failed");
        }
    } catch (err) {
        console.error("Profile update execution error:", err);
    }
};

async function loadMyProfile() {
    try {
        const response = await fetch(`${API}/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const user = await response.json();

        const image = getImage(user.ProfilePicture);
        const currentUserId = Number(localStorage.getItem("userId"));
        document.getElementById("myStatusInput").src = image;
        document.getElementById("my-profile-pic").src = image;
        if (user.Id === currentUserId) {
            document.getElementById("my-username").innerText = "You";
        } else {
            document.getElementById("my-username").innerText = user.Username;
        }
        document.getElementById("nameText").innerText = user.Username || "Your Name";
        document.getElementById("aboutText").innerText = user.About || "Hey There I am using chatweb";
        document.getElementById("phoneNumber").innerText = user.PhoneNumber || "No Number";

    } catch (error) {
        console.error("Error loading Profile", error);
    }

};

async function createChat(otherUserId) {

    try {

        const currentUserId =
            Number(localStorage.getItem("userId"));

        const res = await fetch(`${API}/chat/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },

            body: JSON.stringify({
                userIds: [currentUserId, otherUserId]
            })
        });

        loadChats();

    } catch (error) {

        console.error(error);
    }
};

const contactList = document.getElementById("contact-list");
async function startChat() {
    try {

        const response = await fetch(`${API}/contact`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const contacts = await response.json();

        contactList.innerHTML = "";

        if (!contacts || contacts.length === 0) {

            contactList.innerHTML = `
                <div class="empty-contact">
                    <i class="fa-solid fa-user-group"></i>
                    <p>No contacts added yet</p>
                </div>
            `;

            return;
        }

        contacts.forEach(contact => {

            const div = document.createElement("div");

            div.classList.add("contact-user");

            let rawName = contact.ContactName || contact.Username || contact.PhoneNumber || "user";
            let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

            div.innerHTML = `
                <img src="${getImage(contact.ProfilePicture)}">

                <div class="contact-info">
                    <h4>${formattedName}</h4>
                    <p>${contact.PhoneNumber || "No Number"}</p>
                </div>
            `;

            div.addEventListener("click", async () => {

                try {

                    const currentUserId =
                        Number(localStorage.getItem("userId"));

                    const response = await fetch(`${API}/chat/create`, {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },

                        body: JSON.stringify({
                            userIds: [
                                currentUserId,
                                contact.Id
                            ]
                        })
                    });

                    const data = await response.json();
                    currentChatId = data.chatId;

                    await loadChats();
                    await loadMessages(currentChatId);
                    document.querySelector(".chat-header").style.display = "flex";
                    document.querySelector(".message-input").style.display = "flex";
                    document.querySelector(".chat-area").classList.add("chat-open");
                    document.querySelector(".left").classList.add("hidden-mobile");
                    document.getElementById("chatUsername").innerText = formattedName;
                    document.querySelector(".message-input").style.display = "flex";
                    document.querySelector(".chat-user img").src = getImage(contact.ProfilePicture);
                    const statusEl = document.getElementById("userStatus");

                    if (contact.LastSeen) {
                        statusEl.innerText =
                            `last seen ${formatStatusTime(contact.LastSeen)}`;
                    } else {
                        statusEl.innerText = "offline";
                    }
                    statusEl.classList.remove("animate-status");
                    void statusEl.offsetWidth;
                    statusEl.classList.add("animate-status");

                } catch (error) {
                    console.log("ERROR:");
                    console.log(error);
                }
            });

            contactList.appendChild(div);
        });

    } catch (error) {
        console.log(error);
    }
}

const startChatBtn = document.querySelector(".new-chat");
const contactBackBtn = document.getElementById("contactBackBtn");
const addContactBtn = document.getElementById("add-contact-btn");

startChatBtn.addEventListener("click", () => {
    sections.forEach(section => {
        section.classList.add("hidden");
    });

    document
        .getElementById("contact-panel")
        .classList.remove("hidden");

    startChat();
});

contactBackBtn.addEventListener("click", () => {
    sections.forEach(section => {
        section.classList.add("hidden");
    });

    document
        .getElementById("chat-panel")
        .classList.remove("hidden");
});

addContactBtn.addEventListener("click", async () => {

    const phoneNumber =
        document.getElementById("contact-number").value;

    const contactName =
        document.getElementById("contact-name").value.trim();

    if (!phoneNumber || !contactName) {

        alert("Enter name and phone number");

        return;
    }

    try {

        const response = await fetch(`${API}/contact/add`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },

            body: JSON.stringify({
                phoneNumber,
                contactName
            })
        });

        const data = await response.json();

        alert(data.message);

        startChat();

    } catch (error) {
        console.log(error);
    }
});

async function loadUserProfile(userId) {
    try {
        const response = await fetch(`${API}/user/${userId}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error("Failed to load user");
        }

        const user = await response.json();
        window.currentContactId = userId;
        const image = getImage(user.ProfilePicture);

        document.getElementById("modalName").innerText = user.ContactName || user.Username || user.PhoneNumber || "user";
        document.getElementById("modalPhone").innerText = user.PhoneNumber || "No Number";
        document.getElementById("modalAbout").innerText = user.About || "Hey there! I'm using ChatWeb";
        document.getElementById("modalImg").src = image;

        const grid = document.querySelector(".media-grid");
        if (!grid) return;
        grid.innerHTML = "";

        const currentUserId = Number(localStorage.getItem("userId"));
        const mediaMessages = Array.from(messagesContainer.querySelectorAll(".message"));
        let collectProfileMedia = [];

        mediaMessages.forEach(div => {
            // 1. WhatsApp Security Filter: Skip any text marked as deleted instantly
            if (div.querySelector(".deleted-msg") || div.innerHTML.includes("This message was deleted")) {
                return;
            }

            const msgId = div.dataset.messageId;
            const isMe = div.classList.contains("sent");
            const isDownloaded = localStorage.getItem(`wa_downloaded_${msgId}`) === "true";

            // Target references for explicit DOM structures inside your rendering tracks
            const imgEl = div.querySelector("img.chat-image");
            const videoEl = div.querySelector(".chat-video video, video");
            const docEl = div.querySelector(".document-message");
            const textContent = div.querySelector(".msg-content-bubble p")?.innerText || div.innerText || "";

            // Check if the plain message text content contains a hyperlink string baseline
            const containsLink = textContent.includes("http://") || textContent.includes("https://") || textContent.includes("www.");

            // A. Process Images
            if (imgEl) {
                if (!isMe && !isDownloaded) return; // Receiver must download to see in profile grid
                collectProfileMedia.push({
                    type: "image",
                    src: imgEl.getAttribute("data-src") || imgEl.src
                });
            }
            // B. Process Videos
            else if (videoEl && div.querySelector(".chat-video")) {
                if (!isMe && !isDownloaded) return; // Receiver must download to see in profile grid
                const sourceNode = videoEl.querySelector("source");
                const videoSrc = sourceNode ? sourceNode.src : videoEl.src;
                if (videoSrc) {
                    collectProfileMedia.push({ type: "video", src: videoSrc });
                }
            }
            // FIX C: Process Documents (WhatsApp lets documents show automatically without a download lock)
            else if (docEl) {
                const docLinkNode = docEl.querySelector("a");
                const docSrc = docLinkNode ? docLinkNode.href : "";
                const docName = docLinkNode ? docLinkNode.innerText : "Document";
                if (docSrc) {
                    collectProfileMedia.push({ type: "document", src: docSrc, name: docName });
                }
            }
            // FIX D: Process Inline Text Hyperlinks
            else if (containsLink) {
                // Extract the link text cleanly out of the wrapper string block
                const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
                const matches = textContent.match(urlRegex);
                if (matches && matches.length > 0) {
                    collectProfileMedia.push({ type: "link", src: matches[0] });
                }
            }
        });

        // Update the visual shared item total count text string
        document.querySelector(".media-top span:last-child").innerText = collectProfileMedia.length;

        if (collectProfileMedia.length === 0) {
            grid.innerHTML = `<p class='noMedia'>No shared media</p>`;
        } else {
            // Slice the most recent 4 matching assets and render them to the drawer view
            collectProfileMedia.slice(-4).forEach(item => {
                if (item.type === "image") {
                    grid.innerHTML += `
                        <div class="media-item" onclick="openMediaLightbox(this)" data-src="${item.src}" data-type="image" style="cursor: pointer; background: url('${item.src}') center/cover; width: 55px; height: 55px; border-radius: 4px;"></div>
                    `;
                } else if (item.type === "video") {
                    grid.innerHTML += `
                        <div class="media-item" onclick="openMediaLightbox(this)" data-src="${item.src}" data-type="video" style="position: relative; cursor: pointer; background: #111b21; width: 55px; height: 55px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                            <video src="${item.src}" preload="metadata" muted style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;"></video>
                            <i class="fa-solid fa-play" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 12px; background: rgba(0,0,0,0.5); padding: 4px 6px; border-radius: 50%;"></i>
                        </div>
                    `;
                } else if (item.type === "document") {
                    // Render clean blue WhatsApp styled document file tile preview
                    grid.innerHTML += `
                        <div class="media-item" onclick="window.open('${item.src}', '_blank')" title="${item.name}" style="cursor: pointer; background: #111b21; width: 55px; height: 55px; border-radius: 4px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.1);">
                            <i class="fa-solid fa-file-lines" style="color: #53bdeb; font-size: 18px;"></i>
                        </div>
                    `;
                } else if (item.type === "link") {
                    // Render clean green WhatsApp styled link tile preview
                    grid.innerHTML += `
                        <div class="media-item" onclick="window.open('${item.src}', '_blank')" title="${item.src}" style="cursor: pointer; background: #111b21; width: 55px; height: 55px; border-radius: 4px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.1);">
                            <i class="fa-solid fa-link" style="color: #00a884; font-size: 16px;"></i>
                        </div>
                    `;
                }
            });
        }
    } catch (error) {
        console.error("Error updates to user profile grid lists execution errors:", error);
    }
};

document.getElementById("actVideoCallBtn").addEventListener("click", () => {
    if (window.currentContactId) {
        currentUserProfileId = window.currentContactId;
        startVideoCall();
    } else {
        console.error("No contact ID found to start a video call!");
    }
});

document.getElementById("actVoiceCallBtn").addEventListener("click", () => {
    if (window.currentContactId) {
        currentUserProfileId = window.currentContactId;
        startVoiceCall();
    } else {
        console.error("No contact ID found to start a voice call!");
    }
});

const copyPhoneBtn = document.getElementById("copyPhone");

copyPhoneBtn.addEventListener("click", async () => {

    const phone =
        document.getElementById("phoneNumber").innerText;

    try {

        await navigator.clipboard.writeText(phone);

        const copyMsg = document.getElementById("copyMsg");
        copyMsg.style.opacity = "1";

        setTimeout(() => {
            copyMsg.style.opacity = "0";
        }, 1000)

    } catch (error) {

        console.log("Copy failed", error);
    }
});

const chatPanel = document.getElementById("chat-panel");
const profilePanel = document.getElementById("profile-panel");
const profilePic = document.getElementById("my-profile-pic");
const fileInput = document.getElementById("profile-input");
const profileEditPanel = document.getElementById("profile-edit-panel");
const profileViewImg = document.getElementById("profile-view-img");
const profileEditImg = document.getElementById("upload-btn");

profilePic.addEventListener("click", async () => {

    // hideAllPanels();
    sections.forEach(section => {
        section.classList.add("hidden");
    });

    profilePanel.classList.remove("hidden");

    const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    const user = await res.json();

    const image = getImage(user.ProfilePicture);

    document.getElementById("profile-name").innerText = user.Username;
    document.getElementById("profile-about").innerText = user.About || "Hey There I am using chatweb";

    document.getElementById("profile-view-img").src = image;
    document.getElementById("profile-edit-img").src = image;

});

profileViewImg.addEventListener("click", () => {
    hideAllPanels();
    profileEditPanel.classList.remove("hidden");
});

profileEditImg.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    profileEditImg.src = URL.createObjectURL(file);

    const formData = new FormData();
    formData.append("profile", file);

    try {
        const response = await fetch(`${API}/auth/update-profile-picture`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: formData
        });

        const data = await response.json();

        const newImage = getImage(data.ProfilePicture);

        profilePic.src = newImage;
        profileViewImg.src = newImage;
        profileEditImg.src = newImage;

    } catch (error) {
        console.error("Error updating profile", error);
    }
});

const TakePhoto = document.getElementById("take-photo");
TakePhoto.addEventListener("click", () => {
    alert(
        `Take photo feature is currently unavailable.
        Please use the "Upload photo" option instead.`
    );
});

const removeProfilePicture = document.getElementById("remove-photo-btn");

removeProfilePicture.addEventListener("click", async () => {
    try {

        const response = await fetch(`${API}/auth/remove-profile-picture`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await response.json();

        const defaultImg = getImage();

        profilePic.src = defaultImg;

        document.getElementById("profile-view-img").src = defaultImg;
        document.getElementById("profile-edit-img").src = defaultImg;

        alert("Photo removed");

    } catch (error) {
        console.error("Error removing photo", error);
    }
});

const backToProfile = document.getElementById("back-to-profile");
backToProfile.addEventListener("click", () => {
    hideAllPanels();
    profilePanel.classList.remove("hidden");
});

function hideAllPanels() {
    chatPanel.classList.add("hidden");
    profilePanel.classList.add("hidden");
    profileEditPanel.classList.add("hidden");
};

const editNameBtn = document.querySelector(".edit-icon");
const editAboutBtn = document.querySelector(".edit-about-icon");

function makeEditable(spanId, field) {
    const span = document.getElementById(spanId);
    const oldValue = span.innerText;

    const input = document.createElement("input");
    input.type = "text";
    input.value = oldValue;
    input.classList.add("edit-input");

    span.replaceWith(input);
    input.focus();

    async function save() {
        const newValue = input.value.trim();
        if (!newValue) return;

        try {

            const currName = document.getElementById("nameText")?.innerText;
            const currAbout = document.getElementById("aboutText")?.innerText;

            const body = field === "name"
                ? {
                    username: newValue,
                    about: currAbout
                }
                : {
                    username: currName
                    , about: newValue
                };

            await fetch(`${API}/auth/update-profile`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });


            const newSpan = document.createElement("span");
            newSpan.id = spanId;
            newSpan.innerText = newValue;

            input.replaceWith(newSpan);
        } catch (error) {
            console.error("Update failed", error);
        }
    }

    input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") save();
    });

    input.addEventListener("blur", save);

};

editNameBtn.addEventListener("click", () => {
    makeEditable("nameText", "name");
});

editAboutBtn.addEventListener("click", () => {
    makeEditable("aboutText", "about");
});


document.querySelector(".chat-user").addEventListener("click", () => {
    if (!currentUserProfileId) return;
    loadUserProfile(currentUserProfileId)
    document.getElementById("profileModal").classList.add("active");
    void document.getElementById("profileModal").offsetWidth;

    document.getElementById("profileModal")
        .classList.add("active");
});

document.getElementById("closeModal").addEventListener("click", () => {
    document.getElementById("profileModal").classList.remove("active");
});

document.getElementById("profileModal").addEventListener("click", (e) => {
    if (e.target.id === "profileModal") {
        e.currentTarget.classList.remove("active");
    }

});

const modalImg = document.getElementById("modalImg");
const previewModal = document.getElementById("imagePreviewModal");
const previewImg = document.getElementById("previewImg");
const imgclosePreview = document.getElementById("closePreview");

modalImg.addEventListener("click", () => {
    previewImg.src = modalImg.src;

    previewModal.classList.add("active");
});

function closeImagePreview() {
    previewModal.classList.remove("active");
};

imgclosePreview.addEventListener("click", closeImagePreview);

previewModal.addEventListener("click", (e) => {
    if (e.target === previewModal) {
        closeImagePreview();
    }
});

document.getElementById("editContactBtn").addEventListener("click", async () => {
    document.getElementById("editContactModal").classList.add("active");

    document.getElementById("editContactName").value =
        document.getElementById("modalName").innerText;

    document.getElementById("editContactPhone").value =
        document.getElementById("modalPhone").innerText;
});

document.getElementById("closeEditContact").addEventListener("click", () => {
    document.getElementById("editContactModal")
        .classList.remove("active");
});

document.getElementById("saveContactNameBtn").addEventListener("click", async () => {

    const contactName = document.getElementById("editContactName").value;

    const updatedName = await fetch(`${API}/contact/update-name`, {

        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            contactUserId: currentContactId,
            contactName
        })
    }
    );

    let formattedName = contactName.charAt(0).toUpperCase() + contactName.slice(1);
    document.getElementById("modalName").innerText = formattedName;
    document.getElementById("chatUsername").innerText = formattedName;
    document.getElementById("editContactModal").classList.remove("active");

    loadChats();
    loadCalls();
    loadStatuses();
    startChat();
});
const editModelImg = document.getElementById("profile-edit-img");
const editModalPreviewImg = document.getElementById("profile-img-model");
const editpreviewImg = document.getElementById("profile-viewImg");
const closeEditPreview = document.getElementById("profie-close-Preview");

editModelImg.addEventListener("click", () => {
    editpreviewImg.src = editModelImg.src;

    editModalPreviewImg.classList.add("active");
});

closeEditPreview.addEventListener("click", () => {
    editModalPreviewImg.classList.remove("active");
});

editModalPreviewImg.addEventListener("click", (e) => {
    if (e.target === editModalPreviewImg) {
        editModalPreviewImg.classList.remove("active");
    }
});

const menuBtn = document.getElementById("menuBtn");
const dropdownMenu = document.getElementById("dropdownMenu");

const dropdownLogoutItem = document.getElementById("logout-item");
const generalLogoutOption = document.getElementById("logout");
const logoutModal = document.getElementById("logoutModal");
const modalCancelBtn = document.getElementById("modalCancelBtn");
const modalConfirmLogoutBtn = document.getElementById("modalConfirmLogoutBtn");
const modalLockBtn = document.getElementById("modalLockBtn");
const dropDownLock = document.getElementById("dropDownLock");

menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle("active");
});

document.addEventListener("click", () => {
    dropdownMenu.classList.remove("active");
});

dropdownMenu.addEventListener("click", (e) => {
    e.stopPropagation();
});

function openLogoutModal(e) {
    e.stopPropagation();
    dropdownMenu.classList.remove("active");
    modalLockBtn.innerText = "Lock app";
    modalLockBtn.style.color = "#00a884";
    modalLockBtn.classList.remove("disabled-state");
    logoutModal.classList.add("show");
};

if (dropdownLogoutItem) {
    dropdownLogoutItem.addEventListener("click", openLogoutModal);
}
if (generalLogoutOption) {
    generalLogoutOption.addEventListener("click", openLogoutModal);
}
if (dropDownLock) {
    dropDownLock.addEventListener("click", openLogoutModal);
}

modalCancelBtn.addEventListener("click", () => {
    logoutModal.classList.remove("show");
});

modalConfirmLogoutBtn.addEventListener("click", () => {
    logout();
});

modalLockBtn.addEventListener("click", () => {
    modalLockBtn.innerText = "Coming soon!";
    modalLockBtn.classList.add("disabled-state");
    modalLockBtn.style.color = "#8696a0";

    setTimeout(() => {
        logoutModal.classList.remove("show");
    }, 2000);
});

logoutModal.addEventListener("click", (e) => {
    if (e.target === logoutModal) {
        logoutModal.classList.remove("show");
    }
});

document.getElementById("savePrivacyBtn")
    .addEventListener("click", async () => {
        try {
            const selectedRadio = document.querySelector("input[name='privacy']:checked");
            if (!selectedRadio) return;

            const privacyType = selectedRadio.value;
            const members = [...document.querySelectorAll("#privacyContacts input:checked")]
                .map(item => Number(item.value));

            const res = await fetch(`${API}/status/privacy`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    privacyType,
                    members
                })
            });

            if (!res.ok) throw new Error("Failed to save privacy settings");

            const labels = {
                "my_contacts": "My contacts",
                "my_contacts_except": "My contacts except...",
                "only_share_with": "Only share with..."
            };

            showToast(`Privacy updated to "${labels[privacyType] || privacyType}"`, {
                icon: "fa-shield-halved"
            });

        } catch (error) {
            console.error("Error saving status privacy:", error);
        }
    });

async function loadPrivacyContacts() {
    try {
        const res = await fetch(`${API}/contact`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const contacts = await res.json();
        const container = document.getElementById("privacyContacts");
        container.innerHTML = "";

        contacts.forEach(contact => {
            let rawName = contact.ContactName || contact.Username || contact.PhoneNumber || "User";
            let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

            const targetUserId = contact.ContactUserId || contact.UserId || contact.Id;

            const div = document.createElement("div");
            div.classList.add("privacy-contact");
            div.innerHTML = `
                <input type="checkbox" value="${targetUserId}">
                <img src="${getImage(contact.ProfilePicture)}">
                <span>${formattedName}</span>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error("Error loading privacy contacts:", error);
    }
}

async function loadCurrentPrivacy() {
    try {
        const res = await fetch(`${API}/status/privacy`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await res.json();

        const targetRadio = document.querySelector(`input[name="privacy"][value="${data.privacyType}"]`);
        if (targetRadio) {
            targetRadio.checked = true;
        }

        if (Array.isArray(data.members)) {
            data.members.forEach(id => {
                const checkbox = document.querySelector(`#privacyContacts input[value="${id}"]`);
                if (checkbox) {
                    checkbox.checked = true;
                }
            });
        }

        togglePrivacyContacts();
    } catch (error) {
        console.error("Error loading saved privacy:", error);
    }
}

function togglePrivacyContacts() {
    const selectedRadio = document.querySelector('input[name="privacy"]:checked');
    if (!selectedRadio) return;

    const selected = selectedRadio.value;
    const privacyContacts = document.getElementById("privacyContacts");

    if (selected === "my_contacts_except" || selected === "only_share_with") {
        privacyContacts.style.display = "block";
    } else {
        privacyContacts.style.display = "none";
    }
}

document.querySelectorAll('input[name="privacy"]').forEach(radio => {
    radio.addEventListener("change", togglePrivacyContacts);
});

document.getElementById("statusPrivacyBtn").addEventListener("click", async () => {
    sections.forEach(section => {
        section.classList.add("hidden");
    });

    document.getElementById("status-privacy-panel").classList.remove("hidden");

    const statusDropdown = document.getElementById("statusDropdown");
    if (statusDropdown) statusDropdown.classList.remove("show");

    await loadPrivacyContacts();
    await loadCurrentPrivacy();
});

document.getElementById("backStatusPrivacy").addEventListener("click", () => {
    sections.forEach(section => {
        section.classList.add("hidden");
    });
    document.getElementById("status-panel").classList.remove("hidden");
});

const statusMenu = document.getElementById("statusMenu");
const statusDropdown = document.getElementById("statusDropdown");

if (statusMenu && statusDropdown) {
    statusMenu.addEventListener("click", () => {
        statusDropdown.classList.toggle("show");
    });
}


document
    .getElementById("likeStatusBtn")
    .addEventListener("click", async () => {

        try {

            const likeBtn =
                document.getElementById(
                    "likeStatusBtn"
                );

            const status =
                currentStatuses[currentIndex];

            likeBtn.disabled = true;

            const response =
                await fetch(
                    `${API}/status/like`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`
                        },

                        body: JSON.stringify({
                            statusId: status.Id
                        })
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    "Failed to react"
                );
            }

            if (data.liked) {

                likeBtn.innerHTML = `<i class="fa-solid fa-heart"></i>`;

                status.IsLiked = 1;

                status.LikeCount = (status.LikeCount || 0) + 1;

                likeBtn.animate(
                    [
                        {
                            transform: "scale(1)",
                            filter: "brightness(1)"
                        },
                        {
                            transform: "scale(1.5)",
                            filter: "brightness(1.4)"
                        },
                        {
                            transform: "scale(0.9)",
                            filter: "brightness(1.2)"
                        },
                        {
                            transform: "scale(1)"
                        }
                    ],
                    {
                        duration: 350,
                        easing: "ease-out"
                    }
                );

            } else {

                likeBtn.innerHTML = `<i class="fa-regular fa-heart"></i>`;
                likeBtn.animate(
                    [
                        {
                            transform: "scale(1)"
                        },
                        {
                            transform: "scale(0.7)"
                        },
                        {
                            transform: "scale(1)"
                        }
                    ],
                    {
                        duration: 250,
                        easing: "ease-in-out"
                    }
                );
                status.IsLiked = 0;

                status.LikeCount = Math.max(0, (status.LikeCount || 1) - 1);
            }

            const likeCountText = document.getElementById("likeCountText");
            if (likeCountText) {
                likeCountText.innerText = status.LikeCount;
            }

        } catch (error) {
            console.log("LIKE ERROR:", error);
        } finally {
            document.getElementById("likeStatusBtn").disabled = false;
        }
    });

document.querySelector(".status-like-owner")
    .addEventListener("click", async () => {

        const likesPopup = document.querySelector(".status-likes-popup");
        const viewsPopup = document.querySelector(".status-views-popup");

        if (!likesPopup.classList.contains("hidden")) {
            likesPopup.classList.add("hidden");
            return;
        }

        viewsPopup.classList.add("hidden");
        likesPopup.classList.remove("hidden");

        const status = currentStatuses[currentIndex];
        const myUserId = Number(localStorage.getItem("userId"));

        if (status.UserId !== myUserId) {
            return;
        }

        const res = await fetch(
            `${API}/status/likes/${status.Id}`,
            {
                headers: {
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );

        const likes =
            await res.json();

        const list =
            document.querySelector(
                ".status-likes-list"
            );

        list.innerHTML = "";

        document.getElementById(
            "likePopupCount"
        ).innerText =
            `Liked By ${likes.length}`;

        likes.forEach(user => {

            let rawName;

            if (user.Id === myUserId) {

                rawName = "You";

            } else {

                rawName =
                    user.ContactName ||
                    user.Username ||
                    user.PhoneNumber;
            }

            list.innerHTML += `

            <div class="status-view-user">

                <img src="${getImage(user.ProfilePicture)}">

                <div>

                    <h4>${rawName}</h4>
                     <p>
                        ${user.PhoneNumber}
                    </p>

                </div>

            </div>
        `;
        });

        likesPopup.classList.remove("hidden");
    });
const closeLikesPopup = document.querySelector(".close-likes");
const closeViewsPopup = document.querySelector(".close-views");

closeLikesPopup.addEventListener("click", () => {
    document.querySelector(".status-likes-popup").classList.add("hidden");
});

closeViewsPopup.addEventListener("click", () => {
    document.querySelector(".status-views-popup").classList.add("hidden");
});

let speakerEnabled = true;
function createPeerConnection() {

    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.ontrack = (event) => {
        const remoteVideoElement = document.getElementById("remoteVideo");

        if (remoteVideoElement && event.streams[0]) {
            remoteVideoElement.srcObject = event.streams[0];

            remoteVideoElement.muted = false;
            remoteVideoElement.volume = speakerEnabled ? 1.0 : 0.1;

            remoteVideoElement.play().catch(error => {
                console.log("Mobile autoplay blocked audio playback. Unmuting on user touch interaction.");

                const unlockMobileAudio = () => {
                    remoteVideoElement.play();
                    document.removeEventListener("click", unlockMobileAudio);
                };
                document.addEventListener("click", unlockMobileAudio);
            });
        }
    };

    peerConnection.onicecandidate = (event) => {

        if (!event.candidate) return;

        const targetTargetId = incomingCallerId ? incomingCallerId : currentCallReceiverId;

        if (!targetTargetId) {
            console.error("ICE Candidate tracking failed: Target recipient missing from connection context.");
            return;
        }

        socket.emit("ice-candidate", {

            receiverId: targetTargetId,
            candidate: event.candidate
        }
        );
    };
};

async function setupLocalMedia(videoOption) {
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: videoOption
    });

    if (videoOption) {
        const localVideoElement = document.getElementById("localVideo");
        if (localVideoElement) localVideoElement.srcObject = localStream;
    }

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
};

async function startCall(type) {
    if (!currentUserProfileId) return;

    currentCallType = type;
    currentCallReceiverId = currentUserProfileId;

    document.getElementById("callUserName").innerText = `Calling ${currentCallUserName || "User"}...`;
    document.getElementById("callStatus").innerText = "Calling...";
    const activeChatImageEl = document.querySelector(".chat-user img") || document.querySelector(".profile-display img");
    let targetImage = null;
    if (activeChatImageEl) {
        targetImage = activeChatImageEl.src;
    } else {
        targetImage = localStorage.getItem("currentSelectedUserImage");
    }

    updateCallWindowLayout(type, targetImage);
    document.getElementById("callModal").classList.remove("hidden");
    stopAllCallSounds();
    outgoingRingSound.play().catch(() => { });

    createPeerConnection();
    await setupLocalMedia(type === "video");

    const offer = await peerConnection.createOffer();
    offer.sdp = forceOpusAudioCodec(offer.sdp);
    await peerConnection.setLocalDescription(offer);

    try {
        const response = await fetch("http://192.168.0.107:5000/api/calls/create", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({
                receiverId: currentUserProfileId,
                callType: type,
                callStatus: "ringing"
            })
        });

        const result = await response.json();
        currentCallId = result.callId;

        socket.emit("call-user", {
            callerId: Number(localStorage.getItem("userId")),
            receiverId: currentUserProfileId,
            offer,
            callType: type,
            callId: currentCallId,
            callerName: localStorage.getItem("username"),
            callerImage: localStorage.getItem("profilePicture")
        });

        setTimeout(() => {
            document.getElementById("callStatus").innerText = "Ringing...";
        }, 3000);
    } catch (err) {
        console.error("Initialization call sequence failed structural setup:", err);
        cleanupCall();
    }
};

function startVoiceCall() { startCall("voice"); };
function startVideoCall() { startCall("video"); };

async function acceptCall() {

    clearTimeout(missedTimer);

    currentCallReceiverId =
        incomingCallerId;

    createPeerConnection();
    await setupLocalMedia(currentCallType === "video");

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOffer));

        while (iceCandidateQueue.length > 0) {
            const candidate = iceCandidateQueue.shift();
            await peerConnection.addIceCandidate(candidate);
        }

        const answer = await peerConnection.createAnswer();
        answer.sdp = forceOpusAudioCodec(answer.sdp);
        await peerConnection.setLocalDescription(answer);

        socket.emit("answer-call", {
            callerId: incomingCallerId,
            answer
        });

        await fetch(`http://192.168.0.107:5000/api/calls/accept/${currentCallId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({ status: "accepted" })
        });

        callStartTime = Date.now();
        startLiveCallTimer();

        document.getElementById("callUserName").innerText = currentCallUserName || "Incoming Call";
        document.getElementById("callStatus").innerText = "Connected";
        incomingRingSound.pause();
        incomingRingSound.currentTime = 0;

        connectedSound.play().catch(() => { });
        updateCallWindowLayout(currentCallType, document.getElementById("incomingUserImage").src)
        document.getElementById("incomingCallModal").classList.add("hidden");
        document.getElementById("callModal").classList.remove("hidden");
    } catch (err) {
        console.error("Critical issue accepting WebRTC call chain connection:", err);
        cleanupCall();
    }
};

async function rejectCall() {

    clearTimeout(missedTimer);

    try {
        await fetch(`http://192.168.0.107:5000/api/calls/reject/${currentCallId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({ status: "rejected" })
        });
    } catch (e) {
        console.error(e);
    }

    socket.emit("reject-call", {
        callerId: incomingCallerId
    });
    cleanupCall();
};

async function endCall() {
    const wasAnswered = !!callStartTime;
    const duration = wasAnswered ? Math.floor((Date.now() - callStartTime) / 1000) : 0;
    const currentUserId = Number(localStorage.getItem("userId"));

    if (currentCallId) {
        try {
            if (wasAnswered) {
                const res = await fetch(`http://192.168.0.107:5000/api/calls/end/${currentCallId}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${localStorage.getItem("token")}`
                    },
                    body: JSON.stringify({ duration, chatId: currentChatId }) // Send fallback context to backend
                });

                const data = await res.json();

                const resolvedChatId = currentChatId || data.chatId;

                if (resolvedChatId) {
                    socket.emit("send_message", {
                        chatId: resolvedChatId,
                        senderId: currentUserId,
                        messageType: "call_answered",
                        mediaUrl: null,
                        message: currentCallType === "video" ? "Video call finished" : "Voice call finished",
                        duration: duration
                    });
                }
            } else {
                const res = await fetch(`http://192.168.0.107:5000/api/calls/missed/${currentCallId}`, {
                    method: "PUT",
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`
                    }
                });

                const data = await res.json();
                const resolvedChatId = currentChatId || data.chatId;

                if (resolvedChatId) {
                    socket.emit("send_message", {
                        chatId: resolvedChatId,
                        senderId: currentUserId,
                        messageType: "call_missed",
                        mediaUrl: null,
                        message: currentCallType === "video" ? "Missed video call" : "Missed voice call"
                    });
                }
            }
        } catch (e) {
            console.error("Error writing system call records to messaging loops:", e);
        }
    }

    stopAllCallSounds();
    endCallSound.play().catch(() => { });
    socket.emit("end-call", { receiverId: currentCallReceiverId });
    cleanupCall();
};

function cleanupCall() {
    stopAllCallSounds();
    stopLiveCallTimer();
    if (missedTimer) {
        clearTimeout(missedTimer);
        missedTimer = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    callStartTime = null;
    currentCallId = null;
    currentCallReceiverId = null;
    incomingCallerId = null;
    incomingOffer = null;
    iceCandidateQueue = [];

    const localVid = document.getElementById("localVideo");
    const remoteVid = document.getElementById("remoteVideo");
    if (localVid) localVid.srcObject = null;
    if (remoteVid) remoteVid.srcObject = null;

    document.getElementById("callModal").classList.add("hidden");
    document.getElementById("incomingCallModal").classList.add("hidden");
};

function toggleMute() {
    const audioTrack = localStream?.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    document.getElementById("muteBtn").style.background = audioTrack.enabled ? "" : "#ff4d4d";
};

function toggleCamera() {
    const videoTrack = localStream?.getVideoTracks()[0];
    if (!videoTrack) return;

    videoTrack.enabled = !videoTrack.enabled;
    document.getElementById("cameraBtn").style.background = videoTrack.enabled ? "" : "#ff4d4d";
};


document.getElementById("voiceCallBtn").addEventListener("click", startVoiceCall);
document.getElementById("videoCallBtn").addEventListener("click", startVideoCall);
document.getElementById("acceptCallBtn").addEventListener("click", acceptCall);
document.getElementById("rejectCallBtn").addEventListener("click", rejectCall);
document.getElementById("endCallBtn").addEventListener("click", endCall);
document.getElementById("muteBtn").addEventListener("click", toggleMute);
document.getElementById("cameraBtn").addEventListener("click", toggleCamera);

async function loadCalls() {
    const token = localStorage.getItem("token");
    try {
        const response = await fetch("http://192.168.0.107:5000/api/calls", {
            headers: { Authorization: `Bearer ${token}` }
        });
        const calls = await response.json();
        cachedCallsList = calls;
        const callList = document.querySelector(".call-list");
        callList.innerHTML = "";

        if (!calls || calls.length === 0) {
            const noCallsDiv = document.createElement("div");
            noCallsDiv.classList.add("no-calls-placeholder");
            noCallsDiv.innerHTML = `
                <i class="fa-solid fa-phone-slash"></i>
                <p>No calls yet</p>
            `;
            callList.appendChild(noCallsDiv);
            return;
        }

        const currentUserId = Number(localStorage.getItem("userId"));

        const hasMissedCalls = calls.some(call =>
            Number(call.CallerId) !== currentUserId &&
            (call.CallStatus === "missed" || call.CallStatus === "rejected")
        );
        setSidebarDotBadge("sidebarCallsBadge", hasMissedCalls);

        calls.forEach(call => {
            const div = document.createElement("div");
            div.classList.add("call-item");

            const actionIcon = call.CallType === "video" ? "fa-video" : "fa-phone";
            const imageUrl = getImage(call.ProfilePicture);
            const isOutgoing = Number(call.CallerId) === currentUserId;

            let statusText = "Outgoing";
            let statusColor = "#8696a0";
            let arrowIconClass = "fa-arrow-up-right";

            if (!isOutgoing) {
                if (call.CallStatus === "missed" || call.CallStatus === "rejected") {
                    statusText = call.CallType === "video" ? "Missed video call" : "Missed voice call";
                    statusColor = "#ef4444";
                    arrowIconClass = "fa-arrow-down call-log-missed-arrow";
                } else {
                    statusText = "Incoming";
                    statusColor = "#8696a0";
                    arrowIconClass = "fa-arrow-down call-log-incoming-arrow";
                }
            } else {
                arrowIconClass = "fa-arrow-up call-log-outgoing-arrow";
                if (call.CallStatus === "missed" || call.CallStatus === "rejected") {
                    statusText = "No answer";
                }
            }

            let timestampString = "";
            if (call.CreatedAt) {
                const cleanDateStr = call.CreatedAt.replace('T', ' ').replace('Z', '');
                const parts = cleanDateStr.split(' ');

                if (parts.length >= 2) {
                    const dateParts = parts[0].split('-');
                    const timeParts = parts[1].split(':');

                    const localDateObject = new Date(
                        parseInt(dateParts[0]),
                        parseInt(dateParts[1]) - 1,
                        parseInt(dateParts[2]),
                        parseInt(timeParts[0]),
                        parseInt(timeParts[1]),
                        timeParts[2] ? parseInt(timeParts[2].split('.')[0]) : 0
                    );

                    const displayDate = formatCallLogDate(localDateObject);
                    const displayTime = localDateObject.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    timestampString = displayDate === "Today" ? displayTime : displayDate;
                } else {
                    const secureDateObject = new Date(call.CreatedAt);
                    const displayDate = formatCallLogDate(secureDateObject);
                    const displayTime = secureDateObject.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    timestampString = displayDate === "Today" ? displayTime : displayDate;
                }
            }

            let rawName = call.ContactName || call.Username || call.PhoneNumber || "user";
            let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

            div.innerHTML = `
                <img src="${imageUrl}">
                <div class="call-info">
                    <div>
                        <h4>${formattedName}</h4>
                        <span class="call-log-time">${timestampString}</span>
                    </div>
                    <p style="color: ${statusColor};">
                        <i class="fa-solid ${arrowIconClass}"></i> 
                        <span>${statusText}</span>
                    </p>
                </div>
                <div class="call-action">
                    <i class="fa-solid ${actionIcon}"></i>
                </div>
            `;

            div.addEventListener("click", async () => {
                const userId = call.CallerId === currentUserId ? call.ReceiverId : call.CallerId;
                currentCallUserName = call.ContactName || call.Username || call.PhoneNumber;
                currentUserProfileId = userId;

                try {
                    const chatInitResponse = await fetch(`${API}/chat/create`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({ userIds: [currentUserId, userId] })
                    });
                    const chatInitData = await chatInitResponse.json();
                    currentChatId = chatInitData.chatId;
                    await loadMessages(currentChatId);
                } catch (err) {
                    console.error("Could not link valid conversation room to call entry:", err);
                    return;
                }

                await loadUserProfile(userId);
                messagesContainer.classList.remove("hidden");
                document.querySelector(".chat-header").style.display = "flex";
                document.querySelector(".chat-area").classList.add("chat-open");
                document.getElementById("chatUsername").innerText = formattedName;
                document.querySelector(".message-input").style.display = "flex";
                document.querySelector(".chat-user img").src = getImage(call.ProfilePicture);

                const statusEl = document.getElementById("userStatus");
                statusEl.innerText = call.LastSeen ? `last seen ${formatStatusTime(call.LastSeen)}` : "offline";
                statusEl.classList.remove("animate-status");
                void statusEl.offsetWidth;
                statusEl.classList.add("animate-status");

                document.getElementById("profileModal").classList.add("active");
            });

            div.querySelector(".call-action").addEventListener("click", async (e) => {
                e.stopPropagation();

                const userId = call.CallerId === currentUserId ? call.ReceiverId : call.CallerId;
                currentUserProfileId = userId;
                currentCallUserName = call.ContactName || call.Username || call.PhoneNumber;

                try {
                    const chatInitResponse = await fetch(`${API}/chat/create`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({ userIds: [currentUserId, userId] })
                    });
                    const chatInitData = await chatInitResponse.json();
                    currentChatId = chatInitData.chatId;
                } catch (err) {
                    console.error("Could not resolve chat for call shortcut:", err);
                    return;
                }

                if (call.CallType === "video") startVideoCall();
                else startVoiceCall();
            });

            callList.appendChild(div);
        });
    } catch (e) {
        console.error("Error loading call history list view component details:", e);
    }
};

function formatCallLogDate(dateString) {
    const callDate = dateString instanceof Date ? dateString : new Date(dateString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (callDate.toDateString() === today.toDateString()) {
        return "Today";
    }
    if (callDate.toDateString() === yesterday.toDateString()) {
        return "Yesterday";
    }

    const timeDiff = Math.abs(today.getTime() - callDate.getTime());
    const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

    if (dayDiff < 7) {
        return callDate.toLocaleDateString([], { weekday: 'long' });
    }

    return callDate.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

function updateCallWindowLayout(type, avatarUrl) {
    const voiceDisplay = document.getElementById("voiceCallDisplay");
    const videoContainer = document.getElementById("videoContainer");
    const voiceAvatar = document.getElementById("voiceCallAvatar");

    if (avatarUrl) {
        voiceAvatar.src = getImage(avatarUrl);
    } else {
        voiceAvatar.src = "img/default-avatar.svg";
    }

    if (type === "video") {
        voiceDisplay.classList.add("hidden");
        videoContainer.classList.remove("hidden");
        document.getElementById("cameraBtn").style.display = "flex";
    } else {
        voiceDisplay.classList.remove("hidden");
        videoContainer.classList.add("hidden");
        document.getElementById("cameraBtn").style.display = "none";
    }
};

document.getElementById("addFavouriteBtn").addEventListener("click", () => {

    alert("Open contacts list here");

});

async function loadCallContacts() {

    try {

        const response = await fetch(`${API}/contact`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const contacts = await response.json();

        renderCallContacts(contacts);

    } catch (error) {
        console.error(error);
    }
};

function renderCallContacts(contacts) {

    const container = document.getElementById("call-contact-list");
    container.innerHTML = "";

    contacts.forEach(contact => {

        let rawName = contact.ContactName || contact.Username || contact.PhoneNumber || "User";
        const div = document.createElement("div");

        div.className = "call-contact-item";

        div.innerHTML = `
            <img src="${getImage(contact.ProfilePicture)}">

            <div class="call-contact-info">
                <h4>${rawName}</h4>
                <p>${contact.About || "Hey there! I am using ChatWeb."}</p>
            </div>

            <div class="call-contact-action">
                <i class="fa-solid fa-phone voice-btn"></i>
                <i class="fa-solid fa-video video-btn"></i>
            </div>
        `;

        div.querySelector(".voice-btn")
            .addEventListener("click", (e) => {

                e.stopPropagation();

                currentUserProfileId = contact.Id;
                currentCallUserName = rawName;

                startVoiceCall();
            });

        div.querySelector(".video-btn")
            .addEventListener("click", (e) => {

                e.stopPropagation();

                currentUserProfileId = contact.Id;
                currentCallUserName = rawName;

                startVideoCall();
            });

        div.addEventListener("click", async () => {

            try {

                currentUserProfileId = contact.Id;
                const currentUserId =
                    Number(localStorage.getItem("userId"));

                currentCallUserName = contact.ContactName || contact.Username || contact.PhoneNumber;

                const response = await fetch(`${API}/chat/create`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        userIds: [
                            currentUserId,
                            contact.Id
                        ]
                    })
                });

                const data = await response.json();

                currentChatId = data.chatId;

                await loadChats();
                await loadMessages(currentChatId);
                await loadUserProfile(contact.Id);

                document.querySelector(".chat-header").style.display = "flex";
                document.querySelector(".message-input").style.display = "flex";
                document.querySelector(".chat-area").classList.add("chat-open");
                document.querySelector(".left").classList.add("hidden-mobile");

                document.getElementById("chatUsername").innerText = rawName;

                document.querySelector(".chat-user img").src =
                    getImage(contact.ProfilePicture);

                const statusEl =
                    document.getElementById("userStatus");

                if (contact.LastSeen) {
                    statusEl.innerText =
                        `last seen ${formatStatusTime(contact.LastSeen)}`;
                } else {
                    statusEl.innerText = "offline";
                }

                statusEl.classList.remove("animate-status");
                void statusEl.offsetWidth;
                statusEl.classList.add("animate-status");

                document.getElementById("profileModal").classList.add("active");

            } catch (error) {

                console.error(error);
            }
        });

        container.appendChild(div);
    });
};

const startCallBtn = document.querySelector(".calls-icons");
const callBackBtn = document.getElementById("callBackBtn");

startCallBtn.addEventListener("click", async () => {
    sections.forEach(section => {
        section.classList.add("hidden");
    });

    document
        .getElementById("call-contact-panel")
        .classList.remove("hidden");

    await loadCallContacts();
});

callBackBtn.addEventListener("click", () => {
    sections.forEach(section => {
        section.classList.add("hidden");
    });

    document
        .getElementById("calls-panel")
        .classList.remove("hidden");
});


function toggleSpeaker() {
    const remoteVideo = document.getElementById("remoteVideo");
    if (!remoteVideo) return;

    speakerEnabled = !speakerEnabled;
    remoteVideo.muted = false;

    if (speakerEnabled) {
        remoteVideo.volume = 1.0;
        document.getElementById("speakerBtn").classList.add("active");
        document.getElementById("speakerBtn").innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    } else {
        remoteVideo.volume = 0.1;
        document.getElementById("speakerBtn").classList.remove("active");
        document.getElementById("speakerBtn").innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    }
};

document.getElementById("speakerBtn").addEventListener("click", toggleSpeaker);

function stopAllCallSounds() {
    outgoingRingSound.pause();
    outgoingRingSound.currentTime = 0;

    incomingRingSound.pause();
    incomingRingSound.currentTime = 0;

    connectedSound.pause();
    connectedSound.currentTime = 0;

    endCallSound.pause();
    endCallSound.currentTime = 0;
};

function forceOpusAudioCodec(sdp) {
    const lines = sdp.split("\r\n");
    let mLineIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].indexOf("m=audio ") === 0) {
            mLineIndex = i;
            break;
        }
    }

    if (mLineIndex === -1) return sdp;

    let opusPayload = null;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].indexOf("a=rtpmap:") === 0 && lines[i].toLowerCase().indexOf("opus/48000") !== -1) {
            opusPayload = lines[i].split(":")[1].split(" ")[0];
            break;
        }
    }

    if (!opusPayload) return sdp;

    const mLineElements = lines[mLineIndex].split(" ");
    const newMLine = [];
    newMLine.push(mLineElements[0]); // m=
    newMLine.push(mLineElements[1]); // port
    newMLine.push(mLineElements[2]); // proto

    newMLine.push(opusPayload);

    for (let i = 3; i < mLineElements.length; i++) {
        if (mLineElements[i] !== opusPayload) {
            newMLine.push(mLineElements[i]);
        }
    }

    lines[mLineIndex] = newMLine.join(" ");
    return lines.join("\r\n");
};

function renderMediaContent(msg, isMe) {
    const mediaUrl = msg.MediaUrl || msg.mediaUrl;
    const messageType = msg.MessageType || msg.messageType || "text";
    const msgText = msg.MessageText || msg.message || "";
    const msgId = msg.Id || msg.messageId;
    const isDeleted = msg.DeletedForEveryone === 1 || msg.DeletedForEveryone === true;
    const forwardedLabel = msg.IsForwarded
        ? `
        <div class="forwarded-label">
            <i class="fa-solid fa-share"></i>
            <span>Forwarded</span>
        </div>
    `
        : "";

    if (isDeleted) {
        return `<p class="deleted-msg">This message was deleted</p>`;
    }

    if (["call_missed", "call_answered", "call_outgoing", "call_rejected", "voice_call", "video_call"].includes(messageType)) {
        const isVideo = messageType === "video_call" || msgText.toLowerCase().includes("video");
        const iconClass = isVideo ? "fa-video" : "fa-phone";

        let title = isVideo ? "Video call" : "Voice call";
        let subtext = "No answer";
        let arrowIcon = "";
        let phoneColor = "#8696a0";
        let textStyleColor = "";

        const callDurationValue = msg.Duration || msg.duration;
        const durationText = callDurationValue ? formatCallDuration(callDurationValue) : "";

        let activeState = messageType;
        if (messageType === "voice_call" || messageType === "video_call") {
            activeState = isMe ? "call_outgoing" : "call_answered";
        }

        if (isMe) {
            // --- OUTGOING AXIS PERSPECTIVE ---
            arrowIcon = `<i class="fa-solid fa-arrow-up-right" style="color: #8696a0; font-size: 10px; position: absolute; top: 6px; right: 6px;"></i>`;
            if (activeState === "call_missed" || activeState === "call_rejected") {
                subtext = "No answer";
            } else {
                subtext = durationText || "Connected";
            }
        } else {
            if (activeState === "call_missed") {
                title = isVideo ? "Missed video call" : "Missed voice call";
                subtext = "No answer";
                phoneColor = "#ea0038";
                textStyleColor = "#ea0038";
                arrowIcon = `<i class="fa-solid fa-arrow-down-left" style="color: #ea0038; font-size: 10px; position: absolute; bottom: 6px; right: 6px; transform: rotate(-45deg);"></i>`;
            } else if (activeState === "call_rejected") {
                title = isVideo ? "Declined video call" : "Declined voice call";
                subtext = "Declined";
                phoneColor = "#ea0038";
                textStyleColor = "#ea0038";
                arrowIcon = `<i class="fa-solid fa-xmark" style="color: #ea0038; font-size: 10px; position: absolute; bottom: 6px; right: 6px;"></i>`;
            } else if (activeState === "call_answered") {
                subtext = durationText || "Answered";
                phoneColor = "#00a884";
                arrowIcon = `<i class="fa-solid fa-arrow-down-left" style="color: #00a884; font-size: 10px; position: absolute; bottom: 6px; right: 6px;"></i>`;
            }
        }

        const inlineTextColor = textStyleColor ? `style="color: ${textStyleColor};"` : "";
        return `
            <div class="call-wrapper">

            ${forwardedLabel}
            <div class="call-log-bubble-card">
                <div class="call-log-icon-circle">
                    <i class="fa-solid ${iconClass}" style="color: ${phoneColor}; font-size: 13px; transform: rotate(${isVideo ? '0deg' : '135deg'});"></i>
                    ${arrowIcon}
                </div>
                <div class="call-log-details-meta">
                    <h5 ${inlineTextColor}>${title}</h5>
                    <span ${inlineTextColor}>${subtext}</span>
                </div>
            </div>
            </div>
        `;
    }

    if (messageType === "text" || !mediaUrl) {
        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

        const formattedText = msgText.replace(urlRegex, (url) => {
            const hyperlinkTarget = url.startsWith('www.') ? `https://${url}` : url;
            return `<a href="${hyperlinkTarget}" target="_blank" class="chat-inline-link">${url}</a>`;
        });

        return `
        <div class="text-message-wrapper">

            ${forwardedLabel}

            <p>${formattedText}</p>

        </div>
        `;
    }

    const serverUrl = API.replace("/api", "");
    const fullUrl = serverUrl + mediaUrl;
    const fileName = mediaUrl.split("/").pop();

    const cacheKey = `wa_downloaded_${msgId}`;
    const isDownloaded = localStorage.getItem(cacheKey) === "true";

    if (isMe || isDownloaded || messageType === "document") {
        if (messageType === "image") {
            return `
            <div class="chat-image-wrapper">

                ${forwardedLabel}

                <img
                    src="${fullUrl}"
                    class="chat-image"
                    data-src="${fullUrl}"
                    data-type="image"
                    onclick="openMediaLightbox(this)">

            </div>
            `;
        }
        if (messageType === "video") {
            return `
            <div class="chat-video-wrapper">

                ${forwardedLabel}

                <div
                    class="chat-video"
                    data-src="${fullUrl}"
                    data-type="video"
                    onclick="openMediaLightbox(this)">

                    <video>
                        <source src="${fullUrl}">
                    </video>

                    <i class="fa-solid fa-play"></i>

                </div>

            </div>
            `;
        }
        if (messageType === "audio") {
            return `
            <div class="audio-wrapper">

                ${forwardedLabel}

                <div class="audio-msg">
                    <audio controls>
                        <source src="${fullUrl}">
                    </audio>
                </div>

            </div>
            `;
        }
        if (messageType === "document") {
            return `
            <div class="document-wrapper">

                ${forwardedLabel}

                <div class="document-message">

                    <i class="fa-solid fa-file"></i>

                    <a href="${fullUrl}" target="_blank">
                        ${fileName}
                    </a>

                </div>

            </div>
            `;
        }
    }

    let typeIcon = "fa-camera";
    let blurBackgroundHtml = "";

    if (messageType === "video") {
        typeIcon = "fa-video";
        blurBackgroundHtml = `
            <video src="${fullUrl}" preload="metadata" muted playsinline 
                   style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: blur(5px) brightness(0.6); opacity: 0.7;">
            </video>`;
    } else {
        blurBackgroundHtml = `
            <div style="position: absolute; inset: 0; width: 100%; height: 100%; background: url('${fullUrl}') center/cover; filter: blur(5px) brightness(0.6); opacity: 0.7;">
            </div>`;
    }

    return `
        <div class="blur-message-wrapper">

            ${forwardedLabel}

            <div
                class="wa-blur-media-wrapper"
                data-msg-id="${msgId}"
                data-url="${fullUrl}"
                data-type="${messageType}">

                ${blurBackgroundHtml}

                <button
                    class="wa-download-overlay-icon"
                    onclick="executeDownloadAction(this)"
                    style="position:relative;z-index:5;background:rgba(11,20,26,.85);border:none;border-radius:50%;width:48px;height:48px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;">

                    <i class="fa-solid fa-arrow-down"></i>

                </button>

                <div
                    style="position:absolute;bottom:8px;left:8px;z-index:4;font-size:11px;color:#aebac1;background:rgba(0,0,0,.4);padding:2px 6px;border-radius:4px;display:flex;align-items:center;gap:4px;">

                    <i class="fa-solid ${typeIcon}"></i>

                    ${messageType.toUpperCase()}

                </div>

            </div>

        </div>
        `;
};

let activeChatGalleryArray = [];
let currentGalleryIndex = 0;

function openMediaLightbox(clickedElement) {
    const messages = Array.from(document.querySelectorAll(".message"));
    activeChatGalleryArray = [];

    messages.forEach(msg => {
        const imgEl = msg.querySelector("img.chat-image");
        const videoWrapper = msg.querySelector(".chat-video");

        if (imgEl) {
            activeChatGalleryArray.push({
                type: "image",
                url: imgEl.getAttribute("data-src"),
                msgId: msg.dataset.messageId,
                timestamp: msg.querySelector(".msg-meta")?.innerText?.replace(/[^a-zA-Z0-9: ]/g, "")?.trim() || ""
            });
        } else if (videoWrapper) {
            const videoUrl = videoWrapper.getAttribute("data-src") || videoWrapper.dataset.src;
            if (videoUrl) {
                activeChatGalleryArray.push({
                    type: "video",
                    url: videoUrl,
                    msgId: msg.dataset.messageId,
                    timestamp: msg.querySelector(".msg-meta")?.innerText?.replace(/[^a-zA-Z0-9: ]/g, "")?.trim() || ""
                });
            }
        }
    });

    const targetUrl = clickedElement.getAttribute("data-src");
    currentGalleryIndex = activeChatGalleryArray.findIndex(item => item.url === targetUrl);

    if (currentGalleryIndex === -1) currentGalleryIndex = 0;

    document.getElementById("mediaLightboxModal").classList.remove("hidden");
    renderLightboxActiveAsset();
    populateThumbnailCarouselStrip();
};

function renderLightboxActiveAsset() {
    if (activeChatGalleryArray.length === 0) return;
    const item = activeChatGalleryArray[currentGalleryIndex];
    console.log("item", item)

    const imgNode = document.getElementById("globalLightboxImage");
    const vidNode = document.getElementById("globalLightboxVideo");

    imgNode.classList.add("hidden");
    vidNode.classList.add("hidden");
    vidNode.pause(); vidNode.src = "";

    document.getElementById("lightboxUserAvatar").src = getImage(document.querySelector(".chat-user img")?.src || "img/default-avatar.svg");
    document.getElementById("lightboxSenderName").innerText = document.getElementById("chatUsername")?.innerText || "User";
    document.getElementById("lightboxTimestamp").innerText = item.timestamp || "";

    if (item.type === "image") {
        imgNode.src = item.url;
        imgNode.classList.remove("hidden");
    } else if (item.type === "video") {
        vidNode.src = item.url;
        vidNode.classList.remove("hidden");
        vidNode.load();
        vidNode.play().catch(() => { });
    }

    document.getElementById("lightboxDownloadBtn").onclick = () => {
        const link = document.createElement("a");
        link.href = item.url;
        link.download = item.url.split("/").pop();
        link.click();
    };

    updateCarouselHighlight();
};

function populateThumbnailCarouselStrip() {
    const strip = document.getElementById("galleryThumbnailStrip");
    if (!strip) return;
    strip.innerHTML = "";

    activeChatGalleryArray.forEach((item, index) => {
        const thumbContainer = document.createElement("div");
        thumbContainer.style.position = "relative";
        thumbContainer.style.display = "inline-block";
        thumbContainer.style.cursor = "pointer";

        let mediaMarkup = "";
        if (item.type === "image") {
            mediaMarkup = `<img src="${item.url}" class="strip-thumb-item ${index === currentGalleryIndex ? 'active' : ''}" data-index="${index}">`;
        } else if (item.type === "video") {
            // FIX: Render a metadata-preloaded video element that extracts the live video thumbnail poster frame natively
            mediaMarkup = `
                <div class="strip-thumb-item ${index === currentGalleryIndex ? 'active' : ''}" data-index="${index}" style="position: relative; width: 48px; height: 48px; overflow: hidden; background: #111b21; border-radius: 4px;">
                    <video src="${item.url}" preload="metadata" muted style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;"></video>
                    <i class="fa-solid fa-play" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.8); font-size: 10px;"></i>
                </div>`;
        }

        thumbContainer.innerHTML = mediaMarkup;

        thumbContainer.addEventListener("click", () => {
            currentGalleryIndex = index;
            renderLightboxActiveAsset();
        });

        strip.appendChild(thumbContainer);
    });
}

function updateCarouselHighlight() {
    document.querySelectorAll(".strip-thumb-item").forEach((thumb, idx) => {
        if (idx === currentGalleryIndex) {
            thumb.classList.add("active");
            thumb.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        } else {
            thumb.classList.remove("active");
        }
    });
}

document.getElementById("prevMediaBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentGalleryIndex > 0) {
        currentGalleryIndex--;
        renderLightboxActiveAsset();
    }
});

document.getElementById("nextMediaBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentGalleryIndex < activeChatGalleryArray.length - 1) {
        currentGalleryIndex++;
        renderLightboxActiveAsset();
    }
});

function closeMediaLightboxModal() {
    const modal = document.getElementById("mediaLightboxModal");
    const vidNode = document.getElementById("globalLightboxVideo");
    if (modal) modal.classList.add("hidden");
    if (vidNode) { vidNode.pause(); vidNode.src = ""; }
};

document.getElementById("closeLightboxBtn")?.addEventListener("click", closeMediaLightboxModal);

document.addEventListener("keydown", (e) => {
    if (document.getElementById("mediaLightboxModal").classList.contains("hidden")) return;
    if (e.key === "Escape") closeMediaLightboxModal();
    if (e.key === "ArrowLeft" && currentGalleryIndex > 0) {
        currentGalleryIndex--; renderLightboxActiveAsset();
    }
    if (e.key === "ArrowRight" && currentGalleryIndex < activeChatGalleryArray.length - 1) {
        currentGalleryIndex++; renderLightboxActiveAsset();
    }
});

function toggleQuickReactionPopup(event, msgId) {
    event.preventDefault();
    event.stopPropagation();

    const targetPopup = document.getElementById(`quickReact-${msgId}`);
    const isCurrentlyActive = targetPopup ? targetPopup.classList.contains('active') : false;

    document.querySelectorAll('.wa-quick-reactions-popup').forEach(popup => {
        popup.classList.remove('active');
    });

    if (targetPopup && !isCurrentlyActive) {
        targetPopup.classList.add('active');
    }
}

function submitMessageReaction(event, msgId, emojiStr) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    console.log(`Sending Reaction: "${emojiStr}" to Message ID: ${msgId}`);

    const activeChatRoomId = typeof currentChatId !== 'undefined' ? currentChatId : null;

    if (typeof socket !== 'undefined' && socket.emit) {
        socket.emit("message_reaction", {
            messageId: Number(msgId),
            emoji: emojiStr,
            chatId: activeChatRoomId
        });
    }

    const targetPopup = document.getElementById(`quickReact-${msgId}`);
    if (targetPopup) targetPopup.classList.remove('active');
}

document.addEventListener("click", (e) => {
    if (!e.target.closest('.wa-action-trigger-container')) {
        document.querySelectorAll('.wa-quick-reactions-popup').forEach(p => p.classList.remove('active'));
    }
});

const emojiList = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕'];

function initInputEmojiPicker() {
    const tray = document.getElementById("inputEmojiTray");
    const emojiBtn = document.getElementById("emojiBtn");
    const textInput = document.getElementById("message-input");

    if (!tray || !emojiBtn || !textInput) return;

    tray.innerHTML = emojiList.map(emoji =>
        `<button type="button" class="input-emoji-option">${emoji}</button>`
    ).join('');

    emojiBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        const attachMenu = document.getElementById("attachmentMenu");
        if (attachMenu) attachMenu.classList.add("hidden");

        tray.classList.toggle("active");
    });

    tray.addEventListener("click", (e) => {
        if (e.target.classList.contains("input-emoji-option")) {
            const chosenEmoji = e.target.innerText;
            textInput.value += chosenEmoji;
            textInput.focus();
        }
    });

    document.addEventListener("click", (e) => {
        if (!tray.contains(e.target) && e.target !== emojiBtn) {
            tray.classList.remove("active");
        }
    });
}

document.addEventListener("DOMContentLoaded", initInputEmojiPicker);

const forwardBtn = document.getElementById("forwardMsgBtn");

forwardBtn.onclick = () => {

    messageMenu.classList.add("hidden");

    document
        .getElementById("forwardPanel")
        .classList
        .remove("hidden");

    loadForwardChats();

};

const selectedForwardChats = new Set();

async function loadForwardChats() {

    const response = await fetch(`${API}/chat`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const chats = await response.json();

    const list = document.getElementById("forwardChatList");

    list.innerHTML = "";

    chats.forEach(chat => {

        const item = document.createElement("div");

        item.className = "forward-chat-item";

        item.dataset.chatId = chat.ChatId;

        let rawName = chat.ContactName || chat.Username || chat.PhoneNumber || "user";
        let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

        item.innerHTML = `

            <img
                class="forward-chat-avatar"
                src="${getImage(chat.ProfilePicture)}">

            <div class="forward-chat-info">

                <div class="forward-chat-name">

                    ${formattedName}

                </div>

                <div class="forward-chat-last">

                    Tap to forward

                </div>

            </div>

            <div class="forward-check">

                <i class="fa-solid fa-check"></i>

            </div>

        `;

        item.onclick = () => {

            if (selectedForwardChats.has(chat.ChatId)) {

                selectedForwardChats.delete(chat.ChatId);

                item.classList.remove("selected");

            } else {

                selectedForwardChats.add(chat.ChatId);

                item.classList.add("selected");

            }

        };

        list.appendChild(item);

    });

}

document.getElementById("sendForwardBtn").onclick = () => {

    if (selectedForwardChats.size === 0) {

        alert("Select at least one chat");

        return;

    }

    socket.emit("forward_message", {

        messageId: selectedMessageId,

        targetChats: [...selectedForwardChats],

        senderId: Number(localStorage.getItem("userId"))

    });

    closeForwardModal();

};

document.getElementById("forwardSearch").addEventListener("input", function () {

    const value = this.value.toLowerCase();

    document
        .querySelectorAll(".forward-chat-item")
        .forEach(item => {

            const name = item
                .querySelector(".forward-chat-name")
                .innerText
                .toLowerCase();

            item.style.display =
                name.includes(value)
                    ? "flex"
                    : "none";

        });

});

function closeForwardModal() {

    document
        .getElementById("forwardPanel")
        .classList
        .add("hidden");

    selectedForwardChats.clear();

    document
        .getElementById("forwardChatList")
        .innerHTML = "";

    const search = document.getElementById("forwardSearch");

    if (search) {

        search.value = "";

    }

}

document.getElementById("starMsgBtn").addEventListener("click", async () => {

    try {

        const response = await fetch(`${API}/chat/star`, {

            method: "POST",

            headers: {

                "Content-Type": "application/json",

                Authorization: `Bearer ${token}`

            },

            body: JSON.stringify({

                messageId: selectedMessageId

            })

        });

        const result = await response.json();
        messageMenu.classList.add("hidden");

        const messageDiv = document.querySelector(
            `[data-message-id="${selectedMessageId}"]`
        );

        messageDiv.dataset.starred =
            result.starred ? "1" : "0";

        const bubble = messageDiv.querySelector(".msg-content-bubble");

        let badge = bubble.querySelector(".wa-star-badge");

        if (result.starred) {

            if (!badge) {

                bubble.insertAdjacentHTML(
                    "beforeend",
                    `
            <div class="wa-star-badge">
                <i class="fa-solid fa-star"></i>
            </div>
            `
                );

            }

        } else {

            badge?.remove();

        }

    }
    catch (err) {

        console.log(err);

    }

});

document
    .getElementById("openStarredMessages")
    .addEventListener("click", () => {

        sections.forEach(section => {
            section.classList.add("hidden");
        });

        document
            .getElementById("starred-panel")
            .classList.remove("hidden");

        dropdownMenu.classList.remove("show");

        loadStarredMessages();

    });

document
    .getElementById("backFromStarred")
    .addEventListener("click", () => {

        document
            .getElementById("starred-panel")
            .classList.add("hidden");

        document
            .getElementById("chat-panel")
            .classList.remove("hidden");

    });

async function loadStarredMessages() {

    try {

        const response = await fetch(`${API}/chat/starred`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const messages = await response.json();

        const container = document.getElementById("starredMessagesList");

        container.innerHTML = "";

        const currentUserId = Number(localStorage.getItem("userId"));

        messages.forEach(msg => {

            let fromName;
            let toName;

            const senderId = Array.isArray(msg.SenderId)
                ? Number(msg.SenderId[0])
                : Number(msg.SenderId);

            if (senderId === currentUserId) {

                fromName = "You";
                toName = msg.ReceiverName;

            } else {

                fromName = msg.SenderName;
                toName = "You";

            }

            container.innerHTML += `

                <div class="starred-card" onclick="openStarredMessage(${msg.ChatId}, ${msg.Id})">

                    <div class="star-top">

                        <img
                            src="${getImage(msg.ProfilePicture)}"
                            class="star-avatar">

                        <div class="star-info">

                            <b>
                                ${fromName}
                                <i class="fa-solid fa-arrow-right"></i>
                                ${toName}
                            </b>

                            <div class="star-date">
                                ${new Date(msg.CreatedAt).toLocaleDateString()}
                            </div>

                        </div>

                    </div>

                    <div class="star-preview">

                        ${buildMessageHtml(
                msg,
                Number(msg.SenderId) === currentUserId
            )}

                    </div>

                </div>

            `;

        });

    } catch (err) {

        console.log(err);

    }

}

async function openStarredMessage(chatId, messageId) {

    currentChatId = chatId;

    document
        .getElementById("starred-panel")
        .classList.add("hidden");

    document
        .getElementById("chat-panel")
        .classList.remove("hidden");

    await loadMessages(chatId);

    const chat = allChats.find(c => c.ChatId == chatId);
    await openChat(chat);

    const msg = document.getElementById(`msg-${messageId}`);

    if (msg) {

        msg.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

        const bubble = msg.querySelector(".msg-content-bubble");

        bubble.classList.add("highlight-star");

        setTimeout(() => {
            bubble.classList.remove("highlight-star");
        }, 1800);
    }

}

document.querySelector("#starred-panel .search-box input")?.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    const cards = document.querySelectorAll(".starred-card");

    cards.forEach(card => {
        const text = card.innerText.toLowerCase();
        if (text.includes(query)) {
            card.style.display = "block";
        } else {
            card.style.display = "none";
        }
    });
});

document.getElementById("markAllReadBtn").addEventListener("click", async () => {
    try {
        const dropdownMenu = document.getElementById("dropdownMenu");
        if (dropdownMenu) dropdownMenu.classList.remove("active");

        const response = await fetch(`${API}/chat/mark-all-read`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error("Failed to mark all as read");
        }

        showToast("All chats marked as read", {
            icon: "fa-check-double"
        });

        loadChats();

    } catch (error) {
        console.error("Error marking all chats as read:", error);
    }
});