const { sql } = require("../config/db");
const onlineUsers = require("../utils/onlineUsers");

exports.createChat = async (userIds) => {
    try {
        const [user1, user2] = userIds;

        const existingChat = await sql.query`
            SELECT cm1.ChatId
            FROM ChatMembers cm1
            JOIN ChatMembers cm2 
            ON cm1.ChatId = cm2.ChatId
            WHERE cm1.UserId = ${user1}
            AND cm2.UserId = ${user2}
        `;

        if (existingChat.recordset.length > 0) {
            return existingChat.recordset[0].ChatId;

        }

        const result = await sql.query`
            INSERT INTO Chats DEFAULT VALUES;
            SELECT SCOPE_IDENTITY() AS chatId;
        `;

        const chatId = result.recordset[0].chatId;

        for (const userId of userIds) {
            await sql.query`
                INSERT INTO ChatMembers (ChatId, UserId)
                VALUES (${chatId}, ${userId})
                `;
        }

        return chatId;

    } catch (error) {
        console.error("Error creating chat:", error);
    }
};

exports.getUserChats = async (userId) => {

    try {

        const result = await sql.query`

            SELECT

                c.Id AS ChatId,

                (
                    SELECT TOP 1 u.Id
                    FROM ChatMembers cm
                    JOIN Users u
                    ON u.Id = cm.UserId
                    WHERE cm.ChatId = c.Id
                    AND cm.UserId != ${userId}
                ) AS UserId,

                (
                    SELECT TOP 1

                        ISNULL(
                            ct.ContactName,
                            u.PhoneNumber
                        )

                    FROM ChatMembers cm

                    JOIN Users u
                    ON u.Id = cm.UserId

                    LEFT JOIN Contacts ct
                    ON ct.ContactUserId = u.Id
                    AND ct.UserId = ${userId}

                    WHERE cm.ChatId = c.Id
                    AND cm.UserId != ${userId}

                ) AS Username,

                (
                    SELECT TOP 1 u.ProfilePicture
                    FROM ChatMembers cm
                    JOIN Users u
                    ON u.Id = cm.UserId
                    WHERE cm.ChatId = c.Id
                    AND cm.UserId != ${userId}
                ) AS ProfilePicture,

                (
                    SELECT TOP 1 u.LastSeen
                    FROM ChatMembers cm
                    JOIN Users u
                    ON u.Id = cm.UserId
                    WHERE cm.ChatId = c.Id
                    AND cm.UserId != ${userId}
                ) AS LastSeen,

                -- LAST MESSAGE
                (
                    SELECT TOP 1 m.MessageText
                    FROM Messages m

                    WHERE m.ChatId = c.Id

                    AND NOT EXISTS (
                        SELECT 1
                        FROM DeletedMessages dm
                        WHERE dm.MessageId = m.Id
                        AND dm.UserId = ${userId}
                    )

                    ORDER BY m.CreatedAt DESC

                ) AS lastMessage,

                (
                    SELECT TOP 1
                        CASE
                            WHEN sr.Id IS NOT NULL THEN 1
                            ELSE 0
                        END
                    FROM Messages m

                    LEFT JOIN StatusReplies sr
                    ON sr.MessageId = m.Id

                    WHERE m.ChatId = c.Id

                    AND NOT EXISTS (
                        SELECT 1
                        FROM DeletedMessages dm
                        WHERE dm.MessageId = m.Id
                        AND dm.UserId = ${userId}
                    )

                    ORDER BY m.CreatedAt DESC

                ) AS IsStatusReply,

                -- LAST MESSAGE TIME
                (
                    SELECT TOP 1 m.CreatedAt
                    FROM Messages m

                    WHERE m.ChatId = c.Id

                    AND NOT EXISTS (
                        SELECT 1
                        FROM DeletedMessages dm
                        WHERE dm.MessageId = m.Id
                        AND dm.UserId = ${userId}
                    )

                    ORDER BY m.CreatedAt DESC

                ) AS lastMessageTime,

                -- LAST MESSAGE SENDER
                (
                    SELECT TOP 1 m.SenderId
                    FROM Messages m

                    WHERE m.ChatId = c.Id

                    AND NOT EXISTS (
                        SELECT 1
                        FROM DeletedMessages dm
                        WHERE dm.MessageId = m.Id
                        AND dm.UserId = ${userId}
                    )

                    ORDER BY m.CreatedAt DESC

                ) AS SenderId,

                -- LAST MESSAGE DELIVERED
                (
                    SELECT TOP 1 m.IsDelivered
                    FROM Messages m

                    WHERE m.ChatId = c.Id

                    AND NOT EXISTS (
                        SELECT 1
                        FROM DeletedMessages dm
                        WHERE dm.MessageId = m.Id
                        AND dm.UserId = ${userId}
                    )

                    ORDER BY m.CreatedAt DESC

                ) AS IsDelivered,

                -- LAST MESSAGE SEEN
                (
                    SELECT TOP 1 m.IsSeen
                    FROM Messages m

                    WHERE m.ChatId = c.Id

                    AND NOT EXISTS (
                        SELECT 1
                        FROM DeletedMessages dm
                        WHERE dm.MessageId = m.Id
                        AND dm.UserId = ${userId}
                    )

                    ORDER BY m.CreatedAt DESC

                ) AS IsSeen,

                -- UNREAD COUNT
                (
                    SELECT COUNT(*)
                    FROM Messages m

                    WHERE m.ChatId = c.Id
                    AND m.SenderId != ${userId}
                    AND m.IsSeen = 0

                    AND NOT EXISTS (
                        SELECT 1
                        FROM DeletedMessages dm
                        WHERE dm.MessageId = m.Id
                        AND dm.UserId = ${userId}
                    )

                ) AS unread,

                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM FavouriteChats fc
                        WHERE fc.ChatId = c.Id
                        AND fc.UserId = ${userId}
                    )
                    THEN 1
                    ELSE 0
                END AS IsFavourite

            FROM Chats c

            WHERE EXISTS (

                SELECT 1
                FROM ChatMembers cm
                WHERE cm.ChatId = c.Id
                AND cm.UserId = ${userId}

            )

            ORDER BY lastMessageTime DESC

        `;

        return result.recordset;

    } catch (error) {

        console.error("Error fetching user chats:", error);

        return [];
    }
};

