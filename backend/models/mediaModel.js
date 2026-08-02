const { sql } = require("../config/db");

exports.getMediaByUserId = async (userId) => {
    const result = await sql.query`
        SELECT 
            m.Id,
            m.ChatId,
            m.SenderId,
            m.MessageText,
            m.MessageType,
            m.MediaUrl,
            m.CreatedAt,
            otherUser.ProfilePicture,
            otherUser.About,
            otherUser.PhoneNumber,
            
            COALESCE(cOther.ContactName, otherUser.Username, otherUser.PhoneNumber, 'User') AS ContactName,
            
            CASE 
                WHEN m.SenderId = ${userId} THEN 'You'
                ELSE COALESCE(cSender.ContactName, senderUser.Username, senderUser.PhoneNumber, 'User')
            END AS SenderName
        FROM Messages m
        JOIN ChatMembers me ON me.ChatId = m.ChatId AND me.UserId = ${userId}
        
        LEFT JOIN ChatMembers target ON target.ChatId = m.ChatId AND target.UserId != ${userId}
        LEFT JOIN Users otherUser ON otherUser.Id = COALESCE(target.UserId, ${userId})
        
        JOIN Users senderUser ON senderUser.Id = m.SenderId
        
        LEFT JOIN Contacts cOther ON cOther.UserId = ${userId} AND cOther.ContactUserId = otherUser.Id
        LEFT JOIN Contacts cSender ON cSender.UserId = ${userId} AND cSender.ContactUserId = m.SenderId
        WHERE(
            m.MessageType IN ('image', 'video', 'audio', 'document')
            OR (m.MessageType = 'text' AND (m.MessageText LIKE '%http://%' OR m.MessageText LIKE '%https://%' OR m.MessageText LIKE '%www.%'))
         )AND NOT EXISTS (
              SELECT 1 FROM DeletedMessages dm 
              WHERE dm.MessageId = m.Id AND dm.UserId = ${userId}
          )
        ORDER BY m.CreatedAt DESC
    `;

    return result.recordset;
};