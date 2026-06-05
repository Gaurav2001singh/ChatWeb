const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + "-" + file.originalname.replace(/\s+/g, "-");
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 1024 * 1024 * 200
    },
    fileFilter: (
        req,
        file,
        cb
    ) => {
        const allowed = [
            "image/png",
            "image/jpeg",
            "image/jpg",

            "video/mp4",
            "video/webm",
            "video/ogg",
            "video/quicktime"
        ];

        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only images/videos allowed"));
        }
    }
});

module.exports = upload;