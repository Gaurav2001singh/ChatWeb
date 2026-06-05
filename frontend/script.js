console.log("Chat App Started");

const API = "http://localhost:5000/api";
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

let selectedMessageId = null;
let selectedMessageText = "";
let selectedSenderId = null;

let isResizing = false;
let currentChatId = null;
let currentUserProfileId = null;
let typingTimeout;
let isTyping = false;
const typingUsers = {};

function logout() {
    localStorage.clear();
    window.location.href = "accounts.html";
}

let logoutBtn = document.getElementById("logout");
logoutBtn.addEventListener("click", logout)

let socket;

function initSocket(userId) {
    socket = io("http://localhost:5000");

    socket.emit("register", userId);

    socket.on("receive_message", (data) => {
        const currentUserId = Number(localStorage.getItem("userId"));

        loadChats();

        if (data.chatId != currentChatId) {
            return;
        }

        if (data.senderId !== currentUserId && data.chatId === currentChatId) {
            socket.emit("seen_messages", {
                chatId: data.chatId,
                viewerUserId: currentUserId
            });
        }

        const div = document.createElement("div");
        div.classList.add("message");
        div.dataset.messageId = data.messageId;


        if (data.senderId === currentUserId) {
            div.classList.add("sent");
        } else {
            div.classList.add("received");

        }

        const time =
            new Date(data.time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            });

        let statusReplyHtml = "";

        if (data.isStatusReply) {

            statusReplyHtml = `
                    <div class="status-reply-user">
                ${Number(msg.StatusOwnerId) === currentUserId
                    ? "You"
                    : msg.StatusUsername
                } · Status

            </div>

            <div class="status-reply-text">
                ${data.statusCaption || "Photo"}
            </div>
            `;
        }

        div.innerHTML = `

            ${statusReplyHtml}
            <p>${data.message}</p>

            <span class="msg-meta">

                ${time}

              ${data.senderId === currentUserId ?
                ` <i class=" fa-solid ${data.isSeen ? "fa-check-double seen"
                    : data.isDelivered ? "fa-check-double" : "fa-check"}"></i> ` : ""}</span>
            `;

        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        div.addEventListener("contextmenu", (e) => {

            e.preventDefault();

            const messageId = div.dataset.messageId;

            const isMyMessage =
                data.senderId ===
                Number(localStorage.getItem("userId"));

            if (!isMyMessage) {

                socket.emit("delete_message_me", {
                    messageId,
                    userId: Number(localStorage.getItem("userId"))
                });

                return;
            }

            const deleteEveryone =
                confirm(
                    "OK = Delete for everyone\nCancel = Delete for me"
                );

            if (deleteEveryone) {

                socket.emit("delete_message_everyone", {
                    messageId,
                    chatId: currentChatId
                });

            } else {

                socket.emit("delete_message_me", {
                    messageId,
                    userId: Number(localStorage.getItem("userId"))
                });
            }
        });

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
        const messages = document.querySelectorAll(".message");

        messages.forEach(msg => {
            if (msg.dataset.messageId == messageId) {

                const p = msg.querySelector("p");

                p.innerText = "This message was deleted";

                p.classList.add("deleted-msg");
            }
        });

        loadChats();
    });

    socket.on("message_deleted_me", ({ messageId }) => {

        const messages =
            document.querySelectorAll(".message");

        messages.forEach(msg => {

            if (msg.dataset.messageId == messageId) {

                msg.remove();
            }
        });

        loadChats();
    });

    socket.on("chat_list_update", () => {
        loadChats();
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

    return `http://localhost:5000${img}`;
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
}

resizerPanel.addEventListener("mousedown", () => {
    isResizing = true;
})

document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    leftPanel.style.width = e.clientX + "px";
});

document.addEventListener("mouseup", () => {
    isResizing = false;
});

const leftSidebarBtns = document.querySelectorAll(".left-sidebar button");

const sections = document.querySelectorAll(`
    #chat-panel,
    #calls-panel,
    #contact-panel,
    #status-panel,
    #channels-panel,
    #communities-panel,
    #archived-panel,
    #meta-panel,
    #media-panel,
    #profile-panel,
    #profile-edit-panel
`);

