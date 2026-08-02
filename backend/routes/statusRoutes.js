const express = require("express");

const router = express.Router();

const auth = require("../middleware/authMiddleware");
const statusController = require("../controllers/statusController");

router.post("/", auth, statusController.createStatus);
router.post("/view", auth, statusController.viewStatus);
router.post("/reply", auth, statusController.createStatusReply);
router.post("/like", auth, statusController.toggleLike);

router.get("/", auth, statusController.getStatuses);
router.get("/views/:id", auth, statusController.getStatusViews);
router.get("/likes/:id", auth, statusController.getStatusLikes);

router.delete("/:id", auth, statusController.deleteStatus);

module.exports = router;