const { sql } = require("../config/db");

exports.savePrivacy = async (userId, privacyType, members) => {

    await sql.query`
        DELETE FROM StatusPrivacy
        WHERE UserId = ${userId}
    `;

    await sql.query`
          INSERT INTO StatusPrivacy (
            UserId,
            PrivacyType
        )
        VALUES (
            ${userId},
            ${privacyType}
        )
    `;

    await sql.query`
        DELETE FROM StatusPrivacyMembers
        WHERE UserId = ${userId}
    `;

    if (members?.length) {
        for (const memberId of members) {
            await sql.query`
                INSERT INTO StatusPrivacyMembers (
                    UserId,
                    ContactUserId
                )
                VALUES (
                    ${userId},
                    ${memberId}
                )
            `;
        }
    }
};

exports.getPrivacy = async (userId) => {

    const privacy = await sql.query`
        SELECT *
        FROM StatusPrivacy
        WHERE UserId = ${userId}
    `;

    const members = await sql.query`
        SELECT ContactUserId
        FROM StatusPrivacyMembers
        WHERE UserId = ${userId}
    `;

    return {

        privacyType:
            privacy.recordset[0]?.PrivacyType ||
            "my_contacts",

        members:
            members.recordset.map(
                x => x.ContactUserId
            )
    };
};