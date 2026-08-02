const express = require("express");
const router = express.Router();

const chatController = require("../controllers/chatController");
const auth = require("../middleware/authMiddleware");
const upload = require("../upload");


router.post("/create", auth, chatController.createChat);
router.post("/message", auth, chatController.sendMessage);
router.post("/star", auth, chatController.toggleStarMessage);
router.post("/favourite", auth, chatController.toggleFav);
router.post("/pin", auth, chatController.togglePinChat);
router.post("/unread", auth, chatController.toggleUnread);
router.post("/mark-all-read", auth, chatController.markAllRead);
router.post("/mute", auth, chatController.toggleMute);
router.get("/messages/:chatId", auth, chatController.getMessages);
router.get("/", auth, chatController.getChats);
router.get("/starred", auth, chatController.getStarredMessages);

router.post(
    "/upload",
    auth,
    upload.single("media"),

    (req, res) => {

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        res.json({
            success: true,
            mediaUrl: `/uploads/chat_media/${req.file.filename}`
        });
    }
);

module.exports = router;