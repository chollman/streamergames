const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({ status: "ok", service: "streamergames-server" });
  })
);

module.exports = router;