exports.sendMessage = async (chatId, senderId, message) => {
    try {

        const receiver = await sql.query`
            SELECT TOP 1 UserId FROM ChatMembers
            WHERE ChatId = ${chatId}
            AND UserId != ${senderId}
        `;

        const receiverId = receiver.recordset[0]?.UserId ?? null;
        const delivered = receiverId && onlineUsers[receiverId] ? 1 : 0;

        const result = await sql.query`
            INSERT INTO Messages (ChatId, SenderId, MessageText, IsDelivered, IsSeen)
            OUTPUT INSERTED.Id, INSERTED.ChatId, INSERTED.SenderId,
                   INSERTED.MessageText, INSERTED.IsDelivered, INSERTED.IsSeen,
                   INSERTED.CreatedAt
            VALUES (${chatId}, ${senderId}, ${message}, 0, 0);
        `;

        return result.recordset[0];

    } catch (error) {
        console.error("Error while sending message:", error);
        throw error;
    }
};


exports.getMessages = async (chatId, userId) => {
    try {

        const result = await sql.query`
            SELECT m.*,
            s.UserId AS StatusOwnerId,
            s.Caption,
            u.Username AS StatusUsername,
            CASE
                WHEN sr.Id IS NOT NULL
                THEN 1
                ELSE 0
            END AS IsStatusReply,
            sr.StatusId
            FROM Messages m
            LEFT JOIN StatusReplies sr
            ON sr.MessageId = m.Id
            LEFT JOIN Status s
            ON s.Id = sr.StatusId
            LEFT JOIN Users u
            ON u.Id = s.UserId
            WHERE m.ChatId = ${chatId}
            AND NOT EXISTS (
                SELECT 1
                FROM DeletedMessages dm
                WHERE dm.MessageId = m.Id
                AND dm.UserId = ${userId}
            )

            ORDER BY m.CreatedAt ASC
        `;

        return result.recordset;

    } catch (error) {
        console.error("Error fetching messages:", error);
        return [];
    }
};

exports.togglefav = async (userId, chatId) => {
    const existingFav = await sql.query`
        SELECT 1 FROM FavouriteChats
        WHERE UserId = ${userId}
        AND ChatId = ${chatId}
    `;

    if (existingFav.recordset.length > 0) {

        await sql.query`

            DELETE FROM FavouriteChats

            WHERE UserId = ${userId}
            AND ChatId = ${chatId}
        `;

        return false;
    }

    await sql.query`

        INSERT INTO FavouriteChats (
            UserId,
            ChatId
        )

        VALUES (
            ${userId},
            ${chatId}
        )
    `;

    return true;
};

