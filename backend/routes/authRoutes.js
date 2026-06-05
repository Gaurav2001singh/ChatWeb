const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const upload = require("../upload");
const authController = require("../controllers/authController");


router.post("/register", upload.single("profile"), authController.register);
router.post("/login", authController.login);

router.get("/me", auth, authController.getMe);

router.put("/update-profile-picture", auth, upload.single("profile"), authController.updateProfilePicture);
router.put("/update-profile", auth, authController.updateProfile);
router.put("/remove-profile-picture", auth, authController.removeProfilePicture);

module.exports = router;