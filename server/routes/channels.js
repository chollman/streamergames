const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const protect = require("../middleware/protect");
const httpError = require("../utils/httpError");
const Channel = require("../models/Channel");
const { createSessionForStreamer } = require("../services/sessions");

const router = express.Router();

// Create a session on the caller's own channel. Only the channel's owner
// can do this — the frontend never asks the user to pick a channel; there's
// exactly one per streamer at MVP.
router.post(
  "/:slug/sessions",
  protect,
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    if (channel.ownerUserId.toString() !== req.user._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "not_owner" });
    }
    const session = await createSessionForStreamer({
      channel,
      streamerUser: req.user,
      gameId: req.body && req.body.gameId,
    });
    res.status(201).json({ session });
  })
);

module.exports = router;
