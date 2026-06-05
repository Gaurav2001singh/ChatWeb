const sql = require("mssql");

const config = {
    user: process.env.DB_USER,
    password:process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function connectDB() {
    try {
        await sql.connect(config);
        console.log("Connected to SQL Server Database");
    } catch (error) {
        console.error("DB Connection Error:", error);
    }
}

module.exports = {
    sql,
    connectDB
};