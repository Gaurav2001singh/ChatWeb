const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET;

module.exports = function (req, res, next) {
    const tokenHeader = req.headers["authorization"];

    if (!tokenHeader) {
        return res.status(401).json({ message: "No token provided" });
    }

    const token = tokenHeader.startsWith("Bearer ")
        ? tokenHeader.split(" ")[1]
        : tokenHeader;

    try {
        const decoded = jwt.verify(token, SECRET);

        req.user = decoded;

        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid token" });
    }
};