const userModel = require("../models/userModel");

exports.getAllUsers = async (req, res) => {
    try {
        const users = await userModel.getAllUsers(req.user.id);

        res.json(users);

    } catch (error) {
        res.status(500).json({ message: "Error fetching users" });
    }
}