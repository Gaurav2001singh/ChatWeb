const express = require("express");
const router = express.Router();
const upload = require("../upload");

router.post("/status", (req, res) => {
    upload.single("status")(req, res, (err) => {
        if (err) {
            console.error("Multer Error:", err.message);
            return res.status(400).json({
                success: false,
                error: err.message
            });
        }

        try {
            if (!req.file) {
                return res.status(400).json({
                    error: "No file uploaded"
                });
            }

            res.json({
                success: true,
                filePath: `/uploads/status_updates/${req.file.filename}`
            });

        } catch (error) {
            console.error("Server Error:", error);
            res.status(500).json({
                error: "Upload failed"
            });
        }
    });
});

module.exports = router;