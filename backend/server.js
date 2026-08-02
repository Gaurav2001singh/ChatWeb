require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const path = require("path");

const { connectDB, sql } = require("./config/db");
const { log } = require("console");
const contactRoutes = require("./routes/contactRoutes");
const statusPrivacyRoutes = require("./routes/statusPrivacyRoutes");
const mediaRoutes = require("./routes/mediaRoutes");

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

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/status", require("./routes/statusRoutes"));
app.use("/api/upload", require("./routes/uploadRoutes"));
app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/calls", require("./routes/callRoutes"));
app.use("/api/contact", contactRoutes);
app.use("/api/status", statusPrivacyRoutes);
app.use("/api/media", mediaRoutes);

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

            socket.join(String(userId));
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
            io.emit("call_list_update");

            console.log("Online Users:", onlineUsers);

        } catch (error) {

            console.log("Register Error:", error);
        }
    });

    socket.on("call-user", async (data) => {
        const { callerId, receiverId, offer, callType, callId, callerName, callerImage } = data;

        const receiverSocketid = onlineUsers[receiverId];
        if (!receiverSocketid) {
            return;
        }
        try {
            const userQuery = await sql.query`
                SELECT Username, ProfilePicture FROM Users WHERE Id = ${callerId}
            `;
            const caller = userQuery.recordset[0];

            let correctedImage = null;
            let correctedName = "Incoming Call";

            if (caller) {
                correctedName = caller.Username;
                correctedImage = caller.ProfilePicture;

                if (correctedImage && correctedImage.startsWith("/uploads/") && !correctedImage.includes("/profile_pictures/")) {
                    correctedImage = correctedImage.replace("/uploads/", "/uploads/profile_pictures/");
                }
            }

            io.to(receiverSocketid).emit("incoming-call", {
                callerId,
                offer,
                callType,
                callId,
                callerName: correctedName,
                callerImage: correctedImage
            });

        } catch (error) {
            console.error("Error broadcasting incoming call parameters:", error);
        }
    });

    socket.on("answer-call", (data) => {
        const { callerId, answer } = data;

        const callerSocketId = onlineUsers[callerId];
        if (!callerSocketId) {
            return;
        }

        io.to(callerSocketId).emit("call-accepted", {
            answer
        });
    });

    socket.on("ice-candidate", (data) => {
        const { receiverId, candidate } = data;

        const receiverSocketid = onlineUsers[receiverId];

        if (!receiverSocketid) {
            return;
        }

        io.to(receiverSocketid).emit("ice-candidate", {
            candidate
        });
    });


    socket.on("missed-call", (data) => {
        const callerSocketId = onlineUsers[data.callerId];

        if (!callerSocketId)
            return;

        io.to(callerSocketId)
            .emit("call-missed");
    })

    socket.on("end-call", (data) => {

        const receiverSocketId = onlineUsers[data.receiverId];

        if (receiverSocketId) {

            io.to(receiverSocketId)
                .emit("call-ended");
        }

    });

    socket.on("reject-call", (data) => {
        const callerSocketId = onlineUsers[data.callerId];
        if (!callerSocketId)
            return;

        io.to(callerSocketId).emit("call-rejected");
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
                senderId,
                messageType,
                mediaUrl,
                duration,
                replyToMsgId
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
                MessageType,
                MediaUrl,
                Duration,
                IsDelivered,
                IsSeen,
                ReplyToMsgId

            )

            OUTPUT
                INSERTED.Id,
                INSERTED.CreatedAt,
                INSERTED.IsDelivered,
                INSERTED.IsSeen,
                INSERTED.Duration,
                INSERTED.ReplyToMsgId

            VALUES (

                ${chatId},
                ${senderId},
                ${message},
                ${messageType || 'text'},
                ${mediaUrl},
                ${duration || null},
                ${receiverOnline ? 1 : 0},
                ${receiverInSameChat ? 1 : 0},
                ${replyToMsgId || null}
            )
        `;

            const msg =
                insertedMessage.recordset[0];

            const fullMessage = await sql.query`
    SELECT
        m.*,
        
        -- Get Sender's Display Name
        ISNULL(ct.ContactName, ISNULL(NULLIF(su.Username, ''), su.PhoneNumber)) AS SenderName,
        su.ProfilePicture AS SenderProfilePicture,

        CASE
            WHEN rm.DeletedForEveryone = 1 THEN 'This message was deleted'
            ELSE rm.MessageText
        END AS ReplyMessage,
        
        ru.Username AS ReplySenderName

    FROM Messages m
    JOIN Users su ON su.Id = m.SenderId
    LEFT JOIN Contacts ct ON ct.ContactUserId = su.Id AND ct.UserId = ${receiverId}
    LEFT JOIN Messages rm ON rm.Id = m.ReplyToMsgId
    LEFT JOIN Users ru ON ru.Id = rm.SenderId
    WHERE m.Id = ${msg.Id}
`;

            const messageData = fullMessage.recordset[0];

            const payload = {
                ...messageData,
                messageId: msg.Id,
                chatId,
                senderId,
                senderName: messageData.SenderName || "User",
                senderAvatar: messageData.SenderProfilePicture,
                messageText: messageData.MessageText,
                duration: msg.Duration,
                isStatusReply: data.isStatusReply || (messageType === "status_reply" || !!data.statusId),
                statusUsername: data.statusUsername || "",
                StatusCaption: data.statusCaption || data.Caption || "Photo",
                statusId: data.statusId || null,
                StatusOwnerId: data.StatusOwnerId || null,
                ReplyToMsgId: msg.ReplyToMsgId,
                time: msg.CreatedAt,
                isDelivered: msg.IsDelivered,
                isSeen: msg.IsSeen
            };

            // 1. Emit to the active chat room (for open windows)
            io.to(String(chatId)).emit("receive_message", payload);

            // 2. FIX: Emit directly to receiver's personal room (for notifications when chat isn't opened)
            if (receiverId) {
                io.to(String(receiverId)).emit("receive_message", payload);
            }

            // 3. Update sidebar for receiver
            const receiverSocketId = onlineUsers[receiverId];
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("chat_list_update");
            }

            // 4. Update delivery status
            if (receiverOnline) {
                io.to(String(chatId)).emit("messages_delivered", { chatId });
            }

            // 5. Update seen status
            if (receiverInSameChat) {
                io.to(String(chatId)).emit("messages_seen", { chatId });
            }

        } catch (error) {

            console.log(
                "Send Message Error:",
                error
            );
        }
    });

    socket.on("message_reaction", async (data) => {
        try {
            const { messageId, emoji, chatId } = data;

            const targetReactionValue = emoji === 'REMOVE' ? null : emoji;

            await sql.query`
                UPDATE Messages
                SET Reaction = ${targetReactionValue}
                WHERE Id = ${messageId}
            `;

            io.to(String(chatId)).emit("message_reaction_updated", {
                messageId: Number(messageId),
                emoji: targetReactionValue,
                chatId: Number(chatId)
            });

        } catch (error) {
            console.error("Failed to commit and broadcast message reaction updates:", error);
        }
    });

    socket.on("forward_message", async (data) => {

        try {

            const original = await sql.query`

            SELECT *

            FROM Messages

            WHERE Id=${data.messageId}

        `;

            if (!original.recordset.length) return;

            const msg = original.recordset[0];

            for (const chatId of data.targetChats) {

                const receiver = await sql.query`

                SELECT TOP 1 UserId
                FROM ChatMembers
                WHERE ChatId = ${chatId}
                AND UserId != ${data.senderId}

                `;

                const receiverId = receiver.recordset[0]?.UserId ?? null;

                const delivered =
                    receiverId && onlineUsers[receiverId]
                        ? 1
                        : 0;

                const inserted = await sql.query`

                INSERT INTO Messages(

                    ChatId,
                    SenderId,
                    MessageText,
                    MessageType,
                    MediaUrl,
                    Duration,
                    IsForwarded,
                    ForwardedFromMessageId,
                    IsDelivered,
                    IsSeen

                )

                OUTPUT INSERTED.*

                VALUES(

                    ${chatId},
                    ${data.senderId},
                    ${msg.MessageText},
                    ${msg.MessageType},
                    ${msg.MediaUrl},
                    ${msg.Duration},
                    1,
                    ${msg.Id},
                    ${delivered},
                    0

                )

            `;
                const newMsg = inserted.recordset[0];

                io.to(String(chatId)).emit("receive_message", {
                    ...newMsg,
                    messageId: newMsg.Id,
                    chatId: newMsg.ChatId,
                    senderId: newMsg.SenderId,
                    message: newMsg.MessageText,
                    messageType: newMsg.MessageType,
                    mediaUrl: newMsg.MediaUrl,
                    duration: newMsg.Duration,
                    time: newMsg.CreatedAt,
                    isForwarded: newMsg.IsForwarded,
                    forwardedFromMessageId: newMsg.ForwardedFromMessageId,
                    isDelivered: newMsg.isDelivered,
                    isSeen: newMsg.isSeen

                });

                if (delivered) {

                    await sql.query`

                        UPDATE Messages
                        SET IsDelivered = 1
                        WHERE Id = ${newMsg.Id}

                    `;

                    io.to(String(data.senderId)).emit("messages_delivered_global", {
                        userId: receiverId
                    });

                }

                const members = await sql.query`

                    SELECT UserId
                    FROM ChatMembers
                    WHERE ChatId=${chatId}

                    `;

                for (const member of members.recordset) {

                    io.to(String(member.UserId))
                        .emit("chat_list_update");

                }


            }

        }
        catch (err) {

            console.log(err);

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

            await sql.query`
                DELETE FROM UnreadChats
                WHERE ChatId = ${chatId}
                AND UserId = ${viewerUserId}
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

            for (const member of members.recordset) {

                io.to(String(member.UserId)).emit("chat_list_update");

            }

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
