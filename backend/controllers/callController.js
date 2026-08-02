const callModel = require("../models/callModel");

exports.createCall = async (req, res) => {
    try {
        const callerId = req.user.id;
        const { receiverId, callType, callStatus } = req.body;

      const callId = await callModel.createCall(callerId, receiverId, callType, callStatus);

        res.status(201).json({ success: true, callId});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getCalls = async (req, res) => {
    try {
        const userId = req.user.id;
        const calls = await callModel.getCalls(userId);
        
        res.json(calls);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateCallStatus =
    async (req, res) => {

        try {

            await callModel
                .updateCallStatus(

                    req.params.id,

                    req.body.status
                );

            res.json({
                success: true
            });

        } catch (error) {

            res.status(500)
                .json({
                    error:
                        error.message
                });
        }
};

exports.endCall = async (req, res) => {
    try {
        const resolvedChatId = await callModel.endCall(
            req.params.id,
            req.body.duration
        );

        res.json({
            success: true,
            chatId: resolvedChatId
        });

    } catch (error) {
        console.error("Error in endCall controller:", error);
        res.status(500).json({
            error: error.message
        });
    }
};

exports.rejectCall = async (req, res) => {

    try {

        await callModel.rejectCall(
            req.params.id
        );

        res.json({
            success: true
        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });
    }
};

exports.missedCall = async (req, res) => {

    try {

        await callModel.missedCall(
            req.params.id
        );

        res.json({
            success: true
        });

    } catch (error) {

        res.status(500).json({
            error: error.message
        });
    }
};