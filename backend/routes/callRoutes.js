const express = require("express");

const router = express.Router();

const auth = require("../middleware/authMiddleware");
const callController = require("../controllers/callController");

router.get("/", auth, callController.getCalls);
router.post("/create", auth, callController.createCall);
router.put("/accept/:id", auth, callController.updateCallStatus);
router.put("/end/:id", auth, callController.endCall);
router.put("/reject/:id",auth,callController.rejectCall);
router.put("/missed/:id", auth, callController.missedCall);

module.exports = router;