const { error } = require("console");
const statusModel = require("../models/statusModel");
const fs = require("fs");
const path = require("path");

exports.createStatus = async (req, res) => {

    try {

        const userId = req.user.id || req.user.UserId;
        const { mediaUrl, caption, type } = req.body;

        await statusModel.createStatus(
            userId,
            mediaUrl,
            caption,
            type
        );

        res.json({
            success: true
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            error: "Server Error"
        });
    }
};

exports.getStatuses = async (req, res) => {

    try {


        const userId = req.user.id || req.user.UserId;

        const result =
            await statusModel.getStatuses(userId);

        res.json(result.recordset);

    } catch (error) {

        console.log(error);

        res.status(500).json({
            error: "Server Error"
        });
    }
};

exports.deleteStatus = async (req, res) => {

    try {
        const statusId = req.params.id;

        const result = await statusModel.getStatusById(statusId);

        const status = result.recordset[0];

        if (!status) {
            return res.status(404).json({ error: "Status not found" });
        }

        const filePath = path.join(__dirname, "..", status.MediaUrl);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await statusModel.deleteStatus(statusId);
        res.json({ success: true });
    } catch (error) {
        console.log(error);

        res.status(500).json({
            error: "Server Error"
        });
    }
};

exports.viewStatus = async (req, res) => {

    try {

        const {
            statusId,
            viewerId
        } = req.body;

        await statusModel.addStatusView(
            statusId,
            viewerId
        );

        res.json({
            success: true
        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            error: "Server Error"
        });
    }
};

exports.getStatusViews = async (req, res) => {

    try {

        const currentUserId = Number(req.query.userId);
        const statusId = req.params.id;

        const result =
            await statusModel.getStatusViews(
                currentUserId,
                statusId
            );

        res.json(result.recordset);

    } catch (error) {

        console.log(error);

        res.status(500).json({
            error: "Server Error"
        });
    }
};

exports.createStatusReply = async (req, res) => {
    try {

        const {
            statusId,
            senderId,
            message
        } = req.body;

        if (
            !statusId ||
            !senderId ||
            !message
        ) {
            return res.status(400).json({
                error: "Missing fields"
            });
        }

        const result =
            await statusModel.createStatusReply(

                statusId,
                senderId,
                message
            );

        const io = req.app.get("io");

        io.to(String(result.chatId))
            .emit("receive_message", {

                messageId:
                    result.messageId,

                chatId:
                    result.chatId,

                message,

                senderId,

                isStatusReply: result.isStatusReply,

                statusCaption: result.statusCaption,

                statusUsername: result.statusUsername,

                statusOwnerId: result.statusOwnerId,

                time:
                    result.createdAt,

                isDelivered: result.isDelivered,

                isSeen: result.isSeen
            });

        io.emit("chat_list_update");

        res.json(result);

    } catch (error) {

        console.log(error);

        res.status(500).json({
            error: "Server Error"
        });
    }
};

exports.toggleLike = async (req, res) => {
    try {
        const { statusId } = req.body;
        const userId = req.user.id;

        const result = await statusModel.toggleLike(statusId, userId);

        res.json(result);
    } catch (error) {
        console.error("LIKE ERROR:", error);
        res.status(500).json({
            error: error.message
        });
    }
};

exports.getStatusLikes = async (req, res) => {
    try {

        const statusId = req.params.id;
        const userId = req.user.id;

        const likes =
            await statusModel.getStatusLikes(
                statusId,
                userId
            );

        res.json(likes);

    } catch (error) {

        console.log(error);

        res.status(500).json({
            error: error.message
        });
    }
};