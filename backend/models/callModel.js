const { sql } = require("../config/db");

exports.createCall = async (callerId, receiverId, type, status) => {
    const result = await sql.query`
        INSERT INTO Calls(
            CallerId,
            ReceiverId,
            CallType,
            CallStatus,
            CreatedAt
        )
        OUTPUT INSERTED.Id
        VALUES(
            ${callerId},
            ${receiverId},
            ${type},
            ${status},
            GETDATE()
        )
    `;
    return result.recordset[0].Id;
};

exports.getCalls = async (userId) => {
    const result = await sql.query`

   SELECT 
            c.Id,
            c.CallerId,
            c.ReceiverId,
            c.CallType,
            c.CallStatus,
            c.CreatedAt,
            u.Username,
            u.ProfilePicture,
            u.LastSeen,
            ct.ContactName
        FROM Calls c
        JOIN Users u ON u.Id = CASE 
            WHEN c.CallerId = ${userId} THEN c.ReceiverId
            ELSE c.CallerId
        END
        LEFT JOIN Contacts ct ON ct.ContactUserId = u.Id AND ct.UserId = ${userId}
        WHERE c.CallerId = ${userId} OR c.ReceiverId = ${userId}
        ORDER BY c.CreatedAt DESC
    `;
    return result.recordset;
};

exports.updateCallStatus = async (callId, status) => {
    await sql.query`
            UPDATE Calls
            SET
            CallStatus = ${status}
            WHERE Id = ${callId}
        `;
};

exports.endCall = async (callId, duration) => {
    const callQuery = await sql.query`
        SELECT CallerId, ReceiverId FROM Calls WHERE Id = ${callId}
    `;
    const callRecord = callQuery.recordset[0];
    
    if (!callRecord) {
        throw new Error("Call record not found");
    }

    await sql.query`
        UPDATE Calls
        SET
            CallStatus = 'ended',
            Duration = ${duration},
            EndedAt = GETDATE()
        WHERE Id = ${callId}
    `;

    const chatQuery = await sql.query`
        SELECT ChatId FROM ChatMembers 
        WHERE UserId = ${callRecord.CallerId} 
        AND ChatId IN (SELECT ChatId FROM ChatMembers WHERE UserId = ${callRecord.ReceiverId})
    `;
    
    const chatId = chatQuery.recordset[0] ? chatQuery.recordset[0].ChatId : null;

    return chatId;
};

exports.rejectCall = async (callId) => {

    await sql.query`
        UPDATE Calls
        SET
            CallStatus = 'rejected',
            EndedAt = GETDATE()
        WHERE Id = ${callId}
    `;
};

exports.missedCall = async (callId) => {

    await sql.query`
        UPDATE Calls
        SET
            CallStatus = 'missed',
            EndedAt = GETDATE()
        WHERE Id = ${callId}
    `;
};