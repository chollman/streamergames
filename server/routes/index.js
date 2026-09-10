const express = require("express");
const router = express.Router();

router.use("/health", require("./health"));
router.use("/auth", require("./auth"));
router.use("/channels", require("./channels"));
router.use("/channels", require("./queue"));
router.use("/sessions", require("./sessions"));

module.exports = router;
