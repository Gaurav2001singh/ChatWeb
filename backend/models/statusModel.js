const { sql } = require("../config/db");

exports.createStatus = async (
    userId,
    mediaUrl,
    caption,
    type
) => {

    return await sql.query`

        INSERT INTO Status (
            UserId,
            MediaUrl,
            Caption,
            Type
        )

        VALUES (
            ${userId},
            ${mediaUrl},
            ${caption},
            ${type}
        )
    `;
};

exports.getStatuses = async (userId) => {

    return await sql.query`

        SELECT

            s.Id,
            s.UserId,
            s.MediaUrl,
            s.Caption,
            s.Type,

            CONVERT(VARCHAR, s.CreatedAt, 126) AS CreatedAt,

            ISNULL(
                c.ContactName,
                u.PhoneNumber
            ) AS ContactName,

            u.Username,
            u.ProfilePicture,

            (
                SELECT COUNT(*)
                FROM StatusViews sv
                WHERE sv.StatusId = s.Id
            ) AS ViewCount,

            CASE
                WHEN EXISTS(
                    SELECT 1
                    FROM StatusViews sv
                    WHERE sv.StatusId = s.Id
                    AND sv.ViewerId = ${userId}
                )
                THEN 1
                ELSE 0
            END AS IsViewed

        FROM Status s

        JOIN Users u
        ON s.UserId = u.Id
        LEFT JOIN Contacts c
        ON c.ContactUserId = u.Id
        AND c.UserId = ${userId}

        WHERE s.ExpireAt > GETDATE()

        AND

            (
                s.UserId = ${userId}

                OR

                EXISTS (

                    SELECT 1

                    FROM Contacts c1

                    JOIN Contacts c2
                    ON c1.UserId = c2.ContactUserId
                    AND c1.ContactUserId = c2.UserId

                    WHERE c1.UserId = ${userId}
                    AND c1.ContactUserId = s.UserId
                )
            )

        ORDER BY s.CreatedAt DESC
    `;
};

exports.getStatusById = async (statusId) => {
    return await sql.query`
        SELECT * FROM Status
        WHERE Id = ${statusId}
    `;
};

exports.deleteStatus = async (statusId) => {
    return await sql.query`
        DELETE FROM Status
        WHERE Id = ${statusId}
    `;
};

exports.addStatusView = async (statusId, viewerId) => {

    const existing = await sql.query`
    
        SELECT *
        FROM StatusViews
        
        WHERE StatusId = ${statusId}
        AND ViewerId = ${viewerId}
    `;

    if (existing.recordset.length === 0) {

        await sql.query`

            INSERT INTO StatusViews (
                StatusId,
                ViewerId
            )

            VALUES (
                ${statusId},
                ${viewerId}
            )
        `;
    }
};

exports.getStatusViews = async (currentUserId, statusId) => {

    return await sql.query`

         SELECT

            CONVERT(VARCHAR, sv.ViewedAt, 126) AS ViewedAt,

            u.Id,

            ISNULL(
                c.ContactName,
                u.PhoneNumber
            ) AS ContactName,

            u.Username,
            u.ProfilePicture

        FROM StatusViews sv

        JOIN Users u
            ON sv.ViewerId = u.Id

        LEFT JOIN Contacts c
            ON c.ContactUserId = u.Id
            AND c.UserId = ${currentUserId}

        WHERE sv.StatusId = ${statusId}

        ORDER BY sv.ViewedAt DESC
    `;
};

exports.createStatusReply = async (statusId, senderId, message) => {

    const statusRes = await sql.query`
        SELECT UserId FROM Status
        WHERE Id = ${statusId}
    `;
    if (
        statusRes.recordset.length === 0
    ) {
        throw new Error("Status not found");
    }

    const receiverId =
        statusRes.recordset[0].UserId;

    let chatResult = await sql.query`

        SELECT cm1.ChatId

        FROM ChatMembers cm1

        JOIN ChatMembers cm2
        ON cm1.ChatId = cm2.ChatId

        WHERE
        cm1.UserId = ${senderId}

        AND

        cm2.UserId = ${receiverId}
    `;

    let chatId;

    if (
        chatResult.recordset.length === 0
    ) {

        const newChat = await sql.query`

            INSERT INTO Chats
            DEFAULT VALUES;

            SELECT SCOPE_IDENTITY() AS ChatId;
        `;

        chatId =
            newChat.recordset[0].ChatId;

        await sql.query`

            INSERT INTO ChatMembers (
                ChatId,
                UserId
            )

            VALUES
            (
                ${chatId},
                ${senderId}
            ),

            (
                ${chatId},
                ${receiverId}
            )
        `;

    } else {

        chatId =
            chatResult.recordset[0].ChatId;
    }

    const receiverOnline =
        !!global.onlineUsers?.[receiverId];

    const receiverInSameChat =
        global.activeChats?.[receiverId]
        === String(chatId);

    const messageResult = await sql.query`

        INSERT INTO Messages (

            ChatId,
            SenderId,
            MessageText,
            IsDelivered,
            IsSeen

        )

        OUTPUT INSERTED.Id,
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

    const inserted =
        messageResult.recordset[0];

    await sql.query`

    INSERT INTO StatusReplies (

        StatusId,
        SenderId,
        Message,
        MessageId

    )

    VALUES (

        ${statusId},
        ${senderId},
        ${message},
        ${inserted.Id}
    )
`;

    const statusInfo = await sql.query`

            SELECT

                s.Caption,

                s.UserId,

                u.Username

            FROM Status s

            JOIN Users u
            ON u.Id = s.UserId

            WHERE s.Id = ${statusId}
        `;

    const statusData =
        statusInfo.recordset[0];

    return {

        chatId,

        receiverId,

        messageId: inserted.Id,

        createdAt: inserted.CreatedAt,

        isDelivered: inserted.IsDelivered,

        isSeen: inserted.IsSeen,

        caption: statusData.Caption,

        statusUsername: statusData.Username,

        statusOwnerId: statusData.UserId,

        isStatusReply: true,

        statusId
    };
}