const express = require("express");

const router = express.Router();

const statusController = require("../controllers/statusController");

router.post("/", statusController.createStatus);
router.post("/view", statusController.viewStatus);
router.post("/reply", statusController.createStatusReply);
router.get("/views/:id",statusController.getStatusViews);
router.get("/", statusController.getStatuses);
router.delete("/:id", statusController.deleteStatus)

module.exports = router;