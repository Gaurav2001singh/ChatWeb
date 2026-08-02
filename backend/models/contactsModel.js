const { sql } = require("../config/db");

exports.addContact = async (userId, number, contactName) => {

    const userResult = await sql.query`
        SELECT Id, Username, PhoneNumber, ProfilePicture
        FROM Users
        WHERE PhoneNumber = ${number}
    `;

    const contactUser = userResult.recordset[0];

    if (!contactUser) {
        return {
            success: false,
            message: "User not found"
        };
    }

    if (contactUser.Id === userId) {
        return {
            success: false,
            message: "You cannot add yourself"
        }
    }

    const existingContact = await sql.query`
        SELECT *
        FROM Contacts
        WHERE UserId = ${userId}
        AND ContactUserId = ${contactUser.Id}
    `;

    if (existingContact.recordset.length > 0) {
        return {
            success: false,
            message: "Contact already exists"
        };
    }

    await sql.query`
        INSERT INTO Contacts (UserId, ContactUserId, contactName)
        VALUES (${userId}, ${contactUser.Id}, ${contactName})
    `;

    return {
        success: true,
        contact: {
            Id: contactUser.Id,
            Username: contactUser.Username,
            PhoneNumber: contactUser.PhoneNumber,
            ProfilePicture: contactUser.ProfilePicture,
            ContactName: contactName
        }
    };
};

exports.getContacts = async (userId) => {

    const result = await sql.query`
        SELECT
            u.Id,
            c.ContactName,
            u.Username,
            u.PhoneNumber,
            u.ProfilePicture,
            u.LastSeen,
            u.About

        FROM Contacts c

        JOIN Users u
        ON c.ContactUserId = u.Id

        WHERE c.UserId = ${userId}
    `;

    return result.recordset;
};

exports.updateContactName = async (userId,contactUserId,contactName) => {

    const existing = await sql.query`
        SELECT * FROM Contacts
        WHERE UserId = ${userId}
        AND ContactUserId = ${contactUserId}
    `;

    if (existing.recordset.length > 0) {

        await sql.query`
        UPDATE Contacts
        SET ContactName = ${contactName}
        WHERE UserId = ${userId}
        AND ContactUserId = ${contactUserId}
    `;

    }else{
        
        await sql.query`
            INSERT INTO Contacts (
                UserId,
                ContactUserId,
                ContactName
            )
            VALUES (
                ${userId},
                ${contactUserId},
                ${contactName}
            )
        `;
    }

};