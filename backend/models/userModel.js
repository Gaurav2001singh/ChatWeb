const { sql } = require("../config/db");

exports.createUser = async (username, email, number, password, profilePicture) => {
    try {
        const result = await sql.query`
            INSERT INTO Users (Username, Email, PhoneNumber, Password, ProfilePicture)
            VALUES (${username}, ${email}, ${number}, ${password}, ${profilePicture})
        `;

        return { username, email };

    } catch (error) {
        console.error("Error: ", error);
    }
};

exports.getUserByPhone = async (number) => {
    try {
        const result = await sql.query`
            SELECT * FROM Users WHERE PhoneNumber = ${number}
        `;

        return result.recordset[0];

    } catch (error) {
        console.error("Error: ", error);
    }
};

exports.updateProfilePicture = async (userId, profilePicture) => {
    const result = await sql.query`
        UPDATE Users
        SET ProfilePicture = ${profilePicture}
        WHERE Id = ${userId}
    `;
};

exports.updateProfile = async (userId, username, about) => {
    try {
        await sql.query`
            UPDATE Users
            SET Username = COALESCE(${username}, Username),
            About = COALESCE(${about}, About)
            WHERE Id = ${userId}
        `;

        const result = await sql.query`
            SELECT Id, Username, About, ProfilePicture
            FROM Users
            WHERE Id = ${userId}
        `;

        return result.recordset[0];

    } catch (error) {
        console.error("Update profile error:", error);
    }
}

exports.removeProfilePicture = async (userId) => {
    try {

        await sql.query`
            UPDATE Users
            SET ProfilePicture = null
            WHERE Id = ${userId}
        `;

    } catch (error) {
        console.error("Remove profile picture error:", error);
    }
}

exports.getUserById = async (currentUserId, userId) => {
    try {
        const result = await sql.query`
                        SELECT

                u.Id,

                ISNULL(
                    c.ContactName,
                    u.PhoneNumber
                ) AS ContactName,

                u.Username,
                u.PhoneNumber,
                u.ProfilePicture,
                u.About

            FROM Users u

            LEFT JOIN Contacts c
            ON c.ContactUserId = u.Id
            AND c.UserId = ${currentUserId}

            WHERE u.Id = ${userId}
        `;

        return result.recordset[0];

    } catch (error) {
            console.log("MODEL ERROR:", error);
throw error;
        console.error("Error fetching user:", error);
    }
}

exports.getAllUsers = async (currentUserId) => {
    try {
        const result = await sql.query`
            SELECT 
                Id,
                Username,
                PhoneNumber,
                ProfilePicture,
                About
            FROM Users
            WHERE Id != ${currentUserId}
            ORDER BY Username ASC
        `;

        return result.recordset;

    } catch (error) {
        console.error("Error fetching users:", error);
        return [];
    }
};