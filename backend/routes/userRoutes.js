const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const { getUserById } = require("../models/userModel");
const { getAllUsers } = require("../controllers/userController");

router.get("/:id", auth, async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const userId = req.params.id;
        const user = await getUserById(currentUserId, userId);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "Error fetching user" });
    }
});

router.get("/", auth, getAllUsers)

module.exports = router;