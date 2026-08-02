const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let subFolder = "others";

        const urlPath = req.originalUrl || "";

        if (urlPath.includes("/status")) {
            subFolder = "status_updates";
        } else if (urlPath.includes("/chat/upload")) {
            subFolder = "chat_media";
        } else if (urlPath.includes("/register") || urlPath.includes("/update-profile-picture")) {
            subFolder = "profile_pictures";
        }

        const targetDir = path.join("uploads", subFolder);

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        cb(null, targetDir);
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
    // fileFilter: (req, file, cb) => {
    //     const allowed = file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/") || [
    //         "application/pdf",
    //         "application/msword",

    //         "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    //         "text/plain"
    //     ].includes(file.mimetype);

    //     if (allowed) {
    //         cb(null, true);
    //     } else {
    //         cb(new Error("Only images/videos allowed"));
    //     }
    // }
});

module.exports = upload;