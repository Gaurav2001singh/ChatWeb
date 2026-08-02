const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const controller = require("../controllers/statusPrivacyController");

router.put("/privacy", auth, controller.savePrivacy);
router.get("/privacy", auth, controller.getPrivacy);

module.exports = router;