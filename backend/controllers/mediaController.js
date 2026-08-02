const mediaModel = require("../models/mediaModel");

exports.getAllUserMedia = async (req, res) => {
    try {
        const userId = req.user.id || req.user.UserId; 

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized access: Profile context verification failed." });
        }

        const mediaRecords = await mediaModel.getMediaByUserId(userId);

        return res.json(mediaRecords);
    } catch (error) {
        console.error("Media Processing Engine controller exception layer caught:", error.message);
        return res.status(500).json({ error: "Internal Server Error during resource mapping assembly." });
    }
};