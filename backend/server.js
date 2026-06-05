require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const { connectDB, sql } = require("./config/db");
const { log } = require("console");
const contactRoutes = require("./routes/contactRoutes");

const onlineUsers = require("./utils/onlineUsers");
const activeChats = require("./utils/activeChats");
const lastSeenUsers = {};
global.onlineUsers = onlineUsers;
global.activeChats = activeChats;


const app = express();

app.use(cors({
    origin: "*",
}));

app.use(express.json());

app.use("/uploads", express.static("uploads"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/status", require("./routes/statusRoutes"));
app.use("/api/upload", require("./routes/uploadRoutes"));
app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/contact", contactRoutes);

app.get("/", (req, res) => {
    res.send("Server is working");
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});
app.set("io", io);

io.on("connection", (socket) => {

    socket.on("register", async (userId) => {

        try {

            socket.userId = userId;

            onlineUsers[userId] = socket.id;

            await sql.query`

                MERGE ActiveUsers AS target

                USING (
                    SELECT ${userId} AS UserId
                ) AS source

                ON target.UserId = source.UserId

                WHEN MATCHED THEN

                    UPDATE SET
                        IsOnline = 1,
                        LastActive = GETDATE()

                WHEN NOT MATCHED THEN

                    INSERT (
                        UserId,
                        IsOnline,
                        LastActive
                    )

                    VALUES (
                        ${userId},
                        1,
                        GETDATE()
                    );
            `;

            io.emit("user_status", {
                userId,
                status: "online"
            });

            await sql.query`
                UPDATE Messages
                SET IsDelivered = 1
                WHERE SenderId != ${userId}
                AND IsDelivered = 0
            `;

            io.emit("messages_delivered_global", {
                userId
            });

            io.emit("chat_list_update");

            console.log("Online Users:", onlineUsers);

        } catch (error) {

            console.log("Register Error:", error);
        }
    });

    socket.on("join_chat", ({ chatId, userId }) => {

        socket.join(String(chatId));

        activeChats[userId] = String(chatId);

        console.log("Active chats:", activeChats);
    });

    socket.on("typing", async ({ chatId, senderId }) => {

        try {

            const members = await sql.query`
                SELECT UserId
                FROM ChatMembers
                WHERE ChatId = ${chatId}
                AND UserId != ${senderId}
            `;

            const receiverId =
                members.recordset[0]?.UserId;

            const receiverSocketId =
                onlineUsers[receiverId];

            if (receiverSocketId) {

                io.to(receiverSocketId)
                    .emit("user_typing", {
                        senderId,
                        chatId
                    });
            }

        } catch (error) {

            console.log(error);
        }
    });

    socket.on("stop_typing", async ({ chatId, senderId }) => {

        try {

            const members = await sql.query`
                SELECT UserId
                FROM ChatMembers
                WHERE ChatId = ${chatId}
                AND UserId != ${senderId}
            `;

            const receiverId =
                members.recordset[0]?.UserId;

            const receiverSocketId =
                onlineUsers[receiverId];

            if (receiverSocketId) {

                io.to(receiverSocketId)
                    .emit("user_stop_typing", {
                        senderId,
                        chatId
                    });
            }

        } catch (error) {

            console.log(error);
        }
    });

    socket.on("send_message", async (data) => {

        try {

            const {
                chatId,
                message,
                senderId
            } = data;

            const members = await sql.query`

            SELECT UserId
            FROM ChatMembers

            WHERE ChatId = ${chatId}
            AND UserId != ${senderId}
        `;

            const receiverId =
                members.recordset[0]?.UserId;

            const receiverOnline =
                !!onlineUsers[receiverId];

            const receiverInSameChat =
                activeChats[receiverId] === String(chatId);

            const insertedMessage = await sql.query`

            INSERT INTO Messages (

                ChatId,
                SenderId,
                MessageText,
                IsDelivered,
                IsSeen

            )

            OUTPUT
                INSERTED.Id,
                INSERTED.CreatedAt,
                INSERTED.IsDelivered,
                INSERTED.IsSeen

            VALUES (

                ${chatId},
                ${senderId},
                ${message},
                ${receiverOnline ? 1 : 0},
                ${receiverInSameChat ? 1 : 0}
            )
        `;

            const msg =
                insertedMessage.recordset[0];

            io.to(String(chatId))
                .emit("receive_message", {

                    messageId: msg.Id,

                    chatId,

                    message,

                    senderId,

                    isStatusReply: msg.isStatusReply,

                    statusUsername: msg.statusUsername,

                    StatusCaption: msg.Caption,

                    statusId: msg.statusId,

                    time: msg.CreatedAt,

                    isDelivered: msg.IsDelivered,

                    isSeen: msg.IsSeen
                });

            const receiverSocketId =
                onlineUsers[receiverId];

            if (receiverSocketId) {

                io.to(receiverSocketId)
                    .emit("chat_list_update");
            }

            if (receiverOnline) {

                io.to(String(chatId))
                    .emit("messages_delivered", {
                        chatId
                    });
            }

            if (receiverInSameChat) {

                io.to(String(chatId))
                    .emit("messages_seen", {
                        chatId
                    });
            }

        } catch (error) {

            console.log(
                "Send Message Error:",
                error
            );
        }
    });

    socket.on("seen_messages", async (data) => {

        try {

            const {
                chatId,
                viewerUserId
            } = data;

            await sql.query`
                UPDATE Messages
                SET IsSeen = 1
                WHERE ChatId = ${chatId}
                AND SenderId != ${viewerUserId}
                AND IsSeen = 0
            `;

            io.to(String(chatId))
                .emit("messages_seen", {
                    chatId
                });

            const members = await sql.query`
                SELECT UserId
                FROM ChatMembers
                WHERE ChatId = ${chatId}
            `;

            members.recordset.forEach(member => {

                const socketId =
                    onlineUsers[member.UserId];

                if (socketId) {

                    io.to(socketId)
                        .emit("chat_list_update");
                }
            });

        } catch (error) {

            console.log(error);
        }
    });

    socket.on("delete_message_everyone", async (data) => {

        try {

            const {
                messageId,
                chatId,
                userId
            } = data;

            const result = await sql.query`
                SELECT SenderId
                FROM Messages
                WHERE Id = ${messageId}
            `;

            const msg =
                result.recordset[0];

            if (!msg || msg.SenderId != userId) {
                return;
            }

            await sql.query`
                UPDATE Messages
                SET DeletedForEveryone = 1,
                    MessageText = 'This message was deleted',
                    DeletedForEveryoneAt = GETDATE()
                WHERE Id = ${messageId}
            `;

            io.to(String(chatId))
                .emit("message_deleted_everyone", {
                    messageId
                });

            io.to(String(chatId))
                .emit("chat_list_update");

        } catch (error) {

            console.log(error);
        }
    });

    socket.on("delete_message_me", async (data) => {

        try {

            const {
                messageId,
                userId
            } = data;

            await sql.query`
                INSERT INTO DeletedMessages (
                    MessageId,
                    UserId
                )
                VALUES (
                    ${messageId},
                    ${userId}
                )
            `;

            io.to(socket.id)
                .emit("message_deleted_me", {
                    messageId
                });

            io.to(socket.id)
                .emit("chat_list_update");

        } catch (error) {

            console.log(error);
        }
    });

    socket.on("new_status", () => {
        io.emit("refresh_status");
    });

    socket.on("leave_chat", ({ userId }) => {

        delete activeChats[userId];

        console.log("Left chat:", activeChats);
    });

    socket.on("disconnect", async () => {

        try {

            let disconnectedUserId = null;

            for (const userId in onlineUsers) {

                if (
                    onlineUsers[userId] === socket.id
                ) {

                    disconnectedUserId = userId;

                    delete onlineUsers[userId];

                    delete activeChats[userId];

                    break;
                }
            }

            if (disconnectedUserId) {

                const lastSeen =
                    new Date();

                lastSeenUsers[
                    disconnectedUserId
                ] = lastSeen;

                await sql.query`
                    UPDATE Users
                    SET LastSeen = ${lastSeen}
                    WHERE Id = ${disconnectedUserId}
                `;

                await sql.query`
                    UPDATE ActiveUsers
                    SET
                        IsOnline = 0,
                        LastActive = GETDATE()
                    WHERE UserId = ${disconnectedUserId}
                `;

                io.emit("user_status", {

                    userId:
                        Number(disconnectedUserId),

                    status: "offline",

                    lastSeen
                });
            }

            console.log(
                "User Disconnected:",
                socket.id
            );

        } catch (error) {

            console.log("Disconnect Error:", error);
        }
    });
});

connectDB();

server.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});
