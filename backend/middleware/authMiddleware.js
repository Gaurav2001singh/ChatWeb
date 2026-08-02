const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY_12345";

module.exports = function (req, res, next) {
    const tokenHeader = req.headers["authorization"];
    if (!tokenHeader) {
        return res.status(401).json({ message: "Access Denied: Missing system initialization token." });
    }

    const token = tokenHeader.startsWith("Bearer ")
        ? tokenHeader.split(" ")[1]
        : tokenHeader;

    try {
        const decoded = jwt.verify(token, SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Authentication validation expired or broken" });
    }
};