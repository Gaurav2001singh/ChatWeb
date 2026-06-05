const chatModel = require("../models/chatModel");
const onlineUsers = require("../utils/onlineUsers");

exports.createChat = async (req, res) => {
    try {
        const { userIds } = req.body;

        if (!userIds || userIds.length < 2) {
            return res.status(400).json({ message: "At least 2 users required "});
        }

        const chatId = await chatModel.createChat(userIds);

        res.status(201).json({ message: "Chat created successfully", chatId: chatId});

    } catch (error) {
        res.status(500).json({ message: "Error while creating chat", error: error.message});
    }
};

exports.getChats = async (req, res) => {
    try {
        const userId = req.user.id;

        const chats = await chatModel.getUserChats(userId);

        const updatedChats = chats.map(chat => ({
            ...chat,

            isOnline: onlineUsers[chat.UserId]
                ? true
                : false
        }))

        res.status(200).json(updatedChats);

    } catch (error) {
        res.status(500).json({ message: "Error while fetching chats", error: error.message});
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const { chatId, message } = req.body;
        const senderId = req.user.id;

        if (!chatId || !message) {
            return res.status(400).json({ message: "chatId and message are required"});
        }

        const savedMsg =  await chatModel.sendMessage(chatId, senderId, message);

        res.status(200).json(savedMsg);

    } catch (error) {
        res.status(500).json({ message: "Error while sending message", error: error.message});
    }
};

exports.getMessages = async (req, res) => {
    try {
        const { chatId } = req.params;

        if (!chatId) {
            return res.status(400).json({ message: "chatId is required"});
        }

        const messages = await chatModel.getMessages(chatId, req.user.id);

        res.status(200).json(messages || []); 

    } catch (error) {
        res.status(500).json({ message: "Error while fetching messages", error: error.message});
    }
};

exports.toggleFav = async (req, res) => {
    try {
        const userId = req.user.id;
        const { chatId } = req.body;

        const isFavourite = await chatModel.togglefav( userId, chatId );

        res.json({
            success: true,
            isFavourite
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            error: "Server Error"
        });
    }
}