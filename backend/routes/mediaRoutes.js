const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/mediaController");
const auth = require("../middleware/authMiddleware");

router.get("/all", auth, mediaController.getAllUserMedia);

module.exports = router;