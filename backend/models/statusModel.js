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

            -- Fetch saved Contact Name -> fallback to Username -> fallback to Phone Number
            CASE
                WHEN u.Id = ${userId} THEN 'My Status'
                ELSE ISNULL(c.ContactName, ISNULL(NULLIF(u.Username, ''), u.PhoneNumber))
            END AS ContactName,

            u.Username,
            u.PhoneNumber,
            u.ProfilePicture,

            (
                SELECT COUNT(*)
                FROM StatusViews sv
                WHERE sv.StatusId = s.Id
            ) AS ViewCount,

            CASE
                WHEN EXISTS(
                    SELECT 1 FROM StatusViews sv
                    WHERE sv.StatusId = s.Id AND sv.ViewerId = ${userId}
                ) THEN 1 ELSE 0
            END AS IsViewed,

            (
                SELECT COUNT(*)
                FROM StatusLikes sl
                WHERE sl.StatusId = s.Id
            ) AS LikeCount,

            CASE
                WHEN EXISTS(
                    SELECT 1 FROM StatusLikes sl
                    WHERE sl.StatusId = s.Id AND sl.UserId = ${userId}
                ) THEN 1 ELSE 0
            END AS IsLiked

        FROM Status s
        JOIN Users u ON s.UserId = u.Id

        -- Left Join to resolve contact names saved by the viewer (${userId})
        LEFT JOIN Contacts c 
        ON c.ContactUserId = u.Id AND c.UserId = ${userId}

        WHERE s.ExpireAt > GETDATE()
        AND (
            -- Rule 1: Always include own statuses
            s.UserId = ${userId}

            OR

            -- Rule 2: "Only Share With..." (Explicit user inclusion list)
            (
                EXISTS (
                    SELECT 1 FROM StatusPrivacy sp
                    WHERE sp.UserId = s.UserId AND sp.PrivacyType = 'only_share_with'
                )
                AND EXISTS (
                    SELECT 1 FROM StatusPrivacyMembers spm
                    WHERE spm.UserId = s.UserId AND spm.ContactUserId = ${userId}
                )
            )

            OR

            -- Rule 3: Mutual Contact Requirement (Poster saved Viewer AND Viewer saved Poster)
            (
                EXISTS (
                    SELECT 1 FROM Contacts
                    WHERE UserId = s.UserId AND ContactUserId = ${userId}
                )
                AND EXISTS (
                    SELECT 1 FROM Contacts
                    WHERE UserId = ${userId} AND ContactUserId = s.UserId
                )
                AND (
                    -- Sub-clause A: Default (No privacy configured defaults to My Contacts)
                    NOT EXISTS (
                        SELECT 1 FROM StatusPrivacy sp WHERE sp.UserId = s.UserId
                    )
                    OR
                    -- Sub-clause B: "My Contacts" explicitly set
                    EXISTS (
                        SELECT 1 FROM StatusPrivacy sp
                        WHERE sp.UserId = s.UserId AND sp.PrivacyType = 'my_contacts'
                    )
                    OR
                    -- Sub-clause C: "My Contacts Except..." (Viewer must NOT be in the excluded list)
                    (
                        EXISTS (
                            SELECT 1 FROM StatusPrivacy sp
                            WHERE sp.UserId = s.UserId AND sp.PrivacyType = 'my_contacts_except'
                        )
                        AND NOT EXISTS (
                            SELECT 1 FROM StatusPrivacyMembers spm
                            WHERE spm.UserId = s.UserId AND spm.ContactUserId = ${userId}
                        )
                    )
                )
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
};

exports.toggleLike = async (statusId, userId) => {
    const existing = await sql.query`
        SELECT * FROM StatusLikes
        WHERE StatusId = ${statusId}
        AND UserId = ${userId}
    `;

    if (existing.recordset.length > 0) {
        await sql.query`
            DELETE FROM StatusLikes
            WHERE StatusId = ${statusId}
            AND UserId = ${userId}
        `;
        return {
            liked: false
        };
    }

    await sql.query`
        INSERT INTO StatusLikes (
            StatusId,
            UserId
        )
        VALUES (
            ${statusId},
            ${userId}
        )
    `;

    return {
        liked: true
    };
};

exports.getStatusLikes = async (statusId, userId) => {
    const result = await sql.query`

        SELECT

            u.Id,
            u.Username,
            u.PhoneNumber,
            u.ProfilePicture,

            ISNULL(
                c.ContactName,
                u.PhoneNumber
            ) AS ContactName

        FROM StatusLikes sl

        JOIN Users u
        ON sl.UserId = u.Id

        LEFT JOIN Contacts c
        ON c.ContactUserId = u.Id
        AND c.UserId = ${userId}

        WHERE sl.StatusId = ${statusId}

        ORDER BY sl.Id DESC
    `;

    return result.recordset;
};