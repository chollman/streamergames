const express = require("express");
const router = express.Router();

router.use("/health", require("./health"));
router.use("/auth", require("./auth"));

module.exports = router;