leftSidebarBtns.forEach((button) => {

    button.addEventListener("click", () => {

        leftSidebarBtns.forEach((btn) => {
            btn.classList.remove("active");
        });

        button.classList.add("active");

        sections.forEach((section) => {
            section.classList.add("hidden");
        });

        const sectionId = button.dataset.section;

        if (sectionId) {
            const targetSection = document.getElementById(sectionId);

            if (targetSection) {
                targetSection.classList.remove("hidden");
            }
        }
    });

});

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
document.getElementById("groupFilter").addEventListener("click", () => {
    activeFilter = "groups";
    loadChats();
});

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
        let filteredChats = chats;

        document.getElementById("unreadCount").innerText = chats.filter(chat => Number(chat.unread) > 0).length;

        if (activeFilter === "unread") {
            filteredChats = chats.filter(chat => Number(chat.unread) > 0);
        }

        if (activeFilter === "favourites") {
            filteredChats = chats.filter(chat => chat.IsFavourite === 1);
        }

        if (activeFilter === "groups") {
            filteredChats = [];
        }

        const activeChat = currentChatId;
        chatContainer.innerHTML = "";

        const emptyMessage =
            document.getElementById("emptyChatsMessage");

        if (filteredChats.length === 0) {

            emptyMessage.style.display = "block";

            if (activeFilter === "unread") {

                emptyMessage.innerText = "No unread chats yet";

            } else if (activeFilter === "favourites") {

                emptyMessage.innerText = "No favourite chats yet";

            } else if (activeFilter === "groups") {
                emptyMessage.innerText = "No group chats yet.\n Feature is not available at the moment.\n Please check back later\n OR\n will notify you when its available.\n Thank You for your patience ";

            }
            else {

                emptyMessage.innerText = "No chats available";
            }

            chatContainer.innerHTML = "";

            return;
        }

        emptyMessage.style.display = "none";

        filteredChats.forEach(chat => {
            const div = document.createElement("div");
            div.classList.add("chat-item");

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

            div.innerHTML = `
               <img src="${img}" class="chat-avatar">
                <div class="chat-info">
                    <div class="top-row">
                        <h4 class="chat-name">${formattedName}</h4>

                        <i class="fa-heart ${chat.IsFavourite ? "fa-solid" : "fa-regular"} favourite-heart"></i>

                        <div class="right-side">
                            <span class="chat-time">${time}</span>
                        </div>
                    </div>

                    <div class="bottom-row">
                        <p class="last-msg">

                        ${Number(chat.SenderId) === currentUserId
                    ? `
                            <i class="
                                fa-solid
                                ${chat.IsSeen
                        ? "fa-check-double seen"
                        : chat.IsDelivered
                            ? "fa-check-double"
                            : "fa-check"
                    }
                            "></i>
                        `
                    : ""
                }

                        ${typingUsers[chat.ChatId]
                    ? `<span class="typing-text">typing...</span>`
                    : (chat.IsStatusReply ? "↩ Replied to status" : (chat.lastMessage || "No messages"))
                }

                        </p>

                    ${Number(chat.unread) > 0 ? `
                    <span class="unread-count">
                        ${chat.unread}
                    </span>
                ` : ""}
                    </div>
                </div>

            `;

            div.addEventListener("click", () => {
                const oldChats = document.querySelectorAll(".chat-item");
                oldChats.forEach(chat => chat.classList.remove("active"));

                div.classList.add("active");

                const oldChatId = currentChatId;

                if (oldChatId) {
                    socket.emit("leave_chat", {
                        userId: currentUserId
                    });
                }

                currentChatId = chat.ChatId;

                socket.emit("join_chat", {
                    chatId: chat.ChatId,
                    userId: currentUserId
                });

                loadMessages(currentChatId);

                currentUserProfileId = chat.UserId

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


                document.querySelector(".chat-area")
                    .classList.add("chat-open");

                document.querySelector(".left")
                    .classList.add("hidden-mobile");
            });

            chatContainer.appendChild(div);

            const star = div.querySelector(".favourite-heart");

            star.addEventListener("click", async (e) => {
                e.stopPropagation();
                try {

                    await fetch(`${API}/chat/favourite`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },

                        body: JSON.stringify({
                            chatId: chat.ChatId
                        })
                    }
                    );

                    loadChats();

                } catch (error) {

                    console.log(error);
                }
            })
        });

    } catch (error) {
        console.error("Error loading chats", error);
    }
};

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
            window.location.href = "regsiter.html";
            return;
        }

        const messages = await response.json();
        messagesContainer.innerHTML = "";

        const currentUserId = Number(localStorage.getItem("userId"));

        messages.forEach(msg => {
            const div = document.createElement("div");
            div.classList.add("message");
            div.dataset.messageId = msg.Id;

            const senderId = Number(msg.SenderId);

            if (senderId === currentUserId) {
                div.classList.add("sent");
            } else {
                div.classList.add("received");
            }

            const tick =
                senderId === currentUserId
                    ? msg.IsSeen
                        ? `<i class="fa-solid fa-check-double seen"></i>`

                        : msg.IsDelivered
                            ? `<i class="fa-solid fa-check-double"></i>`

                            : `<i class="fa-solid fa-check"></i>`

                    : "";

            let statusReplyHtml = "";

            if (msg.IsStatusReply) {

                statusReplyHtml = `

                <div class="status-reply-preview">

                   <div class="status-reply-user">

                        ${Number(msg.StatusOwnerId || data.statusOwnerId)
                        === currentUserId
                        ? "You"
                        : (msg.StatusUsername || data.statusUsername)
                    } · Status

                    </div>

                    <div class="status-reply-text">

                        ${msg.Caption || "Photo"}

                    </div>

                </div>

            `;
            }
            div.innerHTML = `

                ${statusReplyHtml}

                <p class="${msg.DeletedForEveryone ? "deleted-msg" : ""}">
                    ${msg.MessageText}
                </p>

                <span class="msg-meta">

                    ${new Date(msg.CreatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            })}

                    ${tick}

                </span>
            `;
            messagesContainer.appendChild(div);

            div.addEventListener("contextmenu", (e) => {

                e.preventDefault();

                selectedMessageId = div.dataset.messageId;

                selectedMessageText =
                    div.querySelector("p").innerText;

                selectedSenderId =
                    Number(msg.SenderId);

                messageMenu.style.left = e.pageX + "px";
                messageMenu.style.top = e.pageY + "px";

                messageMenu.classList.remove("hidden");

                const currentUserId =
                    Number(localStorage.getItem("userId"));

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
}

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

        const myUserId =
            Number(localStorage.getItem("userId"));

        const res = await fetch(
            `http://localhost:5000/api/status?userId=${myUserId}`
        );

        const statuses = await res.json();

        const statusList = document.querySelector(".status-list");

        statusList.innerHTML = "";

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

const newStatusBtn = document.querySelector(".new-status-btn");

newStatusBtn.addEventListener("click", (e) => {

    e.stopPropagation();

    statusInput.click();
});

async function addView(statusId) {

    try {

        await fetch(
            "http://localhost:5000/api/status/view",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
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
                    <source src="http://localhost:5000${status.MediaUrl}">
                </video>
            </div>

            <div class="status-main">
                <video id="viewerMedia" autoplay playsinline>
                    <source src="http://localhost:5000${status.MediaUrl}">
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
                <img id="viewerBg" src="http://localhost:5000${status.MediaUrl}">
            </div>

            <div class="status-main">
                <img id="viewerMedia" src="http://localhost:5000${status.MediaUrl}">
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

    const myUserId = Number(localStorage.getItem("userId"));
    const NewStatusBtn = document.querySelector(".new-status-btn");
    const deleteStatus = document.querySelector(".delete-status");
    const replyBox = document.querySelector(".status-reply-box");
    const viewBox = document.querySelector(".status-view-count");
    const viewCount = document.getElementById("viewCount");


    if (status.UserId === myUserId) {

        newStatusBtn.style.display = "flex";
        deleteStatus.style.display = "flex";
        viewBox.style.display = "flex";
        replyBox.style.display = "none";
        document.getElementById("viewCountText")
            .innerText = status.ViewCount || 0;
        viewCount.innerHTML = `Viewed By ${status.ViewCount || 0}`;

    } else {
        newStatusBtn.style.display = "none";
        deleteStatus.style.display = "none";
        viewBox.style.display = "none";
        replyBox.style.display = "flex";

    }

    // startProgress();
};

document.querySelector(".status-view-count")
    .addEventListener("click", async () => {

        const status =
            currentStatuses[currentIndex];

        const myUserId =
            Number(localStorage.getItem("userId"));

        if (status.UserId !== myUserId) {
            return;
        }

        const res = await fetch(
            `http://localhost:5000/api/status/views/${status.Id}?userId=${myUserId}`
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
            let rawName = view.ContactName || view.Username || view.PhoneNumber || "user";
            let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

            list.innerHTML += `

            <div class="status-view-user">

                <img src="http://localhost:5000${view.ProfilePicture}">

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
}

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
}

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
}

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

}

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
            "http://localhost:5000/api/upload/status",
            {
                method: "POST",
                body: formData,
                signal: controller.signal
            }
        );

        clearTimeout(timeout);

        const uploadData =
            await uploadRes.json();

        const caption =
            document.getElementById("previewCaption").value;

        await fetch(
            "http://localhost:5000/api/status",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({

                    userId: Number(
                        localStorage.getItem("userId")
                    ),

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

document.getElementById("sendReplyBtn")
    .addEventListener("click", async () => {

        const message =
            document.getElementById("replyInput").value;

        if (!message.trim()) return;

        const status =
            currentStatuses[currentIndex];

        const senderId =
            Number(localStorage.getItem("userId"));

        try {

            await fetch(
                "http://localhost:5000/api/status/reply",
                {

                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({

                        statusId: status.Id,

                        senderId,

                        message
                    })
                }
            );

            document.getElementById("replyInput").value = "";

        } catch (error) {

            console.log(error);

        }
    });

function closePreview() {

    document.querySelector(".status-preview")
        .classList.add("hidden");

    document.getElementById("previewCaption").value = "";

    selectedStatusFile = null;
}

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

        await fetch(`http://localhost:5000/api/status/${status.Id}`, {
            method: "DELETE"
        });

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

async function sendMessage() {

    const text = messageInput.value.trim();

    if (!text || !currentChatId) return;

    socket.emit("send_message", {
        chatId: currentChatId,
        message: text,
        senderId: Number(localStorage.getItem("userId"))
    });

    messageInput.value = "";

    isTyping = false;

    socket.emit("stop_typing", {
        chatId: currentChatId,
        senderId: Number(localStorage.getItem("userId"))
    });
}

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

async function updateProfilePicture() {
    const profilePicture = document.getElementById("profilePicture").files[0];

    const formData = new FormData();
    formData.append("profile", profilePicture);

    await fetch(`${API}/auth/update-profile-picture`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${token}`
        },
        body: formData
    });

    alert("Profile Updated")
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
        document.getElementById("myStatusInput").src = image;
        document.getElementById("my-profile-pic").src = image;
        document.getElementById("my-username").innerText = user.Username || "You"
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

        await fetch(`${API}/chat/create`, {

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
                    document.getElementById("chatUsername").innerText = formattedName;
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
})


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

        let rawName = user.ContactName || user.Username || user.PhoneNumber || "user";
        let formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
        document.getElementById("modalName").innerText = formattedName;
        document.getElementById("modalPhone").innerText = user.PhoneNumber || "No Number";
        document.getElementById("modalAbout").innerText = user.About || "Hey there! I'm using ChatWeb";

        document.getElementById("modalImg").src = image;

    } catch (error) {
        console.error("Error loading user profile", error);
    }
};

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
})

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
})

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
})

const backToProfile = document.getElementById("back-to-profile");
backToProfile.addEventListener("click", () => {
    hideAllPanels();
    profilePanel.classList.remove("hidden");
});

function hideAllPanels() {
    chatPanel.classList.add("hidden");
    profilePanel.classList.add("hidden");
    profileEditPanel.classList.add("hidden");
}

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
}

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
            Authorization:
                `Bearer ${token}`
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