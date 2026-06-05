const express = require("express");

const router = express.Router();

const upload = require("../upload");



router.post(

    "/status",

    upload.single("status"),

    (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({

                    error:
                        "No file uploaded"
                });
            }

            res.json({

                success: true,

                filePath:
                    `/uploads/${req.file.filename}`
            });

        } catch (error) {

            console.log(error);

            res.status(500).json({

                error:
                    "Upload failed"
            });
        }
    }
);



module.exports = router;