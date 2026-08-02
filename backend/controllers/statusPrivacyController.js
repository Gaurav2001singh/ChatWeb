const privacyModel = require("../models/statusPrivacyModel");

exports.savePrivacy = async (req, res) => {
    try {

        const userId = req.user.id;
        const { privacyType, members } = req.body;

        await privacyModel.savePrivacy(
            userId,
            privacyType,
            members
        );

        res.json({
            message:
                "Privacy saved"
        });

    } catch (error) {

        res.status(500).json({
            error:
                error.message
        });
    }
};

exports.getPrivacy = async (req, res) => {

    try {

        const data = await privacyModel.getPrivacy(req.user.id);

        res.json(data);

    } catch (error) {

        res.status(500).json({
            error:
                error.message
        });
    }
};