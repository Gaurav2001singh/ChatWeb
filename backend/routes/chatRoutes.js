const express = require("express");
const router = express.Router();

const chatController = require("../controllers/chatController");
const auth = require("../middleware/authMiddleware");


router.post("/create", auth, chatController.createChat);
router.post("/message", auth, chatController.sendMessage);
router.post("/favourite", auth, chatController.toggleFav);
router.get("/messages/:chatId", auth, chatController.getMessages);
router.get("/", auth, chatController.getChats);

module.exports = router;