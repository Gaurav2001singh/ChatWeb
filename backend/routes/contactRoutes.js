const express = require("express");

const router = express.Router();

const auth = require("../middleware/authMiddleware");

const contactController = require("../controllers/contactController");

router.post("/add", auth, contactController.addContact);

router.get("/", auth, contactController.getContacts);
router.put("/update-name", auth,  contactController.updateContactName);

module.exports = router;