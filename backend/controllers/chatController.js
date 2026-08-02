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
        const { chatId, message, messageType, mediaUrl } = req.body;
        const senderId = req.user.id;

        if (!chatId || !message && !mediaUrl) {
            return res.status(400).json({ message: "chatId and message are required"});
        }

        const savedMsg =  await chatModel.sendMessage(chatId, senderId, message, messageType, mediaUrl);

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
};

exports.toggleStarMessage = async (req, res) => {

    try {

        const userId = req.user.id;
        const { messageId } = req.body;

        const result =
            await chatModel.toggleStarMessage(
                userId,
                messageId
            );

        res.json(result);

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Unable to star message."
        });

    }

};

exports.getStarredMessages = async (req, res) => {

    try {

        const messages =
            await chatModel.getStarredMessages(req.user.id);

        res.json(messages);

    } catch (err) {

        console.log(err);

        res.status(500).json({
            error: "Failed to load starred messages"
        });

    }

};

exports.togglePinChat = async (req, res) => {

    try {

        const { chatId } = req.body;

        const userId = req.user.id;

        const result = await chatModel.togglePinChat(chatId, userId);

        if (result.limitReached) {

            return res.status(400).json({
                success: false,
                message: "You can only pin 3 chats."
            });

        }

        res.json({
            success: true,
            pinned: result.pinned
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            success: false,
            message: "Server Error"
        });

    }

};

exports.toggleUnread = async (req,res)=>{

    try{

        const unread = await chatModel.toggleUnread(

            req.body.chatId,

            req.user.id

        );

        res.json({

            success:true,

            unread

        });

    }

    catch(err){

        console.log(err);

        res.status(500).json({

            message:"Something went wrong"

        });

    }

};

exports.toggleMute = async (req, res) => {
    try {
        const userId = req.user.id || req.user.UserId;
        const { chatId, duration } = req.body;

        if (!chatId) {
            return res.status(400).json({ error: "chatId is required" });
        }

        let mutedUntil = null;

        if (duration === "8_hours") {
            mutedUntil = new Date(Date.now() + 8 * 60 * 60 * 1000);
        } else if (duration === "1_week") {
            mutedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        } else if (duration === "always") {
            mutedUntil = new Date("2099-12-31T23:59:59");
        }
        await chatModel.updateMute(chatId, userId, mutedUntil);

        return res.json({
            success: true,
            isMuted: duration !== "unmute",
            mutedUntil
        });
    } catch (error) {
        console.error("toggleMute Controller Error:", error);
        return res.status(500).json({ error: "Failed to update mute status" });
    }
};

exports.markAllRead = async (req, res) => {
    try {
        const userId = req.user.id || req.user.UserId;

        await chatModel.markAllChatsAsRead(userId);

        const io = req.app.get("io");
        const onlineUsers = req.app.get("onlineUsers");

        if (io && onlineUsers && onlineUsers[userId]) {
            io.to(onlineUsers[userId]).emit("chat_list_update");
        }

        return res.json({ success: true, message: "All chats marked as read" });
    } catch (error) {
        console.error("Error in markAllRead controller:", error);
        return res.status(500).json({ error: "Failed to mark all as read" });
    }
};